import type { CurrentUser, TemporaryPassword } from '@hunt/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type AppOptions } from '../src/app.js';
import { lowerPasswordCostForTests } from '../src/auth/passwords.js';
import { openDatabase } from '../src/db/client.js';
import type { Db } from '../src/db/client.js';

export const SETUP_CODE = 'TEST-CODE-2026';
/** Strong enough for the password check, and not anyone's name. */
export const PASSWORD = 'Sagebrush-Lantern-Quarry-71';
export const OTHER_PASSWORD = 'Copper Kettle Mesa Drift 58';

export type Agent = ReturnType<typeof request.agent>;

export interface TestApp {
  app: ReturnType<typeof createApp>;
  db: Db;
  close: () => void;
  /** Signed in as the super admin, Sam Owner (sam.owner). */
  owner: Agent;
  ownerUser: CurrentUser;
  /** Adds a user (signed in, password changed), as a member or promoted to admin. */
  addUser: (
    firstName: string,
    lastName: string,
    role?: 'member' | 'admin',
  ) => Promise<{ agent: Agent; user: CurrentUser }>;
}

/** An app on an in-memory database, set up with a super admin who is signed in. */
export async function testApp(options: AppOptions = {}): Promise<TestApp> {
  lowerPasswordCostForTests();
  const opened = openDatabase(':memory:');
  const db = opened.db;
  // Photo uploads go to a temporary folder unless the test brings its own.
  const uploads = options.uploadsDir ? null : mkdtempSync(path.join(tmpdir(), 'hunt-uploads-'));
  const close = () => {
    opened.close();
    if (uploads) rmSync(uploads, { recursive: true, force: true });
  };
  const app = createApp(db, {
    setupCode: SETUP_CODE,
    ...options,
    uploadsDir: options.uploadsDir ?? uploads ?? undefined,
  });
  const owner = request.agent(app);
  const setup = await owner
    .post('/api/auth/setup')
    .send({ setupCode: SETUP_CODE, firstName: 'Sam', lastName: 'Owner', password: PASSWORD })
    .expect(201);
  const ownerUser = (setup.body as { user: CurrentUser }).user;

  const addUser: TestApp['addUser'] = async (firstName, lastName, role = 'member') => {
    const added = await owner.post('/api/users').send({ firstName, lastName }).expect(201);
    const temp = added.body as TemporaryPassword;
    if (role === 'admin')
      await owner.put(`/api/users/${temp.user.id}/role`).send({ role: 'admin' }).expect(200);
    const agent = request.agent(app);
    await agent
      .post('/api/auth/sign-in')
      .send({ username: temp.user.username, password: temp.temporaryPassword })
      .expect(200);
    const changed = await agent
      .post('/api/auth/password')
      .send({ newPassword: OTHER_PASSWORD })
      .expect(200);
    return { agent, user: (changed.body as { user: CurrentUser }).user };
  };

  return { app, db, close, owner, ownerUser, addUser };
}
