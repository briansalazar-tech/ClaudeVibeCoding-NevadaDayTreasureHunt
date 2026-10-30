/**
 * Downloads raw source data into data-pipeline/raw/ (cached; pass --force to re-download).
 *   npm run data:fetch -- --county lyon   (or --all)
 */
import { parseArgs } from './lib/args.js';
import { fetchBoundaries } from './steps/boundaries.js';

const args = parseArgs(process.argv.slice(2));

console.log('Fetching county boundaries');
await fetchBoundaries({ force: args.force });

// Per-county layer sources are added in Phase 2.
console.log('Done.');
