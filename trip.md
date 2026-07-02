# Prompt: Build "NJ Site Finder" — a local web UI for NJ state park campsite search

Copy everything below this line into Claude Code (or any coding agent) in an **empty folder** on the target machine.

---

Build me a complete, working local web app called **NJ Site Finder** that searches all 18 New Jersey state parks on njportal.com for available campsites/cabins, with filters and a weekend-recommendation mode — because the official government site only lets you check one park at a time. Build everything, verify it end-to-end against the live site, then `git init` and commit the finished project.

## Tech stack (keep it simple)

- Node.js, CommonJS (`"type": "commonjs"`), no TypeScript, no build step
- Dependencies: `express`, `playwright` only
- After `npm install`, run `npx playwright install chromium` (fresh machines lack browser binaries)
- Structure: `src/njoutdoors.js` (scraper library), `src/server.js` (Express server), `public/index.html` + `public/app.js` + `public/styles.css` (vanilla frontend), `data/` (caches, gitignored)
- `npm start` → server on `http://localhost:3000`

## Everything already reverse-engineered (verified live 2026-07-02 — do NOT rediscover, just implement)

### Parks (locationId → name)

2 Allaire, 3 Bass River, 4 Belleplain, 5 Brendan T Byrne, 6 Cheesequake, 7 High Point, 8 Jenny Jump, 10 Parvin, 11 Round Valley, 12 Spruce Run, 13 Stephens, 14 Stokes, 15 Swartswood, 16 Voorhees, 17 Washington Crossing, 18 Wawayanda, 19 Wharton, 20 Worthington. (No 9.)

### Session setup (required before any API call)

Load `https://www.njportal.com/DEP/NJOutdoors/Park/Details?locationId=<id>` in headless Playwright Chromium (`waitUntil: 'networkidle'`, UA string of a normal Chrome on Windows). All API calls must be made **from inside the page** via `page.evaluate(fetch(...))` so cookies apply, with header `X-Requested-With: XMLHttpRequest` and `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`.

### The one API that matters: `POST /DEP/NJOutdoors/Park/ListSiteAvailabilityJson`

This is what the site's own "Availability View" calls. Form body:

```text
locationId=<id>
fromDate=MM/DD/YYYY            (start of the 30-day window)
limitTypes=8,7                 (csv of site-type IDs; multiple allowed in one call)
limitFeatures=14,9             (csv of feature IDs; empty string = no feature filter)
trailerLength=  peopleSupported=  vehiclesSupported=   (empty strings are fine)
__RequestVerificationToken=<value of form input[name=__RequestVerificationToken] on the page>
```

Response: `{ success: true, sites: [ { SiteDetails: { SiteId, Name, ShortName, ResidentCost, NonResidentCost, MaxPeople, TrailerLength, SiteTypes: [{TypeId, Name}] }, Dates: [30 entries] } ] }`.
`Dates[i]` = fromDate + i days (`Date` is .NET `/Date(ms)/` format), each with booleans `Arrival, Booked, ClosedSeasonal, ClosedNonSeasonal, Locked, Unavailable, Inactive`.

