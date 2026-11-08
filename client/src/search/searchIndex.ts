import {
  ROUTE_KIND,
  extendBbox,
  kindLabel,
  parseCoordinates,
  parseRouteQuery,
  routeMatches,
  type BBox,
  type CountyId,
  type DataLayerId,
  type Marker,
  type Page,
  type ParsedCoordinates,
  type PlaceNote,
  type SearchEntry,
  type SearchFileData,
} from '@hunt/shared';
import MiniSearch from 'minisearch';

/**
 * Search over the pipeline's per-county indexes (every named place, streets and route numbers
 * included) and the user's markers. Coordinates and addresses are recognized here too; the
 * address lookup itself goes through the server.
 */

export interface IndexedEntry extends SearchEntry {
  county: CountyId;
}

interface Doc {
  i: number;
  name: string;
  alt: string;
  kind: string;
}

export interface PlaceIndex {
  entries: IndexedEntry[];
  mini: MiniSearch<Doc>;
}

/** Case, accents and apostrophes don't matter: "o'brien" finds "OBrien", "pinon" finds "Piñon". */
export function normalizeTerm(term: string): string | null {
  const t = term.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();
  return t || null;
}

export function buildPlaceIndex(files: readonly SearchFileData[]): PlaceIndex {
  const entries = files.flatMap((f) => f.entries.map((e) => ({ ...e, county: f.county })));
  const mini = new MiniSearch<Doc>({
    idField: 'i',
    fields: ['name', 'alt', 'kind'],
    processTerm: normalizeTerm,
  });
  mini.addAll(
    entries.map((e, i) => ({
      i,
      name: e.name,
      alt: [e.alt, ...(e.kind === ROUTE_KIND ? [] : (e.routes ?? []))].filter(Boolean).join(' '),
      kind: kindLabel(e.kind),
    })),
  );
  return { entries, mini };
}

export type SearchHit =
  | { type: 'place'; key: string; entry: IndexedEntry }
  | {
      type: 'route';
      key: string;
      name: string;
      /** One entry per county the route runs through (within the scope). */
      entries: IndexedEntry[];
      bbox: BBox;
      alt: string;
    }
  | { type: 'marker'; key: string; marker: Marker; county: CountyId | null }
  | { type: 'page'; key: string; page: Page; county: CountyId | null }
  | { type: 'note'; key: string; note: PlaceNote; county: CountyId | null };

export interface CoordinateHit extends ParsedCoordinates {
  county: CountyId | null;
}

export interface SearchOutcome {
  coordinates: CoordinateHit | null;
  hits: SearchHit[];
  /** Matches left out because they're in another county than the one searched. */
  elsewhere: number;
  /** Starts with a house number, so an address lookup is worth offering first. */
  addressLike: boolean;
  /** A route number: no address lookup to offer. */
  route: boolean;
}

export interface SearchOptions {
  /** Limit results to one county, or null for all of them. */
  county: CountyId | null;
  countyAt: (lng: number, lat: number) => CountyId | null;
  limit?: number;
  /** Notebook pages and notes on map places, searched by title and text like markers. */
  pages?: readonly Page[];
  notes?: readonly PlaceNote[];
}

/** Small nudges so towns and parks rank above a street of the same name. */
const LAYER_WEIGHT: Partial<Record<DataLayerId, number>> = {
  'past-finds': 1.5,
  towns: 1.4,
  parks: 1.2,
  'state-markers': 1.2,
  'ghost-towns': 1.2,
  markers: 1.1,
  register: 1.1,
  notable: 0.9,
  streets: 0.8,
};

const EMPTY: SearchOutcome = {
  coordinates: null,
  hits: [],
  elsewhere: 0,
  addressLike: false,
  route: false,
};

