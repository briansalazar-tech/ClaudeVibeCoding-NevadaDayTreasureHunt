import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PHOTO_TYPES, canEditContent, placeRefSchema, type CurrentUser } from '@hunt/shared';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import express, { Router } from 'express';
import { z } from 'zod';
import { assertCanEdit } from './auth/permissions.js';
import { me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { pages, photos, type PhotoRow } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import { placeColumns, toPhoto } from './notebook/sources.js';

const EXTENSIONS: Record<(typeof PHOTO_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type PhotoType = (typeof PHOTO_TYPES)[number];

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';

/**
 * The image type from the file's first bytes. The Content-Type header is whatever the sender
 * says; the bytes decide what's stored and how it's served.
 */
export function sniffImage(data: Buffer): PhotoType | null {
  const ascii = (from: number, to: number) => data.subarray(from, to).toString('latin1');
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (ascii(0, 8) === PNG_SIGNATURE) return 'image/png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** A photo on a page goes with the page: its author, the photo's uploader, or an admin. */
function canChangePhoto(db: Db, user: CurrentUser, row: PhotoRow): boolean {
  if (canEditContent(user, row.createdBy)) return true;
  if (row.pageId === null) return false;
  const page = db
    .select({ createdBy: pages.createdBy })
    .from(pages)
    .where(eq(pages.id, row.pageId))
    .get();
  return page !== undefined && canEditContent(user, page.createdBy);
}

function getPhoto(db: Db, id: number): PhotoRow {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!row) throw new HttpError(404, 'Photo not found');
  return row;
}

function assertCanChangePhoto(db: Db, user: CurrentUser, row: PhotoRow): void {
  if (!canChangePhoto(db, user, row))
    throw new HttpError(
      403,
      'Only whoever added the photo, the page’s author or an admin can change it',
      {
        code: 'not-author',
      },
    );
}

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
    const user = me(req);
    const q = uploadQuerySchema.parse(req.query);
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      throw new HttpError(415, 'Photos must be JPEG, PNG, WebP or GIF');
    const type = sniffImage(req.body);
    if (!type) throw new HttpError(415, 'That file isn’t a JPEG, PNG, WebP or GIF image');
    if (!q.pageId === !q.place) throw new HttpError(400, 'A photo goes on a page or a place');
    if (q.pageId) {
      const page = db.select().from(pages).where(eq(pages.id, q.pageId)).get();
      if (!page) throw new HttpError(404, 'Page not found');
      // Photos on a page are part of it; anyone can add photos to a map place or marker.
      assertCanEdit(user, page.createdBy, 'page');
    }

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
        createdBy: user.id,
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
    assertCanChangePhoto(db, me(req), getPhoto(db, id));
    const row = db.update(photos).set({ caption }).where(eq(photos.id, id)).returning().get();
    res.json(toPhoto(row));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Photo');
    assertCanChangePhoto(db, me(req), getPhoto(db, id));
    deletePhotoFiles(db, uploadsDir, { id });
    db.delete(photos).where(eq(photos.id, id)).run();
    res.status(204).end();
  });

  return router;
}
