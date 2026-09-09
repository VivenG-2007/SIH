const { fetchWithTimeout } = require('../utils/httpClient');
const githubConfig = require('../config/github');
const githubApp = require('../config/githubApp');
const tokenStore = require('./githubTokenStore');
const installationStore = require('./githubAppInstallationStore');
const installationTokenStore = require('./githubInstallationTokenStore');
const env = require('../config/env');

// Resolves the credential to call the GitHub API with for a given user.
// GitHub App installation (short-lived, repo-scoped token) takes priority
// over the legacy classic-OAuth connection (long-lived, account-wide
// `repo` scope) — see docs/github-app-migration.md. The installation store
// is only consulted when the GitHub App is actually configured
// (env.githubApp.appId + privateKey set) — deployments that only set up
// classic OAuth never touch github_app_installations at all, so they work
// even if that table doesn't exist yet (it's created by an opt-in SQL
// migration, not required for OAuth-only setups). `mode` tells callers
// which flavor of token they got back, since a couple of endpoints (see
// listRepos below) differ between them.
async function resolveToken(userId) {
  if (githubApp.isConfigured()) {
    const installation = await installationStore.getInstallation(userId);
    if (installation) {
      const token = await installationTokenStore.getToken(installation.installationId);
      return { accessToken: token, mode: 'app', installationId: installation.installationId };
    }
  }
  const connection = await tokenStore.getConnection(userId);
  if (!connection) {
    const err = new Error('GitHub is not connected for this account — visit /api/github/app/install or /api/github/oauth/start first');
    err.status = 409;
    err.code = 'GITHUB_NOT_CONNECTED';
    throw err;
  }
  return { accessToken: connection.accessToken, mode: 'oauth' };
}

// Kept for callers that only need the connection metadata (username,
// avatar, scopes) rather than a fresh token — unchanged from before the
// App migration, since installation-based connections surface their own
// profile info via githubController.status instead.
async function getConnection(userId) {
  const connection = await tokenStore.getConnection(userId);
  if (!connection) {
    const err = new Error('GitHub is not connected for this account — visit /api/github/oauth/start first');
    err.status = 409;
    err.code = 'GITHUB_NOT_CONNECTED';
    throw err;
  }
  return connection;
}

// Under a GitHub App installation, "list this user's repos" doesn't exist
// the same way it did for OAuth (an installation token is scoped to the
// repos the installation covers, not to a user identity) — GET
// /installation/repositories is the App-flow equivalent, listing exactly
// the repos this installation was granted, using the installation token
// itself as auth rather than Bearer-as-user.
async function listRepos(userId, { perPage = 30 } = {}) {
  const { accessToken, mode } = await resolveToken(userId);

  if (mode === 'app') {
    const response = await fetchWithTimeout(`${githubApp.API_BASE}/installation/repositories?per_page=${perPage}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
      timeoutMs: env.timeouts.github,
    });
    if (!response.ok) {
      const err = new Error('Failed to list repositories for this GitHub App installation');
      err.status = 502;
      throw err;
    }
    const data = await response.json();
    return (data.repositories || []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      private: r.private,
      url: r.html_url,
      description: r.description,
      updatedAt: r.updated_at,
    }));
  }

  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/user/repos?sort=updated&per_page=${perPage}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
    timeoutMs: env.timeouts.github,
  });
  if (!response.ok) {
    const err = new Error('Failed to list GitHub repositories');
    err.status = 502;
    throw err;
  }
  const repos = await response.json();
  return repos.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    url: r.html_url,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

async function createIssue(userId, { owner, repo, title, body }) {
  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'patchlinex',
    },
    body: JSON.stringify({ title, body }),
    timeoutMs: env.timeouts.github,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.message || 'GitHub rejected the issue creation request');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return { number: data.number, url: data.html_url, title: data.title };
}

async function createPullRequest(userId, { owner, repo, title, body, head, base = 'main' }) {
  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'patchlinex',
    },
    body: JSON.stringify({ title, body, head, base }),
    timeoutMs: env.timeouts.github,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.message || 'GitHub rejected the Pull Request creation request');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return { number: data.number, url: data.html_url, title: data.title };
}

async function getRepo(userId, { owner, repo }) {
  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
    timeoutMs: env.timeouts.github,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.message || 'Failed to fetch repository from GitHub');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return { id: data.id, fullName: data.full_name, defaultBranch: data.default_branch, private: data.private };
}

// Under a GitHub App installation, per-repo hooks aren't needed at all —
// the App has ONE app-level webhook (configured once in the App's GitHub
// settings) that already receives push events for every repo across every
// installation. listWebhooks/createWebhook/deleteWebhook below are legacy-
// OAuth-only from here down; App-flow callers should skip straight past
// them (watchedRepoStore just records the repo, no webhook_id needed).
async function listWebhooks(userId, { owner, repo }) {
  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}/hooks`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
    timeoutMs: env.timeouts.github,
  });
  if (!response.ok) {
    const err = new Error('Failed to list webhooks for repository');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return response.json();
}

// Idempotent: if a hook already pointed at our webhook URL exists on this
// repo (e.g. a previous watchRepo() call that half-completed), reuse it
// instead of creating a duplicate that would double-fire every push.
async function createWebhook(userId, { owner, repo }) {
  if (!githubConfig.isWebhookConfigured()) {
    const err = new Error('GitHub webhook is not configured (GITHUB_WEBHOOK_SECRET / GITHUB_WEBHOOK_URL)');
    err.status = 503;
    throw err;
  }

  const existing = await listWebhooks(userId, { owner, repo });
  const ours = existing.find((hook) => hook.config && hook.config.url === env.github.webhookUrl);
  if (ours) return { id: ours.id, url: ours.config.url, reused: true };

  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'patchlinex',
    },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: env.github.webhookUrl,
        content_type: 'json',
        secret: env.github.webhookSecret,
        insecure_ssl: '0',
      },
    }),
    timeoutMs: env.timeouts.github,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.message || 'GitHub rejected the webhook creation request');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return { id: data.id, url: data.config?.url, reused: false };
}

async function deleteWebhook(userId, { owner, repo, hookId }) {
  const { accessToken } = await resolveToken(userId);
  const response = await fetchWithTimeout(`${githubConfig.API_BASE}/repos/${owner}/${repo}/hooks/${hookId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
    timeoutMs: env.timeouts.github,
  });
  // 404 is fine here — the hook may have already been removed on GitHub's
  // side (e.g. manually), and unwatchRepo() should still clear our record.
  if (!response.ok && response.status !== 404) {
    const err = new Error('Failed to delete GitHub webhook');
    err.status = 502;
    throw err;
  }
}

module.exports = {
  resolveToken,
  getConnection,
  listRepos,
  getRepo,
  createIssue,
  createPullRequest,
  listWebhooks,
  createWebhook,
  deleteWebhook,
};

