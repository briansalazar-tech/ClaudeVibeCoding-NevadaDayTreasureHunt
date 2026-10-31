import type { FeatureCollection } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import type { BoundaryData } from '../data';
import { GLYPHS_URL } from './basemaps';
import { defaultLayers } from '../state/store';
import { MARKERS_LAYER, MARKERS_SOURCE } from './dataLayers';
import { LAYERS, SOURCES, overlayLayers, withOverlay, type OverlayState } from './overlay';

const boundary = {
  manifest: { buildDate: '', bbox: [0, 0, 1, 1], sources: {}, counties: {} },
  counties: { type: 'FeatureCollection', features: [] },
  labels: { type: 'FeatureCollection', features: [] },
  outsideMask: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
} satisfies BoundaryData;

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const data = { boundary, layers: {}, markers: empty };
const base = { layers: defaultLayers(), streetLabels: true };

const basemap: StyleSpecification = {
  version: 8,
  sources: { basemap: { type: 'raster', tiles: ['https://example.com/{z}/{x}/{y}'] } },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
};

describe('withOverlay', () => {
  it('keeps the basemap and draws the overlay on top, county labels last', () => {
    const style = withOverlay(basemap, data, {
      ...base,
      theme: 'light',
      labelSize: 'M',
      selectedCountyId: null,
    });
    const ids = style.layers.map((l) => l.id);
    expect(ids[0]).toBe('basemap');
    expect(ids.at(-1)).toBe(LAYERS.label);
    expect(ids.every((id) => id === 'basemap' || id.startsWith('hunt-'))).toBe(true);
    // Data fills and lines go under the county outlines, markers above them.
    expect(ids.indexOf('hunt-land-fill')).toBeLessThan(ids.indexOf(LAYERS.mask));
    expect(ids.indexOf(MARKERS_LAYER)).toBeGreaterThan(ids.indexOf(LAYERS.highlight));
    for (const id of [...Object.values(SOURCES), MARKERS_SOURCE, 'hunt-data-streets']) {
      expect(style.sources).toHaveProperty([id]);
    }
    expect(style.glyphs).toBe(GLYPHS_URL);
  });

  it('replaces an existing overlay instead of stacking a second one', () => {
    const state: OverlayState = {
      ...base,
      theme: 'dark',
      labelSize: 'L',
      selectedCountyId: 'lyon',
    };
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
