import type { Geometry, Position } from 'geojson';
import type { CountyId } from './counties.js';
import type { BBox, PlaceFeature } from './data-files.js';
import type { DataLayerId, LayerId } from './layers.js';

/** One named place, as the county place list and the search index show it. */
export interface PlaceItem {
  key: string;
  /** Feature id; for a line mapped in pieces, the first piece's. */
  id: string;
  layer: LayerId;
  name: string;
  kind: string;
  lng: number;
  lat: number;
  /** Lines and polygons: the extent to fly to. */
  bbox?: BBox;
  /** Streets: the route numbers on it, as mapped (`SR 341, SR 431`). */
  ref?: string;
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

function eachPosition(g: Geometry, fn: (p: Position) => void): void {
  switch (g.type) {
    case 'Point':
      fn(g.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      g.coordinates.forEach(fn);
      break;
    case 'MultiLineString':
    case 'Polygon':
      g.coordinates.forEach((line) => line.forEach(fn));
      break;
    case 'MultiPolygon':
      g.coordinates.forEach((poly) => poly.forEach((line) => line.forEach(fn)));
      break;
    case 'GeometryCollection':
      g.geometries.forEach((child) => eachPosition(child, fn));
      break;
  }
}

export function geometryBbox(g: Geometry): BBox {
  const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  eachPosition(g, ([x, y]) => {
    box[0] = Math.min(box[0], x!);
    box[1] = Math.min(box[1], y!);
    box[2] = Math.max(box[2], x!);
    box[3] = Math.max(box[3], y!);
  });
  return box;
}

export function extendBbox(a: BBox, b: BBox): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
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
    const box = f.geometry.type === 'Point' ? undefined : geometryBbox(f.geometry);
    const key =
      MERGE_BY_NAME.has(layer) && isLine(f) ? `${layer}|${p.kind}|${p.name.toLowerCase()}` : p.id;
    const existing = items.get(key);
    if (existing) {
      if (box) existing.bbox = existing.bbox ? extendBbox(existing.bbox, box) : box;
      if (p.ref && !existing.ref?.includes(p.ref)) {
        existing.ref = existing.ref ? `${existing.ref}, ${p.ref}` : p.ref;
      }
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
      ...(p.ref ? { ref: p.ref } : {}),
    });
  }
  return [...items.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
