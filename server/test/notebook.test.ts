import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  Backup,
  Page,
  PageReferences,
  PlaceNote,
  PlaceNotebook,
  PlaceRef,
  Photo,
  RenameResult,
} from '@hunt/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/client.js';

let app: ReturnType<typeof createApp>;
let close: () => void;
let uploads: string;

beforeEach(() => {
  const opened = openDatabase(':memory:');
  close = opened.close;
  uploads = mkdtempSync(path.join(tmpdir(), 'hunt-uploads-'));
  app = createApp(opened.db, { uploadsDir: uploads });
});
afterEach(() => {
  close();
  rmSync(uploads, { recursive: true, force: true });
});

const fortChurchill: PlaceRef = {
  id: 'osm:way/1',
  layer: 'parks',
  name: 'Fort Churchill State Historic Park',
  lng: -119.27,
  lat: 39.29,
};

async function newPage(title: string, body = '', type = 'note'): Promise<Page> {
  const res = await request(app).post('/api/pages').send({ title, body, type }).expect(201);
  return res.body as Page;
}

async function refs(id: number): Promise<PageReferences> {
  return (await request(app).get(`/api/pages/${id}/references`).expect(200)).body as PageReferences;
}

describe('/api/pages', () => {
  it('opens a page by name, creating it the first time, in any spelling', async () => {
    const first = await request(app).post('/api/pages/open').send({ title: 'Clue 1' }).expect(201);
    const again = await request(app).post('/api/pages/open').send({ title: 'clue 1.' }).expect(200);
    expect((again.body as Page).id).toBe((first.body as Page).id);
    await request(app).post('/api/pages').send({ title: 'CLUE 1' }).expect(409);
  });

  it('lists linked and unlinked references from pages, map notes and markers', async () => {
    const dayton = await newPage('Dayton');
    await newPage('Trip', 'Drove to [[Dayton]] and #dayton\nLunch in dayton later.');
    await newPage('Old article', 'The Dayton mill burned in 1890.');
    await request(app)
      .post('/api/notes')
      .send({ place: fortChurchill, body: 'Supplies came from [[Dayton]].' })
      .expect(201);
    await request(app)
      .post('/api/markers')
      .send({ name: 'Mill site', description: 'Near Dayton', lat: 39.24, lng: -119.59 })
      .expect(201);

    const out = await refs(dayton.id);
    expect(out.linked.map((r) => `${r.source.kind}:${r.source.title}`).sort()).toEqual([
      'note:Fort Churchill State Historic Park',
      'page:Trip',
    ]);
    expect(out.linked.find((r) => r.source.title === 'Trip')?.snippets).toEqual([
      'Drove to [[Dayton]] and #dayton',
    ]);
    expect(out.unlinked.map((r) => r.source.title).sort()).toEqual([
      'Mill site',
      'Old article',
      'Trip',
    ]);

    // One click links the plain mentions in that text.
    const article = out.unlinked.find((r) => r.source.title === 'Old article')!.source;
    await request(app)
      .post('/api/references/link')
      .send({ kind: article.kind, id: article.id, title: 'Dayton' })
      .expect(200);
    const after = await refs(dayton.id);
    expect(after.linked.map((r) => r.source.title)).toContain('Old article');
  });

  it('renames a page and every link to it', async () => {
    const clue = await newPage('Clue 1', '', 'clue');
    const trip = await newPage('Trip', 'Thinking about [[clue 1]] and #[[Clue 1]].');
    const note = (
      await request(app)
        .post('/api/notes')
        .send({ place: fortChurchill, body: 'Fits [[Clue 1]]?' })
        .expect(201)
    ).body as PlaceNote;

    const res = await request(app)
      .patch(`/api/pages/${clue.id}`)
      .send({ title: 'Silver Clue' })
      .expect(200);
    expect((res.body as RenameResult).relinked).toBe(3);
    const tripNow = (await request(app).get(`/api/pages/${trip.id}`).expect(200)).body as Page;
    expect(tripNow.body).toBe('Thinking about [[Silver Clue]] and #[[Silver Clue]].');
    const notes = (await request(app).get('/api/notes').expect(200)).body as PlaceNote[];
    expect(notes.find((n) => n.id === note.id)?.body).toBe('Fits [[Silver Clue]]?');
    expect((await refs(clue.id)).linked).toHaveLength(2);
  });

  it('links the names picked after a capture', async () => {
    const page = await newPage(
      'Medallion found',
      'Found near Fort Churchill, not far from Dayton.',
    );
    const res = await request(app)
      .post(`/api/pages/${page.id}/link-names`)
      .send({ names: ['Fort Churchill', 'Dayton'] })
      .expect(200);
    expect((res.body as { page: Page }).page.body).toBe(
      'Found near [[Fort Churchill]], not far from [[Dayton]].',
    );
  });
});

