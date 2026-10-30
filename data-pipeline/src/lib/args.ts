import { COUNTIES, type CountyId, isCountyId } from '@hunt/shared';

export interface PipelineArgs {
  /** Counties whose per-county layers to process. Boundaries always cover every county. */
  counties: CountyId[];
  /** Re-download files that are already cached in raw/. */
  force: boolean;
}

/** Parses `--county lyon` (repeatable, or comma-separated), `--all`, and `--force`. */
export function parseArgs(argv: readonly string[]): PipelineArgs {
  const counties = new Set<CountyId>();
  let all = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') all = true;
    else if (arg === '--force') force = true;
    else if (arg === '--county' || arg?.startsWith('--county=')) {
      const value = arg === '--county' ? argv[++i] : arg.slice('--county='.length);
      if (!value) throw new Error('--county needs a county id');
      for (const id of value.split(',')) {
        if (!isCountyId(id)) {
          throw new Error(`Unknown county "${id}". Known: ${COUNTIES.map((c) => c.id).join(', ')}`);
        }
        counties.add(id);
      }
    } else {
      throw new Error(`Unknown argument "${arg}"`);
    }
  }
  return { counties: all ? COUNTIES.map((c) => c.id) : [...counties], force };
}
