import {
  DATA_LAYERS,
  MARKER_STATUSES,
  type CountyId,
  type DataLayerId,
  type LayerId,
  type MarkerStatus,
} from '@hunt/shared';
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { LabelSize, Theme } from '../state/store';
import { LABEL_FONT } from './basemaps';
import type { IconShape } from './icons';

/** Map sources and layers for the data layers. Every id starts with `hunt-` (see overlay.ts). */

export const dataSourceId = (layer: DataLayerId) => `hunt-data-${layer}`;
export const MARKERS_SOURCE = 'hunt-custom-markers';
export const MARKERS_LAYER = 'hunt-custom-markers';
export const MARKERS_LABEL_LAYER = 'hunt-custom-markers-label';

export interface DataLayerState {
  theme: Theme;
  labelSize: LabelSize;
  selectedCountyId: CountyId | null;
  layers: Record<LayerId, boolean>;
  streetLabels: boolean;
}

export const LABEL_SCALE: Record<LabelSize, number> = { S: 0.8, M: 1, L: 1.25, XL: 1.5 };

/** Swatch colors for the layer panel. */
export const LAYER_COLORS: Record<LayerId, string> = {
  streets: '#6b4f2a',
  parks: '#16a34a',
  trails: '#a0522d',
  'historic-trails': '#b45309',
  towns: '#1f2937',
  nature: '#2563eb',
  'state-markers': '#9f1239',
  markers: '#ea580c',
  register: '#7c3aed',
  'ghost-towns': '#57534e',
  land: '#ca8a04',
  notable: '#374151',
  'past-finds': '#eab308',
  custom: '#0891b2',
};

export const STATUS_COLORS: Record<MarkerStatus, string> = {
  'to-check': '#2563eb',
  'clue-fits': '#16a34a',
  checked: '#6b7280',
  'dead-end': '#dc2626',
};

/** Land ownership fill colors, by SMA agency or parcel type. */
export const LAND_COLORS: Record<string, string> = {
  BLM: '#fcd34d',
  FS: '#4ade80',
  NVST: '#60a5fa',
  BR: '#818cf8',
  FWS: '#2dd4bf',
  NPS: '#a78bfa',
  BIA: '#f87171',
  DOD: '#a8a29e',
  DOE: '#fb923c',
  WTR: '#7dd3fc',
  PVT: '#e5e7eb',
  'parcel-county': '#ec4899',
  'parcel-city': '#f43f5e',
  'parcel-gid': '#c026d3',
  'parcel-state': '#2563eb',
  'parcel-school': '#eab308',
  'parcel-hoa': '#84cc16',
  'parcel-federal': '#f59e0b',
  'parcel-tribal': '#dc2626',
  'parcel-utility': '#0d9488',
};

interface PointStyle {
  shape: IconShape;
  color: string;
  size: number;
  /** Icons appear from this zoom; labels a little later. */
  minzoom: number;
}

/** How each layer's points look, with per-kind overrides. */
const POINTS: Record<
  DataLayerId,
  { base: PointStyle; kinds?: Record<string, Partial<PointStyle>> }
