import { searchFile, type CountyId, type Manifest, type SearchFileData } from '@hunt/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { dataUrl } from '../data';
import { buildPlaceIndex, type PlaceIndex } from './searchIndex';

async function getSearchFile(county: CountyId): Promise<SearchFileData> {
  const res = await fetch(dataUrl(searchFile(county)));
  if (!res.ok) throw new Error(`Couldn't load the ${county} search index (${res.status})`);
  return (await res.json()) as SearchFileData;
}

/** The built index, shared by everything that uses it (search, the notebook): built once. */
let built: { stamp: string; index: PlaceIndex } | null = null;

function sharedIndex(stamp: string, files: SearchFileData[]): PlaceIndex | null {
  if (built?.stamp === stamp) return built.index;
  if (!files.length) return null;
  built = { stamp, index: buildPlaceIndex(files) };
  return built.index;
}

export interface SearchIndexState {
  index: PlaceIndex | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Every county's search index, loaded the first time search is used (`enabled`) and kept for
 * the session. Counties whose index failed to load are left out rather than failing search.
 */
export function useSearchIndex(manifest: Manifest, enabled: boolean): SearchIndexState {
  const counties = Object.entries(manifest.counties)
    .filter(([, c]) => (c.search ?? 0) > 0)
    .map(([id]) => id as CountyId);
  const results = useQueries({
    queries: counties.map((county) => ({
      queryKey: ['search-index', county],
      queryFn: () => getSearchFile(county),
      enabled,
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  const loading = enabled && results.some((r) => r.isPending);
  const error = results.find((r) => r.error)?.error ?? null;
  const index = useMemo(() => {
    if (loading) return null;
    return sharedIndex(
      stamp,
      results.flatMap((r) => (r.data ? [r.data] : [])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- \`stamp\` stands in for \`results\`
  }, [stamp, loading]);
  return { index, loading, error };
}
