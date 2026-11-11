import { z } from 'zod';

/**
 * Accounts and what each role may do. The server enforces these rules; the client uses the same
 * functions to hide what a user can't do.
 */

export const ROLES = [
  { id: 'super-admin', name: 'Super admin' },
  { id: 'admin', name: 'Admin' },
  { id: 'member', name: 'Member' },
] as const;

export type Role = (typeof ROLES)[number]['id'];

export function roleName(id: string): string {
  return ROLES.find((r) => r.id === id)?.name ?? id;
}

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;

/** How long a temporary password works if it isn't changed, and how long a session lasts. */
export const TEMPORARY_PASSWORD_DAYS = 7;
export const SESSION_DAYS = 30;

/** The signed-in user. */
export interface CurrentUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  /** "First Last". */
  name: string;
  role: Role;
  /** Signed in with a temporary password: nothing else works until it's changed. */
  mustChangePassword: boolean;
}

/** GET /api/auth/status. */
export interface AuthStatus {
  /** No users yet: the first account (the super admin) must be created. */
  setupNeeded: boolean;
  user: CurrentUser | null;
}

/** A user in the admin's list. */
export interface UserSummary {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  name: string;
  role: Role;
  disabled: boolean;
  removed: boolean;
  /** Still on a temporary password, and when it stops working. */
  mustChangePassword: boolean;
  temporaryExpiresAt: string | null;
  /** Too many wrong passwords: sign-in is refused until then (or until the super admin unlocks). */
  lockedUntil: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

/** Everyone's name, for showing who wrote what. Removed users stay, so their content keeps a name. */
export interface Person {
  id: number;
  name: string;
  username: string;
  role: Role;
  removed: boolean;
}

/** A new user (or a reset password) with the temporary password, shown once. */
export interface TemporaryPassword {
  user: UserSummary;
  temporaryPassword: string;
  expiresAt: string;
}

export type AuditAction =
  | 'setup'
  | 'user-added'
  | 'password-reset'
  | 'role-changed'
  | 'user-disabled'
  | 'user-enabled'
  | 'user-removed'
  | 'user-unlocked'
  | 'restore';

export interface AuditEntry {
  id: number;
  at: string;
  /** Who did it; null when done on the server (`npm run auth:reset`). */
  actorId: number | null;
  action: AuditAction;
  targetId: number | null;
  detail: string;
}

const personName = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(50, 'Use at most 50 characters')
  .refine((s) => /\p{L}/u.test(s), 'A name needs a letter in it');

const password = z.string().max(MAX_PASSWORD, `Use at most ${MAX_PASSWORD} characters`);

export const newUserSchema = z.object({ firstName: personName, lastName: personName });

export const setupSchema = newUserSchema.extend({
  setupCode: z.string().trim().min(1, 'Enter the setup code').max(100),
  password,
});

export const signInSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(120),
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD),
});

export const changePasswordSchema = z.object({
  /** Not needed while on a temporary password: it was just used to sign in. */
  currentPassword: z.string().max(MAX_PASSWORD).optional(),
  newPassword: password,
});

export const roleChangeSchema = z.object({ role: z.enum(['admin', 'member']) });

export type NewUser = z.infer<typeof newUserSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** One part of a username: lowercase letters, accents and punctuation dropped, hyphens kept inside. */
function usernamePart(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `firstname.lastname`, or null if a name has no letters a username can use. */
export function usernameBase(firstName: string, lastName: string): string | null {
  const first = usernamePart(firstName);
  const last = usernamePart(lastName);
  return first && last ? `${first}.${last}` : null;
}

/** The base name, then base2, base3… whichever isn't taken. */
export function uniqueUsername(base: string, taken: (username: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}${n}`)) return `${base}${n}`;
}

export function displayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`;
}

export function isAdmin(role: Role): boolean {
  return role === 'admin' || role === 'super-admin';
}

/** Pages, notes, comments, photos and markers: their author or any admin. */
export function canEditContent(user: Pick<CurrentUser, 'id' | 'role'>, createdBy: number | null) {
  return isAdmin(user.role) || (createdBy !== null && createdBy === user.id);
}

type Actor = Pick<CurrentUser, 'id' | 'role'>;
type Target = { id: number; role: Role };

export function canAddUsers(actor: Actor): boolean {
  return isAdmin(actor.role);
}

/** Admins reset members' and other admins' passwords; only the super admin resets an admin's. */
export function canResetPassword(actor: Actor, target: Target): boolean {
  if (actor.id === target.id || target.role === 'super-admin') return false;
  return isAdmin(actor.role);
}

/** Admins disable members; the super admin disables admins too. Nobody disables the super admin. */
export function canDisable(actor: Actor, target: Target): boolean {
  if (actor.id === target.id || target.role === 'super-admin') return false;
  if (actor.role === 'super-admin') return true;
  return actor.role === 'admin' && target.role === 'member';
}

/** Only the super admin lifts a lockout from wrong passwords (anyone's, their own included). */
export function canUnlock(actor: Actor): boolean {
  return actor.role === 'super-admin';
}

export function canRemove(actor: Actor, target: Target): boolean {
  return actor.role === 'super-admin' && target.role !== 'super-admin';
}

export function canChangeRole(actor: Actor, target: Target): boolean {
  return actor.role === 'super-admin' && target.role !== 'super-admin';
}

export function canBackUp(actor: Actor): boolean {
  return isAdmin(actor.role);
}

/** Restore replaces everything, so it's the super admin's alone, as is the audit log. */
export function canRestore(actor: Actor): boolean {
  return actor.role === 'super-admin';
}

export function canViewAudit(actor: Actor): boolean {
  return actor.role === 'super-admin';
}
