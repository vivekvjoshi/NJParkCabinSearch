import Chip from './Chip.js';
import { toggled } from '../lib/format.js';

// Mode tabs + the segmented search bar for the active mode + stay-type chips
// + the peak-season min-stay warning.
export default function SearchControls(props) {
  const {
    meta,
    mode,
    setMode,
    month,
    setMonth,
    monthOptions,
    arrival,
    setArrival,
    minPeopleW,
    setMinPeopleW,
    dateVal,
    setDateVal,
    nights,
    setNights,
    minPeopleD,
    setMinPeopleD,
    busy,
    types,
    setTypes,
    showMinStayBanner,
    onSearchWeekend,
    onSearchDate,
  } = props;

  return (
    <>
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
          <button className="btn-search" type="button" onClick={onSearchWeekend} disabled={!meta || busy}>
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
          <button className="btn-search" type="button" onClick={onSearchDate} disabled={!meta || busy}>
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
    </>
  );
}
