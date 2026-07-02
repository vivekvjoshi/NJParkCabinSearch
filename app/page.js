'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${MON[m - 1]} ${d}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const bookUrlFor = (id) => `https://www.njportal.com/DEP/NJOutdoors/Park/Details?locationId=${id}`;

// all candidate weekends of a month for an arrival weekday; checkout is always Sunday
function weekendTemplates(month, arrivalDow, today) {
  const nights = { 4: 3, 5: 2, 6: 1 }[arrivalDow];
  const [y, m] = month.split('-').map(Number);
  const templates = [];
  for (let day = 1; day <= 31; day++) {
    const dt = new Date(Date.UTC(y, m - 1, day));
    if (dt.getUTCMonth() !== m - 1) break;
    if (dt.getUTCDay() !== arrivalDow) continue;
    const iso = dt.toISOString().slice(0, 10);
    if (iso < today) continue;
    const co = new Date(Date.UTC(y, m - 1, day + nights));
    templates.push({ arrival: iso, checkout: co.toISOString().slice(0, 10), nights });
  }
  return templates;
}

function toggled(set, id) {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

function Chip({ label, on, onClick }) {
  return (
    <button type="button" className={'chip' + (on ? ' on' : '')} onClick={onClick}>
      {label}
    </button>
  );
}

function SiteRow({ s }) {
  const meta = [s.area, s.access, s.maxPeople ? `max ${s.maxPeople} ppl` : '', s.cost]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="site-row">
      <div className="site-main">
        <div className="site-name">
          {s.shortName || s.name}
          {s.name && s.name !== s.shortName ? <span className="site-meta"> {s.name}</span> : null}
        </div>
        <div className="site-meta">{meta}</div>
      </div>
      <div className="badges">
        {s.types ? <span className="badge">{s.types}</span> : null}
        {s.flush ? <span className="badge badge-flush">🚽 Flush</span> : null}
        {s.shower ? <span className="badge badge-shower">🚿 Shower</span> : null}
      </div>
    </div>
  );
}

function ParkSection({ p, maxRows }) {
  const shown = p.sites.slice(0, maxRows);
  const more = p.sites.length - shown.length;
  return (
    <div className="park-section">
      <div className="park-section-head">
        <div className="park-section-title">
          {p.park} · <span className="count">{plural(p.count, 'site')}</span>
        </div>
        <a className="link-book" href={p.bookUrl} target="_blank" rel="noopener noreferrer">
          Book ↗
        </a>
      </div>
      {shown.map((s) => (
        <SiteRow key={s.siteId} s={s} />
      ))}
      {more > 0 ? <div className="more-note">…and {plural(more, 'more site')}</div> : null}
    </div>
  );
}

