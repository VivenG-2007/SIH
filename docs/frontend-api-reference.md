# Frontend API Reference

This document covers every endpoint consumed by the Next.js frontend (`frontend/lib/api.ts`), verified against controller source code.

> [!NOTE]
> **Uniform Error Response Format** across Node (`errorHandler.js`) and Python (`errors.py`):
> ```json
> {
>   "error": {
>     "message": "Human-readable description",
>     "code": "ERROR_CODE",
>     "requestId": "uuid-v4-string"
>   }
> }
> ```
> Validation failures include an optional `"details"` array.

Unless marked **Public**, all requests require authentication via the `access_token` httpOnly cookie (`withCredentials: true`) or an `Authorization: Bearer <token>` header.

---

## 1. `authApi` → auth-service (`NEXT_PUBLIC_AUTH_API_URL`, default `:5000`)

### `POST /api/auth/register` — Public
Called by: `AuthContext.register()`
```json
// Request
{ "name": "string (1-120)", "email": "string", "password": "string (min 8)" }

// Response 201
{
  "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" },
  "accessToken": "jwt-token-string"
}
```
Sets `access_token` + `refresh_token` httpOnly cookies. Returns `409 EMAIL_TAKEN` if email exists.

### `POST /api/auth/login` — Public
Called by: `AuthContext.login()`
```json
// Request
{ "email": "string", "password": "string" }

// Response 200
{
  "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" },
  "accessToken": "jwt-token-string"
}
```
Returns `401 INVALID_CREDENTIALS` on authentication failure.

### `POST /api/auth/refresh` — Public (reads `refresh_token` cookie)
Called by: Shared Axios interceptor in `lib/api.ts` and edge `middleware.ts`.
```json
// Request: None (reads refresh_token cookie)
// Response 200: Rotates cookies and returns new access token
{
  "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" },
  "accessToken": "jwt-token-string"
}
```

### `POST /api/auth/logout`
Called by: `AuthContext.logout()`
```json
// Response 200
{ "message": "Logged out" }
```
Clears authentication cookies and revokes active refresh token.

### `GET /api/auth/me`
Called by: `AuthContext` on mount (`refreshUser()`)
```json
// Response 200
{ "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" } }
```

---

## 2. `mainApi` → main-service (`NEXT_PUBLIC_MAIN_API_URL`, default `:5001`)

### GitHub Integration (`githubApi`)

- **`GET /api/github/status`**
  ```json
  // Response 200
  { "connected": true, "username": "octocat", "avatarUrl": "https://...", "scopes": "repo" }
  ```
- **`GET /api/github/oauth/start?redirect=<path>`** — Full page navigation (initiates GitHub OAuth flow).
- **`GET /api/github/oauth/callback`** — Public OAuth callback endpoint.
- **`DELETE /api/github/disconnect`** — Revokes token upstream and deletes stored credential.
- **`GET /api/github/repos`** — Returns repository list.
  ```json
  { "repos": [ { "id": 123, "fullName": "owner/repo", "private": false, "url": "https://..." } ] }
  ```
- **`POST /api/github/issues`** — Creates GitHub issue via user OAuth connection.

### Jira Integration (`jiraApi`)

- **`GET /api/jira/status`**
  ```json
  { "connected": true, "siteName": "my-site", "siteUrl": "https://my-site.atlassian.net" }
  ```
- **`GET /api/jira/oauth/start?redirect=<path>`** — Full page navigation (initiates Jira OAuth flow).
- **`GET /api/jira/oauth/callback`** — Public OAuth callback endpoint.
- **`DELETE /api/jira/disconnect`** — Clears stored Jira OAuth credentials.
- **`POST /api/jira/issues`** — Creates Jira ticket.
  ```json
  // Request
  { "summary": "Vulnerability Title", "description": "Details...", "issueType": "Task" }
  ```

### Scanner (`scannerApi`)

- **`POST /api/scanner/scan`**
  ```json
  // Request
  { "repoOwner": "owner", "repoName": "repo", "branch": "main" }
  // Response 202
  { "scanId": "scan-xxxx", "status": "QUEUED", "repo": "owner/repo" }
  ```
- **`GET /api/scanner/status/:scanId`** — Polls scan progress, findings, and fix statuses.
- **`POST /api/scanner/approve-fix`**
  ```json
  // Request
  { "scanId": "scan-xxxx", "findingId": "F-1" }
  // Response 202
  { "scanId": "scan-xxxx", "findingId": "F-1", "status": "FIX_QUEUED" }
  ```
- **`GET /api/scanner/history?limit=20`** — Returns user scan history records.

---

## 3. Proxied AI & File Services (`/api/proxy/*` → ai-storage-service)

- **`POST /api/proxy/api/ai/chat`** — Multi-turn chat completion.
- **`POST /api/proxy/api/ai/analyze`** — Single-shot analytical inspection.
- **`POST /api/proxy/api/files/upload`** — Multipart file upload (`file`) to Azure Blob Storage.
- **`GET /api/proxy/api/files`** — Lists user uploaded file metadata.
