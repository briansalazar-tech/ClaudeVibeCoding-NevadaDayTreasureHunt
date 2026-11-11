import { MIN_PASSWORD } from '@hunt/shared';
import type { PasswordCheck } from '@hunt/shared/password-strength';
import { useId } from 'react';
import { STRENGTH_LABELS } from './strength';

/** A new password and its confirmation, with the strength shown as it's typed. */
export function NewPasswordFields({
  check,
  password,
  confirm,
  onPassword,
  onConfirm,
  label = 'New password',
}: {
  /** The checker's verdict on `password`; null while it loads or before typing. */
  check: PasswordCheck | null;
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  label?: string;
}) {
  const id = useId();
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <label className="field" htmlFor={`${id}-new`}>
        <span>{label}</span>
        <input
          id={`${id}-new`}
          className="text-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          aria-describedby={`${id}-strength`}
          required
        />
      </label>
      <div className="strength" id={`${id}-strength`} aria-live="polite">
        {password && check ? (
          <>
            <meter min={0} max={4} low={2} high={3} optimum={4} value={check.score} />
            <span className={check.ok ? 'strength-ok' : 'strength-bad'}>
              {check.ok ? STRENGTH_LABELS[check.score] : 'Not strong enough'}
            </span>
            {[...check.problems, ...(check.ok ? [] : check.suggestions)].map((p) => (
              <p key={p} className="muted">
                {p}
              </p>
            ))}
          </>
        ) : (
          <p className="muted">
            At least {MIN_PASSWORD} characters. A few unrelated words make a strong one that’s easy
            to type.
          </p>
        )}
      </div>
      <label className="field" htmlFor={`${id}-confirm`}>
        <span>Type it again</span>
        <input
          id={`${id}-confirm`}
          className="text-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          aria-invalid={mismatch}
          required
        />
      </label>
      {mismatch && <p className="form-error">The two passwords don’t match.</p>}
    </>
  );
}