> = {
  streets: { base: { shape: 'circle', color: '#6b4f2a', size: 8, minzoom: 12 } },
  parks: {
    base: { shape: 'circle', color: '#15803d', size: 12, minzoom: 10 },
    kinds: {
      'state-park': { shape: 'star', size: 16, minzoom: 7 },
      'picnic-site': { shape: 'square', size: 10 },
    },
  },
  trails: {
    base: { shape: 'triangle', color: '#a0522d', size: 13, minzoom: 10 },
    kinds: { viewpoint: { shape: 'star', color: '#0f766e', size: 13 } },
  },
  'historic-trails': { base: { shape: 'circle', color: '#b45309', size: 8, minzoom: 12 } },
  towns: {
    base: { shape: 'circle', color: '#1f2937', size: 9, minzoom: 10 },
    kinds: {
      city: { size: 13, minzoom: 6 },
      town: { size: 12, minzoom: 7 },
      village: { size: 10, minzoom: 8 },
      hamlet: { minzoom: 9 },
      locality: { shape: 'ring', color: '#6b7280', size: 9, minzoom: 10 },
      suburb: { shape: 'ring', minzoom: 11 },
      neighbourhood: { shape: 'ring', color: '#6b7280', size: 8, minzoom: 12 },
    },
  },
  nature: {
    base: { shape: 'diamond', color: '#a16207', size: 9, minzoom: 10 },
    kinds: {
      spring: { shape: 'circle', color: '#0284c7', size: 9 },
      'hot-spring': { shape: 'circle', color: '#dc2626', size: 11, minzoom: 9 },
      peak: { shape: 'triangle', color: '#78350f', size: 11, minzoom: 9 },
      lake: { shape: 'circle', color: '#2563eb', size: 9 },
      reservoir: { shape: 'circle', color: '#2563eb', size: 9 },
      pond: { shape: 'circle', color: '#2563eb', size: 8 },
      range: { shape: 'triangle', color: '#57534e', size: 9, minzoom: 8 },
    },
  },
  'state-markers': { base: { shape: 'square', color: '#9f1239', size: 14, minzoom: 7 } },
  markers: { base: { shape: 'square', color: '#ea580c', size: 11, minzoom: 9 } },
  register: { base: { shape: 'diamond', color: '#7c3aed', size: 14, minzoom: 8 } },
  'ghost-towns': { base: { shape: 'house', color: '#57534e', size: 15, minzoom: 7 } },
  land: { base: { shape: 'circle', color: '#ca8a04', size: 6, minzoom: 14 } },
  notable: {
    base: { shape: 'circle', color: '#4b5563', size: 9, minzoom: 10 },
    kinds: {
      mine: { shape: 'square', color: '#111827', size: 9 },
      petroglyph: { shape: 'diamond', color: '#b91c1c', size: 12, minzoom: 9 },
      'archaeological-site': { shape: 'diamond', color: '#9a3412', size: 11 },
      ruins: { shape: 'square', color: '#78716c', size: 10 },
    },
  },
  'past-finds': { base: { shape: 'star', color: '#eab308', size: 26, minzoom: 0 } },
};

function pointStyle(layer: DataLayerId, kind?: string): PointStyle {
  const def = POINTS[layer];
  return { ...def.base, ...(kind ? def.kinds?.[kind] : undefined) };
}

/** Swatch shape and color for a layer, for the layer panel. */
export function layerSwatch(layer: DataLayerId): PointStyle {
  return pointStyle(layer);
}

function byKind<T extends string | number>(
  layer: DataLayerId,
  pick: (s: PointStyle) => T,
): ExpressionSpecification | T {
  const def = POINTS[layer];
  const base = pick(def.base);
  const kinds = Object.keys(def.kinds ?? {});
  if (!kinds.length) return base;
  const branches = kinds.flatMap((k) => [k, pick(pointStyle(layer, k))]);
  return ['match', ['get', 'kind'], ...branches, base] as unknown as ExpressionSpecification;
}

const IS_LINE: ExpressionSpecification = [
  'in',
  ['geometry-type'],
  ['literal', ['LineString', 'MultiLineString']],
];
const IS_AREA: ExpressionSpecification = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon']],
];
const IS_POINT: ExpressionSpecification = [
  'in',
  ['geometry-type'],
  ['literal', ['Point', 'MultiPoint']],
];
const NAMED: ExpressionSpecification = ['==', ['get', 'named'], true];

/** With a county isolated, only its features show. */
function inCounty(sel: CountyId | null): ExpressionSpecification | null {
  return sel ? ['==', ['get', 'county'], sel] : null;
}

function all(...parts: (ExpressionSpecification | null)[]): FilterSpecification {
  const kept = parts.filter((p): p is ExpressionSpecification => p !== null);
  return kept.length === 1 ? kept[0]! : ['all', ...kept];
}

function textSize(scale: number, base: number): DataDrivenPropertyValueSpecification<number> {
  return ['interpolate', ['linear'], ['zoom'], 8, base * 0.85 * scale, 14, base * 1.15 * scale];
}

function visibility(on: boolean): 'visible' | 'none' {
  return on ? 'visible' : 'none';
}

export function dataSources(
  data: Partial<Record<DataLayerId, FeatureCollection>>,
  markers: FeatureCollection,
): Record<string, SourceSpecification> {
  const sources: Record<string, SourceSpecification> = {};
  for (const { id } of DATA_LAYERS) {
    sources[dataSourceId(id)] = {
      type: 'geojson',
      data: data[id] ?? { type: 'FeatureCollection', features: [] },
      promoteId: 'id',
      attribution: ATTRIBUTIONS[id],
    };
  }
  sources[MARKERS_SOURCE] = { type: 'geojson', data: markers, promoteId: 'id' };
  return sources;
}

