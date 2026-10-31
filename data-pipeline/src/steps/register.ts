/**
 * Register sites: National Register listings from Wikipedia's county NRHP lists (which carry
 * coordinates), plus the SHPO State Register list (a PDF with no coordinates). State-only
 * sites and NRHP sites without coordinates go in "Not on the map". Archaeological sites with
 * restricted addresses are confidential by design and are never located.
 */
import { readFile } from 'node:fs/promises';
import type { CountyId, UnlocatedPlace } from '@hunt/shared';
import { getDocumentProxy } from 'unpdf';
import { cachedJson, downloadToRaw, rawPath, readRawJson } from '../lib/download.js';
import type { LayerDraft } from '../lib/place.js';
import { normalizeName } from '../lib/names.js';
import { articleUrl, fetchWikitext, stripWikitext } from '../lib/wikipedia.js';
import { nrhpListPage, SOURCES } from '../sources.js';

// ---------------------------------------------------------------------------------------------
// National Register (Wikipedia)

export interface NrhpRow {
  refnum: string;
  name: string;
  article?: string;
  address: string;
  city: string;
  date?: string;
  lat?: number;
  lng?: number;
  type?: string;
}

function templateParams(template: string): Record<string, string> {
  const params: Record<string, string> = {};
  // Split on "|" at the top level only (links and nested templates contain "|" too).
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (let i = 0; i < template.length; i++) {
    const two = template.slice(i, i + 2);
    if (two === '[[' || two === '{{') {
      depth++;
      current += two;
      i++;
    } else if (two === ']]' || two === '}}') {
      depth--;
      current += two;
      i++;
    } else if (template[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += template[i];
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return params;
}

/** The {{NRHP row}} templates of a Wikipedia county list. */
export function parseNrhpRows(wikitext: string): NrhpRow[] {
  const rows: NrhpRow[] = [];
  for (const m of wikitext.matchAll(/\{\{NRHP row\s*([\s\S]*?)\n\}\}/g)) {
    const p = templateParams(`NRHP row${m[1]}`);
    if (!p.refnum) continue;
    const lat = Number(p.lat);
    const lng = Number(p.lon ?? p.long);
    rows.push({
      refnum: p.refnum,
      name: stripWikitext(p.name ?? p.article ?? p.refnum),
      article: p.article || undefined,
      address: stripWikitext(p.address ?? ''),
      city: stripWikitext(p.city ?? ''),
      date: p.date || undefined,
      lat: p.lat && Number.isFinite(lat) ? lat : undefined,
      lng: p.lon && Number.isFinite(lng) ? lng : undefined,
      type: p.type || undefined,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// State Register (SHPO PDF)

export interface StateRegisterRow {
  county: string;
  city: string;
  name: string;
  address: string;
  listed?: string;
  sris?: string;
  nrhp: boolean;
  nris?: string;
}

interface PdfItem {
  text: string;
  /** Position along the row axis (the PDF is landscape, so this is the transform's x). */
  row: number;
  /** Position across the columns. */
  col: number;
}

/** Column starts of the State Register table, from its header row. */
const COLUMNS = [
  'county',
  'city',
  'name',
  'address',
  'listed',
  'sris',
  'nrhpListed',
  'nrhpDate',
  'nris',
] as const;

/**
 * Rebuilds table rows from positioned PDF text. Every row starts with its county in the first
 * column; cells that wrap continue below until the next row's county.
 */
export function parseStateRegisterItems(items: readonly PdfItem[]): StateRegisterRow[] {
  const header = items.find((i) => i.text === 'County');
  if (!header) return [];
  const starts = new Map<string, number>();
  const headerItems = items.filter((i) => Math.abs(i.row - header.row) < 20);
  const at = (label: string, nth = 0) =>
    headerItems.filter((i) => i.text === label).sort((a, b) => a.col - b.col)[nth]?.col;
  starts.set('county', header.col);
  starts.set('city', at('City / Town') ?? 102);
  starts.set('name', at('Resource Name') ?? 183);
  starts.set('address', at('Address') ?? 331);
  starts.set('listed', at('SHRP') ?? 482);
  starts.set('sris', at('SRIS #') ?? 542);
  starts.set('nrhpListed', at('NRHP') ?? 605);
  starts.set('nrhpDate', at('NRHP', 1) ?? 641);
  starts.set('nris', at('NRIS #') ?? 707);
  const columnOf = (col: number) => {
    let best: (typeof COLUMNS)[number] = 'county';
    for (const c of COLUMNS) if (col >= starts.get(c)! - 3) best = c;
    return best;
  };

  const body = items
    .filter((i) => i.row > header.row + 5 && !/^Page \d+ of \d+$/.test(i.text))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const anchors = body.filter((i) => columnOf(i.col) === 'county').map((i) => i.row);
  const rows: StateRegisterRow[] = [];
  anchors.forEach((start, n) => {
    const end = anchors[n + 1] ?? Infinity;
    const cells: Record<string, string[]> = {};
    for (const i of body) {
      if (i.row < start - 4 || i.row >= end - 4) continue;
      (cells[columnOf(i.col)] ??= []).push(i.text);
    }
    const get = (c: string) => (cells[c] ?? []).join(' ').replace(/\s+/g, ' ').trim();
    // Some cells run together in the PDF ("12/28/1982 820080"); pull the SRIS number back out.
    const listedCell = get('listed');
    const sris = get('sris') || /\b(\d{6})\b/.exec(listedCell)?.[1];
    rows.push({
      county: get('county'),
      city: get('city')
        .replace(/\(Independent City\)/g, '')
        .trim(),
      name: get('name').replace(/\s*\((National Historic Landmark)\)/, ''),
      address: get('address'),
      listed: /\d{1,2}\/\d{1,2}\/\d{4}/.exec(listedCell)?.[0],
      sris: sris || undefined,
      nrhp: /^yes/i.test(get('nrhpListed')),
      nris: /\d{6,8}/.exec(get('nris'))?.[0],
    });
  });
  return rows;
}

export async function readStateRegister(pdfPath: string): Promise<StateRegisterRow[]> {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(pdfPath)));
  const rows: StateRegisterRow[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = (content.items as { str?: string; transform?: number[] }[])
      .filter((i) => i.str?.trim() && i.transform)
      .map((i) => ({ text: i.str!.trim(), row: i.transform![4]!, col: i.transform![5]! }));
    rows.push(...parseStateRegisterItems(items));
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------

function nrhpFile(county: CountyId): string {
  return `wikipedia/nrhp-${county}.json`;
}

export async function fetchRegister(county: CountyId, countyName: string, { force = false } = {}) {
  await cachedJson(nrhpFile(county), { force }, () => fetchWikitext(nrhpListPage(countyName)));
  await downloadToRaw(SOURCES.shpoStateRegister.url, SOURCES.shpoStateRegister.rawFile, { force });
}

const RESTRICTED = /address restricted|restricted|confidential/i;

function sharesWord(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      normalizeName(s)
        .split(' ')
        .filter((w) => w.length > 3),
    );
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
}

export function registerDrafts(
  nrhp: readonly NrhpRow[],
  stateRows: readonly StateRegisterRow[],
): { drafts: LayerDraft[]; unlocated: UnlocatedPlace[] } {
  const drafts: LayerDraft[] = [];
  const unlocated: UnlocatedPlace[] = [];
  const matchedState = new Set<StateRegisterRow>();

  for (const row of nrhp) {
    // Same NRIS number and a name in common. (A building inside a historic district can carry
    // the district's number; it stays its own State Register entry.)
    const state = stateRows.find(
      (r) => Number(r.nris) === Number(row.refnum) && sharesWord(r.name, row.name),
    );
    if (state) matchedState.add(state);
    const year = row.date?.slice(0, 4);
    const detail = [
      `National Register${year ? ` ${year}` : ''}`,
      state ? 'State Register' : '',
      row.type === 'NHL' ? 'National Historic Landmark' : '',
      row.address,
    ]
      .filter(Boolean)
      .join(' · ');
    const id = `nrhp:${row.refnum}`;
    const wikipedia = row.article ? articleUrl(row.article) : undefined;
    if (row.lat === undefined || row.lng === undefined) {
      unlocated.push({
        id,
        name: row.name,
        layer: 'register',
        reason: RESTRICTED.test(row.address)
          ? 'Location confidential (archaeological site)'
          : 'No coordinates in the Wikipedia NRHP list',
        wikipedia,
        detail,
      });
      continue;
    }
    drafts.push({
      id,
      layer: 'register',
      kind: 'nrhp',
      name: row.name,
      named: true,
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      wikipedia,
      detail,
      source: 'National Register of Historic Places (coordinates from Wikipedia)',
    });
  }

  for (const row of stateRows) {
    if (matchedState.has(row)) continue;
    unlocated.push({
      id: `srhp:${row.sris ?? row.name.replace(/\W+/g, '-')}`,
      name: row.name,
      layer: 'register',
      reason: RESTRICTED.test(row.address)
        ? 'Location confidential (archaeological site)'
        : 'State Register lists no coordinates',
      detail: [
        `State Register${row.listed ? ` ${row.listed.slice(-4)}` : ''}`,
        row.address,
        row.city,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  return { drafts, unlocated };
}

export async function readRegister(county: CountyId, countyName: string) {
  const nrhp = parseNrhpRows(await readRawJson<string>(nrhpFile(county)));
  const state = (await readStateRegister(rawPath(SOURCES.shpoStateRegister.rawFile))).filter(
    (r) => r.county === countyName,
  );
  return registerDrafts(nrhp, state);
}
