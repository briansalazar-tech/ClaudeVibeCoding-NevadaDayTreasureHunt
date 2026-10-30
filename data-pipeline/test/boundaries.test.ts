import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { COUNTIES } from '@hunt/shared';
import { buildBoundaryData, type CensusCountyProps } from '../src/steps/boundaries.js';

const [carson, churchill] = COUNTIES;

function square(geoid: string, x: number, y: number): Feature<Polygon, CensusCountyProps> {
  return {
    type: 'Feature',
    properties: { GEOID: geoid, NAME: geoid, ALAND: 100, AWATER: 5 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
          [x, y],
        ],
      ],
    },
  };
}

// Two adjacent squares for the configured counties, plus one county that isn't in the hunt.
const census = [
  square(carson.fips, -120, 39),
  square(churchill.fips, -119, 39),
  square('32003', -116, 36),
];

describe('buildBoundaryData', () => {
  const data = buildBoundaryData(census, [carson, churchill]);

  it('keeps only configured counties, keyed by config id', () => {
    expect(data.counties.features.map((f) => f.id)).toEqual(['carson-city', 'churchill']);
    expect(data.counties.features[0]?.properties).toMatchObject({
      name: 'Carson City',
      seat: 'Carson City',
      landArea: 100,
      waterArea: 5,
      bbox: [-120, 39, -119, 40],
    });
  });

  it('puts each label inside its county', () => {
    for (const label of data.labels.features) {
      const bbox = data.counties.features.find((f) => f.id === label.id)!.properties.bbox;
      const [x = 0, y = 0] = label.geometry.coordinates;
      expect(x).toBeGreaterThan(bbox[0]);
      expect(x).toBeLessThan(bbox[2]);
      expect(y).toBeGreaterThan(bbox[1]);
      expect(y).toBeLessThan(bbox[3]);
    }
  });

  it('builds a world mask with one hole covering the merged counties', () => {
    const geom = data.outsideMask.geometry;
    expect(geom.type).toBe('Polygon');
    if (geom.type !== 'Polygon') return;
    expect(geom.coordinates).toHaveLength(2);
    const hole = geom.coordinates[1]!;
    const xs = hole.map((p) => p[0]!);
    expect(Math.min(...xs)).toBe(-120);
    expect(Math.max(...xs)).toBe(-118);
  });

  it('reports the combined bounding box', () => {
    expect(data.bbox).toEqual([-120, 39, -118, 40]);
  });

  it('fails loudly when a configured county is missing from the source', () => {
    expect(() => buildBoundaryData(census.slice(1), [carson, churchill])).toThrow(/Carson City/);
  });
});
