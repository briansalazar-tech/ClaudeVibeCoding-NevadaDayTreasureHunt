import { useCallback, useEffect } from 'react';
import { useMarkers } from './api';
import { BasemapSwitcher } from './components/BasemapSwitcher';
import { AddMarkerControl, MarkerForm } from './components/MarkerForm';
import { SidePanel } from './components/SidePanel';
import { useBoundaryData, type BoundaryData } from './data';
import { countyAt, useLayerData } from './layerData';
import { MapView } from './map/MapView';
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
      const { markerEditor, setMarkerEditor, selectCounty } = useHuntStore.getState();
      // Esc backs out of adding a marker first, then out of the selected county.
      if (markerEditor) setMarkerEditor(null);
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
  const loaded = useLayerData(data);
  const markers = useMarkers();
  const markerList = markers.data ?? [];
  const countyOf = useCallback((lng: number, lat: number) => countyAt(data, lng, lat), [data]);
  const inHuntArea = useCallback(
    (lng: number, lat: number) => countyAt(data, lng, lat) !== null,
    [data],
  );

  return (
    <div className="app">
      <main className="map-wrap">
        <MapView data={data} layers={loaded.byLayer} markers={markerList} />
        <BasemapSwitcher />
        <AddMarkerControl />
        {markers.isError && (
          <p className="map-notice" role="alert">
            Custom markers unavailable: {markers.error.message}
          </p>
        )}
      </main>
      <SidePanel data={data} loaded={loaded} markers={markerList} countyOf={countyOf} />
      <MarkerForm markers={markerList} inHuntArea={inHuntArea} />
    </div>
  );
}
