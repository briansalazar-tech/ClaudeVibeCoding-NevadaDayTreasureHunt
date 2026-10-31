import { markerInputSchema, markerPatchSchema, type Marker } from '@hunt/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from './db/client.js';
import { markers, type MarkerRow } from './db/schema.js';
import { HttpError } from './errors.js';

function toMarker(row: MarkerRow): Marker {
  return row as Marker;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Marker not found');
  return id;
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
      .values({ ...input, createdAt: now, updatedAt: now })
      .returning()
      .get();
    res.status(201).json(toMarker(row));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const patch = markerPatchSchema.parse(req.body);
    const row = db
      .update(markers)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(markers.id, id))
      .returning()
      .get();
    if (!row) throw new HttpError(404, 'Marker not found');
    res.json(toMarker(row));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = db.delete(markers).where(eq(markers.id, id)).returning().get();
    if (!row) throw new HttpError(404, 'Marker not found');
    res.status(204).end();
  });

  return router;
}
