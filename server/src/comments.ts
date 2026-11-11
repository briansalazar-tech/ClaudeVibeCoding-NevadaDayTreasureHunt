import { COMMENT_TARGETS, commentInputSchema, commentPatchSchema } from '@hunt/shared';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { assertCanEdit } from './auth/permissions.js';
import { me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { comments, pages, placeNotes } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import { indexLinks, removeLinks, toComment } from './notebook/sources.js';

function getComment(db: Db, id: number) {
  const row = db.select().from(comments).where(eq(comments.id, id)).get();
  if (!row) throw new HttpError(404, 'Comment not found');
  return row;
}

/**
 * /api/comments: comments on pages and place notes. Anyone can comment on anything; a comment
 * changes only by its author's hand or an admin's.
 */
export function commentsRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const q = z
      .object({ targetKind: z.enum(COMMENT_TARGETS), targetId: z.coerce.number().int().positive() })
      .parse(req.query);
    const rows = db
      .select()
      .from(comments)
      .where(and(eq(comments.targetKind, q.targetKind), eq(comments.targetId, q.targetId)))
      .orderBy(comments.id)
      .all();
    res.json(rows.map(toComment));
  });

  router.post('/', (req, res) => {
    const input = commentInputSchema.parse(req.body);
    const table = input.targetKind === 'page' ? pages : placeNotes;
    if (!db.select({ id: table.id }).from(table).where(eq(table.id, input.targetId)).get())
      throw new HttpError(404, input.targetKind === 'page' ? 'Page not found' : 'Note not found');
    const now = new Date().toISOString();
    const row = db
      .insert(comments)
      .values({ ...input, createdBy: me(req).id, createdAt: now, updatedAt: now })
      .returning()
      .get();
    indexLinks(db, 'comment', row.id, row.body);
    res.status(201).json(toComment(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Comment');
    const { body } = commentPatchSchema.parse(req.body);
    assertCanEdit(me(req), getComment(db, id).createdBy, 'comment');
    const row = db
      .update(comments)
      .set({ body, updatedAt: new Date().toISOString() })
      .where(eq(comments.id, id))
      .returning()
      .get();
    indexLinks(db, 'comment', id, body);
    res.json(toComment(row));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Comment');
    assertCanEdit(me(req), getComment(db, id).createdBy, 'comment');
    db.delete(comments).where(eq(comments.id, id)).run();
    removeLinks(db, 'comment', id);
    res.status(204).end();
  });

  return router;
}
