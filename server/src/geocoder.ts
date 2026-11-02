import { readFileSync } from 'node:fs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { BBox, CountyCollection, CountyId, GeocodeResult, GeocodeSource } from '@hunt/shared';

/** The hunt counties, for keeping address results inside them. */
export interface CountyAreas {
  bbox: BBox;
  countyAt: (lng: number, lat: number) => CountyId | null;
}

export function countyAreas(counties: CountyCollection): CountyAreas {
  const boxes = counties.features.map((f) => f.properties.bbox);
  return {
    bbox: [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ],
    countyAt: (lng, lat) =>
      counties.features.find((f) => booleanPointInPolygon([lng, lat], f.geometry))?.properties.id ??
      null,
  };
}

export function readCountyAreas(file: string): CountyAreas {
  return countyAreas(JSON.parse(readFileSync(file, 'utf8')) as CountyCollection);
}

export interface GeocoderOptions {
  areas: CountyAreas;
  /** Nominatim's usage policy asks for a User-Agent that identifies the app. */
  userAgent: string;
  nominatimUrl: string;
  censusUrl: string;
  /** At most one request per this many milliseconds (Nominatim allows one per second). */
  minIntervalMs?: number;
  fetch?: typeof fetch;
}

export interface GeocodeOutcome {
  results: GeocodeResult[];
  source: GeocodeSource | null;
  outside: number;
}

interface Candidate {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
}

interface CensusResponse {
  result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
}

export class GeocodeError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Looks up addresses with Nominatim, falling back to the US Census geocoder, and keeps only
 * matches inside the hunt counties. Requests to either service go out one at a time, at most
 * one per `minIntervalMs`.
 */
export class Geocoder {
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;
  private readonly fetch: typeof fetch;
  private readonly interval: number;

  constructor(private readonly options: GeocoderOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.interval = options.minIntervalMs ?? 1000;
  }

  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.last + this.interval - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getJson<T>(url: URL): Promise<T> {
    const res = await this.throttled(() =>
      this.fetch(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!res.ok) throw new GeocodeError(`${url.host} answered ${res.status}`);
    return (await res.json()) as T;
  }

  private async nominatim(q: string): Promise<Candidate[]> {
    const [w, s, e, n] = this.options.areas.bbox;
    const url = new URL(this.options.nominatimUrl);
    url.search = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '10',
      countrycodes: 'us',
      viewbox: `${w},${n},${e},${s}`,
      bounded: '1',
    }).toString();
    const places = await this.getJson<NominatimPlace[]>(url);
    return places.map((p) => ({
      label: p.display_name.replace(/, United States$/, ''),
      lat: Number(p.lat),
      lng: Number(p.lon),
    }));
  }

  private async census(q: string): Promise<Candidate[]> {
    const url = new URL(this.options.censusUrl);
    // The Census geocoder needs a state; every hunt address is in Nevada.
    const address = /\b(NV|Nevada)\b/i.test(q) ? q : `${q}, NV`;
    url.search = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    }).toString();
    const body = await this.getJson<CensusResponse>(url);
    return (body.result?.addressMatches ?? []).map((m) => ({
      label: m.matchedAddress,
      lat: m.coordinates.y,
      lng: m.coordinates.x,
    }));
  }

  private inArea(candidates: Candidate[]): { results: GeocodeResult[]; outside: number } {
    const results: GeocodeResult[] = [];
    let outside = 0;
    for (const c of candidates) {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
      const county = this.options.areas.countyAt(c.lng, c.lat);
      if (county) results.push({ ...c, county });
      else outside++;
    }
    return { results, outside };
  }

  async search(q: string): Promise<GeocodeOutcome> {
    let nominatimFailed: unknown = null;
    let outside = 0;
    try {
      const found = this.inArea(await this.nominatim(q));
      if (found.results.length) return { ...found, source: 'nominatim' };
      outside = found.outside;
    } catch (err) {
      nominatimFailed = err;
    }
    try {
      const found = this.inArea(await this.census(q));
      if (found.results.length) return { ...found, source: 'census' };
      return { results: [], source: null, outside: outside + found.outside };
    } catch (err) {
      if (nominatimFailed) {
        throw new GeocodeError('Address lookup is unavailable right now. Try again in a minute.');
      }
      // Nominatim answered (with nothing in the area); the fallback failing doesn't change that.
      console.warn(`Census geocoder failed: ${(err as Error).message}`);
      return { results: [], source: null, outside };
    }
  }
}
