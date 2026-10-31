# CLAUDE.md
Guidance for Claude Code when working in this repository.

## Project
This project is a single-user geographic interface for scouting the Nevada Day Treasure Hunt. It displays map data for the listed counties, with layers that can be toggled and filtered, a search feature, and a Roam-style field notebook tied to the map.

This is a web-app rebuild of an earlier version built as a Claude artifact (https://claude.ai/artifact/DuJnE7XvcMjKKDXZxDRgjN). The earlier version's features and data sources are documented in `Reference-MD-Files/`:
- `nevada-day-hunt-map.MD`: what the earlier version did (layers, notebook, map interactions, known gaps)
- `hunt-map-data-sources.MD`: where each dataset came from and how to rebuild it

Read these before designing a layer or feature, and match or improve on the earlier version.

- **Single user, local first.** The app runs on the user's PC for now and may be hosted online later. Keep that path open: URLs, ports, and file paths come from environment variables and are never hard-coded.
- **Field use.** The layout must work at phone width (about 400px) as well as on a desktop.

### Map Interface
Only display map data for the following Nevada counties. Each county is interactive: the user can select it, zoom in, view its data, and toggle layers and filters.

The Nevada counties to include are:
- Lyon
- Washoe
- Storey
- Churchill
- Pershing
- Douglas
- Carson City (a consolidated city-county; treat it as a county everywhere)
- Mineral (added to the hunt in 2026)

Keep the county list in one config file (`shared/src/counties.ts`). Adding or removing a county should take only a config change and a data rebuild.

Interface requirements:
- County boundaries come from the US Census Cartographic Boundary files. The area outside the 8 counties is dimmed, and all feature data is clipped to the counties.
- Hovering over a county highlights it. Clicking a county (on the map or in the side panel) zooms to it and isolates it. The ‹ › buttons step through the counties. "← All counties", or a click outside the county, returns to the full view.
- When a county is selected, the side panel lists every named place in it, grouped by layer and filterable by text.
- Clicking a feature opens a popup with its name, layer, coordinates (copyable), and the land owner at that spot, plus links where available: HMdb, the state marker page, Wikipedia, and Google Maps satellite view and directions.
- A basemap switcher offers a street map (OpenFreeMap), USGS Topo, and USGS Imagery (satellite). The earlier version had no satellite basemap.
- Display settings: label size (S–XL) and a light/dark theme.

### Filters and Layers
Each of the following layers can be toggled on or off on top of the map. Layers marked *(prev)* weren't in the original list but were in the earlier version and proved useful.

| Layer | Contents | Sources |
|---|---|---|
| Streets & roads | Street names; paved highways, local streets, gravel roads, dirt roads, and 4x4 tracks, styled by surface. Name labels toggle separately. | OSM |
| Parks | All public parks: state, county, and city, regardless of size or location. Includes playgrounds, dog parks, picnic sites, reserves, and sports fields. | OSM, Washoe County Regional Parks & Open Spaces, public-owner parcels |
| Trails & trailheads | Hiking trails, trailheads, viewpoints | OSM |
| Historic trails *(prev)* | California Trail, Pony Express, Lincoln Highway (partial) | NPS (CALI_NHT, POEX_NHT); OSM road names for the Lincoln Highway |
| Towns & cities | Cities, towns, and named communities | OSM |
| Geological & water features | Rivers, creeks, lakes, ponds, springs, hot springs, mountains, peaks, canyons, valleys, flats, other landforms | OSM, USGS GNIS |
| State historical markers | Official numbered Nevada State Historical Markers, each linked to its HMdb page and its state marker page | Nevada SHPO marker booklet, HMdb |
| Historical markers | All other HMdb markers, each linked to its HMdb page | HMdb |
| Register sites *(prev)* | National and State Register of Historic Places sites | SHPO register lists, Wikipedia NRHP coordinates |
| Ghost towns | Ghost towns and abandoned settlements | Wikipedia ghost town list and articles, OSM |
| Land ownership | Public vs private land: BLM, Forest Service, State, Reclamation, Fish & Wildlife, NPS, tribal, military, DOE, private. Also parcels owned by counties, cities, towns, GIDs, the state, school districts, and HOAs. | BLM Surface Management Agency (SMA), NDOT 2018 statewide parcels |
| Other notable | Petroglyph sites, railroads (active and abandoned), mines, ruins, other historic sites | OSM |
| Past finds *(prev)* | Known medallion find locations. 2026: Virginia City Highlands Park, Storey County (39.38095, -119.64143) | Entered by hand |
| Custom markers | Markers the user adds | SQLite |

**Custom markers:** the user adds a marker by clicking the map or entering coordinates, then gives it a name, a description, and a status (To check, Clue fits, Checked, Dead end), and assigns it to one of the layers above. A custom marker shows and hides with its layer and looks distinct from source data.

### Search feature
Search works at the full-map level and within the selected county. A county-scoped search returns only results in that county. Search must handle:
- **Coordinates:** decimal degrees (`39.38095, -119.64143`), degrees-minutes-seconds, and degrees-decimal-minutes. In these counties latitude is positive and longitude is negative, so swapped values can be detected and corrected. Coordinates outside the 8 counties still navigate but show a warning.
- **Addresses:** geocoded through the local server, using Nominatim with the US Census Geocoder as a fallback. Results are limited to the 8-county area and cached in SQLite. Follow Nominatim's usage policy: at most 1 request per second, a descriptive User-Agent, and no search-as-you-type.
- **Places in any layer:** parks, towns, markers, ghost towns, peaks, springs, and so on, through a client-side index (MiniSearch).
- **Roads and route numbers:** `SR 341`, `US 50`, `I-80`.
- **User data:** custom markers, map notes, and (from Phase 5) notebook pages.

## Journal Entry and Notes Database
A Roam-style field notebook that matches the earlier version (see `nevada-day-hunt-map.MD`), minus the Claude-powered "Find people & places with Claude" feature. Data is stored in SQLite through the local server.

Notebook features:
- **Views:** a separate Notebook view for entries that aren't tied to the map, and a side-by-side mode that keeps the map visible next to the notebook.
- **Pages and links:** `[[Page Name]]` links (the page is created on first click) and `#tags`. Each page lists its linked references and its unlinked references (plain-text mentions that can be linked with one click). Renaming a page updates every link to it.
- **Page types:** Article, Person, Place, Clue, Topic, Note, and Daily note ("Today" opens the page for today's date). The notebook home can filter by type.
- **Editor:** outliner bullets (`- `), Tab/Shift+Tab to indent, `# Heading`, `> quote`, and `**bold**`; web links are shortened automatically. Typing `[[` suggests existing pages and map places. Photos can be attached to pages.
- **Capture:** "+ Capture" takes a pasted article (title, type, source link, and text). After saving, it finds map place names and existing page names in the text and offers to link them.
- **Map integration:**
  - A link whose name matches a map place gets a pin icon. Clicking the pin flies to the place and opens its popup.
  - Pages about map places are outlined on the map (a toggle on the notebook home).
  - Place popups show "In your notebook" with the pages that mention the place, plus "+ Notebook page for this place".
  - When several places share a name, the page lists each match with a "This one" button to tie the page to the right spot.
  - "Put on map" places any page (a person, a clue, an off-map place) at a chosen spot.
  - Notes and photos can be added to any map place from the map view. `[[links]]` in map notes and custom markers count as notebook references.
- **Export and backup:** "Export notebook (.md)" saves everything as one Markdown file. A JSON backup and restore covers the whole database.

Data model rules:
- Every map feature has a **stable ID** derived from its source, for example `osm:node/123`, `hmdb:45678`, `gnis:861234`, or `shpo:123`. Notes, pages, and markers refer to places by this ID so they survive data rebuilds. Never use array positions or generated UUIDs as feature IDs.
- Page bodies are stored as Markdown text. On save, links and tags are parsed into a links table, which drives backlinks and the "In your notebook" lists.
- Photos are stored as files under `server/data/uploads/`, and the database stores only their paths.

## Data Pipeline
Scripts in `data-pipeline/` download and process the map data ahead of time; the app doesn't fetch it live. Rebuilding for a new hunt year means re-running the pipeline (see "Rebuild steps for next year" in `hunt-map-data-sources.MD`).

- Raw downloads go in `data-pipeline/raw/` (gitignored). Processed output goes in `client/public/data/<county>/<layer>.geojson` (committed), along with a `manifest.json` that records per-layer feature counts and the build date.
- County boundaries are built once for all counties together into `client/public/data/boundaries/`: `counties.geojson`, `county-labels.geojson` (one label point per county), and `outside-mask.geojson` (the dimmed area). Source: Census Cartographic Boundary counties, 2025 vintage, 1:500,000 (`cb_2025_us_county_500k.zip`).
- Pipeline layout: `src/sources.ts` lists every source URL; each dataset is a step in `src/steps/` with a fetch function and a build function, and `src/fetch.ts` and `src/build.ts` run the steps. Keep the processing in pure functions that take parsed input and return GeoJSON, so they can be unit-tested with small fixtures. `downloadToRaw()` caches downloads. The manifest writer keeps the counts already recorded for counties that aren't in the current run.
- The data file paths and their types (`DATA_FILES`, `layerFile()`, `Manifest`, `PlaceProperties`) live in `shared/src/data-files.ts` and `shared/src/layers.ts`, so the pipeline and the client agree on them. Each county also gets `unlocated.json` (the "Not on the map" list).
- Steps in `data-pipeline/src/steps/`: `osm` (five Overpass queries per county: roads, places, trails, history, nature), `gnis`, `nps-trails`, `land` (BLM SMA plus public-owner parcels), `county-parks`, `markers` (SHPO plus HMdb), `register`, `ghost-towns`. `src/build-county.ts` merges them per county (dedupe, clip, representative points) as a pure function.
- Only the HMdb county CSVs need a manual download (the county results page, "Download" button; save as `data-pipeline/raw/hmdb/<county>.csv`). `data:fetch` prints the exact URL for each missing one, and `data:build` warns and builds without them. State markers are matched to HMdb by the CSV's "Marker No." within 2 km (other series such as Trails West and the Forest Service reuse small numbers), then by title and distance. Everything else downloads by script:
  - SHPO state markers come from the JSON feed behind shpo.nv.gov's marker map (`/historical-markers-json`), with coordinates, numbers and page slugs. The marker booklet PDF isn't needed.
  - The State Register list is a SHPO PDF parsed with unpdf (text positions; the page is landscape). NRHP coordinates come from the Wikipedia county NRHP lists.
  - BLM SMA is one statewide polygon per agency from the BLM Nevada FeatureServer, cached in `raw/blm-sma/` and clipped per county part by part.
  - Parcels: Lyon uses its own current assessor service (`PARCEL_SOURCES` in `sources.ts`). Counties without one fall back to the 2018 NDOT statewide service, which was down ("Could not access any server machines") in Oct 2026; check it before Phase 3. Owner attributes download first and public owners are picked locally, then only their geometry is fetched.
- Go easy on public APIs: run Overpass queries one at a time, cache the responses in `raw/`, and don't re-download on every run. The public Overpass server is often at capacity (429/504); the fetch backs off for minutes and retries. Never ask Overpass for `out geom` on non-multipolygon relations in the history and nature queries: route relations that cross the continent (historic trails) make the query time out.
- Deduplicate GNIS features against OSM by name and distance. The earlier build skipped about 1,050 duplicates.
- BLM SMA labels county and city land as "Private". Overlay the public-owner parcel layer so county and city land shows as public.
- The statewide parcels reflect 2018 ownership. Lyon's current assessor service replaces them for Lyon; Washoe County has a current parcel service with owner data that can replace them for Washoe (add it to `PARCEL_SOURCES`).
- Never guess coordinates. Places without a confirmed location go in a "Not on the map" list in the county panel. Thirteen archaeological register sites are confidential by design; don't try to locate them.
- Heavy layers (streets, land ownership, parcels) load per county and only above a minimum zoom. If a processed file exceeds about 10 MB, simplify it with mapshaper or switch that layer to PMTiles (tippecanoe needs WSL or Docker on Windows).

Show these attributions in the map's attribution control:
- OpenStreetMap: "© OpenStreetMap contributors" (ODbL).
- HMdb: non-commercial reuse is allowed with credit. Every marker popup links to its HMdb page.
- USGS, NPS, BLM, and Census: public domain, but credit them anyway.

## Project Phases
The project is broken into the following phases, and each phase is validated before the next begins. Validation must be acknowledged by a human.

Phase workflow:
1. Create a branch for the phase, for example `phase-1-base-map`.
2. Build the phase. Don't start work that belongs to a later phase.
3. Run `npm run check` and fix any failures.
4. Render the app in a real browser and go through the checklist yourself, against both `npm run dev` and the production build (`vite preview`). A server returning 200 is not enough: map problems such as WebGL, worker, or style errors only show up in a browser. If the Claude in Chrome extension isn't connected, drive Microsoft Edge (installed; Chrome isn't) headlessly with `playwright-core` from the scratchpad, using `channel: 'msedge'` and the SwiftShader flags (`--enable-unsafe-swiftshader --use-angle=swiftshader`). Take screenshots and look at them, and check the console for errors.
5. Give the user a validation checklist with steps to follow in the running app. **Stop and wait.** Don't merge to `main` or begin the next phase until the user confirms the phase is valid.
6. After the user confirms, commit, merge the branch into `main` with `--no-ff`, push to GitHub (`origin`), and push the phase branch too.

**Status:** Phase 1 is complete (merged to `main` on 2026-10-29). Phase 2 is complete (merged to `main` on 2026-10-31). Next is Phase 3.

### Phase 1: Base Map
Create the base map layer that displays the listed counties. Each county can be selected and is interactive.
- Scaffold the npm workspace (`client`, `shared`, `data-pipeline`), the TypeScript, ESLint, Prettier, and Vitest config, and the npm scripts this phase needs.
- Build the county boundary file and the map interface described under Map Interface: the dimmed outside area, hover, select and isolate, ‹ › stepping, the all-counties view, the side panel, the basemap switcher, the theme, and the phone layout.

Validation: all 8 counties render with correct boundaries and labels. Each county can be selected and deselected from the map and from the side panel. The basemaps switch, and the layout works at phone width.

### Phase 2: Single County Data
Lyon County: add the required layers for Lyon County so the user can view them and interact with the map.
- Write the data pipeline for every layer so that it works for any county, but run and validate it only for Lyon.
- Add the layer panel, popups, the county place list, and custom markers. This phase adds the `server` workspace and the SQLite database.

Validation: every layer shows Lyon data and toggles on and off. Spot checks include Fort Churchill State Historic Park, Dayton State Park, Yerington, Fernley, the Carson and Walker rivers, and Lyon County's state historical markers with working HMdb links. A custom marker can be added, edited, and deleted, and it survives a server restart.

### Phase 3: All County Data
After the user verifies Lyon County's data, run the pipeline for the remaining counties.

Validation: the per-county, per-layer feature counts in `manifest.json` look reasonable to the user. The 2026 find, Virginia City Highlands Park (Storey County), appears in the Parks layer. The map stays smooth with streets on at county zoom.

### Phase 4: Search Feature
Add the search feature to the interactive map, meeting the requirements under Search feature.

Validation: `39.38095, -119.64143` and its DMS form both fly to Virginia City Highlands Park. `SR 341` finds the highway. A street address in Fernley resolves. "Fort Churchill" finds the park and its markers. A county-scoped search returns only that county's results.

### Phase 5: Journal/Notes Feature
Add the journal and notes feature described under Journal Entry and Notes Database. Notes can be viewed on the map. A separate view allows manual entry of notes and entries that aren't on the map. Notes can also be added from the map view.

Validation: the user walks through each notebook feature, including backlinks, renaming, capture, map pins, "This one", "Put on map", photos, and Markdown export.

## Stack
- **Language:** TypeScript (strict) everywhere. Node.js 24 LTS with npm workspaces.
- **Client** (`client/`): React, Vite, and MapLibre GL JS. Zustand for UI state (selected county, layer toggles, settings), TanStack Query for server data, MiniSearch for the client-side search index.
- **Basemaps:** OpenFreeMap vector tiles (no API key), plus USGS National Map Topo and Imagery raster tiles (public domain).
- **Server** (`server/`): Express 5, with better-sqlite3 and Drizzle ORM for the schema and migrations. Drizzle keeps a later move to Postgres possible if the app is hosted. Request bodies are validated with Zod.
- **Shared** (`shared/`): the county config, layer definitions, and the Zod schemas and types used by both client and server.
- **Data pipeline** (`data-pipeline/`): TypeScript scripts run with tsx, using Turf for clipping and deduplication and mapshaper for simplification.
- **Testing and quality:** Vitest (with React Testing Library and Supertest), ESLint, and Prettier.

Repository layout:
```
client/               React + Vite + MapLibre app
  public/data/        Processed GeoJSON per county and layer, plus boundaries/ and manifest.json (committed)
server/               Express API: notes, markers, geocoding proxy
  data/               SQLite database and photo uploads (gitignored)
shared/               County config, layer definitions, Zod schemas
data-pipeline/        Download and processing scripts
  raw/                Downloaded source files (gitignored)
Reference-MD-Files/   Docs from the earlier (artifact) version
```

Environment variables live in `.env` at the repo root (never committed) and are documented in `.env.example` (committed): `CLIENT_PORT` and `CLIENT_HOST` (Vite dev server; set `CLIENT_HOST=0.0.0.0` to test on a phone over Wi-Fi), `PORT` and `HOST` (API server), `DATABASE_PATH`, `UPLOADS_DIR` (paths relative to the repo root), `VITE_API_URL`, `GEOCODER_USER_AGENT` (also sent by the data pipeline to Overpass and Wikipedia). The client's `vite.config.ts` sets `envDir` to the repo root. The client calls `/api` on its own origin and the Vite dev and preview servers forward it to `PORT`, so leave `VITE_API_URL` empty unless the API is hosted elsewhere.

Development is on Windows, so npm scripts must be cross-platform: no bash-only syntax, and use `cross-env` and `path.join`.

## Commands
Each phase creates the scripts it needs. Keep this list current.

```
npm install                          # install all workspaces
npm run dev                          # client (Vite) + API server together
npm run dev:client                   # client only
npm run dev:server                   # API server only (tsx watch)
npm run build                        # production build of client and server
npm run start                        # production: the bundled server serves the API and client/dist
npm run check                        # typecheck + lint + test + build; run before every phase validation
npm run typecheck
npm run lint                         # ESLint + Prettier check
npm run format                       # Prettier write
npm run test                         # Vitest, all workspaces (test:watch for watch mode)
npm run db:migrate                   # apply Drizzle migrations (the server also applies them on startup)
npm run db:generate -w server        # generate a migration after changing server/src/db/schema.ts
npm run data:fetch -- --county lyon  # download raw source data for one county (or --all); cached, --force re-downloads
npm run data:build -- --county lyon  # process raw data into client/public/data (county boundaries are always rebuilt)
```

## Implementation Notes
Decisions and pitfalls from earlier phases. Check these before changing the related code.

- **Versions:** TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TypeScript 7 yet. Other packages are on current majors: Vite 8, React 19, MapLibre 6, Zustand 5, Vitest 5, ESLint 10.
- **Workspace packages** are named `@hunt/shared`, `@hunt/client`, `@hunt/server`, and `@hunt/data-pipeline`. `@hunt/shared` exports its TypeScript source directly (`exports: ./src/index.ts`) and has no build step. Vite and tsx compile it on the fly; the server runs under `tsx watch` in development and `server/build.mjs` bundles it with esbuild for production (shared bundled in, npm dependencies external).
- **Server:** Express 5 with better-sqlite3 and Drizzle (`server/src/db/schema.ts`, migrations committed in `server/drizzle/`). `createApp(db)` in `server/src/app.ts` takes the database, so tests use an in-memory one with Supertest. Request bodies are parsed with the Zod schemas in `shared/src/markers.ts`; `errors.ts` turns Zod errors into 400s. With `NODE_ENV=production` the server also serves `client/dist`.
- **MapLibre worker:** MapLibre 6 builds its worker URL at runtime, so Vite doesn't serve or bundle the worker. `client/src/map/MapView.tsx` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?url` and calls `setWorkerUrl()`. Without that, vector tiles (the Streets basemap) and every GeoJSON layer stay blank, while the raster basemaps still draw.
- **Map overlay:** everything drawn on top of the basemap is defined in `client/src/map/overlay.ts` (counties) and `client/src/map/dataLayers.ts` (data layers and custom markers), with ids prefixed `hunt-`. A `transformStyle` hook re-adds it on every `setStyle`, so switching basemaps keeps it; `MapView` tracks which features each source holds and re-sends data that arrived while a style was loading. State changes (selection, theme, label size, layer toggles) go through `applyOverlayState()`. Hover uses feature-state (`promoteId: 'id'`). Add new layers the same way.
- **Map icons** are drawn on a canvas by `client/src/map/icons.ts` through `map.setMissingStyleImageResolver()`; the icon id encodes shape, color and size. (The older `styleimagemissing` event still draws them, but MapLibre 6 logs a warning for every icon.)
- **Layer data:** `client/src/layerData.ts` decides which `<county>/<layer>.geojson` files to load (TanStack Query, cached for the session). Light layers load when on; heavy layers (streets, land) load for the selected county or once zoomed in to their `minzoom` over a county. A selected county loads all its layers for the place list. Popups look up the land owner from the county's land layer.
- **Map clicks:** with a county isolated, any click outside it, including on another county, returns to the full view.
- **State:** `client/src/state/store.ts` (Zustand). Display settings (basemap, theme, label size) and layer toggles are saved in localStorage under `hunt-map-settings`; new layers default to on (land ownership defaults to off). Selection is not saved. Server data (custom markers) goes through TanStack Query hooks in `client/src/api.ts`.
- **Keyboard:** Esc closes an open popup first, then cancels marker placement, then returns to all counties.
- **Tests:** the root `vitest.config.ts` defines a project per workspace, and client tests run in jsdom. MapLibre can't run in jsdom, so test the pure style builders in `overlay.ts`, the store, and the components. Check the map itself in a browser (see the phase workflow).
- **Shell quirk:** heredocs in the Bash tool can collapse `\\` to `\`, and can break on quote-heavy text such as CSS. Write files that contain backslashes, such as regexes, with the Write or Edit tool.
- **Dev servers on Windows:** stopping an `npm run dev` background task can leave its Vite child running, so the next start moves to 5174, 5175, and so on. Read the port from the Vite output instead of assuming 5173.

## Known Gaps from the Earlier Version
Address these where practical, but don't hold up a phase for them.
- No satellite basemap: fixed by the USGS Imagery basemap (done in Phase 1).
- Parcels reflect 2018 ownership: use Washoe's current parcel service, and look for current services in the other counties.
- The Lincoln Highway layer is partial.
- Building outlines are missing: Microsoft's US building footprints are a possible future layer.
- Notebook link-finding only matches exact spellings of map names: use case- and punctuation-insensitive matching.
