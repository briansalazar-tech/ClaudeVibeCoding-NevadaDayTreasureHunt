import { COUNTIES } from '@hunt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHuntStore } from './store';

const first = COUNTIES[0].id;
const last = COUNTIES[COUNTIES.length - 1]!.id;

describe('hunt store', () => {
  beforeEach(() => {
    useHuntStore.setState({ selectedCountyId: null, hoveredCountyId: null });
  });

  it('steps forward from the all-counties view to the first county, and wraps', () => {
    const { stepCounty } = useHuntStore.getState();
    stepCounty(1);
    expect(useHuntStore.getState().selectedCountyId).toBe(first);
    useHuntStore.setState({ selectedCountyId: last });
    stepCounty(1);
    expect(useHuntStore.getState().selectedCountyId).toBe(first);
  });

  it('steps backward from the all-counties view to the last county, and wraps', () => {
    const { stepCounty } = useHuntStore.getState();
    stepCounty(-1);
    expect(useHuntStore.getState().selectedCountyId).toBe(last);
    useHuntStore.setState({ selectedCountyId: first });
    stepCounty(-1);
    expect(useHuntStore.getState().selectedCountyId).toBe(last);
  });

  it('clears the hover highlight when the selection changes', () => {
    useHuntStore.setState({ hoveredCountyId: 'lyon' });
    useHuntStore.getState().selectCounty('lyon');
    expect(useHuntStore.getState()).toMatchObject({
      selectedCountyId: 'lyon',
      hoveredCountyId: null,
    });
  });

  it('persists only display settings', () => {
    useHuntStore.getState().setBasemap('imagery');
    useHuntStore.getState().selectCounty('storey');
    const saved = JSON.parse(localStorage.getItem('hunt-map-settings') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(Object.keys(saved.state).sort()).toEqual(['basemap', 'labelSize', 'theme']);
    expect(saved.state.basemap).toBe('imagery');
  });
});
