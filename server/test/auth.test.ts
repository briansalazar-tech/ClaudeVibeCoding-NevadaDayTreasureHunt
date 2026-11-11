import type {
  AuditEntry,
  AuthStatus,
  Backup,
  Comment,
  Marker,
  Page,
  PageReferences,
  PlaceNote,
  PlaceRef,
  TemporaryPassword,
  UserSummary,
} from '@hunt/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { lowerPasswordCostForTests } from '../src/auth/passwords.js';
import { openDatabase } from '../src/db/client.js';
import { markers, users } from '../src/db/schema.js';
import { OTHER_PASSWORD, PASSWORD, SETUP_CODE, testApp, type TestApp } from './helpers.js';

let t: TestApp;

afterEach(() => t?.close());

const fortChurchill: PlaceRef = {
  id: 'osm:way/1',
  layer: 'parks',
  name: 'Fort Churchill State Historic Park',
  lng: -119.27,
  lat: 39.29,
};

describe('first-run setup', () => {
  let close: () => void;
  afterEach(() => close());

  function freshApp() {
    lowerPasswordCostForTests();
    const opened = openDatabase(':memory:');
    close = opened.close;
    return { app: createApp(opened.db, { setupCode: SETUP_CODE }), db: opened.db };
  }

  it('needs the code from the console and a strong password, and only works once', async () => {
    const { app, db } = freshApp();
    // Content from before accounts goes to the super admin.
    const now = new Date().toISOString();
    db.insert(markers)
      .values({ name: 'Old mill', lat: 39.2, lng: -119.6, createdAt: now, updatedAt: now })
      .run();
    const status = (await request(app).get('/api/auth/status').expect(200)).body as AuthStatus;
    expect(status).toEqual({ setupNeeded: true, user: null });

    const input = { firstName: 'Brian', lastName: 'Salazar', password: PASSWORD };
    await request(app)
      .post('/api/auth/setup')
      .send({ ...input, setupCode: 'WRONG-CODE' })
      .expect(403);
    const weak = await request(app)
      .post('/api/auth/setup')
      .send({ ...input, setupCode: SETUP_CODE, password: 'brian salazar 1' })
      .expect(400);
    expect((weak.body as { error: string }).error).toMatch(/name/);
    await request(app)
      .post('/api/auth/setup')
      .send({ ...input, setupCode: SETUP_CODE, password: 'password1234' })
      .expect(400);

    const agent = request.agent(app);
    // Dashes, case and spaces in the code don't matter.
    const res = await agent
      .post('/api/auth/setup')
      .send({ ...input, setupCode: 'test code 2026' })
      .expect(201);
    expect(res.body).toMatchObject({
      user: { username: 'brian.salazar', name: 'Brian Salazar', role: 'super-admin' },
    });
    expect(res.headers['set-cookie']?.[0]).toMatch(/hunt_session=.+HttpOnly; SameSite=Lax/);
    const list = (await agent.get('/api/markers').expect(200)).body as Marker[];
    expect(list[0]!.createdBy).toBe((res.body as { user: { id: number } }).user.id);

    await request(app)
      .post('/api/auth/setup')
      .send({ ...input, setupCode: SETUP_CODE })
      .expect(409);
  });

  it('is refused without a setup code configured', async () => {
    lowerPasswordCostForTests();
    const opened = openDatabase(':memory:');
    close = opened.close;
    const app = createApp(opened.db);
    await request(app)
      .post('/api/auth/setup')
      .send({ firstName: 'A', lastName: 'B', password: PASSWORD, setupCode: 'anything' })
      .expect(403);
  });
});

