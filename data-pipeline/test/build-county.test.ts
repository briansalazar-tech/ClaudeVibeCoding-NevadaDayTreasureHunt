import { getCounty } from '@hunt/shared';
import { describe, expect, it } from 'vitest';
import { buildCountyLayers, type CountyInputs } from '../src/build-county.js';
import { clipArea } from '../src/lib/clip.js';
import type { LayerDraft } from '../src/lib/place.js';

const area = clipArea({
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
});

function box(x: number, y: number): LayerDraft['geometry'] {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
        [x, y],
      ],
    ],
  };
}

const parcel: LayerDraft = {
  id: 'parcel:storey:307204',
  layer: 'land',
  kind: 'parcel-county',
  name: 'Storey County',
  named: true,
  geometry: box(2, 2),
  owner: 'Storey County',
  detail: 'APN 307204 · 7.03 acres',
  source: 'parcels',
};

function inputs(overrides: Partial<CountyInputs> = {}): CountyInputs {
  return {
    county: getCounty('storey')!,
    area,
    osm: [],
    gnis: [],
    npsTrails: [],
    sma: [],
    parcels: [parcel],
    countyParks: [],
    parcelParks: [
      { county: 'storey', apn: '307204', name: 'Virginia City Highlands Park', note: 'Found 2026' },
    ],
    markers: { drafts: [], unlocated: [] },
    register: { drafts: [], unlocated: [] },
    ghostTowns: { drafts: [], unlocated: [] },
    pastFinds: [],
    ...overrides,
  };
}

describe('parcel parks', () => {
  it('adds a named parcel to the Parks layer and keeps it in the land layer', () => {
    const { layers } = buildCountyLayers(inputs());
    expect(layers.parks).toHaveLength(1);
    expect(layers.parks[0]!.properties).toMatchObject({
      id: 'parcel-park:storey:307204',
      layer: 'parks',
      kind: 'park',
      name: 'Virginia City Highlands Park',
      owner: 'Storey County',
    });
    expect(layers.land.map((f) => f.properties.id)).toEqual(['parcel:storey:307204']);
  });

  it('skips the parcel park when OSM already maps a park there, and warns on a missing APN', () => {
    const osmPark: LayerDraft = { ...parcel, id: 'osm:way/1', layer: 'parks', kind: 'park' };
    expect(buildCountyLayers(inputs({ osm: [osmPark] })).layers.parks).toHaveLength(1);
    const missing = buildCountyLayers(inputs({ parcels: [] }));
    expect(missing.layers.parks).toEqual([]);
    expect(missing.notes.some((n) => n.includes('APN 307204'))).toBe(true);
  });
});
