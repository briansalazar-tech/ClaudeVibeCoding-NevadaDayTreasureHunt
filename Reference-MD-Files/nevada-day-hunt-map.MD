# Nevada Day Hunt Map

**Open the map:** https://claude.ai/artifact/DuJnE7XvcMjKKDXZxDRgjN

A private scouting map for the Nevada Day Treasure Hunt covering eight counties: Washoe, Douglas, Carson City, Storey, Lyon, Pershing, Churchill and Mineral. Built Oct 23–24, 2026; field notebook added Oct 29, 2026. How the data was gathered and how to rebuild it next year: see `hunt-map-data-sources.md` in this project.

## What's on it
- **Land:** BLM land-status shading by agency (BLM, Forest Service, State, Reclamation, Fish & Wildlife, NPS, tribal, military, DOE, private), plus 2018 parcels owned by counties, cities, towns, GIDs, state, school districts and HOAs
- **Roads:** paved highways, local streets, dirt roads and 4x4 tracks, gravel roads
- **History:** 137 official state historical markers (linked to HMdb and state marker pages), 420 more HMdb markers, ~210 National/State Register sites, 36 ghost towns, ruins, mines, other historic sites
- **Historic trails:** California Trail, Pony Express, Lincoln Highway (partial)
- **Parks & recreation:** OSM parks plus Washoe County's official park list, playgrounds, dog parks, picnic sites, reserves, sports fields
- **Nature:** peaks, ~1,800 USGS named canyons/valleys/flats/landforms, springs, hot springs, lakes, rivers, creeks, trails, trailheads, viewpoints
- **Past finds:** 2026 medallion at Virginia City Highlands Park (Storey County parcel)

## Field notebook (Roam-style research repository)
Open it with the **Notebook** tab at the top of the side panel (on a phone, the Notebook button at bottom left). The map stays live beside it.
- **Pages and links:** type `[[Name]]` to link a page (it's created on first click) or `#tag`. Every page lists its *Linked references* (other pages, pins and map notes that link to it) and *Unlinked references* (plain-text mentions you can link with one click). Renaming a page updates links to it.
- **Tied to the map:** any link whose name matches a named place on the map (towns, markers, ghost towns, canyons, springs, etc.) gets a small pin; tap it to fly there and open the place's popup. Pages about map places are outlined on the map in blue (toggle at the bottom of the notebook home). Place popups show "In your notebook" with the pages that mention that place, or "+ Notebook page for this place".
- **Places that share a name:** the page lists each match with "This one" to tie the page to the right spot. "Put on map" drops any page (a person, a clue, an off-map place) on a spot; it then shows as a blue page icon.
- **Capture:** "+ Capture" takes a pasted article (title, type, source link, text). After saving, it finds map place names and existing page names in the text and offers to link them. "Find people & places with Claude" also suggests people, off-map places, topics, a summary and key dates; chosen people, places and topics get their own pages.
- **Page types:** Article, Person, Place, Clue, Topic, Note, Daily note ("Today" opens a dated page). Filter by type on the notebook home.
- **Editing:** `- ` bullets, Tab/Shift+Tab to indent, `# Heading`, `> quote`, `**bold**`; web links shorten automatically. Typing `[[` opens suggestions from your pages and map places. Photos can be attached to pages.
- **Search and export:** the main map search also finds notebook pages. "Export notebook (.md)" saves everything as one Markdown file.
- **Storage:** synced to the Claude account in a private per-user area of the map's database; only the owner can see it. Opened outside the Claude account, pages stay in that browser only.

## How to use the map
- **Counties:** tap a county (side panel or on the map) to zoom in and isolate it; ‹ › steps through counties; click outside or "← All counties" to go back
- **County list:** the right-hand panel lists every named place in the selected county, grouped and searchable
- **Search:** finds places, roads and route numbers (SR 341, US 50, I-80), notebook pages, and text inside your own pins and notes
- **Popups:** land owner at that spot, coordinates, satellite view and directions links, HMdb/state marker/Wikipedia links, notebook pages about the place
- **Pins & notes:** drop pins with a status (To check, Clue fits, Checked, Dead end); add notes and photos to any place; `[[links]]` in pin and map notes also count as notebook references; everything syncs to your Claude account
- **Display:** label size S–XL and light/dark theme in the side panel

## Known gaps
- No satellite basemap (use the Satellite view link in popups)
- Parcels reflect 2018 ownership; Lincoln Highway layer is partial
- A few ghost towns and register sites have no confirmed location ("Not on the map" section); 13 archaeological register sites are confidential by design
- Building outlines not added (Overpass download limits); Microsoft's Nevada building footprints are a possible future layer
- Notebook link-finding only matches names spelled the way the map spells them; the Claude option catches variants and adds them in a "Related" line
