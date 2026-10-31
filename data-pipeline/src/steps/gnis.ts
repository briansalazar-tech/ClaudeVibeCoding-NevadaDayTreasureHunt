/**
 * USGS GNIS Domestic Names (Nevada): named springs, lakes, summits, canyons, valleys, flats and
 * other landforms, added to the Geological & water features layer where OSM doesn't have them.
 */
import { readFile } from 'node:fs/promises';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { unzipSync, strFromU8 } from 'fflate';
import type { Position } from 'geojson';
import { downloadToRaw, rawPath } from '../lib/download.js';
import { metersToGeometry } from '../lib/geo.js';
import { normalizeName, stripBom } from '../lib/names.js';
import type { LayerDraft } from '../lib/place.js';
import { SOURCES } from '../sources.js';

export interface GnisName {
  id: string;
  name: string;
  featureClass: string;
  county: string;
  lat: number;
  lng: number;
}

/** GNIS feature classes we add, and the layer kind each becomes. Streams come from OSM as lines. */
const CLASS_KINDS: Record<string, string> = {
  Spring: 'spring',
  Lake: 'lake',
  Reservoir: 'reservoir',
  Swamp: 'wetland',
  Falls: 'landform',
  Summit: 'peak',
  Ridge: 'ridge',
  Range: 'range',
  Gap: 'saddle',
  Valley: 'valley',
  Arroyo: 'canyon',
  Flat: 'flat',
  Plain: 'flat',
  Basin: 'basin',
  Bench: 'landform',
  Slope: 'landform',
  Bend: 'landform',
  Cliff: 'cliff',
  Pillar: 'landform',
  Arch: 'arch',
  Crater: 'landform',
  Lava: 'landform',
  Island: 'landform',
  Cape: 'landform',
  Area: 'landform',
  Gut: 'canyon',
};

/** Parses the pipe-delimited GNIS text file. */
export function parseGnis(text: string): GnisName[] {
  const lines = stripBom(text).split(/\r?\n/);
  const header = lines[0]!.split('|');
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`GNIS file has no ${name} column`);
    return i;
  };
  const [id, name, cls, county, lat, lng] = [
    col('feature_id'),
    col('feature_name'),
    col('feature_class'),
    col('county_name'),
    col('prim_lat_dec'),
    col('prim_long_dec'),
  ];
  const out: GnisName[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split('|');
    const la = Number(f[lat]);
    const lo = Number(f[lng]);
    // GNIS uses 0,0 for "location unknown"; never guess one.
    if (!la || !lo) continue;
    out.push({
      id: f[id]!,
      name: f[name]!,
      featureClass: f[cls]!,
      county: f[county]!,
      lat: la,
      lng: lo,
    });
  }
  return out;
}

function gnisKind(n: GnisName): string | undefined {
  const kind = CLASS_KINDS[n.featureClass];
  if (!kind) return undefined;
  if (kind === 'spring' && /hot spring|warm spring/i.test(n.name)) return 'hot-spring';
  if (kind === 'valley' && /canyon|gulch|draw|ravine/i.test(n.name)) return 'canyon';
  return kind;
}

/** Same name within this distance of an existing feature counts as a duplicate. */
const DUPLICATE_METERS = 2000;

/**
 * GNIS names to add: the wanted classes, minus those OSM already has (same normalized
 * name within 2 km, or the GNIS point inside the OSM polygon).
 */
export function gnisDrafts(
  names: readonly GnisName[],
  existing: readonly LayerDraft[],
): { drafts: LayerDraft[]; duplicates: number } {
  const byName = new Map<string, LayerDraft[]>();
  for (const d of existing) {
    if (!d.named) continue;
    const key = normalizeName(d.name);
    byName.set(key, [...(byName.get(key) ?? []), d]);
  }
  const drafts: LayerDraft[] = [];
  let duplicates = 0;
  for (const n of names) {
    const kind = gnisKind(n);
    if (!kind) continue;
    const p: Position = [n.lng, n.lat];
    const twins = byName.get(normalizeName(n.name)) ?? [];
    const dup = twins.some(
      (d) =>
        metersToGeometry(p, d.geometry) <= DUPLICATE_METERS ||
        ((d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon') &&
          booleanPointInPolygon(p, d.geometry)),
    );
    if (dup) {
      duplicates++;
      continue;
    }
    drafts.push({
      id: `gnis:${n.id}`,
      layer: 'nature',
      kind,
      name: n.name,
      named: true,
      geometry: { type: 'Point', coordinates: p },
      source: 'USGS GNIS',
      detail: n.featureClass,
    });
  }
  return { drafts, duplicates };
}

export async function fetchGnis({ force = false } = {}): Promise<void> {
  await downloadToRaw(SOURCES.gnis.url, SOURCES.gnis.rawFile, { force });
}

let cache: GnisName[] | undefined;

export async function readGnis(): Promise<GnisName[]> {
  if (cache) return cache;
  const files = unzipSync(new Uint8Array(await readFile(rawPath(SOURCES.gnis.rawFile))));
  const txt = Object.keys(files).find((n) => n.toLowerCase().endsWith('.txt'));
  if (!txt) throw new Error('GNIS zip has no .txt file');
  cache = parseGnis(strFromU8(files[txt]!));
  return cache;
}
