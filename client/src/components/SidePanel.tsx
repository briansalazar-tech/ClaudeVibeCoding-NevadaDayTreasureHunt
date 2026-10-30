import { countyDisplayName, type CountyProperties } from '@hunt/shared';
import type { BoundaryData } from '../data';
import { useHuntStore } from '../state/store';
import { DisplaySettings } from './DisplaySettings';
import { squareMiles } from './format';

export function SidePanel({ data }: { data: Pick<BoundaryData, 'counties' | 'manifest'> }) {
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const sheetOpen = useHuntStore((s) => s.sheetOpen);
  const selectCounty = useHuntStore((s) => s.selectCounty);
  const stepCounty = useHuntStore((s) => s.stepCounty);
  const setSheetOpen = useHuntStore((s) => s.setSheetOpen);

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
        {selected ? (
          <CountyDetail
            county={selected.properties}
            layerCount={
              Object.keys(data.manifest.counties[selected.properties.id]?.layers ?? {}).length
            }
          />
        ) : (
          <CountyList counties={data.counties.features.map((f) => f.properties)} />
        )}
        <DisplaySettings />
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

function CountyDetail({ county, layerCount }: { county: CountyProperties; layerCount: number }) {
  // Carson City is its own seat: a consolidated city-county.
  const consolidated = county.seat === county.name;
  return (
    <>
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
      <section className="panel-section" aria-labelledby="county-places-heading">
        <h2 id="county-places-heading">Places</h2>
        {layerCount === 0 && (
          <p className="muted">No layer data has been built for this county yet.</p>
        )}
      </section>
    </>
  );
}