describe('signing in', () => {
  beforeEach(async () => {
    t = await testApp();
  });

  it('keeps everything behind sign-in', async () => {
    const anon = request(t.app);
    for (const url of [
      '/api/pages',
      '/api/notes',
      '/api/markers',
      '/api/photos/1/file',
      '/api/geocode?q=Main+Street',
      '/api/export/notebook.md',
      '/api/backup',
      '/api/users/directory',
      '/api/comments?targetKind=page&targetId=1',
      '/api/audit',
      '/api/places/notebook?id=x',
    ]) {
      await anon.get(url).expect(401);
    }
    await anon.post('/api/pages').send({ title: 'X' }).expect(401);
    await anon.get('/api/health').expect(200);
    const status = (await anon.get('/api/auth/status').expect(200)).body as AuthStatus;
    expect(status).toEqual({ setupNeeded: false, user: null });
  });

  it('ignores case in the username and says the same for a wrong name or password', async () => {
    const agent = request.agent(t.app);
    const wrongName = await agent
      .post('/api/auth/sign-in')
      .send({ username: 'nobody.here', password: PASSWORD })
      .expect(401);
    const wrongPassword = await agent
      .post('/api/auth/sign-in')
      .send({ username: 'sam.owner', password: 'Not-The-Password-99' })
      .expect(401);
    expect(wrongName.body).toEqual(wrongPassword.body);
    await agent
      .post('/api/auth/sign-in')
      .send({ username: 'Sam.Owner', password: PASSWORD })
      .expect(200);
    await agent.get('/api/pages').expect(200);
    await agent.post('/api/auth/sign-out').expect(204);
    await agent.get('/api/pages').expect(401);
  });

  it('locks a username after five wrong passwords', async () => {
    const anon = request(t.app);
    for (let i = 0; i < 5; i++)
      await anon
        .post('/api/auth/sign-in')
        .send({ username: 'sam.owner', password: `Wrong-guess-${i}` })
        .expect(401);
    const locked = await anon
      .post('/api/auth/sign-in')
      .send({ username: 'sam.owner', password: PASSWORD })
      .expect(429);
    expect((locked.body as { error: string }).error).toMatch(/Too many attempts/);
  });

  it('lets the super admin unlock a locked-out user, and a reset unlocks too', async () => {
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const member = await t.addUser('Max', 'Member');
    const anon = request(t.app);
    const lockOut = async () => {
      for (let i = 0; i < 5; i++)
        await anon
          .post('/api/auth/sign-in')
          .send({ username: member.user.username, password: `Wrong-guess-${i}` })
          .expect(401);
    };
    await lockOut();
    const signIn = (password: string) =>
      anon.post('/api/auth/sign-in').send({ username: member.user.username, password });
    await signIn(OTHER_PASSWORD).expect(429);

    const list = await t.owner.get('/api/users').expect(200);
    const row = (list.body as UserSummary[]).find((u) => u.id === member.user.id);
    expect(row?.lockedUntil).toBeTruthy();
    await admin.agent.post(`/api/users/${member.user.id}/unlock`).expect(403);
    await member.agent.post(`/api/users/${member.user.id}/unlock`).expect(403);
    await t.owner.post(`/api/users/${member.user.id}/unlock`).expect(200);
    const after = await t.owner.get('/api/users').expect(200);
    expect((after.body as UserSummary[]).find((u) => u.id === member.user.id)?.lockedUntil).toBe(
      null,
    );
    await signIn(OTHER_PASSWORD).expect(200);

    // A new temporary password from an admin works at once, lockout or not.
    await lockOut();
    const reset = await admin.agent.post(`/api/users/${member.user.id}/reset-password`).expect(200);
    await signIn((reset.body as TemporaryPassword).temporaryPassword).expect(200);

    const log = await t.owner.get('/api/audit').expect(200);
    expect((log.body as AuditEntry[]).map((e) => e.action)).toContain('user-unlocked');
  });

  it('refuses changes sent from another site', async () => {
    await t.owner
      .post('/api/pages')
      .set('Origin', 'https://evil.example')
      .send({ title: 'Forged' })
      .expect(403);
    await t.owner
      .post('/api/pages')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ title: 'Forged' })
      .expect(403);
    // The app's own pages: the Origin matches the host the request went to.
    await t.owner
      .post('/api/pages')
      .set('Host', 'hunt.local:5173')
      .set('Origin', 'http://hunt.local:5173')
      .send({ title: 'Mine' })
      .expect(201);
  });

  it('accepts changes from APP_URL', async () => {
    t.close();
    t = await testApp({ appUrl: 'https://hunt.example.org' });
    await t.owner
      .post('/api/pages')
      .set('Origin', 'https://hunt.example.org')
      .send({ title: 'From the app' })
      .expect(201);
  });

  it('sets security headers', async () => {
    const res = await request(t.app).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe('temporary passwords', () => {
  beforeEach(async () => {
    t = await testApp();
  });

  async function addMember(firstName = 'John', lastName = 'Smith') {
    const res = await t.owner.post('/api/users').send({ firstName, lastName }).expect(201);
    return res.body as TemporaryPassword;
  }

  it('builds firstname.lastname usernames, numbering a second person with the same name', async () => {
    expect((await addMember()).user.username).toBe('john.smith');
    expect((await addMember('John', 'Smith')).user.username).toBe('john.smith2');
    expect((await addMember('Mary Jane', 'O’Brien')).user.username).toBe('mary-jane.obrien');
    expect((await addMember('José', 'Núñez')).user.username).toBe('jose.nunez');
    await t.owner.post('/api/users').send({ firstName: '42', lastName: 'Smith' }).expect(400);
  });

  it('allows nothing but choosing a new password until it is changed', async () => {
    const temp = await addMember();
    expect(temp.temporaryPassword).toMatch(/^(\w{4}-){3}\w{4}$/);
    const agent = request.agent(t.app);
    const signedIn = await agent
      .post('/api/auth/sign-in')
      .send({ username: 'john.smith', password: temp.temporaryPassword })
      .expect(200);
    expect(signedIn.body).toMatchObject({ user: { mustChangePassword: true } });
    const blocked = await agent.get('/api/pages').expect(403);
    expect(blocked.body).toMatchObject({ code: 'password-change-required' });

    for (const weak of ['short1A!', 'John Smith 2026!!', 'smithjohn-99999', 'qwertyuiop123456'])
      await agent.post('/api/auth/password').send({ newPassword: weak }).expect(400);
    await agent
      .post('/api/auth/password')
      .send({ newPassword: temp.temporaryPassword })
      .expect(400);
    await agent.post('/api/auth/password').send({ newPassword: OTHER_PASSWORD }).expect(200);
    await agent.get('/api/pages').expect(200);
  });

  it('stops working when it expires', async () => {
    const temp = await addMember();
    t.db
      .update(users)
      .set({ temporaryExpiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(users.id, temp.user.id))
      .run();
    const res = await request(t.app)
      .post('/api/auth/sign-in')
      .send({ username: 'john.smith', password: temp.temporaryPassword })
      .expect(401);
    expect((res.body as { error: string }).error).toMatch(/expired/);
  });

  it('needs the current password to change it, and signs out other sessions', async () => {
    const other = request.agent(t.app);
    await other.post('/api/auth/sign-in').send({ username: 'sam.owner', password: PASSWORD });
    await t.owner
      .post('/api/auth/password')
      .send({ currentPassword: 'wrong one', newPassword: OTHER_PASSWORD })
      .expect(400);
    await t.owner
      .post('/api/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: OTHER_PASSWORD })
      .expect(200);
    await t.owner.get('/api/pages').expect(200);
    await other.get('/api/pages').expect(401);
  });
});

describe('roles', () => {
  beforeEach(async () => {
    t = await testApp();
  });

  it('lets admins add members and reset passwords, but not promote or touch the super admin', async () => {
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const admin2 = await t.addUser('Abe', 'Admin', 'admin');
    const member = await t.addUser('Max', 'Member');

    const added = await admin.agent
      .post('/api/users')
      .send({ firstName: 'New', lastName: 'Person' })
      .expect(201);
    expect((added.body as TemporaryPassword).user.role).toBe('member');
    await admin.agent.post(`/api/users/${member.user.id}/reset-password`).expect(200);
    await admin.agent.post(`/api/users/${admin2.user.id}/reset-password`).expect(200);
    await admin.agent.post(`/api/users/${t.ownerUser.id}/reset-password`).expect(403);
    await admin.agent.put(`/api/users/${member.user.id}/role`).send({ role: 'admin' }).expect(403);
    await admin.agent.post(`/api/users/${admin2.user.id}/disable`).expect(403);
    await admin.agent.delete(`/api/users/${member.user.id}`).expect(403);
    await admin.agent.get('/api/audit').expect(403);

    // A reset signs the member out.
    await member.agent.get('/api/pages').expect(401);
  });

  it('keeps members out of account management', async () => {
    const member = await t.addUser('Max', 'Member');
    await member.agent.get('/api/users').expect(403);
    await member.agent.post('/api/users').send({ firstName: 'A', lastName: 'B' }).expect(403);
    await member.agent.post(`/api/users/${t.ownerUser.id}/disable`).expect(403);
    await member.agent.get('/api/users/directory').expect(200);
  });

  it('lets admins disable members, which signs them out at once', async () => {
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const member = await t.addUser('Max', 'Member');
    await admin.agent.post(`/api/users/${member.user.id}/disable`).expect(200);
    await member.agent.get('/api/pages').expect(401);
    await request(t.app)
      .post('/api/auth/sign-in')
      .send({ username: 'max.member', password: OTHER_PASSWORD })
      .expect(403);
    await admin.agent.post(`/api/users/${member.user.id}/enable`).expect(200);
    await request(t.app)
      .post('/api/auth/sign-in')
      .send({ username: 'max.member', password: OTHER_PASSWORD })
      .expect(200);
  });

  it('gives the super admin promote, demote, disable and remove, and nobody power over them', async () => {
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const member = await t.addUser('Max', 'Member');
    await t.owner.put(`/api/users/${member.user.id}/role`).send({ role: 'admin' }).expect(200);
    await t.owner.put(`/api/users/${member.user.id}/role`).send({ role: 'member' }).expect(200);
    await t.owner.post(`/api/users/${admin.user.id}/disable`).expect(200);
    await t.owner.post(`/api/users/${admin.user.id}/enable`).expect(200);
    await t.owner.put(`/api/users/${t.ownerUser.id}/role`).send({ role: 'member' }).expect(403);
    await t.owner.post(`/api/users/${t.ownerUser.id}/disable`).expect(403);
    await t.owner.delete(`/api/users/${t.ownerUser.id}`).expect(403);

    // Removed: can't sign in, but still has a name for their content.
    await member.agent.post('/api/notes').send({ place: fortChurchill, body: 'Gate at 8' });
    await t.owner.delete(`/api/users/${member.user.id}`).expect(204);
    await member.agent.get('/api/pages').expect(401);
    await request(t.app)
      .post('/api/auth/sign-in')
      .send({ username: 'max.member', password: OTHER_PASSWORD })
      .expect(401);
    const people = (await t.owner.get('/api/users/directory').expect(200)).body as {
      name: string;
      removed: boolean;
    }[];
    expect(people.find((p) => p.name === 'Max Member')).toMatchObject({ removed: true });
    const list = (await t.owner.get('/api/users').expect(200)).body as UserSummary[];
    expect(list.find((u) => u.username === 'max.member')).toMatchObject({ removed: true });

    const log = (await t.owner.get('/api/audit').expect(200)).body as AuditEntry[];
    expect(log.map((e) => e.action)).toEqual([
      'user-removed',
      'user-enabled',
      'user-disabled',
      'role-changed',
      'role-changed',
      'user-added',
      'role-changed',
      'user-added',
      'setup',
    ]);
    expect(log[4]).toMatchObject({ detail: 'Member → Admin', actorId: t.ownerUser.id });
  });

  it('keeps passwords out of backups and restores to the super admin alone', async () => {
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const member = await t.addUser('Max', 'Member');
    await member.agent.get('/api/backup').expect(403);
    const backup = await admin.agent.get('/api/backup').expect(200);
    expect(backup.text).not.toMatch(/scrypt|passwordHash|password_hash/);
    expect((backup.body as Backup).authors?.map((a) => a.username)).toContain('max.member');
    await admin.agent.post('/api/restore').send(backup.body).expect(403);
    await t.owner.post('/api/restore').send(backup.body).expect(200);
    const log = (await t.owner.get('/api/audit').expect(200)).body as AuditEntry[];
    expect(log[0]!.action).toBe('restore');
  });
});

describe('authors and permissions', () => {
  beforeEach(async () => {
    t = await testApp();
  });

  it('lets only the author or an admin change a page', async () => {
    const member = await t.addUser('Max', 'Member');
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    const ownerPage = (
      await t.owner.post('/api/pages').send({ title: 'Clue 1', body: 'Owner text' }).expect(201)
    ).body as Page;
    expect(ownerPage).toMatchObject({ createdBy: t.ownerUser.id, version: 1 });
    await member.agent.patch(`/api/pages/${ownerPage.id}`).send({ body: 'Mine now' }).expect(403);
    await member.agent.delete(`/api/pages/${ownerPage.id}`).expect(403);
    await member.agent
      .post(`/api/pages/${ownerPage.id}/link-names`)
      .send({ names: [] })
      .expect(403);

    const memberPage = (
      await member.agent.post('/api/pages').send({ title: 'Max notes' }).expect(201)
    ).body as Page;
    await member.agent
      .patch(`/api/pages/${memberPage.id}`)
      .send({ body: 'See [[Clue 1]]' })
      .expect(200);
    const edited = await admin.agent
      .patch(`/api/pages/${memberPage.id}`)
      .send({ body: 'Tidied by Ada' })
      .expect(200);
    expect((edited.body as { page: Page }).page).toMatchObject({
      createdBy: member.user.id,
      updatedBy: admin.user.id,
      version: 3,
    });

    // A rename by its author still fixes links in other people's pages.
    await member.agent
      .patch(`/api/pages/${memberPage.id}`)
      .send({ body: 'See [[Clue 1]]' })
      .expect(200);
    const renamed = await t.owner
      .patch(`/api/pages/${ownerPage.id}`)
      .send({ title: 'Clue One' })
      .expect(200);
    expect((renamed.body as { relinked: number }).relinked).toBe(1);

    await admin.agent.delete(`/api/pages/${memberPage.id}`).expect(204);
  });

  it('refuses a save made from an older version of the page', async () => {
    const page = (await t.owner.post('/api/pages').send({ title: 'Clue 1' }).expect(201))
      .body as Page;
    const admin = await t.addUser('Ada', 'Admin', 'admin');
    await admin.agent
      .patch(`/api/pages/${page.id}`)
      .send({ body: 'Ada was here', baseVersion: 1 })
      .expect(200);
    const conflict = await t.owner
      .patch(`/api/pages/${page.id}`)
      .send({ body: 'Sam was here', baseVersion: 1 })
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'page-changed',
      page: { body: 'Ada was here', version: 2 },
    });
    // A change that isn't to the text doesn't conflict, or count as a new version.
    const typed = await t.owner.patch(`/api/pages/${page.id}`).send({ type: 'clue' }).expect(200);
    expect((typed.body as { page: Page }).page.version).toBe(2);
    await t.owner
      .patch(`/api/pages/${page.id}`)
      .send({ body: 'Sam was here', baseVersion: 2 })
      .expect(200);
  });

  it('lets anyone note, photograph and comment, and only authors or admins change them', async () => {
    const member = await t.addUser('Max', 'Member');
    const note = (
      await t.owner.post('/api/notes').send({ place: fortChurchill, body: 'Gate at 8' }).expect(201)
    ).body as PlaceNote;
    expect(note.createdBy).toBe(t.ownerUser.id);
    await member.agent.patch(`/api/notes/${note.id}`).send({ body: 'Gate at 9' }).expect(403);
    await member.agent.delete(`/api/notes/${note.id}`).expect(403);

    const page = (await t.owner.post('/api/pages').send({ title: 'Dayton', body: '' }).expect(201))
      .body as Page;
    const comment = (
      await member.agent
        .post('/api/comments')
        .send({ targetKind: 'note', targetId: note.id, body: 'Also near [[Dayton]]' })
        .expect(201)
    ).body as Comment;
    expect(comment.createdBy).toBe(member.user.id);
    await member.agent
      .post('/api/comments')
      .send({ targetKind: 'page', targetId: 999, body: 'Nowhere' })
      .expect(404);
    // A comment's links are references to the page.
    const refs = (await t.owner.get(`/api/pages/${page.id}/references`).expect(200))
      .body as PageReferences;
    expect(refs.linked.map((r) => [r.source.kind, r.source.title])).toEqual([
      ['comment', 'Fort Churchill State Historic Park'],
    ]);
    const notebook = await t.owner
      .get('/api/places/notebook')
      .query({ id: fortChurchill.id, name: fortChurchill.name })
      .expect(200);
    expect((notebook.body as { commentCounts: Record<number, number> }).commentCounts).toEqual({
      [note.id]: 1,
    });

    const ownComment = (
      await t.owner
        .post('/api/comments')
        .send({ targetKind: 'page', targetId: page.id, body: 'Owner comment' })
        .expect(201)
    ).body as Comment;
    await member.agent
      .patch(`/api/comments/${ownComment.id}`)
      .send({ body: 'Changed' })
      .expect(403);
    await member.agent
      .patch(`/api/comments/${comment.id}`)
      .send({ body: 'Also near Dayton' })
      .expect(200);
    await t.owner.delete(`/api/comments/${comment.id}`).expect(204);

    // Deleting the note deletes its comments; deleting a page deletes its.
    await t.owner
      .post('/api/comments')
      .send({ targetKind: 'note', targetId: note.id, body: 'Bye' })
      .expect(201);
    await t.owner.delete(`/api/notes/${note.id}`).expect(204);
    await t.owner.delete(`/api/pages/${page.id}`).expect(204);
    for (const [kind, id] of [
      ['note', note.id],
      ['page', page.id],
    ] as const) {
      const left = await t.owner
        .get('/api/comments')
        .query({ targetKind: kind, targetId: id })
        .expect(200);
      expect(left.body).toEqual([]);
    }
  });

  it('keeps notes on a custom marker after the marker is deleted', async () => {
    const member = await t.addUser('Max', 'Member');
    const marker = (
      await t.owner
        .post('/api/markers')
        .send({ name: 'Culvert', lat: 39.6, lng: -119.25 })
        .expect(201)
    ).body as Marker;
    expect(marker.createdBy).toBe(t.ownerUser.id);
    await member.agent.patch(`/api/markers/${marker.id}`).send({ name: 'Mine' }).expect(403);
    await member.agent.delete(`/api/markers/${marker.id}`).expect(403);

    const place: PlaceRef = {
      id: `marker:${marker.id}`,
      layer: 'custom',
      name: 'Culvert',
      lng: -119.25,
      lat: 39.6,
    };
    await member.agent.post('/api/notes').send({ place, body: 'Checked it' }).expect(201);
    await member.agent
      .post('/api/photos')
      .query({ place: JSON.stringify(place) })
      .set('Content-Type', 'image/gif')
      .send(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))
      .expect(201);
    await t.owner.delete(`/api/markers/${marker.id}`).expect(204);
    const notes = (await t.owner.get('/api/notes').query({ placeId: place.id }).expect(200))
      .body as PlaceNote[];
    expect(notes).toMatchObject([{ body: 'Checked it', createdBy: member.user.id }]);
  });

  it('lets only the page author, the uploader or an admin change a page photo', async () => {
    const member = await t.addUser('Max', 'Member');
    const page = (await t.owner.post('/api/pages').send({ title: 'Clue 1' }).expect(201))
      .body as Page;
    const gif = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
    await member.agent
      .post('/api/photos')
      .query({ pageId: page.id })
      .set('Content-Type', 'image/gif')
      .send(gif)
      .expect(403);
    const photo = await t.owner
      .post('/api/photos')
      .query({ pageId: page.id })
      .set('Content-Type', 'image/gif')
      .send(gif)
      .expect(201);
    const id = (photo.body as { id: number }).id;
    await member.agent.delete(`/api/photos/${id}`).expect(403);
    await t.owner.delete(`/api/photos/${id}`).expect(204);
  });

  it('reads the image type from the bytes, not the header', async () => {
    await t.owner
      .post('/api/photos')
      .query({ place: JSON.stringify(fortChurchill) })
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<script>alert(1)</script>'))
      .expect(415);
    const gif = await t.owner
      .post('/api/photos')
      .query({ place: JSON.stringify(fortChurchill) })
      .set('Content-Type', 'image/png')
      .send(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))
      .expect(201);
    expect(gif.body).toMatchObject({ contentType: 'image/gif' });
  });

  it('lets only the author or an admin link mentions in a text', async () => {
    const member = await t.addUser('Max', 'Member');
    const page = (
      await t.owner.post('/api/pages').send({ title: 'Notes', body: 'Went to Dayton' }).expect(201)
    ).body as Page;
    await member.agent
      .post('/api/references/link')
      .send({ kind: 'page', id: page.id, title: 'Dayton' })
      .expect(403);
    await t.owner
      .post('/api/references/link')
      .send({ kind: 'page', id: page.id, title: 'Dayton' })
      .expect(200);
  });
});
