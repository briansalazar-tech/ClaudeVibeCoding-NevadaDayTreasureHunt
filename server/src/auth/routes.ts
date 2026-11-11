import {
  changePasswordSchema,
  setupSchema,
  signInSchema,
  type AuthStatus,
  type CurrentUser,
} from '@hunt/shared';
import { eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { comments, markers, pages, photos, placeNotes, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { activeUser, assertStrongPassword, hasUsers, newUsername } from './accounts.js';
import {
  audit,
  checkLimits,
  clearFailures,
  passwordChangeLimit,
  recordFailure,
  signInUserLimit,
  type Limit,
} from './limits.js';
import { hashPassword, sameCode, verifyNothing, verifyPassword } from './passwords.js';
import {
  clearSessionCookie,
  endSession,
  endUserSessions,
  me,
  startSession,
  toCurrentUser,
} from './sessions.js';

export interface AuthOptions {
  /** The first-run code printed to the server console; without one, setup is refused. */
  setupCode?: string;
}

const WRONG = 'Wrong username or password.';

/** Gives the content added before accounts existed to the super admin. */
function claimExistingContent(db: Db, userId: number): void {
  for (const table of [markers, pages, placeNotes, photos, comments])
    db.update(table).set({ createdBy: userId }).where(isNull(table.createdBy)).run();
  db.update(pages).set({ updatedBy: userId }).where(isNull(pages.updatedBy)).run();
}

/** /api/auth: setup, sign-in and sign-out, and changing your own password. */
export function authRouter(db: Db, { setupCode }: AuthOptions): Router {
  const router = Router();

  router.get('/status', (req, res) => {
    const status: AuthStatus = { setupNeeded: !hasUsers(db), user: req.user ?? null };
    res.set('Cache-Control', 'no-store');
    res.json(status);
  });

  // The first account: the super admin. Needs the code from the server console, so whoever
  // reaches a new copy of the app first can't take it over.
  router.post('/setup', async (req, res) => {
    if (hasUsers(db)) throw new HttpError(409, 'Setup is already done. Sign in instead.');
    const limits: Limit[] = [{ key: `setup-ip:${req.ip}`, max: 10 }];
    checkLimits(db, limits);
    const input = setupSchema.parse(req.body);
    if (!setupCode || !sameCode(input.setupCode, setupCode)) {
      recordFailure(db, limits);
      throw new HttpError(403, 'That setup code isn’t right. Use the one in the server console.');
    }
    const username = newUsername(db, input.firstName, input.lastName);
    assertStrongPassword(input.password, { ...input, username });
    const passwordHash = await hashPassword(input.password);

    const user = db.transaction(() => {
      // Checked again inside the transaction: two setups at once can't both win.
      if (hasUsers(db)) throw new HttpError(409, 'Setup is already done. Sign in instead.');
      const now = new Date().toISOString();
      const row = db
        .insert(users)
        .values({
          username,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'super-admin',
          passwordHash,
          mustChangePassword: false,
          lastSignInAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      claimExistingContent(db, row.id);
      audit(db, row.id, 'setup', row.id);
      return row;
    });
    clearFailures(db, `setup-ip:${req.ip}`);
    startSession(db, req, res, user.id);
    res.status(201).json({ user: toCurrentUser(user) });
  });

  router.post('/sign-in', async (req, res) => {
    const input = signInSchema.parse(req.body);
    const username = input.username.toLowerCase();
    const limits: Limit[] = [{ key: `sign-in-ip:${req.ip}`, max: 20 }, signInUserLimit(username)];
    checkLimits(db, limits);
    const row = db.select().from(users).where(eq(users.username, username)).get();
    if (!row || row.removedAt) {
      await verifyNothing(input.password);
      recordFailure(db, limits);
      throw new HttpError(401, WRONG);
    }
    if (!(await verifyPassword(input.password, row.passwordHash))) {
      recordFailure(db, limits);
      throw new HttpError(401, WRONG);
    }
    // Only someone with the right password learns these.
    if (row.disabledAt) throw new HttpError(403, 'This account is disabled. Ask an admin.');
    if (
      row.mustChangePassword &&
      row.temporaryExpiresAt &&
      Date.parse(row.temporaryExpiresAt) <= Date.now()
    ) {
      throw new HttpError(401, 'This temporary password has expired. Ask an admin for a new one.');
    }
    clearFailures(db, signInUserLimit(username).key);
    const now = new Date().toISOString();
    db.update(users).set({ lastSignInAt: now }).where(eq(users.id, row.id)).run();
    startSession(db, req, res, row.id);
    const user: CurrentUser = toCurrentUser(row);
    res.json({ user });
  });

  router.post('/sign-out', (req, res) => {
    if (req.sessionId) endSession(db, req.sessionId);
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  router.post('/sign-out-everywhere', (req, res) => {
    endUserSessions(db, me(req).id);
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  // Works on a temporary password too: that's how it gets replaced.
  router.post('/password', async (req, res) => {
    const user = me(req);
    const input = changePasswordSchema.parse(req.body);
    const row = activeUser(db, user.id);
    if (!row.mustChangePassword) {
      const limits: Limit[] = [passwordChangeLimit(row.id)];
      checkLimits(db, limits);
      if (
        !input.currentPassword ||
        !(await verifyPassword(input.currentPassword, row.passwordHash))
      ) {
        recordFailure(db, limits);
        throw new HttpError(400, 'Your current password isn’t right.');
      }
      clearFailures(db, passwordChangeLimit(row.id).key);
    }
    assertStrongPassword(input.newPassword, row);
    if (await verifyPassword(input.newPassword, row.passwordHash))
      throw new HttpError(400, 'Choose a password different from the one you have now.');
    const passwordHash = await hashPassword(input.newPassword);
    const updated = db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        temporaryExpiresAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, row.id))
      .returning()
      .get();
    // Anyone else signed in as this user (a lost phone, someone who saw the old password) is out.
    endUserSessions(db, row.id, req.sessionId);
    res.json({ user: toCurrentUser(updated) });
  });

  return router;
}
