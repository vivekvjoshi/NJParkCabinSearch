const test = require('node:test');
const assert = require('node:assert/strict');
const nj = require('../src/njoutdoors.js');

test('nightFree blocks on any booking flag', () => {
  assert.equal(nj.nightFree({}), true);
  for (const flag of ['Arrival', 'Booked', 'ClosedSeasonal', 'ClosedNonSeasonal', 'Locked', 'Unavailable']) {
    assert.equal(nj.nightFree({ [flag]: true }), false, flag);
  }
  // Inactive is intentionally NOT a blocker — matches the site's green-day logic (see trip.md)
  assert.equal(nj.nightFree({ Inactive: true }), true);
});

test('formatCost renders resident/non-resident nightly rates', () => {
  assert.equal(
    nj.formatCost({ ResidentCost: 30, NonResidentCost: 35 }),
    '$30 NJ res / $35 non-res per night'
  );
  assert.equal(nj.formatCost({ ResidentCost: 27.5 }), '$27.50');
  assert.equal(nj.formatCost({}), '');
});

test('passesFilters enforces flushOnly and minPeople', () => {
  const row = { flush: true, maxPeople: 6 };
  assert.equal(nj.passesFilters(row, { flushOnly: true, minPeople: 4 }), true);
  assert.equal(nj.passesFilters({ ...row, flush: false }, { flushOnly: true, minPeople: 4 }), false);
  assert.equal(nj.passesFilters(row, { flushOnly: false, minPeople: 8 }), false);
  assert.equal(nj.passesFilters({ ...row, flush: false }, { flushOnly: false, minPeople: 0 }), true);
});

test('sortRows puts flush+shower first, then alphabetical', () => {
  const rows = [
    { shortName: 'B', flush: false, shower: false },
    { shortName: 'C', flush: true, shower: true },
    { shortName: 'A', flush: true, shower: false },
  ];
  assert.deepEqual(nj.sortRows(rows).map((r) => r.shortName), ['C', 'A', 'B']);
});

test('parkTypeIds filters to types the park offers; empty catalog passes through', () => {
  const catalog = { types: [{ id: 1 }, { id: 8 }] };
  assert.deepEqual(nj.parkTypeIds(catalog, [1, 7, 8]), [1, 8]);
  assert.deepEqual(nj.parkTypeIds({ types: [] }, [7]), [7]);
});

test('siteRow carries numeric costs for sorting and trip totals', () => {
  const apiSite = {
    SiteDetails: {
      SiteId: 1,
      ShortName: 'A1',
      Name: 'Site A1',
      ResidentCost: '30',
      NonResidentCost: '35.5',
      MaxPeople: 6,
      SiteTypes: [{ TypeId: 8, Name: 'Tent' }],
    },
  };
  const row = nj.siteRow(apiSite, { sites: {} }, new Set(), false);
  assert.equal(row.costRes, 30);
  assert.equal(row.costNonRes, 35.5);
  assert.equal(row.cost, '$30 NJ res / $35.50 non-res per night');
  assert.equal(row.types, 'Tent');
  assert.equal(row.flush, false);
  assert.equal(row.shower, false);
});
