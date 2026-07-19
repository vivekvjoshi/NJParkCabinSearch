'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MON } from './lib/format.js';
import { useParkSearch } from './lib/useParkSearch.js';
import SearchControls from './components/SearchControls.js';
import FilterRail from './components/FilterRail.js';
import Results from './components/Results.js';

const NL_EXAMPLES = [
  'cabin for 4 with showers over a July weekend',
  'tent site with electricity next Friday, 2 nights',
  'lean-to anywhere in September',
];

const STORAGE_KEY = 'njpf.filters';

// This month + the next 6, as YYYY-MM options.
function monthOptionsFrom(today) {
  const [ty, tm] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 + i, 1));
    return {
      value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    };
  });
}

export default function Home() {
  const [meta, setMeta] = useState(null);
  const [bootError, setBootError] = useState(null);

  const [mode, setMode] = useState('weekend'); // weekend finder is the default mode
  const [types, setTypes] = useState(new Set([1])); // Cabin is the default site type
  const [features, setFeatures] = useState(new Set());
  const [flushOnly, setFlushOnly] = useState(true); // flush toilets on by default
  const [parks, setParks] = useState(new Set());

  const [month, setMonth] = useState('');
  const [arrival, setArrival] = useState('5');
  const [minPeopleW, setMinPeopleW] = useState('0');
  const [dateVal, setDateVal] = useState('');
  const [nights, setNights] = useState('2');
  const [minPeopleD, setMinPeopleD] = useState('0');
  const [sortPref, setSortPref] = useState('recommended');

  const [nlQuery, setNlQuery] = useState('');
  const [nlNote, setNlNote] = useState(null);
  const [nlBusy, setNlBusy] = useState(false);

  const [theme, setTheme] = useState('light');
  const [weather, setWeather] = useState(null); // { days: {parkId: {iso: wx}}, normals: {parkId: {'MM-DD': normal}} }

  const search = useParkSearch();
  const initRef = useRef(false);

  useEffect(() => {
    // syncs with the inline pre-hydration theme script in layout.js
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('njpf.theme', next);
    } catch {
      /* private mode */
    }
  }

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then((m) => {
        setMeta(m);
        setParks(new Set(m.parks.map((p) => p.id))); // all parks on by default
        setDateVal(m.today);
        setMonth(monthOptionsFrom(m.today)[0].value); // default to this month
      })
      .catch((err) => setBootError(String(err.message || err)));
  }, []);

  // Fetch the 16-day forecast for all parks once meta is known (one request,
  // server-cached 30 min). Optional: badges simply stay hidden if it fails.
  useEffect(() => {
    if (!meta) return;
    fetch('/api/weather?parks=' + meta.parks.map((p) => p.id).join(','))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.days) setWeather({ days: d.days, normals: d.normals || null });
      })
      .catch(() => {
        /* weather is optional */
      });
  }, [meta]);

  const monthOptions = useMemo(() => (meta ? monthOptionsFrom(meta.today) : []), [meta]);

  // Restore filters once meta is loaded: shared-link URL params win, then
  // localStorage; run=1 in the URL re-executes the shared search.
  useEffect(() => {
    if (!meta || initRef.current) return;
    initRef.current = true;

    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get('mode');
    let saved = null;
    if (!fromUrl) {
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch {
        saved = null;
      }
    }
    const src = fromUrl ? Object.fromEntries(sp) : saved;
    if (!src) return;

    const csv = (v) =>
      String(v || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));
    const validParks = new Set(meta.parks.map((p) => p.id));
    const validTypes = new Set(meta.types.map((t) => t.id));
    const validFeatures = new Set(meta.features.map((f) => f.id));

    const srcTypes = csv(src.types).filter((t) => validTypes.has(t));
    if (srcTypes.length) setTypes(new Set(srcTypes));
    setFeatures(new Set(csv(src.features).filter((f) => validFeatures.has(f))));
    if (src.flush === '0' || src.flushOnly === false) setFlushOnly(false);
    if (src.parks) setParks(new Set(csv(src.parks).filter((p) => validParks.has(p))));
    const srcMode = src.mode === 'date' ? 'date' : 'weekend';
    setMode(srcMode);
    const srcArrival = ['4', '5', '6'].includes(String(src.arrival)) ? String(src.arrival) : '5';
    setArrival(srcArrival);
    const srcNights = String(Math.min(14, Math.max(1, parseInt(src.nights, 10) || 2)));
    setNights(srcNights);
    const srcMin = String(Math.max(0, parseInt(src.minPeople, 10) || 0));
    setMinPeopleW(srcMin);
    setMinPeopleD(srcMin);
    const srcMonth = monthOptions.some((o) => o.value === src.month) ? src.month : monthOptions[0]?.value;
    if (srcMonth) setMonth(srcMonth);
    const srcDate =
      /^\d{4}-\d{2}-\d{2}$/.test(src.date || '') && src.date >= meta.today ? src.date : meta.today;
    setDateVal(srcDate);

    if (fromUrl && sp.get('run') === '1') {
      const parkIds = src.parks
        ? csv(src.parks).filter((p) => validParks.has(p))
        : meta.parks.map((p) => p.id);
      if (!parkIds.length) return;
      const cfg = {
        parks: parkIds,
        types: srcTypes.length ? srcTypes : [1],
        features: csv(src.features).filter((f) => validFeatures.has(f)),
        flushOnly: src.flush !== '0',
        minPeople: srcMin,
      };
      if (srcMode === 'date') {
        search.runDateSearch({ ...cfg, date: srcDate, nights: srcNights }, meta);
      } else if (srcMonth) {
        search.runWeekendSearch({ ...cfg, month: srcMonth, arrival: srcArrival }, meta);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, monthOptions]);

  // Persist filters for returning visitors (URL params take precedence on load).
  useEffect(() => {
    if (!initRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          types: [...types],
          features: [...features],
          flushOnly,
          parks: [...parks],
          arrival,
          nights,
          month,
          minPeople: mode === 'weekend' ? minPeopleW : minPeopleD,
        })
      );
    } catch {
      /* storage unavailable */
    }
  }, [mode, types, features, flushOnly, parks, arrival, nights, month, minPeopleW, minPeopleD]);

  const cfgFromState = () => ({
    parks: [...parks],
    types: [...types],
    features: [...features],
    flushOnly,
  });

  // Reflect the current search in the URL so it's shareable; run=1 auto-runs
  // the search for whoever opens the link.
  function syncUrl(cfg) {
    const sp = new URLSearchParams();
    sp.set('mode', cfg.mode);
    if (cfg.mode === 'weekend') {
      sp.set('month', cfg.month);
      sp.set('arrival', String(cfg.arrival));
    } else {
      sp.set('date', cfg.date);
      sp.set('nights', String(cfg.nights));
    }
    sp.set('types', cfg.types.join(','));
    if (cfg.features.length) sp.set('features', cfg.features.join(','));
    if (!cfg.flushOnly) sp.set('flush', '0');
    if (cfg.minPeople && cfg.minPeople !== '0') sp.set('minPeople', cfg.minPeople);
    if (meta && cfg.parks.length !== meta.parks.length) sp.set('parks', cfg.parks.join(','));
    sp.set('run', '1');
    window.history.replaceState(null, '', '?' + sp.toString());
  }

  const searchWeekend = () => {
    const cfg = { ...cfgFromState(), mode: 'weekend', month, arrival, minPeople: minPeopleW || '0' };
    setNlNote(null);
    syncUrl(cfg);
    search.runWeekendSearch(cfg, meta);
  };

  const searchDate = () => {
    const cfg = { ...cfgFromState(), mode: 'date', date: dateVal, nights, minPeople: minPeopleD || '0' };
    setNlNote(null);
    syncUrl(cfg);
    search.runDateSearch(cfg, meta);
  };

  async function runNl() {
    const query = nlQuery.trim();
    if (!query || !meta) return;
    setNlBusy(true);
    setNlNote('✨ Interpreting your request…');
    try {
      const r = await fetch('/api/nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      const p = data.params;

      const t = p.types.length ? p.types : [1];
      const parkIds = p.parks.length ? p.parks : meta.parks.map((x) => x.id);
      setMode(p.mode);
      setTypes(new Set(t));
      setFeatures(new Set(p.features));
      setFlushOnly(Boolean(p.flushOnly));
      setParks(new Set(parkIds));
      setNlNote(`✨ ${p.note || 'Got it — searching now.'}`);

      const cfg = {
        parks: parkIds,
        types: t,
        features: p.features,
        flushOnly: Boolean(p.flushOnly),
        minPeople: String(p.minPeople || 0),
      };
      if (p.mode === 'date') {
        const date = p.date && p.date >= meta.today ? p.date : meta.today;
        setDateVal(date);
        setNights(String(p.nights || 2));
        setMinPeopleD(String(p.minPeople || 0));
        const full = { ...cfg, mode: 'date', date, nights: String(p.nights || 2) };
        syncUrl(full);
        search.runDateSearch(full, meta);
      } else {
        const m = p.month && monthOptions.some((o) => o.value === p.month) ? p.month : month;
        setMonth(m);
        setArrival(String(p.arrival || 5));
        setMinPeopleW(String(p.minPeople || 0));
        const full = { ...cfg, mode: 'weekend', month: m, arrival: String(p.arrival || 5) };
        syncUrl(full);
        search.runWeekendSearch(full, meta);
      }
    } catch (err) {
      setNlNote(`⚠️ ${err.message}`);
    } finally {
      setNlBusy(false);
    }
  }

  const showMinStayBanner = meta && meta.minStayTypeIds.some((id) => types.has(id));
  const hasResults =
    search.dateResults !== null || search.weekendResults !== null || search.summary !== null;

  return (
    <>
      <nav className="topnav">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">⛺</span>
            <span className="brand-name">NJ&nbsp;Park&nbsp;Site&nbsp;Finder</span>
          </Link>
          <div className="nav-links">
            <button
              type="button"
              className="btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <a href="https://www.njportal.com/DEP/NJOutdoors" target="_blank" rel="noopener noreferrer">
              njportal.com ↗
            </a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="container">
          <h1>
            Compare campsites, cabins &amp; lean-tos.
            <br />
            <span className="hero-accent">All 18 NJ state parks. One search.</span>
          </h1>

          <div className="nl-bar">
            <span className="nl-icon">✨</span>
            <input
              type="text"
              autoComplete="off"
              placeholder={
                meta && !meta.nlEnabled
                  ? 'Natural-language search: set NVIDIA_API_KEY to enable'
                  : 'Try “cabin for 4 with showers over a July weekend”'
              }
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runNl()}
            />
            <button className="btn-ghost" type="button" onClick={runNl} disabled={nlBusy}>
              {nlBusy ? 'Thinking…' : 'Ask'}
            </button>
          </div>
          <div className="nl-examples">
            {NL_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="nl-example" onClick={() => setNlQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
          {nlNote ? <div className="nl-note">{nlNote}</div> : null}

          <SearchControls
            meta={meta}
            mode={mode}
            setMode={setMode}
            month={month}
            setMonth={setMonth}
            monthOptions={monthOptions}
            arrival={arrival}
            setArrival={setArrival}
            minPeopleW={minPeopleW}
            setMinPeopleW={setMinPeopleW}
            dateVal={dateVal}
            setDateVal={setDateVal}
            nights={nights}
            setNights={setNights}
            minPeopleD={minPeopleD}
            setMinPeopleD={setMinPeopleD}
            busy={search.busy}
            types={types}
            setTypes={setTypes}
            showMinStayBanner={showMinStayBanner}
            onSearchWeekend={searchWeekend}
            onSearchDate={searchDate}
          />
        </div>
      </header>

      <main className="container layout">
        <FilterRail
          meta={meta}
          parks={parks}
          setParks={setParks}
          flushOnly={flushOnly}
          setFlushOnly={setFlushOnly}
          features={features}
          setFeatures={setFeatures}
        />
        <Results
          meta={meta}
          onQuickStart={searchWeekend}
          showProgress={search.showProgress}
          progress={search.progress}
          status={search.status}
          busy={search.busy}
          onCancel={search.cancel}
          bootError={bootError}
          summary={search.summary}
          weekendResults={search.weekendResults}
          dateResults={search.dateResults}
          nightsUsed={search.nightsUsed}
          dateUsed={search.dateUsed}
          checkedAt={search.checkedAt}
          parkStates={search.parkStates}
          weather={weather}
          hasResults={hasResults}
          sortPref={sortPref}
          setSortPref={setSortPref}
        />
      </main>

      <footer className="footer">
        <div className="container">
          Availability is scraped live from njportal.com and can change at any moment — always
          confirm on the official booking page before planning your trip. Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Open-Meteo.com
          </a>
          . NJ Park Site Finder is not affiliated with the State of New Jersey.
        </div>
      </footer>
    </>
  );
}

