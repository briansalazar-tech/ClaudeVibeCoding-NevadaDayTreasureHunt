/** Where each dataset comes from. See Reference-MD-Files/hunt-map-data-sources.MD. */

const CENSUS_CB_VINTAGE = '2025';

export const SOURCES = {
  censusCounties: {
    name: 'US Census Bureau Cartographic Boundary Files, counties (1:500,000)',
    vintage: CENSUS_CB_VINTAGE,
    url: `https://www2.census.gov/geo/tiger/GENZ${CENSUS_CB_VINTAGE}/shp/cb_${CENSUS_CB_VINTAGE}_us_county_500k.zip`,
    rawFile: `cb_${CENSUS_CB_VINTAGE}_us_county_500k.zip`,
  },
} as const;
