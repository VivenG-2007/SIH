const test = require('node:test');
const assert = require('node:assert');

const tokenStore = require('../src/services/githubTokenStore');
const installationStore = require('../src/services/githubAppInstallationStore');
const installationTokenStore = require('../src/services/githubInstallationTokenStore');
const watchedRepoStore = require('../src/services/watchedRepoStore');
const githubService = require('../src/services/githubService');
const githubConfig = require('../src/config/github');
const githubApp = require('../src/config/githubApp');
const ctrl = require('../src/controllers/githubController');

// Minimal Express req/res doubles — enough for a controller function that
// only reads req.user.id and calls res.status().json().
function fakeReqRes(userId) {
  const req = { user: { id: userId } };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

test('disconnect deletes every watched repo\'s webhook + row, then revokes the token', async (t) => {
  t.mock.method(installationStore, 'getInstallation', async () => null); // no GitHub App installation — legacy OAuth path
  t.mock.method(tokenStore, 'getConnection', async () => ({ userId: 'u1', accessToken: 'gh-token-abc' }));
  t.mock.method(watchedRepoStore, 'listForUser', async () => [
    { repositoryId: '111', githubRepo: 'acme/widgets', webhookId: 'hook-1' },
    { repositoryId: '222', githubRepo: 'acme/gadgets', webhookId: 'hook-2' },
    { repositoryId: '333', githubRepo: 'acme/no-hook', webhookId: null },
  ]);
  const deleteWebhookCalls = [];
  t.mock.method(githubService, 'deleteWebhook', async (userId, args) => {
    deleteWebhookCalls.push(args);
  });
  const deletedWatches = [];
  t.mock.method(watchedRepoStore, 'deleteWatch', async (repositoryId) => {
    deletedWatches.push(repositoryId);
  });
  const revokeCalls = [];
  t.mock.method(githubConfig, 'revokeToken', async (token) => {
    revokeCalls.push(token);
    return { revoked: true };
  });
  const deletedConnections = [];
  t.mock.method(tokenStore, 'deleteConnection', async (userId) => {
    deletedConnections.push(userId);
  });

  const { req, res } = fakeReqRes('u1');
  await ctrl.disconnect(req, res, (err) => {
    throw err;
  });

  // Webhooks for repos that had one are deleted; the no-webhook repo is skipped.
  assert.strictEqual(deleteWebhookCalls.length, 2);
  assert.deepStrictEqual(deleteWebhookCalls[0], { owner: 'acme', repo: 'widgets', hookId: 'hook-1' });
  assert.deepStrictEqual(deleteWebhookCalls[1], { owner: 'acme', repo: 'gadgets', hookId: 'hook-2' });

  // Every watched row is removed regardless of whether it had a webhook.
  assert.deepStrictEqual(deletedWatches, ['111', '222', '333']);

  // Token revoked and connection removed.
  assert.deepStrictEqual(revokeCalls, ['gh-token-abc']);
  assert.deepStrictEqual(deletedConnections, ['u1']);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.watchedReposRemoved, 3);
});

test('disconnect still removes watch records and the connection even if a webhook delete fails', async (t) => {
  t.mock.method(installationStore, 'getInstallation', async () => null);
  t.mock.method(tokenStore, 'getConnection', async () => ({ userId: 'u2', accessToken: 'gh-token-xyz' }));
  t.mock.method(watchedRepoStore, 'listForUser', async () => [
    { repositoryId: '444', githubRepo: 'acme/broken', webhookId: 'hook-9' },
  ]);
  t.mock.method(githubService, 'deleteWebhook', async () => {
    throw new Error('GitHub API down');
  });
  const deletedWatches = [];
  t.mock.method(watchedRepoStore, 'deleteWatch', async (id) => {
    deletedWatches.push(id);
  });
  t.mock.method(githubConfig, 'revokeToken', async () => ({ revoked: true }));
  const deletedConnections = [];
  t.mock.method(tokenStore, 'deleteConnection', async (userId) => {
    deletedConnections.push(userId);
  });

  const { req, res } = fakeReqRes('u2');
  let caughtErr = null;
  await ctrl.disconnect(req, res, (err) => {
    caughtErr = err;
  });

  assert.strictEqual(caughtErr, null, 'a failed webhook delete must not fail the whole disconnect request');
  assert.deepStrictEqual(deletedWatches, ['444']);
  assert.deepStrictEqual(deletedConnections, ['u2']);
  assert.strictEqual(res.statusCode, 200);
});

