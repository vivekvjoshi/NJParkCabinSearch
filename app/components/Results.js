import { useRef, useState } from 'react';
import HeatStrip from './HeatStrip.js';
import MinStayHint from './MinStayHint.js';
import ParkSection from './ParkSection.js';
import ParkStatusGrid from './ParkStatusGrid.js';
import SiteList from './SiteList.js';
import WeatherBadge from './WeatherBadge.js';
import { fmtDate, fmtTime, plural } from '../lib/format.js';

function SkeletonCards() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="card sk-card" key={i}>
          <div className="sk sk-line w40" />
          <div className="sk sk-line w70" />
          <div className="sk sk-line w55" />
        </div>
      ))}
    </div>
  );
}

// Right column: progress, per-park status, summary banners, heat strip,
// sort toolbar, result cards, empty state.
export default function Results(props) {
  const {
    meta,
    onQuickStart,
    showProgress,
    progress,
    status,
    busy,
    onCancel,
    bootError,
    summary,
    weekendResults,
    dateResults,
    nightsUsed,
    dateUsed,
    checkedAt,
    parkStates,
    weather,
    hasResults,
    sortPref,
    setSortPref,
  } = props;

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const bestCount = weekendResults?.length
    ? Math.max(0, ...weekendResults.map((w) => w.totalSites))
    : 0;

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('🔗 Link copied — opening it re-runs this search');
    } catch {
      showToast('Copy failed — use the address bar');
    }
  }

  const showToolbar =
    Boolean(weekendResults?.some((w) => w.totalSites > 0)) ||
    Boolean(dateResults?.some((r) => !r.error && !r.skipped && (r.sites || []).length > 0));

  return (
    <section className="results-col" aria-busy={busy}>
      {showProgress ? (
        <div className="progress-wrap">
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="status-line" aria-live="polite">
            {status}
            {busy ? (
              <button type="button" className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ParkStatusGrid meta={meta} parkStates={parkStates} />

      {bootError ? <div className="banner banner-error">Failed to load app metadata: {bootError}</div> : null}

      {summary?.kind === 'ok' && summary.best ? (
        <div className="banner banner-summary">
          🏆 Best weekend:{' '}
          <strong>
            {fmtDate(summary.best.arrival)} → {fmtDate(summary.best.checkout)}
          </strong>{' '}
          with {plural(summary.best.totalSites, 'available site')} across{' '}
          {plural(summary.best.parks.length, 'park')}.
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

      {checkedAt && hasResults ? (
        <div className="checked-line">
          Live availability checked at {fmtTime(checkedAt)} — confirm on the booking page.
        </div>
      ) : null}

      {showToolbar ? (
        <div className="result-toolbar">
          <label htmlFor="site-sort">Sort sites</label>
          <select id="site-sort" value={sortPref} onChange={(e) => setSortPref(e.target.value)}>
            <option value="recommended">Recommended</option>
            <option value="price">Price · low to high</option>
            <option value="capacity">Capacity · high to low</option>
            <option value="name">Name · A to Z</option>
          </select>
          <button type="button" className="btn-copy" onClick={copyLink}>
            🔗 Copy link
          </button>
        </div>
      ) : null}

      {weekendResults?.length ? <HeatStrip weekends={weekendResults} /> : null}

      {busy && !weekendResults && !dateResults ? <SkeletonCards /> : null}

      {weekendResults
        ? weekendResults.map((w) => {
            const head = `🗓️ ${fmtDate(w.arrival)} → ${fmtDate(w.checkout)} · ${plural(w.nights, 'night')} · ${plural(w.totalSites, 'site')}`;
            const isBest = w.totalSites > 0 && w.totalSites === bestCount;
            return w.totalSites ? (
              <div className={'card' + (isBest ? ' card-best' : '')} key={w.arrival} id={'wk-' + w.arrival}>
                <div className="card-head">
                  <div className="card-title">
                    {head} across {plural(w.parks.length, 'park')}
                    {isBest ? <span className="best-pill">🏆 Best</span> : null}
                  </div>
                </div>
                {w.parks.map((p) => (
                  <ParkSection
                    key={p.locationId}
                    p={p}
                    maxRows={4}
                    nights={w.nights}
                    sortPref={sortPref}
                    arrival={w.arrival}
                    days={weather?.[p.locationId]}
                  />
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
            return (
              <div className="card" key={r.locationId}>
                <div className="card-head">
                  <div>
                    <div className="card-title">{r.park}</div>
                    <div className="card-sub">
                      {r.sites.length} of {plural(r.totalMatching, 'matching site')} available
                    </div>
                  </div>
                  <div className="park-section-side">
                    <WeatherBadge days={weather?.[r.locationId]} arrival={dateUsed} nights={nightsUsed} />
                    <a className="btn-book" href={r.bookUrl} target="_blank" rel="noopener noreferrer">
                      Book ↗
                    </a>
                  </div>
                </div>
                {r.sites.length ? (
                  <div className="park-section">
                    <SiteList sites={r.sites} maxRows={8} nights={nightsUsed} sortPref={sortPref} />
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
          {meta ? (
            <button type="button" className="btn-search btn-empty-cta" onClick={onQuickStart}>
              Scan this month’s weekends
            </button>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
