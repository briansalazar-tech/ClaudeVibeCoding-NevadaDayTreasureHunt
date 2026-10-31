/**
 * Land ownership categories. `kind` in the land layer is one of these ids:
 * a BLM Surface Management Agency code, or a public-owner parcel type.
 */
export const LAND_KINDS = {
  // BLM Surface Management Agency (SMA) codes
  BLM: 'Bureau of Land Management',
  FS: 'US Forest Service',
  NVST: 'State of Nevada',
  BR: 'Bureau of Reclamation',
  FWS: 'US Fish & Wildlife Service',
  NPS: 'National Park Service',
  BIA: 'Tribal land (Bureau of Indian Affairs)',
  DOD: 'Military (Department of Defense)',
  DOE: 'Department of Energy',
  WTR: 'Water',
  PVT: 'Private',
  // Public-owner parcels, overlaid on the SMA because the SMA marks county and city land as private
  'parcel-county': 'County land',
  'parcel-city': 'City or town land',
  'parcel-gid': 'General improvement district land',
  'parcel-state': 'State land (parcel)',
  'parcel-school': 'School district land',
  'parcel-hoa': 'HOA common land',
  'parcel-federal': 'Federal land (parcel)',
  'parcel-tribal': 'Tribal land (parcel)',
  'parcel-utility': 'Public utility or district land',
} as const;

export type LandKind = keyof typeof LAND_KINDS;

export function landKindName(kind: string): string {
  return (LAND_KINDS as Record<string, string>)[kind] ?? kind;
}
