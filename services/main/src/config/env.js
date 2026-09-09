require('dotenv').config();

function decodeKey(base64Value) {
  if (!base64Value) return undefined;
  try {
    return Buffer.from(base64Value, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5001,
  serviceName: process.env.SERVICE_NAME || 'main-service',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),

  jwt: {
    publicKey: decodeKey(process.env.JWT_PUBLIC_KEY_BASE64),
    // Optional: see auth-service/src/config/env.js for the full explanation —
    // lets verifyLocal() below still accept tokens signed under the
    // pre-rotation key during the handover window.
    previousPublicKey: decodeKey(process.env.JWT_PREVIOUS_PUBLIC_KEY_BASE64),
    issuer: process.env.JWT_ISSUER || 'hackathon-auth-service',
    audience: process.env.JWT_AUDIENCE || 'patchlinex',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  aiStorageServiceUrl: process.env.AI_STORAGE_SERVICE_URL || 'http://localhost:5002',
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN || '',

  // Where to send the browser after any OAuth callback (Jira, GitHub, ...) completes.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Shared 32-byte key (base64) used to encrypt every stored third-party OAuth
  // token at rest, across all integrations. Generate with: openssl rand -base64 32
  oauthTokenEncryptionKeyBase64: process.env.OAUTH_TOKEN_ENCRYPTION_KEY_BASE64 || '',

  // ---- Jira (OAuth 2.0 / 3LO — per-user consent, not a shared service account) ----
  // Register an OAuth 2.0 app at https://developer.atlassian.com/console/myapps/
  // Callback URL there must exactly match JIRA_REDIRECT_URI below.
  jira: {
    clientId: process.env.JIRA_CLIENT_ID || '',
    clientSecret: process.env.JIRA_CLIENT_SECRET || '',
    redirectUri: process.env.JIRA_REDIRECT_URI || 'http://localhost:5001/api/jira/oauth/callback',
    scopes: process.env.JIRA_SCOPES || 'read:jira-work write:jira-work read:jira-user offline_access',
    projectKey: process.env.JIRA_PROJECT_KEY || '',
    issueType: process.env.JIRA_ISSUE_TYPE || 'Task',
  },

  // ---- GitHub (OAuth App — per-user consent) ----
  // Register at https://github.com/settings/developers → "New OAuth App".
  // Classic GitHub OAuth App tokens do NOT expire, so there's no
  // refresh-token flow here — see docs/security.md for the tradeoff.
  // LEGACY PATH as of the GitHub App migration below: still used to keep
  // existing connected users working, and as the fallback when a user
  // hasn't installed the GitHub App yet. New connections should go through
  // the App flow (env.githubApp) instead — see docs/github-app-migration.md.
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:5001/api/github/oauth/callback',
    scopes: process.env.GITHUB_SCOPES || 'read:user user:email repo',

    // ---- Push webhooks (continuous/auto-rescan) ----
    // GITHUB_WEBHOOK_SECRET is the shared secret set on every hook we create
    // (services/githubService.js#createWebhook) and used to verify GitHub's
    // `X-Hub-Signature-256` header (config/github.js#verifyWebhookSignature).
    // GITHUB_WEBHOOK_URL is the public URL GitHub POSTs pushes to — must
    // resolve to POST /api/github/webhook on this service.
    // Only relevant for legacy per-repo hooks — a GitHub App uses ONE
    // app-level webhook configured in the App's GitHub settings instead
    // (see githubApp.webhookSecret below).
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    webhookUrl: process.env.GITHUB_WEBHOOK_URL || '',
  },

  // ---- GitHub App (installation tokens — P0 migration off classic OAuth) ----
  // Register at https://github.com/settings/apps → "New GitHub App". Fixes
  // the two structural problems with the OAuth App above: tokens that never
  // expire (a leaked token is a leaked token forever), and access scoped to
  // "everything the user can see" (`repo`) rather than only the repos they
  // actually installed the app on. See docs/github-app-migration.md for the
  // full setup + DB migration steps. Deliberately additive/opt-in: if this
  // block isn't configured, githubService.js falls back to the legacy OAuth
  // path above so existing connections keep working during the migration.
  githubApp: {
    appId: process.env.GITHUB_APP_ID || '',
    // PEM private key downloaded from the App's settings page, base64'd the
    // same way JWT_PUBLIC_KEY_BASE64 is (see decodeKey above): `base64 -w0 your-app.private-key.pem`.
    privateKey: decodeKey(process.env.GITHUB_APP_PRIVATE_KEY_BASE64),
    // Slug from the App's settings URL (github.com/settings/apps/<slug>) —
    // used to build the installation URL: github.com/apps/<slug>/installations/new.
    slug: process.env.GITHUB_APP_SLUG || '',
    // Only needed if "Request user authorization (OAuth) during
    // installation" is enabled on the App, to identify *which* user
    // installed it via the same code-exchange flow as the classic OAuth App.
    clientId: process.env.GITHUB_APP_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || '',
    // Single app-level webhook secret (Settings → Webhook → Secret) — every
    // installation's events (push, installation, installation_repositories)
    // arrive on the same URL, unlike the legacy per-repo hooks above.
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET || '',
  },

  projectName: process.env.PROJECT_NAME || 'hackathon-template',

  // Outbound request timeouts (ms) — see utils/httpClient.js. Scan/fix are
  // generous because ai-storage-service's own work (batched AI calls across
  // many files, then a verification pass) genuinely takes a while; everything
  // else is a plain REST call and should fail fast instead of hanging.
  timeouts: {
    github: Number(process.env.GITHUB_UPSTREAM_TIMEOUT_MS) || 15000,
    jira: Number(process.env.JIRA_UPSTREAM_TIMEOUT_MS) || 15000,
    aiStorage: Number(process.env.AI_STORAGE_UPSTREAM_TIMEOUT_MS) || 15000,
    scan: Number(process.env.SCAN_UPSTREAM_TIMEOUT_MS) || 180000,
    fix: Number(process.env.FIX_UPSTREAM_TIMEOUT_MS) || 150000,
    proxy: Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS) || 30000,
  },
};

if (env.nodeEnv === 'production' && !env.jwt.publicKey) {
  throw new Error('[env] JWT_PUBLIC_KEY_BASE64 must be set in production (copy it from auth-service).');
}

// CORS_ORIGINS is this service's CSRF defense (see docs/security.md) — there's
// no separate CSRF token, so a tight origin allow-list plus httpOnly cookies
// is what stops a cross-origin page from riding the user's session. A
// wildcard silently removes that protection while everything else keeps
// working, so fail loudly instead of deploying with CORS effectively open.
if (env.nodeEnv === 'production' && env.corsOrigins.includes('*')) {
  throw new Error(
    "[env] CORS_ORIGINS must not contain '*' in production — this is the service's CSRF defense (see docs/security.md). List explicit origins instead."
  );
}

module.exports = env;
