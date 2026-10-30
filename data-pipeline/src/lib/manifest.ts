import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_FILES, type Manifest } from '@hunt/shared';
import { OUT_DIR } from './paths.js';

const manifestPath = path.join(OUT_DIR, DATA_FILES.manifest);

/** Reads the existing manifest so a single-county run keeps the other counties' counts. */
export async function readManifest(): Promise<Partial<Manifest>> {
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<Manifest>;
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await writeJson(DATA_FILES.manifest, manifest, { pretty: true });
}

/** Writes a file under client/public/data/ and returns its size in bytes. */
export async function writeJson(
  relPath: string,
  data: unknown,
  { pretty = false } = {},
): Promise<number> {
  const dest = path.join(OUT_DIR, relPath);
  await mkdir(path.dirname(dest), { recursive: true });
  const text = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data);
  await writeFile(dest, text);
  return Buffer.byteLength(text);
}
