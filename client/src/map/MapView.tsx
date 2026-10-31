import 'maplibre-gl/dist/maplibre-gl.css';
import {
  DATA_LAYERS,
  getCounty,
  isCountyId,
  markerFeatureId,
  type BBox,
  type CountyId,
  type DataLayerId,
  type Marker,
  type PlaceFeature,
  type PlaceProperties,
} from '@hunt/shared';
import type { FeatureCollection } from 'geojson';
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoundaryData } from '../data';
import { countyAt as countyContaining } from '../layerData';
import { useHuntStore } from '../state/store';
import { baseStyle } from './basemaps';
import { CLICKABLE_LAYERS, MARKERS_LAYER, MARKERS_SOURCE, dataSourceId } from './dataLayers';
import { FeaturePopup, type PopupTarget } from './FeaturePopup';
import { installIconProvider } from './icons';
import { markersCollection } from './markerSource';
import {
  LAYERS,
  SOURCES,
  applyOverlayState,
  withOverlay,
  type OverlayData,
  type OverlayState,
} from './overlay';

// MapLibre builds its worker URL at runtime, which Vite can't see, so the worker never gets
// served or bundled. The worker parses vector tiles and GeoJSON: without it the street basemap
// and every overlay layer stay blank, while raster basemaps still draw.
setWorkerUrl(maplibreWorkerUrl);

const FIT_PADDING = 32;
/** Clicks within this many pixels of a point or line hit it, which matters on a phone. */
const HIT_RADIUS = 7;
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

