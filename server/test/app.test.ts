import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/client.js';

let dist: string;
let close: () => void;
let app: ReturnType<typeof createApp>;

// A layer file big enough to be worth compressing.
const layer = JSON.stringify({
  type: 'FeatureCollection',
  features: Array.from({ length: 200 }, (_, i) => ({
    type: 'Feature',
    properties: { id: `osm:way/${i}`, name: `Road ${i}`, kind: 'local' },
    geometry: { type: 'Point', coordinates: [-119.25, 39.6] },
  })),
});

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'hunt-dist-'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Hunt map</title>');
  mkdirSync(path.join(dist, 'data', 'lyon'), { recursive: true });
  writeFileSync(path.join(dist, 'data', 'lyon', 'streets.geojson'), layer);
  const opened = openDatabase(':memory:');
  close = opened.close;
  app = createApp(opened.db, { clientDist: dist });
});
afterAll(() => {
  close();
  rmSync(dist, { recursive: true, force: true });
});

describe('compression', () => {
  it('gzips map data for browsers that accept it, unchanged once decoded', async () => {
    const res = await request(app)
      .get('/data/lyon/streets.geojson')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.stringify(res.body)).toBe(layer);
  });

  it('sends plain data to clients that ask for no encoding', async () => {
    const res = await request(app)
      .get('/data/lyon/streets.geojson')
      .set('Accept-Encoding', 'identity')
      .expect(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.stringify(res.body)).toBe(layer);
  });
});
