import type { CountyId, Manifest } from '@hunt/shared';
import { useMemo, type ReactNode } from 'react';
import { useSearchIndex } from '../search/useSearchIndex';
import { useHuntStore } from '../state/store';
import { useNotes, usePages } from './api';
import { NotebookContext, type NotebookData } from './context';
import { pageByKey, placeNames } from './places';

/**
 * Notebook data for everything that shows it: the notebook itself, map popups, the map's
 * notebook layer. The map place index loads once the notebook is opened or has pages.
 */
export function NotebookProvider({
  manifest,
  countyOf,
  children,
}: {
  manifest: Manifest;
  countyOf: (lng: number, lat: number) => CountyId | null;
  children: ReactNode;
}) {
  const pagesQuery = usePages();
  const pages = pagesQuery.data;
  const notes = useNotes().data;
  const notebookOpen = useHuntStore((s) => s.panelTab === 'notebook');
  const { index, loading } = useSearchIndex(manifest, notebookOpen || (pages?.length ?? 0) > 0);
  const value = useMemo<NotebookData>(() => {
    const list = pages ?? [];
    return {
      manifest,
      pages: list,
      pagesByKey: pageByKey(list),
      notes: notes ?? [],
      names: placeNames(index),
      index,
      indexLoading: loading,
      countyOf,
      pagesError: pagesQuery.error,
    };
  }, [manifest, pages, notes, index, loading, countyOf, pagesQuery.error]);
  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}
