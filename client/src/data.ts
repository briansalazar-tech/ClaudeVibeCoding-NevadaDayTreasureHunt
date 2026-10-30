import {
  DATA_FILES,
  type CountyCollection,
  type CountyLabelCollection,
  type Manifest,
} from '@hunt/shared';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { useEffect, useState } from 'react';

export interface BoundaryData {
  manifest: Manifest;
  counties: CountyCollection;
  labels: CountyLabelCollection;
  outsideMask: Feature<Polygon | MultiPolygon>;
}

/** URL of a processed data file. Respects Vite's base path so the app can be hosted under a subpath. */
export function dataUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`;
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status}). Run npm run data:build.`);
  return (await res.json()) as T;
}

export async function loadBoundaryData(): Promise<BoundaryData> {
  const [manifest, counties, labels, outsideMask] = await Promise.all([
    getJson<Manifest>(DATA_FILES.manifest),
    getJson<CountyCollection>(DATA_FILES.counties),
    getJson<CountyLabelCollection>(DATA_FILES.countyLabels),
    getJson<Feature<Polygon | MultiPolygon>>(DATA_FILES.outsideMask),
  ]);
  return { manifest, counties, labels, outsideMask };
}

export type LoadState<T> =
  { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: T };

export function useBoundaryData(): LoadState<BoundaryData> {
  const [state, setState] = useState<LoadState<BoundaryData>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadBoundaryData().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
