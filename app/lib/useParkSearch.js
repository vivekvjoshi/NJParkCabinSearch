// Search orchestration for NJ Park Site Finder.
//
// The frontend loops over selected parks calling /api/park once per park
// (each call is its own serverless invocation), with a small concurrency
// pool so a full 18-park scan takes seconds instead of ~30s sequentially.
// Weekend templates come from the server responses (single source of truth
// is weekendsInMonth in src/njoutdoors.js) — the client never computes them.

import { useRef, useState } from 'react';
import { bookUrlFor, fmtDate, plural } from './format.js';

const CONCURRENCY = 3;

async function runPool(items, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(lanes);
}

export function useParkSearch() {
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState(null); // {kind:'ok'|'empty'|'error', text?, prefix?, minStay?, best?}
  const [dateResults, setDateResults] = useState(null);
  const [weekendResults, setWeekendResults] = useState(null);
  const [nightsUsed, setNightsUsed] = useState(2);
  const [dateUsed, setDateUsed] = useState(null); // date-mode arrival (weather window)
  const [checkedAt, setCheckedAt] = useState(null);
  const [parkStates, setParkStates] = useState({}); // locationId -> pending|checking|ok|empty|error
  const runRef = useRef(0);

  const parkName = (meta, id) => (meta?.parks.find((p) => p.id === id) || {}).name || `Park ${id}`;
  const minStaySelected = (meta, typeIds) =>
    Boolean(meta && meta.minStayTypeIds.some((id) => typeIds.includes(id)));

  function beginSearch(cfg) {
    if (!cfg.parks.length) {
      setSummary({ kind: 'error', text: 'Select at least one park in the left rail.' });
      return null;
    }
    const run = ++runRef.current;
    setBusy(true);
    setShowProgress(true);
    setProgress(0);
    setStatus('Warming up…');
    setSummary(null);
    setDateResults(null);
    setWeekendResults(null);
    setParkStates(Object.fromEntries(cfg.parks.map((id) => [id, 'pending'])));
    return run;
  }

  function cancel() {
    runRef.current += 1; // invalidate the in-flight run
    setBusy(false);
    setStatus('Cancelled.');
  }

  async function fetchPark(params) {
    const resp = await fetch('/api/park?' + new URLSearchParams(params));
    return resp.json();
  }

  const noteCheckedAt = (r) => {
    if (r.checkedAt) setCheckedAt((prev) => Math.max(prev || 0, r.checkedAt));
  };

  async function runDateSearch(cfg, meta) {
    const run = beginSearch(cfg);
    if (!run) return;
    setNightsUsed(parseInt(cfg.nights, 10) || 2);
    setDateUsed(cfg.date);
    const results = [];
    let availableCount = 0;
    let parksWithSites = 0;
    let done = 0;
    const started = Date.now();
    await runPool(cfg.parks, async (id) => {
      if (runRef.current !== run) return;
      setParkStates((s) => ({ ...s, [id]: 'checking' }));
      let r;
      try {
        r = await fetchPark({
          mode: 'search',
          park: id,
          date: cfg.date,
          nights: cfg.nights,
          types: cfg.types.join(','),
          features: cfg.features.join(','),
          flushOnly: cfg.flushOnly ? '1' : '0',
          minPeople: cfg.minPeople,
        });
      } catch (err) {
        r = {
          locationId: id,
          park: parkName(meta, id),
          bookUrl: bookUrlFor(id),
          error: String(err.message || err),
          sites: [],
          totalMatching: 0,
        };
      }
      if (runRef.current !== run) return;
      done += 1;
      setProgress(Math.round((done / cfg.parks.length) * 100));
      setStatus(`Checking parks… ${done} of ${cfg.parks.length}`);
      results.push(r);
      availableCount += (r.sites || []).length;
      if ((r.sites || []).length) parksWithSites += 1;
      setParkStates((s) => ({
        ...s,
        [id]: r.error ? 'error' : r.skipped || !(r.sites || []).length ? 'empty' : 'ok',
      }));
      noteCheckedAt(r);
      setDateResults([...results].sort((a, b) => (b.sites?.length || 0) - (a.sites?.length || 0)));
    });
    if (runRef.current !== run) return;
    setProgress(100);
    setStatus(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
    setSummary(
      availableCount > 0
        ? {
            kind: 'ok',
            text: `✅ ${plural(availableCount, 'site')} available across ${plural(parksWithSites, 'park')} for ${fmtDate(cfg.date)}, ${plural(+cfg.nights, 'night')}.`,
          }
        : {
            kind: 'empty',
            prefix: 'No available sites found for these dates and filters.',
            minStay: minStaySelected(meta, cfg.types),
          }
    );
    setBusy(false);
  }

  async function runWeekendSearch(cfg, meta) {
    const run = beginSearch(cfg);
    if (!run) return;
    setNightsUsed({ 4: 3, 5: 2, 6: 1 }[parseInt(cfg.arrival, 10)] || 2);
    // Buckets are built purely from server weekend payloads (arrival/checkout/nights),
    // so weekend-template logic lives in exactly one place: the server.
    const merged = new Map();
    const started = Date.now();
    const notes = [];
    let done = 0;
    let succeeded = 0;
    const publish = () => {
      const weekends = [...merged.values()].sort((a, b) => a.arrival.localeCompare(b.arrival));
      for (const w of weekends) w.parks.sort((a, b) => b.count - a.count);
      setWeekendResults(weekends);
    };
    await runPool(cfg.parks, async (id) => {
      if (runRef.current !== run) return;
      setParkStates((s) => ({ ...s, [id]: 'checking' }));
      try {
        const r = await fetchPark({
          mode: 'recommend',
          park: id,
          month: cfg.month,
          arrival: cfg.arrival,
          types: cfg.types.join(','),
          features: cfg.features.join(','),
          flushOnly: cfg.flushOnly ? '1' : '0',
          minPeople: cfg.minPeople,
        });
        if (r.error) throw new Error(r.error);
        if (runRef.current !== run) return;
        succeeded += 1;
        let parkTotal = 0;
        for (const [iso, w] of Object.entries(r.weekends || {})) {
          let bucket = merged.get(iso);
          if (!bucket) {
            bucket = { arrival: iso, checkout: w.checkout, nights: w.nights, totalSites: 0, parks: [] };
            merged.set(iso, bucket);
          }
          if (!w.sites.length) continue;
          bucket.totalSites += w.sites.length;
          bucket.parks.push({ locationId: id, park: r.park, bookUrl: r.bookUrl, count: w.sites.length, sites: w.sites });
          parkTotal += w.sites.length;
        }
        noteCheckedAt(r);
        setParkStates((s) => ({ ...s, [id]: parkTotal > 0 ? 'ok' : 'empty' }));
        notes.push(`${r.park}: ${parkTotal}`);
        done += 1;
        setProgress(Math.round((done / cfg.parks.length) * 100));
        setStatus(`Latest — ${notes.slice(-3).join(' · ')} site-weekends`);
        publish(); // stream: weekend cards fill in as each park returns
      } catch {
        if (runRef.current !== run) return;
        setParkStates((s) => ({ ...s, [id]: 'error' }));
        notes.push(`${parkName(meta, id)}: error`);
        done += 1;
        setProgress(Math.round((done / cfg.parks.length) * 100));
        setStatus(`Latest — ${notes.slice(-3).join(' · ')}`);
      }
    });
    if (runRef.current !== run) return;
    publish();
    const weekends = [...merged.values()];
    setProgress(100);
    setStatus(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
    const best = weekends.length
      ? weekends.reduce((a, b) => (b.totalSites > a.totalSites ? b : a))
      : null;
    setSummary(
      best && best.totalSites > 0
        ? { kind: 'ok', best }
        : {
            kind: 'empty',
            prefix:
              succeeded === 0
                ? 'Every park failed to load — check your connection and try again.'
                : weekends.length
                  ? 'No weekend availability found for these filters.'
                  : 'No upcoming weekends left in that month.',
            minStay: minStaySelected(meta, cfg.types),
          }
    );
    setBusy(false);
  }

  return {
    busy,
    showProgress,
    progress,
    status,
    summary,
    dateResults,
    weekendResults,
    nightsUsed,
    dateUsed,
    checkedAt,
    parkStates,
    runDateSearch,
    runWeekendSearch,
    cancel,
  };
}
