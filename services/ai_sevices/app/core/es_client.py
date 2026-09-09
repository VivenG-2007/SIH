"""
Elasticsearch integration for full-text search over scan findings.

Design goals:
  - Optional at runtime. If ES_URL (or ES_CLOUD_ID) isn't set, every function
    here becomes a safe no-op / returns an empty result instead of raising —
    search degrades to "unavailable", it never takes the scanner down.
  - Indexing happens best-effort, right after a scan is persisted to Mongo.
    Mongo (scan_history) stays the source of truth; ES is a derived, rebuildable
    search index. If ES indexing fails, the scan result to the caller is
    unaffected — we only log a warning.
  - One document per finding (not per scan), so search can filter/sort at the
    finding level (severity, repo, status) the way the UI's search bar needs.

Index name: `patchlinex_findings`
Document id: `{scanId}:{findingId}` (deterministic — re-indexing a scan
overwrites the same docs instead of duplicating them).
"""

from __future__ import annotations

from typing import Any, Optional

from elasticsearch import AsyncElasticsearch
from elasticsearch.helpers import async_bulk

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger()

FINDINGS_INDEX = "patchlinex_findings"

_client: Optional[AsyncElasticsearch] = None
_checked_unavailable = False


def _build_client() -> Optional[AsyncElasticsearch]:
    settings = get_settings()
    endpoint = settings.es_endpoint or settings.es_url
    if endpoint:
        kwargs: dict[str, Any] = {"hosts": [endpoint]}
        if settings.es_api_key:
            kwargs["api_key"] = settings.es_api_key
        elif settings.es_username and settings.es_password:
            kwargs["basic_auth"] = (settings.es_username, settings.es_password)
        return AsyncElasticsearch(**kwargs)
    if settings.es_cloud_id and settings.es_api_key:
        return AsyncElasticsearch(cloud_id=settings.es_cloud_id, api_key=settings.es_api_key)
    return None


def get_client() -> Optional[AsyncElasticsearch]:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def is_configured() -> bool:
    return get_client() is not None


async def ping() -> bool:
    client = get_client()
    if client is None:
        return False
    try:
        return bool(await client.ping())
    except Exception as exc:  # noqa: BLE001 — any transport error just means "not reachable"
        logger.warning("elasticsearch_ping_failed", error=str(exc))
        return False


async def ensure_index() -> None:
    client = get_client()
    if client is None:
        return
    try:
        exists = await client.indices.exists(index=FINDINGS_INDEX)
        if exists:
            return
        await client.indices.create(
            index=FINDINGS_INDEX,
            mappings={
                "properties": {
                    "organizationId": {"type": "keyword"},
                    "scanId": {"type": "keyword"},
                    "findingId": {"type": "keyword"},
                    "repo": {"type": "keyword"},
                    "branch": {"type": "keyword"},
                    "title": {"type": "text"},
                    "description": {"type": "text"},
                    "file": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                    "line": {"type": "integer"},
                    "severity": {"type": "keyword"},
                    "category": {"type": "keyword"},
                    "source": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "scannedAt": {"type": "date"},
                }
            },
        )
        logger.info("elasticsearch_index_created", index=FINDINGS_INDEX)
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_index_setup_skipped", error=str(exc))


async def index_scan_findings(scan_doc: dict) -> None:
    """Index (or re-index) every finding on a scan as one ES doc each.
    Called right after `_save_scan_metadata` in routers/scanner.py — best
    effort, failures are logged and swallowed so a search-index hiccup never
    fails the scan itself."""
    client = get_client()
    if client is None:
        return
    findings = scan_doc.get("findings") or []
    if not findings:
        return
    fixes = scan_doc.get("fixes") or {}

    def _doc(f: dict) -> dict:
        finding_id = f.get("id")
        status = (fixes.get(finding_id) or {}).get("status") or "AWAITING_APPROVAL"
        return {
            "_index": FINDINGS_INDEX,
            "_id": f"{scan_doc.get('scanId')}:{finding_id}",
            "_source": {
                "organizationId": scan_doc.get("organizationId"),
                "scanId": scan_doc.get("scanId"),
                "findingId": finding_id,
                "repo": scan_doc.get("repo"),
                "branch": scan_doc.get("branch"),
                "title": f.get("title"),
                "description": f.get("description"),
                "file": f.get("file"),
                "line": f.get("line"),
                "severity": (f.get("severity") or "").upper(),
                "category": f.get("category"),
                "source": f.get("source"),
                "status": status,
                "scannedAt": scan_doc.get("scannedAt"),
            },
        }

    try:
        await ensure_index()
        actions = [_doc(f) for f in findings]
        await async_bulk(client, actions, raise_on_error=False)
        logger.info("elasticsearch_indexed_findings", scan_id=scan_doc.get("scanId"), count=len(actions))
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_indexing_failed", scan_id=scan_doc.get("scanId"), error=str(exc))


