import { describe, expect, it } from 'vitest';
import { packLayerFile, unpackLayerFile, type PlaceFeature } from './data-files.js';

function place(id: string, source: string): PlaceFeature {
  return {
    type: 'Feature',
    properties: {
      id,
      name: id,
      named: true,
      layer: 'nature',
      kind: 'spring',
      county: 'lyon',
      source,
    },
    geometry: { type: 'Point', coordinates: [-119.2, 39.3] },
  };
}

describe('layer files', () => {
  it('stores a shared source once and drops layer and county', () => {
    const file = packLayerFile([
      place('osm:node/1', 'OpenStreetMap'),
      place('osm:node/2', 'OpenStreetMap'),
    ]);
    expect(file.source).toBe('OpenStreetMap');
    expect(file.features[0]!.properties).toEqual({
      id: 'osm:node/1',
      name: 'osm:node/1',
      named: true,
      kind: 'spring',
    });
  });

  it('keeps per-feature sources when they differ, and unpacks to the original features', () => {
    const features = [place('osm:node/1', 'OpenStreetMap'), place('gnis:5', 'USGS GNIS')];
    const file = packLayerFile(features);
    expect(file.source).toBeUndefined();
    expect(file.features[1]!.properties.source).toBe('USGS GNIS');
    expect(unpackLayerFile(file, 'lyon', 'nature').features).toEqual(features);
    const shared = packLayerFile([features[0]!]);
    expect(unpackLayerFile(shared, 'lyon', 'nature').features).toEqual([features[0]]);
  });
});
