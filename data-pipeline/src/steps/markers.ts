/**
 * Historical markers. Official numbered state markers come from the SHPO marker list (a JSON
 * feed behind shpo.nv.gov's marker map) and link to their HMdb entry when one matches. Every
 * other HMdb marker goes in the Historical markers layer.
 *
 * HMdb has no API, so its county CSVs are downloaded by hand (see hmdbInstructions).
 */
import { readFile } from 'node:fs/promises';
import type { CountyId, UnlocatedPlace } from '@hunt/shared';
import { parse } from 'csv-parse/sync';
import type { Position } from 'geojson';
import { downloadToRaw, hasRaw, rawPath, readRawJson } from '../lib/download.js';
import { meters } from '../lib/geo.js';
import { normalizeName, stripBom } from '../lib/names.js';
import type { LayerDraft } from '../lib/place.js';
import { hmdbCountyPage, hmdbRawFile, SOURCES } from '../sources.js';

export interface ShpoMarker {
  node_id: number;
  slug: string;
  title: string;
  latitude: string;
  longitude: string;
  city: string;
  county: string;
  marker_number: string;
}

export interface HmdbMarker {
  id: string;
  title: string;
  lat: number;
  lng: number;
  /** The number on the marker. Other series (Trails West, Forest Service) reuse small numbers. */
  number?: string;
  erectedBy?: string;
  location?: string;
  year?: string;
}

export async function fetchShpoMarkers({ force = false } = {}): Promise<void> {
  await downloadToRaw(SOURCES.shpoMarkers.url, SOURCES.shpoMarkers.rawFile, {
    force,
    validate: (body) => {
      if (!Array.isArray(JSON.parse(body.toString('utf8'))))
        throw new Error('SHPO marker feed is not a list');
    },
  });
}

export function hmdbInstructions(countyName: string, county: CountyId): string {
  return [
    `HMdb markers for ${countyName} need a manual download:`,
    `  1. Open ${hmdbCountyPage(countyName)}`,
    `  2. Click "Download" (top right of the list) and save the CSV file.`,
    `  3. Save it as data-pipeline/raw/${hmdbRawFile(county)}`,
  ].join('\n');
}

/** Finds a column by trying header names in order (HMdb's CSV headers have shifted over time). */
function pickColumn(header: readonly string[], ...patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h.trim()));
    if (i >= 0) return i;
  }
  return -1;
}

