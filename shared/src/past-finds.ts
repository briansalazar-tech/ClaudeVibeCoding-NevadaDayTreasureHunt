import type { CountyId } from './counties.js';

/** Known medallion find locations, entered by hand. Add each year's find here. */
export interface PastFind {
  year: number;
  name: string;
  county: CountyId;
  lat: number;
  lng: number;
  note?: string;
}

export const PAST_FINDS: readonly PastFind[] = [
  {
    year: 2026,
    name: 'Virginia City Highlands Park',
    county: 'storey',
    lat: 39.38095,
    lng: -119.64143,
    note: 'On a 7.03-acre parcel owned by Storey County (APN 307204). Not in OpenStreetMap.',
  },
];
