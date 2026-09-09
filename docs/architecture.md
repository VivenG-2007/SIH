# Architecture

```
                         ┌───────────────────────┐
                         │        Vercel          │
                         │   frontend (Next.js)   │
                         └───────────┬─────────────┘
                                     │ HTTPS, credentials: include
                                     ▼
                    ┌────────────────────────────────────┐
                    │        main-service (Azure)         │
                    │  Supabase · Redis · rate limiting   │
                    │  verifies JWT locally (RS256)       │
                    └───────┬───────────────────┬─────────┘
                            │                    │
                 JWT verified locally  ┌─────────┘  JWT verified locally
                            │          │            (proxy /api/proxy/*)
                            ▼          ▼
        ┌─────────────────────┐   ┌───────────────────────────┐
        │   auth-service        │   │  ai-storage-service        │
        │   (Azure)              │   │  (Azure)                    │
        │   MongoDB (users)      │   │  MongoDB · Redis · Azure Blob│
        │   owns JWT PRIVATE key │   │  AI provider abstraction    │
        └─────────────────────┘   └───────────────────────────┘
```

## Why Three Independent Backends

- **`auth-service`** is the only service that ever touches the JWT **private** key. It signs access tokens (short-lived, 15m default) and refresh tokens (7d default, rotated on every use, individually revocable via a MongoDB `RefreshToken` collection).
- **`main-service`** and **`ai-storage-service`** each hold only the **public** key and verify every request's JWT signature locally with `jsonwebtoken` / `PyJWT` (`RS256`). Neither ever calls `auth-service` to check a token. This means:
  - The system keeps working for already-logged-in users even if `auth-service` is briefly down.
  - Verification is a cheap local CPU operation, not a network hop — critical for high API throughput (see [`docs/load-testing.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/load-testing.md)).
- **`ai-storage-service`** (Python/FastAPI — the other two services are Node/Express) is deliberately generic: a pluggable AI provider layer (`services/ai-storage-service/app/services/ai_providers/`) plus Azure Blob Storage + MongoDB + Redis + Elasticsearch.

---

## Key Rotation

`JWT_KID` is embedded in every signed token's header. `JWT_PREVIOUS_PUBLIC_KEY_BASE64` provides a dual-key handover window during rotation — see [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md)'s **JWT key rotation** section for the step-by-step procedure.

## Symmetric vs Asymmetric JWTs

This deployment uses **RS256 (asymmetric)**: the tradeoff is a slightly heavier token and key-management step (`npm run generate-keys`) in exchange for `auth-service` being the only service that can *issue* tokens, while every other service can only *verify* them.

---

### The 8-Stage Scan → Fix Pipeline

This section documents the SAST vulnerability detection and fix pipeline.

```
Developer pushes / launches scan from UI
        │
        ▼
Stage 1: Queued (Redis BullMQ)
        │  Enqueues scan job with 202 Accepted, rate-limit evaluation
        ▼
Stage 2: Repository Fetch (Git Sparse Checkout)
        │  Fetches repo tree + scannable files via GitHub API (HTTPS only, no local execution)
        ▼
Stage 3: AST Parsing (Tree-sitter + Semgrep)
        │  Constructs ASTs, symbol tables, and data-flow taint graphs
        ▼
Stage 4: Deterministic SAST (Semgrep Core Rules)
        │  Executes 248+ Semgrep rulesets (semgrep-rules/patchlinex-rules.yml) + Regex secrets rules
        ▼
Stage 5: Supplementary AI Scan (GPT-4.1 mini)
        │  Evaluates SAST candidates to prune false positives & surface business logic flaws
        ▼
Stage 6: RAG Memory Recall (Chroma Cloud Vector DB)
        │  Embeds findings and queries Chroma finding_memory for prior art fixes (threshold 0.35)
        ▼
Stage 7: Severity Triage (Patchline X Risk Engine)
        │  Deduplicates overlapping SAST + AI findings, assigns CWE classifications & risk scores
        ▼
Stage 8: Awaiting Approval (Patchline X Gatekeeper)
        │  Persists scan report to Azure Blob Storage & MongoDB scan_history. Arms human approval gate.
```

---

## Memory: Keyword Search vs RAG Semantic Retrieval

Two separate modules handle finding lookup and retrieval:

- **`app/core/es_client.py`** — Elasticsearch-backed **keyword / full-text** search over past findings, powering the frontend's search bar (`GET /api/v1/search`). Falls back to a MongoDB regex scan if Elasticsearch is disabled (`app/routers/search.py`).
- **`app/core/memory_store.py`** — RAG **semantic retrieval**: embeds finding metadata (`text-embedding-3-small`) and indexes vectors into a **Chroma Cloud** collection (`finding_memory`). When generating a fix, past similar findings and their outcomes are retrieved (`retrieve_similar`) and injected into the prompt as prior art context.

```
Scan findings (per scan)                     New finding (fix requested)
        │                                              │
        ▼                                              ▼
Embed finding text                           Embed finding text
(app/services/embeddings.py)                 (same embed() call)
        │                                              │
        ▼                                              ▼
Upsert into Chroma Cloud                     Two-pass Chroma HNSW query:
finding_memory collection                    1. Owner-scoped query (ownerId + hasFix=True)
(index_finding)                              2. Community fallback (hasFix=True only)
                                             Filtered by MIN_SIMILARITY_THRESHOLD = 0.35
                                                        │
                                                        ▼
                                              Top-k similar past findings +
                                              their fix outcomes labeled:
                                              - [VERIFIED SUCCESSFUL PATCH]
                                              - [FAILED / UNVERIFIED ATTEMPT]
                                              - [COMMUNITY PRIOR ART]
                                                        │
                                                        ▼
                                              _generate_fix (gpt-5.2) generates
                                              patch obeying critical directives
                                                        │
                                                        ▼
                                              record_fix_outcome stamps the
                                              verified outcome back onto Chroma,
                                              closing the loop for future scans
```


---

## Isolated Execution Sandbox: Process vs Kubernetes Backend

Third verification signal at fix time (alongside the deterministic rescan
and the AI review pass): the patched file is actually compiled/executed,
and the result is handed back as an independent signal. Two interchangeable
backends live behind one interface (`app/services/sandbox/execute_patch`,
and the result is handed back as an independent signal.

```
routers/scanner.py::generate_and_verify_fix
        │
        ▼
app/services/sandbox/__init__.py::execute_patch()
        │
        ▼
execute.py: fresh tempdir, rlimits, best-effort
unshare --net, non-root subprocess (see base.py)
        │
        ▼
SandboxExecutionResult
```

The verification engine and everything upstream of `execute_patch()` receives
a standardized `SandboxExecutionResult` detailing phase results, applied security
controls, stdout/stderr, and exit code.
