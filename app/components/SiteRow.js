import { totalCost } from '../lib/format.js';

export default function SiteRow({ s, nights }) {
  const meta = [s.area, s.access, s.maxPeople ? `max ${s.maxPeople} ppl` : '', s.cost]
    .filter(Boolean)
    .join(' · ');
  const total = totalCost(s, nights);
  return (
    <div className="site-row">
      <div className="site-main">
        <div className="site-name">
          {s.shortName || s.name}
          {s.name && s.name !== s.shortName ? <span className="site-meta"> {s.name}</span> : null}
        </div>
        <div className="site-meta">
          {meta}
          {total ? ` · ≈ $${total} total` : ''}
        </div>
      </div>
      <div className="badges">
        {s.types ? <span className="badge">{s.types}</span> : null}
        {s.flush ? <span className="badge badge-flush">🚽 Flush</span> : null}
        {s.shower ? <span className="badge badge-shower">🚿 Shower</span> : null}
      </div>
    </div>
  );
}
