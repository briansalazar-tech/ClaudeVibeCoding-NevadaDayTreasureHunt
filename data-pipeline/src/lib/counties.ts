import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_FILES, type CountyCollection, type CountyFeature, type CountyId } from '@hunt/shared';
import { clipArea, type ClipArea } from './clip.js';
import { OUT_DIR } from './paths.js';

export interface CountyArea extends ClipArea {
  feature: CountyFeature;
}

/** Reads the built county boundaries (run the boundaries step first). */
export async function readCountyAreas(): Promise<Map<CountyId, CountyArea>> {
  const file = path.join(OUT_DIR, DATA_FILES.counties);
  const collection = JSON.parse(await readFile(file, 'utf8')) as CountyCollection;
  return new Map(
    collection.features.map((f) => [f.properties.id, { ...clipArea(f.geometry), feature: f }]),
  );
}

export async function readCountyArea(id: CountyId): Promise<CountyArea> {
  const area = (await readCountyAreas()).get(id);
  if (!area) throw new Error(`No boundary for ${id}; run npm run data:build first`);
  return area;
}
