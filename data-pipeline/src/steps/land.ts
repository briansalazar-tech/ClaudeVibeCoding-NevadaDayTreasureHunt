/**
 * Land ownership: BLM Surface Management Agency polygons (one statewide multipolygon per
 * agency, clipped per county), with public-owner parcels laid on top. The SMA marks county and
 * city land as Private, so the parcels are what show it as public.
 */
import { landKindName, type CountyId, type LandKind } from '@hunt/shared';
import type { FeatureCollection, Geometry } from 'geojson';
import { queryArcgisLayer } from '../lib/arcgis.js';
import { cachedJson, hasRaw, readRawJson } from '../lib/download.js';
import { titleCase } from '../lib/names.js';
import type { LayerDraft } from '../lib/place.js';
import { PARCEL_SOURCES, SOURCES, statewideParcelSource, type ParcelSource } from '../sources.js';

export const SMA_AGENCIES = [
  'BLM',
  'FS',
  'NVST',
  'BR',
  'FWS',
  'NPS',
  'BIA',
  'DOD',
  'DOE',
  'WTR',
  'PVT',
] as const;

type Collection = FeatureCollection<Geometry | null, Record<string, unknown>>;

function smaFile(abbr: string): string {
  return `${SOURCES.blmSma.rawDir}/${abbr.toLowerCase()}.json`;
}

export async function fetchSma({ force = false } = {}): Promise<void> {
  for (const abbr of SMA_AGENCIES) {
    await cachedJson(smaFile(abbr), { force }, () => {
      console.log(`  query    BLM SMA ${abbr}`);
      return queryArcgisLayer(SOURCES.blmSma.url, {
        where: `ABBR = '${abbr}'`,
        outFields: ['NAME', 'ABBR'],
      });
    });
  }
}

