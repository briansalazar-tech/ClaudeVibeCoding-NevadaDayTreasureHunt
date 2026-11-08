import {
  ROUTE_KIND,
  nameKey,
  type CountyId,
  type DataLayerId,
  type Page,
  type PlaceRef,
} from '@hunt/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { IndexedEntry, PlaceIndex } from '../search/searchIndex';
import { useHuntStore } from '../state/store';

/** Map places by name, for the notebook: link pins, `[[` suggestions, capture, "This one". */
export type PlaceNames = ReadonlyMap<string, IndexedEntry[]>;

/** Which match to prefer when several places share a name: a town over a street, say. */
const LAYER_ORDER: DataLayerId[] = [
  'past-finds',
  'towns',
  'ghost-towns',
  'parks',
  'state-markers',
  'markers',
  'register',
  'historic-trails',
  'nature',
  'trails',
  'notable',
  'streets',
  'land',
];

const cache = new WeakMap<PlaceIndex, PlaceNames>();

export function placeNames(index: PlaceIndex | null): PlaceNames {
  if (!index) return new Map();
  const hit = cache.get(index);
  if (hit) return hit;
  const out = new Map<string, IndexedEntry[]>();
  for (const e of index.entries) {
    if (e.kind === ROUTE_KIND) continue;
    const key = nameKey(e.name);
    // Two-letter names ("NV", "US") match too much text to be worth it.
    if (key.length < 3) continue;
    const list = out.get(key);
    if (list) list.push(e);
    else out.set(key, [e]);
  }
  const rank = (e: IndexedEntry) => LAYER_ORDER.indexOf(e.layer);
  for (const list of out.values()) list.sort((a, b) => rank(a) - rank(b));
  cache.set(index, out);
  return out;
}

export function entryPlace(e: IndexedEntry): PlaceRef {
  return { id: e.id, layer: e.layer, name: e.name, lng: e.lng, lat: e.lat };
}

export function pageByKey(pages: readonly Page[]): Map<string, Page> {
  return new Map(pages.map((p) => [nameKey(p.title), p]));
}

/**
 * The map places a link name points to: the page's tied place when it has one, otherwise
 * every place with that name.
 */
export function linkPlaces(
  title: string,
  pages: ReadonlyMap<string, Page>,
  names: PlaceNames,
): PlaceRef[] {
  const key = nameKey(title);
  const page = pages.get(key);
  if (page?.place) return [page.place];
  return (names.get(key) ?? []).map(entryPlace);
}

/** A place's search-index entry, for its extent and county. */
export function findEntry(names: PlaceNames, place: PlaceRef): IndexedEntry | undefined {
  return names.get(nameKey(place.name))?.find((e) => e.id === place.id);
}

/**
 * Flies to a place and opens its popup: shows the map (leaving the full notebook view), and
 * leaves an isolated county the place isn't in.
 */
export function goToPlace(
  place: PlaceRef,
  { entry, county }: { entry?: IndexedEntry; county?: CountyId | null } = {},
): void {
  const { showMap, selectedCountyId, selectCounty, focusFeature, setHighlight, clearSearch } =
    useHuntStore.getState();
  showMap();
  const where = entry?.county ?? county ?? null;
  if (selectedCountyId && where !== selectedCountyId) selectCounty(null);
  clearSearch();
  // A street's popup needs its county's streets loaded, which the highlight asks for.
  if (place.layer === 'streets' && where) {
    setHighlight({ counties: [where], name: place.name, kind: entry?.kind });
  }
  focusFeature({
    id: place.id,
    layer: place.layer,
    lng: place.lng,
    lat: place.lat,
    bbox: entry?.bbox,
  });
}

/**
 * The notebook on the map: a ring at each place a page is about (the tied place, or every
 * place sharing the page's name, up to 10), and a page icon wherever "Put on map" put one.
 */
export function notebookFeatures(pages: readonly Page[], names: PlaceNames): FeatureCollection {
  const features: Feature<Point>[] = [];
  const ringed = new Set<string>();
  for (const page of pages) {
    if (page.spot) {
      features.push({
        type: 'Feature',
        properties: { kind: 'spot', pageId: page.id, name: page.title },
        geometry: { type: 'Point', coordinates: [page.spot.lng, page.spot.lat] },
      });
    }
    if (page.type === 'daily') continue;
    const places = page.place
      ? [page.place]
      : (names.get(nameKey(page.title)) ?? []).slice(0, 10).map(entryPlace);
    for (const place of places) {
      if (ringed.has(place.id)) continue;
      ringed.add(place.id);
      features.push({
        type: 'Feature',
        properties: { kind: 'place', id: place.id, pageId: page.id },
        geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
