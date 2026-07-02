const fs = require('fs');
const path = require('path');
const express = require('express');
const nj = require('./njoutdoors');

// ---------- tiny .env loader (no extra dependency) ----------
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env — natural-language search will be disabled */
}

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ----------

function csvInts(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n));
}

function sseStart(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': stream open\n\n');
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One shared browser; all scraping requests run one at a time.
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

function parseCommonParams(q) {
  const allParks = Object.keys(nj.PARKS).map(Number);
  let parks = csvInts(q.parks).filter((id) => nj.PARKS[id]);
  if (!parks.length) parks = allParks;
  return {
    parks,
    types: csvInts(q.types),
    features: csvInts(q.features),
    flushOnly: q.flushOnly === '1' || q.flushOnly === 'true',
    minPeople: parseInt(q.minPeople, 10) || 0,
  };
}

// ---------- GET /api/meta ----------

app.get('/api/meta', (req, res) => {
  const { types, features } = nj.metaFromCatalogs();
  res.json({
    parks: Object.entries(nj.PARKS).map(([id, name]) => ({ id: Number(id), name })),
    types,
    features,
    minStayTypeIds: nj.MIN_STAY_TYPE_IDS,
    showerFeatureId: nj.SHOWER_FEATURE_ID,
    today: nj.todayISO(),
    nlEnabled: Boolean(NVIDIA_API_KEY),
  });
});

// ---------- GET /api/search (SSE) ----------

