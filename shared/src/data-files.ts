import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from 'geojson';
import type { CountyId } from './counties.js';
import type { DataLayerId, PlaceProperties, UnlocatedPlace } from './layers.js';

/** Paths under client/public/data/ (the pipeline writes them, the client fetches them). */
export const DATA_FILES = {
  manifest: 'manifest.json',
  counties: 'boundaries/counties.geojson',
  countyLabels: 'boundaries/county-labels.geojson',
  outsideMask: 'boundaries/outside-mask.geojson',
} as const;

/** `<county>/<layer>.geojson`: one county's features for one layer. */
export function layerFile(county: CountyId, layer: DataLayerId): string {
  return `${county}/${layer}.geojson`;
}

/** `<county>/unlocated.json`: places with no confirmed location ("Not on the map"). */
export function unlocatedFile(county: CountyId): string {
  return `${county}/unlocated.json`;
}

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
  counties: Record<string, CountyManifest>;
}

export interface CountyManifest {
  /** Feature count per layer file; a layer with no entry has no file for this county. */
  layers: Partial<Record<DataLayerId, { count: number; bytes?: number }>>;
  /** Number of entries in unlocated.json. */
  unlocated?: number;
  buildDate?: string;
}

export type PlaceFeature = Feature<Geometry, PlaceProperties>;
export type PlaceCollection = FeatureCollection<Geometry, PlaceProperties>;
export type UnlocatedList = UnlocatedPlace[];
