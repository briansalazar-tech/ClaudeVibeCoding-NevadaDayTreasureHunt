import { COUNTIES, LAYERS, type CountyId, type LayerId } from '@hunt/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BasemapId } from '../map/basemaps';

export type Theme = 'light' | 'dark';
export type LabelSize = 'S' | 'M' | 'L' | 'XL';
export type PanelTab = 'county' | 'layers' | 'display';

export interface Settings {
  basemap: BasemapId;
  theme: Theme;
  labelSize: LabelSize;
  /** Which layers are switched on. */
  layers: Record<LayerId, boolean>;
  /** Street name labels, toggled separately from the streets themselves. */
  streetLabels: boolean;
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
  /** Changes on every request, so asking for the same feature twice still flies there. */
  nonce: number;
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
    }),
    {
      name: 'hunt-map-settings',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ basemap, theme, labelSize, layers, streetLabels }): Settings => ({
        basemap,
        theme,
        labelSize,
        layers,
        streetLabels,
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
