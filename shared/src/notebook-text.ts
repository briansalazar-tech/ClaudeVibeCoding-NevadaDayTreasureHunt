/**
 * The notebook's text rules, shared so the server (links table, rename) and the client (editor,
 * rendering, link-finding) read a page the same way.
 *
 * Pages are Markdown. On top of it: `[[Page Name]]` links, `#tag` and `#[[Two Words]]` tags.
 * Names match ignoring case, accents and punctuation, so `[[fort churchill]]` and
 * `[[Fort Churchill.]]` are the same page.
 */

export type InlineToken =
  | { type: 'text'; text: string; start: number; end: number }
  | { type: 'link'; title: string; start: number; end: number }
  | { type: 'tag'; title: string; start: number; end: number }
  | { type: 'url'; url: string; start: number; end: number }
  | { type: 'bold'; start: number; end: number };

/** `[[x]]`, `#[[x]]`, a web link, a `#tag` (with a letter in it: "#5" is a number) or `**`. */
const INLINE =
  /(#?)\[\[([^[\]\n]+?)\]\]|(https?:\/\/[^\s<>]+)|(?<=^|[\s(,;])#([\p{L}\p{N}_-]*\p{L}[\p{L}\p{N}_-]*)|\*\*/gu;

/** Trailing punctuation belongs to the sentence, not the URL (but keep a balanced ")"). */
function trimUrl(url: string): string {
  let u = url;
  for (;;) {
    const last = u.at(-1);
    if (!last) return u;
    if (last === ')' && (u.match(/\(/g)?.length ?? 0) >= (u.match(/\)/g)?.length ?? 0)) return u;
    if (!/[.,;:!?)'"’”\]]/.test(last)) return u;
    u = u.slice(0, -1);
  }
}

/** Splits one line (or any text) into text, links, tags, URLs and bold markers. */
export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let at = 0;
  const pushText = (end: number) => {
    if (end > at) out.push({ type: 'text', text: text.slice(at, end), start: at, end });
  };
  const re = new RegExp(INLINE.source, INLINE.flags);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index;
    let end = start + m[0].length;
    if (m[2] !== undefined) {
      pushText(start);
      out.push({ type: m[1] ? 'tag' : 'link', title: m[2].trim(), start, end });
    } else if (m[3] !== undefined) {
      const url = trimUrl(m[3]);
      end = start + url.length;
      pushText(start);
      out.push({ type: 'url', url, start, end });
    } else if (m[4] !== undefined) {
      pushText(start);
      out.push({ type: 'tag', title: m[4], start, end });
    } else {
      pushText(start);
      out.push({ type: 'bold', start, end });
    }
    at = end;
    // A trimmed URL gives its trailing punctuation back, to be read again.
    re.lastIndex = end;
  }
  pushText(text.length);
  return out;
}

