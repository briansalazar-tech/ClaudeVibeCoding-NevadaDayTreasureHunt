import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { CountyId } from './counties.js';

/** Paths under client/public/data/ (the pipeline writes them, the client fetches them). */
export const DATA_FILES = {
  manifest: 'manifest.json',
  counties: 'boundaries/counties.geojson',
  countyLabels: 'boundaries/county-labels.geojson',
  outsideMask: 'boundaries/outside-mask.geojson',
} as const;

export type BBox = [west: number, south: number, east: number, north: number];

export interface CountyProperties {
  id: CountyId;
  name: string;
  fips: string;
  seat: string;
  /** Land and water area from the Census file, in square meters. */
  landArea: number;
  waterArea: number;
  bbox: BBox;
}

export type CountyFeature = Feature<Polygon | MultiPolygon, CountyProperties>;
export type CountyCollection = FeatureCollection<Polygon | MultiPolygon, CountyProperties>;
export type CountyLabelCollection = FeatureCollection<Point, Pick<CountyProperties, 'id' | 'name'>>;

export interface Manifest {
  buildDate: string;
  /** Bounding box of all hunt counties together. */
  bbox: BBox;
  sources: Record<string, { name: string; url: string; vintage?: string }>;
  counties: Record<string, { layers: Record<string, { count: number }> }>;
}
