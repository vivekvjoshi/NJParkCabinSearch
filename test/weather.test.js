const test = require('node:test');
const assert = require('node:assert/strict');
const wxui = require('../app/lib/weather.js');
const { computeNormals } = require('../src/weather.js');

test('addDays rolls over months', () => {
  assert.equal(wxui.addDays('2026-07-31', 1), '2026-08-01');
  assert.equal(wxui.addDays('2026-01-01', -1), '2025-12-31');
});

test('codeRank orders camping-relevant severity', () => {
  assert.ok(wxui.codeRank(95) > wxui.codeRank(61)); // thunderstorm > rain
  assert.ok(wxui.codeRank(61) > wxui.codeRank(51)); // rain > drizzle
  assert.ok(wxui.codeRank(51) > wxui.codeRank(3)); // drizzle > overcast
  assert.ok(wxui.codeRank(3) > wxui.codeRank(0)); // overcast > clear
});

test('codeInfo maps WMO codes to icon+label', () => {
  assert.deepEqual(wxui.codeInfo(0), { icon: '☀️', label: 'Clear' });
  assert.equal(wxui.codeInfo(2).label, 'Partly cloudy');
  assert.equal(wxui.codeInfo(61).label, 'Rain');
  assert.equal(wxui.codeInfo(95).label, 'Thunderstorms');
  assert.equal(wxui.codeInfo(null).label, 'Forecast');
});

test('stayForecast aggregates hi/lo/precip over the stay, worst condition wins', () => {
  const days = {
    '2026-07-24': { hi: 84, lo: 63, precip: 10, code: 1 },
    '2026-07-25': { hi: 79, lo: 58, precip: 40, code: 61 },
    '2026-07-26': { hi: 88, lo: 66, precip: 5, code: 0 },
  };
  const wx = wxui.stayForecast(days, '2026-07-24', 2);
  assert.equal(wx.hi, 88);
  assert.equal(wx.lo, 58);
  assert.equal(wx.precip, 40);
  assert.equal(wx.code, 61); // rain outranks clear
});

test('stayForecast skips missing days and returns null when fully out of window', () => {
  const days = { '2026-07-24': { hi: 84, lo: 63, precip: 10, code: 1 } };
  const wx = wxui.stayForecast(days, '2026-07-24', 3); // only arrival day in window
  assert.equal(wx.hi, 84);
  assert.equal(wxui.stayForecast(days, '2026-09-01', 2), null);
  assert.equal(wxui.stayForecast(null, '2026-07-24', 2), null);
  assert.equal(wxui.stayForecast(days, 'not-a-date', 2), null);
});

test('computeNormals averages hi/lo and wet-day share per MM-DD', () => {
  const list = [
    {
      daily: {
        time: ['2023-07-20', '2024-07-20', '2025-07-20', '2023-07-21'],
        temperature_2m_max: [80, 84, 86, 90],
        temperature_2m_min: [60, 64, 62, 70],
        precipitation_sum: [0, 2.5, 0, 0],
      },
    },
  ];
  const n = computeNormals(list, [10]);
  assert.deepEqual(n[10]['07-20'], { hi: 83, lo: 62, wet: 33 }); // 1 of 3 days ≥1mm
  assert.deepEqual(n[10]['07-21'], { hi: 90, lo: 70, wet: 0 });
});

test('typicalForStay averages normals over the stay, worst wet-day share', () => {
  const normals = {
    '07-20': { hi: 80, lo: 60, wet: 20 },
    '07-21': { hi: 84, lo: 64, wet: 40 },
    '07-22': { hi: 86, lo: 66, wet: 10 },
  };
  const ty = wxui.typicalForStay(normals, '2026-07-20', 2);
  assert.deepEqual(ty, { hi: 83, lo: 63, wet: 40 });
  assert.equal(wxui.typicalForStay(null, '2026-07-20', 2), null);
  assert.equal(wxui.typicalForStay(normals, 'bad', 2), null);
});
