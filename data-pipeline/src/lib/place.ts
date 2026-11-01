import pointOnFeature from '@turf/point-on-feature';
import simplify from '@turf/simplify';
import { feature } from '@turf/helpers';
import type { Geometry, Position } from 'geojson';
import type { CountyId, PlaceFeature, PlaceProperties } from '@hunt/shared';
import { clipGeometry, type ClipArea } from './clip.js';
import { roundCoords } from './geo.js';

/** A feature on its way into a layer file, before clipping and rounding. */
export type LayerDraft = Omit<PlaceProperties, 'county' | 'lng' | 'lat'> & { geometry: Geometry };

/** A point on the feature for popups and fly-to: the middle of a line, a point inside a polygon. */
export function representativePoint(geometry: Geometry): Position {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'LineString':
      return geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]!;
    case 'MultiLineString': {
      const longest = geometry.coordinates.reduce((a, b) => (b.length > a.length ? b : a));
      return longest[Math.floor(longest.length / 2)]!;
    }
    default:
      return pointOnFeature(feature(geometry)).geometry.coordinates;
  }
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Line and polygon simplification tolerance in degrees (about 2 m): invisible at the zooms the
 * heavy layers show at, and it cuts the vertex count of OSM tracks by about a third.
 */
export const SIMPLIFY_TOLERANCE = 0.00002;

function simplified(geometry: Geometry, tolerance: number): Geometry {
  if (geometry.type === 'Point' || tolerance <= 0) return geometry;
  try {
    return simplify(feature(geometry), { tolerance, highQuality: false }).geometry;
  } catch {
    // Turf rejects degenerate rings (slivers left by clipping); keep those as they are.
    return geometry;
  }
}

/**
 * Clips drafts to the county, simplifies and rounds coordinates, and fills in county and
 * representative point. Drafts that fall outside the county are dropped. Undefined properties
 * are left out of the file.
 */
export function finalizeDrafts(
  drafts: readonly LayerDraft[],
  county: CountyId,
  area: ClipArea,
  { tolerance = SIMPLIFY_TOLERANCE } = {},
): PlaceFeature[] {
  const out: PlaceFeature[] = [];
  for (const { geometry, ...props } of drafts) {
    const clipped = clipGeometry(geometry, area);
    if (!clipped) continue;
    const g = roundCoords(simplified(clipped, tolerance));
    const properties: PlaceProperties = { ...props, county };
    if (g.type !== 'Point') {
      const [lng, lat] = representativePoint(g);
      properties.lng = round5(lng!);
      properties.lat = round5(lat!);
    }
    for (const key of Object.keys(properties) as (keyof PlaceProperties)[]) {
      if (properties[key] === undefined || properties[key] === '') delete properties[key];
    }
    out.push({ type: 'Feature', properties, geometry: g });
  }
  return out;
}
