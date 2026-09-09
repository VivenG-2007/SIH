# API Reference

Base URLs are set in each service's `.env` (`PORT`) — default ports shown below.

Every authenticated route accepts the access token as **either** `Authorization: Bearer <token>` or the `access_token` httpOnly cookie. The frontend uses cookies automatically; use the `Authorization: Bearer <token>` header for curl / Postman requests.

> [!NOTE]
> All services return standard error responses in the following format:
> ```json
> {
>   "error": {
>     "message": "Human-readable error explanation",
>     "code": "MACHINE_READABLE_CODE",
>     "requestId": "uuid-v4-string"
>   }
> }
> ```

---

## 1. auth-service — `http://localhost:5000`

Responsible for user authentication, password hashing, and issuing/rotating RS256 JWT tokens.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `{ name, email, password }` → creates user, sets httpOnly cookies, returns `{ user, accessToken }` |
| `POST` | `/api/auth/login` | Public | `{ email, password }` → sets httpOnly cookies, returns `{ user, accessToken }` |
| `POST` | `/api/auth/refresh` | Refresh Cookie | Reads `refresh_token` cookie, rotates refresh token, returns new access token & sets cookies |
| `POST` | `/api/auth/logout` | Refresh Cookie | Revokes current refresh token, clears cookies |
| `POST` | `/api/auth/logout-all` | Access Token | Increments user's `tokenVersion`, revoking all active refresh tokens |
| `GET` | `/api/auth/me` | Access Token | Returns currently authenticated user profile |
| `POST` | `/api/auth/verify` | Public | Verification endpoint: `{ token }` → `{ valid, payload }` |
| `GET` | `/api/auth/jwks` | Public | Returns current public key + kid (JSON Web Key Set format) |
| `GET` | `/health`, `/ready`, `/metrics` | Public | Liveness, readiness (MongoDB/Redis status), process metrics |

---

## 2. main-service — `http://localhost:5001`

Main product API handling GitHub/Jira integrations, scan orchestration, BullMQ job queues, and proxying requests.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/scanner/scan` | Access Token | `{ repoOwner, repoName, branch? }` → enqueues background scan job, returns `202 Accepted` with `scanId` |
| `GET` | `/api/scanner/status/:scanId` | Access Token | Fetches scan progress, findings list, and fix status for given `scanId` |
| `POST` | `/api/scanner/approve-fix` | Access Token | `{ scanId, findingId }` → human approval gate, enqueues fix generation worker job |
| `GET` | `/api/scanner/history` | Access Token | `?limit=20` → returns scan history for current user |
| `GET` | `/api/github/oauth/start` | Access Token | Redirects browser to GitHub OAuth consent screen |
| `GET` | `/api/github/oauth/callback` | State-verified | OAuth callback from GitHub; validates state parameter and exchanges code for token |
| `GET` | `/api/github/status` | Access Token | `{ connected: boolean, username?, avatarUrl? }` connection status |
| `DELETE` | `/api/github/disconnect` | Access Token | Revokes GitHub token upstream and deletes local connection record |
| `GET` | `/api/github/repos` | Access Token | Lists user's GitHub repositories |
| `POST` | `/api/github/issues` | Access Token | `{ owner, repo, title, body? }` → creates GitHub issue via user's OAuth token |
| `POST` | `/api/github/webhook` | Webhook Secret | Continuous integration push/PR webhook endpoint |
| `GET` | `/api/jira/oauth/start` | Access Token | Redirects browser to Atlassian Jira OAuth consent screen |
| `GET` | `/api/jira/oauth/callback` | State-verified | OAuth callback from Atlassian; validates state parameter and exchanges code |
| `GET` | `/api/jira/status` | Access Token | `{ connected: boolean, siteName?, siteUrl? }` Jira connection status |
| `DELETE` | `/api/jira/disconnect` | Access Token | Deletes user's stored Jira OAuth tokens |
| `POST` | `/api/jira/issues` | Access Token | `{ summary, description, issueType? }` → creates Jira ticket using connected account |
| `GET` | `/api/jira/issues/:key` | Access Token | Fetches Jira ticket details by key (e.g. `PROJ-123`) |
| `ANY` | `/api/proxy/*` | Access Token | Transparent reverse proxy forwarding to `ai-storage-service` |
| `GET` | `/health`, `/ready`, `/metrics` | Public | Liveness, readiness (Redis & BullMQ connectivity), process metrics |

---

## 3. ai-storage-service — `http://localhost:5002`

Python FastAPI backend performing SAST scans (Semgrep + Tree-sitter + Regex), LLM fix generation, vector embedding memory (RAG), and Azure Blob file management.

> [!TIP]
> Interactive OpenAPI documentation is available live at `http://localhost:5002/docs` when running locally.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/scanner/scan` | Access Token / Internal | Runs multi-engine SAST scan + AI evaluation on target repository files |
| `POST` | `/api/v1/scanner/generate-and-verify-fix` | Access Token / Internal | Generates LLM fix, re-scans via deterministic engines to verify fix safety |
| `GET` | `/api/v1/scanner/history` | Access Token | Retrieves stored scan history records |
| `POST` | `/api/ai/chat` | Access Token | `{ messages, model?, conversationId? }` → conversational AI chat |
| `POST` | `/api/ai/generate` | Access Token | `{ prompt, model? }` → single-shot AI generation |
| `POST` | `/api/ai/analyze` | Access Token | `{ input, instructions?, model? }` → analytical text/code inspection |
| `GET` | `/api/v1/search` | Access Token | `?q=query` → full-text Elasticsearch / MongoDB regex search over findings |
| `GET` | `/api/v1/dashboard/stats` | Access Token | Aggregated scanner stats and severity counts for user dashboard |
| `GET` | `/api/v1/notifications` | Access Token | User notifications and scan alert events |
| `GET` | `/api/files` | Access Token | Lists user's uploaded files |
| `POST` | `/api/files/upload` | Access Token | Multipart upload (`file`) → uploads to Azure Blob Storage |
| `GET` | `/api/files/:id` | Access Token | Streams stored file content back to client |
| `DELETE` | `/api/files/:id` | Access Token | Removes file from Azure Blob Storage & MongoDB |
| `GET` | `/health`, `/ready`, `/metrics` | Public | Health, readiness (MongoDB/Redis/ES status), active AI provider metrics |
