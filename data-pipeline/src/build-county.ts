/**
 * Assembles one county's layers from the step outputs: dedupes overlapping sources,
 * clips to the county, and returns the features per layer plus the "Not on the map" list.
 * Pure: the I/O is in build.ts.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import {
  DATA_LAYERS,
  type DataLayerId,
  type HuntCounty,
  type PastFind,
  type PlaceFeature,
  type UnlocatedPlace,
} from '@hunt/shared';
import type { MultiPolygon, Point, Polygon } from 'geojson';
import type { ClipArea } from './lib/clip.js';
import { metersToGeometry } from './lib/geo.js';
import { normalizeName } from './lib/names.js';
import { finalizeDrafts, representativePoint, type LayerDraft } from './lib/place.js';
import { gnisDrafts, type GnisName } from './steps/gnis.js';

type Area = Polygon | MultiPolygon;

interface WithUnlocated {
  drafts: LayerDraft[];
  unlocated: UnlocatedPlace[];
}

export interface CountyInputs {
  county: HuntCounty;
  area: ClipArea;
  /** OSM features already sorted into layers (classifyOsm). */
  osm: LayerDraft[];
  gnis: readonly GnisName[];
  npsTrails: LayerDraft[];
  sma: LayerDraft[];
  parcels: LayerDraft[];
  countyParks: LayerDraft[];
  markers: WithUnlocated;
  register: WithUnlocated;
  ghostTowns: WithUnlocated;
  pastFinds: readonly PastFind[];
}

export interface CountyLayers {
  layers: Record<DataLayerId, PlaceFeature[]>;
  unlocated: UnlocatedPlace[];
  notes: string[];
}

function isArea(d: LayerDraft): boolean {
  return d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon';
}

/** Drops drafts that duplicate one already kept: same name nearby, or inside a kept polygon. */
function withoutDuplicates(
  candidates: readonly LayerDraft[],
  existing: readonly LayerDraft[],
  maxMeters: number,
): { kept: LayerDraft[]; dropped: number } {
  const byName = new Map<string, LayerDraft[]>();
  for (const e of existing) {
    if (!e.named) continue;
    const k = normalizeName(e.name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const areas = existing.filter(isArea);
  const points = existing.filter((e) => e.geometry.type === 'Point');
  const kept: LayerDraft[] = [];
  let dropped = 0;
  for (const c of candidates) {
    const p = representativePoint(c.geometry);
    const key = c.named ? normalizeName(c.name) : '';
    // Same name, or one name inside the other ("Out of Town Park", "Fernley Out-of-Town Park").
    const twins = key
      ? [...byName.entries()]
          .filter(
            ([k]) => k === key || ` ${k} `.includes(` ${key} `) || ` ${key} `.includes(` ${k} `),
          )
          .flatMap(([, v]) => v)
      : [];
    const dup =
      twins.some((t) => metersToGeometry(p, t.geometry) <= maxMeters) ||
      areas.some((a) => booleanPointInPolygon(p, a.geometry as Area)) ||
      // A candidate area that already has a point feature inside it (a park mapped as a point).
      (isArea(c) &&
        points.some((e) =>
          booleanPointInPolygon((e.geometry as Point).coordinates, c.geometry as Area),
        ));
    if (dup) dropped++;
    else kept.push(c);
  }
  return { kept, dropped };
}

function pastFindDrafts(finds: readonly PastFind[], county: HuntCounty): LayerDraft[] {
  return finds
    .filter((f) => f.county === county.id)
    .map((f) => ({
      id: `find:${f.year}`,
      layer: 'past-finds' as const,
      kind: 'past-find',
      name: `${f.year}: ${f.name}`,
      named: true,
      geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] },
      detail: f.note,
      source: 'Entered by hand',
    }));
}

export function buildCountyLayers(input: CountyInputs): CountyLayers {
  const notes: string[] = [];
  const byLayer = (layer: DataLayerId) => input.osm.filter((d) => d.layer === layer);

  // Parks: OSM, plus county-list parks OSM doesn't already cover.
  const osmParks = byLayer('parks');
  const countyParks = withoutDuplicates(input.countyParks, osmParks, 1000);
  if (input.countyParks.length) {
    notes.push(
      `parks: ${countyParks.kept.length} of ${input.countyParks.length} county-list parks added (${countyParks.dropped} already in OSM)`,
    );
  }

  // Nature: OSM, plus GNIS names OSM lacks.
  const osmNature = byLayer('nature');
  const gnis = gnisDrafts(input.gnis, osmNature);

  // Ghost towns: Wikipedia's list, plus OSM abandoned places with other names.
  const osmGhosts = withoutDuplicates(byLayer('ghost-towns'), input.ghostTowns.drafts, 3000);

  const drafts: Record<DataLayerId, LayerDraft[]> = {
    streets: byLayer('streets'),
    parks: [...osmParks, ...countyParks.kept],
    trails: byLayer('trails'),
    'historic-trails': [...input.npsTrails, ...byLayer('historic-trails')],
    towns: byLayer('towns'),
    nature: [...osmNature, ...gnis.drafts],
    'state-markers': input.markers.drafts.filter((d) => d.layer === 'state-markers'),
    markers: input.markers.drafts.filter((d) => d.layer === 'markers'),
    register: input.register.drafts,
    'ghost-towns': [...input.ghostTowns.drafts, ...osmGhosts.kept],
    // Parcels after the SMA so they draw on top of it.
    land: [...input.sma, ...input.parcels],
    notable: byLayer('notable'),
    'past-finds': pastFindDrafts(input.pastFinds, input.county),
  };

  const layers = {} as Record<DataLayerId, PlaceFeature[]>;
  for (const { id } of DATA_LAYERS) {
    const seen = new Set<string>();
    layers[id] = finalizeDrafts(drafts[id], input.county.id, input.area).filter((f) => {
      if (seen.has(f.properties.id)) return false;
      seen.add(f.properties.id);
      return true;
    });
  }

  const gnisAdded = layers.nature.filter((f) => f.properties.id.startsWith('gnis:')).length;
  notes.push(`nature: ${gnisAdded} GNIS names added, ${gnis.duplicates} duplicates of OSM skipped`);

  const unlocated = [
    ...input.markers.unlocated,
    ...input.register.unlocated,
    ...input.ghostTowns.unlocated,
  ].sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));

  return { layers, unlocated, notes };
}
