import {
  findMentions,
  linkMatches,
  linkMentionsSchema,
  nameKey,
  noteInputSchema,
  notePatchSchema,
  type PageType,
  type PlaceNotebook,
} from '@hunt/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from './db/client.js';
import { pages, photos, placeNotes } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import {
  getSource,
  indexLinks,
  removeLinks,
  setSourceText,
  sourcesLinkingTo,
  toNote,
  toPhoto,
} from './notebook/sources.js';

/** /api/notes: notes on map places. */
export function notesRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { placeId } = z.object({ placeId: z.string().min(1).optional() }).parse(req.query);
    const rows = db
      .select()
      .from(placeNotes)
      .where(placeId ? eq(placeNotes.placeId, placeId) : undefined)
      .orderBy(placeNotes.id)
      .all();
    res.json(rows.map(toNote));
  });

  router.post('/', (req, res) => {
    const { place, body } = noteInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const row = db
      .insert(placeNotes)
      .values({
        placeId: place.id,
        placeLayer: place.layer,
        placeName: place.name,
        placeLng: place.lng,
        placeLat: place.lat,
        body,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    indexLinks(db, 'note', row.id, row.body);
    res.status(201).json(toNote(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Note');
    const { body } = notePatchSchema.parse(req.body);
    const row = db
      .update(placeNotes)
      .set({ body, updatedAt: new Date().toISOString() })
      .where(eq(placeNotes.id, id))
      .returning()
      .get();
    if (!row) throw new HttpError(404, 'Note not found');
    indexLinks(db, 'note', id, body);
    res.json(toNote(row));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Note');
    const row = db.delete(placeNotes).where(eq(placeNotes.id, id)).returning().get();
    if (!row) throw new HttpError(404, 'Note not found');
    removeLinks(db, 'note', id);
    res.status(204).end();
  });

  return router;
}

/** GET /api/places/notebook?id=&name=: "In your notebook" for a map place. */
export function placesRouter(db: Db): Router {
  const router = Router();

  router.get('/notebook', (req, res) => {
    const { id, name } = z
      .object({ id: z.string().min(1), name: z.string().default('') })
      .parse(req.query);
    const key = nameKey(name);
    // The page about this place: tied to it, or named like it and not tied to another place.
    const tied = db.select().from(pages).where(eq(pages.placeId, id)).get();
    const named = key ? db.select().from(pages).where(eq(pages.titleKey, key)).get() : undefined;
    const page = tied ?? (named && !named.placeId ? named : undefined);
    // Links to the name belong to this place unless the page by that name is another place's.
    const linkKey = page ? page.titleKey : named ? null : key;
    const mentions = linkKey
      ? sourcesLinkingTo(db, linkKey)
          .filter((s) => !(s.kind === 'page' && s.id === page?.id))
          .map((s) => getSource(db, s.kind, s.id)?.source)
          .filter((s) => s !== undefined)
      : [];
    const out: PlaceNotebook = {
      page: page ? { id: page.id, title: page.title, type: page.type as PageType } : null,
      mentions,
      notes: db
        .select()
        .from(placeNotes)
        .where(eq(placeNotes.placeId, id))
        .orderBy(placeNotes.id)
        .all()
        .map(toNote),
      photos: db
        .select()
        .from(photos)
        .where(and(eq(photos.placeId, id), isNull(photos.pageId)))
        .orderBy(photos.id)
        .all()
        .map(toPhoto),
    };
    res.json(out);
  });

  return router;
}

/** POST /api/references/link: link the plain mentions of a page title in one text. */
export function referencesRouter(db: Db): Router {
  const router = Router();
  router.post('/link', (req, res) => {
    const { kind, id, title } = linkMentionsSchema.parse(req.body);
    const source = getSource(db, kind, id);
    if (!source) throw new HttpError(404, 'Not found');
    const matches = findMentions(source.text, title);
    if (matches.length) setSourceText(db, kind, id, linkMatches(source.text, matches));
    res.json({ linked: matches.length });
  });
  return router;
}
