/**
 * Builds a county's search index (`<county>/search.json`) from its finished layers: every named
 * place, as the county place list shows it, plus one entry per route number. Pure: build.ts
 * writes the file.
 */
import {
  DATA_LAYERS,
  ROUTE_KIND,
  extendBbox,
  geometryBbox,
  placeItems,
  splitRefs,
  type BBox,
  type CountyId,
  type DataLayerId,
  type PlaceFeature,
  type SearchEntry,
} from '@hunt/shared';

/** Land is parcels and agencies named by owner, which nobody searches for by name. */
const SKIP = new Set<DataLayerId>(['land']);

function roundBbox(b: BBox): BBox {
  return b.map((v) => Math.round(v * 1e5) / 1e5) as BBox;
}

interface RouteAcc {
  entry: SearchEntry;
  names: Set<string>;
}

export function searchEntries(
  layers: Record<DataLayerId, PlaceFeature[]>,
  county: CountyId,
): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const { id: layer } of DATA_LAYERS) {
    if (SKIP.has(layer)) continue;
    for (const item of placeItems(layers[layer], layer, county)) {
      const routes = splitRefs(item.ref);
      out.push({
        id: item.id,
        name: item.name,
        layer,
        kind: item.kind,
        lng: item.lng,
        lat: item.lat,
        ...(item.bbox ? { bbox: roundBbox(item.bbox) } : {}),
        ...(routes.length ? { routes } : {}),
      });
    }
  }

  // One entry per route number, spanning every piece of road that carries it.
  const routes = new Map<string, RouteAcc>();
  for (const f of layers.streets) {
    const p = f.properties;
    if (p.county !== county) continue;
    for (const route of splitRefs(p.ref)) {
      const box = geometryBbox(f.geometry);
      const acc = routes.get(route);
      if (acc) {
        acc.entry.bbox = extendBbox(acc.entry.bbox!, box);
      } else {
        routes.set(route, {
          entry: {
            id: p.id,
            name: route,
            layer: 'streets',
            kind: ROUTE_KIND,
            lng: p.lng!,
            lat: p.lat!,
            bbox: box,
            routes: [route],
          },
          names: new Set(),
        });
      }
      // Some roads are named by their numbers ("US 50, SR 439"); only real names describe a route.
      if (p.named && !splitRefs(p.name).length) routes.get(route)!.names.add(p.name);
    }
  }
  for (const { entry, names } of routes.values()) {
    const alt = [...names].sort().slice(0, 6).join(', ');
    out.push({ ...entry, bbox: roundBbox(entry.bbox!), ...(alt ? { alt } : {}) });
  }
  return out;
}
