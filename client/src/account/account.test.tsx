import type { AuthStatus, CurrentUser, Person, UserSummary } from '@hunt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPanel } from './AccountPanel';
import { AuthGate } from './AuthGate';
import { AccountContext } from './context';

const sam: CurrentUser = {
  id: 1,
  username: 'sam.owner',
  firstName: 'Sam',
  lastName: 'Owner',
  name: 'Sam Owner',
  role: 'super-admin',
  mustChangePassword: false,
};

function summary(user: CurrentUser, extra: Partial<UserSummary> = {}): UserSummary {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    role: user.role,
    disabled: false,
    removed: false,
    mustChangePassword: false,
    temporaryExpiresAt: null,
    lockedUntil: null,
    lastSignInAt: null,
    createdAt: '2026-11-09T00:00:00Z',
    ...extra,
  };
}

const ada: CurrentUser = {
  ...sam,
  id: 2,
  username: 'ada.admin',
  firstName: 'Ada',
  lastName: 'Admin',
  name: 'Ada Admin',
  role: 'admin',
};
const max: CurrentUser = {
  ...sam,
  id: 3,
  username: 'max.member',
  firstName: 'Max',
  lastName: 'Member',
  name: 'Max Member',
  role: 'member',
};

/** Answers API calls from a table of path → body. */
function serve(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const path = url.replace(/\?.*$/, '');
    if (!(path in routes)) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(Response.json(routes[path]));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

function renderWithClient(ui: React.ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('AuthGate', () => {
  it('asks for the setup code and names when there are no accounts', async () => {
    serve({ '/api/auth/status': { setupNeeded: true, user: null } satisfies AuthStatus });
    const user = renderWithClient(<AuthGate>app</AuthGate>);
    expect(await screen.findByRole('heading', { name: 'Create the super admin' })).toBeVisible();
    await user.type(screen.getByLabelText('First name'), 'José');
    await user.type(screen.getByLabelText('Last name'), "O'Brien");
    expect(screen.getByText('jose.obrien')).toBeVisible();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('shows sign-in when signed out', async () => {
    serve({ '/api/auth/status': { setupNeeded: false, user: null } satisfies AuthStatus });
    renderWithClient(<AuthGate>app</AuthGate>);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
  });

  it('shows only "Choose a new password" on a temporary password', async () => {
    serve({
      '/api/auth/status': {
        setupNeeded: false,
        user: { ...max, mustChangePassword: true },
      } satisfies AuthStatus,
    });
    renderWithClient(<AuthGate>app</AuthGate>);
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('shows the app to a signed-in user', async () => {
    serve({
      '/api/auth/status': { setupNeeded: false, user: sam } satisfies AuthStatus,
      '/api/users/directory': [] satisfies Person[],
    });
    renderWithClient(<AuthGate>the app</AuthGate>);
    expect(await screen.findByText('the app')).toBeVisible();
  });
});

describe('AccountPanel', () => {
  const users = [
    summary(sam),
    summary(ada),
    summary(max),
    summary({ ...ada, id: 4, username: 'abe.admin', name: 'Abe Admin', firstName: 'Abe' }),
  ];

  function renderPanel(user: CurrentUser) {
    serve({ '/api/users': users });
    return renderWithClient(
      <AccountContext.Provider value={{ user, people: new Map() }}>
        <AccountPanel />
      </AccountContext.Provider>,
    );
  }

  // The user list's row (the signed-in user's name is also at the top of the tab).
  const row = async (name: string) =>
    (await screen.findAllByText(name, { selector: 'li strong' }))[0]!.closest('li')!;

  it('gives the super admin every action on others, and none on themselves', async () => {
    renderPanel(sam);
    const own = await row('Sam Owner');
    expect(within(own).queryAllByRole('button')).toHaveLength(0);
    const admin = await row('Ada Admin');
    for (const name of ['Reset password', 'Disable', 'Make member', 'Remove…'])
      expect(within(admin).getByRole('button', { name })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
  });

  it('lets an admin reset passwords and disable members, but not promote or remove', async () => {
    renderPanel(ada);
    const member = await row('Max Member');
    expect(within(member).getByRole('button', { name: 'Reset password' })).toBeVisible();
    expect(within(member).getByRole('button', { name: 'Disable' })).toBeVisible();
    expect(within(member).queryByRole('button', { name: 'Make admin' })).toBeNull();
    expect(within(member).queryByRole('button', { name: 'Remove…' })).toBeNull();
    const otherAdmin = await row('Abe Admin');
    expect(within(otherAdmin).getByRole('button', { name: 'Reset password' })).toBeVisible();
    expect(within(otherAdmin).queryByRole('button', { name: 'Disable' })).toBeNull();
    expect(within(await row('Sam Owner')).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Audit log' })).toBeNull();
  });

  it('shows a member only their own account', () => {
    renderPanel(max);
    expect(screen.getByText('Max Member')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible();
  });
});