const HMDB = '<a href="https://www.hmdb.org/" target="_blank" rel="noopener">HMdb.org</a>';
const ATTRIBUTIONS: Partial<Record<DataLayerId, string>> = {
  'historic-trails': 'NPS National Trails',
  nature: 'USGS GNIS',
  markers: HMDB,
  'state-markers': `Nevada SHPO, ${HMDB}`,
  register: 'Nevada SHPO, Wikipedia',
  'ghost-towns': 'Wikipedia',
  land: 'BLM Nevada SMA, county assessor parcels',
};

/** Layers drawn under the county outlines (fills and lines). */
export function dataLayersBelow(state: DataLayerState): LayerSpecification[] {
  const { layers: on, selectedCountyId: sel, theme } = state;
  const county = inCounty(sel);
  const dark = theme === 'dark';
  const src = dataSourceId;
  const out: LayerSpecification[] = [];

  // Land ownership
  out.push(
    {
      id: 'hunt-land-fill',
      type: 'fill',
      source: src('land'),
      layout: { visibility: visibility(on.land) },
      filter: all(county),
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          ...Object.entries(LAND_COLORS).flat(),
          '#d4d4d4',
        ] as unknown as ExpressionSpecification,
        'fill-opacity': [
          'case',
          ['==', ['get', 'kind'], 'PVT'],
          0.12,
          ['in', 'parcel-', ['get', 'kind']],
          0.55,
          0.35,
        ],
      },
    },
    {
      id: 'hunt-land-parcel-line',
      type: 'line',
      source: src('land'),
      minzoom: 11,
      layout: { visibility: visibility(on.land) },
      filter: all(county, ['in', 'parcel-', ['get', 'kind']]),
      paint: { 'line-color': '#831843', 'line-width': 0.8, 'line-opacity': 0.7 },
    },
  );

  // Parks and water areas
  out.push(
    {
      id: 'hunt-parks-fill',
      type: 'fill',
      source: src('parks'),
      layout: { visibility: visibility(on.parks) },
      filter: all(county, IS_AREA),
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.25 },
    },
    {
      id: 'hunt-parks-outline',
      type: 'line',
      source: src('parks'),
      layout: { visibility: visibility(on.parks) },
      filter: all(county, IS_AREA),
      paint: { 'line-color': '#15803d', 'line-width': 1.2 },
    },
    {
      id: 'hunt-nature-fill',
      type: 'fill',
      source: src('nature'),
      layout: { visibility: visibility(on.nature) },
      filter: all(county, IS_AREA),
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.3, 'fill-outline-color': '#1d4ed8' },
    },
  );

  // Streets, by surface. Highways show from zoom 7, everything else once zoomed in.
  const surfaceColor: ExpressionSpecification = [
    'match',
    ['get', 'surface'],
    'paved',
    dark ? '#e5e7eb' : '#374151',
    'gravel',
    '#b45309',
    'dirt',
    '#92400e',
    '4x4',
    '#dc2626',
    ['match', ['get', 'kind'], 'track', '#a16207', dark ? '#9ca3af' : '#6b7280'],
  ];
  const streetWidth: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['zoom'],
    8,
    ['match', ['get', 'kind'], 'highway', 1.6, 0.5],
    14,
    ['match', ['get', 'kind'], 'highway', 4, 'local', 2.2, 1.4],
  ];
  const unpaved: ExpressionSpecification = [
    'any',
    ['in', ['get', 'surface'], ['literal', ['dirt', '4x4']]],
    [
      'all',
      ['==', ['get', 'kind'], 'track'],
      ['!=', ['get', 'surface'], 'gravel'],
      ['!=', ['get', 'surface'], 'paved'],
    ],
  ];
  out.push(
    {
      id: 'hunt-streets-solid',
      type: 'line',
      source: src('streets'),
      layout: { visibility: visibility(on.streets), 'line-cap': 'round', 'line-join': 'round' },
      filter: all(
        county,
        ['!', unpaved],
        ['any', ['==', ['get', 'kind'], 'highway'], ['>=', ['zoom'], 10]],
      ),
      paint: { 'line-color': surfaceColor, 'line-width': streetWidth, 'line-opacity': 0.85 },
    },
    {
      id: 'hunt-streets-dashed',
      type: 'line',
      source: src('streets'),
      minzoom: 10,
      layout: { visibility: visibility(on.streets), 'line-join': 'round' },
      filter: all(county, unpaved),
      paint: {
        'line-color': surfaceColor,
        'line-width': streetWidth,
        'line-dasharray': [3, 2],
        'line-opacity': 0.9,
      },
    },
  );

  // Rivers and creeks, trails, railroads, historic trails
  out.push(
    {
      id: 'hunt-nature-line',
      type: 'line',
      source: src('nature'),
      layout: { visibility: visibility(on.nature), 'line-cap': 'round', 'line-join': 'round' },
      filter: all(county, IS_LINE),
      paint: {
        'line-color': '#2563eb',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['match', ['get', 'kind'], 'river', 2, 1],
          14,
          ['match', ['get', 'kind'], 'river', 4, 2],
        ],
        'line-opacity': ['match', ['get', 'kind'], 'canal', 0.6, 0.85],
      },
    },
    {
      id: 'hunt-trails-line',
      type: 'line',
      source: src('trails'),
      layout: { visibility: visibility(on.trails), 'line-join': 'round' },
      filter: all(county, IS_LINE),
      paint: {
        'line-color': '#a0522d',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.5],
        'line-dasharray': [2, 1.5],
      },
    },
    {
      id: 'hunt-notable-line',
      type: 'line',
      source: src('notable'),
      layout: { visibility: visibility(on.notable) },
      filter: all(county, IS_LINE, ['!=', ['get', 'kind'], 'abandoned-railway']),
      paint: {
        'line-color': dark ? '#d1d5db' : '#1f2937',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5],
        'line-dasharray': [4, 1],
      },
    },
    {
      id: 'hunt-notable-abandoned-line',
      type: 'line',
      source: src('notable'),
      layout: { visibility: visibility(on.notable) },
      filter: all(county, IS_LINE, ['==', ['get', 'kind'], 'abandoned-railway']),
      paint: {
        'line-color': '#9ca3af',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5],
        'line-dasharray': [1, 2],
      },
    },
    {
      id: 'hunt-historic-trails-line',
      type: 'line',
      source: src('historic-trails'),
      layout: {
        visibility: visibility(on['historic-trails']),
        'line-cap': 'round',
        'line-join': 'round',
      },
      filter: all(county, IS_LINE),
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'pony-express',
          '#7c3aed',
          'lincoln-highway',
          '#be123c',
          '#b45309',
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 14, 5],
        'line-opacity': 0.75,
        'line-dasharray': [2, 1],
      },
    },
  );
  return out;
}

