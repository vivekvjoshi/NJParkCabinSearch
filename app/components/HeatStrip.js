import { fmtDate, plural } from '../lib/format.js';

// Sticky month overview for weekend mode: one tile per weekend, bar height =
// available sites, fills in live as parks return. Click jumps to the card.
export default function HeatStrip({ weekends }) {
  const max = Math.max(0, ...weekends.map((w) => w.totalSites));
  const jump = (arrival) => {
    document.getElementById('wk-' + arrival)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="heat-wrap">
      <div className="heat-row" role="navigation" aria-label="Jump to a weekend">
        {weekends.map((w) => {
          const isBest = w.totalSites > 0 && w.totalSites === max;
          return (
            <button
              key={w.arrival}
              type="button"
              className={
                'heat-tile' + (w.totalSites ? '' : ' heat-empty') + (isBest ? ' heat-best' : '')
              }
              onClick={() => jump(w.arrival)}
              title={`${fmtDate(w.arrival)} → ${fmtDate(w.checkout)} — ${plural(w.totalSites, 'site')}`}
            >
              <span className="heat-label">{fmtDate(w.arrival)}</span>
              <span className="heat-bar" aria-hidden="true">
                <span
                  className="heat-fill"
                  style={{ height: `${w.totalSites ? Math.max(12, (w.totalSites / max) * 100) : 8}%` }}
                />
              </span>
              <span className="heat-count">{w.totalSites}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
