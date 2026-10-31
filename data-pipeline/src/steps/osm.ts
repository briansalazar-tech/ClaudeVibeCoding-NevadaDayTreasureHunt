/**
 * OpenStreetMap: roads, parks, trails, towns, water and landforms, and historic features.
 * Three Overpass queries per county (run one at a time, cached in raw/osm/), then pure
 * functions sort the features into layers.
 */
import type { BBox, CountyId, DataLayerId } from '@hunt/shared';
import { downloadToRaw, readRawJson } from '../lib/download.js';
import {
  overpassToFeatures,
  wikipediaUrl,
  type OsmFeature,
  type OsmTags,
  type OverpassResponse,
} from '../lib/osm.js';
import type { LayerDraft } from '../lib/place.js';
import { SOURCES } from '../sources.js';

/**
 * Nodes, ways and multipolygon relations matching a tag filter. Other relations are left out:
 * `out geom` on a route relation that crosses the continent (a historic trail) times out.
 */
const features = (filter: string) =>
  `node${filter}({{bbox}}); way${filter}({{bbox}}); relation${filter}["type"="multipolygon"]({{bbox}});`;

export const OSM_QUERIES = {
  roads: `
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road|track)$"]({{bbox}});
    way["highway"="service"]["name"]({{bbox}});`,
  places: `
    nwr["place"~"^(city|town|village|hamlet|suburb|neighbourhood|locality)$"]({{bbox}});
    nwr["leisure"~"^(park|playground|dog_park|nature_reserve|pitch|recreation_ground|picnic_table)$"]({{bbox}});
    nwr["tourism"~"^(picnic_site|viewpoint)$"]({{bbox}});
    nwr["boundary"="protected_area"]["name"]["protection_title"!~"Forest|Wilderness"]({{bbox}});
    nwr["highway"="trailhead"]({{bbox}});`,
  trails: `
    way["highway"~"^(path|bridleway)$"]({{bbox}});
    way["highway"~"^(footway|cycleway)$"]["name"]({{bbox}});
    relation["route"~"^(hiking|foot|mtb|horse)$"]({{bbox}});`,
  history: `
    ${features('["historic"]')}
    ${features('["abandoned:place"]')}
    way["railway"~"^(rail|abandoned|disused|narrow_gauge|preserved|razed)$"]({{bbox}});
    node["man_made"~"^(mineshaft|adit)$"]({{bbox}});
    ${features('["landuse"="quarry"]["name"]')}`,
  nature: `
    way["waterway"~"^(river|stream|canal)$"]["name"]({{bbox}});
    ${features('["natural"="water"]["name"]')}
    ${features('["water"~"^(reservoir|lake|pond)$"]["name"]')}
    ${features('["landuse"="reservoir"]["name"]')}
    node["natural"~"^(spring|hot_spring|geyser)$"]({{bbox}});
    ${features('["natural"~"^(peak|volcano|saddle|ridge|arete|valley|gorge|cliff|arch|cave_entrance|rock|plateau|hill|wetland|sand|bare_rock)$"]["name"]')}`,
} as const;

export type OsmQueryName = keyof typeof OSM_QUERIES;

export function overpassQuery(name: OsmQueryName, bbox: BBox): string {
  const [w, s, e, n] = bbox;
  const body = OSM_QUERIES[name].replaceAll('{{bbox}}', `${s},${w},${n},${e}`);
  // `out tags geom` is smaller (no node ids) but drops relation members, which multipolygon
  // parks and lakes need. Roads have no relations, so only they use it.
  const out = name === 'roads' ? 'out tags geom qt;' : 'out geom qt;';
  return `[out:json][timeout:600][maxsize:1073741824];\n(${body}\n);\n${out}`;
}

function rawFile(county: CountyId, name: OsmQueryName): string {
  return `osm/${county}-${name}.json`;
}

