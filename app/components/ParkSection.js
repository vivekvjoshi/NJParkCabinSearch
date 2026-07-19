import { plural } from '../lib/format.js';
import SiteList from './SiteList.js';
import WeatherBadge from './WeatherBadge.js';

export default function ParkSection({ p, maxRows, nights, sortPref, arrival, days }) {
  const minCost = p.sites.reduce((m, s) => Math.min(m, s.costRes ?? Infinity), Infinity);
  return (
    <div className="park-section">
      <div className="park-section-head">
        <div className="park-section-title">
          {p.park} ·{' '}
          <span className={'count ' + (p.count >= 10 ? 'count-high' : 'count-low')}>
            {plural(p.count, 'site')}
          </span>
          {minCost !== Infinity ? <span className="from-price">{`from ${minCost}/night`}</span> : null}
        </div>
        <div className="park-section-side">
          <WeatherBadge days={days} arrival={arrival} nights={nights} />
          <a className="link-book" href={p.bookUrl} target="_blank" rel="noopener noreferrer">
            Book ↗
          </a>
        </div>
      </div>
      <SiteList sites={p.sites} maxRows={maxRows} nights={nights} sortPref={sortPref} />
    </div>
  );
}
