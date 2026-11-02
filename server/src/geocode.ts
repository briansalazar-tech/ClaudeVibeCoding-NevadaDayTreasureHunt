import { geocodeQuerySchema, type GeocodeResponse } from '@hunt/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from './db/client.js';
import { geocodeCache } from './db/schema.js';
import { HttpError } from './errors.js';
import { GeocodeError, type GeocodeOutcome, type Geocoder } from './geocoder.js';

export function cacheKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** /api/geocode?q=: address search, answered from the SQLite cache when it can be. */
export function geocodeRouter(db: Db, geocoder: Geocoder | undefined): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { q } = geocodeQuerySchema.parse(req.query);
    const key = cacheKey(q);
    const hit = db.select().from(geocodeCache).where(eq(geocodeCache.query, key)).get();
    if (hit) {
      const stored = JSON.parse(hit.results) as Omit<GeocodeOutcome, 'source'>;
      const body: GeocodeResponse = {
        ...stored,
        source: hit.source as GeocodeResponse['source'],
        cached: true,
      };
      res.json(body);
      return;
    }
    if (!geocoder) throw new HttpError(503, 'Address search isn’t set up on this server');
    let outcome: GeocodeOutcome;
    try {
      outcome = await geocoder.search(q);
    } catch (err) {
      if (err instanceof GeocodeError) throw new HttpError(502, err.message);
      throw err;
    }
    db.insert(geocodeCache)
      .values({
        query: key,
        source: outcome.source,
        results: JSON.stringify({ results: outcome.results, outside: outcome.outside }),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    const body: GeocodeResponse = { ...outcome, cached: false };
    res.json(body);
  });

  return router;
}
