/**
 * Official county park lists (Lyon's park parcels, Washoe's Regional Parks and Open Spaces),
 * added to the Parks layer where OSM doesn't already have the park.
 */
import type { CountyId } from '@hunt/shared';
import type { FeatureCollection, Geometry } from 'geojson';
import { queryArcgisLayer } from '../lib/arcgis.js';
import { cachedJson, hasRaw, readRawJson } from '../lib/download.js';
import { titleCase } from '../lib/names.js';
import type { LayerDraft } from '../lib/place.js';
import { COUNTY_PARK_SOURCES, type CountyParkSource } from '../sources.js';

type Collection = FeatureCollection<Geometry | null, Record<string, unknown>>;

function rawFile(county: CountyId): string {
  return `county-parks/${county}.json`;
}

export async function fetchCountyParks(county: CountyId, { force = false } = {}): Promise<void> {
  const src = COUNTY_PARK_SOURCES[county];
  if (!src) return;
  await cachedJson(rawFile(county), { force }, () => {
    console.log(`  query    ${src.name}`);
    return queryArcgisLayer(src.url, { where: src.where });
  });
}

export function countyParkDrafts(
  county: CountyId,
  src: CountyParkSource,
  parks: Collection,
): LayerDraft[] {
  return parks.features.flatMap((f, i) => {
    if (!f.geometry) return [];
    const p = f.properties ?? {};
    const raw = p[src.nameField];
    const name = typeof raw === 'string' && raw.trim() ? titleCase(raw.trim()) : undefined;
    const rawKey = p.APN ?? p.FAC_ID ?? p.OBJECTID;
    const key = typeof rawKey === 'string' || typeof rawKey === 'number' ? rawKey : i;
    const detail = src.detailFields
      .map((k) => p[k])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => titleCase(v))
      .join(' · ');
    return [
      {
        id: `county-parks:${county}:${String(key)}`,
        layer: 'parks' as const,
        kind: 'park',
        name: name ?? 'Park',
        named: Boolean(name),
        geometry: f.geometry,
        detail: detail || undefined,
        source: src.name,
      },
    ];
  });
}

export async function readCountyParks(county: CountyId): Promise<LayerDraft[]> {
  const src = COUNTY_PARK_SOURCES[county];
  if (!src || !hasRaw(rawFile(county))) return [];
  return countyParkDrafts(county, src, await readRawJson<Collection>(rawFile(county)));
}
