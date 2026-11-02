import { routeMatches, splitRefs, type PlaceFeature } from '@hunt/shared';
import type { RoadHighlight } from '../state/store';

/** The loaded street pieces a search highlight covers: a route number, or a street by name. */
export function highlightedStreetIds(
  streets: readonly PlaceFeature[],
  highlight: RoadHighlight | null,
): string[] {
  if (!highlight) return [];
  const { counties, routes, name, kind } = highlight;
  const ids: string[] = [];
  for (const f of streets) {
    const p = f.properties;
    if (!counties.includes(p.county as RoadHighlight['counties'][number])) continue;
    const hit = routes
      ? splitRefs(p.ref).some((r) => routes.some((q) => routeMatches(r, q)))
      : p.name === name && (!kind || p.kind === kind);
    if (hit) ids.push(p.id);
  }
  return ids;
}
