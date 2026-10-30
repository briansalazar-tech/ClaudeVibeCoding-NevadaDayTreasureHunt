import { COUNTIES, type CountyCollection, type Manifest } from '@hunt/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHuntStore } from '../state/store';
import { SidePanel } from './SidePanel';

const counties: CountyCollection = {
  type: 'FeatureCollection',
  features: COUNTIES.map((c) => ({
    type: 'Feature',
    properties: { ...c, landArea: 2_589_988.11 * 100, waterArea: 0, bbox: [0, 0, 1, 1] },
    geometry: { type: 'Polygon', coordinates: [] },
  })),
};

const manifest: Manifest = {
  buildDate: '2026-10-29T00:00:00Z',
  bbox: [0, 0, 1, 1],
  sources: {},
  counties: Object.fromEntries(COUNTIES.map((c) => [c.id, { layers: {} }])),
};

function renderPanel() {
  render(<SidePanel data={{ counties, manifest }} />);
  return userEvent.setup();
}

describe('SidePanel', () => {
  beforeEach(() => {
    useHuntStore.setState({ selectedCountyId: null, hoveredCountyId: null, sheetOpen: true });
  });

  it('lists all eight counties in the full view', () => {
    renderPanel();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All counties');
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(8);
    expect(within(list).getByRole('button', { name: /Storey.*Virginia City/ })).toBeVisible();
  });

  it('selects a county from the list and returns to all counties', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: /^Lyon/ }));
    expect(useHuntStore.getState().selectedCountyId).toBe('lyon');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lyon County');
    expect(screen.getByText('Yerington')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '← All counties' }));
    expect(useHuntStore.getState().selectedCountyId).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All counties');
  });

  it('steps through counties with ‹ ›', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Next county' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carson City');
    await user.click(screen.getByRole('button', { name: 'Next county' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Churchill County');
    await user.click(screen.getByRole('button', { name: 'Previous county' }));
    await user.click(screen.getByRole('button', { name: 'Previous county' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Washoe County');
  });

  it('highlights a county on the map while its list entry is hovered', async () => {
    const user = renderPanel();
    await user.hover(screen.getByRole('button', { name: /^Douglas/ }));
    expect(useHuntStore.getState().hoveredCountyId).toBe('douglas');
    await user.unhover(screen.getByRole('button', { name: /^Douglas/ }));
    expect(useHuntStore.getState().hoveredCountyId).toBeNull();
  });

  it('changes display settings', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('radio', { name: 'XL' }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(useHuntStore.getState()).toMatchObject({ labelSize: 'XL', theme: 'dark' });
  });
});
