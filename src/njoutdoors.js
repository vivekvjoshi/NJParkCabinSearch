// NJ Outdoors (njportal.com) scraper library for NJ Site Finder.
// All availability data comes from POST /DEP/NJOutdoors/Park/ListSiteAvailabilityJson,
// called from inside a loaded park Details page so session cookies apply.

const fs = require('fs');
const path = require('path');

// On Netlify/AWS Lambda there is no installed browser and no writable project dir:
// use @sparticuz/chromium with playwright-core, and cache catalogs under /tmp.
// Netlify's Next runtime hides the AWS_*/LAMBDA_* env vars from user code, so also
// accept an explicit APP_SERVERLESS env var and the /var/task dir Lambda always has.
const IS_SERVERLESS = Boolean(
  process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.APP_SERVERLESS ||
    (process.platform === 'linux' && fs.existsSync('/var/task'))
);
const USE_LAMBDA_CHROMIUM = IS_SERVERLESS && process.platform === 'linux';

const BASE = 'https://www.njportal.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PARKS = {
  2: 'Allaire',
  3: 'Bass River',
  4: 'Belleplain',
  5: 'Brendan T Byrne',
  6: 'Cheesequake',
  7: 'High Point',
  8: 'Jenny Jump',
  10: 'Parvin',
  11: 'Round Valley',
  12: 'Spruce Run',
  13: 'Stephens',
  14: 'Stokes',
  15: 'Swartswood',
  16: 'Voorhees',
  17: 'Washington Crossing',
  18: 'Wawayanda',
  19: 'Wharton',
  20: 'Worthington',
};

const SITE_TYPES = {
  1: 'Cabin',
  2: 'Lean-To',
  3: 'Shelter',
  5: 'Group Campsite',
  6: 'Pet Friendly',
  7: 'Trailer',
  8: 'Tent',
};

const FEATURES = {
  1: 'ADA Accessible',
  2: 'ADA Required',
  3: 'Batona Trail',
  4: 'Boat Access',
  5: 'Driveway',
  6: 'Electricity Access',
  7: 'Elevated Cooking',
  8: 'Elevated Platform',
  9: 'Fire Ring',
  10: 'Horseback Riding Trail',
  11: 'Lantern Hooks',
  13: 'Picnic Tables',
  14: 'Shower Access',
  15: 'WiFi Access',
  16: 'Water Hookup',
  17: 'Electric 30 Amp',
  18: 'Electric 50 Amp',
};

const SHOWER_FEATURE_ID = 14;
const MIN_STAY_TYPE_IDS = [1, 2, 3]; // Cabin, Lean-To, Shelter: peak-season fixed-arrival 7/14-night rule

// cwd, not __dirname: this file gets bundled into .next/ by the Next build,
// but the process always runs from the project root
const DATA_DIR = IS_SERVERLESS
  ? path.join('/tmp', 'njdata')
  : path.join(process.cwd(), 'data');
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- date helpers (all pure string math on YYYY-MM-DD, no TZ surprises) ----------

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function isoToMDY(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function dayOfWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// All candidate weekends in a YYYY-MM month for a given arrival weekday (4/5/6).
// Checkout is always the following Sunday.
function weekendsInMonth(month, arrivalDow) {
  const nights = { 4: 3, 5: 2, 6: 1 }[arrivalDow];
  if (!nights) throw new Error(`arrival must be 4, 5 or 6 (got ${arrivalDow})`);
  const first = `${month}-01`;
  const weekends = [];
  for (let iso = first; iso.slice(0, 7) === month; iso = addDays(iso, 1)) {
    if (dayOfWeek(iso) === arrivalDow) {
      weekends.push({ arrival: iso, checkout: addDays(iso, nights), nights });
    }
  }
  return weekends;
}

// ---------- browser / session ----------

let browserPromise = null;

async function launchLambdaChromium() {
  // chromium-min ships no browser binary (keeps the function bundle tiny);
  // the browser pack is downloaded to /tmp on first use and reused while warm
  let sparticuz = require('@sparticuz/chromium-min');
  // bundler interop: the module may arrive as { default: {...} }
  if (sparticuz && typeof sparticuz.executablePath !== 'function' && sparticuz.default) {
    sparticuz = sparticuz.default;
  }
  const { chromium } = require('playwright-core');
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const packUrl =
    process.env.CHROMIUM_PACK_URL ||
    `https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.${arch}.tar`;
  const executablePath = await sparticuz.executablePath(packUrl);
  return chromium.launch({ headless: true, args: sparticuz.args, executablePath });
}

async function launchBrowser() {
  if (USE_LAMBDA_CHROMIUM) return launchLambdaChromium();
  try {
    const { chromium } = require('playwright');
    return await chromium.launch({ headless: true });
  } catch (err) {
    // On linux with no locally-installed browser we're almost certainly on a
    // serverless host that env detection missed — fall back to lambda chromium.
    if (process.platform === 'linux') return launchLambdaChromium();
    throw err;
  }
}

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null; // stale after a lambda freeze/crash — relaunch
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => {});
  }
}

