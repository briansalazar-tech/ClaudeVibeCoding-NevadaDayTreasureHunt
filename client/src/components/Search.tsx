import {
  countyDisplayName,
  getCounty,
  kindLabel,
  layerName,
  markerFeatureId,
  pageTypeName,
  statusName,
  type CountyId,
  type GeocodeResult,
  type Manifest,
  type Marker,
} from '@hunt/shared';
import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useGeocode } from '../api';
import { useOptionalNotebook } from '../notebook/context';
import { findEntry, goToPlace } from '../notebook/places';
import {
  nearbyPlaces,
  searchPlaces,
  type CoordinateHit,
  type IndexedEntry,
  type PlaceIndex,
  type SearchHit,
} from '../search/searchIndex';
import { useSearchIndex } from '../search/useSearchIndex';
import { isPhone, useHuntStore, type NearbyItem } from '../state/store';

export const MIN_QUERY = 2;

function countyName(id: CountyId | null): string {
  const county = id ? getCounty(id) : undefined;
  return county ? countyDisplayName(county) : 'Outside the hunt counties';
}

function nearbyItems(index: PlaceIndex | null, lng: number, lat: number): NearbyItem[] {
  if (!index) return [];
  return nearbyPlaces(index, lng, lat).map(({ entry, meters }) => ({
    id: entry.id,
    name: entry.name,
    layer: entry.layer,
    kind: entry.kind,
    lng: entry.lng,
    lat: entry.lat,
    bbox: entry.bbox,
    meters,
  }));
}

interface SearchBoxProps {
  query: string;
  onQuery: (query: string) => void;
  allCounties: boolean;
  onAllCounties: (all: boolean) => void;
  onSubmit: () => void;
}

/** The search input, in the panel header so it's there in every view (and on a phone). */
export function SearchBox({
  query,
  onQuery,
  allCounties,
  onAllCounties,
  onSubmit,
}: SearchBoxProps) {
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const setSheetOpen = useHuntStore((s) => s.setSheetOpen);
  const clearSearch = useHuntStore((s) => s.clearSearch);
  const county = selectedCountyId ? getCounty(selectedCountyId) : undefined;
  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="search-row">
        <input
          type="search"
          className="text-input"
          placeholder="Search places, roads, coordinates, addresses"
          aria-label="Search the map"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            if (e.target.value.trim().length >= MIN_QUERY) setSheetOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              onQuery('');
              clearSearch();
            }
          }}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="small-button"
            onClick={() => {
              onQuery('');
              clearSearch();
            }}
          >
            Clear
          </button>
        )}
      </div>
      {county && (
        <div className="search-scope" role="radiogroup" aria-label="Search where">
          <label>
            <input
              type="radio"
              name="search-scope"
              checked={!allCounties}
              onChange={() => onAllCounties(false)}
            />
            <span>In {countyDisplayName(county)}</span>
          </label>
          <label>
            <input
              type="radio"
              name="search-scope"
              checked={allCounties}
              onChange={() => onAllCounties(true)}
            />
            <span>All counties</span>
          </label>
        </div>
      )}
    </form>
  );
}

interface SearchResultsProps {
  query: string;
  manifest: Manifest;
  markers: readonly Marker[];
  countyOf: (lng: number, lat: number) => CountyId | null;
  /** The county the search is limited to, or null for all. */
  scope: CountyId | null;
  onAllCounties: () => void;
  /** Bumped when Enter is pressed in the search box. */
  submitted: number;
}

