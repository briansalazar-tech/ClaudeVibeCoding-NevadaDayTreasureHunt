import type { CountyId, Marker, SearchEntry, SearchFileData } from '@hunt/shared';
import { describe, expect, it } from 'vitest';
import { buildPlaceIndex, nearbyPlaces, searchPlaces, type SearchOptions } from './searchIndex';

function file(county: CountyId, entries: SearchEntry[]): SearchFileData {
  return { county, entries };
}

const files = [
  file('lyon', [
    {
      id: 'osm:way/1',
      name: 'Fort Churchill State Historic Park',
      layer: 'parks',
      kind: 'state-park',
      lng: -119.27,
      lat: 39.29,
      bbox: [-119.3, 39.27, -119.25, 39.31],
    },
    {
      id: 'shpo:3',
      name: 'Fort Churchill',
      layer: 'state-markers',
      kind: 'state-marker',
      lng: -119.27,
      lat: 39.29,
    },
    {
      id: 'hmdb:1',
      name: 'Fort Churchill Barracks',
      layer: 'markers',
      kind: 'marker',
      lng: -119.27,
      lat: 39.29,
    },
    {
      id: 'osm:way/2',
      name: 'Fort Churchill Road',
      layer: 'streets',
      kind: 'local',
      lng: -119.2,
      lat: 39.3,
      bbox: [-119.25, 39.28, -119.2, 39.3],
    },
    {
      id: 'osm:way/3',
      name: 'Comstock Highway',
      layer: 'streets',
      kind: 'highway',
      lng: -119.63,
      lat: 39.25,
      bbox: [-119.65, 39.22, -119.62, 39.27],
      routes: ['SR 341'],
    },
    {
      id: 'osm:way/3',
      name: 'SR 341',
      layer: 'streets',
      kind: 'route',
      lng: -119.63,
      lat: 39.25,
      bbox: [-119.65, 39.22, -119.62, 39.27],
      routes: ['SR 341'],
      alt: 'Comstock Highway',
    },
    { id: 'osm:node/9', name: 'Fernley', layer: 'towns', kind: 'city', lng: -119.25, lat: 39.61 },
  ]),
  file('storey', [
    {
      id: 'parcel-park:storey:307204',
      name: 'Virginia City Highlands Park',
      layer: 'parks',
      kind: 'park',
      lng: -119.64073,
      lat: 39.38045,
      bbox: [-119.6425, 39.3795, -119.6395, 39.3815],
    },
    {
      id: 'find:2026',
      name: '2026: Virginia City Highlands Park',
      layer: 'past-finds',
      kind: 'past-find',
      lng: -119.64143,
      lat: 39.38095,
    },
    {
      id: 'osm:way/4',
      name: 'Geiger Grade Road',
      layer: 'streets',
      kind: 'highway',
      lng: -119.64,
      lat: 39.35,
      bbox: [-119.68, 39.3, -119.63, 39.37],
      routes: ['SR 341'],
    },
    {
      id: 'osm:way/4',
      name: 'SR 341',
      layer: 'streets',
      kind: 'route',
      lng: -119.64,
      lat: 39.35,
      bbox: [-119.68, 39.27, -119.63, 39.37],
      routes: ['SR 341'],
      alt: 'Geiger Grade Road',
    },
    {
      id: 'osm:way/5',
      name: 'US 50',
      layer: 'streets',
      kind: 'route',
      lng: -119.5,
      lat: 39.25,
      bbox: [-119.6, 39.2, -119.4, 39.3],
      routes: ['US 50'],
    },
  ]),
];

const index = buildPlaceIndex(files);
const all: SearchOptions = { county: null, countyAt: () => 'storey' };
const names = (hits: ReturnType<typeof searchPlaces>['hits']) =>
  hits.map((h) =>
    h.type === 'place'
      ? h.entry.name
      : h.type === 'route'
        ? `route ${h.name}`
        : `marker ${h.marker.name}`,
  );

describe('searchPlaces', () => {
  it('finds a park and its markers by name, the exact name first and the street last', () => {
    const found = names(searchPlaces(index, [], 'Fort Churchill', all).hits);
    expect(found[0]).toBe('Fort Churchill');
    expect(found.slice(1, 3).sort()).toEqual([
      'Fort Churchill Barracks',
      'Fort Churchill State Historic Park',
    ]);
    expect(found.at(-1)).toBe('Fort Churchill Road');
  });

  it('finds a route by any spelling, as one result across counties, then the roads on it', () => {
    for (const q of ['SR 341', 'NV-341', 'state route 341']) {
      const out = searchPlaces(index, [], q, all);
      expect(names(out.hits), q).toEqual(['route SR 341', 'Comstock Highway', 'Geiger Grade Road']);
      const route = out.hits[0]!;
      expect(route.type === 'route' && route.bbox).toEqual([-119.68, 39.22, -119.62, 39.37]);
    }
  });

  it('limits a county-scoped search to that county and counts the rest', () => {
    const out = searchPlaces(index, [], 'SR 341', { ...all, county: 'storey' });
    expect(names(out.hits)).toEqual(['route SR 341', 'Geiger Grade Road']);
    expect(out.elsewhere).toBe(2);
    const text = searchPlaces(index, [], 'Fort Churchill', { ...all, county: 'storey' });
    expect(text.hits).toEqual([]);
    expect(text.elsewhere).toBeGreaterThan(0);
  });

  it('recognizes coordinates and addresses', () => {
    const out = searchPlaces(index, [], `39°22'51.4"N 119°38'29.1"W`, all);
    expect(out.coordinates).toMatchObject({ county: 'storey' });
    expect(out.coordinates!.lat).toBeCloseTo(39.38095, 4);
    expect(searchPlaces(index, [], '595 Silver Lace Blvd', all).addressLike).toBe(true);
    expect(searchPlaces(index, [], 'Fernley', all).addressLike).toBe(false);
  });

  it('finds the user’s markers by name or description', () => {
    const marker: Marker = {
      id: 7,
      name: 'Old mill',
      description: 'Clue 3 mentions a [[Dayton]] mill',
      status: 'to-check',
      layer: 'custom',
      lat: 39.24,
      lng: -119.59,
      createdAt: '',
      updatedAt: '',
    };
    expect(names(searchPlaces(index, [marker], 'dayton mill', all).hits)).toEqual([
      'marker Old mill',
    ]);
  });

  it('does not flood an address with places matching one word', () => {
    const out = searchPlaces(index, [], '595 Silver Lace Blvd, Fernley', all);
    expect(out.hits).toEqual([]);
    expect(out.addressLike).toBe(true);
  });

  it('tolerates a typo', () => {
    expect(names(searchPlaces(index, [], 'Fernly', all).hits)).toContain('Fernley');
  });
});

describe('nearbyPlaces', () => {
  it('lists the park a coordinate falls in, and the find there', () => {
    const near = nearbyPlaces(index, -119.64143, 39.38095).map((n) => n.entry.name);
    expect(near).toEqual(['Virginia City Highlands Park', '2026: Virginia City Highlands Park']);
  });
});
