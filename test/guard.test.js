const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../src/guard.js');

test('rateLimit allows up to the limit, then blocks with Retry-After', () => {
  const key = 'test:rl1';
  assert.equal(guard.rateLimit(key, 2, 60_000).ok, true);
  assert.equal(guard.rateLimit(key, 2, 60_000).ok, true);
  const third = guard.rateLimit(key, 2, 60_000);
  assert.equal(third.ok, false);
  assert.ok(third.retryAfterSec >= 1);
  // different keys are independent
  assert.equal(guard.rateLimit('test:rl2', 2, 60_000).ok, true);
});

test('cacheGet/cacheSet honor the TTL', () => {
  guard.cacheSet('test:c1', { hello: 1 }, 60_000);
  assert.deepEqual(guard.cacheGet('test:c1'), { hello: 1 });
  guard.cacheSet('test:c2', { old: true }, -1); // negative TTL = already expired
  assert.equal(guard.cacheGet('test:c2'), null);
});

test('dedupe runs the function once for concurrent callers', async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 25));
    return 'value';
  };
  const [a, b] = await Promise.all([guard.dedupe('test:d1', fn), guard.dedupe('test:d1', fn)]);
  assert.equal(a, 'value');
  assert.equal(b, 'value');
  assert.equal(calls, 1);
  // after settlement the next call re-executes
  assert.equal(await guard.dedupe('test:d1', fn), 'value');
  assert.equal(calls, 2);
});