**A site is available for an N-night stay ⇔ for nights 0..N-1 none of `Arrival|Booked|ClosedSeasonal|ClosedNonSeasonal|Locked|Unavailable` is true** (this is exactly how the site's grid paints a day green). If the response redirects or isn't JSON, treat as an error for that park — never as "all available".

⚠️ Do NOT use the older `SiteFilter` / `SiteRangeUnavailability` endpoints with params like `typeFilters` — that request format died in a mid-2026 site update (302 → error page). If `ListSiteAvailabilityJson` ever breaks, fetch `Scripts/App/parkDetails.js` from the site and read its `populateAvailView()` to see the current format.

### Site-type IDs (checkboxes `input.type-filter`, value = ID)

1 Cabin, 2 Lean-To, 3 Shelter, 5 Group Campsite, 6 Pet Friendly, 7 Trailer, 8 Tent. Each park has a subset — scrape the page's `.type-filter` checkboxes + labels per park.

### Feature IDs (checkboxes `input.feature-filter`, attribute `featureid`)

1 ADA Accessible, 2 ADA Required, 3 Batona Trail, 4 Boat Access, 5 Driveway, 6 Electricity Access, 7 Elevated Cooking, 8 Elevated Platform, 9 Fire Ring, 10 Horseback Riding Trail, 11 Lantern Hooks, 13 Picnic Tables, **14 Shower Access**, 15 WiFi Access, 16 Water Hookup, 17 Electric 30 Amp, 18 Electric 50 Amp.

### Toilet type is NOT in the API

Scrape it from the loaded Details page DOM: each `.location-site` row's text contains `Toilets: Flush|Pit|None` (plus `Area: ...`, `Site Access: ...`). Key by the row's `site` attribute (= SiteId). Cache per park in `data/catalog-<id>.json` with a 7-day TTL, together with that park's scraped type/feature checkbox lists.

### Booking-rule facts for the UI

- Peak season (mid-June–Labor Day): **cabins/lean-tos/shelters can only be booked 7 or 14 nights starting on a fixed weekday that varies by park** (usually Saturday). Show a warning banner whenever a cabin/lean-to/shelter/yurt type is selected, and when a cabin weekend search returns nothing, explain this rule and suggest Tent/Trailer. The per-day `Arrival` flag encodes most of it, but tell users to confirm at checkout.
- Always show a footer disclaimer: data is scraped live; confirm on the booking page. Each park result must link to its `Park/Details?locationId=<id>` page.

## App behavior

**Server** (`src/server.js`) — three endpoints, searches serialized (one shared browser):

- `GET /api/meta` → parks list, union of types/features from cached catalogs (fall back to the ID tables above)
- `GET /api/search?parks=3,10&date=2026-07-10&nights=2&types=8,7&features=14&flushOnly=1&minPeople=4` → **Server-Sent Events** stream: `start`, `park_start`, `park_result` (one per park as it completes), `done`, error events
- `GET /api/recommend?parks=3,10&month=2026-07&types=1&features=&flushOnly=0&minPeople=0&arrival=5` → SSE stream that grades **every weekend in the month**. `arrival` = weekday 4/5/6 (Thu/Fri/Sat); **checkout is always Sunday**, so nights = 3/2/1. Skip arrival dates in the past.

**Specific-date search flow per park** (sequential over parks, ~600ms politeness delay):

1. New browser context → load park page → build/load catalog.
2. Skip requested types the park doesn't have.
3. One `ListSiteAvailabilityJson` call with selected types + features. If Shower Access (14) isn't already a selected filter, make one extra call with it added to tag which results have showers.
4. Filter client-side: `flushOnly` (catalog toilets), `minPeople` (MaxPeople ≥ n). Compute availability from the Dates flags for the requested nights.
5. Result per site: siteId, ShortName, Name, types joined, maxPeople, cost (`$X NJ res / $Y non-res per night`), area/access/toilets from catalog, `flush` and `shower` booleans. Sort flush+shower first.

**Weekend recommender flow per park**: same setup, but fetch **two 30-day windows** (fromDate = 1st and 16th of the month, clamped to today; dedupe if equal) and merge each site's Dates into a map keyed by ISO date — this covers stays starting up to the 31st. Then for each candidate weekend (every matching weekday in the month), a site counts if all its stay-nights are flag-free. Return `[{ arrival, checkout, nights, totalSites, parks: [{park, bookUrl, sites}] }]` for ALL weekends (including empty ones) sorted by date.

**Frontend** (`public/`, clean forest-green design, checkbox pills, no frameworks; the main "Search availability" button is campfire orange — define it as CSS variables `--cta: #e07a1f` / `--cta-dark: #c96a15` so it's easy to retheme):

- **Mode toggle, Weekend finder is the default mode**: month dropdown (this month + next 6), weekend style dropdown (Fri→Sun 2 nights default / Sat→Sun 1 night / Thu→Sun 3 nights — checkout always Sunday), min people. In weekend mode **Cabin is the default site type**.
- Specific-date mode: arrival date (min = today), nights 1–14 (default 2), min people.
- Shared filters: site-type pills, feature pills (+ a special "🚽 Flush toilets" pill), park pills with all/none links (all on by default), cabin min-stay warning banner tied to selected types.
- On search: progress bar + status line driven by the SSE events; specific-date results render incrementally.
- Weekend results: summary banner naming the best weekend (or the cabin-rule explanation when empty), then one card per weekend — "🗓️ Fri Jul 10 → Sun Jul 12 · 2 nights · N site(s) across M park(s)" — each with park sub-sections (name, count, Book ↗ link, up to 4 site rows, "…and N more").
- Specific-date results: summary banner, one card per park sorted by available count — header "X of Y matching site(s) available" + Book ↗; up to 8 site rows with name, meta (area · access · max ppl · cost) and badges (type, 🚽 Flush, 🚿 Shower).
- Escape all scraped strings before injecting into HTML.

## Acceptance test (do this before declaring done)

1. `npm start`, then `curl` the **search** endpoint for Parvin (10), a Friday 1–3 weeks out, 2 nights, `types=8,7&flushOnly=1` — expect SSE ending in `done` with non-zero `availableCount` and sites tagged `"flush":true` (Parvin's Jaggers Point area has ~31 flush tent/trailer sites; ~20+ typically free).
2. `curl` the **recommend** endpoint for parks 3,10, the current month, `types=8,7` — expect one entry per remaining weekend with plausible `totalSites` (holiday weekends noticeably lower).
3. Drive the UI with Playwright: confirm weekend mode is default with Cabin pre-selected and the warning banner visible; run a weekend search on 2 parks; screenshot; confirm weekend cards render and no console errors.
4. `git init`, add a `.gitignore` (node_modules, data/), commit everything.

---

*Prompt written 2026-07-02 from a working implementation. That day: Parvin 21/31 tent/trailer flush sites free for Jul 10 (2 nights), Bass River 35/43; July weekend scan across those two parks: Jul 3–5 = 15 sites (holiday), Jul 17–19 = 66 sites.*
