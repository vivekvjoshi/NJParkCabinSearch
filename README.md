# NJ Site Finder

Search all 18 New Jersey state parks on njportal.com for available campsites, cabins,
lean-tos and shelters in one shot — with filters, a weekend-recommendation mode, and
optional natural-language search. The official site only lets you check one park at a time.

## Run it

```bash
npm install
npx playwright install chromium   # first run only
npm start                         # → http://localhost:3000
```

## Natural-language search (optional)

Put your NVIDIA API key in `.env`:

```
NVIDIA_API_KEY=nvapi-...
```

Restart the server, then type things like *“cabin for 4 with showers over a July weekend”*
into the search bar. The query is parsed by `nvidia/nemotron-3-ultra-550b-a55b` via NVIDIA's
OpenAI-compatible API into structured filters, which then drive the normal live search.

## How it works

- `src/njoutdoors.js` — headless Playwright Chromium loads each park's Details page and calls
  the site's own `ListSiteAvailabilityJson` API from inside the page. Toilet type / area /
  access are scraped from the page DOM and cached in `data/catalog-<id>.json` (7-day TTL).
- `src/server.js` — Express server with `GET /api/meta`, `GET /api/search` (SSE),
  `GET /api/recommend` (SSE, grades every weekend of a month), `POST /api/nl`.
- `public/` — vanilla HTML/CSS/JS frontend, Kayak-inspired design. Weekend finder is the
  default mode and **Cabin is the default site type**.

Availability data is scraped live — always confirm on the official booking page.
Peak season (mid-June–Labor Day): cabins/lean-tos/shelters can only be booked 7 or 14 nights
starting on a fixed weekday that varies by park.
