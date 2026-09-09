import asyncio
import base64
import json
import re
import uuid
import datetime
from typing import List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.core import es_client, github_http, memory_store
from app.core.blob_storage import get_container_client
from app.core.db import get_db
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_auth, require_auth_optional, require_internal_service_token
from app.services.ai_providers import get_provider
from app.services.deterministic_scanner import scan_repo_files, scan_file
from app.services.sandbox import execute_patch
from app.services.sandbox.base import SandboxLimits
from app.services.scanning import treesitter_engine
from app.services import state_machine, severity
from app.services.risk import ingestion as risk_ingestion
from app.services.risk import pipeline_integration as risk_pipeline

GITHUB_API_BASE = "https://api.github.com"

# Every route here requires BOTH a valid end-user JWT (same local verification
# as ai.py/files.py — see docs/architecture.md) AND, when configured, the
# shared internal-service token main-service's proxyController attaches.
# These endpoints accept a raw GitHub access token in the request body, so
# leaving them open (as they previously were) would let anyone reachable on
# the network trigger a scan/fix using another user's GitHub credentials.
router = APIRouter(
    prefix="/api/v1/scanner",
    tags=["scanner"],
    dependencies=[Depends(require_internal_service_token)],
)
logger = get_logger()

# ──────────────────────── Model tier resolution ────────────────────────
# Three Azure AI Foundry deployments, chosen by task cost/quality profile:
#   scan   (gpt-4.1-mini) — runs over every file in every scan; cheapest tier
#   fix    (gpt-5.2)      — generates the actual code patch for an approved finding
#   verify (codex-5.3)    — code-specialized recheck of the generated patch
# Any tier that isn't explicitly configured falls back to the single
# AZURE_OPENAI_DEPLOYMENT_NAME so the template still works with one deployment.

def _default_deployment(settings) -> Optional[str]:
    return settings.azure_openai_deployment_name or settings.azure_openai_deployment or settings.ai_model or None


def _scan_model(settings) -> Optional[str]:
    return settings.azure_openai_deployment_scan or _default_deployment(settings)


def _fix_model(settings) -> Optional[str]:
    return settings.azure_openai_deployment_fix or _default_deployment(settings)


def _verify_model(settings) -> Optional[str]:
    return settings.azure_openai_deployment_verify or _default_deployment(settings)


# ──────────────────────── Repo-size scan tiering ────────────────────────
# The deterministic scanner always runs on every collected file — it's free.
# The AI supplemental pass is the cost knob, tiered by scannable file count:
#   <= 100 files   -> full AI supplemental coverage (every file, every batch)
#   101-300 files  -> AI supplemental still runs, batched, capped to bound cost
#   > 300 files    -> AI supplemental skipped entirely; deterministic only
_AI_SUPPLEMENTAL_FULL_THRESHOLD = 100
_AI_SUPPLEMENTAL_MAX_THRESHOLD = 300
_AI_SUPPLEMENTAL_MAX_BATCHES_TIER2 = 15  # cap on batches when 101-300 files


def _scan_tier_for(file_count: int) -> str:
    if file_count <= _AI_SUPPLEMENTAL_FULL_THRESHOLD:
        return "full"
    if file_count <= _AI_SUPPLEMENTAL_MAX_THRESHOLD:
        return "batched"
    return "deterministic_only"


# ──────────────────────── Schemas ────────────────────────

class ScanRequest(BaseModel):
    repoOwner: str
    repoName: str
    branch: Optional[str] = "main"
    githubToken: Optional[str] = None
    scanId: Optional[str] = None  # when set (e.g. by the main-service BullMQ worker), reused instead of generating a new one
    # When set (a webhook-triggered rescan — see main-service's
    # githubController.handleWebhook), only these paths are fetched/scanned
    # instead of the whole repo tree; findings from untouched files are
    # carried forward from the previous scan of this repo/branch instead of
    # being re-detected. See run_scan()'s "incremental" branch.
    changedFiles: Optional[List[str]] = None


class Finding(BaseModel):
    id: str
    title: str
    severity: str
    file: str
    line: int
    description: str
    suggestedFix: Optional[str] = None
    source: str = "ai"  # "deterministic" (primary, regex-based) or "ai" (supplemental)
    # Only set for source="deterministic" findings — the specific regex rule
    # (and its category) that fired. Kept around so generate_and_verify_fix
    # can independently re-run THIS rule against the post-fix file content
    # instead of trusting an AI opinion of whether the fix worked.
    ruleKey: Optional[str] = None
    category: Optional[str] = None
    # Only set for source="deterministic" findings — which engine(s)
    # (semgrep / regex / treesitter) independently fired at this
    # (file, line, category). More than one entry means multiple engines
    # agreed, which is the corroboration signal described in
    # deterministic_scanner._dedupe.
    evidence: Optional[List[str]] = None
    # Only ever set for source="ai" findings — the model's own stated
    # confidence ("high"/"medium"/"low") that this is a real, exploitable
    # issue rather than a stylistic nit or a misread of the code. Deterministic
    # findings don't carry this: a regex/AST rule either matched or it didn't,
    # there's no gradient of confidence to express. Surfaced to the reviewer
    # so a "low" AI finding is visibly more provisional than a "high" one,
    # instead of every AI finding looking identically authoritative.
    confidence: Optional[str] = None
    # Populated by _attach_financial_impact() just before the scan response
    # is built — see app/services/risk/pipeline_integration.py. None if risk
    # auto-compute is disabled (settings.risk_auto_compute_enabled) or if
    # pricing this finding failed (logged, never fails the scan itself).
    financialImpact: Optional[dict] = None


class ScanResponse(BaseModel):
    scanId: str
    status: str
    repo: str
    findingsCount: int
    findings: List[Finding]
    # Portfolio-level roll-up of every finding's financialImpact — see
    # app/services/risk/pipeline_integration.aggregate_portfolio_risk().
    # None if risk auto-compute is disabled.
    riskSummary: Optional[dict] = None
    blobUri: Optional[str] = None
    blobName: Optional[str] = None
    scanTier: Optional[str] = None            # "full" | "batched" | "deterministic_only" | "incremental"
    aiAnalysisNote: Optional[str] = None       # human-readable note when AI coverage was limited
    resolvedCount: Optional[int] = None        # incremental scans only — findings from the previous scan that no longer reproduce
    # RAG "Remember" step (app/core/memory_store.py): whether this scan's
    # findings were queued for embedding into Chroma Cloud as they were
    # persisted. Doesn't confirm each one succeeded (index_finding is
    # best-effort and never raises) — just whether the pipeline is switched
    # on, so the UI can show "memory indexing enabled" vs. leave it out
    # entirely when RAG_MEMORY_ENABLED=false.
    ragMemoryEnabled: bool = False


class SimilarPastFix(BaseModel):
    similarity: float
    title: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    file: Optional[str] = None
    fixSummary: Optional[str] = None
    verified: bool = False


class FixRequest(BaseModel):
    scanId: str
    findingId: str
    repoOwner: str
    repoName: str
    branch: str
    githubToken: Optional[str] = None


class FixResponse(BaseModel):
    scanId: str
    findingId: str
    verified: bool
    fixBranch: str
    summary: str
    details: Optional[str] = None
    # RAG "Recall" step: past fixes retrieve_similar found for this owner
    # before the fix prompt was built (memory_store.retrieve_similar) — []
    # when memory is disabled, nothing similar was found, or retrieval
    # failed (that path never blocks fix generation, so this is just
    # reporting what happened, not a success/failure signal).
    similarPastFixes: List[SimilarPastFix] = []
    # None when the sandbox had nothing to say for this file's language, or
    # SANDBOX_EXECUTION_ENABLED=false — see _sandbox_verify_fix.
    sandboxExecution: Optional[dict] = None


# ──────────────────────── Blob helpers ────────────────────────

async def _upload_report_to_blob(scan_id: str, report: dict) -> Optional[str]:
    """Upload scan report JSON to Azure Blob Storage. Returns blob URL or None."""
    client = get_container_client()
    if client is None:
        logger.warning("azure_blob_not_configured_skipping_upload")
        return None
    try:
        blob_name = f"scans/{scan_id}/report.json"
        data = json.dumps(report, indent=2, default=str).encode("utf-8")
        blob_client = client.get_blob_client(blob_name)
        await blob_client.upload_blob(data, overwrite=True, content_settings=None)
        # Return the blob URL (no SAS — private container; main-service can generate SAS if needed)
        url = blob_client.url
        logger.info("scan_report_uploaded_to_blob", scan_id=scan_id, blob_name=blob_name)
        return url
    except Exception as exc:
        logger.warning("blob_upload_failed", scan_id=scan_id, error=str(exc))
        return None


