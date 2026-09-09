# Security Controls & Policy

This document outlines the security architecture and defensive controls implemented across Patchline X services.

## 1. Core Service Hardening

Every backend service enforces the following baseline security measures:

- **Security Headers**: `helmet()` middleware applied across all Express and FastAPI applications.
- **CORS Protection**: Origin restriction tied to `CORS_ORIGINS` configuration. Wildcards (`*`) are automatically rejected in production environments.
- **Distributed Rate Limiting**: Shared Redis-backed rate limiters (`rate-limit-redis` / `slowapi`) prevent brute-force attacks across scaled service replicas.
- **Input Validation**: `express-validator` and Pydantic schemas sanitize incoming request payloads.
- **Safe Error Handling**: Error handlers strip stack traces and internal debugging information in production (`NODE_ENV=production`).
- **Request Tracing**: `x-request-id` header generated/propagated on every request for distributed log correlation.

---

## 2. Authentication & Password Security

- **Password Hashing**: Passwords hashed using `bcryptjs` with cost factor 12.
- **Access Tokens**: Short-lived (15 minutes), signed using **RS256 (asymmetric key pair)**.
- **Refresh Tokens**: Long-lived (7 days), stored in MongoDB `RefreshToken` collection, **rotated on every invocation**. Replayed or reused refresh tokens trigger immediate session invalidation.
- **Global Logout**: `User.tokenVersion` allows immediate invalidation of all user sessions via `POST /api/auth/logout-all`.
- **Cookies**: Transmitted with `httpOnly`, `Secure`, and `SameSite=None` attributes.

> [!IMPORTANT]
> **JWT Key Rotation Procedure**:
> 1. Generate new RS256 key pair (`npm run generate-keys`).
> 2. Move existing public key into `JWT_PREVIOUS_PUBLIC_KEY_BASE64` across all services.
> 3. Update `auth-service` with new `JWT_PRIVATE_KEY_BASE64` and set new `JWT_PUBLIC_KEY_BASE64` across all three backends.
> 4. Deploy changes. Existing active tokens verify against `JWT_PREVIOUS_PUBLIC_KEY_BASE64` during the 7-day transition window.
> 5. Remove `JWT_PREVIOUS_PUBLIC_KEY_BASE64` after 7 days once all previous tokens expire.

---

## 3. File Upload Security (`ai-storage-service`)

- **MIME Type Restriction**: Strict allow-list enforced prior to Azure Blob upload.
- **Size Limits**: `MAX_UPLOAD_BYTES` (default 25MB) enforced during upload streaming.
- **Filename Sanitization**: Input filenames sanitized and stored under isolated path namespaces: `ownerId/uuid.ext`.
- **Streaming Downloads**: Files streamed directly to response streams without buffering full payloads into process memory.

---

## 4. Third-Party OAuth Integrations (Jira & GitHub)

- **CSRF State Verification**: `/oauth/start` generates a cryptographically secure random `state` string bound to the user's ID in Redis (5-minute TTL). Callback routes verify and consume the state value before completing authentication.
- **Encryption at Rest**: OAuth tokens in Supabase (`jira_connections`, `github_connections`) are encrypted using **AES-256-GCM** via `OAUTH_TOKEN_ENCRYPTION_KEY_BASE64`.
- **Token Revocation**: Disconnecting GitHub revokes credentials upstream (`DELETE /applications/{client_id}/token`) before deleting local records.

---

## 5. Secrets Management

> [!CAUTION]
> Never commit secrets or private keys to repository source control.
> - `JWT_PRIVATE_KEY_BASE64` must exist exclusively in `auth-service` environment configuration.
> - `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and must reside only in `main-service`.
