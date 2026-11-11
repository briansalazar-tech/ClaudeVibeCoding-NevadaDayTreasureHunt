import {
  canAddUsers,
  canChangeRole,
  canDisable,
  canRemove,
  canResetPassword,
  canUnlock,
  canViewAudit,
  displayName,
  newUserSchema,
  roleChangeSchema,
  roleName,
  type AuditAction,
  type AuditEntry,
  type CurrentUser,
  type Person,
  type Role,
  type TemporaryPassword,
} from '@hunt/shared';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import {
  activeUser,
  makeTemporaryPassword,
  newUsername,
  resetToTemporary,
  toUserSummary,
} from './auth/accounts.js';
import { audit, lockedUntil, signInUserLimit, unlockUser } from './auth/limits.js';
import { endUserSessions, me } from './auth/sessions.js';
import type { Db } from './db/client.js';
import { auditLog, users, type UserRow } from './db/schema.js';
import { HttpError, parseId } from './errors.js';

function forbid(allowed: boolean): void {
  if (!allowed) throw new HttpError(403, 'You don’t have permission to do that');
}

function target(db: Db, raw: string): UserRow & { role: Role } {
  return activeUser(db, parseId(raw, 'User')) as UserRow & { role: Role };
}

function act(db: Db, actor: CurrentUser, action: AuditAction, row: UserRow, detail = ''): void {
  audit(db, actor.id, action, row.id, detail);
}

/** /api/users: everyone's names, and account management for admins. */
export function usersRouter(db: Db): Router {
  const router = Router();

  // Names for "added by": every signed-in user needs them. Removed users stay listed.
  router.get('/directory', (_req, res) => {
    const people: Person[] = db
      .select()
      .from(users)
      .orderBy(users.id)
      .all()
      .map((u) => ({
        id: u.id,
        name: displayName(u.firstName, u.lastName),
        username: u.username,
        role: u.role as Role,
        removed: u.removedAt !== null,
      }));
    res.json(people);
  });

  router.get('/', (req, res) => {
    forbid(canAddUsers(me(req)));
    res.json(
      db
        .select()
        .from(users)
        .orderBy(users.id)
        .all()
        .map((u) => toUserSummary(u, lockedUntil(db, signInUserLimit(u.username)))),
    );
  });

  // New users are members with a temporary password, shown to the admin this once.
  router.post('/', async (req, res) => {
    const actor = me(req);
    forbid(canAddUsers(actor));
    const input = newUserSchema.parse(req.body);
    const temp = await makeTemporaryPassword();
    const row = db.transaction(() => {
      const now = new Date().toISOString();
      const created = db
        .insert(users)
        .values({
          username: newUsername(db, input.firstName, input.lastName),
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'member',
          passwordHash: temp.hash,
          mustChangePassword: true,
          temporaryExpiresAt: temp.expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      act(db, actor, 'user-added', created);
      return created;
    });
    const out: TemporaryPassword = {
      user: toUserSummary(row),
      temporaryPassword: temp.password,
      expiresAt: temp.expiresAt,
    };
    res.set('Cache-Control', 'no-store');
    res.status(201).json(out);
  });

  router.post('/:id/reset-password', async (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canResetPassword(actor, row));
    const temp = await resetToTemporary(db, row.id);
    act(db, actor, 'password-reset', row);
    const out: TemporaryPassword = {
      user: toUserSummary(activeUser(db, row.id)),
      temporaryPassword: temp.password,
      expiresAt: temp.expiresAt,
    };
    res.set('Cache-Control', 'no-store');
    res.json(out);
  });

  // After too many wrong passwords, rather than waiting out the 15 minutes.
  router.post('/:id/unlock', (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canUnlock(actor));
    unlockUser(db, row);
    act(db, actor, 'user-unlocked', row);
    res.json(toUserSummary(activeUser(db, row.id)));
  });

  router.post('/:id/disable', (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canDisable(actor, row));
    db.update(users)
      .set({ disabledAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(users.id, row.id))
      .run();
    endUserSessions(db, row.id);
    act(db, actor, 'user-disabled', row);
    res.json(toUserSummary(activeUser(db, row.id)));
  });

  router.post('/:id/enable', (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canDisable(actor, row));
    db.update(users)
      .set({ disabledAt: null, updatedAt: new Date().toISOString() })
      .where(eq(users.id, row.id))
      .run();
    act(db, actor, 'user-enabled', row);
    res.json(toUserSummary(activeUser(db, row.id)));
  });

  router.put('/:id/role', (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canChangeRole(actor, row));
    const { role } = roleChangeSchema.parse(req.body);
    if (role !== row.role) {
      db.update(users)
        .set({ role, updatedAt: new Date().toISOString() })
        .where(eq(users.id, row.id))
        .run();
      act(db, actor, 'role-changed', row, `${roleName(row.role)} → ${roleName(role)}`);
    }
    res.json(toUserSummary(activeUser(db, row.id)));
  });

  // Removed, not deleted: their pages and notes keep their name. They can't sign in again.
  router.delete('/:id', (req, res) => {
    const actor = me(req);
    const row = target(db, req.params.id);
    forbid(canRemove(actor, row));
    const now = new Date().toISOString();
    db.update(users)
      .set({ removedAt: now, passwordHash: '', mustChangePassword: false, updatedAt: now })
      .where(eq(users.id, row.id))
      .run();
    endUserSessions(db, row.id);
    act(db, actor, 'user-removed', row);
    res.status(204).end();
  });

  return router;
}

/** GET /api/audit: the super admin's record of account changes, newest first. */
export function auditRouter(db: Db): Router {
  const router = Router();
  router.get('/', (req, res) => {
    forbid(canViewAudit(me(req)));
    const rows: AuditEntry[] = db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(500)
      .all()
      .map((r) => ({ ...r, action: r.action as AuditAction }));
    res.json(rows);
  });
  return router;
}