app.get('/api/search', (req, res) => {
  const common = parseCommonParams(req.query);
  const date = String(req.query.date || '');
  const nights = Math.min(14, Math.max(1, parseInt(req.query.nights, 10) || 2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  sseStart(res);
  let closed = false;
  req.on('close', () => (closed = true));

  enqueue(async () => {
    const started = Date.now();
    sse(res, 'start', { parks: common.parks, date, nights, total: common.parks.length });
    let availableCount = 0;
    let parksWithSites = 0;
    for (let i = 0; i < common.parks.length; i++) {
      if (closed) return;
      const locationId = common.parks[i];
      sse(res, 'park_start', { locationId, park: nj.PARKS[locationId], index: i, total: common.parks.length });
      try {
        const result = await nj.searchPark({ locationId, date, nights, ...common });
        availableCount += result.sites.length;
        if (result.sites.length) parksWithSites++;
        sse(res, 'park_result', result);
      } catch (err) {
        sse(res, 'park_result', {
          locationId,
          park: nj.PARKS[locationId],
          bookUrl: nj.detailsUrl(locationId),
          error: String(err.message || err),
          sites: [],
          totalMatching: 0,
        });
      }
      if (i < common.parks.length - 1) await sleep(600);
    }
    sse(res, 'done', { availableCount, parksWithSites, elapsedMs: Date.now() - started });
    res.end();
  }).catch((err) => {
    if (!closed) {
      sse(res, 'error', { error: String(err.message || err) });
      res.end();
    }
  });
});

// ---------- GET /api/recommend (SSE) ----------

app.get('/api/recommend', (req, res) => {
  const common = parseCommonParams(req.query);
  const month = String(req.query.month || '');
  const arrival = parseInt(req.query.arrival, 10) || 5;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be YYYY-MM' });
    return;
  }
  if (![4, 5, 6].includes(arrival)) {
    res.status(400).json({ error: 'arrival must be 4 (Thu), 5 (Fri) or 6 (Sat)' });
    return;
  }

  sseStart(res);
  let closed = false;
  req.on('close', () => (closed = true));

  enqueue(async () => {
    const started = Date.now();
    const weekendTemplates = nj
      .weekendsInMonth(month, arrival)
      .filter((w) => w.arrival >= nj.todayISO());
    sse(res, 'start', { parks: common.parks, month, arrival, weekends: weekendTemplates, total: common.parks.length });

    // arrival ISO -> { arrival, checkout, nights, totalSites, parks: [] }
    const merged = new Map(
      weekendTemplates.map((w) => [w.arrival, { ...w, totalSites: 0, parks: [] }])
    );

    for (let i = 0; i < common.parks.length; i++) {
      if (closed) return;
      const locationId = common.parks[i];
      sse(res, 'park_start', { locationId, park: nj.PARKS[locationId], index: i, total: common.parks.length });
      try {
        const result = await nj.recommendPark({ locationId, month, arrival, ...common });
        let parkTotal = 0;
        for (const [arrivalISO, w] of Object.entries(result.weekends)) {
          const bucket = merged.get(arrivalISO);
          if (!bucket || !w.sites.length) continue;
          bucket.totalSites += w.sites.length;
          bucket.parks.push({
            locationId,
            park: result.park,
            bookUrl: result.bookUrl,
            count: w.sites.length,
            sites: w.sites,
          });
          parkTotal += w.sites.length;
        }
        sse(res, 'park_result', {
          locationId,
          park: result.park,
          skipped: result.skipped,
          totalSiteWeekends: parkTotal,
        });
      } catch (err) {
        sse(res, 'park_result', {
          locationId,
          park: nj.PARKS[locationId],
          error: String(err.message || err),
          totalSiteWeekends: 0,
        });
      }
      if (i < common.parks.length - 1) await sleep(600);
    }

    const weekends = [...merged.values()].sort((a, b) => a.arrival.localeCompare(b.arrival));
    for (const w of weekends) w.parks.sort((a, b) => b.count - a.count);
    sse(res, 'done', { weekends, elapsedMs: Date.now() - started });
    res.end();
  }).catch((err) => {
    if (!closed) {
      sse(res, 'error', { error: String(err.message || err) });
      res.end();
    }
  });
});

// ---------- POST /api/nl — natural-language query → structured search params ----------

function nlSystemPrompt() {
  const parks = Object.entries(nj.PARKS)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  const types = Object.entries(nj.SITE_TYPES)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  const features = Object.entries(nj.FEATURES)
    .map(([id, name]) => `${id}=${name}`)
    .join(', ');
  return `You convert a camper's natural-language request into search parameters for a New Jersey state park campsite finder. Today is ${nj.todayISO()}.

Park IDs: ${parks}
Site type IDs: ${types}
Feature IDs: ${features}

Respond with ONLY a JSON object, no prose, no markdown fences:
{
  "mode": "weekend" | "date",          // "weekend" = scan every weekend of a month; "date" = a specific arrival date
  "month": "YYYY-MM",                  // weekend mode only
  "arrival": 4 | 5 | 6,                // weekend mode only: arrival weekday Thu=4, Fri=5, Sat=6 (checkout is always Sunday); default 5
  "date": "YYYY-MM-DD",                // date mode only: arrival date (never in the past)
  "nights": 1-14,                      // date mode only; default 2
  "types": [ids],                      // site types; default [1] (Cabin) if the user doesn't clearly ask for something else
  "features": [ids],                   // only features the user explicitly asks for
  "flushOnly": true|false,             // true if they want flush toilets / "real bathrooms"
  "minPeople": 0,                      // party size if mentioned
  "parks": [ids],                      // empty array = all parks; fill only if specific parks/regions are named
  "note": "one short sentence explaining your interpretation"
}

If the request mentions a weekend, a month, or is vague about dates, prefer "weekend" mode. Map "showers" to feature 14, "electric" to 6, "waterfront/lake" to 4 (Boat Access), "wheelchair" to 1.`;
}

function extractJson(text) {
  // strip any reasoning/prose around the JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON in model response');
  return JSON.parse(text.slice(start, end + 1));
}

app.post('/api/nl', async (req, res) => {
  if (!NVIDIA_API_KEY) {
    res.status(503).json({ error: 'Natural-language search is not configured. Put NVIDIA_API_KEY=... in the .env file and restart.' });
    return;
  }
  const query = String((req.body && req.body.query) || '').trim();
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  try {
    const r = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: 'system', content: nlSystemPrompt() },
          { role: 'user', content: query },
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 2048,
        chat_template_kwargs: { enable_thinking: false },
        stream: false,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw new Error(`NVIDIA API ${r.status}: ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content || ''
      : '';
    const parsed = extractJson(content);

    // sanitize against the known ID tables
    const params = {
      mode: parsed.mode === 'date' ? 'date' : 'weekend',
      month: /^\d{4}-\d{2}$/.test(parsed.month || '') ? parsed.month : null,
      arrival: [4, 5, 6].includes(parsed.arrival) ? parsed.arrival : 5,
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? parsed.date : null,
      nights: Math.min(14, Math.max(1, parseInt(parsed.nights, 10) || 2)),
      types: (Array.isArray(parsed.types) ? parsed.types : []).filter((t) => nj.SITE_TYPES[t]),
      features: (Array.isArray(parsed.features) ? parsed.features : []).filter((f) => nj.FEATURES[f]),
      flushOnly: Boolean(parsed.flushOnly),
      minPeople: Math.max(0, parseInt(parsed.minPeople, 10) || 0),
      parks: (Array.isArray(parsed.parks) ? parsed.parks : []).filter((p) => nj.PARKS[p]),
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
    if (!params.types.length) params.types = [1];
    res.json({ params });
  } catch (err) {
    res.status(502).json({ error: `Could not interpret query: ${String(err.message || err)}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NJ Site Finder running at http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await nj.closeBrowser();
  process.exit(0);
});
