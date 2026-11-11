import { canEditContent, type CurrentUser, type Person } from '@hunt/shared';
import { createContext, useContext } from 'react';

export interface AccountData {
  user: CurrentUser;
  /** Everyone, by id, for showing who added what. */
  people: ReadonlyMap<number, Person>;
}

export const AccountContext = createContext<AccountData | null>(null);

export function useAccount(): AccountData {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount needs an AuthGate');
  return value;
}

/** The signed-in user's account, or null outside an AuthGate (component tests). */
export function useOptionalAccount(): AccountData | null {
  return useContext(AccountContext);
}

/** `canEdit(createdBy)` for lists, where each item has its own author. */
export function useCanEditFn(): (createdBy: number | null) => boolean {
  const account = useContext(AccountContext);
  return (createdBy) => !account || canEditContent(account.user, createdBy);
}

/**
 * Whether the signed-in user can change something by this author. Outside an AuthGate (component
 * tests) everything is editable; the server has the last word either way.
 */
export function useCanEdit(createdBy: number | null): boolean {
  const account = useContext(AccountContext);
  return !account || canEditContent(account.user, createdBy);
}

/** "Sam Owner"; "Former user" for an author not among the current users. */
export function useAuthorName(id: number | null): string {
  const account = useContext(AccountContext);
  if (id === null) return 'Former user';
  return account?.people.get(id)?.name ?? (account ? 'Former user' : '');
}
