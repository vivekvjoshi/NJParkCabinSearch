const ICONS = { pending: '·', checking: '…', ok: '✓', empty: '—', error: '⚠️' };
const LABELS = {
  pending: 'queued',
  checking: 'checking…',
  ok: 'has availability',
  empty: 'nothing found',
  error: 'failed to load',
};

// Compact per-park live status shown while a search runs (and kept after, so
// failures — e.g. in weekend mode — stay visible instead of being swallowed).
export default function ParkStatusGrid({ meta, parkStates }) {
  const ids = Object.keys(parkStates || {});
  if (!meta || !ids.length) return null;
  const selected = new Set(ids.map(Number));
  return (
    <div className="park-status" aria-label="Per-park status">
      {meta.parks
        .filter((p) => selected.has(p.id))
        .map((p) => {
          const st = parkStates[p.id] || 'pending';
          return (
            <span key={p.id} className={'ps-chip ps-' + st} title={`${p.name}: ${LABELS[st]}`}>
              <span className="ps-icon" aria-hidden="true">
                {ICONS[st]}
              </span>
              {p.name}
            </span>
          );
        })}
    </div>
  );
}
