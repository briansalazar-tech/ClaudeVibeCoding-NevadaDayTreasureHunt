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
    /** The `version` the edited text started from; a newer one on the server is a conflict (409). */
    baseVersion: z.number().int().positive(),
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
  /** User ids; null for content whose author isn't among the current users ("Former user"). */
  createdBy: number | null;
  updatedBy: number | null;
  /** Goes up each time the text changes, so two people's edits can't overwrite each other. */
  version: number;
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
  createdBy: number | null;
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
  createdBy: number | null;
  createdAt: string;
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Where `[[links]]` can be written: pages, notes on map places, custom markers, and comments. */
export type SourceKind = 'page' | 'note' | 'marker' | 'comment';

export interface ReferenceSource {
  kind: SourceKind;
  id: number;
  /** The page title, the place the note is on, the marker name, or what a comment is on. */
  title: string;
  /** For a note or marker (or a comment on a note): where it is, so the reference can fly there. */
  place?: PlaceRef;
  /** For a comment on a page: the page. */
  pageId?: number;
  /** Who wrote the text, so the client knows whether "Link" may change it. */
  createdBy: number | null;
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
  kind: z.enum(['page', 'note', 'marker', 'comment']),
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
  /** Comments per note id. */
  commentCounts: Record<number, number>;
  photos: Photo[];
}

/** What a comment is on. */
export const COMMENT_TARGETS = ['page', 'note'] as const;
export type CommentTarget = (typeof COMMENT_TARGETS)[number];

const commentBody = z.string().trim().min(1, 'Write something first').max(20_000);

export const commentInputSchema = z.object({
  targetKind: z.enum(COMMENT_TARGETS),
  targetId: z.number().int().positive(),
  body: commentBody,
});

export const commentPatchSchema = z.object({ body: commentBody });

export type CommentInput = z.infer<typeof commentInputSchema>;

/** A comment on a page or a place note: how people add to what they can't edit. */
export interface Comment {
  id: number;
  targetKind: CommentTarget;
  targetId: number;
  body: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A backup's record of who wrote what, matched to the current users by username on restore. */
export interface BackupAuthor {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
}

/**
 * The notebook and markers, for GET /api/backup and POST /api/restore. Accounts aren't in it
 * (no password hashes or sessions), only the authors' names.
 */
export interface Backup {
  app: 'nevada-day-hunt-map';
  /** 1: before accounts (no authors). */
  version: 1 | 2;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  authors?: BackupAuthor[];
  /** Photo files, base64, by photo id. */
  files: Record<string, string>;
}
