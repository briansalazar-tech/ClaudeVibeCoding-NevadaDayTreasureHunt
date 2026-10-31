/**
 * Ghost towns: Wikipedia's "List of ghost towns in Nevada", located by each town article's
 * coordinates. Towns whose article has no coordinates go in the "Not on the map" list.
 * OSM's abandoned places are merged in by name (see build-county.ts).
 */
import type { CountyId, UnlocatedPlace } from '@hunt/shared';
import { cachedJson, readRawJson } from '../lib/download.js';
import type { LayerDraft } from '../lib/place.js';
import {
  articleUrl,
  fetchCoordinates,
  fetchWikitext,
  firstLinkTarget,
  stripWikitext,
  type ArticleCoords,
} from '../lib/wikipedia.js';
import { SOURCES } from '../sources.js';

export interface GhostTownRow {
  name: string;
  article?: string;
  counties: string[];
  status?: string;
  established?: string;
}

/** Rows of the list's wikitable. Cells: Town, Other names, Image, County, Established, Disestablished, Status, Notes. */
export function parseGhostTownList(wikitext: string): GhostTownRow[] {
  const rows: GhostTownRow[] = [];
  for (const chunk of wikitext.split(/\n\|-/).slice(1)) {
    const body = chunk.replace(/^\s*\n?/, '');
    if (!body.startsWith('|') || body.startsWith('|}')) continue;
    // Cells are separated by newlines starting with "|" or by "||".
    const cells = body
      .replace(/^\|/, '')
      .split(/\n\||\|\|/)
      .map((c) => c.trim());
    const [town = '', , , county = '', established, , status] = cells;
    const counties = [...county.matchAll(/\[\[([A-Za-z ]+?)(?: County)?, Nevada/g)].map(
      (m) => m[1]!,
    );
    if (!town || !counties.length) continue;
    rows.push({
      name: stripWikitext(town),
      article: firstLinkTarget(town),
      counties,
      established: established ? stripWikitext(established) || undefined : undefined,
      status: status ? stripWikitext(status) || undefined : undefined,
    });
  }
  return rows;
}

function coordsFile(county: CountyId): string {
  return `wikipedia/ghost-towns-${county}-coords.json`;
}

export async function fetchGhostTowns(
  county: CountyId,
  countyName: string,
  { force = false } = {},
) {
  const wikitext = await cachedJson(SOURCES.wikipediaGhostTowns.rawFile, { force }, () =>
    fetchWikitext(SOURCES.wikipediaGhostTowns.page),
  );
  const rows = parseGhostTownList(wikitext).filter((r) => r.counties.includes(countyName));
  await cachedJson(coordsFile(county), { force }, () =>
    fetchCoordinates(rows.flatMap((r) => (r.article ? [r.article] : []))),
  );
}

export function ghostTownDrafts(
  rows: readonly GhostTownRow[],
  coords: readonly ArticleCoords[],
): { drafts: LayerDraft[]; unlocated: UnlocatedPlace[] } {
  const drafts: LayerDraft[] = [];
  const unlocated: UnlocatedPlace[] = [];
  for (const row of rows) {
    const c = coords.find((x) => x.title === row.article);
    const title = c?.resolved ?? row.article;
    const wikipedia = title ? articleUrl(title) : undefined;
    const detail = [row.established && `Established ${row.established}`, row.status]
      .filter(Boolean)
      .join(' · ');
    const id = `wikipedia:${(title ?? row.name).replace(/ /g, '_')}`;
    if (c?.lat === undefined || c.lng === undefined) {
      unlocated.push({
        id,
        name: row.name,
        layer: 'ghost-towns',
        reason: 'No coordinates in its Wikipedia article',
        wikipedia,
        detail: detail || undefined,
      });
      continue;
    }
    drafts.push({
      id,
      layer: 'ghost-towns',
      kind: 'ghost-town',
      name: row.name,
      named: true,
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      wikipedia,
      detail: detail || undefined,
      source: 'Wikipedia',
    });
  }
  return { drafts, unlocated };
}

export async function readGhostTowns(county: CountyId, countyName: string) {
  const wikitext = await readRawJson<string>(SOURCES.wikipediaGhostTowns.rawFile);
  const rows = parseGhostTownList(wikitext).filter((r) => r.counties.includes(countyName));
  return ghostTownDrafts(rows, await readRawJson<ArticleCoords[]>(coordsFile(county)));
}
