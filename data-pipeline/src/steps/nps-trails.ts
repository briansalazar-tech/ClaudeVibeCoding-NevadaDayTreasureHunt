/**
 * NPS National Historic Trails: the California Trail and the Pony Express, downloaded once for
 * the whole hunt area. (The Lincoln Highway comes from OSM road names; see osm.ts.)
 */
import type { BBox } from '@hunt/shared';
import type { FeatureCollection, Geometry } from 'geojson';
import { queryArcgisLayer } from '../lib/arcgis.js';
import { cachedJson, readRawJson } from '../lib/download.js';
import type { LayerDraft } from '../lib/place.js';
import { SOURCES } from '../sources.js';

const TRAILS = [
  {
    source: SOURCES.californiaTrail,
    idPrefix: 'nps:cali',
    kind: 'california-trail',
    name: 'California Trail',
  },
  {
    source: SOURCES.ponyExpress,
    idPrefix: 'nps:poex',
    kind: 'pony-express',
    name: 'Pony Express Trail',
  },
] as const;

type TrailCollection = FeatureCollection<Geometry | null, Record<string, unknown>>;

export async function fetchNpsTrails(huntBbox: BBox, { force = false } = {}): Promise<void> {
  for (const t of TRAILS) {
    await cachedJson(t.source.rawFile, { force }, () => {
      console.log(`  query    ${t.source.url}`);
      return queryArcgisLayer(t.source.url, { bbox: huntBbox, outFields: ['OBJECTID'] });
    });
  }
}

/** One draft per trail segment. The NPS files carry no branch names, so all segments share one. */
export function npsTrailDrafts(
  trail: (typeof TRAILS)[number],
  collection: TrailCollection,
): LayerDraft[] {
  return collection.features.flatMap((f) => {
    if (!f.geometry) return [];
    const oid = f.properties?.OBJECTID ?? f.id;
    if (typeof oid !== 'string' && typeof oid !== 'number') return [];
    return [
      {
        id: `${trail.idPrefix}:${String(oid)}`,
        layer: 'historic-trails' as const,
        kind: trail.kind,
        name: trail.name,
        named: true,
        geometry: f.geometry,
        source: 'National Park Service',
      },
    ];
  });
}

export async function readNpsTrailDrafts(): Promise<LayerDraft[]> {
  const out: LayerDraft[] = [];
  for (const t of TRAILS)
    out.push(...npsTrailDrafts(t, await readRawJson<TrailCollection>(t.source.rawFile)));
  return out;
}
