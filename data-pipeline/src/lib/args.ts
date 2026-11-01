import { COUNTIES, type CountyId, isCountyId } from '@hunt/shared';

/** Per-county fetch steps that `--skip` can leave out. */
export const FETCH_STEPS = ['osm', 'parcels', 'county-parks', 'register', 'ghost-towns'] as const;
export type FetchStep = (typeof FETCH_STEPS)[number];

export interface PipelineArgs {
  /** Counties whose per-county layers to process. Boundaries always cover every county. */
  counties: CountyId[];
  /** Re-download files that are already cached in raw/. */
  force: boolean;
  /** Fetch steps to leave out, e.g. `osm` while the Overpass server is overloaded. */
  skip: FetchStep[];
}

function isFetchStep(value: string): value is FetchStep {
  return (FETCH_STEPS as readonly string[]).includes(value);
}

/** Reads the value of `--name value` or `--name=value`, advancing past it. */
function optionValue(argv: readonly string[], i: number, name: string): [string, number] {
  const arg = argv[i]!;
  const value = arg === name ? argv[i + 1] : arg.slice(name.length + 1);
  if (!value) throw new Error(`${name} needs a value`);
  return [value, arg === name ? i + 1 : i];
}

/** Parses `--county lyon` (repeatable, or comma-separated), `--all`, `--force`, and `--skip osm`. */
export function parseArgs(argv: readonly string[]): PipelineArgs {
  const counties = new Set<CountyId>();
  const skip = new Set<FetchStep>();
  let all = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') all = true;
    else if (arg === '--force') force = true;
    else if (arg === '--county' || arg?.startsWith('--county=')) {
      if (arg === '--county' && !argv[i + 1]) throw new Error('--county needs a county id');
      const [value, next] = optionValue(argv, i, '--county');
      i = next;
      for (const id of value.split(',')) {
        if (!isCountyId(id)) {
          throw new Error(`Unknown county "${id}". Known: ${COUNTIES.map((c) => c.id).join(', ')}`);
        }
        counties.add(id);
      }
    } else if (arg === '--skip' || arg?.startsWith('--skip=')) {
      const [value, next] = optionValue(argv, i, '--skip');
      i = next;
      for (const step of value.split(',')) {
        if (!isFetchStep(step)) {
          throw new Error(`Unknown step "${step}". Known: ${FETCH_STEPS.join(', ')}`);
        }
        skip.add(step);
      }
    } else {
      throw new Error(`Unknown argument "${arg}"`);
    }
  }
  return { counties: all ? COUNTIES.map((c) => c.id) : [...counties], force, skip: [...skip] };
}