describe('places in the notebook', () => {
  it('ties a page to a place and lists what mentions it', async () => {
    const opened = await request(app)
      .post('/api/pages/open')
      .send({ title: fortChurchill.name, place: fortChurchill })
      .expect(201);
    const page = opened.body as Page;
    expect(page).toMatchObject({ type: 'place', place: { id: 'osm:way/1' } });
    await newPage('Trip', 'Camped at [[Fort Churchill State Historic Park]].');
    await request(app).post('/api/notes').send({ place: fortChurchill, body: 'Gate at 8' });

    const nb = (
      await request(app)
        .get('/api/places/notebook')
        .query({ id: fortChurchill.id, name: fortChurchill.name })
        .expect(200)
    ).body as PlaceNotebook;
    expect(nb.page?.id).toBe(page.id);
    expect(nb.mentions.map((m) => m.title)).toEqual(['Trip']);
    expect(nb.notes.map((n) => n.body)).toEqual(['Gate at 8']);

    // Another place with the same name gets its own page, and the links stay with the first.
    const other = { ...fortChurchill, id: 'osm:way/2' };
    const second = await request(app)
      .post('/api/pages/open')
      .send({ title: other.name, place: other })
      .expect(201);
    expect((second.body as Page).title).toBe('Fort Churchill State Historic Park (2)');
    const otherNb = (
      await request(app)
        .get('/api/places/notebook')
        .query({ id: other.id, name: other.name })
        .expect(200)
    ).body as PlaceNotebook;
    expect(otherNb.page?.title).toBe('Fort Churchill State Historic Park (2)');
    expect(otherNb.mentions).toEqual([]);
  });
});

describe('photos', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

  it('stores a page photo as a file and removes it with the page', async () => {
    const page = await newPage('Site visit');
    const up = await request(app)
      .post('/api/photos')
      .query({ pageId: page.id, caption: 'Gate' })
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(201);
    const photo = up.body as Photo;
    expect(photo).toMatchObject({ pageId: page.id, caption: 'Gate' });
    expect(readdirSync(uploads)).toHaveLength(1);
    const file = await request(app).get(`/api/photos/${photo.id}/file`).expect(200);
    expect(file.headers['content-type']).toBe('image/png');

    await request(app).delete(`/api/pages/${page.id}`).expect(204);
    expect(readdirSync(uploads)).toHaveLength(0);
    expect((await request(app).get('/api/photos').expect(200)).body).toEqual([]);
  });

  it('puts a photo on a map place, and refuses other file types', async () => {
    await request(app)
      .post('/api/photos')
      .query({ place: JSON.stringify(fortChurchill) })
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(201);
    const nb = (
      await request(app)
        .get('/api/places/notebook')
        .query({ id: fortChurchill.id, name: fortChurchill.name })
    ).body as PlaceNotebook;
    expect(nb.photos).toHaveLength(1);
    await request(app)
      .post('/api/photos')
      .query({ place: JSON.stringify(fortChurchill) })
      .set('Content-Type', 'text/plain')
      .send('hello')
      .expect(415);
  });
});

describe('export and backup', () => {
  it('exports the notebook as Markdown', async () => {
    await newPage('Clue 1', 'Look near [[Dayton]].', 'clue');
    await request(app).post('/api/notes').send({ place: fortChurchill, body: 'Gate at 8' });
    const res = await request(app).get('/api/export/notebook.md').expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="?hunt-notebook-/);
    expect(res.text).toContain('### Clue 1\n\nType: Clue\n\nLook near [[Dayton]].');
    expect(res.text).toContain('### Fort Churchill State Historic Park');
  });

  it('backs up everything and restores it into an empty database', async () => {
    const page = await newPage('Clue 1', 'Look near [[Dayton]].', 'clue');
    await request(app)
      .post('/api/photos')
      .query({ pageId: page.id })
      .set('Content-Type', 'image/gif')
      .send(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))
      .expect(201);
    await request(app)
      .post('/api/markers')
      .send({ name: 'Mill', description: '[[Clue 1]]?', lat: 39.2, lng: -119.6 });
    const backup = (await request(app).get('/api/backup').expect(200)).body as Backup;
    expect(Object.keys(backup.files)).toHaveLength(1);

    // A fresh database and uploads folder, as on another computer.
    close();
    rmSync(uploads, { recursive: true, force: true });
    const opened = openDatabase(':memory:');
    close = opened.close;
    app = createApp(opened.db, { uploadsDir: uploads });
    const res = await request(app).post('/api/restore').send(backup).expect(200);
    expect(res.body).toMatchObject({ restored: { pages: 1, markers: 1, photos: 1 }, photos: 1 });
    expect(existsSync(uploads) && readdirSync(uploads)).toHaveLength(1);
    const restored = (await request(app).get('/api/pages').expect(200)).body as Page[];
    expect(restored[0]).toMatchObject({ title: 'Clue 1', body: 'Look near [[Dayton]].' });
    // Links are rebuilt, so the marker's link counts again.
    expect((await refs(restored[0]!.id)).linked.map((r) => r.source.title)).toEqual(['Mill']);
  });

  it('refuses a file that is not a backup', async () => {
    await request(app).post('/api/restore').send({ hello: 'world' }).expect(400);
  });
});
