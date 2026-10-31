/** Where each dataset comes from. See Reference-MD-Files/hunt-map-data-sources.MD. */
import type { CountyId } from '@hunt/shared';

const CENSUS_CB_VINTAGE = '2025';

export interface Source {
  name: string;
  url: string;
  vintage?: string;
}

export const SOURCES = {
  censusCounties: {
    name: 'US Census Bureau Cartographic Boundary Files, counties (1:500,000)',
    vintage: CENSUS_CB_VINTAGE,
    url: `https://www2.census.gov/geo/tiger/GENZ${CENSUS_CB_VINTAGE}/shp/cb_${CENSUS_CB_VINTAGE}_us_county_500k.zip`,
    rawFile: `cb_${CENSUS_CB_VINTAGE}_us_county_500k.zip`,
  },
  osm: {
    name: 'OpenStreetMap contributors (ODbL), via the Overpass API',
    url: 'https://overpass-api.de/api/interpreter',
  },
  gnis: {
    name: 'USGS GNIS Domestic Names, Nevada',
    url: 'https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_NV_Text.zip',
    rawFile: 'gnis/DomesticNames_NV_Text.zip',
  },
  californiaTrail: {
    name: 'NPS California National Historic Trail (CALI_NHT)',
    url: 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/CALI_NHT/FeatureServer/0',
    rawFile: 'nps/cali_nht.json',
  },
  ponyExpress: {
    name: 'NPS Pony Express National Historic Trail (POEX_NHT)',
    url: 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/POEX_NHT/FeatureServer/0',
    rawFile: 'nps/poex_nht.json',
  },
  blmSma: {
    name: 'BLM Nevada Surface Management Agency (SMA)',
    url: 'https://gis.blm.gov/nvarcgis/rest/services/BLM_Nevada_Surface_Management_Agency/BLM_Nevada_Surface_Management_Agency/FeatureServer/0',
    rawDir: 'blm-sma',
  },
  shpoMarkers: {
    name: 'Nevada SHPO State Historical Markers',
    url: 'https://shpo.nv.gov/historical-markers-json?keywords=&city=&county=',
    pageUrl: 'https://shpo.nv.gov/nevadas-historical-markers/historical-markers/',
    rawFile: 'shpo/historical-markers.json',
  },
  shpoStateRegister: {
    name: 'Nevada SHPO State Register of Historic Places, listed properties',
    url: 'https://shpo.nv.gov/uploads/documents/Nevada_State_Register_of_Historic_Places_-_Listed_Properties_Current.pdf',
    rawFile: 'shpo/state-register.pdf',
  },
  hmdb: {
    name: 'Historical Marker Database (HMdb.org), county CSV downloads',
    url: 'https://www.hmdb.org/',
  },
  wikipediaNrhp: {
    name: 'Wikipedia, National Register of Historic Places county lists (coordinates)',
    url: 'https://en.wikipedia.org/w/api.php',
  },
  wikipediaGhostTowns: {
    name: 'Wikipedia, List of ghost towns in Nevada, and the town articles (coordinates)',
    url: 'https://en.wikipedia.org/wiki/List_of_ghost_towns_in_Nevada',
    page: 'List_of_ghost_towns_in_Nevada',
    rawFile: 'wikipedia/ghost-towns-list.json',
  },
  ndotParcels: {
    name: 'Nevada statewide parcels, 2018-12-31 (NDOT / Nevada Division of State Lands)',
    url: 'https://gis.dot.nv.gov/agsphs/rest/services/Reference/Statewide_Parcels/MapServer/0',
  },
  pastFinds: {
    name: 'Past medallion finds, entered by hand',
    url: 'shared/src/past-finds.ts',
  },
} as const;

/** The HMdb results page for a county, where "Download" saves the county's markers as CSV. */
export function hmdbCountyPage(countyName: string): string {
  const county = countyName === 'Carson City' ? 'Carson City' : `${countyName} County`;
  return `https://www.hmdb.org/results.asp?Search=County&State=Nevada&County=${encodeURIComponent(county)}`;
}

export function hmdbRawFile(county: CountyId): string {
  return `hmdb/${county}.csv`;
}

/** The Wikipedia NRHP list page title for a county. */
export function nrhpListPage(countyName: string): string {
  const place = countyName === 'Carson City' ? 'Carson City' : `${countyName} County`;
  return `National_Register_of_Historic_Places_listings_in_${place.replace(/ /g, '_')},_Nevada`;
}

/**
 * Parcel sources, for the public-owner parcel overlay on the land layer. Counties with
 * a current parcel service use it; the rest fall back to the 2018 statewide file.
 */
export interface ParcelSource {
  name: string;
  url: string;
  ownerField: string;
  apnField: string;
  acresField?: string;
  /** Extra filter, e.g. the county in a statewide layer. */
  where?: string;
  vintage: string;
}

export const PARCEL_SOURCES: Partial<Record<CountyId, ParcelSource>> = {
  lyon: {
    name: 'Lyon County Assessor parcels (current)',
    url: 'https://gis.lyon-county.org/server/rest/services/Landbase/Parcels/MapServer/1',
    ownerField: 'PANAME',
    apnField: 'APN',
    acresField: 'PACRES',
    vintage: 'current',
  },
  // Washoe has a current parcel service with owners too; add it here in Phase 3.
};

/** The 2018 statewide parcels, filtered to one county. Field names follow the NDSL copy of this file. */
export function statewideParcelSource(countyName: string): ParcelSource {
  return {
    name: SOURCES.ndotParcels.name,
    url: SOURCES.ndotParcels.url,
    ownerField: 'OwnerName',
    apnField: 'APN',
    acresField: 'Acres',
    where: `County = '${countyName.toUpperCase()}'`,
    vintage: '2018',
  };
}

/** Official county park lists, added to the Parks layer alongside OSM. */
export interface CountyParkSource {
  name: string;
  url: string;
  nameField: string;
  /** Fields that hold an owner or park type, shown in the popup. */
  detailFields: string[];
  where?: string;
}

export const COUNTY_PARK_SOURCES: Partial<Record<CountyId, CountyParkSource>> = {
  lyon: {
    name: 'Lyon County Assessor park parcels (land use 900)',
    url: 'https://gis.lyon-county.org/server/rest/services/Landbase/Parks/MapServer/8',
    nameField: 'PPNAME',
    detailFields: ['PANAME'],
  },
  washoe: {
    name: 'Washoe County Regional Parks and Open Spaces',
    url: 'https://gisenterprise.washoecounty.gov/server/rest/services/ReferenceServices/Regional_Parks_and_Open_Spaces/FeatureServer/0',
    nameField: 'NAME',
    detailFields: ['PARK_TYPE', 'FAC_OWN'],
    // The earlier build left golf courses and cemeteries out.
    where: "UPPER(NAME) NOT LIKE '%GOLF%' AND UPPER(NAME) NOT LIKE '%CEMETERY%'",
  },
};