function detailsUrl(locationId) {
  return `${BASE}/DEP/NJOutdoors/Park/Details?locationId=${locationId}`;
}

async function openParkPage(locationId) {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  if (IS_SERVERLESS) {
    // function invocations have tight time limits — don't wait for networkidle,
    // just for the server-rendered verification token to be present
    await page.goto(detailsUrl(locationId), { waitUntil: 'domcontentloaded', timeout: 25000 });
    // the token input is type=hidden — wait for presence, not visibility
    await page.waitForSelector('input[name="__RequestVerificationToken"]', {
      state: 'attached',
      timeout: 15000,
    });
  } else {
    await page.goto(detailsUrl(locationId), { waitUntil: 'networkidle', timeout: 90000 });
  }
  return { context, page };
}

// ---------- catalog (per-park types/features/toilet info scraped from the Details page DOM) ----------

function catalogPath(locationId) {
  return path.join(DATA_DIR, `catalog-${locationId}.json`);
}

function readCachedCatalog(locationId) {
  try {
    const raw = JSON.parse(fs.readFileSync(catalogPath(locationId), 'utf8'));
    if (Date.now() - raw.fetchedAt < CATALOG_TTL_MS) return raw;
  } catch {
    /* missing or corrupt cache */
  }
  return null;
}

async function scrapeCatalog(page, locationId) {
  const scraped = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const labelFor = (input) => {
      const lab = input.closest('label');
      if (lab) return clean(lab.textContent);
      if (input.id) {
        const byFor = document.querySelector(`label[for="${input.id}"]`);
        if (byFor) return clean(byFor.textContent);
      }
      return clean(input.parentElement && input.parentElement.textContent);
    };
    const types = [...document.querySelectorAll('input.type-filter')].map((el) => ({
      id: Number(el.value),
      name: labelFor(el),
    }));
    const features = [...document.querySelectorAll('input.feature-filter')].map((el) => ({
      id: Number(el.getAttribute('featureid')),
      name: labelFor(el),
    }));
    const sites = {};
    for (const row of document.querySelectorAll('.location-site')) {
      const siteId = row.getAttribute('site');
      if (!siteId) continue;
      const text = clean(row.textContent);
      const grab = (label) => {
        const m = text.match(
          new RegExp(
            `${label}:\\s*(.*?)(?=\\s*(?:Area|Site Access|Toilets|Cost|Maximum People|Shade|Site Type)\\s*:|$)`
          )
        );
        return m ? m[1].trim() : '';
      };
      sites[siteId] = {
        area: grab('Area'),
        access: grab('Site Access'),
        toilets: (text.match(/Toilets:\s*(Flush|Pit|None)/i) || ['', ''])[1],
      };
    }
    return { types, features, sites };
  });

  const catalog = { locationId, fetchedAt: Date.now(), ...scraped };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(catalogPath(locationId), JSON.stringify(catalog, null, 2));
  } catch {
    /* read-only or ephemeral filesystem — cache is best-effort */
  }
  return catalog;
}

async function getCatalog(page, locationId) {
  return readCachedCatalog(locationId) || scrapeCatalog(page, locationId);
}

