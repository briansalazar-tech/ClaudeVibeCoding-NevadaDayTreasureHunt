import {
  canEditContent,
  findMentions,
  findNames,
  linkMatches,
  linkNamesSchema,
  nameKey,
  openPageSchema,
  pageInputSchema,
  pagePatchSchema,
  renameLinks,
  tokenizeInline,
  type PageReferences,
  type PlaceRef,
  type Reference,
  type RenameResult,
} from '@hunt/shared';
import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { assertCanEdit } from './auth/permissions.js';
import { me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { pages, type PageRow } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import {
  allSources,
  deleteCommentsOn,
  getSource,
  indexLinks,
  placeColumns,
  removeLinks,
  setSourceText,
  sourcesLinkingTo,
  toPage,
} from './notebook/sources.js';
import { deletePhotoFiles } from './photos.js';

function findByKey(db: Db, key: string): PageRow | undefined {
  return db.select().from(pages).where(eq(pages.titleKey, key)).get();
}

function getRow(db: Db, id: number): PageRow {
  const row = db.select().from(pages).where(eq(pages.id, id)).get();
  if (!row) throw new HttpError(404, 'Page not found');
  return row;
}

function titleTaken(db: Db, title: string, exceptId?: number): void {
  const key = nameKey(title);
  if (!key) throw new HttpError(400, 'A title needs a letter or number in it');
  const other = findByKey(db, key);
  if (other && other.id !== exceptId)
    throw new HttpError(409, `There's already a page called "${other.title}"`);
}

/** The lines of a text that `matches` says mention a name. */
function snippetLines(text: string, hit: (line: string) => boolean): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && hit(l))
    .slice(0, 5);
}

