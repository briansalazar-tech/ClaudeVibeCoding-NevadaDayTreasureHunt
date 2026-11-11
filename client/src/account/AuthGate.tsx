import { usernameBase, type CurrentUser } from '@hunt/shared';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useHuntStore } from '../state/store';
import {
  useAuthStatus,
  useChangePassword,
  usePeople,
  useSetup,
  useSignIn,
  useSignOut,
} from './api';
import { AccountContext, type AccountData } from './context';
import { NewPasswordFields } from './PasswordFields';
import { passwordReady, usePasswordChecker } from './strength';

/**
 * Shows the app only to a signed-in user: otherwise first-run setup, sign-in, or choosing a new
 * password in place of a temporary one.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const theme = useHuntStore((s) => s.theme);
  // Here rather than in the app, so the sign-in screens follow the theme too.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const user = status.data?.user ?? null;
  const ready = user !== null && !user.mustChangePassword;
  const people = usePeople(ready);
  const value = useMemo<AccountData | null>(
    () =>
      user && ready ? { user, people: new Map((people.data ?? []).map((p) => [p.id, p])) } : null,
    [user, ready, people.data],
  );

  if (status.isPending) return <div className="app-message">Loading…</div>;
  if (status.isError) {
    return (
      <div className="app-message" role="alert">
        <p>{status.error.message}</p>
        <button type="button" className="small-button" onClick={() => void status.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (status.data.setupNeeded) return <SetupScreen />;
  if (!user) return <SignInScreen />;
  if (!value) return <NewPasswordScreen user={user} />;
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="app-name">Nevada Day Hunt Map</p>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
      <p className="auth-credit">Background: USGS National Map (Imagery Topo)</p>
    </main>
  );
}

function SignInScreen() {
  const signIn = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    signIn.mutate({ username, password }, { onError: () => setPassword('') });
  };
  return (
    <AuthCard title="Sign in">
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <input
            className="text-input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="firstname.lastname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {signIn.isError && (
          <p className="form-error" role="alert">
            {signIn.error.message}
          </p>
        )}
        <button type="submit" className="small-button primary" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted">
          No account? Ask an admin to add you. Forgot your password? An admin can reset it.
        </p>
      </form>
    </AuthCard>
  );
}

/** The first account: the super admin, who owns the project. */
function SetupScreen() {
  const setup = useSetup();
  const checker = usePasswordChecker();
  const [setupCode, setSetupCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const username = usernameBase(firstName, lastName);
  const check =
    checker && password
      ? checker(password, { firstName, lastName, username: username ?? '' })
      : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setup.mutate({ setupCode, firstName, lastName, password });
  };
  return (
    <AuthCard title="Create the super admin">
      <form className="auth-form" onSubmit={submit}>
        <p className="muted">
          This is the first account. It owns the project and adds everyone else. The setup code is
          shown in the server’s console (the window running <code>npm run dev</code> or{' '}
          <code>npm run start</code>).
        </p>
        <label className="field">
          <span>Setup code</span>
          <input
            className="text-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX"
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            required
            autoFocus
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>First name</span>
            <input
              className="text-input"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Last name</span>
            <input
              className="text-input"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
        </div>
        <p className="muted" aria-live="polite">
          {username ? (
            <>
              Your username will be <strong>{username}</strong>.
            </>
          ) : (
            'Your username is your first and last name: firstname.lastname.'
          )}
        </p>
        <NewPasswordFields
          label="Password"
          check={check}
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        {setup.isError && (
          <p className="form-error" role="alert">
            {setup.error.message}
          </p>
        )}
        <button
          type="submit"
          className="small-button primary"
          disabled={setup.isPending || !username || !passwordReady(check, password, confirm)}
        >
          {setup.isPending ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}

/** After signing in with a temporary password: nothing else until it's replaced. */
function NewPasswordScreen({ user }: { user: CurrentUser }) {
  const change = useChangePassword();
  const signOut = useSignOut();
  const checker = usePasswordChecker();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = checker && password ? checker(password, user) : null;
  return (
    <AuthCard title="Choose a new password">
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate({ newPassword: password });
        }}
      >
        <p className="muted">
          Welcome, {user.firstName}. You signed in as <strong>{user.username}</strong> with a
          temporary password. Choose your own to continue.
        </p>
        {/* Lets password managers save the new password under the right username. */}
        <input type="text" autoComplete="username" value={user.username} readOnly hidden />
        <NewPasswordFields
          check={check}
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        {change.isError && (
          <p className="form-error" role="alert">
            {change.error.message}
          </p>
        )}
        <div className="nb-row">
          <button
            type="submit"
            className="small-button primary"
            disabled={change.isPending || !passwordReady(check, password, confirm)}
          >
            {change.isPending ? 'Saving…' : 'Save password'}
          </button>
          <button type="button" className="small-button" onClick={() => signOut.mutate()}>
            Sign out
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
