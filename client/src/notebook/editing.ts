import { layerName, nameKey, type Page } from '@hunt/shared';
import type { PlaceNames } from './places';

/** The editor's outliner keys and `[[` completion, as pure text edits. */

export interface Edit {
  text: string;
  start: number;
  end: number;
}

const INDENT = '  ';

function lineStart(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

/** Tab / Shift+Tab: indent or outdent every line the selection touches. */
export function indentLines(text: string, start: number, end: number, outdent: boolean): Edit {
  const from = lineStart(text, start);
  const toEnd = text.indexOf('\n', end === start ? end : end - 1);
  const to = toEnd === -1 ? text.length : toEnd;
  const lines = text.slice(from, to).split('\n');
  let firstShift = 0;
  let total = 0;
  const changed = lines.map((line, i) => {
    let next: string;
    if (outdent) {
      const remove = line.startsWith(INDENT)
        ? 2
        : line.startsWith(' ') || line.startsWith('\t')
          ? 1
          : 0;
      next = line.slice(remove);
    } else {
      next = INDENT + line;
    }
    const shift = next.length - line.length;
    if (i === 0) firstShift = shift;
    total += shift;
    return next;
  });
  return {
    text: text.slice(0, from) + changed.join('\n') + text.slice(to),
    start: Math.max(from, start + firstShift),
    end: Math.max(from, end + total),
  };
}

/**
 * Enter on a bullet line starts the next bullet at the same depth; Enter on an empty bullet
 * ends the list. Null when the line isn't a bullet (a plain newline).
 */
export function continueBullet(text: string, caret: number): Edit | null {
  const from = lineStart(text, caret);
  const line = text.slice(from, caret);
  const m = /^(\s*)([-*]) (.*)$/.exec(line);
  if (!m) return null;
  const rest = text.slice(caret);
  if (!m[3]!.trim() && !rest.split('\n')[0]!.trim()) {
    // An empty bullet: drop it.
    const next = text.slice(0, from) + rest;
    return { text: next, start: from, end: from };
  }
  const insert = `\n${m[1]}${m[2]} `;
  return {
    text: text.slice(0, caret) + insert + rest,
    start: caret + insert.length,
    end: caret + insert.length,
  };
}

/** An unfinished `[[name` just before the caret: where it starts and what's typed so far. */
export function linkQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /\[\[([^[\]\n]*)$/.exec(text.slice(0, caret));
  return m ? { start: m.index, query: m[1]! } : null;
}

/** Finishes `[[name` as `[[Name]]` (replacing a `]]` already after the caret). */
export function completeLink(text: string, start: number, caret: number, name: string): Edit {
  const after = text.slice(caret).startsWith(']]') ? text.slice(caret + 2) : text.slice(caret);
  const insert = `[[${name}]]`;
  const at = start + insert.length;
  return { text: text.slice(0, start) + insert + after, start: at, end: at };
}

export interface Suggestion {
  title: string;
  kind: 'page' | 'place';
  detail: string;
}

/** Pages first, then map places, whose names start with (then contain) what's typed. */
export function suggestLinks(
  query: string,
  pages: readonly Page[],
  names: PlaceNames,
  limit = 8,
): Suggestion[] {
  const q = nameKey(query);
  const rank = (key: string) => (!q ? 1 : key.startsWith(q) ? 0 : key.includes(q) ? 1 : -1);
  const seen = new Set<string>();
  const out: (Suggestion & { r: number })[] = [];
  for (const p of pages) {
    const key = nameKey(p.title);
    const r = rank(key);
    if (r < 0) continue;
    seen.add(key);
    out.push({ title: p.title, kind: 'page', detail: 'Page', r });
  }
  if (q.length >= 2) {
    const places: (Suggestion & { r: number })[] = [];
    for (const [key, entries] of names) {
      if (seen.has(key)) continue;
      const r = rank(key);
      if (r < 0) continue;
      const first = entries[0]!;
      const detail =
        entries.length > 1 ? `${entries.length} map places` : `Map · ${layerName(first.layer)}`;
      places.push({ title: first.name, kind: 'place', detail, r });
    }
    places.sort((a, b) => a.r - b.r || a.title.length - b.title.length);
    out.push(...places.slice(0, limit * 2));
  }
  return out
    .sort((a, b) => a.r - b.r || (a.kind === b.kind ? 0 : a.kind === 'page' ? -1 : 1))
    .slice(0, limit)
    .map((s) => ({ title: s.title, kind: s.kind, detail: s.detail }));
}
