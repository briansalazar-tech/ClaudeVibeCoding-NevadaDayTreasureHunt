import { markerInputSchema, markerPatchSchema, type Marker } from '@hunt/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { assertCanEdit } from './auth/permissions.js';
import { me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { markers, type MarkerRow } from './db/schema.js';
import { HttpError, parseId } from './errors.js';
import { indexLinks, removeLinks } from './notebook/sources.js';

function toMarker(row: MarkerRow): Marker {
  return row as Marker;
}

function getRow(db: Db, id: number): MarkerRow {
  const row = db.select().from(markers).where(eq(markers.id, id)).get();
  if (!row) throw new HttpError(404, 'Marker not found');
  return row;
}

/** /api/markers: list, create, edit and delete custom markers. */
export function markersRouter(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(db.select().from(markers).orderBy(markers.id).all().map(toMarker));
  });

  router.post('/', (req, res) => {
    const input = markerInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const row = db
      .insert(markers)
      .values({ ...input, createdBy: me(req).id, createdAt: now, updatedAt: now })
      .returning()
      .get();
    // `[[links]]` in a marker's description count as notebook references.
    indexLinks(db, 'marker', row.id, row.description);
    res.status(201).json(toMarker(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Marker');
    const patch = markerPatchSchema.parse(req.body);
    assertCanEdit(me(req), getRow(db, id).createdBy, 'marker');
    const row = db
      .update(markers)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(markers.id, id))
      .returning()
      .get();
    if (!row) throw new HttpError(404, 'Marker not found');
    indexLinks(db, 'marker', row.id, row.description);
    res.json(toMarker(row));
  });

  // Notes, photos and comments on the marker stay: they keep its name and location.
  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id, 'Marker');
    assertCanEdit(me(req), getRow(db, id).createdBy, 'marker');
    db.delete(markers).where(eq(markers.id, id)).run();
    removeLinks(db, 'marker', id);
    res.status(204).end();
  });

  return router;
}