function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line
    .replace(/^\s*([-*>]|#{1,3})\s+/, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .slice(0, 80);
}

function hitMeta(hit: SearchHit): string {
  if (hit.type === 'page') {
    const where = hit.county ? ` · ${countyName(hit.county)}` : '';
    return `Notebook · ${pageTypeName(hit.page.type)}${where}`;
  }
  if (hit.type === 'note') {
    return `Your note on ${hit.note.place.name} · ${countyName(hit.county)}`;
  }
  if (hit.type === 'marker') {
    return `Your marker · ${statusName(hit.marker.status)} · ${countyName(hit.county)}`;
  }
  if (hit.type === 'route') {
    const counties = hit.entries.map((e) => getCounty(e.county)?.name).join(', ');
    return [`Route · ${counties}`, hit.alt].filter(Boolean).join(' · ');
  }
  const e = hit.entry;
  const kind = kindLabel(e.kind);
  const parts = [layerName(e.layer)];
  if (kind !== parts[0]) parts.push(kind);
  if (e.routes?.length) parts.push(e.routes.join(', '));
  parts.push(countyName(e.county));
  return parts.join(' · ');
}

function hitName(hit: SearchHit): string {
  switch (hit.type) {
    case 'marker':
      return hit.marker.name;
    case 'route':
      return hit.name;
    case 'page':
      return hit.page.title;
    case 'note':
      return firstLine(hit.note.body);
    default:
      return hit.entry.name;
  }
}

export function SearchResults({
  query,
  manifest,
  markers,
  countyOf,
  scope,
  onAllCounties,
  submitted,
}: SearchResultsProps) {
  const deferred = useDeferredValue(query);
  const { index, loading, error } = useSearchIndex(manifest, true);
  const notebook = useOptionalNotebook();
  const pages = notebook?.pages;
  const notes = notebook?.notes;
  const outcome = useMemo(
    () =>
      searchPlaces(index, markers, deferred, {
        county: scope,
        countyAt: countyOf,
        pages,
        notes,
      }),
    [index, markers, deferred, scope, countyOf, pages, notes],
  );
  const geocode = useGeocode();
  const trimmed = query.trim();

  const store = useHuntStore;
  /** Moves the map to show a result: out of an isolated county if the result is elsewhere. */
  const arrive = (counties: (CountyId | null)[]) => {
    const { selectedCountyId, selectCounty, setSheetOpen } = store.getState();
    if (selectedCountyId && !counties.includes(selectedCountyId)) selectCounty(null);
    if (isPhone()) setSheetOpen(false);
  };

  const pickEntry = (entry: IndexedEntry) => {
    const { focusFeature, setHighlight, clearSearch } = store.getState();
    arrive([entry.county]);
    clearSearch();
    if (entry.layer === 'streets') {
      setHighlight({ counties: [entry.county], name: entry.name, kind: entry.kind });
    }
    focusFeature({
      id: entry.id,
      layer: entry.layer,
      lng: entry.lng,
      lat: entry.lat,
      bbox: entry.bbox,
    });
  };

  const pick = (hit: SearchHit) => {
    const { focusFeature, setHighlight, clearSearch } = store.getState();
    if (hit.type === 'place') {
      pickEntry(hit.entry);
    } else if (hit.type === 'page') {
      store.getState().openPage(hit.page.id);
    } else if (hit.type === 'note') {
      const place = hit.note.place;
      goToPlace(place, {
        entry: notebook ? findEntry(notebook.names, place) : undefined,
        county: hit.county,
      });
    } else if (hit.type === 'marker') {
      arrive([hit.county]);
      clearSearch();
      const m = hit.marker;
      focusFeature({ id: markerFeatureId(m.id), layer: m.layer, lng: m.lng, lat: m.lat });
    } else {
      const counties = hit.entries.map((e) => e.county);
      arrive(counties);
      clearSearch();
      setHighlight({ counties, routes: [hit.name] });
      const first = hit.entries[0]!;
      focusFeature({
        id: first.id,
        layer: 'streets',
        lng: first.lng,
        lat: first.lat,
        bbox: hit.bbox,
        popup: false,
      });
    }
  };

  const goToPoint = (
    lng: number,
    lat: number,
    county: CountyId | null,
    title: string,
    subtitle: string,
    warning?: string,
  ) => {
    const { showPoint, setHighlight } = store.getState();
    arrive([county]);
    setHighlight(null);
    showPoint({
      lng,
      lat,
      title,
      subtitle,
      warning: county ? warning : (warning ?? 'Outside the 8 hunt counties'),
      nearby: nearbyItems(index, lng, lat),
    });
  };

  const goToCoordinates = (c: CoordinateHit) => {
    const notes = [
      c.swapped ? 'Read as longitude, latitude and swapped.' : '',
      c.assumedWest ? 'No W or minus sign on the longitude, so west was assumed.' : '',
    ].filter(Boolean);
    goToPoint(
      c.lng,
      c.lat,
      c.county,
      `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
      `Coordinates · ${countyName(c.county)}`,
      notes.join(' ') || undefined,
    );
  };

  const goToAddress = (a: GeocodeResult, source: string) =>
    goToPoint(a.lng, a.lat, a.county, a.label, `Address · ${countyName(a.county)} · via ${source}`);

  const sourceName = (s: string | null) => (s === 'census' ? 'US Census geocoder' : 'Nominatim');

  const lookUp = () => {
    geocode.mutate(trimmed, {
      onSuccess: (res) => {
        const inScope = res.results.filter((r) => !scope || r.county === scope);
        // A single match: go straight there.
        if (inScope.length === 1) goToAddress(inScope[0]!, sourceName(res.source));
      },
    });
  };

  // Enter: coordinates go straight there, an address is looked up, otherwise the top result.
  const onEnter = useRef<() => void>(() => {});
  useEffect(() => {
    onEnter.current = () => {
      if (outcome.coordinates) goToCoordinates(outcome.coordinates);
      else if (outcome.addressLike) lookUp();
      else if (outcome.hits.length) pick(outcome.hits[0]!);
      // Nothing local matched (and the index has loaded): try it as an address.
      else if (index) lookUp();
    };
  });
  const handled = useRef(submitted);
  useEffect(() => {
    if (submitted === handled.current) return;
    handled.current = submitted;
    onEnter.current();
  }, [submitted]);

  const addressDone = geocode.variables === trimmed ? geocode : null;
  const addressResults = addressDone?.data?.results ?? [];
  const addressInScope = addressResults.filter((r) => !scope || r.county === scope);

  const addressRow = (
    <div className="search-address">
      {addressDone?.isPending ? (
        <p className="muted">Looking up the address…</p>
      ) : addressDone?.isError ? (
        <p className="form-error">{addressDone.error.message}</p>
      ) : addressDone?.data ? (
        <AddressResults
          results={addressInScope}
          others={addressResults.length - addressInScope.length}
          outside={addressDone.data.outside}
          source={sourceName(addressDone.data.source)}
          onPick={(a) => goToAddress(a, sourceName(addressDone.data.source))}
        />
      ) : (
        <button type="button" className="search-hit search-lookup" onClick={lookUp}>
          <span className="place-name">Look up “{trimmed}” as an address</span>
          <span className="place-kind">Searches Nominatim, then the US Census geocoder</span>
        </button>
      )}
    </div>
  );

  if (outcome.coordinates) {
    const c = outcome.coordinates;
    return (
      <section className="panel-section search-results" aria-label="Search results">
        <button type="button" className="search-hit" onClick={() => goToCoordinates(c)}>
          <span className="place-name">
            Go to {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
          </span>
          <span className="place-kind">
            {c.format === 'decimal'
              ? 'Decimal degrees'
              : c.format === 'dm'
                ? 'Degrees, decimal minutes'
                : 'Degrees, minutes, seconds'}{' '}
            · {countyName(c.county)}
          </span>
          {c.swapped && <span className="form-note">Read as longitude, latitude and swapped.</span>}
          {c.assumedWest && (
            <span className="form-note">
              No W or minus sign on the longitude, so west was assumed.
            </span>
          )}
          {!c.county && (
            <span className="form-note warning">
              Outside the 8 hunt counties. The map still goes there.
            </span>
          )}
        </button>
      </section>
    );
  }

  const total = outcome.hits.length;
  return (
    <section className="panel-section search-results" aria-label="Search results">
      {outcome.addressLike && addressRow}
      {error && <p className="form-error">{error.message}</p>}
      {loading && !index ? (
        <p className="muted">Loading the search index…</p>
      ) : (
        <p className="muted place-count" aria-live="polite">
          {total
            ? `${total}${total >= 60 ? '+' : ''} ${total === 1 ? 'match' : 'matches'}`
            : 'No matching places'}
          {scope ? ` in ${countyDisplayName(getCounty(scope)!)}` : ''}
        </p>
      )}
      {total > 0 && (
        <ul className="place-list search-hits">
          {outcome.hits.map((hit) => (
            <li key={hit.key}>
              <button type="button" className="search-hit" onClick={() => pick(hit)}>
                <span className="place-name">{hitName(hit)}</span>
                <span className="place-kind">{hitMeta(hit)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {scope && outcome.elsewhere > 0 && (
        <p className="muted">
          {outcome.elsewhere} more in other counties.{' '}
          <button type="button" className="link-button" onClick={onAllCounties}>
            Search all counties
          </button>
        </p>
      )}
      {!outcome.addressLike && !outcome.route && addressRow}
    </section>
  );
}

function AddressResults({
  results,
  others,
  outside,
  source,
  onPick,
}: {
  results: GeocodeResult[];
  others: number;
  outside: number;
  source: string;
  onPick: (result: GeocodeResult) => void;
}) {
  const notes = [
    others ? `${others} in other counties` : '',
    outside ? `${outside} outside the hunt counties left out` : '',
  ].filter(Boolean);
  return (
    <>
      <p className="muted place-count">
        {results.length
          ? `${results.length} ${results.length === 1 ? 'address' : 'addresses'} via ${source}`
          : 'No address found in the hunt counties'}
        {notes.length ? ` (${notes.join('; ')})` : ''}
      </p>
      {results.length > 0 && (
        <ul className="place-list">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng},${r.label}`}>
              <button type="button" className="search-hit" onClick={() => onPick(r)}>
                <span className="place-name">{r.label}</span>
                <span className="place-kind">Address · {countyName(r.county)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
