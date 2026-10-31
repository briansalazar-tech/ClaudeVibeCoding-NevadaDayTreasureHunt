/**
 * Processes raw data into client/public/data/ and updates manifest.json.
 *   npm run data:build -- --county lyon   (or --all)
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  COUNTIES,
  DATA_LAYERS,
  getCounty,
  layerFile,
  PAST_FINDS,
  unlocatedFile,
  type Manifest,
} from '@hunt/shared';
import { buildCountyLayers } from './build-county.js';
import { parseArgs } from './lib/args.js';
import { readCountyAreas } from './lib/counties.js';
import { readManifest, writeJson, writeManifest } from './lib/manifest.js';
import { OUT_DIR } from './lib/paths.js';
import { COUNTY_PARK_SOURCES, SOURCES } from './sources.js';
import { buildBoundaries } from './steps/boundaries.js';
import { readCountyParks } from './steps/county-parks.js';
import { readGhostTowns } from './steps/ghost-towns.js';
import { readGnis } from './steps/gnis.js';
import { parcelSourceFor, readParcelDrafts, readSmaDrafts } from './steps/land.js';
import { readMarkers } from './steps/markers.js';
import { readNpsTrailDrafts } from './steps/nps-trails.js';
import { classifyOsm, readOsm } from './steps/osm.js';
import { readRegister } from './steps/register.js';

/** Above this, a layer file should be simplified or moved to PMTiles (see CLAUDE.md). */
const LARGE_FILE_BYTES = 10 * 1024 * 1024;

const args = parseArgs(process.argv.slice(2));
const previous = await readManifest();

console.log('Building county boundaries');
const boundaries = await buildBoundaries();
const areas = await readCountyAreas();

const counties: Manifest['counties'] = {};
for (const c of COUNTIES) counties[c.id] = previous.counties?.[c.id] ?? { layers: {} };

const usedSources = new Set<keyof typeof SOURCES>(['censusCounties']);
if (args.counties.length) {
  const gnis = await readGnis();
  const npsTrails = await readNpsTrailDrafts();
  const sma = await readSmaDrafts();
  for (const key of [
    'osm',
    'gnis',
    'californiaTrail',
    'ponyExpress',
    'blmSma',
    'shpoMarkers',
    'shpoStateRegister',
    'hmdb',
    'wikipediaNrhp',
    'wikipediaGhostTowns',
    'pastFinds',
  ] as const) {
    usedSources.add(key);
  }

  for (const id of args.counties) {
    const county = getCounty(id)!;
    console.log(`Building ${county.name}`);
    const result = buildCountyLayers({
      county,
      area: areas.get(id)!,
      osm: classifyOsm(await readOsm(id)),
      gnis,
      npsTrails,
      sma,
      parcels: await readParcelDrafts(id, county.name),
      countyParks: await readCountyParks(id),
      // HMdb needs a manual download; build without it (with a warning) rather than not at all.
      markers: await readMarkers(id, county.name, { requireHmdb: false }),
      register: await readRegister(id, county.name),
      ghostTowns: await readGhostTowns(id, county.name),
      pastFinds: PAST_FINDS,
    });
    for (const note of result.notes) console.log(`  ${note}`);

    await rm(path.join(OUT_DIR, id), { recursive: true, force: true });
    const layers: Manifest['counties'][string]['layers'] = {};
    for (const { id: layer } of DATA_LAYERS) {
      const features = result.layers[layer];
      const bytes = await writeJson(layerFile(id, layer), { type: 'FeatureCollection', features });
      layers[layer] = { count: features.length, bytes };
      const size =
        bytes > 1024 * 1024
          ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
          : `${Math.round(bytes / 1024)} KB`;
      console.log(`  ${layer.padEnd(16)} ${String(features.length).padStart(6)} features  ${size}`);
      if (bytes > LARGE_FILE_BYTES) {
        console.warn(`  ! ${layer} is over 10 MB: simplify it or switch it to PMTiles`);
      }
    }
    await writeJson(unlocatedFile(id), result.unlocated, { pretty: true });
    console.log(`  not on the map    ${String(result.unlocated.length).padStart(6)}`);
    counties[id] = {
      layers,
      unlocated: result.unlocated.length,
      buildDate: new Date().toISOString(),
    };
  }
}

const sources: Manifest['sources'] = { ...previous.sources };
for (const key of usedSources) {
  const s = SOURCES[key];
  sources[key] = { name: s.name, url: s.url, ...('vintage' in s ? { vintage: s.vintage } : {}) };
}
// Per-county sources: parcels (a county service or the 2018 statewide file) and park lists.
for (const id of args.counties) {
  const county = getCounty(id)!;
  const parcels = parcelSourceFor(id, county.name);
  sources[`parcels-${id}`] = { name: parcels.name, url: parcels.url, vintage: parcels.vintage };
  const parks = COUNTY_PARK_SOURCES[id];
  if (parks) sources[`county-parks-${id}`] = { name: parks.name, url: parks.url };
}

await writeManifest({
  buildDate: new Date().toISOString(),
  bbox: boundaries.bbox,
  sources,
  counties,
});
console.log('Wrote manifest.json. Done.');