function overlayState(): OverlayState {
  const { theme, labelSize, selectedCountyId, layers, streetLabels } = useHuntStore.getState();
  return { theme, labelSize, selectedCountyId, layers, streetLabels };
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

/** The clickable feature nearest the top of our priority list under the pointer. */
function featureAt(map: MapLibreMap, e: MapMouseEvent): MapGeoJSONFeature | undefined {
  const layers = CLICKABLE_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return undefined;
  const { x, y } = e.point;
  const hits = map.queryRenderedFeatures(
    [
      [x - HIT_RADIUS, y - HIT_RADIUS],
      [x + HIT_RADIUS, y + HIT_RADIUS],
    ],
    { layers },
  );
  // Fills only count when the pointer is right on them, not just near.
  const exact = new Set(
    map
      .queryRenderedFeatures(e.point, { layers })
      .map((f) => `${f.layer.id}|${String(f.properties.id)}`),
  );
  const rank = (f: MapGeoJSONFeature) => CLICKABLE_LAYERS.indexOf(f.layer.id);
  return hits
    .filter((f) => f.layer.type !== 'fill' || exact.has(`${f.layer.id}|${String(f.properties.id)}`))
    .sort((a, b) => rank(a) - rank(b))[0];
}

function collections(
  layers: Record<DataLayerId, PlaceFeature[]>,
): Record<DataLayerId, FeatureCollection> {
  return Object.fromEntries(
    DATA_LAYERS.map(({ id }) => [id, { type: 'FeatureCollection', features: layers[id] }]),
  ) as unknown as Record<DataLayerId, FeatureCollection>;
}

/** Sends each layer whose features changed to its source, and records what each source holds. */
function syncSources(
  map: MapLibreMap,
  layers: Record<DataLayerId, PlaceFeature[]>,
  inStyle: Partial<Record<DataLayerId, PlaceFeature[]>>,
): void {
  for (const { id } of DATA_LAYERS) {
    if (inStyle[id] === layers[id]) continue;
    const source = map.getSource<GeoJSONSource>(dataSourceId(id));
    if (!source) continue;
    void source.setData({ type: 'FeatureCollection', features: layers[id] });
    inStyle[id] = layers[id];
  }
}

interface MapViewProps {
  data: BoundaryData;
  layers: Record<DataLayerId, PlaceFeature[]>;
  markers: readonly Marker[];
}

export function MapView({ data, layers, markers }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [popup, setPopup] = useState<{ target: PopupTarget; node: HTMLElement } | null>(null);

  const basemap = useHuntStore((s) => s.basemap);
  const theme = useHuntStore((s) => s.theme);
  const labelSize = useHuntStore((s) => s.labelSize);
  const selectedCountyId = useHuntStore((s) => s.selectedCountyId);
  const hoveredCountyId = useHuntStore((s) => s.hoveredCountyId);
  const visible = useHuntStore((s) => s.layers);
  const streetLabels = useHuntStore((s) => s.streetLabels);
  const focus = useHuntStore((s) => s.focus);
  const placing = useHuntStore((s) => s.markerEditor?.mode === 'placing');

  // What the overlay draws, kept current for transformStyle (re-run on every basemap switch).
  const overlayData = useRef<OverlayData>({
    boundary: data,
    layers: {},
    markers: markersCollection([]),
  });
  const markersRef = useRef(markers);
  const layersRef = useRef(layers);
  useEffect(() => {
    markersRef.current = markers;
    layersRef.current = layers;
  });
  const showPopupRef = useRef<((target: PopupTarget) => void) | null>(null);
  // The features each data source currently holds, so unchanged layers aren't re-sent.
  const inStyle = useRef<Partial<Record<DataLayerId, PlaceFeature[]>>>({});

  // Create the map once per data load. Later changes go through the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { basemap, theme, selectCounty, setHovered, setView } = useHuntStore.getState();
    overlayData.current = { ...overlayData.current, boundary: data };

    const map = new MapLibreMap({
      container,
      style: baseStyle(basemap, theme),
      // Re-applied on every setStyle, so switching basemaps keeps the overlay and its data.
      transformStyle: (_previous, next) => {
        inStyle.current = Object.fromEntries(
          DATA_LAYERS.map(({ id }) => [id, layersRef.current[id]]),
        );
        return withOverlay(next, overlayData.current, overlayState());
      },
      bounds: data.manifest.bbox,
      fitBoundsOptions: { padding: FIT_PADDING },
      attributionControl: { compact: true, customAttribution: OSM_ATTRIBUTION },
    });
    mapRef.current = map;
    installIconProvider(map);

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-left');

    const reportView = () => {
      const b = map.getBounds();
      setView({
        zoom: map.getZoom(),
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      });
    };
    map.on('load', reportView);
    map.on('moveend', reportView);
    // Data that arrived while a new style was loading didn't make it into transformStyle.
    map.on('style.load', () => {
      syncSources(map, layersRef.current, inStyle.current);
      void map
        .getSource<GeoJSONSource>(MARKERS_SOURCE)
        ?.setData(markersCollection(markersRef.current));
    });

    map.on('mousemove', (e) => {
      const state = useHuntStore.getState();
      if (state.markerEditor?.mode === 'placing') {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const onFeature = featureAt(map, e) !== undefined;
      const id = countyAt(map, e);
      const selected = state.selectedCountyId;
      setHovered(selected || onFeature ? null : id);
      map.getCanvas().style.cursor = onFeature || (!selected && id) ? 'pointer' : '';
    });
    map.on('mouseout', () => setHovered(null));

    map.on('click', (e) => {
      const state = useHuntStore.getState();
      // Adding a marker: the click picks its spot.
      if (state.markerEditor?.mode === 'placing') {
        state.setMarkerEditor({
          mode: 'form',
          markerId: null,
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
        });
        return;
      }
      const feature = featureAt(map, e);
      if (feature) {
        openPopupFor(feature, e.lngLat.lng, e.lngLat.lat);
        return;
      }
      const id = countyAt(map, e);
      const selected = state.selectedCountyId;
      // With a county isolated, any click outside it goes back to the full view.
      if (selected) {
        if (id !== selected) selectCounty(null);
      } else if (id) {
        selectCounty(id);
      }
    });

    function openPopupFor(feature: MapGeoJSONFeature, clickLng: number, clickLat: number) {
      if (feature.layer.id === MARKERS_LAYER) {
        const marker = markersRef.current.find((m) => m.id === Number(feature.properties.markerId));
        if (marker)
          showPopup({
            type: 'marker',
            marker,
            county: countyContaining(data, marker.lng, marker.lat),
          });
        return;
      }
      const props = feature.properties as PlaceProperties;
      const [lng, lat] =
        feature.geometry.type === 'Point'
          ? (feature.geometry.coordinates as [number, number])
          : [clickLng, clickLat];
      showPopup({ type: 'place', props, lng, lat });
    }

    function showPopup(target: PopupTarget) {
      popupRef.current?.remove();
      const node = document.createElement('div');
      const at: [number, number] =
        target.type === 'marker'
          ? [target.marker.lng, target.marker.lat]
          : [target.lng, target.lat];
      const p = new Popup({
        maxWidth: '300px',
        focusAfterOpen: false,
        offset: target.type === 'marker' ? 28 : 10,
      })
        .setLngLat(at)
        .setDOMContent(node)
        .addTo(map);
      p.on('close', () => {
        if (popupRef.current === p) {
          popupRef.current = null;
          setPopup(null);
        }
      });
      popupRef.current = p;
      setPopup({ target, node });
    }
    showPopupRef.current = showPopup;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      showPopupRef.current = null;
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

  // Selection, theme, label size and layer toggles restyle the overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(LAYERS.fill)) {
      applyOverlayState(map, { theme, labelSize, selectedCountyId, layers: visible, streetLabels });
    }
  }, [theme, labelSize, selectedCountyId, visible, streetLabels]);

  // Layer data: push each layer's features into its source when they change.
  useEffect(() => {
    overlayData.current = { ...overlayData.current, layers: collections(layers) };
    const map = mapRef.current;
    if (map) syncSources(map, layers, inStyle.current);
  }, [layers]);

  useEffect(() => {
    const collection = markersCollection(markers);
    overlayData.current = { ...overlayData.current, markers: collection };
    void mapRef.current?.getSource<GeoJSONSource>(MARKERS_SOURCE)?.setData(collection);
    // Keep an open marker popup current after an edit, and close it after a delete.
    setPopup((p) => {
      if (p?.target.type !== 'marker') return p;
      const id = p.target.marker.id;
      const updated = markers.find((m) => m.id === id);
      if (!updated) {
        popupRef.current?.remove();
        return null;
      }
      popupRef.current?.setLngLat([updated.lng, updated.lat]);
      return { ...p, target: { ...p.target, marker: updated } };
    });
  }, [markers]);

  // Zoom to the selected county, or back out to all of them.
  const fittedCounty = useRef<CountyId | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedCounty.current === selectedCountyId) return;
    fittedCounty.current = selectedCountyId;
    popupRef.current?.remove();
    map.fitBounds(bboxFor(data, selectedCountyId), { padding: FIT_PADDING, duration: 800 });
  }, [data, selectedCountyId]);

  // Fly to a feature picked in the side panel (or a marker just saved) and open its popup.
  // The popup waits until the feature is loaded: a layer just switched on, or a new marker
  // that the marker list hasn't caught up with yet.
  const flownTo = useRef(0);
  const openedFor = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (flownTo.current !== focus.nonce) {
      flownTo.current = focus.nonce;
      const b = focus.bbox;
      if (b && (b[2] - b[0] > 0.002 || b[3] - b[1] > 0.002)) {
        map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 900 });
      } else {
        map.flyTo({
          center: [focus.lng, focus.lat],
          zoom: Math.max(map.getZoom(), 14),
          duration: 900,
        });
      }
    }
    if (openedFor.current === focus.nonce) return;
    if (focus.id.startsWith('marker:')) {
      const marker = markers.find((m) => markerFeatureId(m.id) === focus.id);
      if (!marker) return;
      openedFor.current = focus.nonce;
      showPopupRef.current?.({
        type: 'marker',
        marker,
        county: countyContaining(data, marker.lng, marker.lat),
      });
      return;
    }
    const layer = DATA_LAYERS.find((l) => l.id === focus.layer)?.id;
    const feature = layer && layers[layer].find((f) => f.properties.id === focus.id);
    if (!feature) return;
    openedFor.current = focus.nonce;
    showPopupRef.current?.({
      type: 'place',
      props: feature.properties,
      lng: focus.lng,
      lat: focus.lat,
    });
  }, [data, focus, markers, layers]);

  // Esc closes an open popup before it does anything else (App's handler backs out of the county).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !popupRef.current) return;
      popupRef.current.remove();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = placing ? 'crosshair' : '';
  }, [placing]);

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
    <>
      <div
        ref={containerRef}
        className="map"
        role="region"
        aria-label={selectedName ? `Map of ${selectedName}` : 'Map of the hunt counties'}
      />
      {popup &&
        createPortal(<FeaturePopup target={popup.target} manifest={data.manifest} />, popup.node)}
    </>
  );
}