async def _save_scan_metadata(meta: dict) -> None:
    """Persist scan metadata to MongoDB scan_history collection, then
    best-effort index its findings into Elasticsearch for the search bar AND
    into the RAG memory store (app/core/memory_store.py) for semantic
    retrieval at fix-generation time. Mongo scan_history stays the source of
    truth — an ES or memory-indexing failure here never fails the scan."""
    try:
        db = get_db()
        await db.scan_history.insert_one(meta)
    except Exception as exc:
        logger.warning("mongo_save_scan_metadata_failed", error=str(exc))
        return
    try:
        await es_client.index_scan_findings(meta)
    except Exception as exc:
        logger.warning("es_index_scan_findings_failed", scan_id=meta.get("scanId"), error=str(exc))

    owner_id = meta.get("ownerId")
    scan_id = meta.get("scanId")
    repo = meta.get("repo")
    if owner_id and scan_id:
        findings = meta.get("findings", []) or []
        # memory_store.index_finding is itself best-effort/never-raises, so
        # gather (not gather with a task group we'd need to guard) is safe —
        # fan these out concurrently rather than one at a time, since a repo
        # scan can carry hundreds of findings.
        await asyncio.gather(*(memory_store.index_finding(owner_id, scan_id, repo, f) for f in findings))


# ──────────────────────── GitHub read helpers (full-repo collection) ────────────────────────

# File extensions considered worth scanning for vulnerabilities.
_SCANNABLE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb",
    ".php", ".cs", ".cpp", ".c", ".h", ".rs", ".sh", ".yaml", ".yml", ".env", ".vue", ".html",
}
# Deterministic scanning is regex-based (no token cost), so this cap is purely a
# safety ceiling against pathological monorepos, not a cost control — it covers
# a full "normal" repo. Concurrency below keeps wall-clock time reasonable.
_MAX_FILES = 300
_MAX_FILE_BYTES = 40_000   # per-file cap for the full content used by the deterministic scanner
_FETCH_CONCURRENCY = 8


async def _fetch_github_file_tree(owner: str, repo: str, branch: str, token: Optional[str]) -> list[dict]:
    """Return a flat list of {path, url} for all blobs in the repo tree."""
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    resp = await github_http.get_client().get(url, headers=headers, timeout=20)
    if resp.status_code != 200:
        logger.warning("github_tree_fetch_failed", status=resp.status_code, detail=resp.text[:200])
        return []
    data = resp.json()
    return [item for item in data.get("tree", []) if item.get("type") == "blob"]


async def _fetch_file_content(raw_url: str, token: Optional[str]) -> str:
    """Download a single file's raw content from GitHub."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = await github_http.get_client().get(raw_url, headers=headers, timeout=15)
    if resp.status_code != 200:
        return ""
    text = resp.text
    return text[:_MAX_FILE_BYTES] + ("\n... [truncated]" if len(text) > _MAX_FILE_BYTES else "")


async def _collect_repo_files(owner: str, repo: str, branch: str, token: Optional[str]) -> tuple[list[dict], int]:
    """
    Walk the full repo tree and download every scannable source file
    (bounded only by _MAX_FILES as a safety ceiling), fetched concurrently.
    Returns (files, total_scannable_count) — the second value reflects the
    repo's real size BEFORE the _MAX_FILES cap, so callers can size-tier the
    AI supplemental pass off the true repo size rather than the capped count.
    """
    tree = await _fetch_github_file_tree(owner, repo, branch, token)

    scannable_all = [
        item for item in tree
        if any(item["path"].endswith(ext) for ext in _SCANNABLE_EXTENSIONS)
           and not any(skip in item["path"] for skip in ("node_modules/", ".venv/", "vendor/", "dist/", "build/", "__pycache__/", ".next/"))
    ]
    total_scannable = len(scannable_all)
    scannable = scannable_all[:_MAX_FILES]

    if not scannable:
        return [], total_scannable

    sem = asyncio.Semaphore(_FETCH_CONCURRENCY)

    async def fetch_one(item: dict) -> Optional[dict]:
        async with sem:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{item['path']}"
            content = await _fetch_file_content(raw_url, token)
            return {"path": item["path"], "content": content} if content else None

    results = await asyncio.gather(*(fetch_one(item) for item in scannable))
    return [r for r in results if r], total_scannable


async def _fetch_specific_files(owner: str, repo: str, branch: str, paths: list[str], token: Optional[str]) -> list[dict]:
    """Like _collect_repo_files, but for a known list of paths instead of
    walking the whole tree — used for incremental (webhook-triggered)
    rescans, where main-service already knows exactly which files a push
    touched. A path for a file that was deleted or renamed away in the push
    will simply 404 and be dropped, which is also the desired effect: any
    findings previously reported against it fall out of both the "carried
    forward" set (excluded because it's in the changed-files set) and this
    fetch (because it no longer exists), so they don't reappear."""
    scannable_paths = [p for p in paths if any(p.endswith(ext) for ext in _SCANNABLE_EXTENSIONS)]
    if not scannable_paths:
        return []

    sem = asyncio.Semaphore(_FETCH_CONCURRENCY)

    async def fetch_one(path: str) -> Optional[dict]:
        async with sem:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
            content = await _fetch_file_content(raw_url, token)
            return {"path": path, "content": content} if content else None

    results = await asyncio.gather(*(fetch_one(p) for p in scannable_paths))
    return [r for r in results if r]


# ──────────────────────── GitHub write helpers (fix branch + commit) ────────────────────────

