import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import {
  DATA_LAYERS,
  layerFile,
  unlocatedFile,
  unpackLayerFile,
  type CountyFeature,
  type CountyId,
  type DataLayerId,
  type LayerFileData,
  type Manifest,
  type PlaceCollection,
  type PlaceFeature,
  type UnlocatedList,
} from '@hunt/shared';
import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { dataUrl, type BoundaryData } from './data';
import { useHuntStore, type MapView } from './state/store';

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status})`);
  return (await res.json()) as T;
}

function layerQuery(county: CountyId, layer: DataLayerId) {
  return {
    queryKey: ['layer', county, layer] as const,
    queryFn: async (): Promise<PlaceCollection> =>
      unpackLayerFile(await getJson<LayerFileData>(layerFile(county, layer)), county, layer),
    // Processed files only change with a rebuild, so keep them for the session.
    staleTime: Infinity,
    gcTime: Infinity,
  };
}

function hasLayer(manifest: Manifest, county: CountyId, layer: DataLayerId): boolean {
  return (manifest.counties[county]?.layers[layer]?.count ?? 0) > 0;
}

function overlaps(a: readonly number[], b: readonly number[]): boolean {
  return a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;
}

/**
 * Whether a county shows in the view: its outline has a vertex inside the view, or the view's
 * center or a corner is inside the county. Bounding boxes alone overlap far too often here
 * (around Reno, five counties' boxes cover the same view).
 */
export function countyInView(county: CountyFeature, bounds: readonly number[]): boolean {
  if (!overlaps(bounds, county.properties.bbox)) return false;
  const [w, s, e, n] = bounds as [number, number, number, number];
  const probes: [number, number][] = [
    [(w + e) / 2, (s + n) / 2],
    [w, s],
    [w, n],
    [e, s],
    [e, n],
  ];
  if (probes.some((p) => booleanPointInPolygon(p, county.geometry))) return true;
  const polygons =
    county.geometry.type === 'Polygon'
      ? [county.geometry.coordinates]
      : county.geometry.coordinates;
  return polygons.some((rings) =>
    rings[0]!.some(([x, y]) => x! >= w && x! <= e && y! >= s && y! <= n),
  );
}

export interface LayerNeeds {
  visible: Record<string, boolean>;
  selectedCountyId: CountyId | null;
  view: MapView | null;
}

/**
 * Which (county, layer) files to load. Light layers load for every county when they're on, and
 * all of a selected county's layers load for its place list. Heavy layers (streets, land) load
 * for the selected county, or once the map is zoomed in far enough over a county.
 */
export function neededFiles(
  data: Pick<BoundaryData, 'manifest' | 'counties'>,
  { visible, selectedCountyId, view }: LayerNeeds,
): { county: CountyId; layer: DataLayerId }[] {
  const out: { county: CountyId; layer: DataLayerId }[] = [];
  for (const c of data.counties.features) {
    const county = c.properties.id;
    const selected = county === selectedCountyId;
    for (const layer of DATA_LAYERS) {
      if (!hasLayer(data.manifest, county, layer.id)) continue;
      const on = visible[layer.id] ?? false;
      let need: boolean;
      if ('heavy' in layer) {
        const inView =
          view !== null && view.zoom >= layer.heavy.minzoom && countyInView(c, view.bounds);
        // The selected county's streets feed its place list even when the layer is off.
        need = (on && (selected || inView)) || (selected && layer.id === 'streets');
      } else {
        need = on || selected;
      }
      if (need) out.push({ county, layer: layer.id });
    }
  }
  return out;
}

export interface LoadedLayers {
  /** Loaded features per layer, all counties together. */
  byLayer: Record<DataLayerId, PlaceFeature[]>;
  /** Layers with a file still downloading. */
  loading: Set<DataLayerId>;
  /** Layers whose files failed to load. */
  failed: Set<DataLayerId>;
}

export function useLayerData(data: BoundaryData): LoadedLayers {
  const visible = useHuntStore((s) => s.layers);
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const view = useHuntStore((s) => s.view);
  const files = useMemo(
    () => neededFiles(data, { visible, selectedCountyId, view }),
    [data, visible, selectedCountyId, view],
  );
  const results = useQueries({ queries: files.map((f) => layerQuery(f.county, f.layer)) });

  // Rebuild the merged lists only when a file finishes loading.
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  return useMemo(() => {
    const byLayer = Object.fromEntries(
      DATA_LAYERS.map((l) => [l.id, [] as PlaceFeature[]]),
    ) as Record<DataLayerId, PlaceFeature[]>;
    const loading = new Set<DataLayerId>();
    const failed = new Set<DataLayerId>();
    files.forEach((f, i) => {
      const r = results[i];
      if (r?.data) byLayer[f.layer].push(...r.data.features);
      else if (r?.isError) failed.add(f.layer);
      else loading.add(f.layer);
    });
    return { byLayer, loading, failed };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stamp` stands in for `results`
  }, [files, stamp]);
}

export function useUnlocated(county: CountyId | null, manifest: Manifest) {
  const has = county !== null && (manifest.counties[county]?.unlocated ?? 0) > 0;
  return useQuery({
    queryKey: ['unlocated', county],
    queryFn: () => getJson<UnlocatedList>(unlocatedFile(county!)),
    enabled: has,
    staleTime: Infinity,
  });
}

/** The county a point falls in, from the boundary polygons. */
export function countyAt(data: BoundaryData, lng: number, lat: number): CountyId | null {
  const f = data.counties.features.find((c) => booleanPointInPolygon([lng, lat], c.geometry));
  return f?.properties.id ?? null;
}

/**
 * Who owns the land at a point: a public-owner parcel if one covers it, else the BLM SMA agency.
 * Loads the county's land layer if it isn't loaded yet.
 */
export async function landOwnerAt(
  client: QueryClient,
  manifest: Manifest,
  county: CountyId,
  lng: number,
  lat: number,
): Promise<string | null> {
  if (!hasLayer(manifest, county, 'land')) return null;
  const land = await client.fetchQuery(layerQuery(county, 'land'));
  const hits = land.features.filter(
    (f) =>
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
      booleanPointInPolygon([lng, lat], f.geometry),
  );
  const parcel = hits.find((f) => f.properties.kind.startsWith('parcel-'));
  const agency = hits.find((f) => !f.properties.kind.startsWith('parcel-'));
  // The parcel is more specific: the SMA calls county and city land "Private".
  const f = parcel ?? agency;
  return f ? (f.properties.owner ?? f.properties.name) : null;
}
