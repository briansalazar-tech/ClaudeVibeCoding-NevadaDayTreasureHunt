import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './paths.js';

// Public APIs (Overpass, Wikipedia) ask for a User-Agent that identifies the app and a contact.
// GEOCODER_USER_AGENT in .env carries the contact, so reuse it when it's set.
function userAgent(): string {
  const configured = process.env.GEOCODER_USER_AGENT;
  return configured
    ? `${configured} data-pipeline`
    : 'NevadaDayHuntMap-data-pipeline/0.2 (personal, non-commercial)';
}

export interface DownloadOptions {
  force?: boolean;
  /** Extra fetch options, e.g. a POST body for Overpass. */
  init?: RequestInit;
  /** Called on the response before it's saved; throw to reject a bad payload. */
  validate?: (body: Buffer) => void;
  retry?: RetryOptions;
}

export interface RetryOptions {
  attempts?: number;
  /** Wait before the first retry; each later retry waits this much longer. */
  waitMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() with our User-Agent and a few retries for rate limits and server hiccups. */
export async function politeFetch(
  url: string,
  init: RequestInit = {},
  { attempts = 4, waitMs = 15_000 }: RetryOptions = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': userAgent(), ...(init.headers as Record<string, string>) },
    });
    const retryable =
      res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    if (res.ok || !retryable || attempt >= attempts) {
      if (!res.ok)
        throw new Error(`${init.method ?? 'GET'} ${url} failed: ${res.status} ${res.statusText}`);
      return res;
    }
    const wait = waitMs * attempt;
    console.log(`  ${res.status} from ${new URL(url).host}; retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}

/**
 * Downloads a URL into raw/ unless it's already there, so re-runs don't hit public servers.
 * `fileName` may include a subdirectory. Returns the local path.
 */
export async function downloadToRaw(
  url: string,
  fileName: string,
  { force = false, init, validate, retry }: DownloadOptions = {},
): Promise<string> {
  const dest = rawPath(fileName);
  if (existsSync(dest) && !force) {
    console.log(`  cached   ${fileName}`);
    return dest;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  console.log(`  download ${url.length > 120 ? `${url.slice(0, 117)}...` : url}`);
  const res = await politeFetch(url, init, retry);
  const body = Buffer.from(await res.arrayBuffer());
  validate?.(body);
  const tmp = `${dest}.part`;
  await writeFile(tmp, body);
  await rename(tmp, dest);
  return dest;
}

/**
 * Caches the result of a multi-request download (a paged ArcGIS query, say) as one JSON file in raw/.
 */
export async function cachedJson<T>(
  fileName: string,
  { force = false } = {},
  produce: () => Promise<T>,
): Promise<T> {
  const dest = rawPath(fileName);
  if (existsSync(dest) && !force) {
    console.log(`  cached   ${fileName}`);
    return JSON.parse(await readFile(dest, 'utf8')) as T;
  }
  const data = await produce();
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(`${dest}.part`, JSON.stringify(data));
  await rename(`${dest}.part`, dest);
  return data;
}

export function rawPath(fileName: string): string {
  return path.join(RAW_DIR, ...fileName.split('/'));
}

export function hasRaw(fileName: string): boolean {
  return existsSync(rawPath(fileName));
}

export async function readRawJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(rawPath(fileName), 'utf8')) as T;
}