def _gh_headers(token: Optional[str]) -> dict:
    headers = {"Accept": "application/vnd.github+json", "user-agent": "patchlinex-scanner"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def _get_branch_head_sha(owner: str, repo: str, branch: str, token: Optional[str]) -> str:
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{branch}"
    resp = await github_http.get_client().get(url, headers=_gh_headers(token), timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Could not resolve base branch '{branch}': {resp.text[:200]}")
    return resp.json()["object"]["sha"]


async def _create_branch(owner: str, repo: str, new_branch: str, from_sha: str, token: Optional[str]) -> None:
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs"
    body = {"ref": f"refs/heads/{new_branch}", "sha": from_sha}
    resp = await github_http.get_client().post(url, headers=_gh_headers(token), json=body, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Could not create fix branch '{new_branch}': {resp.text[:200]}")


async def _get_file_with_sha(owner: str, repo: str, path: str, ref: str, token: Optional[str]) -> tuple[str, str]:
    """Returns (decoded_content, blob_sha) for a file on a given ref."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    resp = await github_http.get_client().get(url, headers=_gh_headers(token), params={"ref": ref}, timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Could not read '{path}' from '{ref}': {resp.text[:200]}")
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
    return content, data["sha"]


async def _commit_file_update(
    owner: str, repo: str, path: str, new_content: str, blob_sha: str, branch: str, message: str, token: Optional[str]
) -> None:
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    body = {
        "message": message,
        "content": base64.b64encode(new_content.encode("utf-8")).decode("ascii"),
        "sha": blob_sha,
        "branch": branch,
    }
    resp = await github_http.get_client().put(url, headers=_gh_headers(token), json=body, timeout=20)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Could not commit fix to '{path}': {resp.text[:200]}")


# ──────────────────────── AI fix generation + verification ────────────────────────

_FIX_SYSTEM_PROMPT = """\
You are a senior software engineer fixing a single, specific security vulnerability.
You will be given the full content of one file and a description of the vulnerability.
Return ONLY a valid JSON object with exactly these fields:
  fixedFileContent – the COMPLETE corrected file content (not a diff), preserving
                      everything unrelated to the vulnerability exactly as-is
  summary           – one sentence describing the fix, e.g. "Parameterized SQL query
                      to prevent injection"
Output ONLY the raw JSON object, no markdown fences, no prose."""

_VERIFY_SYSTEM_PROMPT = """\
You are a security reviewer double-checking a patch. You'll receive the original
vulnerability description and the fixed file content. Decide whether the specific
vulnerability described has been resolved in the fixed file.
Return ONLY a valid JSON object with exactly these fields:
  resolved – boolean
  notes    – one sentence explanation of your decision
Output ONLY the raw JSON object, no markdown fences, no prose."""


async def _generate_fix(finding: dict, original_content: str, repo_full: str, owner_id: Optional[str] = None) -> dict:
    settings = get_settings()
    provider = get_provider()
    model = _fix_model(settings)

    user_prompt = (
        f"Repository: {repo_full}\n"
        f"File: {finding.get('file')}\n"
        f"Vulnerability: {finding.get('title')}\n"
        f"Severity: {finding.get('severity')}\n"
        f"Description: {finding.get('description')}\n"
        f"Suggested fix: {finding.get('suggestedFix') or '(none provided)'}\n\n"
        f"### CURRENT FILE CONTENT\n```\n{original_content}\n```"
    )

    # ── RAG "Remember" step: pull semantically similar past findings this
    # same owner has already had verified fixes for, and splice them into
    # the prompt as prior art. Never blocks or fails fix generation —
    # memory_store.retrieve_similar returns [] on any error or when disabled.
    similar: list[dict] = []
    if owner_id:
        similar = await memory_store.retrieve_similar(owner_id, finding, top_k=3)
    else:
        logger.warning(
            "rag_retrieve_skipped_no_owner_id",
            finding_id=finding.get("id"),
            note="owner_id was not passed to _generate_fix — RAG retrieval skipped",
        )

    logger.info(
        "rag_retrieval_result",
        finding_id=finding.get("id"),
        owner_id=owner_id,
        retrieved=len(similar),
        sources=[item.get("source") for item in similar],
    )

    if similar:
        lines = []
        for item in similar:
            is_ver = bool(item.get("verified", False))
            source = item.get("source", "owner")
            # Distinguish community prior art from this owner's own fix history
            if source == "community":
                provenance = "[COMMUNITY PRIOR ART]"
            elif is_ver:
                provenance = "[VERIFIED SUCCESSFUL PATCH]"
            else:
                provenance = "[FAILED / UNVERIFIED ATTEMPT - AVOID REPEATING THIS STRATEGY]"
            pct = item.get("similarity", 0) * 100
            lines.append(
                f"- {provenance} ({pct:.1f}% vector match)\n"
                f"  Finding: \"{item.get('title')}\" in {item.get('file')}\n"
                f"  Strategy: {item.get('fixSummary')}"
            )
        user_prompt += (
            "\n\n### SIMILAR PAST FIXES & PRIOR ART (retrieved from Chroma vector memory)\n"
            "CRITICAL DIRECTIVES FOR PRIOR ART:\n"
            "1. For items labeled [VERIFIED SUCCESSFUL PATCH]: Adapt and build upon their proven fix pattern.\n"
            "2. For items labeled [COMMUNITY PRIOR ART]: Use as general reference — adapt to this codebase.\n"
            "3. For items labeled [FAILED / UNVERIFIED ATTEMPT - AVOID REPEATING THIS STRATEGY]: DO NOT repeat or reuse those failed patch strategies.\n\n"
            + "\n\n".join(lines)
        )


    messages = [
        {"role": "system", "content": _FIX_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        result = await provider.chat(messages, model=model)
    except Exception as exc:
        logger.error("ai_fix_provider_call_failed", repo=repo_full, model=model, error=str(exc))
        raise HTTPException(status_code=502, detail=f"AI provider error generating fix: {exc}")

    try:
        parsed = _parse_json_object(result.get("content") or "")
        fixed_content = parsed["fixedFileContent"]
        summary = parsed.get("summary", "Applied AI-generated remediation")
    except Exception as exc:
        logger.error("ai_fix_json_parse_failed", repo=repo_full, error=str(exc), raw=(result.get("content") or "")[:500])
        raise HTTPException(status_code=502, detail="AI fix response was not valid JSON")

    return {"fixedContent": fixed_content, "summary": summary, "model": model, "similarPastFixes": similar}


async def _ai_verify_fix(finding: dict, fixed_content: str, repo_full: str) -> dict:
    """AI opinion pass — kept as a SECONDARY signal (see _rescan_verify_fix
    for the authoritative one). Useful on its own for AI-sourced findings
    (business-logic/design issues) that the deterministic scanner never
    flagged in the first place and so can't be independently re-scanned."""
    settings = get_settings()
    provider = get_provider()
    # Local name kept distinct from the app.services.severity module (used
    # elsewhere in this file) — this is just reading an already-normalized
    # value off a persisted finding for the prompt, not normalizing anything.
    severity_label = finding.get("severity", "MEDIUM")
    model = _verify_model(settings)

    user_prompt = (
        f"Vulnerability: {finding.get('title')}\n"
        f"Severity: {severity_label}\n"
        f"Description: {finding.get('description')}\n\n"
        f"### FIXED FILE CONTENT ({finding.get('file')})\n```\n{fixed_content}\n```"
    )
    messages = [
        {"role": "system", "content": _VERIFY_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        result = await provider.chat(messages, model=model)
        parsed = _parse_json_object(result.get("content") or "")
        resolved = bool(parsed.get("resolved"))
        notes = parsed.get("notes", "")
    except Exception as exc:
        logger.warning("ai_verify_failed_treating_unverified", repo=repo_full, model=model, error=str(exc))
        resolved, notes = False, f"Verification pass failed to complete: {exc}"

    return {"resolved": resolved, "notes": notes, "model": model}


def _rescan_verify_fix(finding: dict, fixed_content: str) -> Optional[dict]:
    """The PRIMARY, independent verification step: re-run the same
    deterministic scanner rule that originally flagged this finding against
    the post-fix file content. Returns None when the finding has no
    `ruleKey` (i.e. it came from the AI supplemental pass, not the pattern
    scanner) — there is no rule to independently re-check in that case, and
    the caller falls back to the AI opinion pass alone.

    This directly replaces "ask the AI whether its own patch worked" with
    "run the free, deterministic, non-LLM detector again and see if it still
    fires" — the same rescan-based verification the product spec calls for.
    """
    rule_key = finding.get("ruleKey")
    if not rule_key:
        return None
    file_path = finding.get("file", "")
    post_fix_findings = scan_file(file_path, fixed_content)
    still_present = [f for f in post_fix_findings if f["ruleKey"] == rule_key]
    return {
        "resolved": len(still_present) == 0,
        "remainingMatches": len(still_present),
        "matchedLines": [f["line"] for f in still_present],
    }


async def _sandbox_verify_fix(finding: dict, fixed_content: str) -> Optional[dict]:
    """THIRD, independent verification signal: actually compile/execute the
    patched file in the isolated sandbox (app/services/sandbox/) rather than
    just re-running a pattern rule or asking an LLM's opinion. Purely
    additive — returns None (not an exception) whenever the sandbox has
    nothing useful to say for this file, exactly like _rescan_verify_fix
    returns None for AI-sourced findings with no ruleKey. Never blocks or
    fails the fix: a sandbox timeout, missing toolchain, or crash just means
    this signal is absent, not that the fix failed.
    """
    settings = get_settings()
    if not settings.sandbox_execution_enabled:
        return None

    try:
        result = await execute_patch(
            file_path=finding.get("file", ""),
            fixed_content=fixed_content,
            limits=SandboxLimits(
                cpu_seconds=settings.sandbox_cpu_seconds,
                memory_mb=settings.sandbox_memory_mb,
                wall_clock_timeout_seconds=settings.sandbox_timeout_seconds,
            ),
        )
    except Exception as exc:  # pragma: no cover - infra failure, not a verification verdict
        logger.warning("sandbox_verify_fix_failed", finding_id=finding.get("id"), error=str(exc))
        return None

    if result.status == "error" or not result.phases:
        # Unsupported language / toolchain not present in this image / infra
        # error — nothing to add to the verdict, same as "no rule to
        # re-check" for the deterministic rescan.
        return None

    return {
        "resolved": result.passed,
        "executionId": result.execution_id,
        "language": result.language,
        "phases": [p.name for p in result.phases],
        "failedPhase": next((p.name for p in result.phases if not p.passed and not p.skipped), None),
        "stderr": result.stderr[:2000],
        "security": {
            "networkBlocked": result.network_blocked,
            "nonRoot": result.non_root,
            "resourceLimitsApplied": result.resource_limits_applied,
        },
    }


# ──────────────────────── AI: explain deterministic findings ────────────────────────
# Runs once per deterministic finding, on the cheap "scan" tier — small
# per-finding context (a few lines), not the whole file. Purely additive:
# on any failure we keep the deterministic rule's generic description/fix
# rather than dropping or blocking the finding.

_EXPLAIN_SYSTEM_PROMPT = """\
You are a security engineer writing a short, specific explanation for a single
vulnerability finding that was already detected by a pattern-based scanner.
You will be given the finding's category/title, which detector engine(s)
independently flagged it, a short code snippet, and — when available — the
specific AST node Tree-sitter resolved at that line, as structural evidence.
Return ONLY a valid JSON object with exactly these fields:
  description   – 1-3 sentences explaining the impact in THIS specific code context
  suggestedFix  – concrete, specific remediation advice for this occurrence
Output ONLY the raw JSON object, no markdown fences, no prose."""

_ENGINE_LABELS = {
    "semgrep": "Semgrep security rule matched",
    "regex": "Regex pattern matched",
    "treesitter": "Tree-sitter AST structural analysis matched",
}


def _strip_code_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3].rstrip()
    return raw


def _parse_json_object(raw: str) -> dict:
    return json.loads(_strip_code_fences(raw))


async def _enrich_deterministic_findings(
    raw_findings: list[dict], repo_full: str, files: Optional[list[dict]] = None,
) -> list[Finding]:
    """Attach an AI-written explanation/fix to each deterministic finding.
    These stay source="deterministic" — AI is only explaining a finding the
    pattern scanner already made, not the one deciding whether it's real."""
    if not raw_findings:
        return []

    settings = get_settings()
    provider = get_provider()
    model = _scan_model(settings)
    sem = asyncio.Semaphore(6)

    # file path -> content, so a finding backed by multiple engines can also
    # be given the specific AST node Tree-sitter resolved at its line (see
    # treesitter_engine.structural_context) as extra evidence for the model,
    # not just the raw snippet.
    content_by_path = {f["path"]: f.get("content", "") for f in (files or []) if f.get("path")}

    async def enrich_one(rf: dict) -> Finding:
        async with sem:
            # _dedupe (deterministic_scanner.py) always sets this for anything
            # that went through scan_repo_files/scan_file; the engine-name
            # fallback only covers a raw finding constructed some other way.
            evidence = rf.get("evidence") or ([rf["engine"]] if rf.get("engine") else [])
            detections = "\n".join(f"- {_ENGINE_LABELS.get(e, e)}" for e in evidence) or "- Pattern scanner match"

            ast_context = None
            content = content_by_path.get(rf["file"])
            if content:
                ast_context = treesitter_engine.structural_context(rf["file"], content, rf["line"])

            prompt_parts = [
                f"Repository: {repo_full}",
                f"File: {rf['file']}:{rf['line']}",
                f"Category: {rf['category']}",
                f"Pattern matched: {rf['title']}",
                f"Detections:\n{detections}",
            ]
            if ast_context:
                prompt_parts.append(f"Relevant AST node at this line: {ast_context}")
            prompt_parts.append(f"Code context:\n```\n{rf.get('snippet', '')}\n```")
            user_prompt = "\n".join(prompt_parts)

            description, suggested_fix = rf["description"], rf["suggestedFix"]
            try:
                result = await provider.chat(
                    [
                        {"role": "system", "content": _EXPLAIN_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    model=model,
                )
                parsed = _parse_json_object(result.get("content") or "")
                description = parsed.get("description") or description
                suggested_fix = parsed.get("suggestedFix") or suggested_fix
            except Exception as exc:
                # Deterministic finding stands on its own generic text — this is
                # an enrichment failure, not a scan failure.
                logger.warning("ai_explain_failed_using_generic_text", finding_id=rf.get("id"), error=str(exc))

            return Finding(
                id=rf["id"],
                title=rf["title"],
                severity=rf["severity"],
                file=rf["file"],
                line=rf["line"],
                description=description,
                suggestedFix=suggested_fix,
                source="deterministic",
                ruleKey=rf.get("ruleKey"),
                category=rf.get("category"),
                evidence=evidence or None,
            )

    return list(await asyncio.gather(*(enrich_one(rf) for rf in raw_findings)))


# ──────────────────────── AI: supplemental full-repo scan ────────────────────────
# The deterministic layer is the primary/authoritative source. This pass finds
# EXTRA issues the regex rules can't (business logic, auth/authz, insecure
# design) and is always additive — it never removes or overrides a
# deterministic finding. Runs on the cheap "scan" tier, batched across the
# full repo so cost stays bounded even though coverage is complete.

_AI_SUPPLEMENTAL_SYSTEM_PROMPT = """\
You are a senior application-security engineer doing a supplementary code review.
A pattern-based scanner has ALREADY checked these files for: SQL injection, XSS,
hardcoded secrets, weak cryptography, and command injection via known patterns.
Do NOT re-report those same category/pattern issues. Instead, look for problems a
regex scanner would miss: authentication/authorization flaws, insecure direct
object references, business-logic bugs with security impact, race conditions,
SSRF, path traversal, insecure deserialization, missing input validation, and
similar design-level issues.
Only report SSRF when the code actually makes an outbound request (e.g. fetch/
requests.get/axios/http.request) using an attacker-influenceable URL or host.
Command injection / shell execution issues (os.system, subprocess, exec,
child_process) are not SSRF even when the command's input is external — those
already fall under the pattern-based scanner's command-injection category, so
skip them here too.
Return ONLY a valid JSON array of findings. Each element must have exactly:
  title        – short human-readable title
  severity     – one of "CRITICAL", "HIGH", "MEDIUM", "LOW" — how bad it is
                 if real and exploited
  category     – one short label for the kind of issue, e.g. "Authentication",
                 "Authorization", "IDOR", "SSRF", "Path Traversal",
                 "Insecure Deserialization", "Race Condition",
                 "Input Validation", "Business Logic", or "Other" if none fit
  confidence   – one of "high", "medium", "low" — YOUR confidence that this is
                 a real, exploitable issue and not a stylistic nit or a false
                 read of the code. Use "low" liberally when you're guessing at
                 intent rather than certain of a concrete exploit path — a
                 human reviews every finding before anything is fixed, so
                 under-confident is far cheaper than overconfident here.
  file         – relative file path where the issue exists
  line         – integer line number (best estimate; may be wrong, see codeSnippet)
  codeSnippet  – the exact, verbatim source line the issue is on, copied
                 character-for-character from the file content you were given
                 (used to relocate the correct line number — do not paraphrase
                 or reformat it)
  description  – clear explanation of the vulnerability and its impact
  suggestedFix – concrete remediation advice
Return an empty array [] if you find nothing beyond what's already covered.
Output ONLY the raw JSON array, no markdown fences, no prose."""


def _locate_line(file_content: str, code_snippet: Optional[str], fallback_line: int) -> int:
    """Resolve a finding's true line number from an exact source snippet the
    model was asked to copy verbatim, rather than trusting its own line-number
    guess — an integer estimated from a prompt containing several concatenated
    files is inherently unreliable. Falls back to the model's guess only if
    the snippet is missing or can't be found in the file (e.g. the model
    paraphrased it instead of copying it)."""
    if not code_snippet or not file_content:
        return fallback_line
    snippet = code_snippet.strip()
    if not snippet:
        return fallback_line
    for i, line in enumerate(file_content.split("\n"), start=1):
        if snippet in line or line.strip() == snippet:
            return i
    return fallback_line

_AI_BATCH_MAX_CHARS = 6000       # keeps each batch call cheap on the mini tier
_AI_PER_FILE_CONTEXT_CHARS = 4000  # per-file slice included in a batch prompt


def _chunk_files_for_ai(files: list[dict]) -> list[list[dict]]:
    """Group files into token-bounded batches so the supplemental pass can
    cover the whole repo as a series of cheap calls instead of one giant one."""
    batches: list[list[dict]] = []
    current: list[dict] = []
    current_len = 0
    for f in files:
        flen = min(len(f.get("content", "")), _AI_PER_FILE_CONTEXT_CHARS)
        if current and current_len + flen > _AI_BATCH_MAX_CHARS:
            batches.append(current)
            current, current_len = [], 0
        current.append(f)
        current_len += flen
    if current:
        batches.append(current)
    return batches


def _select_batches(batches: list[list[dict]], max_batches: Optional[int]) -> list[list[dict]]:
    """When capping batch count (tier 2), sample evenly across the repo
    rather than just taking the first N so coverage isn't skewed toward
    whatever GitHub's tree API happened to list first."""
    if max_batches is None or len(batches) <= max_batches:
        return batches
    step = len(batches) / max_batches
    indices = sorted({int(i * step) for i in range(max_batches)})
    return [batches[i] for i in indices]


_AI_BATCH_CONCURRENCY = 4  # parallel AI-provider calls in-flight at once, mirrors
# _FETCH_CONCURRENCY's pattern above — bounded so a large repo's batches don't
# all fire at once and trip the AI provider's own rate limits.


# The supplemental prompt already tells the model not to re-report a
# category the deterministic layer covers (see _AI_SUPPLEMENTAL_SYSTEM_PROMPT),
# but that's a request, not a guarantee — models sometimes echo the same
# SQLi/XSS/secret/crypto/command-injection issue anyway. This is a second,
# code-level backstop.
#
# Two matching strategies, in order of confidence:
#   1. Exact (file, line) + a keyword from the finding's own category. Cheap,
#      precise, no false positives — kept as the fast path for the common
#      case where the model's line number and category line up exactly with
#      what the deterministic layer already reported.
#   2. A line-window + normalized-title-overlap fallback for everything that
#      misses #1: an off-by-one line (the model's own line guess before
#      _locate_line resolves it, or a genuinely adjacent line), or a
#      deterministic category outside the five hardcoded keyword sets above
#      (any of the 78 semgrep-rules/patchlinex-rules.yml categories, or a
#      treesitter-only category). This trades a little precision for a lot
#      less brittleness than an exact-line-and-five-categories check.
# Deliberately NOT a same-line-only check in either case — an AI finding
# sharing a line/window with a deterministic one but describing a genuinely
# different concern (e.g. an IDOR finding near a SQLi finding) has low title
# overlap and low keyword overlap, so it survives both checks and is kept.
_COVERED_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "SQL Injection": ("sql injection", "sqli"),
    "Cross-Site Scripting (XSS)": ("xss", "cross-site scripting", "cross site scripting"),
    "Command Injection": ("command injection", "shell injection"),
    "Hardcoded Secrets": ("hardcoded", "secret", "api key", "access key", "private key", "slack token"),
    "Weak Cryptography": ("weak crypto", "3des", " des ", "weak random", "insecure random"),
}

_LINE_WINDOW = 2  # +/- lines treated as "the same spot" for the fallback match
_TITLE_OVERLAP_THRESHOLD = 0.5  # Jaccard similarity on normalized title tokens

_STOPWORDS = frozenset({
    "a", "an", "the", "in", "on", "of", "to", "for", "and", "or", "is", "are",
    "via", "with", "this", "that", "issue", "vulnerability", "found", "detected",
})


def _title_tokens(text: str) -> set[str]:
    """Lowercased, punctuation-stripped, stopword-filtered word set — good
    enough for a rough "are these titles about the same thing" signal without
    pulling in an embedding model for what's meant to be a cheap backstop."""
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _title_similarity(a: str, b: str) -> float:
    """Jaccard similarity on token sets. 0.0 if either title has no
    meaningful tokens (avoids a division-by-zero false match on empty/junk titles)."""
    ta, tb = _title_tokens(a), _title_tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _duplicates_deterministic_finding(item: dict, det_by_file: dict[str, list[dict]]) -> bool:
    candidates = det_by_file.get(item.get("file"))
    if not candidates:
        return False
    item_line = item.get("line")
    item_title = item.get("title", "")
    haystack = f"{item_title} {item.get('description', '')}".lower()
    for det in candidates:
        same_line = det["line"] == item_line
        near_line = isinstance(item_line, int) and abs(det["line"] - item_line) <= _LINE_WINDOW
        if same_line:
            keywords = _COVERED_CATEGORY_KEYWORDS.get(det["category"])
            if keywords and any(kw in haystack for kw in keywords):
                return True
        if near_line and _title_similarity(item_title, det["title"]) >= _TITLE_OVERLAP_THRESHOLD:
            return True
    return False


def _dedupe_ai_findings(items: list[dict]) -> list[dict]:
    """Drop AI findings that duplicate an EARLIER AI finding (no equivalent
    of this existed before — only AI-vs-deterministic was checked). Two
    batches can independently flag the same underlying issue if it's visible
    from more than one file in the prompt context, or the model can simply
    repeat itself across batches. Same line-window + title-overlap heuristic
    as the deterministic-duplicate check above; first occurrence wins so
    finding IDs stay stable for a given input ordering."""
    kept: list[dict] = []
    for item in items:
        item_line = item.get("line")
        item_file = item.get("file")
        item_title = item.get("title", "")
        is_dup = False
        for prior in kept:
            if prior.get("file") != item_file:
                continue
            prior_line = prior.get("line")
            near_line = (
                isinstance(item_line, int) and isinstance(prior_line, int)
                and abs(prior_line - item_line) <= _LINE_WINDOW
            )
            if near_line and _title_similarity(item_title, prior.get("title", "")) >= _TITLE_OVERLAP_THRESHOLD:
                is_dup = True
                break
        if is_dup:
            logger.info(
                "ai_supplemental_finding_dropped_ai_duplicate",
                file=item_file, line=item_line, title=item_title[:80],
            )
        else:
            kept.append(item)
    return kept


async def _ai_supplemental_scan(
    files: list[dict], repo_full: str,
    deterministic_findings: Optional[list[Finding]] = None,
    max_batches: Optional[int] = None,
) -> list[Finding]:
    if not files:
        return []

    det_by_file: dict[str, list[dict]] = {}
    for f in deterministic_findings or []:
        if f.category:
            det_by_file.setdefault(f.file, []).append(
                {"line": f.line, "category": f.category, "title": f.title}
            )

    settings = get_settings()
    provider = get_provider()
    model = _scan_model(settings)
    all_batches = _chunk_files_for_ai(files)
    batches = _select_batches(all_batches, max_batches)

    # Each batch is an independent AI call — previously run one at a time,
    # so a repo with N batches took N sequential round-trips (often the
    # single slowest part of a scan). Running them concurrently (capped, so
    # we don't slam the provider's rate limits) turns that into
    # roughly ceil(N / _AI_BATCH_CONCURRENCY) round-trips instead.
    sem = asyncio.Semaphore(_AI_BATCH_CONCURRENCY)

    async def run_batch(batch: list[dict]) -> tuple[list[dict], dict[str, str]]:
        code_context = "\n\n".join(
            f"### FILE: {f['path']}\n```\n{f['content'][:_AI_PER_FILE_CONTEXT_CHARS]}\n```" for f in batch
        )
        batch_content_by_path = {f["path"]: f.get("content", "") for f in batch}
        messages = [
            {"role": "system", "content": _AI_SUPPLEMENTAL_SYSTEM_PROMPT},
            {"role": "user", "content": f"Repository: {repo_full}\n\n{code_context}"},
        ]
        async with sem:
            try:
                result = await provider.chat(messages, model=model)
            except Exception as exc:
                logger.warning("ai_supplemental_batch_failed", repo=repo_full, model=model, error=str(exc))
                return [], batch_content_by_path

        raw = (result.get("content") or "").strip()
        try:
            items = json.loads(_strip_code_fences(raw)) or []
        except json.JSONDecodeError as exc:
            logger.warning("ai_supplemental_json_parse_failed", repo=repo_full, error=str(exc), raw=raw[:300])
            return [], batch_content_by_path
        return items, batch_content_by_path

    # Batches are gathered concurrently but the *order* of the results list
    # matches `batches` regardless of which finished first (asyncio.gather
    # preserves input order), so finding IDs (AI-001, AI-002, ...) stay
    # deterministic across runs of the same repo, same as the old sequential
    # loop — concurrency changes latency, not the output ordering.
    batch_results = await asyncio.gather(*(run_batch(batch) for batch in batches))

    # Pass 1: resolve each raw item's true line number and drop anything that
    # duplicates a deterministic finding. Deliberately NOT building Finding
    # objects yet — the intra-AI dedup pass below needs to compare across
    # every batch's output before IDs are assigned, so a dropped duplicate
    # never consumes an AI-### number.
    resolved_items: list[dict] = []
    for items, batch_content_by_path in batch_results:
        for item in items:
            try:
                item_file = item.get("file", "unknown")
                guessed_line = int(item.get("line") or 0)
                resolved_line = _locate_line(
                    batch_content_by_path.get(item_file, ""),
                    item.get("codeSnippet") or item.get("code_snippet"),
                    guessed_line,
                )
                resolved_item = {**item, "file": item_file, "line": resolved_line}
                if _duplicates_deterministic_finding(resolved_item, det_by_file):
                    logger.info(
                        "ai_supplemental_finding_dropped_duplicate",
                        repo=repo_full, file=item_file, line=resolved_line,
                        title=item.get("title", "")[:80],
                    )
                    continue
                resolved_items.append(resolved_item)
            except Exception as parse_exc:
                logger.warning("ai_supplemental_finding_parse_error", error=str(parse_exc))

    # Pass 2: dedup among the AI's own findings (batches can independently
    # flag the same underlying issue — see _dedupe_ai_findings' docstring).
    deduped_items = _dedupe_ai_findings(resolved_items)

    findings: list[Finding] = []
    for counter, item in enumerate(deduped_items, start=1):
        raw_confidence = str(item.get("confidence", "")).strip().lower()
        findings.append(Finding(
            id=f"AI-{counter:03d}",
            title=item.get("title", "Unknown"),
            # Routed through the same canonical whitelist the deterministic
            # engines use (app/services/severity.py) — previously this was a
            # bare `.upper()` with no whitelist, so a model could return a
            # 5th value (e.g. "INFO") or any arbitrary string, which the
            # frontend's per-severity summary badges then silently dropped
            # while its pie chart counted them, producing two different
            # totals for the same finding set on the same screen.
            severity=severity.normalize(item.get("severity")),
            file=item.get("file", "unknown"),
            line=item.get("line", 0),
            description=item.get("description", ""),
            suggestedFix=item.get("suggestedFix") or item.get("suggested_fix"),
            source="ai",
            # Previously never passed through, so every AI finding came back
            # with category: null regardless of what the model said —
            # harmless while nothing filtered/grouped by category, but it
            # also weakened _duplicates_deterministic_finding above
            # (deterministic-side matching keys off category).
            category=item.get("category") or "Other",
            confidence=raw_confidence if raw_confidence in ("high", "medium", "low") else "medium",
        ))

    logger.info(
        "ai_supplemental_scan_complete", repo=repo_full,
        batches_run=len(batches), batches_total=len(all_batches),
        raw_findings=sum(len(items) for items, _ in batch_results),
        after_deterministic_dedup=len(resolved_items), extra_findings=len(findings),
    )
    return findings


async def _attach_financial_impact(db, organization_id: str, findings: List[Finding], repo_full: str) -> Optional[dict]:
    """Prices every finding via the risk engine (app/services/risk/) and
    returns the portfolio-level roll-up. Mutates each Finding's
    `financialImpact` in place.

    This is the Scanner → Risk Engine connection that was previously
    missing entirely — the risk module was built and tested but never
    called by the scan pipeline. See app/services/risk/pipeline_integration.py
    for what this pricing does and does not account for (no real
    business-criticality engine yet, severity-approximated-as-CVSS, no KEV
    lookup).

    Pricing failures are isolated per-finding and never fail the scan
    itself — a bug in the risk layer should degrade to "this finding has no
    price yet", not take down vulnerability scanning, which is the actual
    security-critical path.
    """
    settings = get_settings()
    if not settings.risk_auto_compute_enabled:
        return None

    priced: list[dict] = []
    failures = 0
    for f in findings:
        try:
            f.financialImpact = await risk_pipeline.compute_finding_risk(db, organization_id, f.model_dump(), repo_full)
            priced.append(f.model_dump())
        except Exception:
            failures += 1
            logger.warning("risk_pricing_failed", finding_id=f.id, repo=repo_full)

    if failures:
        logger.warning(
            "risk_pricing_partial_failure", repo=repo_full,
            failed=failures, total=len(findings),
        )

    return risk_pipeline.aggregate_portfolio_risk(priced)


# ──────────────────────── Endpoints ────────────────────────

@router.post("/scan", response_model=ScanResponse)
async def run_scan(payload: ScanRequest, user: CurrentUser = Depends(require_auth_optional)):
    """
    Two modes:

    FULL (payload.changedFiles not set — manual "Scan Now", or a repo with no
    prior scan):
      1. Fetch the FULL scannable file set from the target GitHub repository
      2. Run the deterministic pattern-based scanner (primary finding source, always full — free)
      3. Ask AI to explain/enrich each deterministic finding (still "deterministic")
      4. Run the AI supplemental scan, tiered by repo size (see _scan_tier_for):
           <= 100 files   -> full coverage, every batch
           101-300 files  -> batched, capped batch count
           > 300 files    -> skipped entirely, deterministic findings only

    INCREMENTAL (payload.changedFiles set — a webhook-triggered rescan, and a
    previous scan of this repo/branch exists):
      1. Fetch ONLY the pushed files
      2. Carry forward findings from every OTHER file in the previous scan unchanged
      3. Re-scan the pushed files (deterministic + AI, same as above) and
         compute resolvedCount = findings that were present in the previous
         scan for these files but no longer reproduce

    Both modes then:
      5. Upload vulnerability report JSON to Azure Blob Storage
      6. Persist scan metadata to MongoDB (scan_history collection)
      7. Return findings to caller — deterministic findings first, AI-only findings after
    """
    scan_id = payload.scanId or f"scan-{uuid.uuid4().hex[:10]}"
    repo_full = f"{payload.repoOwner}/{payload.repoName}"
    now = datetime.datetime.utcnow().isoformat() + "Z"
    branch = payload.branch or "main"

    logger.info("scan_started", scan_id=scan_id, repo=repo_full, branch=branch, incremental=bool(payload.changedFiles))

    # Re-express this scan trigger as a TelemetryEvent through the common
    # ingestion contract (app/services/risk/ingestion.py) — this is the ONE
    # source that was already genuinely continuous (a real GitHub webhook,
    # not a simulator), now flowing through the same shape every other
    # source uses. `simulated=False` always. Never allowed to fail the scan.
    try:
        await risk_ingestion.as_github_telemetry_event(
            get_db(),
            user.org_id,
            repo_full,
            event_type="incremental_rescan" if payload.changedFiles else "full_scan_triggered",
            summary=f"GitHub webhook/manual trigger started scan {scan_id} on {branch}",
            payload={"scan_id": scan_id, "branch": branch},
        )
    except Exception:
        logger.warning("ingestion_event_failed", scan_id=scan_id, repo=repo_full)

    # An incremental request only makes sense if we actually have a previous
    # scan of this repo/branch to diff against and carry findings forward
    # from — otherwise silently fall back to a full scan.
    previous_doc = None
    if payload.changedFiles:
        try:
            db = get_db()
            previous_doc = await db.scan_history.find_one(
                {"repo": repo_full, "branch": branch}, sort=[("scannedAt", -1)]
            )
        except Exception as exc:
            logger.warning("mongo_previous_scan_lookup_failed", repo=repo_full, error=str(exc))
            previous_doc = None

    incremental = bool(payload.changedFiles) and previous_doc is not None
    changed_set = set(payload.changedFiles or [])
    carried_findings: List[Finding] = []
    previous_findings_for_changed_files: list[dict] = []

    if incremental:
        # ── Step 1 (incremental): fetch only the pushed files ──
        try:
            files = await _fetch_specific_files(payload.repoOwner, payload.repoName, branch, list(changed_set), payload.githubToken)
        except Exception as exc:
            logger.warning("github_fetch_failed", repo=repo_full, error=str(exc))
            files = []
        total_scannable = previous_doc.get("totalScannableFiles") or len(files)
        tier = "incremental"

        # ── Step 2 (incremental): carry forward everything untouched ──
        previous_findings = previous_doc.get("findings", []) or []
        for f in previous_findings:
            if f.get("file") in changed_set:
                previous_findings_for_changed_files.append(f)
            else:
                try:
                    carried_findings.append(Finding(**f))
                except Exception as exc:
                    logger.warning("carry_forward_finding_parse_error", scan_id=scan_id, error=str(exc))

        logger.info(
            "incremental_scan_files_collected",
            scan_id=scan_id, repo=repo_full, changed_file_count=len(changed_set),
            fetched_count=len(files), carried_forward=len(carried_findings),
        )
    else:
        # ── Step 1 (full): fetch the full scannable file set ──
        try:
            files, total_scannable = await _collect_repo_files(payload.repoOwner, payload.repoName, branch, payload.githubToken)
        except Exception as exc:
            logger.warning("github_fetch_failed", repo=repo_full, error=str(exc))
            files, total_scannable = [], 0
        tier = _scan_tier_for(total_scannable)

    logger.info("scan_files_collected", scan_id=scan_id, repo=repo_full, file_count=len(files), total_scannable=total_scannable, tier=tier)

    # ── Step 2: deterministic pattern-based scan (primary source) — runs
    # over the full file set in FULL mode, or just the pushed files in
    # INCREMENTAL mode ──
    raw_deterministic = scan_repo_files(files)
    logger.info("deterministic_scan_complete", scan_id=scan_id, repo=repo_full, count=len(raw_deterministic))

    # ── Step 3: AI explains/enriches each deterministic finding ──
    deterministic_findings = await _enrich_deterministic_findings(raw_deterministic, repo_full, files)

    # ── Step 4: AI supplemental scan ──
    ai_analysis_note: Optional[str] = None
    if incremental:
        ai_findings = await _ai_supplemental_scan(files, repo_full, deterministic_findings) if files else []
    elif tier == "full":
        ai_findings = await _ai_supplemental_scan(files, repo_full, deterministic_findings)
    elif tier == "batched":
        ai_findings = await _ai_supplemental_scan(
            files, repo_full, deterministic_findings, max_batches=_AI_SUPPLEMENTAL_MAX_BATCHES_TIER2,
        )
        ai_analysis_note = (
            f"Repository has {total_scannable} scannable files — AI supplemental analysis ran on a "
            f"representative sample (capped to {_AI_SUPPLEMENTAL_MAX_BATCHES_TIER2} batches) to control cost. "
            "Pattern-based findings below cover the full repository."
        )
    else:  # deterministic_only
        ai_findings = []
        ai_analysis_note = (
            f"AI analysis limited by repository size ({total_scannable} scannable files, over the "
            f"{_AI_SUPPLEMENTAL_MAX_THRESHOLD}-file threshold) — only the deterministic pattern scan ran. "
            "All findings below are from the deterministic scanner."
        )

    rescanned_findings = deterministic_findings + ai_findings

    # ── Step (incremental only): verify previous findings — a finding from
    # the previous scan, on one of the pushed files, that no longer shows up
    # in this rescan counts as resolved. Matched on (file, ruleKey, title)
    # since finding ids are freshly generated on every scan. ──
    resolved_count: Optional[int] = None
    if incremental:
        rescanned_keys = {(f.file, f.ruleKey, f.title) for f in rescanned_findings}
        resolved_count = sum(
            1
            for f in previous_findings_for_changed_files
            if (f.get("file"), f.get("ruleKey"), f.get("title")) not in rescanned_keys
        )
        ai_analysis_note = (
            f"Incremental scan of {len(changed_set)} changed file(s) from this push. "
            f"{len(carried_findings)} finding(s) carried forward from files that weren't touched, "
            f"{resolved_count} previously-reported finding(s) no longer reproduce."
        )
        logger.info(
            "incremental_scan_resolved", scan_id=scan_id, repo=repo_full,
            resolved_count=resolved_count, carried_forward=len(carried_findings),
        )

    findings = carried_findings + rescanned_findings
    logger.info(
        "scan_findings_total",
        scan_id=scan_id, repo=repo_full, tier=tier,
        deterministic=len(deterministic_findings), ai_extra=len(ai_findings),
        carried_forward=len(carried_findings), total=len(findings),
    )

    # Price every finding via the risk engine (EAL/VaR) and roll up a
    # portfolio-level summary. See _attach_financial_impact — mutates
    # `findings` in place, never fails the scan on a pricing error.
    risk_summary = await _attach_financial_impact(get_db(), user.org_id, findings, repo_full)

    # Build report payload for Blob Storage
    report_payload = {
        "scanId": scan_id,
        "repo": repo_full,
        "branch": branch,
        "scannedAt": now,
        "findingsCount": len(findings),
        "deterministicCount": len(deterministic_findings),
        "aiExtraCount": len(ai_findings),
        "carriedForwardCount": len(carried_findings),
        "resolvedCount": resolved_count,
        "scanTier": tier,
        "totalScannableFiles": total_scannable,
        "findings": [f.model_dump() for f in findings],
        "riskSummary": risk_summary,
    }

    # Upload to Azure Blob
    blob_uri = await _upload_report_to_blob(scan_id, report_payload)
    blob_name = f"scans/{scan_id}/report.json"

    # Save metadata to MongoDB
    await _save_scan_metadata({
        "scanId": scan_id,
        "ownerId": user.id,
        "organizationId": user.org_id,
        "repo": repo_full,
        "branch": branch,
        "scannedAt": now,
        "findingsCount": len(findings),
        "deterministicCount": len(deterministic_findings),
        "aiExtraCount": len(ai_findings),
        "carriedForwardCount": len(carried_findings),
        "resolvedCount": resolved_count,
        "scanTier": tier,
        "totalScannableFiles": total_scannable,
        "aiAnalysisNote": ai_analysis_note,
        "status": "COMPLETED_WAITING_APPROVAL",
        "blobUri": blob_uri,
        "blobName": blob_name,
        "findings": [f.model_dump() for f in findings],
        "riskSummary": risk_summary,
        "ragMemoryEnabled": memory_store.is_enabled(),
    })

    return ScanResponse(
        scanId=scan_id,
        status="COMPLETED_WAITING_APPROVAL",
        repo=repo_full,
        findingsCount=len(findings),
        findings=findings,
        riskSummary=risk_summary,
        blobUri=blob_uri,
        blobName=blob_name,
        scanTier=tier,
        aiAnalysisNote=ai_analysis_note,
        resolvedCount=resolved_count,
        ragMemoryEnabled=memory_store.is_enabled(),
    )


@router.post("/generate-and-verify-fix", response_model=FixResponse)
async def generate_and_verify_fix(payload: FixRequest, user: CurrentUser = Depends(require_auth)):
    """
    1. Look up the specific finding from the persisted scan (MongoDB scan_history)
    2. Fetch that file's current content + blob sha from GitHub
    3. Generate a corrected file with the code-tier model (codex-5.3)
    4. Create a fix branch and commit the corrected file to GitHub
    5. Verify the fix — frontier model (gpt-5.2) for CRITICAL/HIGH, cheap model otherwise
    6. Persist the fix outcome to scan_history and return it
    """
    db = get_db()
    scan_doc = await db.scan_history.find_one({"scanId": payload.scanId})
    if not scan_doc:
        raise HTTPException(status_code=404, detail="Scan record not found")
    if scan_doc.get("organizationId") and scan_doc["organizationId"] != user.org_id:
        raise HTTPException(status_code=403, detail="This scan does not belong to your organization")

    finding = next((f for f in scan_doc.get("findings", []) if f.get("id") == payload.findingId), None)
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{payload.findingId}' not found on scan '{payload.scanId}'")

    # Defense-in-depth state-machine check (see app/services/state_machine.py):
    # main-service's /approve-fix is the only place a human is supposed to be
    # able to move a finding out of AWAITING_APPROVAL, but this endpoint is
    # itself reachable directly — refuse to (re-)generate a fix for a finding
    # that's already verified, already in flight, or out of retry budget,
    # instead of trusting the caller unconditionally.
    try:
        from_status = state_machine.assert_transition(scan_doc, payload.findingId, "FIX_PROCESSING")
    except state_machine.InvalidTransitionError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"{exc} (code={exc.code})",
        ) from exc

    attempts = state_machine.attempts_so_far(scan_doc, payload.findingId) + 1
    await db.scan_history.update_one(
        {"scanId": payload.scanId},
        {"$set": {
            f"fixes.{payload.findingId}.status": "FIX_PROCESSING",
            f"fixes.{payload.findingId}.attempts": attempts,
            # Read by the reconciliation sweep (app/services/reconciliation.py)
            # to detect a finding that's been stuck here since a hard crash.
            f"fixes.{payload.findingId}.processingStartedAt": datetime.datetime.utcnow().isoformat() + "Z",
        }},
    )
    logger.info(
        "fix_state_transition", scan_id=payload.scanId, finding_id=payload.findingId,
        from_status=from_status, to_status="FIX_PROCESSING", attempt=attempts,
    )

    repo_full = f"{payload.repoOwner}/{payload.repoName}"
    file_path = finding["file"]
    fix_branch = f"fix/ai-vuln-{payload.findingId.lower()}-{uuid.uuid4().hex[:6]}"

    async def _mark_failed(error: str) -> None:
        try:
            await db.scan_history.update_one(
                {"scanId": payload.scanId},
                {"$set": {
                    f"fixes.{payload.findingId}.status": "FIX_FAILED",
                    f"fixes.{payload.findingId}.error": error,
                    f"fixes.{payload.findingId}.failedAt": datetime.datetime.utcnow().isoformat() + "Z",
                }},
            )
        except Exception as exc:  # pragma: no cover - best-effort bookkeeping
            logger.warning("mongo_mark_fix_failed_failed", scan_id=payload.scanId, finding_id=payload.findingId, error=str(exc))

    try:
        # ── Step 1: base branch sha + create fix branch ──
        base_sha = await _get_branch_head_sha(payload.repoOwner, payload.repoName, payload.branch, payload.githubToken)
        await _create_branch(payload.repoOwner, payload.repoName, fix_branch, base_sha, payload.githubToken)

        # ── Step 2: read current file content + sha ──
        original_content, blob_sha = await _get_file_with_sha(
            payload.repoOwner, payload.repoName, file_path, payload.branch, payload.githubToken
        )

        # ── Step 3: generate fix (codex-5.3), augmented with retrieved
        # similar past fixes for this account (RAG "Remember" step) ──
        fix = await _generate_fix(finding, original_content, repo_full, owner_id=scan_doc.get("ownerId"))

        # ── Step 4: commit fix to the branch ──
        await _commit_file_update(
            payload.repoOwner, payload.repoName, file_path, fix["fixedContent"], blob_sha, fix_branch,
            message=f"AI fix: {finding.get('title')} ({payload.findingId})",
            token=payload.githubToken,
        )
    except Exception as exc:
        # Job-level failure (GitHub API error, AI provider error, bad JSON,
        # ...). Record it so a stuck FIX_PROCESSING doesn't sit unexplained —
        # main-service's worker independently marks FIX_FAILED in Redis on
        # its own final retry attempt, but this keeps ai-storage-service's
        # own record (the audit trail persisted to Mongo) consistent too.
        logger.error("fix_generation_failed", scan_id=payload.scanId, finding_id=payload.findingId, error=str(exc))
        await _mark_failed(str(exc))
        raise

    # ── Step 5: verify — TWO independent signals, not one AI opinion ──
    #
    # 1. Deterministic rescan (PRIMARY / authoritative when available): re-run
    #    the exact same regex rule that originally flagged this finding
    #    against the post-fix content. This is the "repository is rescanned
    #    ... independent verification step" the product spec calls for — no
    #    LLM involved, so it can't be talked into agreeing with its own fix.
    # 2. AI review (secondary): always run for a human-readable explanation,
    #    and used as the deciding signal only for AI-sourced findings that
    #    have no deterministic rule to re-check (business-logic/design
    #    issues the pattern scanner never could have flagged).
    rescan = _rescan_verify_fix(finding, fix["fixedContent"])
    ai_verification = await _ai_verify_fix(finding, fix["fixedContent"], repo_full)
    # THIRD signal — actual sandboxed compile/execute of the patch. Additive:
    # never overrides rescan/AI on its own, but a sandbox-detected failure
    # (patch doesn't even compile) downgrades an otherwise-resolved verdict,
    # since "the pattern is gone" and "the file is valid code" are both
    # necessary, neither is sufficient alone.
    sandbox = await _sandbox_verify_fix(finding, fix["fixedContent"])

    if rescan is not None:
        resolved = rescan["resolved"]
        method = "deterministic_rescan"
        notes = (
            f"Deterministic rescan: rule '{finding.get('ruleKey')}' "
            + ("no longer matches this file." if resolved else f"still matches at line(s) {rescan['matchedLines']}.")
            + f" AI review ({ai_verification['model']}): {ai_verification['notes']}"
        )
    else:
        resolved = ai_verification["resolved"]
        method = "ai_review_only"
        notes = f"No deterministic rule to re-check (AI-sourced finding). AI review ({ai_verification['model']}): {ai_verification['notes']}"

    if sandbox is not None:
        notes += f" Sandbox execution ({sandbox['language']}, phases: {', '.join(sandbox['phases'])}): "
        if sandbox["resolved"]:
            notes += "patch compiled/ran cleanly in the isolated sandbox."
        else:
            notes += f"FAILED at phase '{sandbox['failedPhase']}' — {sandbox['stderr'][:300]}"
            if resolved:
                # Rescan/AI thought this was fixed, but the patch doesn't
                # even run — that's a stronger, more concrete signal than
                # either, so it overrides here.
                resolved = False
                method = f"{method}+sandbox_execution_failed"

    # Both FIX_VERIFIED and FIX_NEEDS_REVIEW are always reachable from
    # FIX_PROCESSING (see state_machine.TRANSITIONS) — the transition we
    # actually need to guard is the one before Step 1 above, checked against
    # a freshly-read scan_doc; `scan_doc` here is stale (read before this
    # request moved the finding into FIX_PROCESSING) so it isn't re-checked.
    to_status = "FIX_VERIFIED" if resolved else "FIX_NEEDS_REVIEW"

    details = f"{fix['model']} generated the patch. Verification method: {method}. {notes}"

    logger.info(
        "ai_fix_completed",
        scan_id=payload.scanId,
        finding_id=payload.findingId,
        repo=repo_full,
        fix_branch=fix_branch,
        verified=resolved,
        verification_method=method,
        fix_model=fix["model"],
        verify_model=ai_verification["model"],
        sandbox_ran=sandbox is not None,
        sandbox_resolved=(sandbox or {}).get("resolved"),
    )

    # Update MongoDB scan history record with fix result — patch the fix's
    # individual fields (not a wholesale replace) so the status/attempts
    # bookkeeping written before Step 1 survives.
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    timestamp_field = "verifiedAt" if to_status == "FIX_VERIFIED" else "reviewNeededAt"
    try:
        await db.scan_history.update_one(
            {"scanId": payload.scanId},
            {
                "$set": {
                    "status": to_status,
                    "fixBranch": fix_branch,
                    "fixedAt": now_iso,
                    f"fixes.{payload.findingId}.status": to_status,
                    f"fixes.{payload.findingId}.verified": resolved,
                    f"fixes.{payload.findingId}.verificationMethod": method,
                    f"fixes.{payload.findingId}.fixBranch": fix_branch,
                    f"fixes.{payload.findingId}.summary": fix["summary"],
                    f"fixes.{payload.findingId}.details": details,
                    f"fixes.{payload.findingId}.similarPastFixes": fix.get("similarPastFixes", []),
                    f"fixes.{payload.findingId}.sandboxExecution": sandbox,
                    f"fixes.{payload.findingId}.{timestamp_field}": now_iso,
                }
            },
        )
        updated_doc = await db.scan_history.find_one({"scanId": payload.scanId}, {"_id": 0})
        if updated_doc:
            await es_client.index_scan_findings(updated_doc)
    except Exception as exc:
        logger.warning("mongo_update_fix_status_failed", error=str(exc))

    # RAG memory: record this fix outcome regardless of resolved/needs-review.
    # Even a needs-review outcome is useful prior art — "this strategy was tried
    # for a similar finding and didn't pass deterministic re-scan", so the next
    # fix prompt can explicitly avoid it.
    #
    # Defence-in-depth: memory_store.record_fix_outcome is documented as
    # best-effort and catches all exceptions internally, but we wrap the call
    # site too. A bug at *this* level (e.g. a NameError in the keyword args
    # before we even enter the function — which is exactly what happened with
    # the doc/scan_doc typo) would otherwise propagate as a 500 to the caller
    # even though the real work (GitHub commit + Mongo update) has already
    # completed. The try/except here ensures that class of bug fails safely:
    # log a warning, complete the FixResponse, skip the memory write.
    try:
        await memory_store.record_fix_outcome(
            scan_id=payload.scanId,
            finding_id=payload.findingId,
            summary=fix["summary"],
            verified=resolved,
            method=method,
            finding=finding,
            owner_id=user.id,
            repo=scan_doc.get("repo"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "memory_record_fix_outcome_call_site_failed",
            scan_id=payload.scanId,
            finding_id=payload.findingId,
            error=str(exc),
        )

    return FixResponse(
        scanId=payload.scanId,
        findingId=payload.findingId,
        verified=resolved,
        fixBranch=fix_branch,
        summary=fix["summary"],
        details=details,
        similarPastFixes=fix.get("similarPastFixes", []),
        sandboxExecution=sandbox,
    )


@router.get("/history")
async def get_scan_history(limit: int = 20, user: CurrentUser = Depends(require_auth)):
    """
    Return list of past scans from MongoDB scan_history collection,
    newest first. Each record includes the Azure Blob URI for the full report.
    """
    try:
        db = get_db()
        # Scoped to the caller — otherwise any authenticated user could read
        # every other user's scan findings and repo names.
        cursor = db.scan_history.find({"organizationId": user.org_id}, {"_id": 0}).sort("scannedAt", -1).limit(limit)
        records = await cursor.to_list(length=limit)
        return {"history": records, "total": len(records)}
    except Exception as exc:
        logger.error("scan_history_fetch_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Could not fetch scan history from database")