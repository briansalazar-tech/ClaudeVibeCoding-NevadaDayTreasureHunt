import {
  LAYERS,
  landKindName,
  type CountyId,
  type DataLayerId,
  type HuntLayer,
  type Manifest,
  type Marker,
} from '@hunt/shared';
import type { LoadedLayers } from '../layerData';
import { LAND_COLORS, layerSwatch, STATUS_COLORS } from '../map/dataLayers';
import { useHuntStore } from '../state/store';

function Swatch({ layer }: { layer: HuntLayer }) {
  if (layer.id === 'custom') {
    return (
      <span
        className="swatch swatch-pin"
        style={{ background: STATUS_COLORS['to-check'] }}
        aria-hidden
      />
    );
  }
  const { shape, color } = layerSwatch(layer.id);
  const lineLayers = ['streets', 'historic-trails', 'land'];
  return (
    <span
      className={`swatch swatch-${lineLayers.includes(layer.id) ? (layer.id === 'land' ? 'square' : 'line') : shape}`}
      style={{ background: layer.id === 'land' ? LAND_COLORS.BLM : color }}
      aria-hidden
    />
  );
}

function countFor(manifest: Manifest, layer: DataLayerId, county: CountyId | null): number {
  const counties = county ? [county] : Object.keys(manifest.counties);
  return counties.reduce((n, c) => n + (manifest.counties[c]?.layers[layer]?.count ?? 0), 0);
}

interface LayerPanelProps {
  manifest: Manifest;
  loaded: LoadedLayers;
  markers: readonly Marker[];
}

export function LayerPanel({ manifest, loaded, markers }: LayerPanelProps) {
  const visible = useHuntStore((s) => s.layers);
  const streetLabels = useHuntStore((s) => s.streetLabels);
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const zoom = useHuntStore((s) => s.view?.zoom ?? 0);
  const setLayerVisible = useHuntStore((s) => s.setLayerVisible);
  const setAllLayers = useHuntStore((s) => s.setAllLayers);
  const setStreetLabels = useHuntStore((s) => s.setStreetLabels);

  const landKinds = [...new Set(loaded.byLayer.land.map((f) => f.properties.kind))].sort(
    (a, b) => Object.keys(LAND_COLORS).indexOf(a) - Object.keys(LAND_COLORS).indexOf(b),
  );

  return (
    <section className="panel-section" aria-labelledby="layers-heading">
      <div className="section-heading">
        <h2 id="layers-heading">Layers</h2>
        <div className="heading-actions">
          <button type="button" className="link-button" onClick={() => setAllLayers(true)}>
            All on
          </button>
          <button type="button" className="link-button" onClick={() => setAllLayers(false)}>
            All off
          </button>
        </div>
      </div>
      <ul className="layer-list">
        {LAYERS.map((layer) => {
          const isCustom = layer.id === 'custom';
          const count = isCustom
            ? markers.filter((m) => m.layer === 'custom').length
            : countFor(manifest, layer.id, selectedCountyId);
          const extraMarkers = isCustom ? 0 : markers.filter((m) => m.layer === layer.id).length;
          let status = '';
          if (!isCustom) {
            const id = layer.id;
            if (loaded.failed.has(id)) status = 'Couldn’t load';
            else if (loaded.loading.has(id)) status = 'Loading…';
            else if (
              'heavy' in layer &&
              visible[layer.id] &&
              !selectedCountyId &&
              zoom < layer.heavy.minzoom &&
              count > 0
            )
              status = 'Zoom in or pick a county to load';
          }
          return (
            <li key={layer.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  checked={visible[layer.id]}
                  onChange={(e) => setLayerVisible(layer.id, e.target.checked)}
                />
                <Swatch layer={layer} />
                <span className="layer-text">
                  <span className="layer-name">
                    {layer.name}
                    <span className="layer-count">
                      {count.toLocaleString()}
                      {extraMarkers ? ` + ${extraMarkers} yours` : ''}
                    </span>
                  </span>
                  <span className="layer-description">{status || layer.description}</span>
                </span>
              </label>
              {layer.id === 'streets' && (
                <label className="layer-row layer-sub">
                  <input
                    type="checkbox"
                    checked={streetLabels}
                    disabled={!visible.streets}
                    onChange={(e) => setStreetLabels(e.target.checked)}
                  />
                  <span className="layer-text">Street names</span>
                </label>
              )}
              {layer.id === 'land' && visible.land && landKinds.length > 0 && (
                <ul className="legend" aria-label="Land ownership legend">
                  {landKinds.map((k) => (
                    <li key={k}>
                      <span
                        className="swatch swatch-square"
                        style={{ background: LAND_COLORS[k] ?? '#d4d4d4' }}
                        aria-hidden
                      />
                      {landKindName(k)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {Object.values(manifest.counties).every((c) => Object.keys(c.layers).length === 0) && (
        <p className="muted">No layer data has been built yet. Run npm run data:build.</p>
      )}
    </section>
  );
}
