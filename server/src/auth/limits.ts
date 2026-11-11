import type { AuditAction } from '@hunt/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { auditLog, rateLimits } from '../db/schema.js';
import { HttpError } from '../errors.js';

/**
 * Failed attempts (sign-in, setup code, current password) counted per key in the database, so
 * every server process sees the same counts. After `max` failures within the window, the key is
 * locked until the window ends.
 */

export const LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface Limit {
  key: string;
  max: number;
}

/** Throws 429 if any of the keys is locked. */
export function checkLimits(db: Db, limits: Limit[]): void {
  const now = Date.now();
  for (const { key, max } of limits) {
    const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
    if (!row || Date.parse(row.resetAt) <= now || row.count < max) continue;
    const minutes = Math.max(1, Math.ceil((Date.parse(row.resetAt) - now) / 60_000));
    throw new HttpError(
      429,
      `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}

export function recordFailure(db: Db, limits: Limit[]): void {
  const now = Date.now();
  for (const { key } of limits) {
    const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
    if (!row || Date.parse(row.resetAt) <= now) {
      const resetAt = new Date(now + LIMIT_WINDOW_MS).toISOString();
      db.insert(rateLimits)
        .values({ key, count: 1, resetAt })
        .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, resetAt } })
        .run();
    } else {
      db.update(rateLimits)
        .set({ count: row.count + 1 })
        .where(eq(rateLimits.key, key))
        .run();
    }
  }
}

export function clearFailures(db: Db, key: string): void {
  db.delete(rateLimits).where(eq(rateLimits.key, key)).run();
}

/** Wrong passwords for one username (from any address) before sign-in is locked. */
export const SIGN_IN_USER_MAX = 5;

export function signInUserLimit(username: string): Limit {
  return { key: `sign-in-user:${username}`, max: SIGN_IN_USER_MAX };
}

/** Wrong current passwords when changing one's password. */
export function passwordChangeLimit(userId: number): Limit {
  return { key: `password:${userId}`, max: 5 };
}

/** When a key's lock ends, or null if it isn't locked. */
export function lockedUntil(db: Db, { key, max }: Limit): string | null {
  const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
  if (!row || row.count < max || Date.parse(row.resetAt) <= Date.now()) return null;
  return row.resetAt;
}

/** Lifts a user's lockouts: sign-in by username and changing their password. */
export function unlockUser(db: Db, user: { id: number; username: string }): void {
  clearFailures(db, signInUserLimit(user.username).key);
  clearFailures(db, passwordChangeLimit(user.id).key);
}

/** Records a change to accounts (or a restore) in the audit log. */
export function audit(
  db: Db,
  actorId: number | null,
  action: AuditAction,
  targetId: number | null,
  detail = '',
): void {
  db.insert(auditLog)
    .values({ at: new Date().toISOString(), actorId, action, targetId, detail })
    .run();
}