/** Layers drawn above the county outlines: point icons, labels and custom markers. */
export function dataLayersAbove(state: DataLayerState): LayerSpecification[] {
  const { layers: on, selectedCountyId: sel, theme, labelSize, streetLabels } = state;
  const county = inCounty(sel);
  const scale = LABEL_SCALE[labelSize];
  const text = theme === 'dark' ? '#f8fafc' : '#111827';
  const halo = theme === 'dark' ? '#0f172a' : '#ffffff';
  const out: LayerSpecification[] = [];

  // Line labels: street names, rivers, trails, historic trails
  const lineLabel = (
    id: string,
    layer: DataLayerId,
    visible: boolean,
    minzoom: number,
    field: ExpressionSpecification,
    color: string,
    filter: ExpressionSpecification | null = null,
  ): LayerSpecification => ({
    id,
    type: 'symbol',
    source: dataSourceId(layer),
    minzoom,
    layout: {
      visibility: visibility(visible),
      'symbol-placement': 'line',
      'text-field': field,
      'text-font': LABEL_FONT,
      'text-size': textSize(scale, 11),
      'text-max-angle': 35,
    },
    filter: all(county, IS_LINE, filter),
    paint: { 'text-color': color, 'text-halo-color': halo, 'text-halo-width': 1.5 },
  });
  out.push(
    lineLabel(
      'hunt-streets-label',
      'streets',
      on.streets && streetLabels,
      12,
      ['coalesce', ['get', 'ref'], ['get', 'name']],
      text,
      ['==', ['get', 'named'], true],
    ),
    lineLabel('hunt-nature-line-label', 'nature', on.nature, 11, ['get', 'name'], '#1d4ed8', NAMED),
    lineLabel('hunt-trails-label', 'trails', on.trails, 12, ['get', 'name'], '#7c2d12', NAMED),
    lineLabel(
      'hunt-historic-trails-label',
      'historic-trails',
      on['historic-trails'],
      9,
      ['get', 'name'],
      '#92400e',
    ),
  );

  // Point icons with labels, one symbol layer per data layer (polygons get one at their center).
  const order: DataLayerId[] = [
    'land',
    'nature',
    'parks',
    'trails',
    'notable',
    'ghost-towns',
    'register',
    'markers',
    'state-markers',
    'towns',
    'past-finds',
  ];
  for (const layer of order) {
    const minzoom = byKind(layer, (s) => s.minzoom);
    const icon = [
      'concat',
      'hunt-icon:',
      byKind(layer, (s) => s.shape),
      ':',
      byKind(layer, (s) => s.color),
      ':',
      ['to-string', byKind(layer, (s) => s.size)],
    ] as ExpressionSpecification;
    const isTown = layer === 'towns';
    out.push({
      id: `hunt-${layer}-points`,
      type: 'symbol',
      source: dataSourceId(layer),
      layout: {
        visibility: visibility(on[layer]),
        'icon-image': icon,
        // Markers cluster at the same sites (Dayton, Fort Churchill), so none may hide another.
        'icon-allow-overlap':
          layer === 'past-finds' || layer === 'state-markers' || layer === 'markers',
        'icon-padding': 1,
        'text-field': ['case', NAMED, ['get', 'name'], ''],
        'text-font': LABEL_FONT,
        'text-size': textSize(scale, isTown ? 13 : 11),
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
        'symbol-sort-key': ['case', NAMED, 0, 1],
      },
      // Land polygons are labeled only when zoomed well in; points of every other layer always.
      filter: all(
        county,
        ['>=', ['zoom'], minzoom] as ExpressionSpecification,
        layer === 'land' ? ['all', ['>=', ['zoom'], 13], ['in', 'parcel-', ['get', 'kind']]] : null,
        ['!', IS_LINE],
        layer === 'nature' ? ['any', IS_POINT, NAMED] : null,
      ),
      paint: {
        'text-color': layer === 'past-finds' ? '#a16207' : text,
        'text-halo-color': halo,
        'text-halo-width': 1.5,
        // Labels of minor places fade in a zoom level after their icons.
        'text-opacity':
          isTown || layer === 'past-finds'
            ? 1
            : ['interpolate', ['linear'], ['zoom'], 10, 0, 11, 1],
      },
    });
  }

  // Custom markers: pins colored by status, shown with the layer they're assigned to.
  const visibleLayers = Object.entries(on)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const statusColor = [
    'match',
    ['get', 'status'],
    ...MARKER_STATUSES.flatMap((s) => [s.id, STATUS_COLORS[s.id]]),
    '#2563eb',
  ] as unknown as ExpressionSpecification;
  out.push({
    id: MARKERS_LAYER,
    type: 'symbol',
    source: MARKERS_SOURCE,
    filter: ['in', ['get', 'layer'], ['literal', visibleLayers]],
    layout: {
      'icon-image': ['concat', 'hunt-icon:pin:', statusColor, ':30'] as ExpressionSpecification,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': textSize(scale, 12),
      'text-offset': [0, 0.3],
      'text-anchor': 'top',
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: { 'text-color': '#0e7490', 'text-halo-color': halo, 'text-halo-width': 1.8 },
  });
  return out;
}

/** Layers the user can click for a popup, most specific first. */
export const CLICKABLE_LAYERS = [
  MARKERS_LAYER,
  'hunt-past-finds-points',
  'hunt-state-markers-points',
  'hunt-markers-points',
  'hunt-register-points',
  'hunt-ghost-towns-points',
  'hunt-towns-points',
  'hunt-notable-points',
  'hunt-trails-points',
  'hunt-parks-points',
  'hunt-nature-points',
  'hunt-land-points',
  'hunt-historic-trails-line',
  'hunt-trails-line',
  'hunt-notable-line',
  'hunt-notable-abandoned-line',
  'hunt-nature-line',
  'hunt-streets-solid',
  'hunt-streets-dashed',
  'hunt-parks-fill',
  'hunt-nature-fill',
  'hunt-land-fill',
];
