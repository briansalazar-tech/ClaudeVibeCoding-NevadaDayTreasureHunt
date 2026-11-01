import type { CountyCollection, CountyFeature, Manifest } from '@hunt/shared';
import { describe, expect, it } from 'vitest';
import { countyInView, neededFiles } from './layerData';

/** Two counties side by side whose bounding boxes overlap: an L-shaped one and a square. */
function county(id: 'lyon' | 'storey', coordinates: number[][]): CountyFeature {
  const xs = coordinates.map((c) => c[0]!);
  const ys = coordinates.map((c) => c[1]!);
  return {
    type: 'Feature',
    properties: {
      id,
      name: id,
      fips: '',
      seat: '',
      landArea: 0,
      waterArea: 0,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    },
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

// L shape: covers x 0..4 along the bottom (y 0..1) and x 0..1 up the left side (y 0..4).
const lyon = county('lyon', [
  [0, 0],
  [4, 0],
  [4, 1],
  [1, 1],
  [1, 4],
  [0, 4],
  [0, 0],
]);
const storey = county('storey', [
  [2, 2],
  [4, 2],
  [4, 4],
  [2, 4],
  [2, 2],
]);

describe('countyInView', () => {
  it('counts a county whose outline is in the view or that covers the view', () => {
    expect(countyInView(storey, [2.5, 2.5, 3, 3])).toBe(true); // view inside the county
    expect(countyInView(storey, [1.5, 1.5, 2.5, 2.5])).toBe(true); // corner of the county in view
  });

  it('skips a county whose bounding box overlaps the view but whose outline does not', () => {
    // Inside the L's bounding box, in the notch where it has no land.
    expect(countyInView(lyon, [2.5, 2.5, 3, 3])).toBe(false);
  });
});

describe('neededFiles', () => {
  const counties: CountyCollection = { type: 'FeatureCollection', features: [lyon, storey] };
  const manifest: Manifest = {
    buildDate: '',
    bbox: [0, 0, 4, 4],
    sources: {},
    counties: {
      lyon: { layers: { streets: { count: 1 }, parks: { count: 1 } } },
      storey: { layers: { streets: { count: 1 }, parks: { count: 1 } } },
    },
  };
  const visible = { streets: true, parks: true };

  it('loads light layers everywhere and heavy layers only for counties in a close view', () => {
    const files = neededFiles(
      { counties, manifest },
      { visible, selectedCountyId: null, view: { zoom: 12, bounds: [2.5, 2.5, 3, 3] } },
    );
    expect(files).toEqual([
      { county: 'lyon', layer: 'parks' },
      { county: 'storey', layer: 'streets' },
      { county: 'storey', layer: 'parks' },
    ]);
  });

  it('skips heavy layers when zoomed out, unless the county is selected', () => {
    const view = { zoom: 6, bounds: [0, 0, 4, 4] as [number, number, number, number] };
    const out = neededFiles({ counties, manifest }, { visible, selectedCountyId: null, view });
    expect(out.map((f) => f.layer)).toEqual(['parks', 'parks']);
    const selected = neededFiles(
      { counties, manifest },
      { visible, selectedCountyId: 'lyon', view },
    );
    expect(selected).toContainEqual({ county: 'lyon', layer: 'streets' });
  });
});
