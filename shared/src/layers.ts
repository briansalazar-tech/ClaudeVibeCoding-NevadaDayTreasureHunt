/**
 * The map's data layers. The pipeline writes one file per county per layer
 * (`<county>/<layer>.geojson`), and the client draws and toggles them by these ids.
 */

export interface LayerConfig {
  id: string;
  name: string;
  /** One line for the layer panel. */
  description: string;
  /**
   * Heavy layers are large (streets, land ownership), so the client loads them per county
   * and only when the county is selected or the map is zoomed in to `minzoom`.
   */
  heavy?: { minzoom: number };
  /** Layers with no source file: custom markers live in the database. */
  userOnly?: boolean;
}

export const LAYERS = [
  {
    id: 'streets',
    name: 'Streets & roads',
    description: 'Highways, local streets, gravel and dirt roads, 4x4 tracks',
    heavy: { minzoom: 9 },
  },
  {
    id: 'parks',
    name: 'Parks',
    description: 'State, county and city parks, playgrounds, picnic sites, sports fields',
  },
  {
    id: 'trails',
    name: 'Trails & trailheads',
    description: 'Hiking trails, trailheads, viewpoints',
  },
  {
    id: 'historic-trails',
    name: 'Historic trails',
    description: 'California Trail, Pony Express, Lincoln Highway (partial)',
  },
  { id: 'towns', name: 'Towns & cities', description: 'Cities, towns and named communities' },
  {
    id: 'nature',
    name: 'Geological & water features',
    description: 'Rivers, lakes, springs, peaks, canyons, valleys, flats',
  },
  {
    id: 'state-markers',
    name: 'State historical markers',
    description: 'Official numbered Nevada State Historical Markers',
  },
  { id: 'markers', name: 'Historical markers', description: 'Other markers from HMdb' },
  {
    id: 'register',
    name: 'Register sites',
    description: 'National and State Register of Historic Places',
  },
  { id: 'ghost-towns', name: 'Ghost towns', description: 'Ghost towns and abandoned settlements' },
  {
    id: 'land',
    name: 'Land ownership',
    description: 'Federal, state, tribal and private land, plus public-owner parcels',
    heavy: { minzoom: 9 },
  },
  {
    id: 'notable',
    name: 'Other notable',
    description: 'Petroglyphs, railroads, mines, ruins, other historic sites',
  },
  { id: 'past-finds', name: 'Past finds', description: 'Known medallion find locations' },
  {
    id: 'custom',
    name: 'Custom markers',
    description: 'Markers you add that aren’t assigned to another layer',
    userOnly: true,
  },
] as const satisfies readonly LayerConfig[];

export type HuntLayer = (typeof LAYERS)[number];
export type LayerId = HuntLayer['id'];

/** Layers that have a processed data file per county. */
export const DATA_LAYERS = LAYERS.filter(
  (l): l is Exclude<HuntLayer, { userOnly: true }> => !('userOnly' in l),
);
export type DataLayerId = (typeof DATA_LAYERS)[number]['id'];

const byId = new Map<string, HuntLayer>(LAYERS.map((l) => [l.id, l]));

export function getLayer(id: string): HuntLayer | undefined {
  return byId.get(id);
}

export function isLayerId(id: string): id is LayerId {
  return byId.has(id);
}

export function layerName(id: string): string {
  return byId.get(id)?.name ?? id;
}

/**
 * Properties of every feature in a layer file. MapLibre flattens feature properties,
 * so they stay flat: links are separate fields rather than a nested object.
 */
export interface PlaceProperties {
  /** Stable id from the source, e.g. `osm:way/123`, `hmdb:45678`, `gnis:861234`, `shpo:7`. */
  id: string;
  /** Display name. Unnamed features (a sports field, a dirt road) get a generic label. */
  name: string;
  /** False when `name` is a generic label rather than the feature's real name. */
  named: boolean;
  layer: DataLayerId;
  /** Subtype within the layer, used for styling and the popup, e.g. `spring`, `track`, `BLM`. */
  kind: string;
  county: string;
  /** Representative point for lines and polygons (points use their own coordinates). */
  lng?: number;
  lat?: number;
  hmdb?: string;
  shpo?: string;
  wikipedia?: string;
  website?: string;
  /** Short extra facts shown in the popup, e.g. "Marker 7", "Listed 1997". */
  detail?: string;
  /** Streets: route number such as `US 50` or `SR 341`. */
  ref?: string;
  /** Streets: paved, gravel, dirt, 4x4 or unknown. */
  surface?: string;
  /** Land: owner shown in the popup's "Land owner" line. */
  owner?: string;
  /** Data source, for the popup footer. */
  source: string;
}

/** A place with no confirmed location, listed under "Not on the map" in the county panel. */
export interface UnlocatedPlace {
  id: string;
  name: string;
  layer: DataLayerId;
  reason: string;
  wikipedia?: string;
  detail?: string;
}

/** Display labels for the `kind` values the pipeline writes. Unlisted kinds are shown as-is. */
export const KIND_LABELS: Record<string, string> = {
  // streets
  highway: 'Highway',
  local: 'Local street',
  track: 'Track',
  // parks
  park: 'Park',
  'state-park': 'State park',
  playground: 'Playground',
  'dog-park': 'Dog park',
  'picnic-site': 'Picnic site',
  reserve: 'Nature reserve',
  'sports-field': 'Sports field',
  'recreation-ground': 'Recreation ground',
  'protected-area': 'Protected area',
  'public-land': 'Public land',
  // trails
  trail: 'Trail',
  trailhead: 'Trailhead',
  viewpoint: 'Viewpoint',
  // historic trails
  'california-trail': 'California Trail',
  'pony-express': 'Pony Express Trail',
  'lincoln-highway': 'Lincoln Highway',
  // towns
  city: 'City',
  town: 'Town',
  village: 'Village',
  hamlet: 'Hamlet',
  suburb: 'Neighborhood',
  neighbourhood: 'Neighborhood',
  locality: 'Locality',
  // nature
  river: 'River',
  stream: 'Creek',
  canal: 'Canal',
  lake: 'Lake',
  reservoir: 'Reservoir',
  pond: 'Pond',
  spring: 'Spring',
  'hot-spring': 'Hot spring',
  peak: 'Peak',
  ridge: 'Ridge',
  range: 'Mountain range',
  saddle: 'Saddle',
  canyon: 'Canyon',
  valley: 'Valley',
  flat: 'Flat',
  basin: 'Basin',
  cliff: 'Cliff',
  arch: 'Arch',
  cave: 'Cave',
  landform: 'Landform',
  wetland: 'Wetland',
  // markers and history
  'state-marker': 'State historical marker',
  marker: 'Historical marker',
  nrhp: 'National Register',
  srhp: 'State Register',
  'ghost-town': 'Ghost town',
  petroglyph: 'Petroglyph site',
  'archaeological-site': 'Archaeological site',
  railway: 'Railroad',
  'abandoned-railway': 'Abandoned railroad',
  mine: 'Mine',
  ruins: 'Ruins',
  historic: 'Historic site',
  'past-find': 'Past find',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
