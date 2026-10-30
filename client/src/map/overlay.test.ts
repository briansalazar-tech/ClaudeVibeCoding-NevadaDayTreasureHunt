import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import type { BoundaryData } from '../data';
import { GLYPHS_URL } from './basemaps';
import { LAYERS, SOURCES, overlayLayers, withOverlay } from './overlay';

const data = {
  manifest: { buildDate: '', bbox: [0, 0, 1, 1], sources: {}, counties: {} },
  counties: { type: 'FeatureCollection', features: [] },
  labels: { type: 'FeatureCollection', features: [] },
  outsideMask: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
} satisfies BoundaryData;

const basemap: StyleSpecification = {
  version: 8,
  sources: { basemap: { type: 'raster', tiles: ['https://example.com/{z}/{x}/{y}'] } },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
};

describe('withOverlay', () => {
  it('keeps the basemap and draws the county overlay on top', () => {
    const style = withOverlay(basemap, data, {
      theme: 'light',
      labelSize: 'M',
      selectedCountyId: null,
    });
    expect(style.layers[0]?.id).toBe('basemap');
    expect(style.layers.map((l) => l.id).slice(1)).toEqual(Object.values(LAYERS));
    expect(Object.keys(style.sources).sort()).toEqual(
      ['basemap', ...Object.values(SOURCES)].sort(),
    );
    expect(style.glyphs).toBe(GLYPHS_URL);
  });

  it('replaces an existing overlay instead of stacking a second one', () => {
    const state = { theme: 'dark', labelSize: 'L', selectedCountyId: 'lyon' } as const;
    const once = withOverlay(basemap, data, state);
    const twice = withOverlay(once, data, state);
    expect(twice.layers).toHaveLength(once.layers.length);
  });
});

describe('overlayLayers', () => {
  it('shows every county label in the full view and only the selected one when isolated', () => {
    const label = (sel: 'lyon' | null) =>
      overlayLayers({ theme: 'light', labelSize: 'M', selectedCountyId: sel }).find(
        (l) => l.id === LAYERS.label,
      );
    expect(label(null)).toMatchObject({ filter: ['has', 'id'] });
    expect(label('lyon')).toMatchObject({ filter: ['==', ['get', 'id'], 'lyon'] });
  });

  it('scales label text with the label size setting', () => {
    const size = (labelSize: 'S' | 'XL') => {
      const layer = overlayLayers({ theme: 'light', labelSize, selectedCountyId: null }).find(
        (l) => l.id === LAYERS.label,
      );
      return layer?.type === 'symbol' ? (layer.layout?.['text-size'] as unknown[]) : [];
    };
    // ['interpolate', ['linear'], ['zoom'], z0, size0, ...]
    expect(Number(size('XL')[4])).toBeGreaterThan(Number(size('S')[4]));
  });
});