/** One word as names compare it: lowercase, no accents, no apostrophes. */
function normalizeWord(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** The words of a text with where each one is, for matching names inside it. */
function words(text: string): { word: string; start: number; end: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({
    word: normalizeWord(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** The form names are compared in: `Fort Churchill.`, `fort-churchill` → `fort churchill`. */
export function nameKey(name: string): string {
  return words(name)
    .map((w) => w.word)
    .join(' ');
}

/** A tag can be written `#name` when the name is one word; otherwise `#[[Two Words]]`. */
export function tagText(title: string): string {
  return /^[\p{L}\p{N}_-]*\p{L}[\p{L}\p{N}_-]*$/u.test(title) ? `#${title}` : `#[[${title}]]`;
}

export interface ParsedLink {
  title: string;
  key: string;
  kind: 'link' | 'tag';
}

/** Every link and tag in a text, once each per kind and name. */
export function parseLinks(text: string): ParsedLink[] {
  const seen = new Set<string>();
  const out: ParsedLink[] = [];
  for (const t of tokenizeInline(text)) {
    if (t.type !== 'link' && t.type !== 'tag') continue;
    const key = nameKey(t.title);
    if (!key || seen.has(`${t.type}|${key}`)) continue;
    seen.add(`${t.type}|${key}`);
    out.push({ title: t.title, key, kind: t.type });
  }
  return out;
}

/** Points every link and tag to `oldTitle` at `newTitle`. */
export function renameLinks(
  text: string,
  oldTitle: string,
  newTitle: string,
): { text: string; count: number } {
  const key = nameKey(oldTitle);
  let count = 0;
  let out = '';
  for (const t of tokenizeInline(text)) {
    const raw = text.slice(t.start, t.end);
    if ((t.type === 'link' || t.type === 'tag') && nameKey(t.title) === key) {
      count++;
      out += t.type === 'link' ? `[[${newTitle}]]` : tagText(newTitle);
    } else {
      out += raw;
    }
  }
  return { text: count ? out : text, count };
}

export interface NameMatch<T> {
  start: number;
  end: number;
  /** The text as written. */
  text: string;
  key: string;
  value: T;
}

export interface FindNamesOptions {
  /**
   * One-word names only match when capitalized in the text, so a map place called "Spring"
   * doesn't match every spring in an article. Longer names match in any case.
   */
  capitalizedSingleWords?: boolean;
}

/**
 * Plain-text mentions of any of `names` (keyed by `nameKey`) in a text, longest first and not
 * overlapping. Text that is already a link, a tag or a URL doesn't count.
 */
export function findNames<T>(
  text: string,
  names: ReadonlyMap<string, T>,
  { capitalizedSingleWords = false }: FindNamesOptions = {},
): NameMatch<T>[] {
  if (!names.size) return [];
  let maxWords = 1;
  for (const key of names.keys()) maxWords = Math.max(maxWords, key.split(' ').length);
  const skip = tokenizeInline(text).filter((t) => t.type !== 'text' && t.type !== 'bold');
  const blocked = (start: number, end: number) => skip.some((s) => start < s.end && end > s.start);
  const list = words(text);
  const out: NameMatch<T>[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let n = Math.min(maxWords, list.length - i); n >= 1; n--) {
      const key = list
        .slice(i, i + n)
        .map((w) => w.word)
        .join(' ');
      const value = names.get(key);
      if (value === undefined) continue;
      const start = list[i]!.start;
      const end = list[i + n - 1]!.end;
      if (blocked(start, end)) continue;
      const written = text.slice(start, end);
      if (n === 1 && capitalizedSingleWords && !/^\p{Lu}/u.test(written)) continue;
      out.push({ start, end, text: written, key, value });
      i += n - 1;
      break;
    }
  }
  return out;
}

/** Plain-text mentions of one name. */
export function findMentions(text: string, name: string): NameMatch<string>[] {
  const key = nameKey(name);
  return key ? findNames(text, new Map([[key, name]])) : [];
}

/** Wraps each match in `[[ ]]`, keeping the text as written (it links by name either way). */
export function linkMatches(text: string, matches: readonly { start: number; end: number }[]) {
  let out = '';
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    out += `${text.slice(at, m.start)}[[${text.slice(m.start, m.end)}]]`;
    at = m.end;
  }
  return out + text.slice(at);
}

/** `nevadaappeal.com/news/…/fort-churchill` for a long web link. */
export function shortUrl(url: string, max = 40): string {
  // Shared code has no DOM types (no URL class), so read the host and path directly.
  const m = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (!m) return url;
  const host = m[1]!.replace(/^www\./i, '').toLowerCase();
  let path = m[2]!;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A stray % sign: show the path as written.
  }
  path = path.replace(/\/$/, '');
  const full = host + path;
  if (full.length <= max) return full || url;
  const parts = path.split('/').filter(Boolean);
  const last = parts.at(-1) ?? '';
  const tail = last.length > 24 ? `${last.slice(0, 23)}…` : last;
  return parts.length > 1 ? `${host}/…/${tail}` : `${host}/${tail}`;
}

/** The title of a day's daily note: `November 2, 2026`. */
export function dailyTitle(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
