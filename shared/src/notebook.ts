import { z } from 'zod';
import { LAYERS, type LayerId } from './layers.js';

/** The field notebook: pages, notes on map places, photos, and the links between them. */

export const PAGE_TYPES = [
  { id: 'article', name: 'Article' },
  { id: 'person', name: 'Person' },
  { id: 'place', name: 'Place' },
  { id: 'clue', name: 'Clue' },
  { id: 'topic', name: 'Topic' },
  { id: 'note', name: 'Note' },
  { id: 'daily', name: 'Daily note' },
] as const;

export type PageType = (typeof PAGE_TYPES)[number]['id'];

const pageTypeIds = PAGE_TYPES.map((t) => t.id) as [PageType, ...PageType[]];
const layerIds = LAYERS.map((l) => l.id) as [LayerId, ...LayerId[]];

export function pageTypeName(id: string): string {
  return PAGE_TYPES.find((t) => t.id === id)?.name ?? id;
}

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const title = z.string().trim().min(1, 'Give the page a title').max(200);

/** A map feature a page or note is about, by its stable id (`osm:way/123`, `hmdb:456`). */
export const placeRefSchema = z.object({
  id: z.string().min(1).max(200),
  layer: z.enum(layerIds),
  name: z.string().max(300),
  lng,
  lat,
});

export type PlaceRef = z.infer<typeof placeRefSchema>;

/** A spot a page was put on ("Put on map"). */
export const spotSchema = z.object({ lng, lat });

export type Spot = z.infer<typeof spotSchema>;

export const pageInputSchema = z.object({
  title,
  type: z.enum(pageTypeIds).default('note'),
  body: z.string().max(500_000).default(''),
  sourceUrl: z.string().trim().max(2000).default(''),
  place: placeRefSchema.nullable().default(null),
  spot: spotSchema.nullable().default(null),
});

export const pagePatchSchema = z
  .object({
    title,
    type: z.enum(pageTypeIds),
    body: z.string().max(500_000),
    sourceUrl: z.string().trim().max(2000),
    place: placeRefSchema.nullable(),
    spot: spotSchema.nullable(),
  })
  .partial();

/** Opens a page by title, creating it if there's none: a link clicked, "Today", a place's page. */
export const openPageSchema = z.object({
  title,
  type: z.enum(pageTypeIds).optional(),
  place: placeRefSchema.optional(),
});

export type PageInput = z.input<typeof pageInputSchema>;
export type PagePatch = z.infer<typeof pagePatchSchema>;
export type OpenPage = z.infer<typeof openPageSchema>;

export interface Page {
  id: number;
  title: string;
  type: PageType;
  /** Markdown. */
  body: string;
  sourceUrl: string;
  /** The map place this page is about, tied with "This one" or made from the place's popup. */
  place: PlaceRef | null;
  /** Where "Put on map" put it. */
  spot: Spot | null;
  createdAt: string;
  updatedAt: string;
}

/** What a rename did: the page, and how many links elsewhere now point at the new title. */
export interface RenameResult {
  page: Page;
  relinked: number;
}

export const noteInputSchema = z.object({
  place: placeRefSchema,
  body: z.string().trim().min(1, 'Write something first').max(100_000),
});

export const notePatchSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(100_000),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

/** A note on a map place, added from its popup. */
export interface PlaceNote {
  id: number;
  place: PlaceRef;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: number;
  /** A notebook page's photo, or a map place's. */
  pageId: number | null;
  place: PlaceRef | null;
  caption: string;
  contentType: string;
  createdAt: string;
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Where `[[links]]` can be written: pages, notes on map places, and custom markers. */
export type SourceKind = 'page' | 'note' | 'marker';

export interface ReferenceSource {
  kind: SourceKind;
  id: number;
  /** The page title, the place the note is on, or the marker name. */
  title: string;
  /** For a note or marker: where it is, so the reference can fly there. */
  place?: PlaceRef;
}

export interface Reference {
  source: ReferenceSource;
  /** The lines that mention the page. */
  snippets: string[];
}

export interface PageReferences {
  linked: Reference[];
  unlinked: Reference[];
}

/** POST /api/references/link: turn the plain mentions of a page in one source into links. */
export const linkMentionsSchema = z.object({
  kind: z.enum(['page', 'note', 'marker']),
  id: z.number().int().positive(),
  title,
});

/** POST /api/pages/:id/link-names: link names found in a captured article. */
export const linkNamesSchema = z.object({
  names: z.array(z.string().min(1).max(300)).max(500),
});

/** "In your notebook" for a map place. */
export interface PlaceNotebook {
  /** The page about this place, if there is one. */
  page: { id: number; title: string; type: PageType } | null;
  /** Other pages, notes and markers that link to it. */
  mentions: ReferenceSource[];
  notes: PlaceNote[];
  photos: Photo[];
}

/** Everything in the database, for GET /api/backup and POST /api/restore. */
export interface Backup {
  app: 'nevada-day-hunt-map';
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** Photo files, base64, by photo id. */
  files: Record<string, string>;
}
