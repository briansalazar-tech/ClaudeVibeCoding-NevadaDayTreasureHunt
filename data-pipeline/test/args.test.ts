import { describe, expect, it } from 'vitest';
import { COUNTIES } from '@hunt/shared';
import { parseArgs } from '../src/lib/args.js';

describe('parseArgs', () => {
  it('defaults to no counties and no force', () => {
    expect(parseArgs([])).toEqual({ counties: [], force: false, skip: [] });
  });

  it('accepts --skip with one or more fetch steps', () => {
    expect(parseArgs(['--all', '--skip', 'osm']).skip).toEqual(['osm']);
    expect(parseArgs(['--skip=osm,parcels']).skip).toEqual(['osm', 'parcels']);
    expect(() => parseArgs(['--skip', 'hmdb'])).toThrow(/Unknown step "hmdb"/);
    expect(() => parseArgs(['--skip'])).toThrow(/needs a value/);
  });

  it('accepts --county in several forms', () => {
    expect(parseArgs(['--county', 'lyon']).counties).toEqual(['lyon']);
    expect(parseArgs(['--county=lyon,storey']).counties).toEqual(['lyon', 'storey']);
    expect(parseArgs(['--county', 'lyon', '--county', 'lyon']).counties).toEqual(['lyon']);
  });

  it('expands --all to every configured county', () => {
    expect(parseArgs(['--all', '--force'])).toEqual({
      counties: COUNTIES.map((c) => c.id),
      force: true,
      skip: [],
    });
  });

  it('rejects unknown counties and arguments', () => {
    expect(() => parseArgs(['--county', 'clark'])).toThrow(/Unknown county "clark"/);
    expect(() => parseArgs(['--county'])).toThrow(/needs a county id/);
    expect(() => parseArgs(['--fast'])).toThrow(/Unknown argument/);
  });
});
