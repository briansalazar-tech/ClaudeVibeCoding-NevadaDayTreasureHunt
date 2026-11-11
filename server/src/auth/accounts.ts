import {
  TEMPORARY_PASSWORD_DAYS,
  displayName,
  uniqueUsername,
  usernameBase,
  type Role,
  type UserSummary,
} from '@hunt/shared';
import { checkPassword, type PasswordOwner } from '@hunt/shared/password-strength';
import { count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users, type UserRow } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { unlockUser } from './limits.js';
import { hashPassword, temporaryPassword } from './passwords.js';
import { endUserSessions } from './sessions.js';

export function hasUsers(db: Db): boolean {
  return (db.select({ n: count() }).from(users).get()?.n ?? 0) > 0;
}

/** A user who hasn't been removed, or 404. */
export function activeUser(db: Db, id: number): UserRow {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (!row || row.removedAt) throw new HttpError(404, 'User not found');
  return row;
}

export function toUserSummary(row: UserRow, lockedUntil: string | null = null): UserSummary {
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    name: displayName(row.firstName, row.lastName),
    role: row.role as Role,
    disabled: row.disabledAt !== null,
    removed: row.removedAt !== null,
    mustChangePassword: row.mustChangePassword,
    temporaryExpiresAt: row.mustChangePassword ? row.temporaryExpiresAt : null,
    lockedUntil,
    lastSignInAt: row.lastSignInAt,
    createdAt: row.createdAt,
  };
}

/** `firstname.lastname`, numbered if taken (removed users keep theirs). */
export function newUsername(db: Db, firstName: string, lastName: string): string {
  const base = usernameBase(firstName, lastName);
  if (!base) throw new HttpError(400, 'A username needs letters A–Z in the first and last name');
  return uniqueUsername(
    base,
    (u) => db.select({ id: users.id }).from(users).where(eq(users.username, u)).get() !== undefined,
  );
}

/** Refuses a weak password (400), with the reasons. */
export function assertStrongPassword(password: string, owner: PasswordOwner): void {
  const check = checkPassword(password, owner);
  if (!check.ok)
    throw new HttpError(400, check.problems.join(' '), { code: 'weak-password', ...check });
}

export interface Temporary {
  password: string;
  hash: string;
  expiresAt: string;
}

export async function makeTemporaryPassword(): Promise<Temporary> {
  const password = temporaryPassword();
  const expiresAt = new Date(Date.now() + TEMPORARY_PASSWORD_DAYS * 86_400_000).toISOString();
  return { password, hash: await hashPassword(password), expiresAt };
}

/** Gives a user a new temporary password and signs them out everywhere. */
export async function resetToTemporary(db: Db, id: number): Promise<Temporary> {
  const temp = await makeTemporaryPassword();
  db.update(users)
    .set({
      passwordHash: temp.hash,
      mustChangePassword: true,
      temporaryExpiresAt: temp.expiresAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, id))
    .run();
  endUserSessions(db, id);
  // A new password is no use while wrong guesses at the old one still lock the account.
  unlockUser(db, activeUser(db, id));
  return temp;
}
