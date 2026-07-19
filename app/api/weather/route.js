// Daily forecast (hi/lo, precip, condition) for the requested parks.
// One upstream Open-Meteo call per unique park set; cached 30 minutes —
// forecasts only update a few times a day.
import wx from '../../../src/weather.js';
import guard from '../../../src/guard.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request) {
  const rl = guard.rateLimit(`wx:${guard.clientIp(request)}`, 30, 5 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: `rate limit exceeded — try again in ${rl.retryAfterSec}s` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const ids = String(new URL(request.url).searchParams.get('parks') || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => wx.PARK_COORDS[n]);
  if (!ids.length) {
    return Response.json({ error: 'parks must be a csv of known location ids' }, { status: 400 });
  }

  const key = `wx:${[...ids].sort((a, b) => a - b).join(',')}`;
  const cached = guard.cacheGet(key);
  if (cached) return Response.json({ ...cached, cached: true });

  try {
    const days = await guard.dedupe(key, () => wx.forecastForParks(ids));
    const payload = { days, fetchedAt: Date.now() };
    guard.cacheSet(key, payload, CACHE_TTL_MS);
    return Response.json(payload);
  } catch (err) {
    // weather is a nice-to-have — the UI hides badges when this fails
    return Response.json({ error: `weather unavailable: ${String(err.message || err)}` }, { status: 502 });
  }
}
