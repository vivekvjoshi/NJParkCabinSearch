// Weather forecasts via Open-Meteo (https://open-meteo.com) — free, no API key,
// and it accepts multiple locations in ONE request, so all 18 parks cost a
// single HTTP call. Data: CC BY 4.0 — keep the attribution in the footer.

// Approximate park entrance/office coordinates. Accuracy to a few miles is
// plenty — Open-Meteo's forecast grid resolution is coarser than that.
const PARK_COORDS = {
  2: [40.159, -74.129], // Allaire — Farmingdale
  3: [39.6, -74.441], // Bass River — New Gretna
  4: [39.251, -74.844], // Belleplain — Woodbine
  5: [39.931, -74.534], // Brendan T Byrne — New Lisbon
  6: [40.437, -74.265], // Cheesequake — Matawan
  7: [41.321, -74.67], // High Point — Sussex
  8: [40.918, -74.927], // Jenny Jump — Hope
  10: [39.512, -75.128], // Parvin — Pittsgrove
  11: [40.616, -74.828], // Round Valley — Lebanon
  12: [40.709, -74.933], // Spruce Run — Clinton
  13: [40.853, -74.817], // Stephens — Hackettstown
  14: [41.198, -74.766], // Stokes — Branchville
  15: [41.082, -74.832], // Swartswood — Swartswood
  16: [40.696, -74.905], // Voorhees — Glen Gardner
  17: [40.298, -74.868], // Washington Crossing — Titusville
  18: [41.188, -74.419], // Wawayanda — Highland Lakes
  19: [39.742, -74.718], // Wharton — Atsion
  20: [41.002, -75.069], // Worthington — Columbia (Delaware Water Gap)
};

// { locationId: { 'YYYY-MM-DD': { hi, lo, precip, code } } } for the next 16 days.
async function forecastForParks(ids) {
  const valid = ids.filter((id) => PARK_COORDS[id]);
  if (!valid.length) throw new Error('no known park coordinates requested');
  const lats = valid.map((id) => PARK_COORDS[id][0]).join(',');
  const lons = valid.map((id) => PARK_COORDS[id][1]).join(',');
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lats}&longitude=${lons}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode' +
    '&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16';

  const res = await fetch(url, { headers: { 'User-Agent': 'njparksitefinder/1.0' } });
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [data]; // one location returns a bare object

  const out = {};
  valid.forEach((id, i) => {
    const d = list[i] && list[i].daily;
    if (!d || !Array.isArray(d.time)) return;
    const perDay = {};
    d.time.forEach((iso, j) => {
      const hi = d.temperature_2m_max?.[j];
      const lo = d.temperature_2m_min?.[j];
      if (hi == null || lo == null) return;
      perDay[iso] = {
        hi: Math.round(hi),
        lo: Math.round(lo),
        precip: d.precipitation_probability_max?.[j] ?? 0,
        code: d.weathercode?.[j] ?? null,
      };
    });
    out[id] = perDay;
  });
  return out;
}

module.exports = { PARK_COORDS, forecastForParks };
