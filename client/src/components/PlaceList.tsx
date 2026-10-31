import {
  DATA_LAYERS,
  kindLabel,
  layerName,
  markerFeatureId,
  statusName,
  type CountyId,
  type DataLayerId,
  type LayerId,
  type Manifest,
  type Marker,
  type PlaceFeature,
  type UnlocatedPlace,
} from '@hunt/shared';
import { useDeferredValue, useMemo, useState } from 'react';
import { useUnlocated } from '../layerData';
import { placeItems, type PlaceItem } from './placeItems';
import { useHuntStore } from '../state/store';

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

interface PlaceListProps {
  county: CountyId;
  manifest: Manifest;
  byLayer: Record<DataLayerId, PlaceFeature[]>;
  loading: Set<DataLayerId>;
  markers: readonly Marker[];
  countyOf: (lng: number, lat: number) => CountyId | null;
}

export function PlaceList({
  county,
  manifest,
  byLayer,
  loading,
  markers,
  countyOf,
}: PlaceListProps) {
  const [filter, setFilter] = useState('');
  const query = useDeferredValue(filter.trim().toLowerCase());
  const focusFeature = useHuntStore((s) => s.focusFeature);
  const unlocated = useUnlocated(county, manifest);

  const groups = useMemo(() => {
    const out: { layer: LayerId; name: string; items: PlaceItem[] }[] = [];
    const mine = markers
      .filter((m) => countyOf(m.lng, m.lat) === county)
      .map((m): PlaceItem => ({
        key: markerFeatureId(m.id),
        id: markerFeatureId(m.id),
        layer: m.layer,
        name: m.name,
        kind: statusName(m.status),
        lng: m.lng,
        lat: m.lat,
      }));
    if (mine.length) out.push({ layer: 'custom', name: 'Your markers', items: mine });
    for (const { id } of DATA_LAYERS) {
      if (id === 'land') continue;
      const items = placeItems(byLayer[id], id, county);
      if (items.length) out.push({ layer: id, name: layerName(id), items });
    }
    return out;
  }, [byLayer, county, markers, countyOf]);

  const filtered = query
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => matches(i.name, query) || matches(kindLabel(i.kind), query)),
        }))
        .filter((g) => g.items.length)
    : groups;
  const unlocatedItems = (unlocated.data ?? []).filter((u) => !query || matches(u.name, query));
  const total = filtered.reduce((n, g) => n + g.items.length, 0);
  const hasData = Object.keys(manifest.counties[county]?.layers ?? {}).length > 0;

  if (!hasData) {
    return (
      <section className="panel-section" aria-labelledby="county-places-heading">
        <h2 id="county-places-heading">Places</h2>
        <p className="muted">No layer data has been built for this county yet.</p>
      </section>
    );
  }

  return (
    <section className="panel-section" aria-labelledby="county-places-heading">
      <h2 id="county-places-heading">Places</h2>
      <input
        type="search"
        className="text-input"
        placeholder="Filter places"
        aria-label="Filter places in this county"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <p className="muted place-count">
        {loading.size ? 'Loading layers… ' : ''}
        {total.toLocaleString()} {total === 1 ? 'place' : 'places'}
        {query ? ` matching “${filter.trim()}”` : ''}
      </p>
      {filtered.map((g) => (
        <PlaceGroup
          key={g.layer}
          name={g.name}
          items={g.items}
          open={Boolean(query) && total <= 200}
          onPick={focusFeature}
        />
      ))}
      {unlocatedItems.length > 0 && <Unlocated items={unlocatedItems} open={Boolean(query)} />}
    </section>
  );
}

function PlaceGroup({
  name,
  items,
  open,
  onPick,
}: {
  name: string;
  items: PlaceItem[];
  open: boolean;
  onPick: (item: PlaceItem) => void;
}) {
  const [userOpen, setUserOpen] = useState(false);
  const isOpen = open || userOpen;
  return (
    <details
      className="place-group"
      open={isOpen}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
    >
      <summary>
        {name} <span className="layer-count">{items.length.toLocaleString()}</span>
      </summary>
      {/* Long groups (street names) render only while open. */}
      {isOpen && (
        <ul className="place-list">
          {items.map((item) => (
            <li key={item.key}>
              <button type="button" onClick={() => onPick(item)}>
                <span className="place-name">{item.name}</span>
                <span className="place-kind">{kindLabel(item.kind)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Unlocated({ items, open }: { items: UnlocatedPlace[]; open: boolean }) {
  return (
    <details className="place-group" open={open || undefined}>
      <summary>
        Not on the map <span className="layer-count">{items.length}</span>
      </summary>
      <p className="muted unlocated-note">
        No confirmed location, so these aren’t placed on the map.
      </p>
      <ul className="unlocated-list">
        {items.map((u) => (
          <li key={u.id}>
            <span className="place-name">
              {u.wikipedia ? (
                <a href={u.wikipedia} target="_blank" rel="noopener noreferrer">
                  {u.name}
                </a>
              ) : (
                u.name
              )}
            </span>
            <span className="place-kind">
              {layerName(u.layer)} · {u.reason}
            </span>
            {u.detail && <span className="place-kind">{u.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
