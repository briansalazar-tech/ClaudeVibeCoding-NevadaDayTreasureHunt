import { COUNTIES, LAYERS, type BBox, type CountyId, type LayerId } from '@hunt/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BasemapId } from '../map/basemaps';

export type Theme = 'light' | 'dark';
export type LabelSize = 'S' | 'M' | 'L' | 'XL';
export type PanelTab = 'county' | 'layers' | 'notebook' | 'display' | 'account';

export interface Settings {
  basemap: BasemapId;
  theme: Theme;
  labelSize: LabelSize;
  /** Which layers are switched on. */
  layers: Record<LayerId, boolean>;
  /** Street name labels, toggled separately from the streets themselves. */
  streetLabels: boolean;
  /** Pages about map places are outlined on the map (a toggle on the notebook home). */
  notebookOutlines: boolean;
}

/** A request (from the place list, say) to fly to a feature and open its popup. */
export interface FocusRequest {
  /** Feature id, e.g. `osm:way/123` or `marker:4`. */
  id: string;
  layer: LayerId;
  lng: number;
  lat: number;
  /** Fly to these bounds instead of the point (lines and polygons). */
  bbox?: [number, number, number, number];
  /** False to only fly there (a route spanning several counties has no single popup). */
  popup?: boolean;
  /** Changes on every request, so asking for the same feature twice still flies there. */
  nonce: number;
}

/** A named place at or near a pinned point, from the search index. */
export interface NearbyItem {
  id: string;
  name: string;
  layer: LayerId;
  kind: string;
  lng: number;
  lat: number;
  bbox?: BBox;
  /** Meters away; 0 when the point is inside it. */
  meters: number;
}

/** A searched coordinate or address: a pin on the map with its own popup. */
export interface PointPin {
  lng: number;
  lat: number;
  title: string;
  subtitle: string;
  /** Shown in the popup, e.g. for a point outside the hunt counties. */
  warning?: string;
  nearby: NearbyItem[];
  nonce: number;
}

/** Roads picked in search, drawn highlighted: a route number, or a street by name. */
export interface RoadHighlight {
  counties: CountyId[];
  routes?: string[];
  name?: string;
  kind?: string;
}

/** The map view, kept in the store so the data loader knows which heavy files are needed. */
export interface MapView {
  zoom: number;
  bounds: [number, number, number, number];
}

/** Custom marker placement: picking a spot on the map, or the form open for a new or existing marker. */
export type MarkerEditor =
  | { mode: 'placing' }
  | { mode: 'form'; markerId: number | null; lat?: number; lng?: number }
  | null;

export interface HuntState extends Settings {
  selectedCountyId: CountyId | null;
  hoveredCountyId: CountyId | null;
  /** Phone layout only: whether the bottom sheet is expanded. */
  sheetOpen: boolean;
  panelTab: PanelTab;
  focus: FocusRequest | null;
  view: MapView | null;
  markerEditor: MarkerEditor;
  pin: PointPin | null;
  highlight: RoadHighlight | null;
  /** The notebook page open in the Notebook tab, or null for the notebook home. */
  notebookPage: number | null;
  /** Pages opened before this one, for Back. */
  notebookHistory: number[];
  /** The notebook fills the window (the separate Notebook view); otherwise it's beside the map. */
  notebookFull: boolean;
  /** "Put on map": the page waiting for a click on the map. */
  placingPage: number | null;
  selectCounty: (id: CountyId | null) => void;
  /** ‹ › buttons. From the all-counties view, › goes to the first county and ‹ to the last. */
  stepCounty: (direction: 1 | -1) => void;
  setHovered: (id: CountyId | null) => void;
  setSheetOpen: (open: boolean) => void;
  setPanelTab: (tab: PanelTab) => void;
  setBasemap: (basemap: BasemapId) => void;
  setTheme: (theme: Theme) => void;
  setLabelSize: (size: LabelSize) => void;
  setLayerVisible: (id: LayerId, visible: boolean) => void;
  setAllLayers: (visible: boolean) => void;
  setStreetLabels: (on: boolean) => void;
  focusFeature: (request: Omit<FocusRequest, 'nonce'>) => void;
  setView: (view: MapView) => void;
  setMarkerEditor: (editor: MarkerEditor) => void;
  showPoint: (pin: Omit<PointPin, 'nonce'>) => void;
  setHighlight: (highlight: RoadHighlight | null) => void;
  /** Clears the search pin and road highlight. */
  clearSearch: () => void;
  /** Opens a notebook page (or the notebook home, for null) in the Notebook tab. */
  openPage: (id: number | null) => void;
  /** Back to the page before, or the notebook home. */
  pageBack: () => void;
  setNotebookFull: (full: boolean) => void;
  setPlacingPage: (id: number | null) => void;
  setNotebookOutlines: (on: boolean) => void;
  /** Shows the map (leaving the full notebook view, closing the phone sheet) to fly somewhere. */
  showMap: () => void;
}

