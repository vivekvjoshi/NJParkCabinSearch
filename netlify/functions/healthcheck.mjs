// Daily scraper health check (Netlify Scheduled Function).
//
// njportal.com changes its markup/endpoints occasionally (see trip.md). This runs the
// full live flow — session cookies + anti-forgery token + availability POST — for one
// park and fails loudly when the scraper breaks, so you find out before users do.
// Optionally POSTs an alert to HEALTHCHECK_WEBHOOK_URL (Slack-compatible incoming webhook).

import nj from '../../src/njoutdoors.js';

export const config = { schedule: '@daily' };

export default async () => {
  const started = Date.now();
  try {
    const date = nj.addDays(nj.todayISO(), 14);
    const r = await nj.searchPark({
      locationId: 10, // Parvin — the acceptance-test park from trip.md
      date,
      nights: 2,
      types: [8, 7],
      features: [],
      flushOnly: false,
      minPeople: 0,
    });
    const ms = Date.now() - started;
    console.log(
      `healthcheck OK: Parvin ${date} 2 nights — ${r.sites.length} available of ${r.totalMatching} matching in ${ms}ms`
    );
    return new Response('ok', { status: 200 });
  } catch (err) {
    const msg = `NJ Park Site Finder scraper health check FAILED: ${String(err.message || err)}`;
    console.error(msg);
    const hook = process.env.HEALTHCHECK_WEBHOOK_URL;
    if (hook) {
      try {
        await fetch(hook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg }),
        });
      } catch {
        /* alerting is best-effort */
      }
    }
    throw err; // surfaces in Netlify's function logs / deploy notifications
  }
};
