import { describe, expect, it } from 'vitest';
import { COUNTIES, STATE_FIPS, countyDisplayName, getCounty, isCountyId } from './counties.js';

describe('county config', () => {
  it('lists the eight hunt counties', () => {
    expect(COUNTIES.map((c) => c.name)).toEqual([
      'Carson City',
      'Churchill',
      'Douglas',
      'Lyon',
      'Mineral',
      'Pershing',
      'Storey',
      'Washoe',
    ]);
  });

  it('has unique ids and Nevada FIPS codes', () => {
    expect(new Set(COUNTIES.map((c) => c.id)).size).toBe(COUNTIES.length);
    expect(new Set(COUNTIES.map((c) => c.fips)).size).toBe(COUNTIES.length);
    for (const c of COUNTIES) {
      expect(c.fips).toMatch(/^\d{5}$/);
      expect(c.fips.startsWith(STATE_FIPS)).toBe(true);
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('looks counties up by id', () => {
    expect(getCounty('lyon')?.seat).toBe('Yerington');
    expect(getCounty('clark')).toBeUndefined();
    expect(isCountyId('storey')).toBe(true);
    expect(isCountyId('clark')).toBe(false);
  });

  it('treats Carson City as a county without the suffix', () => {
    expect(countyDisplayName({ name: 'Carson City' })).toBe('Carson City');
    expect(countyDisplayName({ name: 'Lyon' })).toBe('Lyon County');
  });
});
