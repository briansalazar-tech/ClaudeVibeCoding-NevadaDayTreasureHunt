import { useEffect } from 'react';
import { BasemapSwitcher } from './components/BasemapSwitcher';
import { SidePanel } from './components/SidePanel';
import { useBoundaryData } from './data';
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
      if (e.key === 'Escape') useHuntStore.getState().selectCounty(null);
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

  return (
    <div className="app">
      <main className="map-wrap">
        <MapView data={state.data} />
        <BasemapSwitcher />
      </main>
      <SidePanel data={state.data} />
    </div>
  );
}
