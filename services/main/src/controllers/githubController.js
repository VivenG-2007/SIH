const { body, param, query } = require('express-validator');
const githubConfig = require('../config/github');
const githubApp = require('../config/githubApp');
const githubService = require('../services/githubService');
const tokenStore = require('../services/githubTokenStore');
const installationStore = require('../services/githubAppInstallationStore');
const installationTokenStore = require('../services/githubInstallationTokenStore');
const watchedRepoStore = require('../services/watchedRepoStore');
const scanTriggerService = require('../services/scanTriggerService');
const oauthState = require('../utils/oauthState');
const { sanitizeReturnTo } = require('../utils/safeRedirect');
const env = require('../config/env');
const logger = require('../config/logger');

// Strips raw HTML / huge payloads out of error messages before they get
// URL-encoded into a redirect. A Supabase 521/503 can return the full
// Cloudflare error page as err.message — we never want that in a browser URL.
function sanitizeError(err) {
  const msg = (err && (err.message || String(err))) || 'oauth_failed';
  // Looks like an HTML document — replace with a generic backend message
  if (msg.trimStart().startsWith('<')) return 'backend_unavailable';
  // Truncate anything suspiciously long
  return msg.length > 120 ? msg.slice(0, 120) : msg;
}

function assertConfigured() {
  if (!githubConfig.isConfigured()) {
    const err = new Error('GitHub OAuth is not configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / GITHUB_REDIRECT_URI)');
    err.status = 503;
    throw err;
  }
}

const oauthStartValidators = [query('redirect').optional().isString().isLength({ max: 200 })];

// GET /api/github/oauth/start — same pattern as Jira's: requires the user
// already logged into this app, then does a full-page redirect to GitHub's
// consent screen (not an XHR call — the user needs to actually see it).
// Accepts ?redirect=/some/path so callers (e.g. the onboarding wizard) get
// sent back to where they started instead of always landing on /github.
async function oauthStart(req, res, next) {
  try {
    assertConfigured();
    const returnTo = sanitizeReturnTo(req.query.redirect, '/github');
    const state = await oauthState.createState('github', req.user.id, returnTo);
    return res.redirect(githubConfig.buildAuthorizationUrl(state));
  } catch (err) {
    return next(err);
  }
}

