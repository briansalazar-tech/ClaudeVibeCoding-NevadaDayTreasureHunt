import { BASEMAPS } from '../map/basemaps';
import { useHuntStore } from '../state/store';
import { Segmented } from './Segmented';

const OPTIONS = BASEMAPS.map((b) => ({ value: b.id, label: b.label }));

export function BasemapSwitcher() {
  const basemap = useHuntStore((s) => s.basemap);
  const setBasemap = useHuntStore((s) => s.setBasemap);
  return (
    <Segmented
      className="basemap-switcher"
      legend="Basemap"
      name="basemap"
      options={OPTIONS}
      value={basemap}
      onChange={setBasemap}
    />
  );
}
