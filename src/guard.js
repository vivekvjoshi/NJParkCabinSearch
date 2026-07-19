// Best-effort, per-instance request guarding for the public API routes:
//   - rateLimit:  per-IP sliding-window rate limit
//   - cacheGet/Set: short-TTL response cache (availability barely changes in ~90s,
//     and most re-searches are identical to a search that just ran)
//   - dedupe:     concurrent identical requests share one upstream execution
// On serverless each warm instance has its own Maps, so this absorbs duplicate
// and repeated traffic but is NOT a hard security boundary — for strict limits,
// layer Netlify's rate limiting or an external store (e.g. Upstash) on top.

const windows = new Map(); // key -> number[] of request timestamps
const cache = new Map(); // key -> { at, ttl, payload }
const inflight = new Map(); // key -> Promise

let ops = 0;
function sweep(now) {
  if (++ops % 500 !== 0) return;
  for (const [k, arr] of windows) {
    if (!arr.length || now - arr[arr.length - 1] > 15 * 60 * 1000) windows.delete(k);
  }
  for (const [k, v] of cache) {
    if (now - v.at > v.ttl) cache.delete(k);
  }
}

// Allow `limit` requests per `windowMs` per key.
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  const arr = (windows.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    windows.set(key, arr);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000)) };
  }
  arr.push(now);
  windows.set(key, arr);
  return { ok: true };
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload, ttlMs) {
  cache.set(key, { at: Date.now(), ttl: ttlMs, payload });
}

// Run `fn` once per key; concurrent callers share the same promise.
async function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

module.exports = { rateLimit, cacheGet, cacheSet, dedupe, clientIp };