// GET /api/github/oauth/callback — public (no requireAuth): GitHub's
// redirect carries no app JWT. The one-time `state` value is what
// authenticates it instead.
async function oauthCallback(req, res, next) {
  try {
    assertConfigured();
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${env.frontendUrl}/github?error=${encodeURIComponent(String(oauthError))}`);
    }
    if (!code || !state) {
      return res.redirect(`${env.frontendUrl}/github?error=missing_code_or_state`);
    }

    const consumed = await oauthState.consumeState('github', state);
    if (!consumed) {
      return res.redirect(`${env.frontendUrl}/github?error=state_expired_or_invalid`);
    }
    const { userId } = consumed;
    const returnTo = sanitizeReturnTo(consumed.returnTo, '/github');

    const tokenResponse = await githubConfig.exchangeCodeForToken(code);
    const profile = await githubConfig.getAuthenticatedUser(tokenResponse.access_token);

    await tokenStore.upsertConnection({
      userId,
      githubUserId: profile.id,
      username: profile.login,
      avatarUrl: profile.avatar_url,
      accessToken: tokenResponse.access_token,
      scopes: tokenResponse.scope,
    });

    logger.info({ userId, username: profile.login }, 'GitHub account connected');
    const separator = returnTo.includes('?') ? '&' : '?';
    return res.redirect(`${env.frontendUrl}${returnTo}${separator}connected=true&provider=github`);
  } catch (err) {
    logger.error({ err }, 'GitHub OAuth callback failed');
    return res.redirect(`${env.frontendUrl}/github?error=${encodeURIComponent(sanitizeError(err))}`);
  }
}

// GET /api/github/status
async function status(req, res, next) {
  try {
    if (githubApp.isConfigured()) {
      const installation = await installationStore.getInstallation(req.user.id);
      if (installation) {
        return res.status(200).json({
          connected: true,
          mode: 'app',
          username: installation.accountLogin,
          avatarUrl: installation.accountAvatarUrl,
          accountType: installation.accountType,
        });
      }
    }
    const connection = await tokenStore.getConnection(req.user.id);
    if (!connection) return res.status(200).json({ connected: false });
    return res.status(200).json({
      connected: true,
      mode: 'oauth',
      username: connection.username,
      avatarUrl: connection.avatarUrl,
      scopes: connection.scopes,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/github/app/install — full-page redirect to the GitHub App's
// install/configure page. Same state round-trip as the classic OAuth flow
// (oauthState.js), so app/callback below can tie the installation back to
// the user who started it.
async function appInstallStart(req, res, next) {
  try {
    if (!githubApp.isInstallUrlConfigured()) {
      const err = new Error('GitHub App is not configured (GITHUB_APP_SLUG)');
      err.status = 503;
      throw err;
    }
    const returnTo = sanitizeReturnTo(req.query.redirect, '/github');
    const state = await oauthState.createState('github_app', req.user.id, returnTo);
    return res.redirect(githubApp.buildInstallUrl(state));
  } catch (err) {
    return next(err);
  }
}

// GET /api/github/app/callback — GitHub redirects here after install/
// configure with `installation_id` + `setup_action` (`install` |
// `update` | `request`) and our own `state`. Public route (no requireAuth)
// for the same reason the OAuth callback is: GitHub's redirect carries no
// app JWT, so `state` is what authenticates it.
async function appInstallCallback(req, res, next) {
  try {
    const { installation_id: installationId, setup_action: setupAction, state } = req.query;

    if (!installationId || !state) {
      return res.redirect(`${env.frontendUrl}/github?error=missing_installation_id_or_state`);
    }
    const consumed = await oauthState.consumeState('github_app', state);
    if (!consumed) {
      return res.redirect(`${env.frontendUrl}/github?error=state_expired_or_invalid`);
    }
    const { userId } = consumed;
    const returnTo = sanitizeReturnTo(consumed.returnTo, '/github');

    if (setupAction === 'request') {
      // An org member without install permission requested the app; an org
      // admin has to approve it on GitHub's side before there's anything
      // for us to store yet.
      return res.redirect(`${env.frontendUrl}${returnTo}?requested=true&provider=github`);
    }

    // Confirm this installation actually belongs to our App (not just any
    // numeric id an attacker could pass to this callback) before trusting
    // it enough to store and start minting tokens against it.
    const installation = await githubApp.getInstallation(installationId);

    await installationStore.upsertInstallation({
      userId,
      installationId: installation.id,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      accountAvatarUrl: installation.accountAvatarUrl,
    });

    logger.info({ userId, installationId: installation.id, accountLogin: installation.accountLogin }, 'GitHub App installed');
    const separator = returnTo.includes('?') ? '&' : '?';
    return res.redirect(`${env.frontendUrl}${returnTo}${separator}connected=true&provider=github`);
  } catch (err) {
    logger.error({ err }, 'GitHub App install callback failed');
    return res.redirect(`${env.frontendUrl}/github?error=${encodeURIComponent(sanitizeError(err))}`);
  }
}

// DELETE /api/github/disconnect — fully tears down a user's GitHub
// connection, not just the OAuth token row. Order matters:
//
//   1. Delete every push webhook this connection created (needs the
//      access token, which is still valid at this point — this MUST run
//      before step 3's revoke, or GitHub will already be rejecting the
//      token by the time we try to use it here). Only relevant for legacy
//      OAuth connections — App installations have no per-repo hooks.
//   2. Delete the watched_repositories rows themselves — leaving them
//      behind after disconnecting would mean handleWebhook's Gate 1
//      ("is this repository registered?") still says yes, but Gate 2's
//      token lookup now returns nothing, so every future push silently
//      no-ops with "owner is not connected" forever: a permanently stale,
//      invisible watch instead of an honest "disconnected" state.
//   3. Revoke the token at GitHub (best effort — classic OAuth App
//      tokens never expire on their own, so this is the only way
//      disconnecting here also invalidates the credential at GitHub
//      instead of just forgetting our local copy of a still-live one).
//      Not applicable to App installations: the equivalent action is
//      uninstalling the App on GitHub's side, which we can't do on the
//      user's behalf — deleting our stored mapping just stops us from
//      minting any further installation tokens.
//   4. Delete the github_connections row (and/or github_app_installations
//      row, and its cached installation token).
//
// Each step is best-effort past step 1 in the sense that a failure in one
// doesn't block the next — a GitHub API hiccup deleting one webhook, or a
// failed revoke, must never leave the user stuck unable to disconnect.
async function disconnect(req, res, next) {
  try {
    const installation = githubApp.isConfigured() ? await installationStore.getInstallation(req.user.id) : null;
    const connection = await tokenStore.getConnection(req.user.id);

    const watchedRepos = await watchedRepoStore.listForUser(req.user.id);
    let webhooksRemoved = 0;
    for (const watched of watchedRepos) {
      if (watched.webhookId && connection) {
        try {
          const [owner, repo] = watched.githubRepo.split('/');
          await githubService.deleteWebhook(req.user.id, { owner, repo, hookId: watched.webhookId });
          webhooksRemoved += 1;
        } catch (hookErr) {
          logger.warn(
            { hookErr, userId: req.user.id, repo: watched.githubRepo },
            'failed to delete GitHub webhook during disconnect — removing watch record anyway'
          );
        }
      }
      await watchedRepoStore.deleteWatch(watched.repositoryId);
    }

    if (connection) {
      const result = await githubConfig.revokeToken(connection.accessToken);
      if (!result.revoked) {
        logger.warn({ userId: req.user.id, reason: result.reason }, 'GitHub token revocation failed — removing local connection anyway');
      }
      await tokenStore.deleteConnection(req.user.id);
    }

    if (installation) {
      await installationTokenStore.invalidate(installation.installationId);
      await installationStore.deleteInstallation(req.user.id);
      logger.info(
        { userId: req.user.id, installationId: installation.installationId },
        'GitHub App installation mapping removed — uninstall the App itself on GitHub to fully revoke access'
      );
    }

    logger.info(
      { userId: req.user.id, watchedReposRemoved: watchedRepos.length, webhooksRemoved },
      'GitHub account disconnected'
    );
    return res.status(200).json({
      message: 'GitHub disconnected',
      watchedReposRemoved: watchedRepos.length,
      note: installation
        ? 'This account was connected via the GitHub App — uninstall it from your GitHub settings to fully revoke access.'
        : undefined,
    });
  } catch (err) {
    return next(err);
  }
}

const listReposValidators = [query('perPage').optional().isInt({ min: 1, max: 100 })];

async function listRepos(req, res, next) {
  try {
    const repos = await githubService.listRepos(req.user.id, { perPage: req.query.perPage ? Number(req.query.perPage) : undefined });
    return res.status(200).json({ repos });
  } catch (err) {
    return next(err);
  }
}

const createIssueValidators = [
  body('owner').trim().isLength({ min: 1, max: 100 }),
  body('repo').trim().isLength({ min: 1, max: 100 }),
  body('title').trim().isLength({ min: 1, max: 250 }),
  body('body').optional().isString(),
];

async function createIssue(req, res, next) {
  try {
    const { owner, repo, title, body } = req.body;
    const issue = await githubService.createIssue(req.user.id, { owner, repo, title, body });
    return res.status(201).json({ issue });
  } catch (err) {
    return next(err);
  }
}

// ──────────────────────── Continuous scanning (watch / webhook) ────────────────────────

const watchRepoValidators = [
  body('repoOwner').trim().isLength({ min: 1, max: 100 }),
  body('repoName').trim().isLength({ min: 1, max: 100 }),
  body('branch').optional().trim().isLength({ min: 1, max: 200 }),
];

// POST /api/github/watched — registers a repository for continuous
// scanning: creates (idempotently) a push webhook on it and writes the
// watched_repositories row that githubController.handleWebhook checks on
// every subsequent push.
async function watchRepo(req, res, next) {
  try {
    const { repoOwner, repoName, branch = 'main' } = req.body;
    const repo = await githubService.getRepo(req.user.id, { owner: repoOwner, repo: repoName });
    const hook = await githubService.createWebhook(req.user.id, { owner: repoOwner, repo: repoName });

    const record = await watchedRepoStore.upsertWatch({
      userId: req.user.id,
      organizationId: req.user.orgId,
      repositoryId: repo.id,
      githubRepo: repo.fullName,
      branch: branch || repo.defaultBranch || 'main',
      installationId: null, // OAuth App flow — no GitHub App installation; kept for schema parity
      webhookId: hook.id,
      webhookActive: true,
      autoRescan: true,
    });

    logger.info({ userId: req.user.id, repo: repo.fullName, webhookReused: hook.reused }, 'repository registered for continuous scanning');
    return res.status(201).json({ repository: record });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/github/watched/:repositoryId
async function unwatchRepo(req, res, next) {
  try {
    const { repositoryId } = req.params;
    const watched = await watchedRepoStore.getByRepositoryId(repositoryId);
    if (!watched || watched.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Watched repository not found', code: 'NOT_FOUND', requestId: req.id } });
    }

    if (watched.webhookId) {
      try {
        const [owner, repo] = watched.githubRepo.split('/');
        await githubService.deleteWebhook(req.user.id, { owner, repo, hookId: watched.webhookId });
      } catch (hookErr) {
        // Best-effort — still remove our record even if GitHub's side fails
        // (hook may already be gone, token may be stale, etc).
        logger.warn({ hookErr, repositoryId }, 'failed to delete GitHub webhook — removing watch record anyway');
      }
    }

    await watchedRepoStore.deleteWatch(repositoryId);
    return res.status(200).json({ message: 'Repository unwatched' });
  } catch (err) {
    return next(err);
  }
}

const updateRepoSettingsValidators = [body('autoRescan').isBoolean()];

// PATCH /api/github/watched/:repositoryId/settings — the "Continuous
// Security Scanning" checkbox on the repository page.
async function updateRepoSettings(req, res, next) {
  try {
    const { repositoryId } = req.params;
    const watched = await watchedRepoStore.getByRepositoryId(repositoryId);
    if (!watched || watched.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Watched repository not found', code: 'NOT_FOUND', requestId: req.id } });
    }
    const updated = await watchedRepoStore.updateSettings(repositoryId, { autoRescan: req.body.autoRescan });
    return res.status(200).json({ repository: updated });
  } catch (err) {
    return next(err);
  }
}

// GET /api/github/watched
async function listWatched(req, res, next) {
  try {
    const repositories = await watchedRepoStore.listForUser(req.user.id);
    return res.status(200).json({ repositories });
  } catch (err) {
    return next(err);
  }
}

// POST /api/github/webhook — public: GitHub POSTs every push here. This is
// the three-state gate the product spec calls for:
//   1. repository not registered           -> ignore
//   2. registered, autoRescan disabled     -> ignore
//   3. registered, autoRescan enabled      -> enqueue an incremental rescan
async function handleWebhook(req, res, next) {
  try {
    if (!githubConfig.isWebhookConfigured()) {
      return res.status(503).json({ error: { message: 'GitHub webhook is not configured on this server', code: 'WEBHOOK_NOT_CONFIGURED' } });
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!githubConfig.verifyWebhookSignature(req.rawBody, signature)) {
      logger.warn({ requestId: req.id }, 'GitHub webhook signature verification failed');
      return res.status(401).json({ error: { message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' } });
    }

    const event = req.headers['x-github-event'];
    // GitHub fires a harmless "ping" the moment a webhook is created — just
    // acknowledge it so createWebhook()'s own test delivery succeeds.
    if (event === 'ping') {
      return res.status(200).json({ message: 'pong' });
    }
    if (event !== 'push') {
      return res.status(200).json({ message: `ignored event type '${event}'`, scanned: false });
    }

    const payload = req.body;
    const repositoryId = payload.repository && payload.repository.id != null ? String(payload.repository.id) : null;
    if (!repositoryId) {
      return res.status(400).json({ error: { message: "Push payload is missing 'repository.id'", code: 'BAD_PAYLOAD', requestId: req.id } });
    }

    // ── Gate 1: is this repository registered at all? ──
    // A random repository we've never scanned must never auto-trigger a scan
    // — this is the check that enforces that.
    const watched = await watchedRepoStore.getByRepositoryId(repositoryId);
    if (!watched) {
      logger.info({ repositoryId, requestId: req.id }, 'push event for an unregistered repository — ignoring');
      return res.status(200).json({ message: 'repository not registered — ignored', scanned: false });
    }

    // Only rescan pushes to the branch we're actually tracking — a push to
    // some unrelated feature branch shouldn't trigger a rescan of main.
    const pushedBranch = String(payload.ref || '').replace('refs/heads/', '');
    if (watched.branch && pushedBranch && pushedBranch !== watched.branch) {
      logger.info({ repositoryId, pushedBranch, trackedBranch: watched.branch }, 'push to untracked branch — ignoring');
      return res.status(200).json({ message: `push to untracked branch '${pushedBranch}' — ignored`, scanned: false });
    }

    // ── Gate 2: is auto-rescan turned on for this repository? ──
    if (!watched.autoRescan) {
      logger.info({ repositoryId, requestId: req.id }, 'auto-rescan disabled for this repository — ignoring push');
      return res.status(200).json({ message: 'auto-rescan disabled — ignored', scanned: false });
    }

    let accessToken;
    try {
      ({ accessToken } = await githubService.resolveToken(watched.userId));
    } catch (resolveErr) {
      // resolveToken throws (rather than returning null) when neither a
      // GitHub App installation nor a legacy OAuth connection exists for
      // this user — expected here if they disconnected since watching this
      // repo (see disconnect()'s comment on why the watch row can outlive
      // the connection it depended on).
      logger.warn({ repositoryId, userId: watched.userId }, 'watched repository owner has no GitHub connection — cannot rescan');
      return res.status(200).json({ message: 'repository owner is not connected to GitHub — ignored', scanned: false });
    }

    // Changed files across every commit in the push — this is what lets
    // ai-storage-service's /scan run incrementally instead of re-walking and
    // re-fetching the entire repo tree on every push.
    const changedFiles = Array.from(
      new Set(
        (payload.commits || []).flatMap((commit) => [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])])
      )
    );

    const { scanId } = await scanTriggerService.enqueueScan({
      userId: watched.userId,
      organizationId: watched.organizationId,
      repoOwner: (payload.repository.owner && (payload.repository.owner.login || payload.repository.owner.name)) || watched.githubRepo.split('/')[0],
      repoName: payload.repository.name,
      branch: watched.branch,
      githubToken: accessToken,
      requestId: req.id,
      trigger: 'webhook',
      changedFiles,
      watchedRepositoryId: watched.repositoryId,
      commitSha: payload.after,
    });

    logger.info({ repositoryId, scanId, changedFileCount: changedFiles.length }, 'webhook-triggered rescan queued');
    return res.status(202).json({ message: 'rescan queued', scanId, scanned: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  oauthStart,
  oauthStartValidators,
  oauthCallback,
  appInstallStart,
  appInstallCallback,
  status,
  disconnect,
  listRepos,
  createIssue,
  listReposValidators,
  createIssueValidators,
  watchRepo,
  watchRepoValidators,
  unwatchRepo,
  updateRepoSettings,
  updateRepoSettingsValidators,
  listWatched,
  handleWebhook,
};
