/**
 * The hunt counties. This is the only place the county list lives: adding or
 * removing a county here and re-running `npm run data:build` is all it takes.
 * Order here is the order of the side panel list and of ‹ › stepping.
 */
export interface CountyConfig {
  /** URL-safe slug, also the folder name under client/public/data/. */
  id: string;
  name: string;
  /** 5-digit state + county FIPS code, used to pick the county out of Census files. */
  fips: string;
  seat: string;
}

export const STATE_FIPS = '32'; // Nevada

export const COUNTIES = [
  { id: 'carson-city', name: 'Carson City', fips: '32510', seat: 'Carson City' },
  { id: 'churchill', name: 'Churchill', fips: '32001', seat: 'Fallon' },
  { id: 'douglas', name: 'Douglas', fips: '32005', seat: 'Minden' },
  { id: 'lyon', name: 'Lyon', fips: '32019', seat: 'Yerington' },
  { id: 'mineral', name: 'Mineral', fips: '32021', seat: 'Hawthorne' },
  { id: 'pershing', name: 'Pershing', fips: '32027', seat: 'Lovelock' },
  { id: 'storey', name: 'Storey', fips: '32029', seat: 'Virginia City' },
  { id: 'washoe', name: 'Washoe', fips: '32031', seat: 'Reno' },
] as const satisfies readonly CountyConfig[];

export type HuntCounty = (typeof COUNTIES)[number];
export type CountyId = HuntCounty['id'];

export function getCounty(id: string): HuntCounty | undefined {
  return COUNTIES.find((c) => c.id === id);
}

export function isCountyId(id: string): id is CountyId {
  return COUNTIES.some((c) => c.id === id);
}

/** Carson City is a consolidated city-county; every other county gets the "County" suffix. */
export function countyDisplayName(county: Pick<CountyConfig, 'name'>): string {
  return county.name === 'Carson City' ? 'Carson City' : `${county.name} County`;
}
