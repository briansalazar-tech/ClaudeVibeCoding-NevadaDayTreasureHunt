import 'maplibre-gl/dist/maplibre-gl.css';
import { getCounty, isCountyId, type BBox, type CountyId } from '@hunt/shared';
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef } from 'react';
import type { BoundaryData } from '../data';
import { useHuntStore } from '../state/store';
import { baseStyle } from './basemaps';
import { LAYERS, SOURCES, applyOverlayState, withOverlay, type OverlayState } from './overlay';

// MapLibre builds its worker URL at runtime, which Vite can't see, so the worker never gets
// served or bundled. The worker parses vector tiles and GeoJSON: without it the street basemap
// and every overlay layer stay blank, while raster basemaps still draw.
setWorkerUrl(maplibreWorkerUrl);

const FIT_PADDING = 32;
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

function overlayState(): OverlayState {
  const { theme, labelSize, selectedCountyId } = useHuntStore.getState();
  return { theme, labelSize, selectedCountyId };
}

function countyAt(map: MapLibreMap, e: MapMouseEvent): CountyId | null {
  if (!map.getLayer(LAYERS.fill)) return null;
  const id: unknown = map.queryRenderedFeatures(e.point, { layers: [LAYERS.fill] })[0]?.properties
    .id;
  return typeof id === 'string' && isCountyId(id) ? id : null;
}

function bboxFor(data: BoundaryData, id: CountyId | null): BBox {
  return (
    data.counties.features.find((f) => f.properties.id === id)?.properties.bbox ??
    data.manifest.bbox
  );
}

export function MapView({ data }: { data: BoundaryData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const basemap = useHuntStore((s) => s.basemap);
  const theme = useHuntStore((s) => s.theme);
  const labelSize = useHuntStore((s) => s.labelSize);
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const hoveredCountyId = useHuntStore((s) => s.hoveredCountyId);

  // Create the map once per data load. Later setting changes go through the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { basemap, theme, selectCounty, setHovered } = useHuntStore.getState();

    const map = new MapLibreMap({
      container,
      style: baseStyle(basemap, theme),
      // Re-applied on every setStyle, so switching basemaps keeps the county overlay.
      transformStyle: (_previous, next) => withOverlay(next, data, overlayState()),
      bounds: data.manifest.bbox,
      fitBoundsOptions: { padding: FIT_PADDING },
      attributionControl: { compact: true, customAttribution: OSM_ATTRIBUTION },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('mousemove', (e) => {
      const id = countyAt(map, e);
      const selected = useHuntStore.getState().selectedCountyId;
      setHovered(selected ? null : id);
      map.getCanvas().style.cursor = !selected && id ? 'pointer' : '';
    });
    map.on('mouseout', () => setHovered(null));
    map.on('click', (e) => {
      const id = countyAt(map, e);
      const selected = useHuntStore.getState().selectedCountyId;
      // With a county isolated, any click outside it goes back to the full view.
      if (selected) {
        if (id !== selected) selectCounty(null);
      } else if (id) {
        selectCounty(id);
      }
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [data]);

  // Basemap or theme (the street basemap has a dark variant).
  const appliedStyle = useRef({ basemap, theme });
  useEffect(() => {
    const map = mapRef.current;
    const applied = appliedStyle.current;
    if (!map || (applied.basemap === basemap && applied.theme === theme)) return;
    appliedStyle.current = { basemap, theme };
    map.setStyle(baseStyle(basemap, theme));
  }, [basemap, theme]);

  // Selection, theme and label size restyle the overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(LAYERS.fill)) {
      applyOverlayState(map, { theme, labelSize, selectedCountyId });
    }
  }, [theme, labelSize, selectedCountyId]);

  // Zoom to the selected county, or back out to all of them.
  const fittedCounty = useRef<CountyId | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedCounty.current === selectedCountyId) return;
    fittedCounty.current = selectedCountyId;
    map.fitBounds(bboxFor(data, selectedCountyId), { padding: FIT_PADDING, duration: 800 });
  }, [data, selectedCountyId]);

  // Hover highlight, whether it came from the map or from the side panel list.
  const hoveredOnMap = useRef<CountyId | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCES.counties)) return;
    const previous = hoveredOnMap.current;
    if (previous) map.setFeatureState({ source: SOURCES.counties, id: previous }, { hover: false });
    if (hoveredCountyId) {
      map.setFeatureState({ source: SOURCES.counties, id: hoveredCountyId }, { hover: true });
    }
    hoveredOnMap.current = hoveredCountyId;
  }, [hoveredCountyId]);

  const selectedName = selectedCountyId ? getCounty(selectedCountyId)?.name : undefined;
  return (
    <div
      ref={containerRef}
      className="map"
      role="region"
      aria-label={selectedName ? `Map of ${selectedName}` : 'Map of the hunt counties'}
    />
  );
}
