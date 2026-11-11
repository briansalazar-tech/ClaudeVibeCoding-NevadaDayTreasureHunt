import { describe, expect, it } from 'vitest';
import { checkPassword } from './password-strength.js';
import {
  canChangeRole,
  canDisable,
  canEditContent,
  canRemove,
  canResetPassword,
  uniqueUsername,
  usernameBase,
  type Role,
} from './users.js';

const user = (id: number, role: Role) => ({ id, role });
const superAdmin = user(1, 'super-admin');
const admin = user(2, 'admin');
const otherAdmin = user(3, 'admin');
const member = user(4, 'member');
const otherMember = user(5, 'member');

describe('usernames', () => {
  it('are firstname.lastname in plain lowercase letters', () => {
    expect(usernameBase('Brian', 'Salazar')).toBe('brian.salazar');
    expect(usernameBase(' Mary Jane ', 'Smith-Jones')).toBe('mary-jane.smith-jones');
    expect(usernameBase('Zoë', "O'Brien")).toBe('zoe.obrien');
    expect(usernameBase('42', 'Smith')).toBeNull();
  });

  it('number a second person with the same name', () => {
    const taken = new Set(['john.smith', 'john.smith2']);
    expect(uniqueUsername('john.smith', (u) => taken.has(u))).toBe('john.smith3');
    expect(uniqueUsername('ada.lovelace', (u) => taken.has(u))).toBe('ada.lovelace');
  });
});

describe('password strength', () => {
  const owner = { firstName: 'John', lastName: 'Smith', username: 'john.smith' };

  it('accepts a long, uncommon password', () => {
    expect(checkPassword('Sagebrush-Lantern-Quarry-71', owner)).toMatchObject({
      ok: true,
      problems: [],
    });
  });

  it('refuses short, common, or name-based passwords', () => {
    expect(checkPassword('Sh0rt!pw', owner).problems).toContain('Use at least 12 characters.');
    expect(checkPassword('password1234', owner).ok).toBe(false);
    expect(checkPassword('Password1234!', owner).ok).toBe(false);
    expect(checkPassword('qwertyuiop12', owner).ok).toBe(false);
    expect(checkPassword('Smith-Lantern-Quarry-71', owner).problems).toContain(
      'Don’t use your name or username.',
    );
  });
});

describe('permissions', () => {
  it('let authors and admins change content', () => {
    expect(canEditContent(member, member.id)).toBe(true);
    expect(canEditContent(member, otherMember.id)).toBe(false);
    expect(canEditContent(member, null)).toBe(false);
    expect(canEditContent(admin, member.id)).toBe(true);
    expect(canEditContent(superAdmin, null)).toBe(true);
  });

  it('follow the roles table for managing users', () => {
    expect(canResetPassword(admin, member)).toBe(true);
    expect(canResetPassword(admin, otherAdmin)).toBe(true);
    expect(canResetPassword(admin, superAdmin)).toBe(false);
    expect(canResetPassword(admin, admin)).toBe(false);
    expect(canResetPassword(member, otherMember)).toBe(false);
    expect(canResetPassword(superAdmin, admin)).toBe(true);

    expect(canDisable(admin, member)).toBe(true);
    expect(canDisable(admin, otherAdmin)).toBe(false);
    expect(canDisable(superAdmin, admin)).toBe(true);
    expect(canDisable(superAdmin, superAdmin)).toBe(false);

    expect(canRemove(admin, member)).toBe(false);
    expect(canRemove(superAdmin, admin)).toBe(true);
    expect(canChangeRole(admin, member)).toBe(false);
    expect(canChangeRole(superAdmin, member)).toBe(true);
    expect(canChangeRole(superAdmin, superAdmin)).toBe(false);
  });
});