// Union of types/features across all cached catalogs, falling back to the static ID tables.
function metaFromCatalogs() {
  const types = new Map();
  const features = new Map();
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!/^catalog-\d+\.json$/.test(f)) continue;
      const cat = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      for (const t of cat.types || []) if (t.id && t.name) types.set(t.id, t.name);
      for (const ft of cat.features || []) if (ft.id && ft.name) features.set(ft.id, ft.name);
    }
  } catch {
    /* no data dir yet */
  }
  for (const [id, name] of Object.entries(SITE_TYPES)) if (!types.has(+id)) types.set(+id, name);
  for (const [id, name] of Object.entries(FEATURES)) if (!features.has(+id)) features.set(+id, name);
  const toList = (m) =>
    [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
  return { types: toList(types), features: toList(features) };
}

// ---------- availability API ----------

async function fetchAvailability(page, locationId, fromDateISO, typeIds, featureIds) {
  const token = await page
    .$eval('input[name="__RequestVerificationToken"]', (el) => el.value)
    .catch(() => null);
  if (!token) throw new Error('could not find __RequestVerificationToken on park page');

  const body = new URLSearchParams({
    locationId: String(locationId),
    fromDate: isoToMDY(fromDateISO),
    limitTypes: typeIds.join(','),
    limitFeatures: featureIds.join(','),
    trailerLength: '',
    peopleSupported: '',
    vehiclesSupported: '',
    __RequestVerificationToken: token,
  }).toString();

  const res = await page.evaluate(async (postBody) => {
    const r = await fetch('/DEP/NJOutdoors/Park/ListSiteAvailabilityJson', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: postBody,
      redirect: 'follow',
    });
    return { status: r.status, url: r.url, text: await r.text() };
  }, body);

  if (res.url.includes('ListSiteAvailabilityJson') === false || res.status !== 200) {
    throw new Error(`availability request failed (status ${res.status}, url ${res.url})`);
  }
  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error('availability response was not JSON (session/format change?)');
  }
  if (!json.success || !Array.isArray(json.sites)) {
    throw new Error('availability response missing success/sites');
  }
  return json.sites;
}

// A night is bookable iff none of these flags is set (matches how the site paints a day green).
function nightFree(d) {
  return !(
    d.Arrival ||
    d.Booked ||
    d.ClosedSeasonal ||
    d.ClosedNonSeasonal ||
    d.Locked ||
    d.Unavailable
  );
}

function formatCost(details) {
  const fmt = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return null;
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  };
  const res = fmt(details.ResidentCost);
  const non = fmt(details.NonResidentCost);
  if (res && non) return `${res} NJ res / ${non} non-res per night`;
  return res || non || '';
}

function siteRow(apiSite, catalog, showerIds, showerAll) {
  const d = apiSite.SiteDetails;
  const cat = (catalog.sites || {})[String(d.SiteId)] || {};
  const toilets = cat.toilets || '';
  return {
    siteId: d.SiteId,
    shortName: d.ShortName || '',
    name: d.Name || '',
    types: (d.SiteTypes || []).map((t) => t.Name).join(', '),
    maxPeople: d.MaxPeople || 0,
    cost: formatCost(d),
    area: cat.area || '',
    access: cat.access || '',
    toilets,
    flush: /flush/i.test(toilets),
    shower: showerAll || showerIds.has(d.SiteId),
  };
}

function passesFilters(row, { flushOnly, minPeople }) {
  if (flushOnly && !row.flush) return false;
  if (minPeople && row.maxPeople < minPeople) return false;
  return true;
}

function sortRows(rows) {
  return rows.sort(
    (a, b) =>
      b.flush + b.shower - (a.flush + a.shower) ||
      String(a.shortName || a.name).localeCompare(String(b.shortName || b.name))
  );
}

// Which of the requested type IDs does this park actually offer?
function parkTypeIds(catalog, requested) {
  const offered = new Set((catalog.types || []).map((t) => t.id).filter(Boolean));
  if (!offered.size) return requested; // catalog scrape found nothing — don't skip, just try
  return requested.filter((t) => offered.has(t));
}

// ---------- specific-date search (one park) ----------

