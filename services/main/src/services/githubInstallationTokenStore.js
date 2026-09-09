const redis = require('../config/redis');
const githubApp = require('../config/githubApp');
const logger = require('../config/logger');

// Installation access tokens are minted server-to-server (config/githubApp.js)
// and are valid for 1 hour. Minting one is a network round-trip plus an
// RS256 signature, so — same motivation as auth-service's JWT verification
// being local instead of a round-trip per request — every scan/fix/webhook
// operation on a hot path should reuse a cached token instead of minting a
// fresh one per call.
//
// Cached in Redis (not in-process memory) because main-service scales
// horizontally (see docs/production-readiness.md's "Stateless Services"
// strength) — an in-process cache would mean every instance/worker mints
// its own token for the same installation, multiplying GitHub API calls
// for no benefit and making rate limits harder to reason about.
//
// REFRESH_MARGIN_MS: a token within this margin of its real expiry is
// treated as already expired and re-minted, so a request that grabs the
// cached token right as it's about to expire doesn't turn into a mid-call
// 401 from GitHub.
const REFRESH_MARGIN_MS = 2 * 60 * 1000; // 2 minutes
const CACHE_KEY_PREFIX = 'github:installation_token:';

function cacheKey(installationId) {
  return `${CACHE_KEY_PREFIX}${installationId}`;
}

async function getToken(installationId) {
  if (!installationId) {
    const err = new Error('installationId is required to mint a GitHub App token');
    err.status = 500;
    throw err;
  }

  const key = cacheKey(installationId);
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (new Date(parsed.expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS) {
        return parsed.token;
      }
    }
  } catch (err) {
    // A cache read failure should degrade to "mint a fresh token", never
    // block the caller — same best-effort posture as the RAG memory store.
    logger.warn({ err: err.message, installationId }, 'installation_token_cache_read_failed');
  }

  const { token, expiresAt } = await githubApp.mintInstallationToken(installationId);

  try {
    const ttlSeconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    await redis.set(key, JSON.stringify({ token, expiresAt }), 'EX', ttlSeconds);
  } catch (err) {
    // Minting succeeded — the caller still gets a working token even if we
    // failed to cache it (just means the next call mints again too).
    logger.warn({ err: err.message, installationId }, 'installation_token_cache_write_failed');
  }

  return token;
}

// Test/ops helper: force the next getToken() call to mint fresh rather than
// serve a cached (possibly still-valid) token — e.g. after an installation
// is uninstalled and reinstalled with the same id.
async function invalidate(installationId) {
  await redis.del(cacheKey(installationId));
}

module.exports = { getToken, invalidate, REFRESH_MARGIN_MS };
