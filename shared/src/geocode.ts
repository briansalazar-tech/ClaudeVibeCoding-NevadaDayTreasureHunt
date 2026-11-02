import { z } from 'zod';
import type { CountyId } from './counties.js';

/** GET /api/geocode?q=: an address lookup, run only when the user asks (never as they type). */
export const geocodeQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3, 'Enter at least 3 characters of an address')
    .max(200, 'That address is too long'),
});

export type GeocodeSource = 'nominatim' | 'census';

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  county: CountyId;
}

export interface GeocodeResponse {
  /** Matches inside the hunt counties. */
  results: GeocodeResult[];
  /** The service that answered, or null when neither found anything. */
  source: GeocodeSource | null;
  /** Matches dropped because they fall outside the hunt counties. */
  outside: number;
  cached: boolean;
}
