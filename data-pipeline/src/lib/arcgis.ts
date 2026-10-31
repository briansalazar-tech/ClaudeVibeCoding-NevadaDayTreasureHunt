import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { BBox } from '@hunt/shared';
import { politeFetch } from './download.js';

export interface ArcgisQuery {
  where?: string;
  outFields?: string[];
  /** Only features intersecting this WGS84 box. */
  bbox?: BBox;
  returnGeometry?: boolean;
  /** Coordinate decimals in the response (5 is about 1 m). */
  precision?: number;
  pageSize?: number;
}

interface ArcgisPage {
  features?: Feature<Geometry | null, Record<string, unknown>>[];
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  error?: { message: string };
}

/**
 * Runs an ArcGIS REST layer query and returns every page as one GeoJSON collection.
 * Servers cap each response (often 2,000 features), so this pages with resultOffset.
 */
export async function queryArcgisLayer(
  layerUrl: string,
  {
    where = '1=1',
    outFields = ['*'],
    bbox,
    returnGeometry = true,
    precision = 5,
    pageSize = 2000,
  }: ArcgisQuery = {},
): Promise<FeatureCollection<Geometry | null, Record<string, unknown>>> {
  const features: Feature<Geometry | null, Record<string, unknown>>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where,
      outFields: outFields.join(','),
      returnGeometry: String(returnGeometry),
      outSR: '4326',
      geometryPrecision: String(precision),
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: 'geojson',
    });
    if (bbox) {
      params.set('geometry', bbox.join(','));
      params.set('geometryType', 'esriGeometryEnvelope');
      params.set('inSR', '4326');
      params.set('spatialRel', 'esriSpatialRelIntersects');
    }
    // POST keeps long where clauses out of the URL.
    const res = await politeFetch(`${layerUrl}/query`, {
      method: 'POST',
      body: params,
    });
    const page = (await res.json()) as ArcgisPage;
    if (page.error) throw new Error(`${layerUrl}: ${page.error.message}`);
    const batch = page.features ?? [];
    features.push(...batch);
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit ?? false;
    if (!more || batch.length === 0) break;
    console.log(`    ${features.length} features so far`);
  }
  return { type: 'FeatureCollection', features };
}
