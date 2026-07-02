# NJ Park Site Finder

Search all 18 New Jersey state parks on njportal.com for available campsites, cabins,
lean-tos and shelters in one shot — with filters, a weekend-recommendation mode, and
optional natural-language search. The official site only lets you check one park at a time.

Built with **Next.js (App Router)**. No browser automation: everything is plain HTTP,
so it runs anywhere Node runs — including small serverless functions.

## Run locally

```bash
npm install
npm run dev        # → http://localhost:3000
# or production mode: npm run build && npm start
```

## Natural-language search (optional)

Put your NVIDIA API key in `.env` (Next.js loads it automatically):

```
NVIDIA_API_KEY=nvapi-...
```

Then type things like *“cabin for 4 with showers over a July weekend”* into the search bar.
The query is parsed by `nvidia/nemotron-3-ultra-550b-a55b` via NVIDIA's OpenAI-compatible
API into structured filters, which then drive the normal live search.

## How it works

- `src/njoutdoors.js` — scraper core, pure HTTP. One GET of a park's Details page yields
  the session cookies, the ASP.NET anti-forgery token, and the HTML that's parsed for the
  per-site catalog (toilet type / area / access, cached 7 days in `data/` locally or `/tmp`
  on serverless). Availability comes from the site's own
  `POST /DEP/NJOutdoors/Park/ListSiteAvailabilityJson` endpoint with those credentials —
  a park check takes ~1–2 seconds.
- `app/api/` — route handlers: `meta` (parks/types/features), `park` (checks **one park
  per request**; `mode=search` or `mode=recommend` grades every weekend of a month), and
  `nl` (natural-language parsing, `src/nl.js`).
- `app/page.js` — the UI (Kayak-inspired, forest-green). Weekend finder is the default
  mode, **Cabin is the default site type**, and the flush-toilets filter starts on. The
  frontend loops over selected parks, calling `/api/park` once per park with live progress.

## Deploy to Netlify

Connect the repo to GitHub and add the site in Netlify (every push then deploys through
CI), or deploy from this directory with the CLI:

```bash
npx -y netlify-cli login
npx -y netlify-cli link          # pick your existing site
npx -y netlify-cli deploy --prod --build
```

`netlify.toml` already sets `npm run build` + the `@netlify/plugin-nextjs` runtime.
In the Netlify dashboard (Site configuration → Environment variables) set
`NVIDIA_API_KEY` to enable natural-language search.

## Disclaimer

Availability data is scraped live — always confirm on the official booking page.
Peak season (mid-June–Labor Day): cabins/lean-tos/shelters can only be booked 7 or 14
nights starting on a fixed weekday that varies by park.
