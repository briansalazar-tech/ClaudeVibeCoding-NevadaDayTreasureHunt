import {
  DATA_LAYERS,
  countyDisplayName,
  type CountyId,
  type CountyProperties,
  type Marker,
} from '@hunt/shared';
import type { BoundaryData } from '../data';
import type { LoadedLayers } from '../layerData';
import { useHuntStore, type PanelTab } from '../state/store';
import { DisplaySettings } from './DisplaySettings';
import { squareMiles } from './format';
import { LayerPanel } from './LayerPanel';
import { PlaceList } from './PlaceList';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'county', label: 'County' },
  { id: 'layers', label: 'Layers' },
  { id: 'display', label: 'Display' },
];

const NO_LAYERS: LoadedLayers = {
  byLayer: Object.fromEntries(
    DATA_LAYERS.map((l) => [l.id, []]),
  ) as unknown as LoadedLayers['byLayer'],
  loading: new Set(),
  failed: new Set(),
};

interface SidePanelProps {
  data: Pick<BoundaryData, 'counties' | 'manifest'>;
  loaded?: LoadedLayers;
  markers?: readonly Marker[];
  countyOf?: (lng: number, lat: number) => CountyId | null;
}

export function SidePanel({
  data,
  loaded = NO_LAYERS,
  markers = [],
  countyOf = () => null,
}: SidePanelProps) {
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const sheetOpen = useHuntStore((s) => s.sheetOpen);
  const panelTab = useHuntStore((s) => s.panelTab);
  const selectCounty = useHuntStore((s) => s.selectCounty);
  const stepCounty = useHuntStore((s) => s.stepCounty);
  const setSheetOpen = useHuntStore((s) => s.setSheetOpen);
  const setPanelTab = useHuntStore((s) => s.setPanelTab);

  const selected = data.counties.features.find((f) => f.properties.id === selectedCountyId);
  const title = selected ? countyDisplayName(selected.properties) : 'All counties';

  return (
    <aside className="panel" data-sheet-open={sheetOpen} aria-label="County panel">
      <header className="panel-header">
        <div className="panel-topline">
          {selected ? (
            <button type="button" className="link-button" onClick={() => selectCounty(null)}>
              ← All counties
            </button>
          ) : (
            <span className="app-name">Nevada Day Hunt Map</span>
          )}
          <button
            type="button"
            className="sheet-toggle"
            aria-expanded={sheetOpen}
            aria-controls="panel-body"
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            {sheetOpen ? 'Hide' : 'Details'}
          </button>
        </div>
        <nav className="county-nav" aria-label="Step through counties">
          <button type="button" aria-label="Previous county" onClick={() => stepCounty(-1)}>
            ‹
          </button>
          <h1>{title}</h1>
          <button type="button" aria-label="Next county" onClick={() => stepCounty(1)}>
            ›
          </button>
        </nav>
      </header>
      <div className="panel-body" id="panel-body">
        <div className="tabs" role="tablist" aria-label="Panel sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={panelTab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              onClick={() => setPanelTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`tabpanel-${panelTab}`} aria-labelledby={`tab-${panelTab}`}>
          {panelTab === 'county' &&
            (selected ? (
              <>
                <CountyDetail county={selected.properties} />
                <PlaceList
                  county={selected.properties.id}
                  manifest={data.manifest}
                  byLayer={loaded.byLayer}
                  loading={loaded.loading}
                  markers={markers}
                  countyOf={countyOf}
                />
              </>
            ) : (
              <CountyList counties={data.counties.features.map((f) => f.properties)} />
            ))}
          {panelTab === 'layers' && (
            <LayerPanel manifest={data.manifest} loaded={loaded} markers={markers} />
          )}
          {panelTab === 'display' && <DisplaySettings />}
        </div>
      </div>
    </aside>
  );
}

function CountyList({ counties }: { counties: CountyProperties[] }) {
  const hoveredCountyId = useHuntStore((s) => s.hoveredCountyId);
  const selectCounty = useHuntStore((s) => s.selectCounty);
  const setHovered = useHuntStore((s) => s.setHovered);
  return (
    <section className="panel-section" aria-labelledby="county-list-heading">
      <h2 id="county-list-heading">Counties</h2>
      <ul className="county-list">
        {counties.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              data-hovered={hoveredCountyId === c.id}
              onClick={() => selectCounty(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(c.id)}
              onBlur={() => setHovered(null)}
            >
              <span className="county-name">{c.name}</span>
              <span className="county-meta">
                {c.seat} · {squareMiles(c.landArea)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CountyDetail({ county }: { county: CountyProperties }) {
  // Carson City is its own seat: a consolidated city-county.
  const consolidated = county.seat === county.name;
  return (
    <section className="panel-section" aria-labelledby="county-facts-heading">
      <h2 id="county-facts-heading">About</h2>
      <dl className="facts">
        <dt>County seat</dt>
        <dd>{consolidated ? `${county.seat} (consolidated city-county)` : county.seat}</dd>
        <dt>Land area</dt>
        <dd>{squareMiles(county.landArea)}</dd>
        <dt>Water area</dt>
        <dd>{squareMiles(county.waterArea)}</dd>
        <dt>FIPS</dt>
        <dd>{county.fips}</dd>
      </dl>
    </section>
  );
}
