import { politeFetch } from './download.js';

const API = 'https://en.wikipedia.org/w/api.php';

export function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2C/g, ',')}`;
}

/** The wikitext of a page, following redirects. */
export async function fetchWikitext(page: string): Promise<string> {
  const params = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'wikitext',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });
  const res = await politeFetch(`${API}?${params.toString()}`);
  const json = (await res.json()) as { parse?: { wikitext: string }; error?: { info: string } };
  if (!json.parse) throw new Error(`Wikipedia ${page}: ${json.error?.info ?? 'no wikitext'}`);
  return json.parse.wikitext;
}

export interface ArticleCoords {
  /** The title asked for. */
  title: string;
  /** The title after redirects. */
  resolved: string;
  lat?: number;
  lng?: number;
}

/**
 * Coordinates of each article (50 titles per request): the primary (title) coordinates, else the
 * first ones in the article body. None when the article has none or doesn't exist.
 */
export async function fetchCoordinates(titles: readonly string[]): Promise<ArticleCoords[]> {
  const out: ArticleCoords[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query',
      prop: 'coordinates',
      coprimary: 'all',
      titles: batch.join('|'),
      redirects: '1',
      format: 'json',
      formatversion: '2',
    });
    const res = await politeFetch(`${API}?${params.toString()}`);
    const json = (await res.json()) as {
      query?: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: {
          title: string;
          missing?: boolean;
          coordinates?: { lat: number; lon: number; primary?: boolean }[];
        }[];
      };
    };
    const q = json.query ?? {};
    const step = (map: { from: string; to: string }[] | undefined, t: string) =>
      map?.find((m) => m.from === t)?.to ?? t;
    for (const title of batch) {
      const resolved = step(q.redirects, step(q.normalized, title));
      const page = q.pages?.find((p) => p.title === resolved);
      const c = page?.coordinates?.find((x) => x.primary) ?? page?.coordinates?.[0];
      out.push(c ? { title, resolved, lat: c.lat, lng: c.lon } : { title, resolved });
    }
  }
  return out;
}

/** Plain text from a wikitext fragment: links to their labels, templates and refs removed. */
export function stripWikitext(text: string): string {
  return text
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The target of the first [[link]] in a fragment. */
export function firstLinkTarget(text: string): string | undefined {
  const m = /\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]/.exec(text);
  return m?.[1]?.trim();
}
