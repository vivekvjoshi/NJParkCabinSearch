const test = require('node:test');
const assert = require('node:assert/strict');
const nj = require('../src/njoutdoors.js');

test('addDays rolls over months and years', () => {
  assert.equal(nj.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(nj.addDays('2024-02-28', 1), '2024-02-29'); // leap year
  assert.equal(nj.addDays('2026-07-04', -1), '2026-07-03');
});

test('isoToMDY formats MM/DD/YYYY', () => {
  assert.equal(nj.isoToMDY('2026-07-04'), '07/04/2026');
});

test('dayOfWeek returns UTC weekday', () => {
  assert.equal(nj.dayOfWeek('2026-07-18'), 6); // Saturday
  assert.equal(nj.dayOfWeek('2026-07-12'), 0); // Sunday
});

test('weekendsInMonth: Friday arrivals in July 2026, checkout always Sunday', () => {
  const w = nj.weekendsInMonth('2026-07', 5);
  assert.deepEqual(
    w.map((x) => x.arrival),
    ['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31']
  );
  for (const x of w) {
    assert.equal(x.nights, 2);
    assert.equal(nj.dayOfWeek(x.checkout), 0); // Sunday
    assert.equal(x.checkout, nj.addDays(x.arrival, 2));
  }
});

test('weekendsInMonth: arrival weekday maps to trip length', () => {
  for (const x of nj.weekendsInMonth('2026-07', 4)) assert.equal(x.nights, 3); // Thu → Sun
  for (const x of nj.weekendsInMonth('2026-07', 6)) assert.equal(x.nights, 1); // Sat → Sun
  assert.throws(() => nj.weekendsInMonth('2026-07', 3), /arrival must be 4, 5 or 6/);
});

test('weekendsInMonth never crosses the month boundary', () => {
  for (const x of nj.weekendsInMonth('2026-02', 5)) {
    assert.ok(x.arrival.startsWith('2026-02'), x.arrival);
  }
});
