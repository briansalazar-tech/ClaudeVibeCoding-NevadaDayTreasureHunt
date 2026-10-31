import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Db } from './db/client.js';
import { errorHandler, HttpError } from './errors.js';
import { markersRouter } from './markers.js';

export interface AppOptions {
  /** Serve the built client from this directory (production), so one process hosts everything. */
  clientDist?: string;
}

export function createApp(db: Db, { clientDist }: AppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/markers', markersRouter(db));
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
