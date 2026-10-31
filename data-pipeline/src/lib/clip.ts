import turfBbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { feature, featureCollection, lineString } from '@turf/helpers';
import turfIntersect from '@turf/intersect';
import lineSplit from '@turf/line-split';
import type { BBox as GeoBBox, Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';

export type Area = Polygon | MultiPolygon;

/** A county polygon prepared for repeated clipping. */
export interface ClipArea {
  geometry: Area;
  bbox: GeoBBox;
}

export function clipArea(geometry: Area): ClipArea {
  return { geometry, bbox: turfBbox(geometry) };
}

function bboxOverlaps(a: GeoBBox, b: GeoBBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function inBox(p: Position, b: GeoBBox): boolean {
  return p[0]! >= b[0] && p[0]! <= b[2] && p[1]! >= b[1] && p[1]! <= b[3];
}

export function pointInArea(p: Position, area: ClipArea): boolean {
  return inBox(p, area.bbox) && booleanPointInPolygon(p, area.geometry);
}

function clipLine(coords: Position[], area: ClipArea): Position[][] {
  if (coords.length < 2) return [];
  const inside = coords.map((p) => pointInArea(p, area));
  if (inside.every(Boolean)) return [coords];
  const box = turfBbox(lineString(coords));
  if (!bboxOverlaps(box, area.bbox)) return [];
  // Crosses the boundary (or might): split at the boundary and keep the pieces inside.
  const pieces = lineSplit(lineString(coords), feature(area.geometry)).features;
  if (!pieces.length) return inside.some(Boolean) ? [coords] : [];
  return pieces
    .map((piece) => piece.geometry.coordinates)
    .filter((c) => {
      const a = c[0]!;
      const b = c[1] ?? a;
      const mid: Position = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2];
      return pointInArea(mid, area);
    });
}

function ringBox(ring: Position[]): GeoBBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring as [number, number][]) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

function clipPolygon(rings: Position[][], area: ClipArea): Position[][][] {
  const outer = rings[0];
  if (!outer || outer.length < 4 || !bboxOverlaps(ringBox(outer), area.bbox)) return [];
  // Every vertex inside the county: keep as is (the county is nearly convex at this scale).
  if (outer.every((p) => pointInArea(p, area))) return [rings];
  const polygon: Polygon = { type: 'Polygon', coordinates: rings };
  try {
    const result = turfIntersect(featureCollection([feature(polygon), feature(area.geometry)]));
    if (!result) return [];
    return result.geometry.type === 'Polygon'
      ? [result.geometry.coordinates]
      : result.geometry.coordinates;
  } catch {
    // Invalid source polygons (self-intersections) can make the intersection throw.
    return outer.some((p) => pointInArea(p, area)) ? [rings] : [];
  }
}

/**
 * Clips a geometry to a county. Returns null when nothing is left. Points are kept or
 * dropped, lines are cut at the boundary, and polygons are intersected.
 */
export function clipGeometry(geometry: Geometry, area: ClipArea): Geometry | null {
  switch (geometry.type) {
    case 'Point':
      return pointInArea(geometry.coordinates, area) ? geometry : null;
    case 'MultiPoint': {
      const pts = geometry.coordinates.filter((p) => pointInArea(p, area));
      return pts.length ? { type: 'MultiPoint', coordinates: pts } : null;
    }
    case 'LineString':
    case 'MultiLineString': {
      const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
      const kept = parts.flatMap((line) => clipLine(line, area));
      if (!kept.length) return null;
      return kept.length === 1
        ? { type: 'LineString', coordinates: kept[0]! }
        : { type: 'MultiLineString', coordinates: kept };
    }
    case 'Polygon':
    case 'MultiPolygon': {
      // Statewide multipolygons (the BLM SMA) have thousands of parts, so clip part by part
      // and skip the parts nowhere near the county.
      const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      const kept = parts.flatMap((rings) => clipPolygon(rings, area));
      if (!kept.length) return null;
      return kept.length === 1
        ? { type: 'Polygon', coordinates: kept[0]! }
        : { type: 'MultiPolygon', coordinates: kept };
    }
    case 'GeometryCollection':
      return null;
  }
}

/** Clips every feature to the county and drops the ones that fall outside. */
export function clipFeatures<F extends Feature>(features: readonly F[], area: ClipArea): F[] {
  const out: F[] = [];
  for (const f of features) {
    if (!f.geometry) continue;
    const geometry = clipGeometry(f.geometry, area);
    if (geometry) out.push({ ...f, geometry });
  }
  return out;
}
