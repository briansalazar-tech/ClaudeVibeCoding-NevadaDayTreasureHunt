import type {
  AuditEntry,
  AuthStatus,
  ChangePasswordInput,
  CurrentUser,
  NewUser,
  Person,
  SetupInput,
  SignInInput,
  TemporaryPassword,
  UserSummary,
} from '@hunt/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';

/** TanStack Query hooks for accounts: who's signed in, signing in and out, managing users. */

export const AUTH_KEY = ['auth'] as const;
const PEOPLE = ['people'] as const;
const USERS = ['users'] as const;
const AUDIT = ['audit'] as const;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body ?? {}),
});

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_KEY,
    queryFn: () => api<AuthStatus>('/api/auth/status'),
    staleTime: Infinity,
  });
}

/**
 * Drops everything cached for whoever was signed in, except the status itself (the screen
 * showing is watching it).
 */
function forgetData(client: QueryClient) {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== AUTH_KEY[0] });
}

/** Signed in as someone (possibly someone else): forget the previous user's data, show the new. */
function signedIn(client: QueryClient, user: CurrentUser) {
  forgetData(client);
  client.setQueryData<AuthStatus>(AUTH_KEY, { setupNeeded: false, user });
}

export function useSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInput) =>
      api<{ user: CurrentUser }>('/api/auth/setup', json('POST', input)),
    onSuccess: ({ user }) => signedIn(client, user),
  });
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      api<{ user: CurrentUser }>('/api/auth/sign-in', json('POST', input)),
    onSuccess: ({ user }) => signedIn(client, user),
  });
}

function signedOut(client: QueryClient) {
  forgetData(client);
  client.setQueryData<AuthStatus>(AUTH_KEY, { setupNeeded: false, user: null });
}

export function useSignOut(everywhere = false) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<void>(everywhere ? '/api/auth/sign-out-everywhere' : '/api/auth/sign-out', json('POST')),
    onSuccess: () => signedOut(client),
  });
}

export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api<{ user: CurrentUser }>('/api/auth/password', json('POST', input)),
    onSuccess: ({ user }) => {
      // From a temporary password, the app loads fresh; otherwise only the status changes.
      const before = client.getQueryData<AuthStatus>(AUTH_KEY)?.user;
      if (before?.mustChangePassword) signedIn(client, user);
      else client.setQueryData<AuthStatus>(AUTH_KEY, { setupNeeded: false, user });
    },
  });
}

/** Everyone's names, for "added by". */
export function usePeople(enabled = true) {
  return useQuery({
    queryKey: PEOPLE,
    queryFn: () => api<Person[]>('/api/users/directory'),
    enabled,
  });
}

export function useUsers() {
  return useQuery({ queryKey: USERS, queryFn: () => api<UserSummary[]>('/api/users') });
}

function refreshUsers(client: QueryClient) {
  return Promise.all(
    [USERS, PEOPLE, AUDIT].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

export function useAddUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewUser) => api<TemporaryPassword>('/api/users', json('POST', input)),
    onSuccess: () => refreshUsers(client),
  });
}

export function useResetPassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<TemporaryPassword>(`/api/users/${id}/reset-password`, json('POST')),
    onSuccess: () => refreshUsers(client),
  });
}

export function useUnlock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<UserSummary>(`/api/users/${id}/unlock`, json('POST')),
    onSuccess: () => refreshUsers(client),
  });
}

export function useSetDisabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      api<UserSummary>(`/api/users/${id}/${disabled ? 'disable' : 'enable'}`, json('POST')),
    onSuccess: () => refreshUsers(client),
  });
}

export function useSetRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'admin' | 'member' }) =>
      api<UserSummary>(`/api/users/${id}/role`, json('PUT', { role })),
    onSuccess: () => refreshUsers(client),
  });
}

export function useRemoveUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshUsers(client),
  });
}

export function useAudit(enabled: boolean) {
  return useQuery({
    queryKey: AUDIT,
    queryFn: () => api<AuditEntry[]>('/api/audit'),
    enabled,
  });
}
