# Nevada Day Hunt Map: how the data was built (Oct 2026)

Map: https://claude.ai/artifact/DuJnE7XvcMjKKDXZxDRgjN

## Counties
Washoe, Douglas, Carson City, Storey, Lyon, Pershing, Churchill, Mineral (Mineral added Oct 24, 2026: new hunt county this year)

## 2026 find
Virginia City Highlands Park, Storey County (39.38095, -119.64143). Not in OpenStreetMap. Sits on a 7.03-acre parcel owned by Storey County (APN 307204), so the county-land parcel layer catches it.

## Sources used
- OpenStreetMap via overpass-turbo.eu (GeoJSON exports): counties, places (towns, parks, peaks, springs, lakes, historic, trailheads, viewpoints), trails + streams, dirt roads (two runs by county), paved highways (motorway to tertiary), paved local streets (residential/unclassified, three runs: Washoe; Carson/Douglas/Storey/Lyon; Pershing/Churchill/Mineral). Mineral exported as one combined query.
- BLM Nevada Surface Management Agency (SMA): federal and state land by agency. Note: SMA labels county and city land as "Private".
- Nevada statewide parcels, NDOT, 2018 owner records (only public statewide owner file; a 2020-21 state copy is marked not for sharing). Filtered to county/city/town, GIDs, state, school districts, HOAs.
- Washoe County Regional Parks and Open Spaces layer (current county park list; golf courses and cemeteries left out)
- Historical Marker Database (HMdb.org): per-county CSV downloads ("download all markers" option on each county results page), Oct 2026. 546 markers; 126 matched to official SHPO markers, 420 added as "More historical markers". Reuse allowed non-commercially with credit and link (each popup links its HMdb page).
- USGS GNIS Domestic Names, Nevada text file (DomesticNames_NV_Text.zip from The National Map staged products). 1,820 named canyons/valleys/flats/landforms added, plus 560 springs, 130 lakes, 14 summits not already in OSM; ~1,050 duplicates skipped.
- NPS National Historic Trails feature services (CALI_NHT and POEX_NHT), clipped to the 8 counties. The NPS files carry no branch names.
- Lincoln Highway: no NPS layer and no OSM route relation in the area; built from OSM road segments whose name tags include "Lincoln Highway" (partial).
- Nevada SHPO historical marker booklet (2021 ed.); SHPO register lists (2026) with Wikipedia NRHP coordinates
- Wikipedia ghost town list plus individual articles for coordinates

## Known gaps
- Parcels are 2018 ownership: land bought by counties/towns since then is missing. Washoe County has a current parcel service with owners if needed.
- 8 ghost towns and 49 register sites had no confirmed location ("Not on the map" section)
- Many rural OSM roads have no surface tag
- Lincoln Highway layer is partial
- No satellite basemap; popups link to Google Maps

## Rebuild steps for next year
1. Re-run the Overpass queries, the parcel/Washoe parks download links, the HMdb county CSV downloads, the GNIS Nevada file and the two NPS trail links
2. Download a fresh BLM SMA GeoJSON and SHPO PDFs
3. Attach everything in this project and ask Claude to update the map at the link above