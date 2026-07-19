const test = require('node:test');
const assert = require('node:assert/strict');
const nj = require('../src/njoutdoors.js');

// Synthetic fixture matching the njportal Details-page markup patterns
const FIXTURE = `
<html><body>
<input type="checkbox" class="filter-checkbox type-filter" value="1" id="t1"><label for="t1">Cabin</label>
<input type="checkbox" class="filter-checkbox type-filter" value="8" id="t8"><label for="t8">Tent</label>
<input type="checkbox" class="filter-checkbox feature-filter" featureid="14" id="f14"><label for="f14">Shower Access</label>
<input type="checkbox" class="filter-checkbox feature-filter" featureid="6" id="f6"><label for="f6">Electricity Access</label>
<div class="single location-site" site="101">
  <div>Area: Jaggers Point Site Access: Drive-In Toilets: Flush Cost: $30 Maximum People: 6</div>
</div>
<div class="single location-site" site="102">
  <div>Area: Hilltop Site Access: Walk-To Toilets: Pit Cost: $20 Maximum People: 4</div>
</div>
</body></html>
`;

test('parseCatalogHtml extracts types, features and per-site catalog info', () => {
  const cat = nj.parseCatalogHtml(FIXTURE, 10);
  assert.deepEqual(cat.types, [
    { id: 1, name: 'Cabin' },
    { id: 8, name: 'Tent' },
  ]);
  assert.deepEqual(cat.features, [
    { id: 14, name: 'Shower Access' },
    { id: 6, name: 'Electricity Access' },
  ]);
  assert.equal(cat.sites['101'].area, 'Jaggers Point');
  assert.equal(cat.sites['101'].access, 'Drive-In');
  assert.equal(cat.sites['101'].toilets, 'Flush');
  assert.equal(cat.sites['102'].area, 'Hilltop');
  assert.equal(cat.sites['102'].toilets, 'Pit');
  assert.equal(cat.locationId, 10);
});
