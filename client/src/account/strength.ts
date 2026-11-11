import { MIN_PASSWORD } from '@hunt/shared';
import type { PasswordCheck, PasswordOwner } from '@hunt/shared/password-strength';
import { useEffect, useState } from 'react';

type Checker = (password: string, owner: PasswordOwner) => PasswordCheck;

/**
 * The password checker, loaded when a screen that sets a password opens: its dictionaries are
 * too big for the main bundle. Null until it has loaded.
 */
export function usePasswordChecker(): Checker | null {
  const [checker, setChecker] = useState<Checker | null>(null);
  useEffect(() => {
    let live = true;
    void import('@hunt/shared/password-strength').then((m) => {
      if (live) setChecker(() => m.checkPassword);
    });
    return () => {
      live = false;
    };
  }, []);
  return checker;
}

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;

/** Ready to send: strong (as far as the browser can tell) and typed the same twice. */
export function passwordReady(
  check: PasswordCheck | null,
  password: string,
  confirm: string,
): boolean {
  return password.length >= MIN_PASSWORD && password === confirm && (check?.ok ?? true);
}
