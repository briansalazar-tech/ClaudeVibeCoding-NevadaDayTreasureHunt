import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PHOTO_TYPES, placeRefSchema } from '@hunt/shared';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import express, { Router } from 'express';
import { z } from 'zod';
import type { Db } from './db/client.js';
import { pages, photos } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import { placeColumns, toPhoto } from './notebook/sources.js';

const EXTENSIONS: Record<(typeof PHOTO_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Upload query: a page id, or the map place (JSON) the photo is of. */
const uploadQuerySchema = z.object({
  pageId: z.coerce.number().int().positive().optional(),
  place: z
    .string()
    .transform((s, ctx) => {
      try {
        return placeRefSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid place' });
        return z.NEVER;
      }
    })
    .optional(),
  caption: z.string().max(500).default(''),
});

const listQuerySchema = z.object({
  pageId: z.coerce.number().int().positive().optional(),
  placeId: z.string().min(1).optional(),
});

/** Removes the files of the photos matching `where` (their rows go with the page or by hand). */
export function deletePhotoFiles(
  db: Db,
  uploadsDir: string,
  where: { pageId?: number; id?: number },
): void {
  const cond =
    where.id !== undefined ? eq(photos.id, where.id) : eq(photos.pageId, where.pageId ?? -1);
  for (const p of db.select({ file: photos.file }).from(photos).where(cond).all()) {
    rmSync(path.join(uploadsDir, path.basename(p.file)), { force: true });
  }
}

/** /api/photos: photos on pages and map places, stored as files under UPLOADS_DIR. */
export function photosRouter(db: Db, uploadsDir: string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const conds: SQL[] = [];
    if (q.pageId) conds.push(eq(photos.pageId, q.pageId));
    if (q.placeId) conds.push(eq(photos.placeId, q.placeId), isNull(photos.pageId));
    const rows = db
      .select()
      .from(photos)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(photos.id)
      .all();
    res.json(rows.map(toPhoto));
  });

  // The image itself is the request body, sent with its own Content-Type.
  router.post('/', express.raw({ type: [...PHOTO_TYPES], limit: '25mb' }), (req, res) => {
    const q = uploadQuerySchema.parse(req.query);
    const type = req.get('content-type')?.split(';')[0]?.trim() as (typeof PHOTO_TYPES)[number];
    if (!EXTENSIONS[type]) throw new HttpError(415, 'Photos must be JPEG, PNG, WebP or GIF');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No photo sent');
    if (!q.pageId === !q.place) throw new HttpError(400, 'A photo goes on a page or a place');
    if (q.pageId && !db.select().from(pages).where(eq(pages.id, q.pageId)).get())
      throw new HttpError(404, 'Page not found');

    mkdirSync(uploadsDir, { recursive: true });
    const file = `${Date.now()}-${randomBytes(4).toString('hex')}.${EXTENSIONS[type]}`;
    writeFileSync(path.join(uploadsDir, file), req.body);
    const row = db
      .insert(photos)
      .values({
        pageId: q.pageId ?? null,
        ...placeColumns(q.place ?? null),
        file,
        contentType: type,
        caption: q.caption,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    res.status(201).json(toPhoto(row));
  });

  router.get('/:id/file', (req, res) => {
    const id = parseId(req.params.id, 'Photo');
    const row = db.select().from(photos).where(eq(photos.id, id)).get();
    if (!row) throw new HttpError(404, 'Photo not found');
    res.type(row.contentType);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(path.join(uploadsDir, path.basename(row.file)));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Photo');
    const { caption } = z.object({ caption: z.string().max(500) }).parse(req.body);
    const row = db.update(photos).set({ caption }).where(eq(photos.id, id)).returning().get();
    if (!row) throw new HttpError(404, 'Photo not found');
    res.json(toPhoto(row));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Photo');
    deletePhotoFiles(db, uploadsDir, { id });
    const row = db.delete(photos).where(eq(photos.id, id)).returning().get();
    if (!row) throw new HttpError(404, 'Photo not found');
    res.status(204).end();
  });

  return router;
}