async function searchPark({ locationId, date, nights, types, features, flushOnly, minPeople }) {
  const { context, page } = await openParkPage(locationId);
  try {
    const catalog = await getCatalog(page, locationId);
    const useTypes = types.length ? parkTypeIds(catalog, types) : [];
    if (types.length && !useTypes.length) {
      return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: true, sites: [], totalMatching: 0 };
    }

    const apiSites = await fetchAvailability(page, locationId, date, useTypes, features);

    const showerSelected = features.includes(SHOWER_FEATURE_ID);
    let showerIds = new Set();
    if (!showerSelected && apiSites.length) {
      try {
        const showerSites = await fetchAvailability(page, locationId, date, useTypes, [
          ...features,
          SHOWER_FEATURE_ID,
        ]);
        showerIds = new Set(showerSites.map((s) => s.SiteDetails.SiteId));
      } catch {
        /* shower tagging is best-effort */
      }
    }

    const matching = apiSites
      .map((s) => ({ api: s, row: siteRow(s, catalog, showerIds, showerSelected) }))
      .filter(({ row }) => passesFilters(row, { flushOnly, minPeople }));

    const available = matching
      .filter(({ api }) => {
        const ds = api.Dates || [];
        if (ds.length < nights) return false;
        for (let i = 0; i < nights; i++) if (!nightFree(ds[i])) return false;
        return true;
      })
      .map(({ row }) => row);

    return {
      locationId,
      park: PARKS[locationId],
      bookUrl: detailsUrl(locationId),
      skipped: false,
      totalMatching: matching.length,
      sites: sortRows(available),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

// ---------- weekend recommender (one park, all weekends of a month) ----------

async function recommendPark({ locationId, month, types, features, flushOnly, minPeople, arrival }) {
  const weekends = weekendsInMonth(month, arrival).filter((w) => w.arrival >= todayISO());
  if (!weekends.length) {
    return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: false, weekends: {} };
  }

  const { context, page } = await openParkPage(locationId);
  try {
    const catalog = await getCatalog(page, locationId);
    const useTypes = types.length ? parkTypeIds(catalog, types) : [];
    if (types.length && !useTypes.length) {
      return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: true, weekends: {} };
    }

    // Two 30-day windows (1st + 16th, clamped to today) cover stays starting through the 31st.
    const today = todayISO();
    const clamp = (iso) => (iso < today ? today : iso);
    const fromDates = [...new Set([clamp(`${month}-01`), clamp(`${month}-16`)])];

    // siteId -> { row, nights: { iso -> free } }
    const sitesById = new Map();
    for (const fromDate of fromDates) {
      const apiSites = await fetchAvailability(page, locationId, fromDate, useTypes, features);
      for (const s of apiSites) {
        const id = s.SiteDetails.SiteId;
        if (!sitesById.has(id)) {
          sitesById.set(id, { row: siteRow(s, catalog, new Set(), features.includes(SHOWER_FEATURE_ID)), nights: {} });
        }
        const entry = sitesById.get(id);
        (s.Dates || []).forEach((d, i) => {
          entry.nights[addDays(fromDate, i)] = nightFree(d);
        });
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    const candidates = [...sitesById.values()].filter(({ row }) =>
      passesFilters(row, { flushOnly, minPeople })
    );

    const result = {};
    for (const w of weekends) {
      const stayNights = [];
      for (let i = 0; i < w.nights; i++) stayNights.push(addDays(w.arrival, i));
      const free = candidates
        .filter(({ nights }) => stayNights.every((iso) => nights[iso] === true))
        .map(({ row }) => row);
      result[w.arrival] = { ...w, sites: sortRows(free) };
    }

    return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: false, weekends: result };
  } finally {
    await context.close().catch(() => {});
  }
}

function runtimeDebug() {
  return {
    serverless: IS_SERVERLESS,
    lambdaChromium: USE_LAMBDA_CHROMIUM,
    platform: process.platform,
    arch: process.arch,
    varTask: fs.existsSync('/var/task'),
    appServerlessEnv: Boolean(process.env.APP_SERVERLESS),
  };
}

module.exports = {
  PARKS,
  runtimeDebug,
  SITE_TYPES,
  FEATURES,
  MIN_STAY_TYPE_IDS,
  SHOWER_FEATURE_ID,
  detailsUrl,
  todayISO,
  addDays,
  weekendsInMonth,
  metaFromCatalogs,
  getBrowser,
  closeBrowser,
  searchPark,
  recommendPark,
};
