import { describe, expect, it } from 'vitest';
import { clipArea, clipGeometry } from '../src/lib/clip.js';
import { normalizeName, titleCase } from '../src/lib/names.js';
import { finalizeDrafts, type LayerDraft } from '../src/lib/place.js';
import { gnisDrafts, parseGnis } from '../src/steps/gnis.js';
import { parseGhostTownList } from '../src/steps/ghost-towns.js';
import { publicOwnerType } from '../src/steps/land.js';
import { markerDrafts, matchHmdb, parseHmdbCsv, type ShpoMarker } from '../src/steps/markers.js';
import { parseNrhpRows, parseStateRegisterItems, registerDrafts } from '../src/steps/register.js';

const square = clipArea({
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
});

describe('clipping to a county', () => {
  it('keeps points inside and drops points outside', () => {
    expect(clipGeometry({ type: 'Point', coordinates: [5, 5] }, square)).not.toBeNull();
    expect(clipGeometry({ type: 'Point', coordinates: [15, 5] }, square)).toBeNull();
  });

  it('cuts a line at the boundary and keeps the inside piece', () => {
    const g = clipGeometry(
      {
        type: 'LineString',
        coordinates: [
          [5, 5],
          [15, 5],
        ],
      },
      square,
    );
    expect(g?.type).toBe('LineString');
    const coords = g?.type === 'LineString' ? g.coordinates : [];
    expect(coords[0]).toEqual([5, 5]);
    expect(coords.at(-1)![0]).toBeCloseTo(10);
  });

  it('intersects polygons that straddle the boundary', () => {
    const g = clipGeometry(
      {
        type: 'Polygon',
        coordinates: [
          [
            [8, 8],
            [12, 8],
            [12, 12],
            [8, 12],
            [8, 8],
          ],
        ],
      },
      square,
    );
    const xs = g?.type === 'Polygon' ? g.coordinates[0]!.map((p) => p[0]!) : [];
    expect(Math.max(...xs)).toBeCloseTo(10);
  });

  it('finalizes drafts: drops outside ones and adds a representative point to lines', () => {
    const drafts: LayerDraft[] = [
      {
        id: 'a',
        layer: 'nature',
        kind: 'river',
        name: 'Carson River',
        named: true,
        source: 't',
        geometry: {
          type: 'LineString',
          coordinates: [
            [1, 1],
            [2, 2],
            [3, 3],
          ],
        },
      },
      {
        id: 'b',
        layer: 'nature',
        kind: 'spring',
        name: 'Far Spring',
        named: true,
        source: 't',
        geometry: { type: 'Point', coordinates: [20, 20] },
      },
    ];
    const out = finalizeDrafts(drafts, 'lyon', square);
    expect(out).toHaveLength(1);
    expect(out[0]?.properties).toMatchObject({ id: 'a', county: 'lyon', lng: 2, lat: 2 });
  });
});

describe('names', () => {
  it('matches names regardless of case, punctuation and abbreviations', () => {
    expect(normalizeName('Mt. Davidson')).toBe(normalizeName('Mount Davidson'));
    expect(normalizeName("Buckland's Station")).toBe('bucklands station');
  });

  it('title-cases names published in capitals', () => {
    expect(titleCase('SILVER SPRINGS PARK')).toBe('Silver Springs Park');
    expect(titleCase('YERINGTON, CITY OF')).toBe('Yerington, City of');
  });
});

describe('GNIS', () => {
  const text = [
    'feature_id|feature_name|feature_class|state_name|state_numeric|county_name|county_numeric|map_name|date_created|date_edited|bgn_type|bgn_authority|bgn_date|prim_lat_dms|prim_long_dms|prim_lat_dec|prim_long_dec',
    '1|Mud Spring|Spring|Nevada|32|Lyon|019|x||||||||39.1|-119.2',
    '2|Sixmile Canyon|Valley|Nevada|32|Lyon|019|x||||||||39.2|-119.3',
    '3|Lost Mine|Mine|Nevada|32|Lyon|019|x||||||||39.3|-119.4',
    '4|Unknown Spring|Spring|Nevada|32|Lyon|019|x||||||||0|0',
  ].join('\n');

  it('parses the file and skips names without a location', () => {
    expect(parseGnis(text).map((n) => n.id)).toEqual(['1', '2', '3']);
  });

  it('adds wanted classes and skips duplicates of OSM features', () => {
    const osm: LayerDraft[] = [
      {
        id: 'osm:node/9',
        layer: 'nature',
        kind: 'spring',
        name: 'Mud Spring',
        named: true,
        source: 'OSM',
        geometry: { type: 'Point', coordinates: [-119.201, 39.101] },
      },
    ];
    const { drafts, duplicates } = gnisDrafts(parseGnis(text), osm);
    expect(duplicates).toBe(1);
    expect(drafts.map((d) => [d.id, d.kind])).toEqual([['gnis:2', 'canyon']]);
  });
});

