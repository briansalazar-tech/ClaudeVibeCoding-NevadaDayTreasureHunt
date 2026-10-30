import { COUNTIES, type CountyId } from '@hunt/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BasemapId } from '../map/basemaps';

export type Theme = 'light' | 'dark';
export type LabelSize = 'S' | 'M' | 'L' | 'XL';

export interface Settings {
  basemap: BasemapId;
  theme: Theme;
  labelSize: LabelSize;
}

export interface HuntState extends Settings {
  selectedCountyId: CountyId | null;
  hoveredCountyId: CountyId | null;
  /** Phone layout only: whether the bottom sheet is expanded. */
  sheetOpen: boolean;
  selectCounty: (id: CountyId | null) => void;
  /** ‹ › buttons. From the all-counties view, › goes to the first county and ‹ to the last. */
  stepCounty: (direction: 1 | -1) => void;
  setHovered: (id: CountyId | null) => void;
  setSheetOpen: (open: boolean) => void;
  setBasemap: (basemap: BasemapId) => void;
  setTheme: (theme: Theme) => void;
  setLabelSize: (size: LabelSize) => void;
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const useHuntStore = create<HuntState>()(
  persist(
    (set, get) => ({
      selectedCountyId: null,
      hoveredCountyId: null,
      sheetOpen: false,
      basemap: 'streets',
      theme: systemTheme(),
      labelSize: 'M',
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
      setBasemap: (basemap) => set({ basemap }),
      setTheme: (theme) => set({ theme }),
      setLabelSize: (labelSize) => set({ labelSize }),
    }),
    {
      name: 'hunt-map-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ basemap, theme, labelSize }): Settings => ({ basemap, theme, labelSize }),
    },
  ),
);
