import { describe, expect, it } from 'vitest';
import { formatDms, parseCoordinates } from './coordinates.js';

const find = { lat: 39.38095, lng: -119.64143 };

function near(text: string) {
  const p = parseCoordinates(text);
  expect(p, text).not.toBeNull();
  expect(p!.lat).toBeCloseTo(find.lat, 4);
  expect(p!.lng).toBeCloseTo(find.lng, 4);
  return p!;
}

describe('parseCoordinates', () => {
  it('reads decimal degrees with a comma or a space', () => {
    expect(near('39.38095, -119.64143')).toMatchObject({ format: 'decimal', swapped: false });
    near('39.38095 -119.64143');
    near('  39.38095,-119.64143 ');
  });

  it('reads degrees-minutes-seconds in common forms', () => {
    expect(near(`39°22'51.4"N 119°38'29.1"W`).format).toBe('dms');
    near('39° 22′ 51.4″ N, 119° 38′ 29.1″ W');
    near('N39 22 51.4 W119 38 29.1');
    near('39 22 51.4 -119 38 29.1');
    near('39d22m51.4s N 119d38m29.1s W');
  });

  it('reads degrees and decimal minutes', () => {
    expect(near('39 22.857, -119 38.486').format).toBe('dm');
    near(`N39° 22.857' W119° 38.486'`);
  });

  it('swaps a pair given longitude first, and assumes west for a bare longitude', () => {
    expect(near('-119.64143, 39.38095').swapped).toBe(true);
    expect(near('119.64143, 39.38095')).toMatchObject({ swapped: true, assumedWest: true });
    expect(near('39.38095, 119.64143')).toMatchObject({ swapped: false, assumedWest: true });
    expect(near(`119°38'29.1"W 39°22'51.4"N`).swapped).toBe(true);
  });

  it('rejects text that is not a coordinate pair', () => {
    for (const text of [
      'SR 341',
      '595 Silver Lace Blvd',
      'I-80',
      '39.38095',
      'Fort Churchill',
      '1 2 3',
      '39 75.1, -119 38.4',
    ]) {
      expect(parseCoordinates(text), text).toBeNull();
    }
  });
});

describe('formatDms', () => {
  it('writes degrees, minutes and seconds with the hemisphere', () => {
    expect(formatDms(find.lat, 'lat')).toBe('39°22′51.4″N');
    expect(formatDms(find.lng, 'lng')).toBe('119°38′29.1″W');
  });
});
