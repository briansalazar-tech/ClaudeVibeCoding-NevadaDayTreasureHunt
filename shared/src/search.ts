import type { CountyId } from './counties.js';
import type { BBox } from './data-files.js';
import type { DataLayerId } from './layers.js';

/**
 * `<county>/search.json`: every named place in the county, built by the pipeline, so search
 * covers all layers (streets included) without loading the layer files.
 */
export function searchFile(county: CountyId): string {
  return `${county}/search.json`;
}

/** The `kind` of a route entry: one per route number per county, covering all its pieces. */
export const ROUTE_KIND = 'route';

export interface SearchEntry {
  /** Feature id to open; for a street or route mapped in pieces, one of the pieces. */
  id: string;
  /** Display name. A route entry is named by its number, e.g. `SR 341`. */
  name: string;
  layer: DataLayerId;
  kind: string;
  lng: number;
  lat: number;
  /** Lines and polygons: the extent to fly to. */
  bbox?: BBox;
  /** Canonical route numbers: on a street, the routes it carries; on a route entry, itself. */
  routes?: string[];
  /** Route entries: the street names along the route, for display and search. */
  alt?: string;
}

export interface SearchFileData {
  county: CountyId;
  entries: SearchEntry[];
}
