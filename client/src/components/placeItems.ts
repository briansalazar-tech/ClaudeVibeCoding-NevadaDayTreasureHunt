import turfBbox from '@turf/bbox';
import type { CountyId, DataLayerId, LayerId, PlaceFeature } from '@hunt/shared';

export interface PlaceItem {
  key: string;
  id: string;
  layer: LayerId;
  name: string;
  kind: string;
  lng: number;
  lat: number;
  bbox?: [number, number, number, number];
}

/** Lines are mapped in pieces (each street block, each river reach): list each name once. */
const MERGE_BY_NAME = new Set<DataLayerId>([
  'streets',
  'nature',
  'trails',
  'historic-trails',
  'notable',
]);

function isLine(f: PlaceFeature): boolean {
  return f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString';
}

function extend(
  a: [number, number, number, number],
  b: number[],
): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]!),
    Math.min(a[1], b[1]!),
    Math.max(a[2], b[2]!),
    Math.max(a[3], b[3]!),
  ];
}

/** Named places of one layer in one county, merged by name where the layer maps lines in pieces. */
export function placeItems(
  features: readonly PlaceFeature[],
  layer: DataLayerId,
  county: CountyId,
): PlaceItem[] {
  const items = new Map<string, PlaceItem>();
  for (const f of features) {
    const p = f.properties;
    if (p.county !== county || !p.named) continue;
    const point =
      f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : [p.lng!, p.lat!];
    const box =
      f.geometry.type === 'Point' ? undefined : (turfBbox(f) as [number, number, number, number]);
    const key =
      MERGE_BY_NAME.has(layer) && isLine(f) ? `${layer}|${p.kind}|${p.name.toLowerCase()}` : p.id;
    const existing = items.get(key);
    if (existing) {
      if (box) existing.bbox = existing.bbox ? extend(existing.bbox, box) : box;
      continue;
    }
    items.set(key, {
      key,
      id: p.id,
      layer,
      name: p.name,
      kind: p.kind,
      lng: point[0]!,
      lat: point[1]!,
      bbox: box,
    });
  }
  return [...items.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
