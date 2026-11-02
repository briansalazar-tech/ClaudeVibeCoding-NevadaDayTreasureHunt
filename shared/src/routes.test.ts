import { describe, expect, it } from 'vitest';
import { canonicalRoute, parseRouteQuery, routeMatches, splitRefs } from './routes.js';

describe('canonicalRoute', () => {
  it('reads the ways people write state, US and interstate routes', () => {
    for (const t of ['SR 341', 'sr341', 'NV-341', 'NV 341', 'State Route 341', 'Nevada 341']) {
      expect(canonicalRoute(t), t).toBe('SR 341');
    }
    for (const t of ['US 50', 'us-50', 'U.S. 50', 'US Highway 50', 'US Route 50']) {
      expect(canonicalRoute(t), t).toBe('US 50');
    }
    for (const t of ['I-80', 'I 80', 'i80', 'Interstate 80', 'IH 80']) {
      expect(canonicalRoute(t), t).toBe('I-80');
    }
  });

  it('keeps suffixes and old routes', () => {
    expect(canonicalRoute('US 95A')).toBe('US 95 ALT');
    expect(canonicalRoute('US 95 ALT')).toBe('US 95 ALT');
    expect(canonicalRoute('I-80 BUS')).toBe('I-80 BUS');
    expect(canonicalRoute('US 40 Old')).toBe('Old US 40');
    expect(canonicalRoute('Old US 40')).toBe('Old US 40');
    expect(canonicalRoute('SR 2C')).toBe('SR 2C');
    expect(canonicalRoute('FR 22202')).toBe('FR 22202');
  });

  it('rejects names and bare numbers', () => {
    for (const t of ['Geiger Grade Road', '49', 'Summit Ridge Drive', 'USA Parkway']) {
      expect(canonicalRoute(t), t).toBeNull();
    }
  });
});

describe('route search', () => {
  it('splits an OSM ref into canonical routes', () => {
    expect(splitRefs('US 395 BUS, SR 341, SR 431')).toEqual(['US 395 BUS', 'SR 341', 'SR 431']);
    expect(splitRefs('US 50A, US 95A')).toEqual(['US 50 ALT', 'US 95 ALT']);
    expect(splitRefs('49')).toEqual([]);
  });

  it('reads route queries, including the ambiguous "Highway 50"', () => {
    expect(parseRouteQuery('SR 341')).toEqual(['SR 341']);
    expect(parseRouteQuery('Hwy 50')).toEqual(['US 50', 'SR 50']);
    expect(parseRouteQuery('Fort Churchill')).toBeNull();
  });

  it('matches a route and its variants, not other numbers', () => {
    expect(routeMatches('US 95 ALT', 'US 95')).toBe(true);
    expect(routeMatches('US 95', 'US 95')).toBe(true);
    expect(routeMatches('US 950', 'US 95')).toBe(false);
  });
});