/** Parses an HMdb list download. Markers without coordinates are left out. */
export function parseHmdbCsv(text: string): HmdbMarker[] {
  const records: string[][] = parse(stripBom(text), {
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const header = records[0] ?? [];
  const idCol = pickColumn(header, /^marker ?id$/i, /^id$/i, /marker.*id/i);
  const numberCol = pickColumn(header, /^marker ?(no\.?|number)$/i);
  const titleCol = pickColumn(header, /^title$/i, /^marker title$/i, /title/i);
  const latCol = pickColumn(header, /^latitude/i, /\blat\b/i);
  const lngCol = pickColumn(header, /^longitude/i, /\b(lng|lon|long)\b/i);
  const linkCol = pickColumn(header, /^link$/i, /url/i, /link/i);
  const erectedCol = pickColumn(header, /erected by/i);
  const yearCol = pickColumn(header, /year erected/i);
  const locationCol = pickColumn(header, /^location$/i, /street address/i);
  if (titleCol < 0 || latCol < 0 || lngCol < 0) {
    throw new Error(
      `HMdb CSV: couldn't find title/latitude/longitude columns in: ${header.join(', ')}`,
    );
  }
  const out: HmdbMarker[] = [];
  for (const r of records.slice(1)) {
    const lat = Number(r[latCol]);
    const lng = Number(r[lngCol]);
    if (!lat || !lng) continue;
    const link = linkCol >= 0 ? (r[linkCol] ?? '') : '';
    const id = (idCol >= 0 ? r[idCol] : undefined) || /m=(\d+)/.exec(link)?.[1];
    if (!id) continue;
    out.push({
      id: id.trim(),
      title: (r[titleCol] ?? '').trim(),
      lat,
      lng,
      number: numberCol >= 0 ? r[numberCol]?.trim() || undefined : undefined,
      erectedBy: erectedCol >= 0 ? r[erectedCol]?.trim() || undefined : undefined,
      year: yearCol >= 0 ? r[yearCol]?.trim() || undefined : undefined,
      location: locationCol >= 0 ? r[locationCol]?.trim() || undefined : undefined,
    });
  }
  return out;
}

export function hmdbUrl(id: string): string {
  return `https://www.hmdb.org/m.asp?m=${id}`;
}

function shpoUrl(slug: string): string {
  return `${SOURCES.shpoMarkers.pageUrl}${slug}`;
}

/** How alike two marker titles are: 1 for the same words, 0 for none in common. */
function titleSimilarity(a: string, b: string): number {
  const wa = new Set(
    normalizeName(a)
      .split(' ')
      .filter((w) => w.length > 2),
  );
  const wb = new Set(
    normalizeName(b)
      .split(' ')
      .filter((w) => w.length > 2),
  );
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

const STATE_ERECTOR =
  /state historic preservation|histori(c|cal) preservation (and|&) archeology|nevada state park|nevada state museum|SHPO/i;

/**
 * The HMdb entry for a state marker: the HMdb marker with the same number within 2 km, or else
 * the nearest one within 1.5 km whose title matches, or that was erected by the state within 300 m.
 */
export function matchHmdb(
  marker: { title: string; lng: number; lat: number; number?: string },
  hmdb: readonly HmdbMarker[],
): HmdbMarker | undefined {
  const p: Position = [marker.lng, marker.lat];
  const numbered = marker.number
    ? hmdb.find((m) => m.number === marker.number && meters(p, [m.lng, m.lat]) <= 2000)
    : undefined;
  if (numbered) return numbered;
  let best: { m: HmdbMarker; d: number } | undefined;
  for (const m of hmdb) {
    const d = meters(p, [m.lng, m.lat]);
    if (d > 1500) continue;
    const sim = titleSimilarity(marker.title, m.title);
    const ok = sim >= 0.6 || (d <= 300 && STATE_ERECTOR.test(m.erectedBy ?? '') && sim > 0);
    if (ok && (!best || d < best.d)) best = { m, d };
  }
  return best?.m;
}

/**
 * State markers (the SHPO feed is statewide; clipping to the county happens later) and the
 * HMdb markers that aren't state markers. `countyName` picks which unlocated markers to list.
 */
export function markerDrafts(
  shpo: readonly ShpoMarker[],
  hmdb: readonly HmdbMarker[],
  countyName: string,
): { drafts: LayerDraft[]; unlocated: UnlocatedPlace[] } {
  const drafts: LayerDraft[] = [];
  const unlocated: UnlocatedPlace[] = [];
  const used = new Set<string>();
  for (const s of shpo) {
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    const id = `shpo:${s.marker_number}`;
    const name = s.title.trim();
    if (!lat || !lng) {
      if (s.county.toLowerCase().startsWith(countyName.toLowerCase()))
        unlocated.push({
          id,
          name,
          layer: 'state-markers',
          reason: 'No coordinates in the SHPO list',
          detail: `Marker ${s.marker_number}`,
        });
      continue;
    }
    const match = matchHmdb(
      { title: name, lat, lng, number: String(s.marker_number).trim() },
      hmdb.filter((m) => !used.has(m.id)),
    );
    if (match) used.add(match.id);
    drafts.push({
      id,
      layer: 'state-markers',
      kind: 'state-marker',
      name,
      named: true,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      shpo: shpoUrl(s.slug),
      hmdb: match ? hmdbUrl(match.id) : undefined,
      detail: `State marker ${s.marker_number}`,
      source: 'Nevada SHPO',
    });
  }
  for (const m of hmdb) {
    if (used.has(m.id)) continue;
    drafts.push({
      id: `hmdb:${m.id}`,
      layer: 'markers',
      kind: 'marker',
      name: m.title,
      named: true,
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      hmdb: hmdbUrl(m.id),
      detail:
        [m.erectedBy && `Erected by ${m.erectedBy}`, m.year].filter(Boolean).join(' · ') ||
        undefined,
      source: 'HMdb.org',
    });
  }
  return { drafts, unlocated };
}

/** Reads the SHPO feed and the county's HMdb CSV. Throws with instructions when the CSV is missing. */
export async function readMarkers(
  county: CountyId,
  countyName: string,
  { requireHmdb = true } = {},
) {
  const shpo = await readRawJson<ShpoMarker[]>(SOURCES.shpoMarkers.rawFile);
  let hmdb: HmdbMarker[] = [];
  if (hasRaw(hmdbRawFile(county))) {
    hmdb = parseHmdbCsv(await readFile(rawPath(hmdbRawFile(county)), 'utf8'));
  } else if (requireHmdb) {
    throw new Error(hmdbInstructions(countyName, county));
  } else {
    console.warn(`  ! ${hmdbInstructions(countyName, county).replace(/\n/g, '\n    ')}`);
  }
  return { ...markerDrafts(shpo, hmdb, countyName), hmdbCount: hmdb.length };
}
