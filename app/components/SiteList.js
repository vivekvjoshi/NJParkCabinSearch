import { useState } from 'react';
import SiteRow from './SiteRow.js';

// 'recommended' keeps the server order (flush+shower first, then name)
export function sortSites(sites, pref) {
  const arr = [...sites];
  if (pref === 'price') arr.sort((a, b) => (a.costRes ?? Infinity) - (b.costRes ?? Infinity));
  else if (pref === 'capacity') arr.sort((a, b) => (b.maxPeople || 0) - (a.maxPeople || 0));
  else if (pref === 'name')
    arr.sort((a, b) => String(a.shortName || a.name).localeCompare(String(b.shortName || b.name)));
  return arr;
}

// Site rows capped at maxRows with a show-all / show-less toggle.
export default function SiteList({ sites, maxRows, nights, sortPref }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = sortSites(sites, sortPref);
  const collapsible = sorted.length > maxRows;
  const shown = expanded ? sorted : sorted.slice(0, maxRows);
  const more = sorted.length - shown.length;
  return (
    <>
      {shown.map((s) => (
        <SiteRow key={s.siteId} s={s} nights={nights} />
      ))}
      {more > 0 ? (
        <button type="button" className="more-note btn-more" onClick={() => setExpanded(true)}>
          …and {more} more site{more === 1 ? '' : 's'} — show all
        </button>
      ) : null}
      {expanded && collapsible ? (
        <button type="button" className="more-note btn-more" onClick={() => setExpanded(false)}>
          Show less
        </button>
      ) : null}
    </>
  );
}