test('disconnect with no existing token connection still clears any orphaned watched repos', async (t) => {
  t.mock.method(installationStore, 'getInstallation', async () => null);
  t.mock.method(tokenStore, 'getConnection', async () => null);
  t.mock.method(watchedRepoStore, 'listForUser', async () => [
    { repositoryId: '555', githubRepo: 'acme/orphan', webhookId: 'hook-5' },
  ]);
  const deleteWebhookCalls = [];
  t.mock.method(githubService, 'deleteWebhook', async (userId, args) => {
    deleteWebhookCalls.push(args);
  });
  const deletedWatches = [];
  t.mock.method(watchedRepoStore, 'deleteWatch', async (id) => {
    deletedWatches.push(id);
  });
  const revokeCalls = [];
  t.mock.method(githubConfig, 'revokeToken', async (token) => {
    revokeCalls.push(token);
    return { revoked: false, reason: 'no_token' };
  });
  t.mock.method(tokenStore, 'deleteConnection', async () => { });

  const { req, res } = fakeReqRes('u3');
  await ctrl.disconnect(req, res, (err) => {
    throw err;
  });

  // No token means no attempt to authenticate a webhook-delete call with
  // it — but the stale watch row is still cleaned up.
  assert.strictEqual(deleteWebhookCalls.length, 0);
  assert.deepStrictEqual(deletedWatches, ['555']);
  assert.strictEqual(revokeCalls.length, 0);
  assert.strictEqual(res.statusCode, 200);
});

test('disconnect with a GitHub App installation removes the mapping and invalidates its cached token', async (t) => {
  t.mock.method(githubApp, 'isConfigured', () => true); // App configured in this env — installation lookup is not skipped
  t.mock.method(installationStore, 'getInstallation', async () => ({
    userId: 'u4',
    installationId: '98765',
    accountLogin: 'acme-org',
    accountType: 'Organization',
  }));
  t.mock.method(tokenStore, 'getConnection', async () => null); // no legacy OAuth connection for this user
  t.mock.method(watchedRepoStore, 'listForUser', async () => []);
  const invalidateCalls = [];
  t.mock.method(installationTokenStore, 'invalidate', async (installationId) => {
    invalidateCalls.push(installationId);
  });
  const deletedInstallations = [];
  t.mock.method(installationStore, 'deleteInstallation', async (userId) => {
    deletedInstallations.push(userId);
  });

  const { req, res } = fakeReqRes('u4');
  await ctrl.disconnect(req, res, (err) => {
    throw err;
  });

  assert.deepStrictEqual(invalidateCalls, ['98765']);
  assert.deepStrictEqual(deletedInstallations, ['u4']);
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.body.note, /uninstall it from your GitHub settings/);
});

test('disconnect never touches the installation store when the GitHub App is not configured (OAuth-only setups)', async (t) => {
  t.mock.method(githubApp, 'isConfigured', () => false);
  const installationLookupCalls = [];
  t.mock.method(installationStore, 'getInstallation', async () => {
    // If this fires on an OAuth-only deployment that never ran the
    // github_app_installations migration, the real store would throw
    // ("relation does not exist") — asserting zero calls here is what
    // proves resolveToken/status/disconnect degrade to OAuth-only
    // cleanly instead of depending on that table existing.
    installationLookupCalls.push(1);
    return null;
  });
  t.mock.method(tokenStore, 'getConnection', async () => ({ userId: 'u5', accessToken: 'gh-token-oauth-only' }));
  t.mock.method(watchedRepoStore, 'listForUser', async () => []);
  t.mock.method(githubConfig, 'revokeToken', async () => ({ revoked: true }));
  const deletedConnections = [];
  t.mock.method(tokenStore, 'deleteConnection', async (userId) => {
    deletedConnections.push(userId);
  });

  const { req, res } = fakeReqRes('u5');
  await ctrl.disconnect(req, res, (err) => {
    throw err;
  });

  assert.strictEqual(installationLookupCalls.length, 0, 'installation store must not be queried when the App is unconfigured');
  assert.deepStrictEqual(deletedConnections, ['u5']);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.note, undefined, 'no App-specific note when there was never an App installation');
});

test('resolveToken never touches the installation store when the GitHub App is not configured (OAuth-only setups)', async (t) => {
  t.mock.method(githubApp, 'isConfigured', () => false);
  const installationLookupCalls = [];
  t.mock.method(installationStore, 'getInstallation', async () => {
    installationLookupCalls.push(1);
    return null;
  });
  t.mock.method(tokenStore, 'getConnection', async () => ({ userId: 'u6', accessToken: 'gh-token-oauth-only' }));

  const result = await githubService.resolveToken('u6');

  assert.strictEqual(installationLookupCalls.length, 0, 'installation store must not be queried when the App is unconfigured');
  assert.deepStrictEqual(result, { accessToken: 'gh-token-oauth-only', mode: 'oauth' });
});

// Requiring '../src/controllers/githubController' above transitively pulls in
// '../src/services/scanTriggerService' -> '../src/config/queue', which opens
// live BullMQ/ioredis connections at require-time — same root cause as
// test/health.test.js (see the comment there), just reached through a
// different import path. Left open, this file's own process never exits on
// its own, which — combined with this suite running with process-level test
// isolation and effectively serial scheduling on a single-core runner —
// blocks every test file queued after it, not just this one.
test('cleanup: close connections opened by requiring the controller', async () => {
  const redis = require('../src/config/redis');
  const queue = require('../src/config/queue');
  await Promise.all([redis.quit(), queue.closeAll()]);
});
