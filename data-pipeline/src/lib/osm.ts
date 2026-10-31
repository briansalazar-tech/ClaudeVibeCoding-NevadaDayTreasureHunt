import type { Feature, Geometry, LineString, Polygon, Position } from 'geojson';

/** The parts of an Overpass `out tags geom` JSON response that we read. */
export interface OverpassResponse {
  elements: OsmElement[];
}

interface LatLon {
  lat: number;
  lon: number;
}

export type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
  | { type: 'way'; id: number; geometry?: (LatLon | null)[]; tags?: Record<string, string> }
  | {
      type: 'relation';
      id: number;
      members?: RelationMember[];
      tags?: Record<string, string>;
    };

interface RelationMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  lat?: number;
  lon?: number;
  geometry?: (LatLon | null)[];
}

export type OsmTags = Record<string, string>;

/** A GeoJSON feature converted from OSM, keyed by a stable id such as `osm:way/123`. */
export type OsmFeature = Feature<Geometry, OsmTags> & { id: string };

// Closed ways with one of these tags are areas; other closed ways (a roundabout, a fence) are lines.
const AREA_KEYS = [
  'leisure',
  'landuse',
  'natural',
  'boundary',
  'place',
  'amenity',
  'building',
  'historic',
  'tourism',
  'water',
  'man_made',
];
const LINE_VALUES: Record<string, ReadonlySet<string>> = {
  natural: new Set(['ridge', 'cliff', 'valley', 'gorge', 'arete', 'coastline', 'tree_row']),
  man_made: new Set(['pipeline', 'embankment', 'dyke']),
  historic: new Set(['citywalls']),
};

function isArea(tags: OsmTags): boolean {
  if (tags.area === 'yes') return true;
  if (tags.area === 'no' || tags.highway || tags.waterway || tags.railway) return false;
  return AREA_KEYS.some((k) => tags[k] !== undefined && !LINE_VALUES[k]?.has(tags[k]));
}

function toPositions(geometry: (LatLon | null)[] | undefined): Position[] {
  return (geometry ?? []).filter((p): p is LatLon => p !== null).map((p) => [p.lon, p.lat]);
}

function samePoint(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Joins way segments end to end into rings (or lines). Member ways of a multipolygon
 * can run in either direction, so segments are reversed where needed.
 */
export function joinSegments(segments: Position[][]): Position[][] {
  const pending = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const joined: Position[][] = [];
  while (pending.length) {
    let current = pending.shift()!;
    let extended = true;
    while (extended && !samePoint(current[0]!, current[current.length - 1]!)) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const seg = pending[i]!;
        const head = current[0]!;
        const tail = current[current.length - 1]!;
        let next: Position[] | null = null;
        if (samePoint(tail, seg[0]!)) next = [...current, ...seg.slice(1)];
        else if (samePoint(tail, seg[seg.length - 1]!))
          next = [...current, ...seg.slice(0, -1).reverse()];
        else if (samePoint(head, seg[seg.length - 1]!)) next = [...seg, ...current.slice(1)];
        else if (samePoint(head, seg[0]!)) next = [...seg.slice(1).reverse(), ...current];
        if (next) {
          current = next;
          pending.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    joined.push(current);
  }
  return joined;
}

function isClosed(ring: Position[]): boolean {
  return ring.length >= 4 && samePoint(ring[0]!, ring[ring.length - 1]!);
}

/** Ray-casting point-in-ring test, used to put inner rings inside the right outer ring. */
function inRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (
      yi > point[1]! !== yj > point[1]! &&
      point[0]! < ((xj - xi) * (point[1]! - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

function multipolygonGeometry(members: RelationMember[]): Geometry | null {
  const ways = members.filter((m) => m.type === 'way');
  const outers = joinSegments(
    ways.filter((m) => m.role !== 'inner').map((m) => toPositions(m.geometry)),
  ).filter(isClosed);
  const inners = joinSegments(
    ways.filter((m) => m.role === 'inner').map((m) => toPositions(m.geometry)),
  ).filter(isClosed);
  if (!outers.length) return null;
  const polygons: Position[][][] = outers.map((o) => [o]);
  for (const inner of inners) {
    const owner = polygons.find((p) => inRing(inner[0]!, p[0]!));
    owner?.push(inner);
  }
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0]! }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function relationGeometry(rel: Extract<OsmElement, { type: 'relation' }>): Geometry | null {
  const members = rel.members ?? [];
  const kind = rel.tags?.type;
  if (kind === 'multipolygon' || kind === 'boundary') return multipolygonGeometry(members);
  // Routes and waterways: their ways as one multi-line, joined where they meet.
  const lines = joinSegments(
    members.filter((m) => m.type === 'way').map((m) => toPositions(m.geometry)),
  ).filter((l) => l.length >= 2);
  if (lines.length) return { type: 'MultiLineString', coordinates: lines };
  const nodes = members.filter((m) => m.type === 'node' && m.lat !== undefined);
  const first = nodes[0];
  return first ? { type: 'Point', coordinates: [first.lon!, first.lat!] } : null;
}

/** Converts an Overpass `out tags geom` response to GeoJSON features with stable ids. */
export function overpassToFeatures(response: OverpassResponse): OsmFeature[] {
  const features: OsmFeature[] = [];
  const seen = new Set<string>();
  for (const el of response.elements) {
    const id = `osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags ?? {};
    let geometry: Geometry | null;
    if (el.type === 'node') {
      geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
    } else if (el.type === 'way') {
      const coords = toPositions(el.geometry);
      if (coords.length < 2) continue;
      geometry =
        isClosed(coords) && isArea(tags)
          ? ({ type: 'Polygon', coordinates: [coords] } satisfies Polygon)
          : ({ type: 'LineString', coordinates: coords } satisfies LineString);
    } else {
      geometry = relationGeometry(el);
    }
    if (geometry) features.push({ type: 'Feature', id, properties: tags, geometry });
  }
  return features;
}

/** The OSM `wikipedia` tag (`en:Title`) as a URL. */
export function wikipediaUrl(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const m = /^([a-z-]+):(.+)$/.exec(tag);
  const [lang, title] = m ? [m[1]!, m[2]!] : ['en', tag];
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
