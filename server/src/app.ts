import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { archiveRouter } from './archive.js';
import type { Db } from './db/client.js';
import { errorHandler, HttpError } from './errors.js';
import { geocodeRouter } from './geocode.js';
import type { Geocoder } from './geocoder.js';
import { markersRouter } from './markers.js';
import { reindexLinks } from './notebook/sources.js';
import { notesRouter, placesRouter, referencesRouter } from './notes.js';
import { pagesRouter } from './pages.js';
import { photosRouter } from './photos.js';

export interface AppOptions {
  /** Serve the built client from this directory (production), so one process hosts everything. */
  clientDist?: string;
  /** Address lookups; without one, /api/geocode answers only from the cache. */
  geocoder?: Geocoder;
  /** Where photo files go (UPLOADS_DIR). */
  uploadsDir?: string;
  /** Where a restore saves a copy of the database first; none, no copy (tests). */
  backupDir?: string;
}

export function createApp(
  db: Db,
  { clientDist, geocoder, uploadsDir = 'uploads', backupDir }: AppOptions = {},
): express.Express {
  // The links table is derived from the texts; rebuilding it keeps it right after any change.
  reindexLinks(db);
  const app = express();
  app.disable('x-powered-by');
  // Gzip responses: the map data is large JSON (a county's streets run to 10 MB) that shrinks
  // several times over, which matters on a phone in the field.
  app.use(compression());
  // Before the JSON parser: a restore is far over its limit.
  app.use('/api', archiveRouter(db, uploadsDir, backupDir));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/markers', markersRouter(db));
  app.use('/api/geocode', geocodeRouter(db, geocoder));
  app.use('/api/pages', pagesRouter(db, uploadsDir));
  app.use('/api/notes', notesRouter(db));
  app.use('/api/places', placesRouter(db));
  app.use('/api/references', referencesRouter(db));
  app.use('/api/photos', photosRouter(db, uploadsDir));
  app.use('/api', () => {
    throw new HttpError(404, 'Not found');
  });

  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Single-page app: unknown paths get index.html.
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