/** The phone layout: the panel is a bottom sheet over the map. */
export function isPhone(): boolean {
  try {
    return window.matchMedia('(max-width: 720px)').matches;
  } catch {
    return false;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Land ownership shading covers the whole map, so it starts off; everything else starts on. */
export function defaultLayers(): Record<LayerId, boolean> {
  return Object.fromEntries(LAYERS.map((l) => [l.id, l.id !== 'land'])) as Record<LayerId, boolean>;
}

let nonce = 0;

export const useHuntStore = create<HuntState>()(
  persist(
    (set, get) => ({
      selectedCountyId: null,
      hoveredCountyId: null,
      sheetOpen: false,
      panelTab: 'county',
      focus: null,
      view: null,
      markerEditor: null,
      pin: null,
      highlight: null,
      notebookPage: null,
      notebookHistory: [],
      notebookFull: false,
      placingPage: null,
      notebookOutlines: true,
      basemap: 'streets',
      theme: systemTheme(),
      labelSize: 'M',
      layers: defaultLayers(),
      streetLabels: true,
      selectCounty: (id) => set({ selectedCountyId: id, hoveredCountyId: null }),
      stepCounty: (direction) => {
        const ids = COUNTIES.map((c) => c.id);
        const current = get().selectedCountyId;
        const index = current === null ? (direction === 1 ? -1 : 0) : ids.indexOf(current);
        const next = ids[(index + direction + ids.length) % ids.length] ?? null;
        set({ selectedCountyId: next, hoveredCountyId: null });
      },
      setHovered: (id) => {
        if (get().hoveredCountyId !== id) set({ hoveredCountyId: id });
      },
      setSheetOpen: (sheetOpen) => set({ sheetOpen }),
      setPanelTab: (panelTab) => set({ panelTab }),
      setBasemap: (basemap) => set({ basemap }),
      setTheme: (theme) => set({ theme }),
      setLabelSize: (labelSize) => set({ labelSize }),
      setLayerVisible: (id, visible) => set({ layers: { ...get().layers, [id]: visible } }),
      setAllLayers: (visible) =>
        set({
          layers: Object.fromEntries(LAYERS.map((l) => [l.id, visible])) as Record<
            LayerId,
            boolean
          >,
        }),
      setStreetLabels: (streetLabels) => set({ streetLabels }),
      focusFeature: (request) => {
        // Make sure the feature's layer is on, or the popup would point at nothing.
        const layers = get().layers[request.layer]
          ? get().layers
          : { ...get().layers, [request.layer]: true };
        set({ focus: { ...request, nonce: ++nonce }, layers });
      },
      setView: (view) => set({ view }),
      setMarkerEditor: (markerEditor) => set({ markerEditor }),
      showPoint: (pin) => set({ pin: { ...pin, nonce: ++nonce } }),
      setHighlight: (highlight) => set({ highlight }),
      clearSearch: () => set({ pin: null, highlight: null }),
      openPage: (id) => {
        const { notebookPage, notebookHistory } = get();
        const history =
          id === null
            ? []
            : notebookPage !== null && notebookPage !== id
              ? [...notebookHistory, notebookPage].slice(-30)
              : notebookHistory;
        set({ notebookPage: id, notebookHistory: history, panelTab: 'notebook', sheetOpen: true });
      },
      pageBack: () => {
        const history = [...get().notebookHistory];
        set({ notebookPage: history.pop() ?? null, notebookHistory: history });
      },
      setNotebookFull: (notebookFull) => set({ notebookFull }),
      setPlacingPage: (placingPage) =>
        set(placingPage === null ? { placingPage } : { placingPage, notebookFull: false }),
      setNotebookOutlines: (notebookOutlines) => set({ notebookOutlines }),
      showMap: () => {
        set({ notebookFull: false });
        if (isPhone()) set({ sheetOpen: false });
      },
    }),
    {
      name: 'hunt-map-settings',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        basemap,
        theme,
        labelSize,
        layers,
        streetLabels,
        notebookOutlines,
      }): Settings => ({
        basemap,
        theme,
        labelSize,
        layers,
        streetLabels,
        notebookOutlines,
      }),
      // Version 1 saved only the display settings; layers added later default to on.
      migrate: (saved) => saved as Settings,
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<Settings>;
        return { ...current, ...s, layers: { ...defaultLayers(), ...s.layers } };
      },
    },
  ),
);
