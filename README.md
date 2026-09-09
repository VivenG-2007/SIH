# Patchline X

AI-reviewed vulnerability scanning with human-approved, tested pull requests. **1 Next.js frontend + 3 independent backend services**, wired together with JWT auth, Redis, Supabase, MongoDB, and Azure Blob Storage.

```
Vercel (frontend) → main-service (Azure, Supabase+Redis) → ai-storage-service (Azure, Mongo+Redis+Blob+ES)
                                                    ↑
                                           auth-service (Azure, Mongo) — issues JWTs
```

Full architecture documentation: [`docs/architecture.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/architecture.md) · Mermaid source: `infrastructure/diagrams/architecture.mmd`

---

## 1. Overview

| Piece | Tech | Role |
|---|---|---|
| `frontend/` | Next.js 16, React 19, TypeScript, Tailwind v4 | Login/register, dashboard, AI vulnerability scanner UI, deploys to Vercel |
| `services/auth-service` | Node/Express, MongoDB, Redis | Registers/logs in users, signs RS256 JWTs, owns the private key |
| `services/main-service` | Node/Express, Supabase, Redis | Main product API, gateway to ai-storage-service, Jira + GitHub OAuth integrations, BullMQ queue worker |
| `services/ai-storage-service` | **Python/FastAPI**, MongoDB, Redis, Azure Blob, Elasticsearch | SAST scanning engine (Semgrep + Tree-sitter + Regex), LLM fix generator, RAG memory, file storage |

> [!NOTE]
> **The Core Architecture Principle:** `auth-service` signs tokens with an RS256 private key. `main-service` and `ai-storage-service` each hold only the matching *public* key and verify every request's JWT signature locally — no network hops back to `auth-service` on the hot path.

---

## 2. Directory Structure

```
patchlinex/
├── frontend/                  # Next.js frontend app (Vercel)
├── services/
│   ├── auth-service/          # Authentication service (Azure App Service)
│   ├── main-service/          # Core API & integration gateway (Azure App Service)
│   └── ai-storage-service/    # SAST scanner & AI storage engine (Azure Web App for Containers)
├── infrastructure/diagrams/   # Architecture diagrams (.mmd)
├── load-test/                 # Autocannon & k6 benchmark scripts
├── docs/                      # Technical documentation (architecture, deployment, security, api, etc.)
├── .github/workflows/         # Path-filtered CI/CD workflows
├── docker-compose.yml         # Local development stack
├── package.json               # Root dev/build/test scripts
└── README.md
```

Each service under `services/` is self-contained with its own `package.json` / `Dockerfile` / `.env.example`.

---

## 3. Local Setup

**Prerequisites:** Node 18+, Python 3.10+, and Docker (or local MongoDB + Redis).

```bash
git clone <repo-url> && cd patchlinex
npm run install:all          # installs all Node and Python dependencies
npm run generate-keys        # prints a fresh RS256 keypair
```

1. Copy `JWT_PRIVATE_KEY_BASE64` into `services/auth-service/.env`.
2. Copy `JWT_PUBLIC_KEY_BASE64` into **both** `services/main-service/.env` and `services/ai-storage-service/.env` (and optionally `frontend/.env.local`).
3. Fill in database connection strings in each service's `.env` (copied from `.env.example`).

### With Docker

```bash
npm run docker:up
```

Starts Redis, MongoDB, Elasticsearch, all three backend services, and the Next.js frontend.

### Without Docker

```bash
npm run dev
```

Runs all four services concurrently color-coded in terminal output.

- **Frontend UI**: http://localhost:3000
- **auth-service**: http://localhost:5000
- **main-service**: http://localhost:5001
- **ai-storage-service**: http://localhost:5002 (Docs at http://localhost:5002/docs)

---

## 4. Documentation Index

- [`docs/api.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/api.md) — Complete API route specifications and payload definitions.
- [`docs/architecture.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/architecture.md) — System architecture, scan-to-fix pipeline, and RAG memory details.
- [`docs/deployment.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/deployment.md) — Azure App Service setup, autoscale configuration, and GitHub Actions CI/CD workflows.
- [`docs/frontend-api-reference.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/frontend-api-reference.md) — Next.js frontend API reference and client endpoints.
- [`docs/load-testing.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/load-testing.md) — Local vs. production capacity testing guidelines.
- [`docs/onboarding.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/onboarding.md) — Quick-start guide for new team members.
- [`docs/production-readiness.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/production-readiness.md) — Assessment of technical readiness and open priority items.
- [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md) — Encryption, JWT key rotation, CORS, rate limiting, and OAuth security controls.

---

## 5. Troubleshooting

| Symptom | Likely Cause | Solution |
|---|---|---|
| `401 Unauthorized` on requests right after login | `JWT_PUBLIC_KEY_BASE64` mismatch on `main-service` or `ai-storage-service` | Run `npm run generate-keys` in `auth-service` and copy keypair values across all `.env` files |
| Cookies not setting in browser | Missing `Secure` + `SameSite=None` or HTTPS requirement | Cross-site cookies require HTTPS. Test against HTTPS URLs or use `Authorization: Bearer <token>` for local API calls |
| `AADSTS700213` during Azure deploy | GitHub repo name mismatch in federated credentials | Update subject in Azure AD federated credentials to match exact GitHub org/repo name (see [`docs/deployment.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/deployment.md)) |
| `/jira` connection error | Callback URL mismatch | Ensure `JIRA_REDIRECT_URI` matches Atlassian Console callback URL byte-for-byte |
| `/github` connection error | OAuth callback URL mismatch | Ensure `GITHUB_REDIRECT_URI` matches GitHub Developer Settings callback URL |
