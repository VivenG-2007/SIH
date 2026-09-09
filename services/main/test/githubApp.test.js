const test = require('node:test');
const assert = require('node:assert');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');

const env = require('../src/config/env');
const githubApp = require('../src/config/githubApp');
const httpClient = require('../src/utils/httpClient');

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

// Every test swaps env.githubApp for the duration of the test and restores
// the original afterward, same pattern as jwtRotation.test.js — this
// config object is shared process-wide, so leaking a mutation across tests
// would make later tests flaky depending on run order.
function withGithubAppEnv(overrides, fn) {
  const original = { ...env.githubApp };
  Object.assign(env.githubApp, overrides);
  return fn().finally(() => {
    Object.assign(env.githubApp, original);
  });
}

test('isConfigured is false without an app id + private key', async () => {
  await withGithubAppEnv({ appId: '', privateKey: '' }, async () => {
    assert.strictEqual(githubApp.isConfigured(), false);
  });
});

test('isConfigured is true once app id + private key are set', async () => {
  const { privateKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    assert.strictEqual(githubApp.isConfigured(), true);
  });
});

test('buildAppJwt signs a short-lived RS256 token with the app id as issuer', async () => {
  const { privateKey, publicKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    const token = githubApp.buildAppJwt();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    assert.strictEqual(decoded.iss, '12345');
    // Backdated iat for clock drift tolerance (see the comment in
    // config/githubApp.js) — should be a little in the past, not future.
    const now = Math.floor(Date.now() / 1000);
    assert.ok(decoded.iat <= now, 'iat should not be in the future');
    assert.ok(decoded.iat >= now - 65, 'iat should be backdated by about 60s');
    // GitHub rejects app JWTs valid for more than 10 minutes.
    assert.ok(decoded.exp - decoded.iat <= 600, 'token lifetime must not exceed 10 minutes');
  });
});

test('buildAppJwt throws a clear, non-500 error when unconfigured', async () => {
  await withGithubAppEnv({ appId: '', privateKey: '' }, async () => {
    assert.throws(() => githubApp.buildAppJwt(), /GITHUB_APP_ID/);
  });
});

test('mintInstallationToken calls the expected endpoint with the app JWT and returns the token', async (t) => {
  const { privateKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    const captured = {};
    t.mock.method(httpClient, 'fetchWithTimeout', async (url, options) => {
      captured.url = url;
      captured.headers = options.headers;
      return {
        ok: true,
        json: async () => ({ token: 'ghs_minted_token', expires_at: '2026-01-01T00:00:00Z' }),
      };
    });

    const result = await githubApp.mintInstallationToken('98765');

    assert.strictEqual(captured.url, 'https://api.github.com/app/installations/98765/access_tokens');
    assert.match(captured.headers.authorization, /^Bearer /);
    assert.strictEqual(result.token, 'ghs_minted_token');
    assert.strictEqual(result.expiresAt, '2026-01-01T00:00:00Z');
  });
});

test('mintInstallationToken surfaces a 404 as-is (installation not found/uninstalled)', async (t) => {
  const { privateKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    t.mock.method(httpClient, 'fetchWithTimeout', async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not Found' }),
    }));

    await assert.rejects(() => githubApp.mintInstallationToken('98765'), (err) => {
      assert.strictEqual(err.status, 404);
      return true;
    });
  });
});

test('mintInstallationToken maps other upstream failures to a 502', async (t) => {
  const { privateKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    t.mock.method(httpClient, 'fetchWithTimeout', async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: 'server error' }),
    }));

    await assert.rejects(() => githubApp.mintInstallationToken('98765'), (err) => {
      assert.strictEqual(err.status, 502);
      return true;
    });
  });
});

test('getInstallation maps the GitHub response into our shape', async (t) => {
  const { privateKey } = keyPair();
  await withGithubAppEnv({ appId: '12345', privateKey }, async () => {
    t.mock.method(httpClient, 'fetchWithTimeout', async () => ({
      ok: true,
      json: async () => ({
        id: 98765,
        account: { login: 'acme-org', type: 'Organization', avatar_url: 'https://example.com/a.png' },
      }),
    }));

    const installation = await githubApp.getInstallation('98765');
    assert.deepStrictEqual(installation, {
      id: 98765,
      accountLogin: 'acme-org',
      accountType: 'Organization',
      accountAvatarUrl: 'https://example.com/a.png',
    });
  });
});

test('buildInstallUrl includes the state param and the configured app slug', async () => {
  await withGithubAppEnv({ slug: 'patchlinex-security' }, async () => {
    const url = githubApp.buildInstallUrl('state-abc-123');
    assert.strictEqual(url, 'https://github.com/apps/patchlinex-security/installations/new?state=state-abc-123');
  });
});

test('buildInstallUrl throws a clear error when the app slug is not configured', async () => {
  await withGithubAppEnv({ slug: '' }, async () => {
    assert.throws(() => githubApp.buildInstallUrl('state-abc-123'), /GITHUB_APP_SLUG/);
  });
});
