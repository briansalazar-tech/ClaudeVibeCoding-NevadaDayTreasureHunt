import {
  canAddUsers,
  canChangeRole,
  canDisable,
  canRemove,
  canResetPassword,
  canUnlock,
  canViewAudit,
  roleName,
  usernameBase,
  type AuditEntry,
  type TemporaryPassword,
  type UserSummary,
} from '@hunt/shared';
import { useState, type FormEvent } from 'react';
import {
  useAddUser,
  useAudit,
  useChangePassword,
  useRemoveUser,
  useResetPassword,
  useSetDisabled,
  useSetRole,
  useSignOut,
  useUnlock,
  useUsers,
} from './api';
import { useAccount } from './context';
import { NewPasswordFields } from './PasswordFields';
import { passwordReady, usePasswordChecker } from './strength';

function when(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'never';
}

/** The Account tab: who's signed in, their password, and (for admins) everyone's accounts. */
export function AccountPanel() {
  const { user } = useAccount();
  const signOut = useSignOut();
  const signOutAll = useSignOut(true);
  return (
    <div className="account">
      <section className="panel-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Your account</h2>
        <p>
          <strong>{user.name}</strong>{' '}
          <span className="muted">
            · {user.username} · {roleName(user.role)}
          </span>
        </p>
        <div className="nb-row">
          <button
            type="button"
            className="small-button"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </button>
          <button
            type="button"
            className="small-button"
            disabled={signOutAll.isPending}
            onClick={() => signOutAll.mutate()}
          >
            Sign out everywhere
          </button>
        </div>
        <ChangePassword />
      </section>
      {canAddUsers(user) && <Users />}
      {canViewAudit(user) && <AuditLog />}
    </div>
  );
}

function ChangePassword() {
  const { user } = useAccount();
  const change = useChangePassword();
  const checker = usePasswordChecker();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = checker && password ? checker(password, user) : null;
  if (!open) {
    return (
      <>
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          Change password…
        </button>
        {change.isSuccess && (
          <p className="muted" role="status">
            Password changed. Your other sessions were signed out.
          </p>
        )}
      </>
    );
  }
  const close = () => {
    setOpen(false);
    setCurrent('');
    setPassword('');
    setConfirm('');
  };
  return (
    <form
      className="auth-form account-form"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate({ currentPassword: current, newPassword: password }, { onSuccess: close });
      }}
    >
      <input type="text" autoComplete="username" value={user.username} readOnly hidden />
      <label className="field">
        <span>Current password</span>
        <input
          className="text-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoFocus
        />
      </label>
      <NewPasswordFields
        check={check}
        password={password}
        confirm={confirm}
        onPassword={setPassword}
        onConfirm={setConfirm}
      />
      {change.isError && <p className="form-error">{change.error.message}</p>}
      <div className="nb-row">
        <button
          type="submit"
          className="small-button primary"
          disabled={change.isPending || !current || !passwordReady(check, password, confirm)}
        >
          Change password
        </button>
        <button type="button" className="small-button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A temporary password, shown this once for the admin to pass on. */
