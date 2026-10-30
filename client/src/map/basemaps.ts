import type { StyleSpecification } from 'maplibre-gl';
import type { Theme } from '../state/store';

export const BASEMAPS = [
  { id: 'streets', label: 'Streets' },
  { id: 'topo', label: 'Topo' },
  { id: 'imagery', label: 'Imagery' },
] as const;

export type BasemapId = (typeof BASEMAPS)[number]['id'];

/** OpenFreeMap fonts, used for our labels on top of the raster basemaps too. */
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const LABEL_FONT = ['Noto Sans Bold'];

const USGS_ATTRIBUTION =
  '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>';

function usgsRaster(service: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [
          `https://basemap.nationalmap.gov/arcgis/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
        ],
        tileSize: 256,
        maxzoom: 16,
        attribution: USGS_ATTRIBUTION,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

export function baseStyle(basemap: BasemapId, theme: Theme): string | StyleSpecification {
  switch (basemap) {
    case 'streets':
      return `https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'liberty'}`;
    case 'topo':
      return usgsRaster('USGSTopo');
    case 'imagery':
      return usgsRaster('USGSImageryOnly');
  }
}