function routeHit(name: string, entries: IndexedEntry[]): SearchHit {
  const names = new Set(entries.flatMap((e) => (e.alt ? e.alt.split(', ') : [])));
  return {
    type: 'route',
    key: `route|${name}|${entries.map((e) => e.county).join(',')}`,
    name,
    entries,
    bbox: entries.map((e) => e.bbox!).reduce((a, b) => extendBbox(a, b)),
    alt: [...names].slice(0, 5).join(', '),
  };
}

/** Route entries grouped by route number, so a route through three counties is one result. */
function groupRoutes(entries: IndexedEntry[]): SearchHit[] {
  const byName = new Map<string, IndexedEntry[]>();
  for (const e of entries) byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
  return [...byName].map(([name, list]) => routeHit(name, list));
}

function markerHits(
  markers: readonly Marker[],
  query: string,
  { county, countyAt }: SearchOptions,
): SearchHit[] {
  const q = words(query);
  return markers
    .filter((m) => matchesAll(`${m.name} ${m.description}`, q))
    .map((m) => ({ marker: m, county: countyAt(m.lng, m.lat) }))
    .filter((m) => !county || m.county === county)
    .map(({ marker, county: c }) => ({
      type: 'marker' as const,
      key: `marker|${marker.id}`,
      marker,
      county: c,
    }));
}

function words(query: string): string[] {
  return query.split(/\s+/).map(normalizeTerm).filter(Boolean) as string[];
}

function matchesAll(text: string, query: string[]): boolean {
  const t = normalizeTerm(text) ?? '';
  return query.every((w) => t.includes(w));
}

/**
 * Pages and notes that contain every word. A county-scoped search only finds the ones on the
 * map in that county (a page's place or spot, a note's place).
 */
function notebookHits(query: string, { county, countyAt, pages = [], notes = [] }: SearchOptions) {
  const q = words(query);
  const hits: SearchHit[] = [];
  for (const page of pages) {
    if (!matchesAll(`${page.title} ${page.body}`, q)) continue;
    const at = page.place ?? page.spot;
    const c = at ? countyAt(at.lng, at.lat) : null;
    if (county && c !== county) continue;
    hits.push({ type: 'page', key: `page|${page.id}`, page, county: c });
  }
  for (const note of notes) {
    if (!matchesAll(`${note.place.name} ${note.body}`, q)) continue;
    const c = countyAt(note.place.lng, note.place.lat);
    if (county && c !== county) continue;
    hits.push({ type: 'note', key: `note|${note.id}`, note, county: c });
  }
  // A page whose title matches comes before one that only mentions the words.
  const titled = (h: SearchHit) =>
    h.type === 'page' && matchesAll(h.page.title, q) ? 0 : h.type === 'page' ? 1 : 2;
  return hits.sort((a, b) => titled(a) - titled(b));
}

function routeSearch(index: PlaceIndex, routes: string[], county: CountyId | null) {
  const matches = (list: string[] | undefined) =>
    (list ?? []).some((r) => routes.some((q) => routeMatches(r, q)));
  const inScope = (e: IndexedEntry) => !county || e.county === county;
  const routeEntries = index.entries.filter((e) => e.kind === ROUTE_KIND && matches(e.routes));
  const streets = index.entries.filter((e) => e.kind !== ROUTE_KIND && matches(e.routes));
  // The exact route first, then variants (US 95 ALT under US 95).
  const exact = (e: IndexedEntry) => (routes.includes(e.name) ? 0 : 1);
  const kept = routeEntries.filter(inScope).sort((a, b) => exact(a) - exact(b));
  const hits: SearchHit[] = [
    ...groupRoutes(kept),
    ...streets.filter(inScope).map((entry) => ({
      type: 'place' as const,
      key: `${entry.county}|${entry.id}`,
      entry,
    })),
  ];
  const elsewhere =
    routeEntries.length + streets.length - kept.length - streets.filter(inScope).length;
  return { hits, elsewhere };
}