describe('public-owner parcels', () => {
  it('recognizes public owners and leaves private ones alone', () => {
    expect(publicOwnerType('LYON COUNTY')).toBe('parcel-county');
    expect(publicOwnerType('LYON COUNTY SCHOOL DISTRICT')).toBe('parcel-school');
    expect(publicOwnerType('YERINGTON, CITY OF')).toBe('parcel-city');
    expect(publicOwnerType('NEVADA, STATE OF')).toBe('parcel-state');
    expect(publicOwnerType('UNITED STATES OF AMERICA')).toBe('parcel-federal');
    expect(publicOwnerType('INDIAN HILLS G I D')).toBe('parcel-gid');
    expect(publicOwnerType('SWANSON, CALVIN ET AL')).toBeUndefined();
  });
});

describe('markers', () => {
  const csv = [
    'MarkerID,Title,Subtitle,Erected By,Latitude,Longitude,Link',
    '143635,Dayton,,State Historic Preservation Office,39.23615,-119.58940,https://www.hmdb.org/m.asp?m=143635',
    '169820,Hoye\'s Store,,"Wellington, NV",38.75672,-119.37728,https://www.hmdb.org/m.asp?m=169820',
  ].join('\n');

  it('parses an HMdb CSV download', () => {
    const m = parseHmdbCsv(csv);
    expect(m.map((x) => [x.id, x.title])).toEqual([
      ['143635', 'Dayton'],
      ['169820', "Hoye's Store"],
    ]);
  });

  it('links state markers to their HMdb entry and keeps the rest as HMdb markers', () => {
    const shpo: ShpoMarker[] = [
      {
        node_id: 1,
        slug: 'dayton',
        title: 'Dayton',
        latitude: '39.236131',
        longitude: '-119.589355',
        city: 'Dayton',
        county: 'Lyon County',
        marker_number: '7',
      },
      {
        node_id: 2,
        slug: 'nowhere',
        title: 'Nowhere',
        latitude: '',
        longitude: '',
        city: '',
        county: 'Lyon County',
        marker_number: '999',
      },
    ];
    const hmdb = parseHmdbCsv(csv);
    expect(matchHmdb({ title: 'Dayton', lat: 39.236131, lng: -119.589355 }, hmdb)?.id).toBe(
      '143635',
    );
    const { drafts, unlocated } = markerDrafts(shpo, hmdb, 'Lyon');
    expect(drafts.map((d) => [d.id, d.layer, d.hmdb])).toEqual([
      ['shpo:7', 'state-markers', 'https://www.hmdb.org/m.asp?m=143635'],
      ['hmdb:169820', 'markers', 'https://www.hmdb.org/m.asp?m=169820'],
    ]);
    expect(drafts[0]?.shpo).toBe(
      'https://shpo.nv.gov/nevadas-historical-markers/historical-markers/dayton',
    );
    expect(unlocated.map((u) => u.id)).toEqual(['shpo:999']);
  });

  it('matches by marker number when it is nearby, even if the titles differ', () => {
    const numbered = parseHmdbCsv(
      [
        'MarkerID,Marker No.,Title,Latitude (minus=S),Longitude (minus=W)',
        '69688,163,Chinatown,39.23627,-119.58931',
        '160799,1,Where Nevada Began,39.23642,-119.59004',
      ].join('\n'),
    );
    expect(numbered.map((m) => m.number)).toEqual(['163', '1']);
    const at = { lat: 39.236036, lng: -119.589379 };
    expect(matchHmdb({ title: 'Dayton Chinatown', number: '163', ...at }, numbered)?.id).toBe(
      '69688',
    );
    // State marker 1 is in Carson City; Dayton's Forest Service sign no. 1 is a different marker.
    expect(
      matchHmdb(
        { title: 'Empire and the Carson River Mills', number: '1', lat: 39.187, lng: -119.706 },
        numbered,
      ),
    ).toBeUndefined();
  });
});

