import { findNames, layerName, nameKey } from '@hunt/shared';
import type { NotebookData } from './context';

export interface FoundName {
  key: string;
  /** The text as written in the article (first time). */
  text: string;
  /** "Page", or the map layers of the places with that name. */
  what: string;
  count: number;
}

/**
 * Map place names and existing page names in a text, once each. One-word names only count
 * when capitalized, or every "spring" in an article would match a place called Spring.
 */
export function namesInText(
  text: string,
  { pages, names }: Pick<NotebookData, 'pages' | 'names'>,
  ownTitle: string,
): FoundName[] {
  const own = nameKey(ownTitle);
  const candidates = new Map<string, string>();
  for (const [key, entries] of names) {
    const layers = [...new Set(entries.map((e) => layerName(e.layer)))];
    candidates.set(
      key,
      `Map · ${layers.slice(0, 2).join(', ')}${entries.length > 1 ? ` (${entries.length})` : ''}`,
    );
  }
  for (const p of pages) candidates.set(nameKey(p.title), 'Page');
  candidates.delete(own);
  const found = new Map<string, FoundName>();
  for (const m of findNames(text, candidates, { capitalizedSingleWords: true })) {
    const seen = found.get(m.key);
    if (seen) seen.count++;
    else found.set(m.key, { key: m.key, text: m.text, what: m.value, count: 1 });
  }
  return [...found.values()];
}
