// Searches ONE park per request — serverless functions have tight time
// limits, so the frontend loops over parks and calls this once per park.
// Guarded: per-IP rate limit, 90s response cache, in-flight dedupe, one retry.
import nj from '../../../src/njoutdoors.js';
import guard from '../../../src/guard.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

const CACHE_TTL_MS = 90 * 1000; // availability barely changes within 90s
const RATE_LIMIT = 60; // requests per window per IP (a full 18-park scan is 18)
const RATE_WINDOW_MS = 5 * 60 * 1000;

const csvInts = (v) =>
  String(v || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(request) {
  const url = new URL(request.url);
  const q = Object.fromEntries(url.searchParams);

  const rl = guard.rateLimit(`park:${guard.clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: `rate limit exceeded — try again in ${rl.retryAfterSec}s` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const locationId = parseInt(q.park, 10);
  if (!nj.PARKS[locationId]) {
    return Response.json({ error: `unknown park ${q.park}` }, { status: 400 });
  }

  const common = {
    locationId,
    types: csvInts(q.types),
    features: csvInts(q.features),
    flushOnly: q.flushOnly === '1' || q.flushOnly === 'true',
    minPeople: parseInt(q.minPeople, 10) || 0,
  };

  let exec;
  if (q.mode === 'recommend') {
    if (!/^\d{4}-\d{2}$/.test(q.month || '')) {
      return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    }
    const arrival = parseInt(q.arrival, 10) || 5;
    if (![4, 5, 6].includes(arrival)) {
      return Response.json({ error: 'arrival must be 4, 5 or 6' }, { status: 400 });
    }
    exec = () => nj.recommendPark({ ...common, month: q.month, arrival });
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) {
      return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const nights = Math.min(14, Math.max(1, parseInt(q.nights, 10) || 2));
    exec = () => nj.searchPark({ ...common, date: q.date, nights });
  }

  const cacheKey = `park:${url.searchParams.toString()}`;
  const cached = guard.cacheGet(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  try {
    const result = await guard.dedupe(cacheKey, async () => {
      try {
        return await exec();
      } catch {
        // one retry with backoff for transient network failures
        await sleep(600);
        return exec();
      }
    });
    const payload = { ...result, checkedAt: Date.now() };
    if (!payload.error) guard.cacheSet(cacheKey, payload, CACHE_TTL_MS);
    return Response.json(payload);
  } catch (err) {
    // return the error as a normal park result so the frontend renders it in place
    return Response.json({
      locationId,
      park: nj.PARKS[locationId],
      bookUrl: nj.detailsUrl(locationId),
      error: String(err.message || err),
      sites: [],
      totalMatching: 0,
      weekends: {},
      checkedAt: Date.now(),
    });
  }
}
