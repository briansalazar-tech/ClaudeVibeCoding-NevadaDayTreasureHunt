import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { archiveRouter } from './archive.js';
import { authRouter } from './auth/routes.js';
import { authenticate, requireUser, sameOrigin } from './auth/sessions.js';
import { commentsRouter } from './comments.js';
import type { Db } from './db/client.js';
import { errorHandler, HttpError } from './errors.js';
import { geocodeRouter } from './geocode.js';
import type { Geocoder } from './geocoder.js';
import { markersRouter } from './markers.js';
import { reindexLinks } from './notebook/sources.js';
import { notesRouter, placesRouter, referencesRouter } from './notes.js';
import { pagesRouter } from './pages.js';
import { photosRouter } from './photos.js';
import { auditRouter, usersRouter } from './users.js';

/** Where the map's tiles, styles and fonts come from (client/src/map/basemaps.ts). */
const TILE_HOSTS = ['https://tiles.openfreemap.org', 'https://basemap.nationalmap.gov'];

export interface AppOptions {
  /** Serve the built client from this directory (production), so one process hosts everything. */
  clientDist?: string;
  /** Address lookups; without one, /api/geocode answers only from the cache. */
  geocoder?: Geocoder;
  /** Where photo files go (UPLOADS_DIR). */
  uploadsDir?: string;
  /** Where a restore saves a copy of the database first; none, no copy (tests). */
  backupDir?: string;
  /** The first-run code for creating the super admin (printed to the console at startup). */
  setupCode?: string;
  /** The address users open (APP_URL): requests that change data must come from it or the host. */
  appUrl?: string;
  /** Express's `trust proxy` (TRUST_PROXY), behind a hosting proxy that terminates HTTPS. */
  trustProxy?: string | boolean | number;
}

export function createApp(
  db: Db,
  {
    clientDist,
    geocoder,
    uploadsDir = 'uploads',
    backupDir,
    setupCode,
    appUrl,
    trustProxy = false,
  }: AppOptions = {},
): express.Express {
  // The links table is derived from the texts; rebuilding it keeps it right after any change.
  reindexLinks(db);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // MapLibre and React set inline styles.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', ...TILE_HOSTS],
          connectSrc: ["'self'", ...TILE_HOSTS],
          workerSrc: ["'self'", 'blob:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          // Upgrading would break plain-HTTP use on your own PC or network; a host with HTTPS
          // redirects instead.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  // Gzip responses: the map data is large JSON (a county's streets run to 10 MB) that shrinks
  // several times over, which matters on a phone in the field.
  app.use(compression());

  app.use('/api', sameOrigin(appUrl));
  app.use('/api', authenticate(db));
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', express.json({ limit: '100kb' }), authRouter(db, { setupCode }));
  // Everything else under /api needs a signed-in user.
  app.use('/api', requireUser);
  // Before the JSON parser: a restore is far over its limit.
  app.use('/api', archiveRouter(db, uploadsDir, backupDir));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/users', usersRouter(db));
  app.use('/api/audit', auditRouter(db));
  app.use('/api/markers', markersRouter(db));
  app.use('/api/comments', commentsRouter(db));
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
