import base64
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


def _decode_key(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return base64.b64decode(value).decode("utf-8")
    except Exception:
        return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    port: int = 5002
    service_name: str = "ai-storage-service"

    cors_origins: str = "http://localhost:3000"

    jwt_public_key_base64: Optional[str] = None
    # Optional: see auth-service's equivalent env var for the full
    # explanation — lets _verify() in core/security.py still accept tokens
    # signed under the pre-rotation key during the handover window.
    jwt_previous_public_key_base64: Optional[str] = None
    jwt_issuer: str = "hackathon-auth-service"
    jwt_audience: str = "patchlinex"

    internal_service_token: str = ""

    mongodb_uri: Optional[str] = None
    mongodb_database: str = "ai_storage_db"

    redis_url: str = "redis://localhost:6379"

    azure_storage_connection_string: Optional[str] = None
    azure_storage_container: str = "hackathon-uploads"
    max_upload_bytes: int = 25 * 1024 * 1024

    ai_provider: str = "mock"
    ai_model: str = "llama-3.1-8b-instant"
    ai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""
    azure_openai_deployment_name: str = ""  # alias used in .env
    azure_openai_api_key: str = ""          # maps to AZURE_OPENAI_API_KEY
    azure_openai_api_version: str = "2024-06-01"  # maps to AZURE_OPENAI_API_VERSION

    # ── Cost-tiered scanner deployments (Azure AI Foundry) ──
    # scan   (gpt-4.1-mini) — bulk repo scanning; fans out over every
    #                         scannable file, so it runs on the cheapest tier.
    # fix    (gpt-5.2)      — generates the actual patch for one approved
    #                         finding at a time.
    # verify (codex-5.3)    — code-specialized recheck of the generated patch.
    azure_openai_deployment_scan: str = ""    # gpt-4.1-mini
    azure_openai_deployment_fix: str = ""     # gpt-5.2
    azure_openai_deployment_verify: str = ""  # codex-5.3
    azure_openai_embedding_deployment: str = "text-embedding-3-small"

    # ── Groq API Configuration (High-speed NLP Questions) ──
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # ── Embedding Provider (RAG memory & semantic search) ──
    # Supports: "openrouter" (free embedding models), "mock", "azure_openai"
    embedding_provider: str = "openrouter"
    openrouter_embedding_model: str = "liquid/lfm-2.5-embedding-350m:free"

    # ── RAG Memory (Chroma Cloud) ──
    rag_memory_enabled: bool = False
    chroma_api_key: str = ""
    chroma_tenant: str = ""
    chroma_database: str = ""
    chroma_collection: str = "finding_memory"

    project_name: str = "hackathon-template"


    # ── Isolated execution sandbox (app/services/sandbox/) ──
    # Third, independent verification signal alongside the deterministic
    # rescan and the AI review pass: actually compile/execute the patched
    # file in a resource-limited, non-root, ephemeral subprocess. Additive
    # and best-effort by design — see generate_and_verify_fix in
    # routers/scanner.py — a sandbox error/timeout/unsupported-language never
    # blocks or fails the fix, it just means this signal is absent for that
    # finding, same as _rescan_verify_fix returning None today.
    sandbox_execution_enabled: bool = True
    sandbox_cpu_seconds: int = 10
    sandbox_memory_mb: int = 256
    sandbox_timeout_seconds: int = 20

    # ── Sandbox execution backend ──
    # "process" is the sole supported backend: in-process subprocess sandbox
    # (execute.py/base.py) with real rlimits, non-root execution, and
    # best-effort netns isolation. Zero extra infra — a plain
    # `docker compose up` works out of the box.
    # Kubernetes execution has been removed; this constant is kept so any
    # existing .env files that set SANDBOX_BACKEND=process continue to work
    # without change. Any value other than "process" is silently ignored and
    # falls back to "process".
    sandbox_backend: str = "process"

    # ── OpenRouter fallback AI provider ──
    # OpenRouter exposes an OpenAI-compatible /v1/chat/completions endpoint
    # that can route to 200+ models. When the primary AI provider (AI_PROVIDER)
    # returns an HTTP 5xx error or times out, the AI layer automatically
    # retries the same request through OpenRouter instead of propagating the
    # failure. Set AI_PROVIDER_FALLBACK=none to disable fallback entirely.
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"   # High capability model on OpenRouter
    ai_provider_fallback: str = "openrouter"                           # "openrouter" | "none"


    # ── Risk quantification defaults ──
    # Fallback business context used when no BusinessService mapping has
    # been registered for a repo (see app/services/risk/business_criticality.py,
    # which IS wired up — this comment previously said otherwise before that
    # module existed). A registered mapping replaces these per-asset; until
    # then every scanned repo prices against these flat defaults, and every
    # risk computation's EvidenceTrail says so explicitly
    # (business_criticality.py's `used_default` flag) rather than letting a
    # default look like a calibrated per-repo signal.
    risk_default_industry: str = "technology"
    risk_default_asset_criticality: float = 0.5
    # Comma-separated control keys (must match app/services/risk/data_sources.py
    # CONTROL_LIKELIHOOD_REDUCTION) assumed active for every repo by default,
    # e.g. "mfa_credential_attacks". Empty by default — an org should
    # configure this to its own actually-deployed controls, not accept a
    # default that silently claims credit for controls that aren't there.
    risk_default_active_controls: str = ""
    risk_auto_compute_enabled: bool = True

    # ── CISA KEV integration (app/services/risk/kev.py) ──
    # Real signal, not a placeholder: the CISA Known Exploited
    # Vulnerabilities catalog is a free, public, no-auth-required JSON feed.
    # Cached in-memory for kev_cache_ttl_seconds so every finding-pricing
    # call doesn't hit the network. IMPORTANT — this only enriches findings
    # that carry a real CVE ID; this scanner is currently SAST/pattern-based
    # (Semgrep + tree-sitter) with no dependency/SCA scanning path, so no
    # finding emits a CVE ID today. This module is correct and ready the
    # moment a CVE-backed finding source (e.g. dependency scanning) exists —
    # see kev.py's module docstring for the honest coverage caveat.
    kev_feed_url: str = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
    kev_cache_ttl_seconds: int = 21600  # 6 hours — CISA updates multiple times/week, not multiple times/hour
    kev_fetch_timeout_seconds: int = 15

    # ── Secrets management (P0#4) — see app/core/secrets.py ──
    # "env" is what every environment (including today's actual
    # deployment) uses right now — reading process env is also literally
    # how Azure App Service surfaces a Key-Vault-backed app setting to a
    # running process, so this isn't being deprecated, just no longer the
    # ONLY path. Set to "azure_keyvault" + secrets_keyvault_url once a
    # vault is provisioned and the deployed identity is granted
    # 'Key Vault Secrets User'.
    secrets_provider: str = "env"
    secrets_keyvault_url: Optional[str] = None

    # ── Field-level encryption (P0#6) — see app/core/encryption.py ──
    # The NAME of the secret (fetched via secrets_provider above) holding
    # the base64-encoded 32-byte AES-256 key used to encrypt sensitive
    # fields (business-criticality revenue figures, calibration EAL/
    # likelihood figures, telemetry payloads) before they're written to
    # Mongo. Never a key value itself — always a lookup name.
    encryption_key_secret_name: str = "risk-field-encryption-key"

    # ── SAST engine (Semgrep) ──
    # The deterministic scanner's primary pass. `semgrep_config_path` points
    # at a local, repo-committed rule pack (see semgrep-rules/patchlinex-rules.yml)
    # so a scan never depends on the public Semgrep Registry being reachable.
    # `semgrep_extra_configs` optionally layers registry rulesets (or other
    # local paths) on top for deployments that want broader coverage and
    # accept that network dependency — comma-separated, e.g.
    # "p/security-audit,p/secrets". Empty by default (local-only, no network
    # call at scan time).
    semgrep_enabled: bool = True
    semgrep_binary: str = "semgrep"
    semgrep_config_path: str = "semgrep-rules/patchlinex-rules.yml"
    semgrep_extra_configs: str = ""
    semgrep_timeout_seconds: int = 60
    semgrep_max_target_bytes: int = 2_000_000

    @property
    def semgrep_extra_config_list(self) -> list[str]:
        return [c.strip() for c in self.semgrep_extra_configs.split(",") if c.strip()]

    # ── AST engine (Tree-sitter) ──
    # The third deterministic pass (app/services/scanning/treesitter_engine.py).
    # Parses each supported file once into a real AST and re-derives the same
    # vulnerability categories the regex/Semgrep layers cover, but from
    # structure (call/assignment/import nodes) instead of text shape. Its
    # findings are never a replacement for Semgrep's — they exist to (a) give
    # a same-process structural signal when the semgrep binary is missing,
    # and (b) add corroborating "structural evidence" to the aggregator so a
    # finding two or three engines agree on can be surfaced as one
    # higher-confidence finding (see deterministic_scanner._dedupe) and given
    # richer AST context in the AI enrichment prompt.
    treesitter_enabled: bool = True

    # ── Stuck-fix reconciliation sweep ──
    # generate_and_verify_fix marks a finding FIX_PROCESSING before doing any
    # real work, then FIX_VERIFIED/FIX_NEEDS_REVIEW/FIX_FAILED when it's done.
    # A normal exception is already caught and marks FIX_FAILED (see
    # _mark_failed), but a hard process kill or infra-level timeout mid-request
    # skips that cleanup entirely, leaving the finding stuck in FIX_PROCESSING
    # forever with no retry possible (FIX_PROCESSING only has a self-loop, per
    # state_machine.TRANSITIONS). This periodic sweep catches that case.
    stuck_fix_processing_minutes: int = 30  # older than this = considered abandoned
    reconciliation_interval_seconds: int = 300  # how often the sweep runs

    # ── Elasticsearch (optional — search degrades gracefully if unset) ──
    # Direct endpoint URL (e.g. http://localhost:9200 or https://your-es-cluster-endpoint:9200)
    es_endpoint: Optional[str] = None
    es_url: Optional[str] = None
    es_cloud_id: Optional[str] = None
    es_api_key: Optional[str] = None
    es_username: Optional[str] = None
    es_password: Optional[str] = None

    # ── RAG memory (Remember step — app/core/memory_store.py) ──
    # Semantic recall over past findings/fixes at fix-generation time.
    # Disable to fall back to the pipeline's pre-existing behavior (fix
    # generation runs with no retrieved context, same as before this existed).
    rag_memory_enabled: bool = True

    # "mock" (default): deterministic hash-based vectors, zero dependency,
    # exercises the full index -> retrieve -> augment path with no API key —
    # not semantically meaningful, see app/services/embeddings.py docstring.
    # "azure_openai": real embeddings via AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    # reusing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY from the chat tiers
    # above.
    embedding_provider: str = "mock"
    azure_openai_embedding_deployment: str = ""

    # ── Chroma Cloud (vector storage for RAG memory — app/core/chroma_client.py) ──
    # Embeddings for finding_memory live in a Chroma Cloud collection rather
    # than alongside the finding metadata, so this is required whenever
    # RAG_MEMORY_ENABLED is true. tenant/database can be left unset — the
    # CloudClient resolves them from the API key's scope as long as the key
    # is scoped to a single database.
    chroma_api_key: Optional[str] = None
    chroma_host: str = "api.trychroma.com"   # override only for self-hosted Chroma
    chroma_tenant: Optional[str] = None
    chroma_database: Optional[str] = None
    chroma_collection: str = "finding_memory"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def jwt_public_key(self) -> Optional[str]:
        return _decode_key(self.jwt_public_key_base64)

    @property
    def jwt_previous_public_key(self) -> Optional[str]:
        return _decode_key(self.jwt_previous_public_key_base64)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and not settings.jwt_public_key:
        raise RuntimeError(
            "JWT_PUBLIC_KEY_BASE64 must be set in production (copy it from auth-service)."
        )
    # CORS_ORIGINS is this service's CSRF defense (see docs/security.md) — no
    # separate CSRF token, so a tight origin allow-list plus httpOnly cookies
    # is what stops a cross-origin page from riding the user's session. A
    # wildcard silently removes that protection while everything else keeps
    # working, so fail loudly instead of deploying with CORS effectively open.
    if settings.environment == "production" and "*" in settings.cors_origin_list:
        raise RuntimeError(
            "CORS_ORIGINS must not contain '*' in production — this is the service's "
            "CSRF defense (see docs/security.md). List explicit origins instead."
        )
    return settings
