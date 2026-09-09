const jwt = require('jsonwebtoken');
const httpClient = require('../utils/httpClient');
const env = require('./env');

const API_BASE = 'https://api.github.com';

function isConfigured() {
  return Boolean(env.githubApp.appId && env.githubApp.privateKey);
}

function isInstallUrlConfigured() {
  return Boolean(env.githubApp.slug);
}

// App-level JWT (RS256, signed with the App's private key — NOT an
// installation token). Proves "this request is coming from the App itself"
// to the two app-scoped endpoints below (list installations, mint an
// installation token for one of them). Deliberately short-lived: GitHub
// rejects anything over 10 minutes, and there's no reason to want longer —
// a fresh one is cheap to mint per call.
//
// `iat` is backdated by 60s (same safety margin GitHub's own docs
// recommend) to tolerate clock drift between this host and GitHub's — if
// our clock is even slightly ahead, an un-backdated `iat` would make the
// token look like it was issued in the future and GitHub would reject it.
function buildAppJwt() {
  if (!isConfigured()) {
    const err = new Error('GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY_BASE64)');
    err.status = 503;
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: env.githubApp.appId },
    env.githubApp.privateKey,
    { algorithm: 'RS256' }
  );
}

// Mints a short-lived (1 hour, non-renewable — mint a new one instead)
// installation access token, scoped to only the repos this installation
// covers. This is the credential githubService.js actually calls the API
// with; the App JWT above is only ever used to obtain one of these.
async function mintInstallationToken(installationId) {
  const appJwt = buildAppJwt();
  const response = await httpClient.fetchWithTimeout(`${API_BASE}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${appJwt}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'patchlinex',
    },
    timeoutMs: env.timeouts.github,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.message || `Failed to mint installation token for installation ${installationId}`);
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return { token: data.token, expiresAt: data.expires_at }; // expires_at is an ISO 8601 string
}

// Used by onboarding/backfill flows to confirm an installation_id we're
// about to store actually belongs to this App (rather than trusting an
// installation_id an attacker guessed and passed to our callback route).
async function getInstallation(installationId) {
  const appJwt = buildAppJwt();
  const response = await httpClient.fetchWithTimeout(`${API_BASE}/app/installations/${installationId}`, {
    headers: { authorization: `Bearer ${appJwt}`, accept: 'application/vnd.github+json', 'user-agent': 'patchlinex' },
    timeoutMs: env.timeouts.github,
  });
  if (!response.ok) {
    const err = new Error('Installation not found for this GitHub App');
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  const data = await response.json();
  return {
    id: data.id,
    accountLogin: data.account?.login,
    accountType: data.account?.type, // "User" | "Organization"
    accountAvatarUrl: data.account?.avatar_url,
  };
}

// Full-page redirect target for "Install" / "Configure" — state round-trips
// through GitHub unmodified and comes back on the callback so we can tie the
// installation back to the logged-in user who started the flow, the same
// way oauthState.js already does for the classic OAuth flow.
function buildInstallUrl(state) {
  if (!isInstallUrlConfigured()) {
    const err = new Error('GitHub App slug is not configured (GITHUB_APP_SLUG)');
    err.status = 503;
    throw err;
  }
  const params = new URLSearchParams({ state });
  return `https://github.com/apps/${env.githubApp.slug}/installations/new?${params.toString()}`;
}

module.exports = {
  isConfigured,
  isInstallUrlConfigured,
  buildAppJwt,
  mintInstallationToken,
  getInstallation,
  buildInstallUrl,
  API_BASE,
};
