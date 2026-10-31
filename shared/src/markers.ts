import { z } from 'zod';
import { LAYERS, type LayerId } from './layers.js';

/** Custom markers: points the user adds, stored in SQLite and shown with the layer they're assigned to. */

export const MARKER_STATUSES = [
  { id: 'to-check', name: 'To check' },
  { id: 'clue-fits', name: 'Clue fits' },
  { id: 'checked', name: 'Checked' },
  { id: 'dead-end', name: 'Dead end' },
] as const;

export type MarkerStatus = (typeof MARKER_STATUSES)[number]['id'];

const statusIds = MARKER_STATUSES.map((s) => s.id) as [MarkerStatus, ...MarkerStatus[]];
const layerIds = LAYERS.map((l) => l.id) as [LayerId, ...LayerId[]];

export function statusName(id: string): string {
  return MARKER_STATUSES.find((s) => s.id === id)?.name ?? id;
}

/** What the client sends to create a marker. */
export const markerInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the marker a name').max(200),
  description: z.string().max(10_000).default(''),
  status: z.enum(statusIds).default('to-check'),
  layer: z.enum(layerIds).default('custom'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** What the client sends to edit a marker: any subset of the fields. */
export const markerPatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the marker a name').max(200),
    description: z.string().max(10_000),
    status: z.enum(statusIds),
    layer: z.enum(layerIds),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .partial();

export type MarkerInput = z.input<typeof markerInputSchema>;
export type MarkerPatch = z.infer<typeof markerPatchSchema>;

export interface Marker {
  id: number;
  name: string;
  description: string;
  status: MarkerStatus;
  layer: LayerId;
  lat: number;
  lng: number;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Map feature id of a custom marker. Markers are user data, so their id is the database row id. */
export function markerFeatureId(id: number): string {
  return `marker:${id}`;
}
