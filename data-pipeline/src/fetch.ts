/**
 * Downloads raw source data into data-pipeline/raw/ (cached; pass --force to re-download).
 *   npm run data:fetch -- --county lyon   (or --all)
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getCounty } from '@hunt/shared';
import { parseArgs } from './lib/args.js';
import { readCountyAreas } from './lib/counties.js';
import { hasRaw } from './lib/download.js';
import { fetchBoundaries, buildBoundaries } from './steps/boundaries.js';
import { fetchCountyParks } from './steps/county-parks.js';
import { fetchGhostTowns } from './steps/ghost-towns.js';
import { fetchGnis } from './steps/gnis.js';
import { fetchParcels, fetchSma } from './steps/land.js';
import { fetchShpoMarkers, hmdbInstructions } from './steps/markers.js';
import { fetchNpsTrails } from './steps/nps-trails.js';
import { fetchOsm } from './steps/osm.js';
import { fetchRegister } from './steps/register.js';
import { hmdbRawFile } from './sources.js';

const envFile = path.join(import.meta.dirname, '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = parseArgs(process.argv.slice(2));
const { force } = args;

console.log('Fetching county boundaries');
await fetchBoundaries({ force });
const areas = await readCountyAreas().catch(async () => {
  // First run: the per-county steps need the built boundaries for their bounding boxes.
  await buildBoundaries();
  return readCountyAreas();
});

if (args.counties.length) {
  console.log('Fetching statewide sources');
  await fetchGnis({ force });
  await fetchShpoMarkers({ force });
  await fetchSma({ force });
  const all = [...areas.values()].map((a) => a.feature.properties.bbox);
  const huntBbox: [number, number, number, number] = [
    Math.min(...all.map((b) => b[0])),
    Math.min(...all.map((b) => b[1])),
    Math.max(...all.map((b) => b[2])),
    Math.max(...all.map((b) => b[3])),
  ];
  await fetchNpsTrails(huntBbox, { force });
}

const missingHmdb: string[] = [];
for (const id of args.counties) {
  const county = getCounty(id)!;
  const area = areas.get(id)!;
  console.log(`Fetching ${county.name}`);
  await fetchOsm(id, area.feature.properties.bbox, { force });
  await fetchParcels(id, county.name, { force });
  await fetchCountyParks(id, { force });
  await fetchRegister(id, county.name, { force });
  await fetchGhostTowns(id, county.name, { force });
  if (!hasRaw(hmdbRawFile(id))) missingHmdb.push(hmdbInstructions(county.name, id));
}

if (missingHmdb.length) {
  console.log(`\nManual downloads still needed:\n${missingHmdb.join('\n\n')}`);
}
console.log('Done.');