function insertPage(
  db: Db,
  input: { title: string; type: string; body: string; sourceUrl: string },
  place: PlaceRef | null,
  spot: { lng: number; lat: number } | null,
  by: number,
): PageRow {
  const now = new Date().toISOString();
  const row = db
    .insert(pages)
    .values({
      title: input.title,
      titleKey: nameKey(input.title),
      type: input.type,
      body: input.body,
      sourceUrl: input.sourceUrl,
      ...placeColumns(place),
      spotLng: spot?.lng ?? null,
      spotLat: spot?.lat ?? null,
      createdBy: by,
      updatedBy: by,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  indexLinks(db, 'page', row.id, row.body);
  return row;
}

/** /api/pages: notebook pages, their references, renames, and link-finding. */
export function pagesRouter(db: Db, uploadsDir: string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(db.select().from(pages).orderBy(pages.id).all().map(toPage));
  });

  router.post('/', (req, res) => {
    const input = pageInputSchema.parse(req.body);
    titleTaken(db, input.title);
    res.status(201).json(toPage(insertPage(db, input, input.place, input.spot, me(req).id)));
  });

  // A link clicked, "Today", or "+ Notebook page for this place": the page by that name,
  // created if there's none yet.
  router.post('/open', (req, res) => {
    const user = me(req);
    const { title, type, place } = openPageSchema.parse(req.body);
    const tied = place && db.select().from(pages).where(eq(pages.placeId, place.id)).get();
    if (tied) {
      res.json(toPage(tied));
      return;
    }
    const existing = findByKey(db, nameKey(title));
    if (existing && (!place || !existing.placeId || existing.placeId === place.id)) {
      // A page about a place, opened from that place: tie it if it wasn't yet (and it's
      // this user's to change).
      if (place && !existing.placeId && canEditContent(user, existing.createdBy)) {
        db.update(pages).set(placeColumns(place)).where(eq(pages.id, existing.id)).run();
      }
      res.json(toPage(getRow(db, existing.id)));
      return;
    }
    // Another place already has a page by this name: number this one.
    let name = title;
    for (let n = 2; findByKey(db, nameKey(name)); n++) name = `${title} (${n})`;
    const row = insertPage(
      db,
      { title: name, type: type ?? (place ? 'place' : 'note'), body: '', sourceUrl: '' },
      place ?? null,
      null,
      user.id,
    );
    res.status(201).json(toPage(row));
  });

  router.get('/:id', (req, res) => {
    res.json(toPage(getRow(db, parseId(req.params.id, 'Page'))));
  });

  router.patch('/:id', (req, res) => {
    const user = me(req);
    const id = parseId(req.params.id, 'Page');
    const patch = pagePatchSchema.parse(req.body);
    const before = getRow(db, id);
    assertCanEdit(user, before.createdBy, 'page');
    // Text saved from an older version would wipe out someone else's newer edit.
    if (patch.baseVersion !== undefined && patch.baseVersion !== before.version)
      throw new HttpError(409, 'This page changed', { code: 'page-changed', page: toPage(before) });
    const renamed = patch.title !== undefined && patch.title !== before.title;
    if (renamed) titleTaken(db, patch.title!, id);

    const result = db.transaction((): RenameResult => {
      const { place, spot, baseVersion, ...fields } = patch;
      const bodyChanged = fields.body !== undefined && fields.body !== before.body;
      db.update(pages)
        .set({
          ...fields,
          ...(fields.title !== undefined ? { titleKey: nameKey(fields.title) } : {}),
          ...(place !== undefined ? placeColumns(place) : {}),
          ...(spot !== undefined ? { spotLng: spot?.lng ?? null, spotLat: spot?.lat ?? null } : {}),
          ...(bodyChanged ? { version: sql`${pages.version} + 1` } : {}),
          updatedBy: user.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(pages.id, id))
        .run();
      if (fields.body !== undefined) indexLinks(db, 'page', id, fields.body);

      // Renaming points every link to the old title at the new one, in anyone's text: otherwise
      // the rename would break their links.
      let relinked = 0;
      if (renamed) {
        for (const s of sourcesLinkingTo(db, before.titleKey)) {
          const source = getSource(db, s.kind, s.id);
          if (!source) continue;
          const out = renameLinks(source.text, before.title, patch.title!);
          if (!out.count) continue;
          setSourceText(db, s.kind, s.id, out.text, user.id);
          relinked += out.count;
        }
      }
      return { page: toPage(getRow(db, id)), relinked };
    });
    res.json(result);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Page');
    assertCanEdit(me(req), getRow(db, id).createdBy, 'page');
    deletePhotoFiles(db, uploadsDir, { pageId: id });
    db.transaction(() => {
      db.delete(pages).where(eq(pages.id, id)).run();
      removeLinks(db, 'page', id);
      deleteCommentsOn(db, 'page', id);
    });
    res.status(204).end();
  });

  // Linked references (texts that link or tag this page) and unlinked ones (plain mentions).
  router.get('/:id/references', (req, res) => {
    const page = getRow(db, parseId(req.params.id, 'Page'));
    const linkedIds = new Set(sourcesLinkingTo(db, page.titleKey).map((s) => `${s.kind}|${s.id}`));
    const linksHere = (line: string) =>
      tokenizeInline(line).some(
        (t) => (t.type === 'link' || t.type === 'tag') && nameKey(t.title) === page.titleKey,
      );
    const out: PageReferences = { linked: [], unlinked: [] };
    for (const { source, text } of allSources(db)) {
      if (source.kind === 'page' && source.id === page.id) continue;
      if (linkedIds.has(`${source.kind}|${source.id}`)) {
        out.linked.push({ source, snippets: snippetLines(text, linksHere) });
      }
      if (findMentions(text, page.title).length) {
        const ref: Reference = {
          source,
          snippets: snippetLines(text, (l) => findMentions(l, page.title).length > 0),
        };
        out.unlinked.push(ref);
      }
    }
    res.json(out);
  });

  // After a capture: link the names the user picked (map places, other pages) in the text.
  router.post('/:id/link-names', (req, res) => {
    const id = parseId(req.params.id, 'Page');
    const { names } = linkNamesSchema.parse(req.body);
    const page = getRow(db, id);
    const user = me(req);
    assertCanEdit(user, page.createdBy, 'page');
    const wanted = new Map(names.map((n): [string, string] => [nameKey(n), n]).filter(([k]) => k));
    // As capture found them: a one-word name only where it's capitalized.
    const matches = findNames(page.body, wanted, { capitalizedSingleWords: true });
    if (matches.length) setSourceText(db, 'page', id, linkMatches(page.body, matches), user.id);
    res.json({ page: toPage(getRow(db, id)), linked: matches.length });
  });

  return router;
}