/** Runs the county's Overpass queries one after another. Cached; --force re-runs them. */
export async function fetchOsm(
  county: CountyId,
  bbox: BBox,
  { force = false } = {},
): Promise<void> {
  for (const name of Object.keys(OSM_QUERIES) as OsmQueryName[]) {
    await downloadToRaw(SOURCES.osm.url, rawFile(county, name), {
      force,
      // The public Overpass server is often busy; back off for minutes, not seconds.
      retry: { attempts: 8, waitMs: 60_000 },
      init: {
        method: 'POST',
        body: new URLSearchParams({ data: overpassQuery(name, bbox) }),
      },
      validate: (body) => {
        // Overpass reports timeouts and memory errors inside a 200 response.
        const head = body.subarray(0, 2000).toString('utf8');
        const tail = body.subarray(Math.max(0, body.length - 2000)).toString('utf8');
        if (!head.includes('"elements"') || /"remark":\s*"runtime error/.test(tail)) {
          throw new Error(`Overpass ${name} query failed: ${tail.slice(-400)}`);
        }
      },
    });
  }
}

export async function readOsm(county: CountyId): Promise<OsmFeature[]> {
  const all: OsmFeature[] = [];
  const seen = new Set<string>();
  for (const name of Object.keys(OSM_QUERIES) as OsmQueryName[]) {
    for (const f of overpassToFeatures(
      await readRawJson<OverpassResponse>(rawFile(county, name)),
    )) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      all.push(f);
    }
  }
  return all;
}

// ---------------------------------------------------------------------------------------------
// Classification: pure functions from OSM tags to a layer and kind.

const PAVED =
  /^(asphalt|paved|concrete|concrete:plates|concrete:lanes|chipseal|paving_stones|sett|cobblestone|metal|wood)$/;
const GRAVEL = /^(gravel|fine_gravel|compacted|pebblestone|unpaved)$/;
const DIRT = /^(dirt|ground|earth|sand|mud|grass|clay|soil|rock|salt)$/;

/** Road surface category: paved, gravel, dirt, 4x4, or unknown (no surface tag). */
export function roadSurface(tags: OsmTags): 'paved' | 'gravel' | 'dirt' | '4x4' | 'unknown' {
  const smoothness = tags.smoothness ?? '';
  if (
    tags['4wd_only'] === 'yes' ||
    tags.tracktype === 'grade5' ||
    /^(very_horrible|impassable)$/.test(smoothness)
  )
    return '4x4';
  const surface = (tags.surface ?? '').split(';')[0]!;
  if (PAVED.test(surface)) return 'paved';
  if (GRAVEL.test(surface)) return 'gravel';
  if (DIRT.test(surface)) return 'dirt';
  if (tags.tracktype === 'grade1') return 'paved';
  if (tags.tracktype === 'grade2') return 'gravel';
  if (tags.tracktype === 'grade3' || tags.tracktype === 'grade4') return 'dirt';
  if (/^(motorway|trunk|primary|secondary)/.test(tags.highway ?? '')) return 'paved';
  return 'unknown';
}

const HIGHWAY = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;

/** "NV 341" / "SR 341" / "US 50;US 95A" → "SR 341, US 50". */
export function routeRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return ref
    .split(';')
    .map((r) =>
      r
        .trim()
        .replace(/^NV\s*/i, 'SR ')
        .replace(/^I\s+/, 'I-'),
    )
    .join(', ');
}

/** Any name-like tag on a road mentions the Lincoln Highway. */
function isLincolnHighway(tags: OsmTags): boolean {
  return ['name', 'alt_name', 'old_name', 'historic_name', 'official_name', 'name:historic'].some(
    (k) => /lincoln highway/i.test(tags[k] ?? ''),
  );
}

function osmLinks(tags: OsmTags): Pick<LayerDraft, 'wikipedia' | 'website'> {
  return {
    wikipedia: wikipediaUrl(tags.wikipedia),
    website: tags.website ?? tags['contact:website'] ?? tags.url,
  };
}

function draft(
  f: OsmFeature,
  layer: DataLayerId,
  kind: string,
  fallbackName: string,
  extra: Partial<LayerDraft> = {},
): LayerDraft {
  const tags = f.properties;
  const name = tags.name ?? tags['abandoned:name'] ?? tags.official_name;
  return {
    id: f.id,
    layer,
    kind,
    name: name ?? fallbackName,
    named: Boolean(name),
    geometry: f.geometry,
    source: 'OpenStreetMap',
    ...osmLinks(tags),
    ...extra,
  };
}

