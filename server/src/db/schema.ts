import { MARKER_STATUSES } from '@hunt/shared';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
