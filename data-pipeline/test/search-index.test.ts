import { DATA_LAYERS, type DataLayerId, type PlaceFeature } from '@hunt/shared';
import { describe, expect, it } from 'vitest';
import { searchEntries } from '../src/search-index.js';

function street(id: string, name: string, ref: string | undefined, x: number): PlaceFeature {
  return {
    type: 'Feature',
    properties: {
      id,
      name,
      named: true,
      layer: 'streets',
      kind: 'highway',
      county: 'storey',
      source: 'OpenStreetMap',
      lng: x + 0.5,
      lat: 39,
      ...(ref ? { ref } : {}),
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [x, 39],
        [x + 1, 39.5],
      ],
    },
  };
}

function layers(partial: Partial<Record<DataLayerId, PlaceFeature[]>>) {
  return Object.fromEntries(DATA_LAYERS.map((l) => [l.id, partial[l.id] ?? []])) as Record<
    DataLayerId,
    PlaceFeature[]
  >;
}

describe('searchEntries', () => {
  const park: PlaceFeature = {
    type: 'Feature',
    properties: {
      id: 'parcel-park:storey:307204',
      name: 'Virginia City Highlands Park',
      named: true,
      layer: 'parks',
      kind: 'park',
      county: 'storey',
      source: 'parcels',
      lng: -119.64073,
      lat: 39.38045,
    },
    geometry: { type: 'Point', coordinates: [-119.64073, 39.38045] },
  };
  const owner: PlaceFeature = {
    ...park,
    properties: { ...park.properties, id: 'parcel:storey:1', layer: 'land', name: 'Storey County' },
  };

  it('lists named places, skips land, and merges street pieces by name', () => {
    const entries = searchEntries(
      layers({
        parks: [park],
        land: [owner],
        streets: [
          street('osm:way/1', 'Geiger Grade Road', 'SR 341', -120),
          street('osm:way/2', 'Geiger Grade Road', 'SR 341', -119),
        ],
      }),
      'storey',
    );
    const names = entries.map((e) => `${e.kind}:${e.name}`);
    expect(names).toEqual([
      'highway:Geiger Grade Road',
      'park:Virginia City Highlands Park',
      'route:SR 341',
    ]);
    const geiger = entries[0]!;
    expect(geiger).toMatchObject({
      id: 'osm:way/1',
      routes: ['SR 341'],
      bbox: [-120, 39, -118, 39.5],
    });
  });

  it('makes one entry per route number, naming the streets along it', () => {
    const entries = searchEntries(
      layers({
        streets: [
          street('osm:way/1', 'Geiger Grade Road', 'SR 341', -120),
          street('osm:way/2', 'C Street', 'SR 341, US 50', -119),
          street('osm:way/3', 'US 50, SR 439', 'US 50', -118),
        ],
      }),
      'storey',
    );
    const routes = entries.filter((e) => e.kind === 'route');
    expect(routes.map((r) => [r.name, r.alt, r.bbox])).toEqual([
      ['SR 341', 'C Street, Geiger Grade Road', [-120, 39, -118, 39.5]],
      ['US 50', 'C Street', [-119, 39, -117, 39.5]],
    ]);
  });
});
