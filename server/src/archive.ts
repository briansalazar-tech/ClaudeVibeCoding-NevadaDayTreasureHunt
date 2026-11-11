import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canBackUp,
  canRestore,
  displayName,
  layerName,
  pageTypeName,
  statusName,
  type Backup,
  type BackupAuthor,
  type PlaceRef,
} from '@hunt/shared';
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { audit } from './auth/limits.js';
import { me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { copyDatabase } from './db/copy.js';
import { comments, geocodeCache, markers, pages, photos, placeNotes, users } from './db/schema.js';
import { HttpError } from './errors.js';
import { reindexLinks, toNote, toPage } from './notebook/sources.js';

/** The tables a backup holds, in the order they're restored (pages before their photos). */
const TABLES = { markers, pages, placeNotes, photos, comments, geocodeCache } as const;
type TableName = keyof typeof TABLES;

/** Columns that hold a user id, remapped on restore. */
const USER_COLUMNS = ['createdBy', 'updatedBy'] as const;

const backupSchema = z.object({
  app: z.literal('nevada-day-hunt-map'),
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  authors: z
    .array(
      z.object({
        id: z.number(),
        username: z.string(),
        firstName: z.string(),
        lastName: z.string(),
      }),
    )
    .default([]),
  files: z.record(z.string(), z.string()).default({}),
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function at(place: PlaceRef | { lat: number; lng: number }): string {
  return `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
}

/** The whole notebook (pages, notes on map places, custom markers) as one Markdown file. */
export function notebookMarkdown(db: Db): string {
  const names = new Map(
    db
      .select()
      .from(users)
      .all()
      .map((u) => [u.id, displayName(u.firstName, u.lastName)]),
  );
  const who = (id: number | null) =>
    id === null ? 'Former user' : (names.get(id) ?? 'Former user');
  const commentRows = db.select().from(comments).orderBy(comments.id).all();
  const commentsOn = (kind: 'page' | 'note', id: number): string[] => {
    const list = commentRows.filter((c) => c.targetKind === kind && c.targetId === id);
    if (!list.length) return [];
    return [
      '',
      '**Comments**',
      '',
      ...list.map(
        (c) =>
          `- ${who(c.createdBy)}, ${c.createdAt.slice(0, 10)}: ${c.body.trim().replace(/\n+/g, ' ')}`,
      ),
    ];
  };

  const out: string[] = [`# Nevada Day Hunt notebook`, '', `Exported ${new Date().toISOString()}`];
  const pageRows = db.select().from(pages).orderBy(pages.title).all().map(toPage);
  const photoRows = db.select().from(photos).all();
  out.push('', `## Pages (${pageRows.length})`);
  for (const p of pageRows) {
    const meta = [`Type: ${pageTypeName(p.type)}`, `By ${who(p.createdBy)}`];
    if (p.updatedBy !== null && p.updatedBy !== p.createdBy)
      meta.push(`Edited by ${who(p.updatedBy)}`);
    if (p.sourceUrl) meta.push(`Source: ${p.sourceUrl}`);
    if (p.place) meta.push(`Place: ${p.place.name} (${layerName(p.place.layer)}, ${at(p.place)})`);
    if (p.spot) meta.push(`On the map at ${at(p.spot)}`);
    const pics = photoRows.filter((ph) => ph.pageId === p.id).length;
    if (pics) meta.push(`${pics} photo${pics === 1 ? '' : 's'}`);
    out.push('', `### ${p.title}`, '', meta.join(' · '));
    if (p.body.trim()) out.push('', p.body.trim());
    out.push(...commentsOn('page', p.id));
  }
  const notes = db.select().from(placeNotes).orderBy(placeNotes.placeName).all().map(toNote);
  out.push('', `## Notes on map places (${notes.length})`);
  for (const n of notes) {
    out.push(
      '',
      `### ${n.place.name}`,
      '',
      `${layerName(n.place.layer)} · ${at(n.place)} · ${who(n.createdBy)}, ${n.updatedAt.slice(0, 10)}`,
      '',
      n.body.trim(),
      ...commentsOn('note', n.id),
    );
  }
  const markerRows = db.select().from(markers).orderBy(markers.name).all();
  out.push('', `## Custom markers (${markerRows.length})`);
  for (const m of markerRows) {
    out.push(
      '',
      `### ${m.name}`,
      '',
      `${statusName(m.status)} · ${layerName(m.layer)} · ${at(m)} · Added by ${who(m.createdBy)}`,
    );
    if (m.description.trim()) out.push('', m.description.trim());
  }
  return `${out.join('\n')}\n`;
}

/**
 * The backup's user ids mapped to the current users by username. Unknown authors become null
 * ("Former user"). A backup from before accounts goes to the restoring super admin, as setup
 * gives them the content that was there before.
 */
function authorMap(db: Db, authors: BackupAuthor[], version: number, restorer: number) {
  const current = new Map(
    db
      .select({ id: users.id, username: users.username })
      .from(users)
      .all()
      .map((u) => [u.username, u.id]),
  );
  const map = new Map(authors.map((a) => [a.id, current.get(a.username) ?? null]));
  return (value: unknown): number | null => {
    if (version === 1) return restorer;
    return typeof value === 'number' ? (map.get(value) ?? null) : null;
  };
}

/**
 * /api/export/notebook.md, /api/backup and /api/restore. Mounted before the app's JSON parser:
 * a restore can carry photos, far over its 1 MB limit.
 */
export function archiveRouter(db: Db, uploadsDir: string, backupDir?: string): Router {
  const router = Router();

  router.get('/export/notebook.md', (_req, res) => {
    res.type('text/markdown; charset=utf-8');
    res.attachment(`hunt-notebook-${today()}.md`);
    res.send(notebookMarkdown(db));
  });

  // No accounts in it: no password hashes or sessions, only the authors' names.
  router.get('/backup', (req, res) => {
    if (!canBackUp(me(req))) throw new HttpError(403, 'Only admins can download a backup');
    const tables = Object.fromEntries(
      Object.entries(TABLES).map(([name, table]) => [name, db.select().from(table).all()]),
    ) as Backup['tables'];
    const files: Record<string, string> = {};
    for (const p of db.select().from(photos).all()) {
      const file = path.join(uploadsDir, path.basename(p.file));
      if (existsSync(file)) files[String(p.id)] = readFileSync(file).toString('base64');
    }
    const backup: Backup = {
      app: 'nevada-day-hunt-map',
      version: 2,
      exportedAt: new Date().toISOString(),
      tables,
      authors: db
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .all(),
      files,
    };
    res.set('Cache-Control', 'no-store');
    res.attachment(`hunt-backup-${today()}.json`);
    res.json(backup);
  });

  // Checked before the body is read, so nobody else can make the server read 500 MB.
  const superAdminOnly: RequestHandler = (req, _res, next) => {
    if (!canRestore(me(req))) throw new HttpError(403, 'Only the super admin can restore a backup');
    next();
  };

  // Replaces the notebook and markers with the backup's, after saving a copy of the database as
  // it was. Accounts stay as they are.
  router.post('/restore', superAdminOnly, express.json({ limit: '500mb' }), async (req, res) => {
    const user = me(req);
    const backup = backupSchema.parse(req.body);
    const saved = backupDir ? await copyDatabase(db.$client, backupDir, 'before-restore') : null;
    const rows = (name: TableName) => backup.tables[name] ?? [];
    const author = authorMap(db, backup.authors, backup.version, user.id);
    try {
      db.transaction(() => {
        for (const name of [...(Object.keys(TABLES) as TableName[])].reverse())
          db.delete(TABLES[name]).run();
        for (const name of Object.keys(TABLES) as TableName[]) {
          const list = rows(name).map((row) => {
            if (name === 'geocodeCache') return row;
            const out = { ...row };
            for (const col of USER_COLUMNS) if (col in TABLES[name]) out[col] = author(out[col]);
            return out;
          });
          // Inserted in chunks: SQLite caps the number of values in one statement.
          for (let i = 0; i < list.length; i += 200) {
            db.insert(TABLES[name])
              .values(list.slice(i, i + 200) as never[])
              .run();
          }
        }
      });
    } catch (err) {
      throw new HttpError(400, `That backup couldn't be restored: ${(err as Error).message}`);
    }
    reindexLinks(db);
    audit(db, user.id, 'restore', null, `from a backup of ${backup.exportedAt.slice(0, 10)}`);
    mkdirSync(uploadsDir, { recursive: true });
    let restoredFiles = 0;
    for (const p of rows('photos') as { id: number; file: string }[]) {
      const data = backup.files[String(p.id)];
      if (!data) continue;
      writeFileSync(path.join(uploadsDir, path.basename(p.file)), Buffer.from(data, 'base64'));
      restoredFiles++;
    }
    res.json({
      restored: Object.fromEntries(
        (Object.keys(TABLES) as TableName[]).map((n) => [n, rows(n).length]),
      ),
      photos: restoredFiles,
      previous: saved ? path.basename(saved) : null,
    });
  });

  return router;
}
