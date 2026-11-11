# CLAUDE.md
Guidance for Claude Code when working in this repository.

## Project
This project is a geographic interface for scouting the Nevada Day Treasure Hunt, used by a small team: a super admin and the collaborators they invite. It displays map data for the listed counties, with layers that can be toggled and filtered, a search feature, and a Roam-style field notebook tied to the map.

This is a web-app rebuild of an earlier version built as a Claude artifact (https://claude.ai/artifact/DuJnE7XvcMjKKDXZxDRgjN). The earlier version's features and data sources are documented in `Reference-MD-Files/`:
- `nevada-day-hunt-map.MD`: what the earlier version did (layers, notebook, map interactions, known gaps)
- `hunt-map-data-sources.MD`: where each dataset came from and how to rebuild it

Read these before designing a layer or feature, and match or improve on the earlier version.

- **Small team, local first.** A super admin and the users they invite (see User Authentication). The app runs on the user's PC for now and may be hosted online later. Keep that path open: URLs, ports, and file paths come from environment variables and are never hard-coded.
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
| Parks | All public parks: state, county, and city, regardless of size or location. Includes playgrounds, dog parks, picnic sites, reserves, and sports fields. | OSM, Washoe County Regional Parks & Open Spaces, Lyon County park parcels, public-owner parcels (`PARCEL_PARKS`) |
| Trails & trailheads | Hiking trails, trailheads, viewpoints | OSM |
| Historic trails *(prev)* | California Trail, Pony Express, Lincoln Highway (partial) | NPS (CALI_NHT, POEX_NHT); OSM road names for the Lincoln Highway |
| Towns & cities | Cities, towns, and named communities | OSM |
| Geological & water features | Rivers, creeks, lakes, ponds, springs, hot springs, mountains, peaks, canyons, valleys, flats, other landforms | OSM, USGS GNIS |
| State historical markers | Official numbered Nevada State Historical Markers, each linked to its HMdb page and its state marker page | Nevada SHPO marker booklet, HMdb |
| Historical markers | All other HMdb markers, each linked to its HMdb page | HMdb |
| Register sites *(prev)* | National and State Register of Historic Places sites | SHPO register lists, Wikipedia NRHP coordinates |
| Ghost towns | Ghost towns and abandoned settlements | Wikipedia ghost town list and articles, OSM |
| Land ownership | Public vs private land: BLM, Forest Service, State, Reclamation, Fish & Wildlife, NPS, tribal, military, DOE, private. Also parcels owned by counties, cities, towns, GIDs, the state, school districts, and HOAs. | BLM Surface Management Agency (SMA); current Lyon and Washoe parcel services, NDOT 2018 statewide parcels for the other counties |
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
- **User data:** custom markers, map notes, and notebook pages.

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

## User Authentication
The app is invitation only: there is no public sign-up, and every user signs in. The first account is the super admin, who owns the project. All users share one notebook and one set of custom markers, and every page, note, comment, photo and marker shows who added it. There are no view-only accounts: everyone who is invited collaborates. This is a hobby project, but treat security as if the app were already on the public internet, since it may be hosted later.

Roles:

| Action | Super admin | Admin | Member |
|---|---|---|---|
| Add pages, custom markers, and notes and photos on map places and markers | Yes | Yes | Yes |
| Comment on any page or note | Yes | Yes | Yes |
| Edit or delete anyone's pages, notes, comments, photos and markers | Yes | Yes | Own only |
| Add users (always as members) | Yes | Yes | No |
| Reset a password | Admins and members | Members and other admins | No |
| Disable or re-enable a user | Admins and members | Members | No |
| Remove a user | Admins and members | No | No |
| Promote a member to admin, or demote an admin | Yes | No | No |
| Back up the database | Yes | Yes | No |
| Unlock a user locked out by wrong passwords | Yes | No | No |
| Restore a backup, view the audit log | Yes | No | No |

Accounts:
- **First run:** while the database has no users, the app shows only a "Create super admin" screen. It asks for a one-time setup code that the server prints to its console at startup, so whoever reaches a freshly hosted copy first can't claim it. Checking for existing users and creating the account happen in one transaction.
- **One super admin:** the first account, who is in charge of the project. The role never changes hands, and the super admin can't be demoted, disabled or removed by anyone. If they lose their password, `npm run auth:reset` on the server is the way back in.
- **Usernames** are `firstname.lastname`, built from the first and last name the admin enters: lowercase letters only, with a hyphen allowed inside a name (`mary-jane.smith`) and other punctuation and accents dropped (`O'Brien` becomes `obrien`). A second person with the same name gets a number (`john.smith2`). Sign-in ignores case. Notes show the display name, "First Last".
- **Adding users:** an admin enters the first and last name. The server generates a random temporary password and shows it to the admin once; the admin passes it on however they like (no email is sent).
- **Temporary passwords** expire after 7 days if unused. A user signed in with one sees only the "Choose a new password" screen, and the server refuses every other request until they've changed it.
- **Strong passwords:** 12 to 128 characters, scored with zxcvbn (`@zxcvbn-ts`, run locally; nothing is sent out) and refused below a score of 3, or if they contain the user's first name, last name or username. The form shows the strength as the user types. No rules requiring particular kinds of characters, following NIST SP 800-63B. Passwords are stored only as hashes made by the auth library; never log them.
- **Password resets** set a new temporary password, shown once to the admin who reset it, and end all of that user's sessions. `npm run auth:reset -- --user <name>`, run on the server, does the same for any user and is how the super admin recovers their own account.
- **Disabling or removing a user** ends their sessions at once. Their content stays and still shows their name.
- **Account menu:** shows who is signed in, changes the password (which signs out the other sessions), signs out, and signs out everywhere.
- **Audit log:** adding a user, resetting a password, changing a role, disabling, re-enabling, unlocking or removing a user, and restoring a backup are recorded with who did it and when.

Authorship and permissions:
- `pages`, `place_notes`, `photos` and `markers` record `created_by` and the time; pages also record `updated_by`. Popups, pages, references and the Markdown export show the author's display name and date.
- Only a page's or note's author, an admin or the super admin can edit or delete it, or add and delete photos on a page. The same goes for custom markers. A photo on a map place can be deleted by whoever added it or by an admin.
- Actions that change a page or note follow the same rule: "This one", "Put on map", capture's link offers, and the "Link" button under unlinked references appear only to someone who can edit that text. Renaming a page still rewrites the `[[links]]` in other people's texts, so links don't break.
- **Comments:** any user can comment on any page or place note. This is how members add to pages they can't edit. A comment shows its author and time, can be edited or deleted by its author or an admin, and its `[[links]]` count as notebook references. Pages list their comments below the text; in a place popup, each note shows how many comments it has and opens them. Comments are stored in a `comments` table that refers to its page or note by id (deleting the page or note deletes its comments), and they are included in the Markdown export and the backup.
- **Notes on custom markers:** a marker's popup gets the same notebook section as a map place: notes (with comments), photos, "In your notebook", and "+ Notebook page for this place". It is keyed by the place id `marker:<id>`, which the links table already uses for marker descriptions. Anyone can add a note or photo to anyone's marker. Deleting a marker keeps the notes, photos and comments on it, the same as a map place that disappears in a data rebuild: they keep the marker's name and location and still show in the notebook and search.
- **Daily notes** are per user: "Today" opens the signed-in user's page for the date, titled with their name (`November 9, 2026 (John Smith)`). Like any page, its author and admins can edit it, and anyone can comment on it.
- Permissions are enforced by the server. The client only hides the buttons a user can't use.
- Conflicting edits: a page save sends the version it started from. The server rejects a save made against an older version (409), and the editor says "This page changed" and shows the newer text instead of overwriting it. This matters when an author and an admin edit the same page.
- Existing data: the migration adds the columns empty, and creating the super admin assigns every existing row to them. Run `npm run db:backup` before the migration.

Security:
- **Built on Node's own crypto, no auth library.** Better Auth was planned, but every account in it needs an email address and its admin plugin has its own role model, so both would have been worked around. Passwords are hashed with scrypt at OWASP's cost (N=2^15, r=8, p=3; the parameters are stored with each hash). A session is a random 32-byte token in the cookie, and the database stores only its SHA-256, so a copy of the database can't sign anyone in. Comparisons are constant-time, and a sign-in for an unknown username still runs a hash so timing doesn't reveal which usernames exist. Sessions and sign-in rate limits are stored in the database, not in memory, so the app can later run on serverless hosting.
- **Every `/api` route requires a session** except `/api/auth/*` and the setup status. That includes photo files, export, backup, and the geocoder (so strangers can't use the server to send requests to Nominatim). The map data in `client/public/data` is public source data and stays open.
- **Cookies:** `httpOnly`, `SameSite=Lax`, and `Secure` whenever the app is served over HTTPS. A session lasts 30 days and is extended while in use.
- **Cross-site requests:** requests that change data must carry an `Origin` matching `APP_URL`, on top of the SameSite cookie.
- **Sign-in attempts** are rate limited per IP address and per username. Error messages don't reveal whether a username exists. Five wrong passwords lock a username for 15 minutes; the user list shows the lock, and the super admin can unlock it early. A password reset (by an admin or `npm run auth:reset`) also lifts it, so the new temporary password works at once.
- **Security headers** come from `helmet`, including a Content Security Policy that allows only the tile servers in use (OpenFreeMap, USGS) and `blob:` workers for MapLibre. Check the map in a browser after any change to the policy: a blocked tile host or worker leaves the map blank without failing any test.
- **Uploads:** the image type is checked from the file's bytes, not the `Content-Type` header, and photos are served with `X-Content-Type-Options: nosniff`.
- **Backup and restore:** see the roles table. The backup leaves out password hashes, sessions and the audit log. A restore keeps the current accounts; authors who aren't among them show as "Former user".
- **Temporary passwords** come from the server's cryptographic random generator and are never stored in plain text or written to the log.
- **Configuration:** `APP_URL` (the address users open; requests from it pass the origin check even when a proxy changes the host), `TRUST_PROXY` (Express's `trust proxy`, for running behind a hosting proxy so rate limits see real addresses and secure cookies work) and `SETUP_CODE` (a fixed setup code; otherwise one is generated at startup and printed to the server log). When hosting, set `SETUP_CODE` as a secret in the host's environment settings before the first deploy, and enter it on the setup screen: on serverless or multi-instance hosting each instance would generate its own code, so a printed one may not match the instance that answers. The code works only while there are no users, so it can be removed after setup. No signing secret is needed: sessions are random tokens looked up in the database. Nothing secret goes in the client bundle or in git.
- **Dependencies:** run `npm audit --omit=dev` before validating a phase and fix high-severity issues. (On 2026-11-09 the production dependencies had none; ESLint's own dependencies had moderate ones, which don't ship.)

## Data Pipeline
Scripts in `data-pipeline/` download and process the map data ahead of time; the app doesn't fetch it live. Rebuilding for a new hunt year means re-running the pipeline (see "Rebuild steps for next year" in `hunt-map-data-sources.MD`).

- Raw downloads go in `data-pipeline/raw/` (gitignored). Processed output goes in `client/public/data/<county>/<layer>.geojson` (committed), along with a `manifest.json` that records per-layer feature counts and the build date.
- County boundaries are built once for all counties together into `client/public/data/boundaries/`: `counties.geojson`, `county-labels.geojson` (one label point per county), and `outside-mask.geojson` (the dimmed area). Source: Census Cartographic Boundary counties, 2025 vintage, 1:500,000 (`cb_2025_us_county_500k.zip`).
- Pipeline layout: `src/sources.ts` lists every source URL; each dataset is a step in `src/steps/` with a fetch function and a build function, and `src/fetch.ts` and `src/build.ts` run the steps. Keep the processing in pure functions that take parsed input and return GeoJSON, so they can be unit-tested with small fixtures. `downloadToRaw()` caches downloads. The manifest writer keeps the counts already recorded for counties that aren't in the current run.
- The data file paths and their types (`DATA_FILES`, `layerFile()`, `Manifest`, `PlaceProperties`) live in `shared/src/data-files.ts` and `shared/src/layers.ts`, so the pipeline and the client agree on them. Each county also gets `unlocated.json` (the "Not on the map" list) and `search.json` (the search index, see Implementation Notes).
- Steps in `data-pipeline/src/steps/`: `osm` (five Overpass queries per county: roads, places, trails, history, nature), `gnis`, `nps-trails`, `land` (BLM SMA plus public-owner parcels), `county-parks`, `markers` (SHPO plus HMdb), `register`, `ghost-towns`. `src/build-county.ts` merges them per county (dedupe, clip, representative points) as a pure function.
- Only the HMdb county CSVs need a manual download (the county results page, "Download" button; save as `data-pipeline/raw/hmdb/<county>.csv`, where `<county>` is the id in `counties.ts`, such as `carson-city.csv`; a misspelled name is skipped with a warning). HMdb files Carson City under `County=Carson City`, without "County". All 8 CSVs were downloaded on 2026-10-31. `data:fetch` prints the exact URL for each missing one, and `data:build` warns and builds without them. State markers are matched to HMdb by the CSV's "Marker No." within 2 km (other series such as Trails West and the Forest Service reuse small numbers), then by title and distance. Everything else downloads by script:
  - SHPO state markers come from the JSON feed behind shpo.nv.gov's marker map (`/historical-markers-json`), with coordinates, numbers and page slugs. The marker booklet PDF isn't needed.
  - The State Register list is a SHPO PDF parsed with unpdf (text positions; the page is landscape). NRHP coordinates come from the Wikipedia county NRHP lists.
  - BLM SMA is one statewide polygon per agency from the BLM Nevada FeatureServer, cached in `raw/blm-sma/` and clipped per county part by part.
  - Parcels: Lyon and Washoe use their own current county services (`PARCEL_SOURCES` in `sources.ts`; Washoe's skips people's names, keeping organizations only). The other counties fall back to the 2018 NDOT statewide service, which is down at times ("Could not access any server machines") but worked on 2026-10-31. Owner attributes download first and public owners are picked locally, then only their geometry is fetched. ArcGIS paging advances by the rows actually returned, since servers can cap a page below the requested size (Washoe returns 1,000).
  - Parks that no source names go in `PARCEL_PARKS` (`sources.ts`) by APN: the public parcel supplies the outline, and only the confirmed name is entered by hand. Virginia City Highlands Park (the 2026 find) is in the Parks layer this way.
- Go easy on public APIs: run Overpass queries one at a time, cache the responses in `raw/`, and don't re-download on every run. The public Overpass server is often at capacity (429/504); the fetch backs off for minutes and retries. Never ask Overpass for `out geom` on non-multipolygon relations in the history and nature queries: route relations that cross the continent (historic trails) make the query time out.
- Deduplicate GNIS features against OSM by name and distance. The earlier build skipped about 1,050 duplicates.
- BLM SMA labels county and city land as "Private". Overlay the public-owner parcel layer so county and city land shows as public.
- The statewide parcels reflect 2018 ownership; popups for those parcels say "2018 owner". Lyon and Washoe use current county services instead. No public service was found for Carson City or Douglas in Oct 2026; add one to `PARCEL_SOURCES` if it turns up.
- Never guess coordinates. Places without a confirmed location go in a "Not on the map" list in the county panel. Thirteen archaeological register sites are confidential by design; don't try to locate them.
- Heavy layers (streets, land ownership, parcels) load per county and only above a minimum zoom. If a processed file exceeds about 10 MB, simplify it with mapshaper or switch that layer to PMTiles (tippecanoe needs WSL or Docker on Windows).
- File size: `finalizeDrafts` simplifies every line and polygon to about 2 m (`SIMPLIFY_TOLERANCE`), and layer files are written with `packLayerFile()` (`shared/src/data-files.ts`): `layer` and `county` are dropped (the path gives them) and a shared `source` is stored once. The client restores them with `unpackLayerFile()`. Washoe streets is the largest file at 9.9 MB; if it grows past 10 MB, switch streets to PMTiles.

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

**Status:** Phase 1 is complete (merged to `main` on 2026-10-29). Phase 2 is complete (merged to `main` on 2026-10-31). Phase 3 is complete (merged to `main` on 2026-10-31). Phase 4 is complete (merged to `main` on 2026-11-02). Phase 5 is complete (merged to `main` on 2026-11-07). Phase 6 is complete (merged to `main` on 2026-11-11). Hosting is next.

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

### Phase 6: User Authentication
Add user accounts as described under User Authentication. Hosting (choosing a platform, and moving the database and photos if the platform needs it) is a later phase.
- Add sign-in (see Security), the user, session, rate limit, comment and audit log tables, the `created_by` and `updated_by` columns, the setup, sign-in, new password, account and user management screens, comments on pages and place notes, notes and photos on custom markers, the audit log view, and the server-side permission checks.
- Server tests (Supertest) cover sign-in, the forced password change, password strength, usernames, a 401 from every protected route when signed out, and each row of the roles table (for example, a 403 when a member edits someone else's page or an admin tries to promote someone).
- Browser checks use a scratch database and create their own test accounts. Never add test accounts to the user's real database.

Validation:
- On a copy of the real database, the setup screen asks for the code from the server console. After the super admin is created, the existing pages, notes and markers show them as the author.
- The super admin adds an admin and a member, and each temporary password is shown once. In a second browser or private window, the new user must choose a new password before seeing anything else. Weak passwords, such as `Password1234!` or one containing the user's name, are refused.
- A second "John Smith" gets the username `john.smith2`, and sign-in ignores case.
- The member's pages, notes, markers and photos show the member's name. The member can't edit or delete the admin's page or note: there's no button, and the API refuses. The admin can edit and delete the member's.
- The member comments on the admin's page and on a place note. The comment shows the member's name, a `[[link]]` in it appears in the linked page's references, and the admin can delete it.
- The member adds a note, a comment and a photo to the admin's custom marker, and they show the member's name. After the marker is deleted, the note is still in the notebook.
- "Today" opens a separate daily note for each user, titled with their name.
- The admin can add a member, reset a member's or another admin's password, and disable and re-enable a member. The admin can't promote anyone, disable or remove an admin, or reset the super admin's password. The super admin can promote, demote, disable and remove admins and members, and nobody can demote, disable or remove the super admin.
- Signed out, the app shows only the sign-in screen, and API addresses such as a page or a photo return 401.
- Repeated wrong passwords are rate limited. The super admin sees the lock in the user list and can unlock it; an admin can't.
- Disabling a user signs them out at once, and their content remains.
- `npm run auth:reset` gives the super admin a new temporary password.
- The audit log lists the steps above.
- The backup contains no password hashes, and only the super admin can restore.
- When an author and an admin edit the same page in two browsers, the second save shows "This page changed".
- The setup, sign-in, new password, account and user management screens work at phone width.

## Stack
- **Language:** TypeScript (strict) everywhere. Node.js 24 LTS with npm workspaces.
- **Client** (`client/`): React, Vite, and MapLibre GL JS. Zustand for UI state (selected county, layer toggles, settings), TanStack Query for server data, MiniSearch for the client-side search index.
- **Basemaps:** OpenFreeMap vector tiles (no API key), plus USGS National Map Topo and Imagery raster tiles (public domain).
- **Server** (`server/`): Express 5, with better-sqlite3 and Drizzle ORM for the schema and migrations. Drizzle keeps a later move to Postgres possible if the app is hosted. Request bodies are validated with Zod.
- **Authentication:** Node's `crypto` (scrypt password hashes, random session tokens stored hashed in SQLite), `@zxcvbn-ts` for password strength, and `helmet` for security headers.
- **Shared** (`shared/`): the county config, layer definitions, and the Zod schemas and types used by both client and server.
- **Data pipeline** (`data-pipeline/`): TypeScript scripts run with tsx, using Turf for clipping and deduplication and mapshaper for simplification.
- **Testing and quality:** Vitest (with React Testing Library and Supertest), ESLint, and Prettier.

Repository layout:
```
client/               React + Vite + MapLibre app
  public/data/        Processed GeoJSON per county and layer, plus boundaries/ and manifest.json (committed)
server/               Express API: accounts, notes, markers, geocoding proxy
  data/               SQLite database and photo uploads (gitignored)
shared/               County config, layer definitions, Zod schemas
data-pipeline/        Download and processing scripts
  raw/                Downloaded source files (gitignored)
Reference-MD-Files/   Docs from the earlier (artifact) version
```

Environment variables live in `.env` at the repo root (never committed) and are documented in `.env.example` (committed): `CLIENT_PORT` and `CLIENT_HOST` (Vite dev server; set `CLIENT_HOST=0.0.0.0` to test on a phone over Wi-Fi), `PORT` and `HOST` (API server), `DATABASE_PATH`, `UPLOADS_DIR` (paths relative to the repo root), `VITE_API_URL`, `GEOCODER_USER_AGENT` (also sent by the data pipeline to Overpass and Wikipedia; when empty, a generic app name is sent), `MAP_DATA_DIR` (where the server reads the county boundaries for address search), `NOMINATIM_URL` and `CENSUS_GEOCODER_URL` (default to the public services), and `APP_URL`, `TRUST_PROXY` and `SETUP_CODE` (see User Authentication; all optional on your own PC). The client's `vite.config.ts` sets `envDir` to the repo root. The client calls `/api` on its own origin and the Vite dev and preview servers forward it to `PORT`, so leave `VITE_API_URL` empty unless the API is hosted elsewhere.

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
npm run db:backup                    # copy the database to server/data/backups/hunt-<date>-<time>.db; run before a schema change
npm run db:generate -w server        # generate a migration after changing server/src/db/schema.ts
npm run auth:reset -- --user first.last  # print a new temporary password for a user (how the super admin gets back in)
npm run data:fetch -- --county lyon  # download raw source data for one county (or --all); cached, --force re-downloads
npm run data:fetch -- --all --skip osm  # leave out steps (osm, parcels, county-parks, register, ghost-towns), e.g. while Overpass is overloaded
npm run data:build -- --county lyon  # process raw data into client/public/data (county boundaries are always rebuilt)
```

## Implementation Notes
Decisions and pitfalls from earlier phases. Check these before changing the related code.

- **Versions:** TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TypeScript 7 yet. Other packages are on current majors: Vite 8, React 19, MapLibre 6, Zustand 5, Vitest 5, ESLint 10.
- **Workspace packages** are named `@hunt/shared`, `@hunt/client`, `@hunt/server`, and `@hunt/data-pipeline`. `@hunt/shared` exports its TypeScript source directly (`exports: ./src/index.ts`) and has no build step. Vite and tsx compile it on the fly; the server runs under `tsx watch` in development and `server/build.mjs` bundles it with esbuild for production (shared bundled in, npm dependencies external).
- **Server:** Express 5 with better-sqlite3 and Drizzle (`server/src/db/schema.ts`, migrations committed in `server/drizzle/`). `createApp(db)` in `server/src/app.ts` takes the database, so tests use an in-memory one with Supertest. `npm run db:backup` (`server/src/db/backup.ts`) uses SQLite's online backup, so it is safe while the server runs and writes one self-contained file. Request bodies are parsed with the Zod schemas in `shared/src/markers.ts`; `errors.ts` turns Zod errors into 400s. With `NODE_ENV=production` the server also serves `client/dist`. Responses over 1 KB are gzipped by the `compression` middleware, which cuts Washoe streets from 10.4 MB to 1.7 MB on the wire; `npm run dev` serves the client through Vite, so this applies only to `npm run start`.
- **MapLibre worker:** MapLibre 6 builds its worker URL at runtime, so Vite doesn't serve or bundle the worker. `client/src/map/MapView.tsx` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?url` and calls `setWorkerUrl()`. Without that, vector tiles (the Streets basemap) and every GeoJSON layer stay blank, while the raster basemaps still draw.
- **Map overlay:** everything drawn on top of the basemap is defined in `client/src/map/overlay.ts` (counties) and `client/src/map/dataLayers.ts` (data layers and custom markers), with ids prefixed `hunt-`. A `transformStyle` hook re-adds it on every `setStyle`, so switching basemaps keeps it; `MapView` tracks which features each source holds and re-sends data that arrived while a style was loading. State changes (selection, theme, label size, layer toggles) go through `applyOverlayState()`. Hover uses feature-state (`promoteId: 'id'`). Add new layers the same way.
- **Map icons** are drawn on a canvas by `client/src/map/icons.ts` through `map.setMissingStyleImageResolver()`; the icon id encodes shape, color and size. (The older `styleimagemissing` event still draws them, but MapLibre 6 logs a warning for every icon.)
- **Layer data:** `client/src/layerData.ts` decides which `<county>/<layer>.geojson` files to load (TanStack Query, cached for the session). Light layers load when on; heavy layers (streets, land) load for the selected county or once zoomed in to their `minzoom` over a county. "Over a county" is `countyInView()`, which tests the outline, not the bounding box: around Reno five counties' boxes overlap the same view. A selected county loads all its layers for the place list. Popups look up the land owner from the county's land layer. At the full-map level no streets are loaded (all eight counties' street files total about 29 MB), so anything that needs every road can't rely on the loaded layers; search uses the search index instead.
- **Map clicks:** with a county isolated, any click outside it, including on another county, returns to the full view.
- **State:** `client/src/state/store.ts` (Zustand). Display settings (basemap, theme, label size) and layer toggles are saved in localStorage under `hunt-map-settings`; new layers default to on (land ownership defaults to off). Selection is not saved. Server data (custom markers) goes through TanStack Query hooks in `client/src/api.ts`.
- **Keyboard:** Esc closes an open popup first, then cancels marker placement or "Put on map", then clears a search pin or road highlight, then returns to all counties. In the search box, Esc clears the search; in the notebook editor, it closes the `[[` suggestions, then finishes editing.
- **Search index:** `data-pipeline/src/search-index.ts` writes `<county>/search.json` from the finished layers: every named place except land (`placeItems()` in `shared/src/places.ts`, the same merge-by-name the county place list uses), plus one `route` entry per route number per county spanning all its pieces. The client loads all eight the first time the search results show (`client/src/search/useSearchIndex.ts`, about 3.6 MB uncompressed) and builds a MiniSearch index. `searchPlaces()` in `client/src/search/searchIndex.ts` is pure and tested: coordinates first, then route numbers, then text (all words must match, with a typo-tolerant retry), plus the user's markers.
- **Coordinates and routes** are parsed in shared code: `parseCoordinates()` (decimal, degrees-minutes, DMS; swapped pairs and a missing W are corrected for Nevada) and `canonicalRoute()` (`NV-341`, `Hwy 50`, `Interstate 80` become `SR 341`, `US 50`/`SR 50`, `I-80`, matching how OSM tags them).
- **Search results on the map:** a place or marker goes through `focusFeature`. A street or route also sets `highlight` in the store, which loads that county's streets and draws a glow (`hunt-streets-highlight`, ids from `client/src/search/highlight.ts`); a route spanning counties flies to its extent without a popup. Coordinates and addresses set `pin`: a map pin with a popup showing the land owner, what's at the spot (`nearbyPlaces()`), and "+ Marker here". Picking a result outside an isolated county returns to the full view.
- **Address search:** `GET /api/geocode?q=` (`server/src/geocode.ts`, `server/src/geocoder.ts`). Nominatim first (bounded to the hunt area), the Census geocoder if Nominatim finds nothing in the counties or fails. Results outside the eight counties are dropped by point-in-polygon. Requests to either service go out one at a time, at least a second apart. Answers (including "nothing found") are cached in the `geocode_cache` table; failures aren't. The client only calls it on Enter or the "Look up … as an address" button, never as you type.
- **Notebook text rules** are shared (`shared/src/notebook-text.ts`) so the server and client read pages alike: `tokenizeInline()` (links, `#tag`/`#[[Two Words]]`, URLs, bold), `nameKey()` (the form names compare in: case, accents and punctuation ignored), `parseLinks()`, `renameLinks()`, and `findNames()` for plain-text mentions (longest match first; skips text already linked; `capitalizedSingleWords` stops one-word map names like "Spring" matching every spring in an article, used by capture).
- **Notebook data:** tables `pages`, `place_notes`, `photos`, `comments` and `links` (migrations `0002_notebook`, `0003_auth`). Comments are link sources too (kind `comment`); deleting a page or note deletes its comments (`deleteCommentsOn`). Notes on a custom marker use the place id `marker:<id>`. A page's title is unique by `nameKey`, so `[[fort churchill]]` and `[[Fort Churchill]]` are one page. `links` is derived: parsed on every save of a page, place note or marker description (`server/src/notebook/sources.ts`), and rebuilt from all texts by `reindexLinks()` when `createApp` starts and after a restore. A rename rewrites the links in every text that links to the old name. Notes and pages refer to map places by stable feature id plus a copy of the name, layer and location, so they show without the layer loaded.
- **Notebook API:** `/api/pages` (`POST /open` gets or creates a page by name; opened from a place, it returns the page tied to that place first, and numbers the title when another place already has a page by that name), `/api/pages/:id/references` (linked and unlinked), `POST /api/references/link`, `POST /api/pages/:id/link-names` (capture), `/api/notes`, `GET /api/places/notebook?id=&name=` (a popup's "In your notebook"), `/api/photos` (the image is the raw request body; the client shrinks it to 2048 px JPEG first). `/api/comments`. `/api/export/notebook.md`, `/api/backup` and `/api/restore` are mounted before the 1 MB JSON parser; a restore checks it's the super admin before reading the body, then copies the database to `server/data/backups/*-before-restore.db`. Backups (version 2) carry `authors` (id, username, names); a restore maps them to the current users by username, and a version 1 backup's content goes to the super admin. `createApp` takes `uploadsDir`, `backupDir`, `setupCode`, `appUrl` and `trustProxy`.
- **Notebook client** (`client/src/notebook/`): `NotebookProvider` supplies pages, notes and map place names (built from the search index, which `useSearchIndex` now builds once and shares with search). The Notebook tab is the side-by-side mode (the panel widens); "Full view" hides the map (`notebookFull` in the store). Anything that flies to a place from the notebook goes through `goToPlace()`, which leaves the full view and an isolated county. The map draws `notebookFeatures()` in the `hunt-notebook` source: rings around places pages are about (`hunt-notebook-rings`, the outline toggle) and page icons for "Put on map" (`hunt-notebook-spots`). "Put on map" is `placingPage` in the store; the map click calls `onPlacePage`.
- **Browser tests and the real notebook:** run the dev server against a scratch database (`cross-env SETUP_CODE=TEST-CODE-2026 DATABASE_PATH=<scratch>/test.db UPLOADS_DIR=<scratch>/uploads npm run dev`) so test pages and test accounts don't land in the user's database. A walkthrough that starts with setup needs a fresh database each run: stop the server (and its orphaned children, see Dev servers on Windows), delete the scratch folder, start again. Wrong-password steps lock that username for 15 minutes. `vite preview` uses `CLIENT_PORT` too, so with the dev server running it moves to the next port (or pass `--port`). helmet's Content Security Policy only reaches the browser from `npm run start` (Vite serves the page in dev and preview), so check the map there too after changing the policy or adding a tile host (`TILE_HOSTS` in `server/src/app.ts`).
- **Auth server code** (`server/src/auth/`): `passwords.ts` (scrypt, temporary passwords, the setup code), `sessions.ts` (`authenticate`, `requireUser`, `me(req)`, the `sameOrigin` check), `limits.ts` (rate limits and the audit log), `accounts.ts` (usernames, temporary passwords, the strength check), `routes.ts` (`/api/auth`: status, setup, sign-in and out, password), `permissions.ts` (`assertCanEdit`), `reset-cli.ts`. User management is `server/src/users.ts` (`/api/users`, `/api/audit`). In `createApp` the order matters: helmet, compression, `sameOrigin`, `authenticate`, `/api/health`, `/api/auth`, then `requireUser` for everything else under `/api`, then the archive routes, then the JSON parser. The permission rules themselves are shared (`shared/src/users.ts`), so the client hides exactly what the server refuses.
- **Auth client code** (`client/src/account/`): `AuthGate` wraps the app in `main.tsx` and shows setup, sign-in or "Choose a new password" until there's a signed-in user, then provides `AccountContext` (the user and everyone's names). `useCanEdit(createdBy)` and `useAuthorName(id)` are what components use; outside an `AuthGate` (component tests) everything is editable. Signing in or out removes every cached query except the auth status (`client.clear()` would detach the screen watching it). A 401, or a 403 with code `password-change-required`, from any query rechecks the status, which brings back the sign-in screen. Queries refetch when the window regains focus, so others' changes show up; the map data is cached for the session and doesn't.
- **Sign-in background:** `client/public/images/sign-in-background.jpg` is USGS Imagery Topo (public domain) at zoom 11 around 39.35, -119.6 (Reno to Lahontan Reservoir, Lake Tahoe to the Pine Nuts), 1920×1200, stitched from the basemap's tiles and saved as JPEG at quality 68. The setup, sign-in and new password screens show it under a dark scrim, with a USGS credit in the corner.
- **Password strength** is `@hunt/shared/password-strength`, a separate entry point: zxcvbn's dictionaries are about 1.7 MB, so the client loads them only on screens that set a password (`usePasswordChecker()`), and the server bundles them. Tests hash with `lowerPasswordCostForTests()`; `server/test/helpers.ts` `testApp()` sets up a super admin (Sam Owner) and `addUser()` adds signed-in members and admins.
- **Vite proxy and the origin check:** the `/api` proxy uses `changeOrigin: false` so the API sees the host the browser used. Vite's string shorthand sets `changeOrigin: true`, and then every change from the browser is refused as cross-site.
- **Page versions:** `pages.version` goes up only when the body changes (an edit, a rename's relinking, "Link", capture). Saves of the text send `baseVersion` (`useSavePageText`, one at a time per page); an older one gets 409 `page-changed` with the current page, and `PageView` shows "This page changed".
- **Basemap icons:** the icon resolver gives icons that OpenFreeMap's sprite lacks (`gate`, `office`) a blank image, which stops MapLibre's console warnings.
- **Tests:** the root `vitest.config.ts` defines a project per workspace, and client tests run in jsdom. MapLibre can't run in jsdom, so test the pure style builders in `overlay.ts`, the store, and the components. Check the map itself in a browser (see the phase workflow).
- **Line endings:** `.gitattributes` forces LF. Git for Windows ships with `core.autocrlf=true`, which checks files out with CRLF, and then `prettier --check` fails on every file.
- **Shell quirk:** heredocs in the Bash tool can collapse `\\` to `\`, and can break on quote-heavy text such as CSS. Write files that contain backslashes, such as regexes, with the Write or Edit tool.
- **Drive letter case:** run npm scripts from `E:\ClaudeVibeCoding-NevadaDayTreasureHunt` with a capital `E:`. Started from `e:\` (as a session can be after a reboot), Vitest loads itself twice under the two spellings and every test file fails with "Cannot read properties of undefined (reading 'config')" or "Invalid Chai property".
- **Dev servers on Windows:** stopping an `npm run dev`, `vite preview` or `npm run start` background task leaves its Vite, `tsx watch` or `node dist/index.js` children running, so the next start moves to 5174, 5175, and so on, and a stale preview keeps port 4180. `netstat` from the Bash tool doesn't show them. After stopping a task, list them in PowerShell with `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'vite|tsx|dist[\\/]index' }` and stop them with `Stop-Process`.

## Known Gaps from the Earlier Version
Address these where practical, but don't hold up a phase for them.
- No satellite basemap: fixed by the USGS Imagery basemap (done in Phase 1).
- Parcels reflect 2018 ownership: Lyon and Washoe now use current county services (done in Phase 3). The other six counties still use the 2018 statewide file.
- The Lincoln Highway layer is partial.
- Building outlines are missing: Microsoft's US building footprints are a possible future layer.
- Notebook link-finding only matched exact spellings of map names: names now compare ignoring case, accents and punctuation (`nameKey()`, done in Phase 5).
