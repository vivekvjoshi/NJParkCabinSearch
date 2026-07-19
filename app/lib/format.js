// Shared display helpers for the UI (client components).

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${MON[m - 1]} ${d}`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const bookUrlFor = (id) =>
  `https://www.njportal.com/DEP/NJOutdoors/Park/Details?locationId=${id}`;

export function toggled(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// "2:05pm" in the browser's local timezone
export function fmtTime(ts) {
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}${d.getHours() >= 12 ? 'pm' : 'am'}`;
}

// Total trip cost in dollars from the numeric resident rate, or null when unknown.
export function totalCost(site, nights) {
  if (!site.costRes || !nights) return null;
  return Math.round(site.costRes * nights * 100) / 100;
}
