import type { PlaceFeature } from '@hunt/shared';
import { describe, expect, it } from 'vitest';
import { highlightedStreetIds } from './highlight';

function street(id: string, county: string, name: string, ref?: string): PlaceFeature {
  return {
    type: 'Feature',
    properties: {
      id,
      name,
      named: true,
      layer: 'streets',
      kind: 'highway',
      county,
      source: 'OpenStreetMap',
      ...(ref ? { ref } : {}),
    },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

const streets = [
  street('a', 'storey', 'Geiger Grade Road', 'SR 341'),
  street('b', 'storey', 'C Street', 'US 395 BUS, SR 341, SR 431'),
  street('c', 'washoe', 'Geiger Grade Road', 'SR 341'),
  street('d', 'storey', 'Six Mile Canyon Road'),
  street('e', 'storey', 'Main Street', 'SR 3410'),
];

describe('highlightedStreetIds', () => {
  it('picks every piece carrying a route in the given counties', () => {
    expect(highlightedStreetIds(streets, { counties: ['storey'], routes: ['SR 341'] })).toEqual([
      'a',
      'b',
    ]);
    expect(
      highlightedStreetIds(streets, { counties: ['storey', 'washoe'], routes: ['SR 341'] }),
    ).toEqual(['a', 'b', 'c']);
  });

  it('picks a street by name, and nothing without a highlight', () => {
    expect(
      highlightedStreetIds(streets, { counties: ['washoe'], name: 'Geiger Grade Road' }),
    ).toEqual(['c']);
    expect(highlightedStreetIds(streets, null)).toEqual([]);
  });
});
