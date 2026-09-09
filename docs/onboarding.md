# Onboarding Guide

Welcome to the team! Read this guide top-to-bottom before starting development.

## 1. Project Overview

Patchline X consists of **1 Next.js frontend + 3 independent backend microservices**, pre-wired with authentication, caching, database connections, and file storage.

> [!NOTE]
> Most feature development takes place in:
> - `frontend/app/` — User interface pages and components
> - `services/main-service/src/` — Business logic, routes, and background workers
> - `services/ai-storage-service/app/` — SAST scanner, AI fix generator, and RAG memory

Shared infrastructure (JWT authentication signing/verification, Redis rate limiting, CORS configuration, Dockerfiles, GitHub Actions workflows) is already fully implemented.

---

## 2. Getting Started (First 20 Minutes)

1. **Read [`README.md`](file:///c:/Users/viven/Desktop/launchpadx/README.md) completely.**
2. Obtain required environment variables from your team lead:
   - Shared RS256 keypair (`JWT_PRIVATE_KEY_BASE64` and `JWT_PUBLIC_KEY_BASE64`)
   - Supabase database credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
   - MongoDB connection string (`MONGODB_URI`)
   - Azure Blob Storage connection string (`AZURE_STORAGE_CONNECTION_STRING`)
3. **Install and launch services:**
   ```bash
   git clone <repo-url> && cd patchlinex
   npm run install:all
   # Configure .env files in each service directory
   npm run docker:up
   ```
4. **Verify installation:**
   - Open `http://localhost:3000` in your browser.
   - Confirm backend services report operational status.
   - Register a test account and navigate to `/dashboard` and `/upload`.

---

## 3. Quick Reference

| Task / Question | Reference Document |
|---|---|
| "How does authentication work?" | [`docs/architecture.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/architecture.md) |
| "What API routes are available?" | [`docs/api.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/api.md) |
| "How do I deploy changes?" | [`docs/deployment.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/deployment.md) |
| "What security controls are enforced?" | [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md) |
| "How do I load test endpoints?" | [`docs/load-testing.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/load-testing.md) |
| "What is the current production state?" | [`docs/production-readiness.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/production-readiness.md) |

---

## 4. Development Rules of Thumb

> [!WARNING]
> **Security & Secrets Rules:**
> - Never commit `.env` files. Only `.env.example` templates belong in version control.
> - Never put database URIs, service-role keys, or the JWT private key into `frontend/`.
> - Only `NEXT_PUBLIC_*` variables are exposed to browser bundles. `JWT_PUBLIC_KEY_BASE64` is server-side only in `middleware.ts`.
