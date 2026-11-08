import type { CountyId, Manifest, Page, PlaceNote } from '@hunt/shared';
import { createContext, useContext } from 'react';
import type { PlaceIndex } from '../search/searchIndex';
import type { PlaceNames } from './places';

export interface NotebookData {
  manifest: Manifest;
  pages: readonly Page[];
  pagesByKey: ReadonlyMap<string, Page>;
  /** Notes on map places. */
  notes: readonly PlaceNote[];
  /** Map places by name; empty until the search index has loaded. */
  names: PlaceNames;
  index: PlaceIndex | null;
  indexLoading: boolean;
  countyOf: (lng: number, lat: number) => CountyId | null;
  pagesError: Error | null;
}

export const NotebookContext = createContext<NotebookData | null>(null);

export function useNotebook(): NotebookData {
  const value = useContext(NotebookContext);
  if (!value) throw new Error('useNotebook needs a NotebookProvider');
  return value;
}

/** For components that also render outside the notebook (tests, the side panel alone). */
export function useOptionalNotebook(): NotebookData | null {
  return useContext(NotebookContext);
}