export function searchPlaces(
  index: PlaceIndex | null,
  markers: readonly Marker[],
  input: string,
  options: SearchOptions,
): SearchOutcome {
  const query = input.trim();
  if (query.length < 2) return EMPTY;
  const { county, countyAt, limit = 60 } = options;

  const coordinates = parseCoordinates(query);
  if (coordinates) {
    return {
      ...EMPTY,
      coordinates: { ...coordinates, county: countyAt(coordinates.lng, coordinates.lat) },
    };
  }
  const addressLike = /^\d+[a-z]?\s+[a-z]/i.test(query);
  const mine = [...markerHits(markers, query, options), ...notebookHits(query, options)];
  if (!index) return { ...EMPTY, hits: mine, addressLike };

  const routes = parseRouteQuery(query);
  if (routes) {
    const found = routeSearch(index, routes, county);
    return {
      coordinates: null,
      hits: [...mine, ...found.hits].slice(0, limit),
      elsewhere: found.elsewhere,
      addressLike,
      route: true,
    };
  }

  let results = index.mini.search(query, { prefix: true, combineWith: 'AND', boost: { name: 3 } });
  if (!results.length) {
    // Allow typos, but still require every word: matching any one word floods the list.
    results = index.mini.search(query, {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
      boost: { name: 3 },
    });
  }
  const q = normalizeTerm(query);
  const ranked = results
    .map((r) => {
      const entry = index.entries[r.id as number]!;
      const name = normalizeTerm(entry.name);
      const bonus = name === q ? 3 : q && name?.startsWith(q) ? 1.5 : 1;
      return { entry, score: r.score * bonus * (LAYER_WEIGHT[entry.layer] ?? 1) };
    })
    .sort((a, b) => b.score - a.score);
  const inScope = ranked.filter((r) => !county || r.entry.county === county);

  const hits: SearchHit[] = [...mine];
  const routeEntries = inScope.filter((r) => r.entry.kind === ROUTE_KIND).map((r) => r.entry);
  const routeHits = groupRoutes(routeEntries);
  let routesAdded = false;
  for (const { entry } of inScope) {
    if (hits.length >= limit) break;
    if (entry.kind === ROUTE_KIND) {
      // Grouped by number: add them all where the best one ranks.
      if (!routesAdded) hits.push(...routeHits);
      routesAdded = true;
      continue;
    }
    hits.push({ type: 'place', key: `${entry.county}|${entry.id}`, entry });
  }
  return {
    coordinates: null,
    hits: hits.slice(0, limit),
    elsewhere: ranked.length - inScope.length,
    addressLike,
    route: false,
  };
}

export interface NearbyPlace {
  entry: IndexedEntry;
  /** Meters; 0 when the point is inside the place's area. */
  meters: number;
}

function metersBetween(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const x = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180) * 111_320;
  const y = (lat2 - lat1) * 110_540;
  return Math.hypot(x, y);
}

/** Layers whose extents are areas a point can be "in" (a park, a lake), not long lines. */
const AREA_LAYERS = new Set<DataLayerId>(['parks', 'nature', 'register', 'notable', 'past-finds']);

/** Named places at or near a point, closest first: what's at a searched coordinate. */
export function nearbyPlaces(
  index: PlaceIndex,
  lng: number,
  lat: number,
  { radius = 300, limit = 4 } = {},
): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  for (const entry of index.entries) {
    if (entry.layer === 'streets') continue;
    const b = entry.bbox;
    const inside =
      b && AREA_LAYERS.has(entry.layer) && lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
    // Large areas (a valley, a range) contain everything; only small ones say much.
    const small = b && b[2] - b[0] < 0.02 && b[3] - b[1] < 0.02;
    if (inside && small) {
      out.push({ entry, meters: 0 });
      continue;
    }
    const meters = metersBetween(lng, lat, entry.lng, entry.lat);
    if (meters <= radius) out.push({ entry, meters });
  }
  return out.sort((a, b) => a.meters - b.meters).slice(0, limit);
}