const NATURE_KINDS: Record<string, string> = {
  spring: 'spring',
  hot_spring: 'hot-spring',
  geyser: 'hot-spring',
  peak: 'peak',
  volcano: 'peak',
  hill: 'peak',
  saddle: 'saddle',
  ridge: 'ridge',
  arete: 'ridge',
  valley: 'valley',
  gorge: 'canyon',
  cliff: 'cliff',
  arch: 'arch',
  cave_entrance: 'cave',
  rock: 'landform',
  bare_rock: 'landform',
  plateau: 'landform',
  sand: 'landform',
  wetland: 'wetland',
};

function waterKind(tags: OsmTags): string {
  const water = tags.water ?? (tags.landuse === 'reservoir' ? 'reservoir' : 'lake');
  if (water === 'reservoir' || water === 'basin') return 'reservoir';
  if (water === 'pond') return 'pond';
  return 'lake';
}

const PARK_KINDS: Record<string, string> = {
  park: 'park',
  playground: 'playground',
  dog_park: 'dog-park',
  nature_reserve: 'reserve',
  pitch: 'sports-field',
  recreation_ground: 'recreation-ground',
};

const SPORT_NAMES: Record<string, string> = {
  baseball: 'Baseball field',
  softball: 'Softball field',
  soccer: 'Soccer field',
  american_football: 'Football field',
  basketball: 'Basketball court',
  tennis: 'Tennis court',
  pickleball: 'Pickleball court',
  volleyball: 'Volleyball court',
  equestrian: 'Arena',
  skateboard: 'Skate park',
  multi: 'Sports field',
};

/** Ghost town or abandoned settlement, per the tags OSM mappers use for them. */
function isGhostTown(tags: OsmTags): boolean {
  return (
    tags.historic === 'ghost_town' ||
    tags['abandoned:place'] !== undefined ||
    (tags.place !== undefined && (tags.abandoned === 'yes' || tags.historic === 'yes'))
  );
}

/**
 * Sorts OSM features into layer drafts. A feature can feed more than one layer
 * (a road named Lincoln Highway is a street and part of the historic trail).
 */
