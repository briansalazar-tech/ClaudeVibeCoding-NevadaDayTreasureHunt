import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './paths.js';

const USER_AGENT = 'NevadaDayHuntMap-data-pipeline/0.1 (personal, non-commercial)';

/**
 * Downloads a URL into raw/ unless it's already there, so re-runs don't hit public servers.
 * Returns the local path.
 */
export async function downloadToRaw(
  url: string,
  fileName: string,
  { force = false } = {},
): Promise<string> {
  const dest = path.join(RAW_DIR, fileName);
  if (existsSync(dest) && !force) {
    console.log(`  cached   ${fileName}`);
    return dest;
  }
  await mkdir(RAW_DIR, { recursive: true });
  console.log(`  download ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  const tmp = `${dest}.part`;
  await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await rename(tmp, dest);
  return dest;
}

export function rawPath(fileName: string): string {
  return path.join(RAW_DIR, fileName);
}