async def search_findings(
    organization_id: str,
    query: str = "",
    severity: Optional[str] = None,
    repo: Optional[str] = None,
    status: Optional[str] = None,
    size: int = 20,
) -> Optional[list[dict]]:
    """Returns None (not []) when ES isn't configured/reachable, so callers
    can distinguish "no matches" from "search unavailable, fall back"."""
    client = get_client()
    if client is None:
        return None

    must: list[dict] = [{"term": {"organizationId": organization_id}}]
    if query.strip():
        must.append(
            {
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "description", "file^2", "repo"],
                    "fuzziness": "AUTO",
                }
            }
        )
    if severity:
        must.append({"term": {"severity": severity.upper()}})
    if repo:
        must.append({"term": {"repo": repo}})
    if status:
        must.append({"term": {"status": status.upper()}})

    try:
        result = await client.search(
            index=FINDINGS_INDEX,
            query={"bool": {"must": must}},
            sort=[{"scannedAt": {"order": "desc"}}],
            size=size,
        )
        return [hit["_source"] | {"_score": hit.get("_score")} for hit in result["hits"]["hits"]]
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_search_failed", error=str(exc))
        return None


async def close() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


# ---------------------------------------------------------------------------
# Risk Simulation index — same optional/graceful-degradation contract as
# the findings index above (patchlinex_findings): if ES isn't configured
# or unreachable, every function here is a safe no-op / returns None so
# callers can fall back to Mongo, exactly like search_findings() already
# does for the command-K search bar. One document per simulation RUN (not
# per finding) — a simulation is a single named, searchable artifact
# ("Q4 Security Investment Plan"), unlike findings which are searched
# individually.
# ---------------------------------------------------------------------------

SIMULATIONS_INDEX = "patchlinex_simulations"


async def ensure_simulations_index() -> None:
    client = get_client()
    if client is None:
        return
    try:
        exists = await client.indices.exists(index=SIMULATIONS_INDEX)
        if exists:
            return
        await client.indices.create(
            index=SIMULATIONS_INDEX,
            mappings={
                "properties": {
                    "organizationId": {"type": "keyword"},
                    "simulationId": {"type": "keyword"},
                    "scanId": {"type": "keyword"},
                    "repo": {"type": "keyword"},
                    "name": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                    "environment": {"type": "keyword"},
                    "budgetUsd": {"type": "float"},
                    "currentRiskScore": {"type": "integer"},
                    "simulatedRiskScore": {"type": "integer"},
                    "currentEalUsd": {"type": "float"},
                    "simulatedEalUsd": {"type": "float"},
                    "riskReductionPct": {"type": "float"},
                    "selectedControlKeys": {"type": "keyword"},
                    "createdAt": {"type": "date"},
                }
            },
        )
        logger.info("elasticsearch_index_created", index=SIMULATIONS_INDEX)
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_index_setup_skipped", index=SIMULATIONS_INDEX, error=str(exc))


async def index_simulation(sim_doc: dict) -> None:
    """Index (or re-index, same id = overwrite) one simulation run.
    Best-effort — Mongo (risk_simulations collection) stays the source of
    truth; ES is a derived, rebuildable search index, exactly like
    patchlinex_findings. A failure here is logged and swallowed, never
    raised — an indexing hiccup must never fail the simulation run itself.
    """
    client = get_client()
    if client is None:
        return
    try:
        await ensure_simulations_index()
        await client.index(
            index=SIMULATIONS_INDEX,
            id=sim_doc.get("simulationId"),
            document={
                "organizationId": sim_doc.get("organizationId"),
                "simulationId": sim_doc.get("simulationId"),
                "scanId": sim_doc.get("scanId"),
                "repo": sim_doc.get("repo"),
                "name": sim_doc.get("name"),
                "environment": sim_doc.get("environment"),
                "budgetUsd": sim_doc.get("budgetUsd"),
                "currentRiskScore": sim_doc.get("currentRiskScore"),
                "simulatedRiskScore": sim_doc.get("simulatedRiskScore"),
                "currentEalUsd": sim_doc.get("currentEalUsd"),
                "simulatedEalUsd": sim_doc.get("simulatedEalUsd"),
                "riskReductionPct": sim_doc.get("riskReductionPct"),
                "selectedControlKeys": sim_doc.get("selectedControlKeys"),
                "createdAt": sim_doc.get("createdAt"),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_indexing_failed", simulation_id=sim_doc.get("simulationId"), error=str(exc))


async def search_simulations(
    organization_id: str,
    query: str = "",
    environment: Optional[str] = None,
    repo: Optional[str] = None,
    size: int = 20,
) -> Optional[list[dict]]:
    """Returns None (not []) when ES isn't configured/reachable, so callers
    can distinguish "no matches" from "search unavailable, fall back" —
    same contract as search_findings()."""
    client = get_client()
    if client is None:
        return None

    must: list[dict] = [{"term": {"organizationId": organization_id}}]
    if query.strip():
        must.append({"multi_match": {"query": query, "fields": ["name^3", "repo"], "fuzziness": "AUTO"}})
    if environment:
        must.append({"term": {"environment": environment}})
    if repo:
        must.append({"term": {"repo": repo}})

    try:
        result = await client.search(
            index=SIMULATIONS_INDEX,
            query={"bool": {"must": must}},
            sort=[{"createdAt": {"order": "desc"}}],
            size=size,
        )
        return [hit["_source"] | {"_score": hit.get("_score")} for hit in result["hits"]["hits"]]
    except Exception as exc:  # noqa: BLE001
        logger.warning("elasticsearch_simulation_search_failed", error=str(exc))
        return None
