/**
 * Processes raw data into client/public/data/ and updates manifest.json.
 *   npm run data:build -- --county lyon   (or --all)
 */
import { COUNTIES, type Manifest } from '@hunt/shared';
import { parseArgs } from './lib/args.js';
import { readManifest, writeManifest } from './lib/manifest.js';
import { SOURCES } from './sources.js';
import { buildBoundaries } from './steps/boundaries.js';

parseArgs(process.argv.slice(2));
const previous = await readManifest();

console.log('Building county boundaries');
const boundaries = await buildBoundaries();

// Per-county layers are added in Phase 2; keep counts already recorded for other counties.
const counties: Manifest['counties'] = {};
for (const c of COUNTIES) counties[c.id] = previous.counties?.[c.id] ?? { layers: {} };

const { name, url, vintage } = SOURCES.censusCounties;
await writeManifest({
  buildDate: new Date().toISOString(),
  bbox: boundaries.bbox,
  sources: { ...previous.sources, censusCounties: { name, url, vintage } },
  counties,
});
console.log('Wrote manifest.json. Done.');
