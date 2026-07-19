const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNlQuery, extractJson } = require('../src/nl.js');

test('extractJson strips reasoning/prose around the JSON object', () => {
  assert.deepEqual(extractJson('thinking out loud {"a": 1, "b": [2]} trailing'), { a: 1, b: [2] });
  assert.throws(() => extractJson('no object here'), /no JSON/);
});

test('parseNlQuery fails with 503 when NVIDIA_API_KEY is not set', async () => {
  const old = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    await assert.rejects(() => parseNlQuery('cabin this weekend'), (err) => {
      assert.equal(err.statusCode, 503);
      return true;
    });
  } finally {
    if (old !== undefined) process.env.NVIDIA_API_KEY = old;
  }
});

test('parseNlQuery sanitizes model output against the known ID tables', async () => {
  const oldKey = process.env.NVIDIA_API_KEY;
  const oldFetch = global.fetch;
  process.env.NVIDIA_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content:
              'reasoning… {"mode":"weekend","month":"2026-07","arrival":5,"types":[1,999],"features":[14,777],"flushOnly":true,"minPeople":4,"parks":[3,999],"note":"got it"}',
          },
        },
      ],
    }),
  });
  try {
    const p = await parseNlQuery('cabin for 4 with showers in July');
    assert.equal(p.mode, 'weekend');
    assert.equal(p.month, '2026-07');
    assert.deepEqual(p.types, [1]); // 999 dropped
    assert.deepEqual(p.features, [14]); // 777 dropped
    assert.deepEqual(p.parks, [3]); // 999 dropped
    assert.equal(p.flushOnly, true);
    assert.equal(p.minPeople, 4);
    assert.equal(p.note, 'got it');
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = oldKey;
  }
});