describe('register sites', () => {
  const wikitext = `
{{NRHP row
|pos=1
|refnum=97001546
|article=Buckland Station
|name=Buckland Station
|address=7 miles south of [[U.S. Route 50 (Nevada)|U.S. Route 50]]
|city=[[Silver Springs, Nevada|Silver Springs]]
|date=1997-12-29
|lat=39.294444
|lon=-119.250556
}}
{{NRHP row
|pos=2
|refnum=80002468
|name=East Walker River Petroglyph Site
|address=Address Restricted
|city=Yerington vicinity
|date=1980-07-24
|lat=
|lon=
}}`;

  it('parses Wikipedia NRHP rows', () => {
    const rows = parseNrhpRows(wikitext);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      refnum: '97001546',
      name: 'Buckland Station',
      lat: 39.294444,
      address: '7 miles south of U.S. Route 50',
    });
    expect(rows[1]?.lat).toBeUndefined();
  });

  it('rebuilds State Register rows from positioned PDF text', () => {
    const items = [
      ['County', 218, 21],
      ['City / Town', 218, 102],
      ['Resource Name', 218, 183],
      ['Address', 218, 331],
      ['SHRP', 204, 482],
      ['Date Listed', 218, 482],
      ['SRIS #', 218, 542],
      ['NRHP', 204, 605],
      ['Listed', 218, 605],
      ['NRHP', 204, 641],
      ['Date Listed', 218, 641],
      ['NRIS #', 218, 707],
      ['Lyon', 233, 21],
      ['Fernley', 233, 102],
      ['Caples House', 233, 183],
      ['175 Silver St.', 233, 332],
      ['9/18/2000', 233, 482],
      ['000111', 233, 542],
      ['No', 233, 605],
      ['Lyon', 260, 21],
      ['Silver Springs', 260, 102],
      ['Buckland Station', 260, 183],
      ['US 95A', 260, 332],
      ['12/28/1998 980099', 260, 482],
      ['Yes', 260, 605],
      ['12/29/1997', 260, 641],
      ['97001546', 259, 707],
      ['(Wraps)', 273, 183],
    ].map(([text, row, col]) => ({ text: text as string, row: row as number, col: col as number }));
    const rows = parseStateRegisterItems(items);
    expect(rows).toEqual([
      {
        county: 'Lyon',
        city: 'Fernley',
        name: 'Caples House',
        address: '175 Silver St.',
        listed: '9/18/2000',
        sris: '000111',
        nrhp: false,
        nris: undefined,
      },
      {
        county: 'Lyon',
        city: 'Silver Springs',
        name: 'Buckland Station (Wraps)',
        address: 'US 95A',
        listed: '12/28/1998',
        sris: '980099',
        nrhp: true,
        nris: '97001546',
      },
    ]);
  });

  it('places NRHP sites with coordinates and lists the rest as not on the map', () => {
    const state = [
      {
        county: 'Lyon',
        city: 'Fernley',
        name: 'Caples House',
        address: '175 Silver St.',
        listed: '9/18/2000',
        sris: '000111',
        nrhp: false,
      },
      {
        county: 'Lyon',
        city: 'Silver Springs',
        name: 'Buckland Station',
        address: '',
        sris: '980099',
        nrhp: true,
        nris: '97001546',
      },
    ];
    const { drafts, unlocated } = registerDrafts(parseNrhpRows(wikitext), state);
    expect(drafts.map((d) => d.id)).toEqual(['nrhp:97001546']);
    expect(drafts[0]?.detail).toContain('State Register');
    expect(unlocated.map((u) => [u.id, u.reason])).toEqual([
      ['nrhp:80002468', 'Location confidential (archaeological site)'],
      ['srhp:000111', 'State Register lists no coordinates'],
    ]);
  });
});

describe('ghost towns', () => {
  it('parses the Wikipedia list table', () => {
    const wikitext = `{| class="wikitable sortable"
|-
!Town
!Other names|| class="unsortable" |Image||County||Established||Disestablished||Status||Notes
|-
|[[Como, Nevada|Como]]
| ||[[File:Como.jpg|100px]] ||[[Lyon County, Nevada|Lyon]]||1861||1930s|| ||Mining town.
|-
|[[Aurora, Nevada|Aurora]]
| ||[[Image:Aurora NV.jpg|100px]]||[[Mineral County, Nevada|Mineral]]||1860|| ||Neglected site||Notes
|}`;
    expect(parseGhostTownList(wikitext)).toEqual([
      {
        name: 'Como',
        article: 'Como, Nevada',
        counties: ['Lyon'],
        established: '1861',
        status: undefined,
      },
      {
        name: 'Aurora',
        article: 'Aurora, Nevada',
        counties: ['Mineral'],
        established: '1860',
        status: 'Neglected site',
      },
    ]);
  });
});
