// Client-side weather display helpers (CJS so node:test can require it too).
// Raw daily data comes from /api/weather (Open-Meteo WMO weathercodes).

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// WMO weathercode → severity rank (higher = worse camping weather)
function codeRank(code) {
  if (code == null) return 0;
  if (code >= 95) return 7; // thunderstorm (+ hail)
  if (code === 85 || code === 86) return 6; // snow showers
  if (code >= 71 && code <= 77) return 6; // snow
  if (code === 66 || code === 67) return 5; // freezing rain
  if ((code >= 80 && code <= 82) || (code >= 61 && code <= 65)) return 4; // rain/showers
  if (code >= 51 && code <= 57) return 3; // drizzle
  if (code === 45 || code === 48) return 2; // fog
  if (code === 3) return 1; // overcast
  return 0; // clear-ish
}

// WMO weathercode → { icon, label }
function codeInfo(code) {
  if (code == null) return { icon: '🌡️', label: 'Forecast' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorms' };
  if (code >= 85) return { icon: '🌨️', label: 'Snow showers' };
  if (code >= 80) return { icon: '🌦️', label: 'Rain showers' };
  if (code >= 71) return { icon: '❄️', label: 'Snow' };
  if (code >= 66) return { icon: '🌧️', label: 'Freezing rain' };
  if (code >= 61) return { icon: '🌧️', label: 'Rain' };
  if (code >= 51) return { icon: '🌦️', label: 'Drizzle' };
  if (code >= 45) return { icon: '🌫️', label: 'Fog' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' };
  if (code === 1) return { icon: '🌤️', label: 'Mostly clear' };
  return { icon: '☀️', label: 'Clear' };
}

// Aggregate one park's daily forecast over a stay (arrival … checkout day,
// so daytime highs include departure day). Returns null outside the 16-day window.
function stayForecast(days, arrival, nights) {
  if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(arrival || '')) return null;
  const n = Math.max(1, parseInt(nights, 10) || 1);
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const d = days[addDays(arrival, i)];
    if (d) parts.push(d);
  }
  if (!parts.length) return null;
  let code = null;
  let rank = -1;
  for (const p of parts) {
    const r = codeRank(p.code);
    if (r > rank) {
      rank = r;
      code = p.code;
    }
  }
  return {
    hi: Math.max(...parts.map((p) => p.hi)),
    lo: Math.min(...parts.map((p) => p.lo)),
    precip: Math.max(...parts.map((p) => p.precip ?? 0)),
    code,
  };
}

// Aggregate one park's climatological normals over a stay (arrival … checkout
// day) — averages, since these are "typical" values, not a prediction.
// normals: { 'MM-DD': {hi, lo, wet} } → { hi, lo, wet } or null.
function typicalForStay(normals, arrival, nights) {
  if (!normals || !/^\d{4}-\d{2}-\d{2}$/.test(arrival || '')) return null;
  const n = Math.max(1, parseInt(nights, 10) || 1);
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const d = normals[addDays(arrival, i).slice(5)];
    if (d) parts.push(d);
  }
  if (!parts.length) return null;
  const avg = (f) => Math.round(parts.reduce((s, p) => s + f(p), 0) / parts.length);
  return {
    hi: avg((p) => p.hi),
    lo: avg((p) => p.lo),
    wet: Math.max(...parts.map((p) => p.wet)),
  };
}

module.exports = { addDays, codeInfo, codeRank, stayForecast, typicalForStay };
