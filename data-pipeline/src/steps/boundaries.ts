import { readFile } from 'node:fs/promises';
import { featureCollection, polygon } from '@turf/helpers';
import turfBbox from '@turf/bbox';
import turfMask from '@turf/mask';
import turfUnion from '@turf/union';
import { unzipSync } from 'fflate';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';
import * as shapefile from 'shapefile';
import {
  COUNTIES,
  DATA_FILES,
  type BBox,
  type CountyCollection,
  type CountyLabelCollection,
  type HuntCounty,
} from '@hunt/shared';
import { downloadToRaw, rawPath } from '../lib/download.js';
import { writeJson } from '../lib/manifest.js';
import { roundBBox, roundCoords } from '../lib/geo.js';
import { SOURCES } from '../sources.js';

/** The fields of the Census cartographic boundary county file that we use. */
export interface CensusCountyProps {
  GEOID: string;
  NAME: string;
  ALAND: number;
  AWATER: number;
}

type AreaFeature = Feature<Polygon | MultiPolygon, CensusCountyProps>;

export interface BoundaryData {
  counties: CountyCollection;
  labels: CountyLabelCollection;
  outsideMask: Feature<Polygon | MultiPolygon>;
  bbox: BBox;
}

// Stops short of the poles, where Web Mercator goes to infinity.
const WORLD = polygon([
  [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ],
]);

/**
 * Picks the configured counties out of the Census features and derives the
 * county polygons, a label point for each, and the "outside" mask polygon.
 */
export function buildBoundaryData(
  census: readonly AreaFeature[],
  counties: readonly HuntCounty[] = COUNTIES,
): BoundaryData {
  const byFips = new Map(census.map((f) => [f.properties.GEOID, f]));
  const missing = counties.filter((c) => !byFips.has(c.fips));
  if (missing.length) {
    throw new Error(`Census file is missing: ${missing.map((c) => c.name).join(', ')}`);
  }
  const picked = counties.map((c) => ({ config: c, feature: byFips.get(c.fips)! }));

  const countyCollection: CountyCollection = featureCollection(
    picked.map(({ config, feature }) => ({
      type: 'Feature' as const,
      id: config.id,
      properties: {
        id: config.id,
        name: config.name,
        fips: config.fips,
        seat: config.seat,
        landArea: Number(feature.properties.ALAND),
        waterArea: Number(feature.properties.AWATER),
        bbox: roundBBox(turfBbox(feature)),
      },
      geometry: roundCoords(feature.geometry),
    })),
  );

  const labels: CountyLabelCollection = featureCollection(
    picked.map(({ config, feature }) => ({
      type: 'Feature' as const,
      id: config.id,
      properties: { id: config.id, name: config.name },
      geometry: { type: 'Point' as const, coordinates: labelPoint(feature.geometry) },
    })),
  );

  const union =
    picked.length === 1
      ? picked[0]!.feature
      : turfUnion(featureCollection(picked.map((p) => p.feature)));
  if (!union) throw new Error('County union came out empty');
  const outsideMask = turfMask(union, WORLD);
  outsideMask.geometry = roundCoords(outsideMask.geometry);
  outsideMask.properties = {};

  return {
    counties: countyCollection,
    labels,
    outsideMask,
    bbox: roundBBox(turfBbox(countyCollection)),
  };
}

/** Pole of inaccessibility of the largest part, so labels sit well inside odd shapes. */
function labelPoint(geometry: Polygon | MultiPolygon): Position {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = polys[0]!;
  let bestArea = -1;
  for (const p of polys) {
    const area = Math.abs(ringArea(p[0]!));
    if (area > bestArea) [best, bestArea] = [p, area];
  }
  const pt = polylabel(best as [number, number][][], 0.001);
  return [Math.round(pt[0] * 1e5) / 1e5, Math.round(pt[1] * 1e5) / 1e5];
}

function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  }
  return sum / 2;
}

export async function fetchBoundaries({ force = false } = {}): Promise<void> {
  await downloadToRaw(SOURCES.censusCounties.url, SOURCES.censusCounties.rawFile, { force });
}

export async function readCensusCounties(zipPath: string): Promise<AreaFeature[]> {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  const find = (ext: string) => {
    const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(ext));
    if (!name) throw new Error(`${zipPath} has no ${ext} file`);
    return files[name]!;
  };
  const collection = await shapefile.read(find('.shp'), find('.dbf'), { encoding: 'utf-8' });
  return collection.features as unknown as AreaFeature[];
}

export async function buildBoundaries(): Promise<BoundaryData> {
  const zip = rawPath(SOURCES.censusCounties.rawFile);
  const census = await readCensusCounties(zip);
  const data = buildBoundaryData(census);
  const sizes = await Promise.all([
    writeJson(DATA_FILES.counties, data.counties),
    writeJson(DATA_FILES.countyLabels, data.labels),
    writeJson(DATA_FILES.outsideMask, data.outsideMask),
  ]);
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  console.log(
    `  boundaries: ${data.counties.features.length} counties (${kb(sizes[0])}), labels (${kb(sizes[1])}), mask (${kb(sizes[2])})`,
  );
  return data;
}
