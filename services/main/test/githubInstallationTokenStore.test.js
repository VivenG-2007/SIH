const test = require('node:test');
const assert = require('node:assert');

const redis = require('../src/config/redis');
const githubApp = require('../src/config/githubApp');
const installationTokenStore = require('../src/services/githubInstallationTokenStore');

// Clean any leftover cache keys before/after each test so tests don't leak
// state into each other (the mock Redis instance is shared process-wide).
async function clearCache(installationId) {
  await redis.del(`github:installation_token:${installationId}`);
}

test('getToken mints and caches a token on first call', async (t) => {
  await clearCache('111');
  let mintCalls = 0;
  t.mock.method(githubApp, 'mintInstallationToken', async () => {
    mintCalls += 1;
    return { token: 'ghs_fresh', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  });

  const token = await installationTokenStore.getToken('111');

  assert.strictEqual(token, 'ghs_fresh');
  assert.strictEqual(mintCalls, 1);
  await clearCache('111');
});

test('getToken reuses a cached token that is well within its expiry', async (t) => {
  await clearCache('222');
  let mintCalls = 0;
  t.mock.method(githubApp, 'mintInstallationToken', async () => {
    mintCalls += 1;
    return { token: `ghs_${mintCalls}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  });

  const first = await installationTokenStore.getToken('222');
  const second = await installationTokenStore.getToken('222');
  const third = await installationTokenStore.getToken('222');

  assert.strictEqual(mintCalls, 1);
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
  await clearCache('222');
});

test('getToken re-mints when the cached token is within the refresh margin of expiring', async (t) => {
  await clearCache('333');
  // Seed the cache directly with a token that's about to expire (30s left,
  // well inside the 2-minute refresh margin).
  await redis.set(
    'github:installation_token:333',
    JSON.stringify({ token: 'ghs_about_to_expire', expiresAt: new Date(Date.now() + 30 * 1000).toISOString() }),
    'EX',
    60
  );
  let mintCalls = 0;
  t.mock.method(githubApp, 'mintInstallationToken', async () => {
    mintCalls += 1;
    return { token: 'ghs_freshly_minted', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  });

  const token = await installationTokenStore.getToken('333');

  assert.strictEqual(token, 'ghs_freshly_minted');
  assert.strictEqual(mintCalls, 1);
  await clearCache('333');
});

test('getToken re-mints (rather than throwing) when the cache is unreadable', async (t) => {
  await clearCache('444');
  t.mock.method(redis, 'get', async () => {
    throw new Error('connection reset');
  });
  let mintCalls = 0;
  t.mock.method(githubApp, 'mintInstallationToken', async () => {
    mintCalls += 1;
    return { token: 'ghs_degraded_path', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  });

  const token = await installationTokenStore.getToken('444');

  assert.strictEqual(token, 'ghs_degraded_path');
  assert.strictEqual(mintCalls, 1);
});

test('getToken throws a clear error when installationId is missing', async () => {
  await assert.rejects(() => installationTokenStore.getToken(undefined), (err) => {
    assert.strictEqual(err.status, 500);
    return true;
  });
});

test('invalidate clears the cached token so the next call re-mints', async (t) => {
  await clearCache('555');
  let mintCalls = 0;
  t.mock.method(githubApp, 'mintInstallationToken', async () => {
    mintCalls += 1;
    return { token: `ghs_${mintCalls}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  });

  const first = await installationTokenStore.getToken('555');
  await installationTokenStore.invalidate('555');
  const second = await installationTokenStore.getToken('555');

  assert.strictEqual(mintCalls, 2);
  assert.notStrictEqual(first, second);
  await clearCache('555');
});