function MinStayHint() {
  return (
    <>
      {' '}
      Heads up: in peak season (mid-June–Labor&nbsp;Day),{' '}
      <strong>cabins, lean-tos and shelters can only be booked 7 or 14 nights starting on a fixed weekday</strong>{' '}
      that varies by park — short weekend stays are usually blocked. Try the <strong>Tent</strong> or{' '}
      <strong>Trailer</strong> site types instead, or search a 7-night stay in Specific dates mode.
    </>
  );
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

  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState(null); // {kind:'ok'|'empty'|'error', text?, prefix?, minStay?}
  const [dateResults, setDateResults] = useState(null);
  const [weekendResults, setWeekendResults] = useState(null);

  const [nlQuery, setNlQuery] = useState('');
  const [nlNote, setNlNote] = useState(null);
  const [nlBusy, setNlBusy] = useState(false);

  const runRef = useRef(0);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then((m) => {
        setMeta(m);
        setParks(new Set(m.parks.map((p) => p.id))); // all parks on by default
        setDateVal(m.today);
      })
      .catch((err) => setBootError(String(err.message || err)));
  }, []);

  const monthOptions = useMemo(() => {
    if (!meta) return [];
    const [ty, tm] = meta.today.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.UTC(ty, tm - 1 + i, 1));
      return {
        value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        label: `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      };
    });
  }, [meta]);

  useEffect(() => {
    if (monthOptions.length && !month) setMonth(monthOptions[0].value);
  }, [monthOptions, month]);

  const parkName = (id) => (meta?.parks.find((p) => p.id === id) || {}).name || `Park ${id}`;
  const minStaySelected = (typeIds) =>
    Boolean(meta && meta.minStayTypeIds.some((id) => typeIds.includes(id)));

  function beginSearch() {
    if (!parks.size) {
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
    return run;
  }

  async function fetchPark(params) {
    const resp = await fetch('/api/park?' + new URLSearchParams(params));
    return resp.json();
  }

  async function runDateSearch(cfg) {
    const run = beginSearch();
    if (!run) return;
    const results = [];
    let availableCount = 0;
    let parksWithSites = 0;
    const started = Date.now();
    for (let i = 0; i < cfg.parks.length; i++) {
      if (runRef.current !== run) return;
      const id = cfg.parks[i];
      setProgress(Math.round((i / cfg.parks.length) * 100));
      setStatus(`Checking ${parkName(id)}… (${i + 1} of ${cfg.parks.length} parks)`);
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
        r = { locationId: id, park: parkName(id), bookUrl: bookUrlFor(id), error: String(err.message || err), sites: [], totalMatching: 0 };
      }
      if (runRef.current !== run) return;
      results.push(r);
      availableCount += (r.sites || []).length;
      if ((r.sites || []).length) parksWithSites++;
      setDateResults([...results].sort((a, b) => (b.sites?.length || 0) - (a.sites?.length || 0)));
    }
    setProgress(100);
    setStatus(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
    setSummary(
      availableCount > 0
        ? {
            kind: 'ok',
            text: `✅ ${plural(availableCount, 'site')} available across ${plural(parksWithSites, 'park')} for ${fmtDate(cfg.date)}, ${plural(+cfg.nights, 'night')}.`,
          }
        : { kind: 'empty', prefix: 'No available sites found for these dates and filters.', minStay: minStaySelected(cfg.types) }
    );
    setBusy(false);
  }

  async function runWeekendSearch(cfg) {
    const run = beginSearch();
    if (!run) return;
    const merged = new Map(
      weekendTemplates(cfg.month, parseInt(cfg.arrival, 10), meta.today).map((w) => [
        w.arrival,
        { ...w, totalSites: 0, parks: [] },
      ])
    );
    const started = Date.now();
    const notes = [];
    for (let i = 0; i < cfg.parks.length; i++) {
      if (runRef.current !== run) return;
      const id = cfg.parks[i];
      setProgress(Math.round((i / cfg.parks.length) * 100));
      setStatus(`Checking ${parkName(id)}… (${i + 1} of ${cfg.parks.length} parks)`);
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
        let parkTotal = 0;
        for (const [iso, w] of Object.entries(r.weekends || {})) {
          const bucket = merged.get(iso);
          if (!bucket || !w.sites.length) continue;
          bucket.totalSites += w.sites.length;
          bucket.parks.push({ locationId: id, park: r.park, bookUrl: r.bookUrl, count: w.sites.length, sites: w.sites });
          parkTotal += w.sites.length;
        }
        notes.push(`${r.park}: ${parkTotal}`);
        setStatus(`Latest — ${notes.slice(-3).join(' · ')} site-weekends`);
      } catch (err) {
        notes.push(`${parkName(id)}: error`);
      }
    }
    if (runRef.current !== run) return;
    const weekends = [...merged.values()].sort((a, b) => a.arrival.localeCompare(b.arrival));
    for (const w of weekends) w.parks.sort((a, b) => b.count - a.count);
    setProgress(100);
    setStatus(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
    setWeekendResults(weekends);
    const best = weekends.length ? weekends.reduce((a, b) => (b.totalSites > a.totalSites ? b : a)) : null;
    setSummary(
      best && best.totalSites > 0
        ? {
            kind: 'ok',
            best,
          }
        : {
            kind: 'empty',
            prefix: weekends.length
              ? 'No weekend availability found for these filters.'
              : 'No upcoming weekends left in that month.',
            minStay: minStaySelected(cfg.types),
          }
    );
    setBusy(false);
  }

  const cfgFromState = () => ({
    parks: [...parks],
    types: [...types],
    features: [...features],
    flushOnly,
  });

  const searchWeekend = () =>
    runWeekendSearch({ ...cfgFromState(), month, arrival, minPeople: minPeopleW || '0' });
  const searchDate = () =>
    runDateSearch({ ...cfgFromState(), date: dateVal, nights, minPeople: minPeopleD || '0' });

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
        runDateSearch({ ...cfg, date, nights: String(p.nights || 2) });
      } else {
        const m = p.month && monthOptions.some((o) => o.value === p.month) ? p.month : month;
        setMonth(m);
        setArrival(String(p.arrival || 5));
        setMinPeopleW(String(p.minPeople || 0));
        runWeekendSearch({ ...cfg, month: m, arrival: String(p.arrival || 5) });
      }
    } catch (err) {
      setNlNote(`⚠️ ${err.message}`);
    } finally {
      setNlBusy(false);
    }
  }

  const showMinStayBanner = meta && meta.minStayTypeIds.some((id) => types.has(id));
  const hasResults = dateResults !== null || weekendResults !== null || summary !== null;

  return (
    <>
      <nav className="topnav">
        <div className="nav-inner">
          <a className="brand" href="/">
            <span className="brand-mark">⛺</span>
            <span className="brand-name">NJ&nbsp;Park&nbsp;Site&nbsp;Finder</span>
          </a>
          <div className="nav-links">
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
          {nlNote ? <div className="nl-note">{nlNote}</div> : null}

          <div className="mode-tabs" role="tablist">
            <button
              className={'mode-tab' + (mode === 'weekend' ? ' active' : '')}
              role="tab"
              aria-selected={mode === 'weekend'}
              onClick={() => setMode('weekend')}
            >
              🗓️ Weekend finder
            </button>
            <button
              className={'mode-tab' + (mode === 'date' ? ' active' : '')}
              role="tab"
              aria-selected={mode === 'date'}
              onClick={() => setMode('date')}
            >
              📅 Specific dates
            </button>
          </div>

          {mode === 'weekend' ? (
            <div className="search-bar">
              <label className="field">
                <span className="field-label">Month</span>
                <select value={month} onChange={(e) => setMonth(e.target.value)}>
                  {monthOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Weekend</span>
                <select value={arrival} onChange={(e) => setArrival(e.target.value)}>
                  <option value="5">Fri → Sun · 2 nights</option>
                  <option value="6">Sat → Sun · 1 night</option>
                  <option value="4">Thu → Sun · 3 nights</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Party size</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  title="0 = any size"
                  value={minPeopleW}
                  onChange={(e) => setMinPeopleW(e.target.value)}
                />
              </label>
              <button className="btn-search" type="button" onClick={searchWeekend} disabled={busy}>
                {busy ? 'Searching…' : 'Search'}
              </button>
            </div>
          ) : (
            <div className="search-bar">
              <label className="field">
                <span className="field-label">Arrival</span>
                <input
                  type="date"
                  min={meta?.today}
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Nights</span>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={nights}
                  onChange={(e) => setNights(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Party size</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  title="0 = any size"
                  value={minPeopleD}
                  onChange={(e) => setMinPeopleD(e.target.value)}
                />
              </label>
              <button className="btn-search" type="button" onClick={searchDate} disabled={busy}>
                {busy ? 'Searching…' : 'Search'}
              </button>
            </div>
          )}

          <div className="type-row">
            <span className="row-label">Stay in</span>
            <div className="chips">
              {meta?.types.map((t) => (
                <Chip key={t.id} label={t.name} on={types.has(t.id)} onClick={() => setTypes(toggled(types, t.id))} />
              ))}
            </div>
          </div>

          {showMinStayBanner ? (
            <div className="banner banner-warn">
              ⚠️ <strong>Peak-season rule:</strong> mid-June through Labor Day, cabins, lean-tos and
              shelters can only be booked for <strong>7 or 14 nights starting on a fixed weekday</strong>{' '}
              that varies by park (usually Saturday). Weekend results for these types may be empty —
              confirm the arrival-day rule at checkout.
            </div>
          ) : null}
        </div>
      </header>

      <main className="container layout">
        <aside className="rail">
          <section className="rail-card">
            <div className="rail-head">
              <h3>Parks</h3>
              <span className="mini-links">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setParks(new Set(meta.parks.map((p) => p.id)));
                  }}
                >
                  all
                </a>{' '}
                ·{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setParks(new Set());
                  }}
                >
                  none
                </a>
              </span>
            </div>
            <div className="chips chips-wrap">
              {meta?.parks.map((p) => (
                <Chip key={p.id} label={p.name} on={parks.has(p.id)} onClick={() => setParks(toggled(parks, p.id))} />
              ))}
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-head">
              <h3>Comfort</h3>
            </div>
            <div className="chips chips-wrap">
              <Chip label="🚽 Flush toilets" on={flushOnly} onClick={() => setFlushOnly(!flushOnly)} />
              {meta ? (
                <Chip
                  label="🚿 Showers"
                  on={features.has(meta.showerFeatureId)}
                  onClick={() => setFeatures(toggled(features, meta.showerFeatureId))}
                />
              ) : null}
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-head">
              <h3>Features</h3>
            </div>
            <div className="chips chips-wrap">
              {meta?.features
                .filter((f) => f.id !== meta.showerFeatureId)
                .map((f) => (
                  <Chip key={f.id} label={f.name} on={features.has(f.id)} onClick={() => setFeatures(toggled(features, f.id))} />
                ))}
            </div>
          </section>
        </aside>

        <section className="results-col">
          {showProgress ? (
            <div className="progress-wrap">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="status-line">{status}</div>
            </div>
          ) : null}

          {bootError ? <div className="banner banner-error">Failed to load app metadata: {bootError}</div> : null}

          {summary?.kind === 'ok' && summary.best ? (
            <div className="banner banner-summary">
              🏆 Best weekend:{' '}
              <strong>
                {fmtDate(summary.best.arrival)} → {fmtDate(summary.best.checkout)}
              </strong>{' '}
              with {plural(summary.best.totalSites, 'available site')} across {plural(summary.best.parks.length, 'park')}.
            </div>
          ) : null}
          {summary?.kind === 'ok' && summary.text ? (
            <div className="banner banner-summary">{summary.text}</div>
          ) : null}
          {summary?.kind === 'empty' ? (
            <div className="banner banner-error">
              {summary.prefix}
              {summary.minStay ? <MinStayHint /> : null}
            </div>
          ) : null}
          {summary?.kind === 'error' ? <div className="banner banner-error">{summary.text}</div> : null}

          {weekendResults
            ? weekendResults.map((w) => {
                const head = `🗓️ ${fmtDate(w.arrival)} → ${fmtDate(w.checkout)} · ${plural(w.nights, 'night')} · ${plural(w.totalSites, 'site')}`;
                return w.totalSites ? (
                  <div className="card" key={w.arrival}>
                    <div className="card-head">
                      <div className="card-title">
                        {head} across {plural(w.parks.length, 'park')}
                      </div>
                    </div>
                    {w.parks.map((p) => (
                      <ParkSection key={p.locationId} p={p} maxRows={4} />
                    ))}
                  </div>
                ) : (
                  <div className="card card-muted" key={w.arrival}>
                    <div className="card-head">
                      <div className="card-title">{head} — nothing available</div>
                    </div>
                  </div>
                );
              })
            : null}

          {dateResults
            ? dateResults.map((r) => {
                if (r.error) {
                  return (
                    <div className="card card-muted" key={r.locationId}>
                      <div className="card-head">
                        <div className="card-title">
                          ⚠️ {r.park} — couldn’t be checked ({r.error})
                        </div>
                      </div>
                    </div>
                  );
                }
                if (r.skipped) {
                  return (
                    <div className="card card-muted" key={r.locationId}>
                      <div className="card-head">
                        <div className="card-title">{r.park} — doesn’t offer the selected site types</div>
                      </div>
                    </div>
                  );
                }
                const shown = r.sites.slice(0, 8);
                const more = r.sites.length - shown.length;
                return (
                  <div className="card" key={r.locationId}>
                    <div className="card-head">
                      <div>
                        <div className="card-title">{r.park}</div>
                        <div className="card-sub">
                          {r.sites.length} of {plural(r.totalMatching, 'matching site')} available
                        </div>
                      </div>
                      <a className="btn-book" href={r.bookUrl} target="_blank" rel="noopener noreferrer">
                        Book ↗
                      </a>
                    </div>
                    {shown.length ? (
                      <div className="park-section">
                        {shown.map((s) => (
                          <SiteRow key={s.siteId} s={s} />
                        ))}
                        {more > 0 ? <div className="more-note">…and {plural(more, 'more site')}</div> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : null}

          {!hasResults && !bootError ? (
            <div className="empty-state">
              <div className="empty-art">🏕️</div>
              <h2>Ready when you are</h2>
              <p>
                Pick a month and hit <strong>Search</strong> to scan every weekend across the parks
                you’ve selected — or ask in plain English above.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          Availability is scraped live from njportal.com and can change at any moment — always
          confirm on the official booking page before planning your trip. NJ Park Site Finder is not
          affiliated with the State of New Jersey.
        </div>
      </footer>
    </>
  );
}