/** SMA drafts for one county. Ids are per agency (`sma:BLM`), since each agency is one polygon. */
export async function readSmaDrafts(): Promise<LayerDraft[]> {
  const drafts: LayerDraft[] = [];
  for (const abbr of SMA_AGENCIES) {
    const c = await readRawJson<Collection>(smaFile(abbr));
    for (const f of c.features) {
      if (!f.geometry) continue;
      drafts.push({
        id: `sma:${abbr}`,
        layer: 'land',
        kind: abbr,
        name: landKindName(abbr),
        named: true,
        geometry: f.geometry,
        owner: landKindName(abbr),
        source: 'BLM Surface Management Agency',
      });
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------------------------
// Public-owner parcels

/** Owner-name patterns for each public parcel type, checked in order. */
const OWNER_TYPES: [LandKind, RegExp][] = [
  ['parcel-gid', /\bG\.?\s?I\.?\s?D\b|GENERAL IMPROVEMENT/i],
  ['parcel-school', /SCHOOL DIST|BOARD OF (TRUSTEES|EDUCATION)|SCHOOL BOARD/i],
  [
    'parcel-hoa',
    /\bH\.?O\.?A\b|HOMEOWNERS|HOME OWNERS|OWNERS ASSOC|PROPERTY OWNERS|COMMUNITY ASSOC|MAINTENANCE ASSOC/i,
  ],
  ['parcel-county', /\bCOUNTY\b(?!.*\b(LLC|INC|TRUST|BANK|CLUB)\b)/i],
  ['parcel-city', /\b(CITY|TOWN) OF\b|,\s*(CITY|TOWN) OF$/i],
  [
    'parcel-state',
    /STATE OF NEVADA|NEVADA,? STATE OF|NEVADA DEP(ARTMEN)?T|NEVADA DIVISION|DIVISION OF STATE LANDS|UNIVERSITY OF NEVADA|NEVADA SYSTEM OF HIGHER/i,
  ],
  [
    'parcel-federal',
    /UNITED STATES|\bU\.?\s?S\.?\s?A\b|BUREAU OF|FOREST SERVICE|DEPT OF (THE )?INTERIOR/i,
  ],
  [
    'parcel-tribal',
    /\bTRIBE\b|\bTRIBAL\b|PAIUTE|WASHOE TRIBE|SHOSHONE|COLONY\b.*\bINDIAN|INDIAN COLONY/i,
  ],
  [
    'parcel-utility',
    /\b(WATER|SEWER|FIRE|CONSERVATION|IRRIGATION|SANITATION|HOSPITAL|TV|TELEVISION|CEMETERY) (DIST|DISTRICT)\b|PUBLIC UTILIT|IRRIGATION DIST/i,
  ],
];

/** The public parcel type for an owner name, or undefined for a private owner. */
export function publicOwnerType(owner: string | null | undefined): LandKind | undefined {
  if (!owner) return undefined;
  for (const [kind, pattern] of OWNER_TYPES) if (pattern.test(owner)) return kind;
  return undefined;
}

export function parcelSourceFor(county: CountyId, countyName: string): ParcelSource {
  return PARCEL_SOURCES[county] ?? statewideParcelSource(countyName);
}

function parcelAttrFile(county: CountyId): string {
  return `parcels/${county}-owners.json`;
}
function parcelGeomFile(county: CountyId): string {
  return `parcels/${county}-public.json`;
}

/**
 * Downloads every parcel's owner (attributes only, which is quick), picks the public owners
 * locally, then downloads geometry for just those parcels.
 */
export async function fetchParcels(
  county: CountyId,
  countyName: string,
  { force = false } = {},
): Promise<void> {
  const src = parcelSourceFor(county, countyName);
  const fields = [src.ownerField, src.apnField, ...(src.acresField ? [src.acresField] : [])];
  const owners = await cachedJson(parcelAttrFile(county), { force }, () => {
    console.log(`  query    ${src.name} (owners)`);
    return queryArcgisLayer(src.url, {
      where: src.where ?? '1=1',
      outFields: ['OBJECTID', ...fields],
      returnGeometry: false,
    });
  });
  const ids = owners.features
    .filter((f) => publicOwnerType(f.properties?.[src.ownerField] as string) !== undefined)
    .map((f) => Number(f.properties?.OBJECTID))
    .filter(Number.isFinite);
  await cachedJson(parcelGeomFile(county), { force }, async () => {
    console.log(`  query    ${src.name} (${ids.length} public parcels)`);
    const features: Collection['features'] = [];
    for (let i = 0; i < ids.length; i += 250) {
      const batch = ids.slice(i, i + 250);
      const page = await queryArcgisLayer(src.url, {
        where: `OBJECTID IN (${batch.join(',')})`,
        outFields: ['OBJECTID', ...fields],
      });
      features.push(...page.features);
    }
    return { type: 'FeatureCollection', features } satisfies Collection;
  });
}

export function parcelDrafts(
  county: CountyId,
  src: ParcelSource,
  parcels: Collection,
): LayerDraft[] {
  const drafts: LayerDraft[] = [];
  for (const f of parcels.features) {
    const owner = f.properties?.[src.ownerField] as string | undefined;
    const kind = publicOwnerType(owner);
    if (!kind || !f.geometry || !owner) continue;
    const apn = String(f.properties?.[src.apnField] ?? f.properties?.OBJECTID);
    const acres = src.acresField ? Number(f.properties?.[src.acresField]) : NaN;
    drafts.push({
      id: `parcel:${county}:${apn}`,
      layer: 'land',
      kind,
      name: titleCase(owner),
      named: true,
      geometry: f.geometry,
      owner: titleCase(owner),
      detail: [
        `APN ${apn}`,
        Number.isFinite(acres) && acres > 0 ? `${acres} acres` : '',
        src.vintage === '2018' ? '2018 owner' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      source: src.name,
    });
  }
  return drafts;
}

export async function readParcelDrafts(
  county: CountyId,
  countyName: string,
): Promise<LayerDraft[]> {
  if (!hasRaw(parcelGeomFile(county))) return [];
  return parcelDrafts(
    county,
    parcelSourceFor(county, countyName),
    await readRawJson<Collection>(parcelGeomFile(county)),
  );
}
