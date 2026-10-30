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
