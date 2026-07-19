import Chip from './Chip.js';
import { toggled } from '../lib/format.js';

const REGIONS = [
  { name: 'North Jersey', ids: [7, 8, 13, 14, 15, 16, 18, 20] },
  { name: 'Central Jersey', ids: [2, 6, 11, 12, 17] },
  { name: 'South Jersey & Pinelands', ids: [3, 4, 5, 10, 19] },
];

// Left rail: region-grouped park picker (all/none), comfort shortcuts, features.
export default function FilterRail({ meta, parks, setParks, flushOnly, setFlushOnly, features, setFeatures }) {
  if (!meta) {
    return (
      <aside className="rail" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <section className="rail-card" key={i}>
            <div className="sk sk-line w40" />
            <div className="sk sk-block" />
            <div className="sk sk-block" />
          </section>
        ))}
      </aside>
    );
  }

  const byId = new Map(meta.parks.map((p) => [p.id, p]));
  const setRegion = (ids, on) => {
    const next = new Set(parks);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setParks(next);
  };

  return (
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
        {REGIONS.map((r) => {
          const list = r.ids.map((id) => byId.get(id)).filter(Boolean);
          if (!list.length) return null;
          return (
            <div className="rail-group" key={r.name}>
              <div className="rail-group-head">
                <span>{r.name}</span>
                <span className="mini-links">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setRegion(r.ids, true);
                    }}
                  >
                    all
                  </a>{' '}
                  ·{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setRegion(r.ids, false);
                    }}
                  >
                    none
                  </a>
                </span>
              </div>
              <div className="chips chips-wrap">
                {list.map((p) => (
                  <Chip key={p.id} label={p.name} on={parks.has(p.id)} onClick={() => setParks(toggled(parks, p.id))} />
                ))}
              </div>
            </div>
          );
        })}
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
  );
}
