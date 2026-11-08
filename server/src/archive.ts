import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { layerName, pageTypeName, statusName, type Backup, type PlaceRef } from '@hunt/shared';
import express, { Router } from 'express';
import { z } from 'zod';
import type { Db } from './db/client.js';
import { copyDatabase } from './db/copy.js';
import { geocodeCache, markers, pages, photos, placeNotes } from './db/schema.js';
import { HttpError } from './errors.js';
import { reindexLinks, toNote, toPage } from './notebook/sources.js';

/** The tables a backup holds, in the order they're restored (pages before their photos). */
const TABLES = { markers, pages, placeNotes, photos, geocodeCache } as const;
type TableName = keyof typeof TABLES;

const backupSchema = z.object({
  app: z.literal('nevada-day-hunt-map'),
  version: z.literal(1),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
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
  const out: string[] = [`# Nevada Day Hunt notebook`, '', `Exported ${new Date().toISOString()}`];
  const pageRows = db.select().from(pages).orderBy(pages.title).all().map(toPage);
  const photoRows = db.select().from(photos).all();
  out.push('', `## Pages (${pageRows.length})`);
  for (const p of pageRows) {
    const meta = [`Type: ${pageTypeName(p.type)}`];
    if (p.sourceUrl) meta.push(`Source: ${p.sourceUrl}`);
    if (p.place) meta.push(`Place: ${p.place.name} (${layerName(p.place.layer)}, ${at(p.place)})`);
    if (p.spot) meta.push(`On the map at ${at(p.spot)}`);
    const pics = photoRows.filter((ph) => ph.pageId === p.id).length;
    if (pics) meta.push(`${pics} photo${pics === 1 ? '' : 's'}`);
    out.push('', `### ${p.title}`, '', meta.join(' · '));
    if (p.body.trim()) out.push('', p.body.trim());
  }
  const notes = db.select().from(placeNotes).orderBy(placeNotes.placeName).all().map(toNote);
  out.push('', `## Notes on map places (${notes.length})`);
  for (const n of notes) {
    out.push(
      '',
      `### ${n.place.name}`,
      '',
      `${layerName(n.place.layer)} · ${at(n.place)} · ${n.updatedAt.slice(0, 10)}`,
      '',
      n.body.trim(),
    );
  }
  const markerRows = db.select().from(markers).orderBy(markers.name).all();
  out.push('', `## Custom markers (${markerRows.length})`);
  for (const m of markerRows) {
    out.push('', `### ${m.name}`, '', `${statusName(m.status)} · ${layerName(m.layer)} · ${at(m)}`);
    if (m.description.trim()) out.push('', m.description.trim());
  }
  return `${out.join('\n')}\n`;
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

  router.get('/backup', (_req, res) => {
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
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
      files,
    };
    res.attachment(`hunt-backup-${today()}.json`);
    res.json(backup);
  });

  // Replaces everything with the backup's contents, after saving a copy of the database as it was.
  router.post('/restore', express.json({ limit: '500mb' }), async (req, res) => {
    const backup = backupSchema.parse(req.body);
    const saved = backupDir ? await copyDatabase(db.$client, backupDir, 'before-restore') : null;
    const rows = (name: TableName) => backup.tables[name] ?? [];
    try {
      db.transaction(() => {
        for (const name of [...(Object.keys(TABLES) as TableName[])].reverse())
          db.delete(TABLES[name]).run();
        for (const name of Object.keys(TABLES) as TableName[]) {
          const list = rows(name);
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
