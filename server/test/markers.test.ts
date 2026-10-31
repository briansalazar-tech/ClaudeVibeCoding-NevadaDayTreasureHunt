import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Marker } from '@hunt/shared';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/client.js';

let app: ReturnType<typeof createApp>;
let close: () => void;

beforeEach(() => {
  const opened = openDatabase(':memory:');
  close = opened.close;
  app = createApp(opened.db);
});
afterEach(() => close());

const fernley = { name: 'Check the culvert', lat: 39.6081, lng: -119.2518 };

describe('/api/markers', () => {
  it('creates a marker with defaults and lists it', async () => {
    const created = await request(app).post('/api/markers').send(fernley).expect(201);
    expect(created.body).toMatchObject({
      id: 1,
      name: 'Check the culvert',
      description: '',
      status: 'to-check',
      layer: 'custom',
      lat: 39.6081,
      lng: -119.2518,
    });
    const list = await request(app).get('/api/markers').expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('edits a marker', async () => {
    await request(app).post('/api/markers').send(fernley).expect(201);
    const edited = await request(app)
      .patch('/api/markers/1')
      .send({ status: 'clue-fits', layer: 'parks', description: 'Near [[Out of Town Park]]' })
      .expect(200);
    expect(edited.body).toMatchObject({
      status: 'clue-fits',
      layer: 'parks',
      name: 'Check the culvert',
    });
    const body = edited.body as Marker;
    expect(body.updatedAt >= body.createdAt).toBe(true);
  });

  it('deletes a marker', async () => {
    await request(app).post('/api/markers').send(fernley).expect(201);
    await request(app).delete('/api/markers/1').expect(204);
    await request(app).delete('/api/markers/1').expect(404);
    expect((await request(app).get('/api/markers')).body).toEqual([]);
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/api/markers')
      .send({ name: ' ', lat: 120, lng: 0 })
      .expect(400);
    expect((res.body as { error: string }).error).toMatch(/name/i);
    await request(app)
      .post('/api/markers')
      .send({ ...fernley, status: 'maybe' })
      .expect(400);
    await request(app)
      .post('/api/markers')
      .send({ ...fernley, layer: 'nowhere' })
      .expect(400);
    await request(app).patch('/api/markers/1').send({ name: 'x' }).expect(404);
    await request(app).patch('/api/markers/abc').send({ name: 'x' }).expect(404);
  });

  it('answers unknown API paths with JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
