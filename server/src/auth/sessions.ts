import { createHash, randomBytes } from 'node:crypto';
import { SESSION_DAYS, displayName, type CurrentUser, type Role } from '@hunt/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Request, RequestHandler, Response } from 'express';
import type { Db } from '../db/client.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { HttpError } from '../errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in user, set by `authenticate`. */
    user?: CurrentUser;
    /** Their session's id (the hash of the cookie's token). */
    sessionId?: string;
  }
}

export const SESSION_COOKIE = 'hunt_session';
const DAY = 24 * 60 * 60 * 1000;
const SESSION_MS = SESSION_DAYS * DAY;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    name: displayName(row.firstName, row.lastName),
    role: row.role as Role,
    mustChangePassword: row.mustChangePassword,
  };
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

function setCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Over HTTPS (directly, or behind a proxy with TRUST_PROXY set) the cookie is never sent in
    // the clear. Plain HTTP is only for running on your own PC or network.
    secure: req.secure,
    path: '/',
    maxAge: SESSION_MS,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
  });
}

/** Starts a session: a random token in the cookie, only its hash in the database. */
export function startSession(db: Db, req: Request, res: Response, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const id = hashToken(token);
  db.insert(sessions)
    .values({
      id,
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
    })
    .run();
  setCookie(req, res, token);
  return id;
}

export function endSession(db: Db, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

/** Signs a user out everywhere, or everywhere but one session (after a password change). */
export function endUserSessions(db: Db, userId: number, except?: string): void {
  db.delete(sessions)
    .where(
      except
        ? and(eq(sessions.userId, userId), ne(sessions.id, except))
        : eq(sessions.userId, userId),
    )
    .run();
}

/**
 * Reads the session cookie and sets `req.user`. A missing, expired or unknown session, or a
 * disabled or removed user, leaves it unset. A session in use is extended, at most once a day.
 */
export function authenticate(db: Db): RequestHandler {
  return (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return next();
    const id = hashToken(token);
    const row = db
      .select()
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id))
      .get();
    const now = Date.now();
    if (
      !row ||
      Date.parse(row.sessions.expiresAt) <= now ||
      row.users.disabledAt ||
      row.users.removedAt
    ) {
      if (row) endSession(db, id);
      clearSessionCookie(req, res);
      return next();
    }
    if (now - Date.parse(row.sessions.lastSeenAt) > DAY) {
      db.update(sessions)
        .set({
          lastSeenAt: new Date(now).toISOString(),
          expiresAt: new Date(now + SESSION_MS).toISOString(),
        })
        .where(eq(sessions.id, id))
        .run();
      setCookie(req, res, token);
    }
    req.user = toCurrentUser(row.users);
    req.sessionId = id;
    next();
  };
}

/** Everything after this needs a signed-in user who isn't still on a temporary password. */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Sign in first', { code: 'signed-out' });
  if (req.user.mustChangePassword)
    throw new HttpError(403, 'Choose a new password first', { code: 'password-change-required' });
  next();
};

/** The signed-in user (routes behind `requireUser`). */
export function me(req: Request): CurrentUser {
  if (!req.user) throw new HttpError(401, 'Sign in first', { code: 'signed-out' });
  return req.user;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses requests that change data unless they come from the app's own pages: the Origin
 * header must match the host the request was sent to, or APP_URL. This backs up the SameSite
 * cookie against cross-site request forgery. Requests with no Origin (not from a browser) carry
 * no cookie of a victim's, so they pass.
 */
export function sameOrigin(appUrl: string | undefined): RequestHandler {
  const allowed = appUrl ? new URL(appUrl).origin : null;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('sec-fetch-site') === 'cross-site')
      throw new HttpError(403, 'Requests from other sites aren’t allowed');
    const origin = req.get('origin');
    if (origin && origin !== allowed) {
      let host: string | null = null;
      try {
        host = new URL(origin).host;
      } catch {
        // An unreadable Origin is refused below.
      }
      // req.host follows X-Forwarded-Host only when TRUST_PROXY says to.
      if (host !== req.host) throw new HttpError(403, 'Requests from other sites aren’t allowed');
    }
    next();
  };
}
