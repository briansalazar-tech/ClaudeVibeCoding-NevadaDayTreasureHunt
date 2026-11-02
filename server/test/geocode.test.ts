import type { CountyCollection, GeocodeResponse } from '@hunt/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/client.js';
import { Geocoder, countyAreas } from '../src/geocoder.js';

/** Lyon as a box around Fernley, for the in-area check. */
const counties: CountyCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'lyon',
        name: 'Lyon',
        fips: '32019',
        seat: 'Yerington',
        landArea: 0,
        waterArea: 0,
        bbox: [-119.4, 39.5, -119.1, 39.7],
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-119.4, 39.5],
            [-119.1, 39.5],
            [-119.1, 39.7],
            [-119.4, 39.7],
            [-119.4, 39.5],
          ],
        ],
      },
    },
  ],
};

const fernleyHall = {
  display_name: '595, Silver Lace Boulevard, Fernley, Lyon County, Nevada, 89408, United States',
  lat: '39.6066',
  lon: '-119.2234',
};
const lasVegas = {
  display_name: 'Silver Lace Boulevard, Las Vegas, Nevada, United States',
  lat: '36.1',
  lon: '-115.1',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let close: () => void;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const opened = openDatabase(':memory:');
  close = opened.close;
  fetchMock = vi.fn<typeof fetch>();
  const geocoder = new Geocoder({
    areas: countyAreas(counties),
    userAgent: 'HuntMapTest/1.0',
    nominatimUrl: 'https://nominatim.test/search',
    censusUrl: 'https://census.test/geocoder',
    minIntervalMs: 0,
    fetch: fetchMock,
  });
  app = createApp(opened.db, { geocoder });
});
afterEach(() => close());

const url = (call: number) => new URL(fetchMock.mock.calls[call]![0]);

describe('/api/geocode', () => {
  it('asks Nominatim within the hunt area and drops matches outside the counties', async () => {
    fetchMock.mockResolvedValueOnce(json([fernleyHall, lasVegas]));
    const res = await request(app)
      .get('/api/geocode')
      .query({ q: '595 Silver Lace Blvd' })
      .expect(200);
    const body = res.body as GeocodeResponse;
    expect(body).toMatchObject({ source: 'nominatim', outside: 1, cached: false });
    expect(body.results).toEqual([
      {
        label: '595, Silver Lace Boulevard, Fernley, Lyon County, Nevada, 89408',
        lat: 39.6066,
        lng: -119.2234,
        county: 'lyon',
      },
    ]);
    const asked = url(0);
    expect(asked.host).toBe('nominatim.test');
    expect(asked.searchParams.get('bounded')).toBe('1');
    expect(asked.searchParams.get('viewbox')).toBe('-119.4,39.7,-119.1,39.5');
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('HuntMapTest/1.0');
  });

  it('answers a repeated search from the cache', async () => {
    fetchMock.mockResolvedValueOnce(json([fernleyHall]));
    await request(app).get('/api/geocode').query({ q: '595 Silver Lace Blvd' }).expect(200);
    const again = await request(app)
      .get('/api/geocode')
      .query({ q: '  595 silver lace  BLVD ' })
      .expect(200);
    expect(again.body).toMatchObject({ cached: true, source: 'nominatim' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Census geocoder, adding the state', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    fetchMock.mockResolvedValueOnce(
      json({
        result: {
          addressMatches: [
            {
              matchedAddress: '595 SILVER LACE BLVD, FERNLEY, NV, 89408',
              coordinates: { x: -119.2234, y: 39.6066 },
            },
          ],
        },
      }),
    );
    const res = await request(app)
      .get('/api/geocode')
      .query({ q: '595 Silver Lace Blvd, Fernley' })
      .expect(200);
    expect(res.body).toMatchObject({ source: 'census', results: [{ county: 'lyon' }] });
    expect(url(1).searchParams.get('address')).toBe('595 Silver Lace Blvd, Fernley, NV');
  });

  it('reports a failure when both services are down, and does not cache it', async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    const res = await request(app).get('/api/geocode').query({ q: 'Main Street' }).expect(502);
    expect((res.body as { error: string }).error).toMatch(/unavailable/);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json([fernleyHall]));
    await request(app).get('/api/geocode').query({ q: 'Main Street' }).expect(200);
  });

  it('rejects a query that is too short', async () => {
    await request(app).get('/api/geocode').query({ q: 'ab' }).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Geocoder rate limit', () => {
  it('spaces requests at least the interval apart', async () => {
    const times: number[] = [];
    const fetchFn = vi.fn<typeof fetch>(() => {
      times.push(Date.now());
      return Promise.resolve(json([fernleyHall]));
    });
    const geocoder = new Geocoder({
      areas: countyAreas(counties),
      userAgent: 'x',
      nominatimUrl: 'https://nominatim.test/search',
      censusUrl: 'https://census.test/geocoder',
      minIntervalMs: 150,
      fetch: fetchFn,
    });
    await Promise.all([geocoder.search('a st'), geocoder.search('b st'), geocoder.search('c st')]);
    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(140);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(140);
  });
});
