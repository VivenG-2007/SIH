# GitHub OAuth App → GitHub App migration

## Why

The classic GitHub OAuth App integration (`src/config/github.js`) has two
structural problems `docs/production-readiness.md` flagged as a P0:

1. **Tokens never expire.** A leaked classic OAuth token (log line, error
   report, compromised DB backup) is valid forever — there's no rotation.
2. **Scope is all-or-nothing.** The `repo` scope grants access to
   *everything* the authorizing user can see, not just the repos they
   actually want Patchline X scanning.

A **GitHub App** (`src/config/githubApp.js`) fixes both: installation
tokens expire in 1 hour and are minted server-to-server from the App's
private key, and access is scoped to exactly the repos the user picked
during install.

## What changed in code

This migration is **additive, not a hard cutover** — both paths coexist:

| | Legacy (OAuth App) | New (GitHub App) |
|---|---|---|
| Config | `env.github` | `env.githubApp` |
| Credential | `github_connections` row, long-lived token | `github_app_installations` row, 1hr installation token minted on demand |
| Token cache | none needed (never expires) | `githubInstallationTokenStore.js`, Redis-backed, 2-min refresh margin |
| Start flow | `GET /api/github/oauth/start` | `GET /api/github/app/install` |
| Callback | `GET /api/github/oauth/callback` | `GET /api/github/app/callback` |
| Webhooks | one hook per watched repo (`githubService.createWebhook`) | one app-level webhook, configured once in GitHub's UI |
| `githubService.resolveToken(userId)` | checks `github_app_installations` first, falls back to `github_connections` — this is what every scan/fix/webhook call site now goes through |

Existing connected users are untouched. New users should be pointed at
`/api/github/app/install` once the App is registered (below); the OAuth
flow stays available as a fallback until it's deprecated.

## Setup steps (one-time, per environment)

1. **Register the App**: https://github.com/settings/apps → New GitHub App.
   - Webhook URL: same `POST /api/github/webhook` endpoint already in use.
   - Webhook secret: generate one, save it as `GITHUB_APP_WEBHOOK_SECRET`.
   - Permissions: Repository → Contents (read), Pull requests (read/write),
     Issues (read/write), Webhooks (read/write only if you want the App to
     manage its own hook — not required, since App hooks are configured at
     the App level, not per-repo like the legacy flow).
   - Subscribe to events: `push`.
   - "Where can this GitHub App be installed?": Any account (unless
     Patchline X is only ever used inside one org).
   - If you want to identify *which* user installed the App (not just
     which org/account): enable "Request user authorization (OAuth) during
     installation" and fill in the same callback URL pattern as the classic
     OAuth App uses, pointed at `/api/github/app/callback`.
2. **Generate a private key** on the App's settings page, download the
   `.pem`, then: `base64 -w0 your-app.private-key.pem` → set as
   `GITHUB_APP_PRIVATE_KEY_BASE64` (same encoding convention as
   `JWT_PUBLIC_KEY_BASE64`).
3. **Env vars** (see `src/config/env.js` for the full list):
   `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_APP_SLUG`
   (from the App's settings URL), `GITHUB_APP_WEBHOOK_SECRET`, and
   `GITHUB_APP_CLIENT_ID`/`GITHUB_APP_CLIENT_SECRET` only if user-auth is
   enabled per the previous step.
4. **Database migration** — run once against Supabase:
   ```sql
   create table github_app_installations (
     user_id text primary key,
     installation_id text not null,
     account_login text not null,
     account_type text,                     -- "User" | "Organization"
     account_avatar_url text,
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );
   create index if not exists github_app_installations_installation_id_idx
     on github_app_installations (installation_id);
   ```
5. **Frontend**: point the "Connect GitHub" button at
   `GET /api/github/app/install` instead of `/api/github/oauth/start`.
   `GET /api/github/status` now returns a `mode: 'app' | 'oauth'` field so
   the UI can show which kind of connection is active.

## What deliberately did NOT change

- Per-repo webhook management (`createWebhook`/`deleteWebhook` in
  `githubService.js`) is still there and still used for legacy OAuth
  connections. It's simply unused for App-flow connections, since the App
  has one webhook for every installation.
- `disconnect()` now tears down whichever kind of connection (or both) a
  user has — see the comment on that function in `githubController.js` for
  the exact ordering and why it matters. Note that removing our stored
  `github_app_installations` row does **not** revoke the App's access on
  GitHub's side — the user has to uninstall the App from their GitHub
  settings for that; we say so in the disconnect response's `note` field.
