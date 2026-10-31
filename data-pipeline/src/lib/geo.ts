import type { Geometry, Position } from 'geojson';
import type { BBox } from '@hunt/shared';

/** 5 decimal places is about 1 m, plenty for display and much smaller files. */
export function roundCoords<G extends Geometry>(geometry: G, decimals = 5): G {
  const f = 10 ** decimals;
  const r = (p: Position): Position => p.map((n) => Math.round(n * f) / f);
  switch (geometry.type) {
    case 'Point':
      return { ...geometry, coordinates: r(geometry.coordinates) };
    case 'MultiPoint':
    case 'LineString':
      return { ...geometry, coordinates: geometry.coordinates.map(r) };
    case 'MultiLineString':
    case 'Polygon':
      return { ...geometry, coordinates: geometry.coordinates.map((ring) => ring.map(r)) };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(r))),
      };
    case 'GeometryCollection':
      return { ...geometry, geometries: geometry.geometries.map((g) => roundCoords(g, decimals)) };
  }
}

export function roundBBox(b: readonly number[], decimals = 5): BBox {
  const f = 10 ** decimals;
  const [w = 0, s = 0, e = 0, n = 0] = b;
  return [Math.floor(w * f) / f, Math.floor(s * f) / f, Math.ceil(e * f) / f, Math.ceil(n * f) / f];
}

/** Distance in meters between two lng/lat points (haversine). */
export function meters(a: Position, b: Position): number {
  const R = 6_371_008;
  const toRad = Math.PI / 180;
  const dLat = (b[1]! - a[1]!) * toRad;
  const dLng = (b[0]! - a[0]!) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1]! * toRad) * Math.cos(b[1]! * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Every vertex of a geometry. */
export function vertices(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
    case 'GeometryCollection':
      return geometry.geometries.flatMap(vertices);
  }
}

/** Shortest distance in meters from a point to any vertex of a geometry (good enough for dedupe). */
export function metersToGeometry(p: Position, geometry: Geometry): number {
  let best = Infinity;
  for (const v of vertices(geometry)) best = Math.min(best, meters(p, v));
  return best;
}
