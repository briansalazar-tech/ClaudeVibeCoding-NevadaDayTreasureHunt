import type { CountyId } from '@hunt/shared';
import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { BoundaryData } from '../data';
import type { LabelSize, Theme } from '../state/store';
import { GLYPHS_URL, LABEL_FONT } from './basemaps';

/** Everything we draw on top of the basemap is prefixed so a basemap swap can keep it. */
const PREFIX = 'hunt-';

export const SOURCES = {
  counties: 'hunt-counties',
  labels: 'hunt-county-labels',
  mask: 'hunt-outside-mask',
} as const;

export const LAYERS = {
  mask: 'hunt-outside-mask',
  fill: 'hunt-county-fill',
  casing: 'hunt-county-casing',
  line: 'hunt-county-line',
  highlight: 'hunt-county-highlight',
  label: 'hunt-county-label',
} as const;

export interface OverlayState {
  theme: Theme;
  labelSize: LabelSize;
  selectedCountyId: CountyId | null;
}

export const LABEL_SCALE: Record<LabelSize, number> = { S: 0.8, M: 1, L: 1.25, XL: 1.5 };

const PALETTE = {
  light: {
    accent: '#0b6bcb',
    dim: '#1d2733',
    line: '#334155',
    casing: '#ffffff',
    text: '#111827',
    halo: '#ffffff',
    extraDim: 0,
  },
  dark: {
    accent: '#4da3ff',
    dim: '#000000',
    line: '#cbd5e1',
    casing: '#0f172a',
    text: '#f1f5f9',
    halo: '#0f172a',
    // The dark basemap is already dark, so the outside needs more dimming to stand apart.
    extraDim: 0.25,
  },
} as const;

const ATTRIBUTION =
  '<a href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html" target="_blank" rel="noopener">US Census Bureau</a>';

export function overlaySources(data: BoundaryData): Record<string, SourceSpecification> {
  return {
    [SOURCES.mask]: { type: 'geojson', data: data.outsideMask },
    [SOURCES.counties]: {
      type: 'geojson',
      data: data.counties,
      promoteId: 'id',
      attribution: ATTRIBUTION,
    },
    [SOURCES.labels]: { type: 'geojson', data: data.labels },
  };
}

export function overlayLayers({
  theme,
  labelSize,
  selectedCountyId: sel,
}: OverlayState): LayerSpecification[] {
  const c = PALETTE[theme];
  const isSelected: ExpressionSpecification = ['==', ['get', 'id'], sel ?? ''];
  const hovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
  const scale = LABEL_SCALE[labelSize];

  return [
    {
      id: LAYERS.mask,
      type: 'fill',
      source: SOURCES.mask,
      paint: { 'fill-color': c.dim, 'fill-opacity': (sel ? 0.55 : 0.4) + c.extraDim },
    },
    {
      // Transparent in the all-counties view (but still hit-testable for hover and click);
      // when a county is isolated, it dims the others.
      id: LAYERS.fill,
      type: 'fill',
      source: SOURCES.counties,
      paint: sel
        ? { 'fill-color': c.dim, 'fill-opacity': ['case', isSelected, 0, 0.45] }
        : { 'fill-color': c.accent, 'fill-opacity': ['case', hovered, 0.18, 0] },
    },
    {
      id: LAYERS.casing,
      type: 'line',
      source: SOURCES.counties,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.casing, 'line-width': 4, 'line-opacity': sel ? 0.4 : 0.7 },
    },
    {
      id: LAYERS.line,
      type: 'line',
      source: SOURCES.counties,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.line, 'line-width': 1.5, 'line-opacity': sel ? 0.5 : 0.9 },
    },
    {
      id: LAYERS.highlight,
      type: 'line',
      source: SOURCES.counties,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': c.accent,
        'line-width': sel ? 3.5 : 2.5,
        'line-opacity': ['case', isSelected, 1, hovered, 1, 0],
      },
    },
    {
      id: LAYERS.label,
      type: 'symbol',
      source: SOURCES.labels,
      filter: sel ? isSelected : ['has', 'id'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': LABEL_FONT,
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          11 * scale,
          8,
          15 * scale,
          11,
          22 * scale,
        ],
        'text-letter-spacing': 0.04,
        'text-transform': 'uppercase',
        'text-max-width': 8,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    },
  ];
}

/** Adds our sources and layers to a basemap style. Used as MapLibre's transformStyle. */
export function withOverlay(
  style: StyleSpecification,
  data: BoundaryData,
  state: OverlayState,
): StyleSpecification {
  return {
    ...style,
    glyphs: style.glyphs ?? GLYPHS_URL,
    sources: { ...style.sources, ...overlaySources(data) },
    layers: [...style.layers.filter((l) => !l.id.startsWith(PREFIX)), ...overlayLayers(state)],
  };
}

type PaintKey = Parameters<MapLibreMap['setPaintProperty']>[1];
type PaintValue = Parameters<MapLibreMap['setPaintProperty']>[2];
type LayoutKey = Parameters<MapLibreMap['setLayoutProperty']>[1];

/** Pushes new overlay state (selection, theme, label size) into an already-loaded style. */
export function applyOverlayState(map: MapLibreMap, state: OverlayState): void {
  for (const layer of overlayLayers(state)) {
    if (!map.getLayer(layer.id)) continue;
    for (const [key, value] of Object.entries(layer.paint ?? {})) {
      map.setPaintProperty(layer.id, key as PaintKey, value as PaintValue);
    }
    if ('layout' in layer) {
      for (const [key, value] of Object.entries(layer.layout ?? {})) {
        map.setLayoutProperty(layer.id, key as LayoutKey, value);
      }
    }
    if ('filter' in layer) map.setFilter(layer.id, layer.filter ?? null);
  }
}
