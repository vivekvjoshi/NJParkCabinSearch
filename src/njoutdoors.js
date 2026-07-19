// NJ Outdoors (njportal.com) scraper library for NJ Park Site Finder.
//
// Pure HTTP — no browser. A GET of the park Details page yields the session
// cookies, the ASP.NET anti-forgery token, and the HTML we parse for the
// per-site catalog (toilets/area/access). Availability then comes from the
// site's own POST /DEP/NJOutdoors/Park/ListSiteAvailabilityJson endpoint.

const fs = require('fs');
const path = require('path');

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

// Serverless hosts have no writable project dir — cache under /tmp there.
const IS_SERVERLESS = Boolean(
  process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.APP_SERVERLESS ||
    (process.platform === 'linux' && fs.existsSync('/var/task'))
);
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'njdata') : path.join(process.cwd(), 'data');
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

// ---------- HTTP session (cookies + anti-forgery token from the Details page) ----------

function detailsUrl(locationId) {
  return `${BASE}/DEP/NJOutdoors/Park/Details?locationId=${locationId}`;
}

async function openParkSession(locationId) {
  const res = await fetch(detailsUrl(locationId), {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`park page HTTP ${res.status}`);
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
  const html = await res.text();
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('could not find __RequestVerificationToken on park page (bot wall or format change?)');
  }
  return { locationId, cookieHeader, token: tokenMatch[1], html };
}

// ---------- catalog (per-park types/features/toilet info parsed from the page HTML) ----------

function stripTags(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCatalogHtml(html, locationId) {
  const types = [];
  for (const m of html.matchAll(
    /<input[^>]*class="[^"]*type-filter[^"]*"[^>]*value="(\d+)"[^>]*>[\s\S]{0,200}?<label[^>]*>([^<]+)<\/label>/g
  )) {
    types.push({ id: Number(m[1]), name: m[2].trim() });
  }
  const features = [];
  for (const m of html.matchAll(
    /<input[^>]*class="[^"]*feature-filter[^"]*"[^>]*featureid="(\d+)"[^>]*id="([^"]+)"[\s\S]{0,400}?<label for="\2"[^>]*>([^<]+)<\/label>/g
  )) {
    features.push({ id: Number(m[1]), name: m[3].trim() });
  }
  const sites = {};
  const parts = html.split(/(?=<div class="single location-site)/);
  for (const part of parts.slice(1)) {
    const idMatch = part.match(/site="(\d+)"/);
    if (!idMatch) continue;
    const text = stripTags(part.slice(0, 8000));
    const grab = (label) => {
      const m = text.match(
        new RegExp(`${label}:\\s*(.*?)(?=\\s*(?:Area|Site Access|Toilets|Cost|Maximum People|Shade|Site Type)\\s*:|$)`)
      );
      return m ? m[1].trim() : '';
    };
    sites[idMatch[1]] = {
      area: grab('Area'),
      access: grab('Site Access'),
      toilets: (text.match(/Toilets:\s*(Flush|Pit|None)/i) || ['', ''])[1],
    };
  }
  return { locationId, fetchedAt: Date.now(), types, features, sites };
}

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

function getCatalog(session) {
  const cached = readCachedCatalog(session.locationId);
  if (cached) return cached;
  const catalog = parseCatalogHtml(session.html, session.locationId);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(catalogPath(session.locationId), JSON.stringify(catalog, null, 2));
  } catch {
    /* read-only or ephemeral filesystem — cache is best-effort */
  }
  return catalog;
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

async function fetchAvailability(session, fromDateISO, typeIds, featureIds) {
  const body = new URLSearchParams({
    locationId: String(session.locationId),
    fromDate: isoToMDY(fromDateISO),
    limitTypes: typeIds.join(','),
    limitFeatures: featureIds.join(','),
    trailerLength: '',
    peopleSupported: '',
    vehiclesSupported: '',
    __RequestVerificationToken: session.token,
  }).toString();

  const res = await fetch(`${BASE}/DEP/NJOutdoors/Park/ListSiteAvailabilityJson`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Cookie: session.cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: detailsUrl(session.locationId),
      Origin: BASE,
    },
    body,
    redirect: 'follow',
  });

  if (!res.ok || !res.url.includes('ListSiteAvailabilityJson')) {
    throw new Error(`availability request failed (status ${res.status}, url ${res.url})`);
  }
  let json;
  try {
    json = JSON.parse(await res.text());
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
  const num = (v) =>
    v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    siteId: d.SiteId,
    shortName: d.ShortName || '',
    name: d.Name || '',
    types: (d.SiteTypes || []).map((t) => t.Name).join(', '),
    maxPeople: d.MaxPeople || 0,
    cost: formatCost(d),
    costRes: num(d.ResidentCost),
    costNonRes: num(d.NonResidentCost),
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
  if (!offered.size) return requested; // catalog parse found nothing — don't skip, just try
  return requested.filter((t) => offered.has(t));
}

// ---------- specific-date search (one park) ----------

async function searchPark({ locationId, date, nights, types, features, flushOnly, minPeople }) {
  const session = await openParkSession(locationId);
  const catalog = getCatalog(session);
  const useTypes = types.length ? parkTypeIds(catalog, types) : [];
  if (types.length && !useTypes.length) {
    return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: true, sites: [], totalMatching: 0 };
  }

  const apiSites = await fetchAvailability(session, date, useTypes, features);

  const showerSelected = features.includes(SHOWER_FEATURE_ID);
  let showerIds = new Set();
  if (!showerSelected && apiSites.length) {
    try {
      const showerSites = await fetchAvailability(session, date, useTypes, [
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
}

// ---------- weekend recommender (one park, all weekends of a month) ----------

async function recommendPark({ locationId, month, types, features, flushOnly, minPeople, arrival }) {
  const weekends = weekendsInMonth(month, arrival).filter((w) => w.arrival >= todayISO());
  if (!weekends.length) {
    return { locationId, park: PARKS[locationId], bookUrl: detailsUrl(locationId), skipped: false, weekends: {} };
  }

  const session = await openParkSession(locationId);
  const catalog = getCatalog(session);
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
    const apiSites = await fetchAvailability(session, fromDate, useTypes, features);
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
}

function runtimeDebug() {
  return {
    mode: 'plain-http',
    serverless: IS_SERVERLESS,
    platform: process.platform,
    node: process.version,
  };
}

module.exports = {
  PARKS,
  SITE_TYPES,
  FEATURES,
  MIN_STAY_TYPE_IDS,
  SHOWER_FEATURE_ID,
  detailsUrl,
  todayISO,
  addDays,
  isoToMDY,
  dayOfWeek,
  weekendsInMonth,
  metaFromCatalogs,
  searchPark,
  recommendPark,
  runtimeDebug,
  // pure internals exported for unit tests
  nightFree,
  formatCost,
  parseCatalogHtml,
  siteRow,
  passesFilters,
  sortRows,
  parkTypeIds,
};
