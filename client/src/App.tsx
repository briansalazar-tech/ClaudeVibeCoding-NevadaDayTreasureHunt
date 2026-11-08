import { useCallback, useEffect, useMemo } from 'react';
import { useMarkers } from './api';
import { BasemapSwitcher } from './components/BasemapSwitcher';
import { AddMarkerControl, MarkerForm } from './components/MarkerForm';
import { SidePanel } from './components/SidePanel';
import { useBoundaryData, type BoundaryData } from './data';
import { countyAt, useLayerData } from './layerData';
import { MapView } from './map/MapView';
import { useSavePage } from './notebook/api';
import { useNotebook } from './notebook/context';
import { NotebookProvider } from './notebook/NotebookProvider';
import { notebookFeatures } from './notebook/places';
import { useHuntStore } from './state/store';

export function App() {
  const state = useBoundaryData();
  const theme = useHuntStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { markerEditor, setMarkerEditor, selectCounty, pin, highlight, clearSearch } =
        useHuntStore.getState();
      const { placingPage, setPlacingPage } = useHuntStore.getState();
      // Esc backs out of adding a marker (or putting a page on the map) first, then clears a
      // search pin or road highlight, then leaves the selected county.
      if (markerEditor) setMarkerEditor(null);
      else if (placingPage !== null) setPlacingPage(null);
      else if (pin || highlight) clearSearch();
      else selectCounty(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (state.status === 'loading') return <div className="app-message">Loading map data…</div>;
  if (state.status === 'error') {
    return (
      <div className="app-message" role="alert">
        {state.error.message}
      </div>
    );
  }
  return <HuntMap data={state.data} />;
}

function HuntMap({ data }: { data: BoundaryData }) {
  const countyOf = useCallback((lng: number, lat: number) => countyAt(data, lng, lat), [data]);
  return (
    <NotebookProvider manifest={data.manifest} countyOf={countyOf}>
      <HuntLayout data={data} countyOf={countyOf} />
    </NotebookProvider>
  );
}

function HuntLayout({
  data,
  countyOf,
}: {
  data: BoundaryData;
  countyOf: (lng: number, lat: number) => ReturnType<typeof countyAt>;
}) {
  const loaded = useLayerData(data);
  const markers = useMarkers();
  const markerList = markers.data ?? [];
  const { pages, names } = useNotebook();
  const panelTab = useHuntStore((s) => s.panelTab);
  const notebookFull = useHuntStore((s) => s.notebookFull && s.panelTab === 'notebook');
  const savePage = useSavePage();
  const notebook = useMemo(() => notebookFeatures(pages, names), [pages, names]);
  const inHuntArea = useCallback(
    (lng: number, lat: number) => countyAt(data, lng, lat) !== null,
    [data],
  );
  const { mutate: savePageMutate } = savePage;
  const placePage = useCallback(
    (id: number, lng: number, lat: number) => savePageMutate({ id, patch: { spot: { lng, lat } } }),
    [savePageMutate],
  );

  return (
    <div className="app" data-panel={panelTab} data-notebook-full={notebookFull}>
      <main className="map-wrap" hidden={notebookFull}>
        <MapView
          data={data}
          layers={loaded.byLayer}
          markers={markerList}
          notebook={notebook}
          onPlacePage={placePage}
        />
        <BasemapSwitcher />
        <AddMarkerControl />
        <PlacingPageBanner />
        {markers.isError && (
          <p className="map-notice" role="alert">
            Custom markers unavailable: {markers.error.message}
          </p>
        )}
        {savePage.isError && (
          <p className="map-notice" role="alert">
            Couldn’t put the page on the map: {savePage.error.message}
          </p>
        )}
      </main>
      <SidePanel data={data} loaded={loaded} markers={markerList} countyOf={countyOf} />
      <MarkerForm markers={markerList} inHuntArea={inHuntArea} />
    </div>
  );
}

/** "Put on map": waiting for the click that says where the page goes. */
function PlacingPageBanner() {
  const pageId = useHuntStore((s) => s.placingPage);
  const setPlacingPage = useHuntStore((s) => s.setPlacingPage);
  const { pages } = useNotebook();
  if (pageId === null) return null;
  const page = pages.find((p) => p.id === pageId);
  return (
    <div className="placing-banner" role="status">
      <span>Click the map where “{page?.title ?? 'the page'}” goes.</span>
      <button type="button" className="small-button" onClick={() => setPlacingPage(null)}>
        Cancel
      </button>
    </div>
  );
}
