import { MARKER_STATUSES } from '@hunt/shared';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const statuses = MARKER_STATUSES.map((s) => s.id) as [string, ...string[]];

/** Custom markers the user adds on the map. */
export const markers = sqliteTable('markers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: statuses }).notNull().default('to-check'),
  /** The map layer the marker shows and hides with. */
  layer: text('layer').notNull().default('custom'),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  /** ISO timestamps. */
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type MarkerRow = typeof markers.$inferSelect;

/** Address lookups, so a repeated search doesn't go back to Nominatim or the Census geocoder. */
export const geocodeCache = sqliteTable('geocode_cache', {
  /** The query, lowercased with spaces collapsed. */
  query: text('query').primaryKey(),
  /** 'nominatim', 'census', or null when neither found anything. */
  source: text('source'),
  /** JSON: the in-area results and how many fell outside. */
  results: text('results').notNull(),
  createdAt: text('created_at').notNull(),
});

export type GeocodeCacheRow = typeof geocodeCache.$inferSelect;

/** Notebook pages. Bodies are Markdown; links in them are indexed in `links`. */
export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    /** The title as names compare (`nameKey`): one page per name. */
    titleKey: text('title_key').notNull(),
    type: text('type').notNull().default('note'),
    body: text('body').notNull().default(''),
    sourceUrl: text('source_url').notNull().default(''),
    /** The map place the page is about: its stable feature id, layer, name and location. */
    placeId: text('place_id'),
    placeLayer: text('place_layer'),
    placeName: text('place_name'),
    placeLng: real('place_lng'),
    placeLat: real('place_lat'),
    /** "Put on map". */
    spotLng: real('spot_lng'),
    spotLat: real('spot_lat'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('pages_title_key').on(t.titleKey), index('pages_place_id').on(t.placeId)],
);

export type PageRow = typeof pages.$inferSelect;

/** Notes on map places, added from a place's popup. */
export const placeNotes = sqliteTable(
  'place_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    placeId: text('place_id').notNull(),
    placeLayer: text('place_layer').notNull(),
    placeName: text('place_name').notNull(),
    placeLng: real('place_lng').notNull(),
    placeLat: real('place_lat').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('place_notes_place_id').on(t.placeId)],
);

export type PlaceNoteRow = typeof placeNotes.$inferSelect;

/** Photos on a page or a map place. The file is under UPLOADS_DIR; only its name is stored. */
export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pageId: integer('page_id').references(() => pages.id, { onDelete: 'cascade' }),
    placeId: text('place_id'),
    placeLayer: text('place_layer'),
    placeName: text('place_name'),
    placeLng: real('place_lng'),
    placeLat: real('place_lat'),
    /** File name inside UPLOADS_DIR. */
    file: text('file').notNull(),
    contentType: text('content_type').notNull(),
    caption: text('caption').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('photos_page_id').on(t.pageId), index('photos_place_id').on(t.placeId)],
);

export type PhotoRow = typeof photos.$inferSelect;

/**
 * `[[links]]` and `#tags` in pages, place notes and markers, parsed on save. They drive
 * backlinks and "In your notebook". Derived data: rebuilt from the texts on startup.
 */
export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceKind: text('source_kind', { enum: ['page', 'note', 'marker'] }).notNull(),
    sourceId: integer('source_id').notNull(),
    /** The linked name as names compare (`nameKey`). */
    targetKey: text('target_key').notNull(),
    /** As written. */
    targetTitle: text('target_title').notNull(),
    kind: text('kind', { enum: ['link', 'tag'] }).notNull(),
  },
  (t) => [
    index('links_target_key').on(t.targetKey),
    index('links_source').on(t.sourceKind, t.sourceId),
  ],
);

export type LinkRow = typeof links.$inferSelect;
