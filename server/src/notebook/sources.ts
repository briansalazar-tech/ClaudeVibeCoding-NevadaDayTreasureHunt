import {
  parseLinks,
  type Page,
  type Photo,
  type PlaceNote,
  type PlaceRef,
  type ReferenceSource,
  type SourceKind,
} from '@hunt/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  links,
  markers,
  pages,
  placeNotes,
  type PageRow,
  type PhotoRow,
  type PlaceNoteRow,
} from '../db/schema.js';

/**
 * Pages, place notes and custom markers are the texts `[[links]]` can be written in ("sources").
 * This keeps the links table in step with them.
 */

function placeOf(row: {
  placeId: string | null;
  placeLayer: string | null;
  placeName: string | null;
  placeLng: number | null;
  placeLat: number | null;
}): PlaceRef | null {
  if (!row.placeId || row.placeLng === null || row.placeLat === null) return null;
  return {
    id: row.placeId,
    layer: row.placeLayer as PlaceRef['layer'],
    name: row.placeName ?? '',
    lng: row.placeLng,
    lat: row.placeLat,
  };
}

/** A place as the place_* columns store it. */
export function placeColumns(place: PlaceRef | null) {
  return {
    placeId: place?.id ?? null,
    placeLayer: place?.layer ?? null,
    placeName: place?.name ?? null,
    placeLng: place?.lng ?? null,
    placeLat: place?.lat ?? null,
  };
}

export function toPage(row: PageRow): Page {
  return {
    id: row.id,
    title: row.title,
    type: row.type as Page['type'],
    body: row.body,
    sourceUrl: row.sourceUrl,
    place: placeOf(row),
    spot:
      row.spotLng !== null && row.spotLat !== null ? { lng: row.spotLng, lat: row.spotLat } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toNote(row: PlaceNoteRow): PlaceNote {
  return {
    id: row.id,
    place: placeOf(row)!,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    pageId: row.pageId,
    place: placeOf(row),
    caption: row.caption,
    contentType: row.contentType,
    createdAt: row.createdAt,
  };
}

/** Re-parses one source's links after it's saved. */
export function indexLinks(db: Db, kind: SourceKind, id: number, text: string): void {
  removeLinks(db, kind, id);
  const parsed = parseLinks(text);
  if (!parsed.length) return;
  db.insert(links)
    .values(
      parsed.map((l) => ({
        sourceKind: kind,
        sourceId: id,
        targetKey: l.key,
        targetTitle: l.title,
        kind: l.kind,
      })),
    )
    .run();
}

export function removeLinks(db: Db, kind: SourceKind, id: number): void {
  db.delete(links)
    .where(and(eq(links.sourceKind, kind), eq(links.sourceId, id)))
    .run();
}

/** Rebuilds the links table from every text (on startup, and after a restore). */
export function reindexLinks(db: Db): void {
  // better-sqlite3 is synchronous, so everything inside runs in the one transaction.
  db.transaction(() => {
    db.delete(links).run();
    for (const p of db.select({ id: pages.id, body: pages.body }).from(pages).all())
      indexLinks(db, 'page', p.id, p.body);
    for (const n of db.select({ id: placeNotes.id, body: placeNotes.body }).from(placeNotes).all())
      indexLinks(db, 'note', n.id, n.body);
    for (const m of db.select({ id: markers.id, text: markers.description }).from(markers).all())
      indexLinks(db, 'marker', m.id, m.text);
  });
}

export interface SourceText {
  source: ReferenceSource;
  text: string;
}

/** Every source with its text: for unlinked references and renames. */
export function allSources(db: Db): SourceText[] {
  const out: SourceText[] = [];
  for (const p of db.select().from(pages).all())
    out.push({ source: { kind: 'page', id: p.id, title: p.title }, text: p.body });
  for (const n of db.select().from(placeNotes).all())
    out.push({ source: noteSource(n), text: n.body });
  for (const m of db.select().from(markers).all())
    out.push({
      source: {
        kind: 'marker',
        id: m.id,
        title: m.name,
        place: {
          id: `marker:${m.id}`,
          layer: m.layer as PlaceRef['layer'],
          name: m.name,
          lng: m.lng,
          lat: m.lat,
        },
      },
      text: m.description,
    });
  return out;
}

function noteSource(n: PlaceNoteRow): ReferenceSource {
  return { kind: 'note', id: n.id, title: n.placeName, place: placeOf(n)! };
}

/** One source and its text, or undefined if it's gone. */
export function getSource(db: Db, kind: SourceKind, id: number): SourceText | undefined {
  return allSources(db).find((s) => s.source.kind === kind && s.source.id === id);
}

/** Saves a source's new text and re-indexes its links. */
export function setSourceText(db: Db, kind: SourceKind, id: number, text: string): void {
  const updatedAt = new Date().toISOString();
  if (kind === 'page')
    db.update(pages).set({ body: text, updatedAt }).where(eq(pages.id, id)).run();
  else if (kind === 'note')
    db.update(placeNotes).set({ body: text, updatedAt }).where(eq(placeNotes.id, id)).run();
  else db.update(markers).set({ description: text, updatedAt }).where(eq(markers.id, id)).run();
  indexLinks(db, kind, id, text);
}

/** The sources that link to a name, once each. */
export function sourcesLinkingTo(db: Db, key: string): { kind: SourceKind; id: number }[] {
  const rows = db
    .selectDistinct({ kind: links.sourceKind, id: links.sourceId })
    .from(links)
    .where(eq(links.targetKey, key))
    .all();
  return rows;
}