export function classifyOsm(features: readonly OsmFeature[]): LayerDraft[] {
  const out: LayerDraft[] = [];
  for (const f of features) {
    const t = f.properties;
    const hw = t.highway;

    // Streets & roads
    if (
      hw &&
      /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|track|service)(_link)?$/.test(
        hw,
      )
    ) {
      const kind = HIGHWAY.test(hw) ? 'highway' : hw === 'track' ? 'track' : 'local';
      const ref = routeRef(t.ref);
      out.push(
        draft(f, 'streets', kind, ref ?? (kind === 'track' ? 'Track' : 'Road'), {
          ref,
          surface: roadSurface(t),
          named: Boolean(t.name ?? ref),
        }),
      );
      if (isLincolnHighway(t)) {
        out.push(
          draft(f, 'historic-trails', 'lincoln-highway', 'Lincoln Highway', {
            name: 'Lincoln Highway',
            named: true,
            detail: t.name,
          }),
        );
      }
      continue;
    }

    // Trails & trailheads
    if (hw === 'trailhead') {
      out.push(draft(f, 'trails', 'trailhead', 'Trailhead'));
      continue;
    }
    if (hw && /^(path|footway|bridleway|cycleway)$/.test(hw)) {
      out.push(draft(f, 'trails', 'trail', 'Trail'));
      continue;
    }
    if (t.route && /^(hiking|foot|mtb|horse)$/.test(t.route)) {
      out.push(draft(f, 'trails', 'trail', 'Trail'));
      continue;
    }
    if (t.tourism === 'viewpoint') {
      out.push(draft(f, 'trails', 'viewpoint', 'Viewpoint'));
      continue;
    }

    // Ghost towns (before towns: an abandoned place isn't a living town)
    if (isGhostTown(t)) {
      out.push(draft(f, 'ghost-towns', 'ghost-town', 'Ghost town'));
      continue;
    }

    // Towns & cities
    if (t.place) {
      out.push(draft(f, 'towns', t.place, 'Place'));
      continue;
    }

    // Parks
    if (t.leisure && PARK_KINDS[t.leisure]) {
      const kind = PARK_KINDS[t.leisure]!;
      const fallback =
        kind === 'sports-field'
          ? (SPORT_NAMES[(t.sport ?? '').split(';')[0]!] ?? 'Sports field')
          : kind === 'dog-park'
            ? 'Dog park'
            : kind === 'playground'
              ? 'Playground'
              : 'Park';
      out.push(draft(f, 'parks', kind, fallback));
      continue;
    }
    if (t.tourism === 'picnic_site' || t.leisure === 'picnic_table') {
      if (t.leisure === 'picnic_table' && !t.name) continue;
      out.push(draft(f, 'parks', 'picnic-site', 'Picnic site'));
      continue;
    }
    if (t.boundary === 'protected_area') {
      // National forests and wilderness are land ownership, not parks.
      const title = `${t.protection_title ?? ''} ${t.name ?? ''}`;
      if (
        /national forest|wilderness|wildlife management|wildlife refuge|conservation easement/i.test(
          title,
        )
      ) {
        if (/wildlife management|wildlife refuge/i.test(title))
          out.push(draft(f, 'parks', 'reserve', 'Wildlife area'));
        continue;
      }
      const state = /state (historic )?park|state recreation/i.test(title);
      out.push(draft(f, 'parks', state ? 'state-park' : 'protected-area', 'Protected area'));
      continue;
    }

    // Water and landforms
    if (t.waterway && /^(river|stream|canal)$/.test(t.waterway)) {
      out.push(draft(f, 'nature', t.waterway, 'Creek'));
      continue;
    }
    if (
      t.natural === 'water' ||
      t.landuse === 'reservoir' ||
      (t.water && /^(reservoir|lake|pond)$/.test(t.water))
    ) {
      out.push(draft(f, 'nature', waterKind(t), 'Lake'));
      continue;
    }
    if (t.natural && NATURE_KINDS[t.natural]) {
      const kind = NATURE_KINDS[t.natural]!;
      out.push(draft(f, 'nature', kind, kind === 'hot-spring' ? 'Hot spring' : 'Spring'));
      continue;
    }

    // Other notable: petroglyphs, railroads, mines, ruins, other historic sites
    if (t.railway) {
      const abandoned = /^(abandoned|disused|razed)$/.test(t.railway);
      out.push(
        draft(
          f,
          'notable',
          abandoned ? 'abandoned-railway' : 'railway',
          abandoned ? 'Abandoned railroad' : 'Railroad',
          {
            detail: t.operator ?? t['historic:railway'] ?? t.old_railway_operator,
          },
        ),
      );
      continue;
    }
    if (
      t.man_made === 'mineshaft' ||
      t.man_made === 'adit' ||
      t.historic === 'mine' ||
      t.historic === 'mine_shaft' ||
      t.landuse === 'quarry'
    ) {
      out.push(draft(f, 'notable', 'mine', t.man_made === 'adit' ? 'Adit' : 'Mine'));
      continue;
    }
    if (t.historic) {
      // Plaques and markers come from HMdb and the SHPO list; skip OSM's copies of them.
      if (
        /^(memorial|marker)$/.test(t.historic) &&
        /plaque|marker|board/.test(t.memorial ?? t.historic)
      )
        continue;
      if (t.historic === 'archaeological_site') {
        const petro = /petroglyph|rock_art|rock art/i.test(
          `${t.site_type ?? ''} ${t.archaeological_site ?? ''} ${t.name ?? ''}`,
        );
        out.push(
          draft(
            f,
            'notable',
            petro ? 'petroglyph' : 'archaeological-site',
            petro ? 'Petroglyph site' : 'Archaeological site',
          ),
        );
        continue;
      }
      if (t.historic === 'ruins') {
        out.push(draft(f, 'notable', 'ruins', 'Ruins'));
        continue;
      }
      if (!t.name) continue;
      out.push(
        draft(f, 'notable', 'historic', 'Historic site', { detail: t.historic.replace(/_/g, ' ') }),
      );
    }
  }
  return out;
}
