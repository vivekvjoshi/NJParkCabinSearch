// Searches ONE park per invocation — serverless functions have tight time
// limits, so the frontend loops over parks and calls this once per park.
import nj from '../../src/njoutdoors.js';

export const config = { path: '/api/park' };

const csvInts = (v) =>
  String(v || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n));

export default async (req) => {
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
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

  try {
    if (q.mode === 'recommend') {
      if (!/^\d{4}-\d{2}$/.test(q.month || '')) {
        return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 });
      }
      const arrival = parseInt(q.arrival, 10) || 5;
      if (![4, 5, 6].includes(arrival)) {
        return Response.json({ error: 'arrival must be 4, 5 or 6' }, { status: 400 });
      }
      const result = await nj.recommendPark({ ...common, month: q.month, arrival });
      return Response.json(result);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) {
      return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const nights = Math.min(14, Math.max(1, parseInt(q.nights, 10) || 2));
    const result = await nj.searchPark({ ...common, date: q.date, nights });
    return Response.json(result);
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
    });
  }
};
