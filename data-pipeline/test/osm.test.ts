import { describe, expect, it } from 'vitest';
import {
  joinSegments,
  overpassToFeatures,
  wikipediaUrl,
  type OverpassResponse,
} from '../src/lib/osm.js';
import { classifyOsm, roadSurface, routeRef } from '../src/steps/osm.js';

const pt = (lon: number, lat: number) => ({ lon, lat });

describe('overpassToFeatures', () => {
  it('turns nodes into points, open ways into lines and closed area ways into polygons', () => {
    const response: OverpassResponse = {
      elements: [
        { type: 'node', id: 1, lat: 39.2, lon: -119.5, tags: { natural: 'spring' } },
        { type: 'way', id: 2, geometry: [pt(0, 0), pt(1, 0)], tags: { highway: 'track' } },
        {
          type: 'way',
          id: 3,
          geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)],
          tags: { leisure: 'park' },
        },
        // A closed road (a loop) stays a line.
        {
          type: 'way',
          id: 4,
          geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)],
          tags: { highway: 'residential' },
        },
      ],
    };
    const f = overpassToFeatures(response);
    expect(f.map((x) => [x.id, x.geometry.type])).toEqual([
      ['osm:node/1', 'Point'],
      ['osm:way/2', 'LineString'],
      ['osm:way/3', 'Polygon'],
      ['osm:way/4', 'LineString'],
    ]);
  });

  it('assembles multipolygon relations from member ways, inner rings included', () => {
    const response: OverpassResponse = {
      elements: [
        {
          type: 'relation',
          id: 9,
          tags: { type: 'multipolygon', natural: 'water', name: 'Lake' },
          members: [
            // The outer ring comes in two pieces, the second one reversed.
            { type: 'way', ref: 1, role: 'outer', geometry: [pt(0, 0), pt(4, 0), pt(4, 4)] },
            { type: 'way', ref: 2, role: 'outer', geometry: [pt(0, 0), pt(0, 4), pt(4, 4)] },
            {
              type: 'way',
              ref: 3,
              role: 'inner',
              geometry: [pt(1, 1), pt(2, 1), pt(2, 2), pt(1, 1)],
            },
          ],
        },
      ],
    };
    const [lake] = overpassToFeatures(response);
    expect(lake?.geometry.type).toBe('Polygon');
    const rings = lake?.geometry.type === 'Polygon' ? lake.geometry.coordinates : [];
    expect(rings).toHaveLength(2);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0]![0]).toEqual(rings[0]!.at(-1));
  });

  it('joins segments end to end in either direction', () => {
    expect(
      joinSegments([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 0],
          [1, 0],
        ],
      ]),
    ).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ]);
  });

  it('builds Wikipedia URLs from the wikipedia tag', () => {
    expect(wikipediaUrl('en:Fort Churchill State Historic Park')).toBe(
      'https://en.wikipedia.org/wiki/Fort_Churchill_State_Historic_Park',
    );
  });
});

describe('road classification', () => {
  it('reads the surface category from surface, tracktype and 4wd tags', () => {
    expect(roadSurface({ highway: 'residential', surface: 'asphalt' })).toBe('paved');
    expect(roadSurface({ highway: 'track', surface: 'compacted' })).toBe('gravel');
    expect(roadSurface({ highway: 'track', tracktype: 'grade4' })).toBe('dirt');
    expect(roadSurface({ highway: 'track', '4wd_only': 'yes', surface: 'dirt' })).toBe('4x4');
    expect(roadSurface({ highway: 'primary' })).toBe('paved');
    expect(roadSurface({ highway: 'track' })).toBe('unknown');
  });

  it('normalizes route numbers', () => {
    expect(routeRef('NV 341')).toBe('SR 341');
    expect(routeRef('US 50;US 95A')).toBe('US 50, US 95A');
    expect(routeRef('I 80')).toBe('I-80');
  });

  it('sorts features into layers, and puts Lincoln Highway roads in historic trails too', () => {
    const f = (id: string, tags: Record<string, string>) => ({
      type: 'Feature' as const,
      id,
      properties: tags,
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    });
    const drafts = classifyOsm([
      f('osm:way/1', { highway: 'secondary', name: 'Lincoln Highway', ref: 'US 50' }),
      f('osm:node/2', { place: 'town', name: 'Yerington' }),
      f('osm:node/3', { leisure: 'pitch', sport: 'baseball' }),
      f('osm:node/4', { historic: 'archaeological_site', site_type: 'petroglyphs' }),
      f('osm:node/5', { natural: 'hot_spring' }),
      f('osm:node/6', { historic: 'memorial', memorial: 'plaque', name: 'A plaque' }),
      f('osm:node/7', { 'abandoned:place': 'town', name: 'Ramsey' }),
    ]);
    expect(drafts.map((d) => `${d.layer}/${d.kind}/${d.name}`)).toEqual([
      'streets/highway/Lincoln Highway',
      'historic-trails/lincoln-highway/Lincoln Highway',
      'towns/town/Yerington',
      'parks/sports-field/Baseball field',
      'notable/petroglyph/Petroglyph site',
      'nature/hot-spring/Hot spring',
      'ghost-towns/ghost-town/Ramsey',
    ]);
    expect(drafts.find((d) => d.kind === 'sports-field')?.named).toBe(false);
  });
});