function TemporaryNotice({ temp, onDone }: { temp: TemporaryPassword; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="temp-password" role="status">
      <p>
        <strong>{temp.user.name}</strong> signs in as <code>{temp.user.username}</code> with this
        temporary password:
      </p>
      <p className="temp-password-value">
        <code>{temp.temporaryPassword}</code>
        <button
          type="button"
          className="small-button"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(temp.temporaryPassword)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="muted">
        It’s shown only now. It works until {when(temp.expiresAt)}, and they choose their own
        password when they first sign in. Pass it on privately.
      </p>
      <button type="button" className="small-button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

function Users() {
  const users = useUsers();
  const [temp, setTemp] = useState<TemporaryPassword | null>(null);
  const active = (users.data ?? []).filter((u) => !u.removed);
  const removed = (users.data ?? []).filter((u) => u.removed);
  return (
    <section className="panel-section" aria-labelledby="users-heading">
      <h2 id="users-heading">Users</h2>
      {temp && <TemporaryNotice temp={temp} onDone={() => setTemp(null)} />}
      <AddUser onAdded={setTemp} />
      {users.isPending && <p className="muted">Loading…</p>}
      {users.isError && <p className="form-error">{users.error.message}</p>}
      <ul className="user-list">
        {active.map((u) => (
          <UserRow key={u.id} target={u} onTemporary={setTemp} />
        ))}
      </ul>
      {removed.length > 0 && (
        <details>
          <summary>Removed ({removed.length})</summary>
          <ul className="user-list">
            {removed.map((u) => (
              <li key={u.id} className="muted">
                {u.name} · {u.username}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function AddUser({ onAdded }: { onAdded: (temp: TemporaryPassword) => void }) {
  const add = useAddUser();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  if (!open) {
    return (
      <button type="button" className="small-button primary" onClick={() => setOpen(true)}>
        + Add user
      </button>
    );
  }
  const base = usernameBase(firstName, lastName);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      { firstName, lastName },
      {
        onSuccess: (temp) => {
          onAdded(temp);
          setOpen(false);
          setFirstName('');
          setLastName('');
        },
      },
    );
  };
  return (
    <form className="auth-form account-form" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>First name</span>
          <input
            className="text-input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Last name</span>
          <input
            className="text-input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
      </div>
      <p className="muted">
        {base ? (
          <>
            Username <strong>{base}</strong> (numbered if it’s taken). They join as a member.
          </>
        ) : (
          'The username is firstname.lastname. New users join as members.'
        )}
      </p>
      {add.isError && <p className="form-error">{add.error.message}</p>}
      <div className="nb-row">
        <button type="submit" className="small-button primary" disabled={add.isPending || !base}>
          Add and make a temporary password
        </button>
        <button type="button" className="small-button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function locked(u: UserSummary): boolean {
  return u.lockedUntil !== null && Date.parse(u.lockedUntil) > Date.now();
}

function status(u: UserSummary): string {
  if (u.disabled) return 'Disabled';
  if (u.lockedUntil && locked(u)) {
    const until = new Date(u.lockedUntil).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Locked out by wrong passwords until ${until}`;
  }
  if (u.mustChangePassword)
    return u.temporaryExpiresAt && Date.parse(u.temporaryExpiresAt) < Date.now()
      ? 'Temporary password expired'
      : `Temporary password until ${when(u.temporaryExpiresAt)}`;
  return `Last signed in ${when(u.lastSignInAt)}`;
}

function UserRow({
  target,
  onTemporary,
}: {
  target: UserSummary;
  onTemporary: (temp: TemporaryPassword) => void;
}) {
  const { user } = useAccount();
  const reset = useResetPassword();
  const unlock = useUnlock();
  const setDisabled = useSetDisabled();
  const setRole = useSetRole();
  const remove = useRemoveUser();
  const [confirming, setConfirming] = useState<'reset' | 'remove' | null>(null);
  const error = [reset, unlock, setDisabled, setRole, remove].find((m) => m.isError)?.error;
  const self = target.id === user.id;

  return (
    <li className="user-row">
      <div>
        <strong>{target.name}</strong>
        {self && <span className="muted"> (you)</span>}{' '}
        <span className={`role-badge role-${target.role}`}>{roleName(target.role)}</span>
        <p className="muted">
          {target.username} · {status(target)}
        </p>
      </div>
      {confirming ? (
        <div className="nb-row">
          <span>
            {confirming === 'reset'
              ? `Give ${target.firstName} a new temporary password? They’re signed out everywhere.`
              : `Remove ${target.name}? They can’t sign in again; their notes keep their name.`}
          </span>
          <button
            type="button"
            className="small-button danger"
            onClick={() => {
              if (confirming === 'reset')
                reset.mutate(target.id, { onSuccess: (temp) => onTemporary(temp) });
              else remove.mutate(target.id);
              setConfirming(null);
            }}
          >
            {confirming === 'reset' ? 'Reset password' : 'Remove'}
          </button>
          <button type="button" className="small-button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="nb-row">
          {locked(target) && canUnlock(user) && (
            <button
              type="button"
              className="small-button primary"
              disabled={unlock.isPending}
              onClick={() => unlock.mutate(target.id)}
            >
              Unlock
            </button>
          )}
          {canResetPassword(user, target) && (
            <button type="button" className="small-button" onClick={() => setConfirming('reset')}>
              Reset password
            </button>
          )}
          {canDisable(user, target) && (
            <button
              type="button"
              className="small-button"
              disabled={setDisabled.isPending}
              onClick={() => setDisabled.mutate({ id: target.id, disabled: !target.disabled })}
            >
              {target.disabled ? 'Enable' : 'Disable'}
            </button>
          )}
          {canChangeRole(user, target) && (
            <button
              type="button"
              className="small-button"
              disabled={setRole.isPending}
              onClick={() =>
                setRole.mutate({
                  id: target.id,
                  role: target.role === 'admin' ? 'member' : 'admin',
                })
              }
            >
              {target.role === 'admin' ? 'Make member' : 'Make admin'}
            </button>
          )}
          {canRemove(user, target) && (
            <button type="button" className="small-button" onClick={() => setConfirming('remove')}>
              Remove…
            </button>
          )}
        </div>
      )}
      {error && <p className="form-error">{error.message}</p>}
    </li>
  );
}

const ACTIONS: Record<AuditEntry['action'], string> = {
  setup: 'created the project (super admin)',
  'user-added': 'added',
  'password-reset': 'reset the password of',
  'role-changed': 'changed the role of',
  'user-disabled': 'disabled',
  'user-enabled': 're-enabled',
  'user-removed': 'removed',
  'user-unlocked': 'unlocked',
  restore: 'restored a backup',
};

function AuditLog() {
  const { people } = useAccount();
  const [open, setOpen] = useState(false);
  const log = useAudit(open);
  const name = (id: number | null) =>
    id === null ? 'The server console' : (people.get(id)?.name ?? 'Former user');
  return (
    <section className="panel-section" aria-labelledby="audit-heading">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <h2 id="audit-heading" className="inline-heading">
            Audit log
          </h2>
        </summary>
        {log.isPending && open && <p className="muted">Loading…</p>}
        {log.isError && <p className="form-error">{log.error.message}</p>}
        <ul className="audit-list">
          {(log.data ?? []).map((e) => (
            <li key={e.id}>
              <span className="muted">{when(e.at)}</span> {name(e.actorId)} {ACTIONS[e.action]}
              {e.targetId !== null && e.action !== 'setup' && ` ${name(e.targetId)}`}
              {e.detail && <span className="muted"> ({e.detail})</span>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
