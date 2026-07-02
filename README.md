# NJ Park Site Finder

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

## Deploy to Netlify

The repo doubles as a Netlify site: `public/` is served statically and the API lives in
`netlify/functions/` (`/api/meta`, `/api/park`, `/api/nl`). On Netlify the frontend detects
serverless mode (`meta.serverless`) and fans out one fetch per park instead of using SSE;
scraping runs on `playwright-core` + `@sparticuz/chromium-min` inside the function — the
Chromium binary itself is downloaded to `/tmp` at runtime from the Sparticuz release pack,
so function bundles stay small.

⚠️ **Don't deploy by drag-and-drop.** Function bundling needs `node_modules` present, which
drag-and-drop uploads lack (symptom: `/api/park` returns `Cannot find module ...`). Deploy
with the CLI from the project directory (or connect the repo to GitHub for CI builds):

```bash
npx -y netlify-cli login
npx -y netlify-cli link      # pick the existing site (or: netlify init)
npx -y netlify-cli deploy --prod
```

Then in the Netlify dashboard (Site configuration → Environment variables) set:

- `NVIDIA_API_KEY` — enables natural-language search (optional)
- `CHROMIUM_PACK_URL` — optional override for the Chromium pack download URL
  (defaults to the official `@sparticuz/chromium` v149 release pack matching the
  function's architecture)

Notes for the serverless deployment:

- Each `/api/park` call loads one park and must finish inside the function time limit
  (10s default, raise to 26s in Site configuration → Functions if searches time out).
- Catalog caches live in `/tmp` and only survive while the function stays warm, so
  cold requests re-scrape the park page (adds ~1s).

## Disclaimer

Availability data is scraped live — always confirm on the official booking page.
Peak season (mid-June–Labor Day): cabins/lean-tos/shelters can only be booked 7 or 14 nights
starting on a fixed weekday that varies by park.
