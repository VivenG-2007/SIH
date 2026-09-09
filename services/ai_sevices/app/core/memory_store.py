"""
Vector memory for the scan -> fix pipeline's "Remember" step.

Context: app/core/es_client.py already gives this service full-text/keyword
search over past findings (powers the frontend's command-K search bar). What
it does NOT give the pipeline is semantic recall at fix-generation time —
"has something like this been fixed before, and how" — which is what an
agent-hub framing means by "Memory Management: vector DB retrieval". This
module adds that.

  - Storage: a Chroma Cloud collection (app/core/chroma_client.py), one point
    per (scanId, findingId), holding the embedding vector plus the finding's
    title/description/category/severity/file and — once a fix is generated
    and verified — the fix outcome, all as point metadata. No separate
    MongoDB collection for this: Chroma is the source of truth for both the
    vector and the metadata it's retrieved with.
  - Similarity search: two-pass Chroma HNSW query:
      Pass 1 — owner-scoped (ownerId + hasFix=True): best signal, same team.
      Pass 2 — community fallback (hasFix=True only): fires when pass 1
        returns 0 above-threshold results. Ensures the pipeline provides
        value from the very first fix a new user generates.
  - Minimum similarity threshold (MIN_SIMILARITY_THRESHOLD=0.35 cosine):
    Chroma always returns n_results candidates regardless of distance.
    Without this gate a 10% match would be injected as "prior art" and
    actively mislead the fix model. Items below threshold are discarded
    silently before the prompt is built.
  - Degrades like es_client.py: disabled via RAG_MEMORY_ENABLED, or any
    embedding/Chroma failure, only logs a warning and returns [] — it can
    never fail a scan or a fix.
"""

from __future__ import annotations

import asyncio
import datetime
from typing import Any, Optional

from app.config import get_settings
from app.core import chroma_client
from app.core.logging import get_logger
from app.services import embeddings

logger = get_logger()

# Minimum cosine similarity (after 1-distance conversion) required for a
# Chroma result to be included in the fix prompt. Chroma always returns
# n_results candidates regardless of distance — without this gate a 10%
# similarity match would be injected as "prior art". 0.35 is conservative;
# raise towards 0.6 if you see noise, lower towards 0.2 if valid matches
# are being excluded. Check `memory_retrieve_owner_scoped` log lines to tune.
MIN_SIMILARITY_THRESHOLD = 0.35

# How many raw candidates to pull per Chroma query. Larger than the final
# top_k so the threshold filter has a pool to work with.
_QUERY_CANDIDATES = 8


def is_enabled() -> bool:
    return get_settings().rag_memory_enabled


def _doc_id(scan_id: str, finding_id: str) -> str:
    return f"{scan_id}:{finding_id}"


def _embedding_text(finding: dict) -> str:
    parts = [
        finding.get("title") or "",
        finding.get("category") or "",
        finding.get("description") or "",
        f"severity:{finding.get('severity') or ''}",
        f"file:{finding.get('file') or ''}",
    ]
    text = "\n".join(p for p in parts if p)
    # Guard: if finding dict is entirely empty (e.g. record_fix_outcome fallback
    # with no finding context), produce a descriptive placeholder so the vector
    # isn't a near-zero-norm hash of an empty string.
    return text or "unknown vulnerability finding"


async def index_finding(owner_id: str, scan_id: str, repo: str, finding: dict) -> None:
    """Best-effort: embed one finding and upsert it into the Chroma
    finding_memory collection."""
    if not is_enabled():
        return
    finding_id = finding.get("id")
    if not finding_id:
        return
    try:
        vector = await embeddings.embed(_embedding_text(finding))
        collection = await chroma_client.get_collection()
        metadata: dict[str, Any] = {
            "ownerId": owner_id,
            "scanId": scan_id,
            "findingId": finding_id,
            "repo": repo,
            "title": finding.get("title") or "",
            "category": finding.get("category") or "",
            "severity": finding.get("severity") or "",
            "file": finding.get("file") or "",
            "embeddingProvider": get_settings().embedding_provider,
            "indexedAt": datetime.datetime.utcnow().isoformat() + "Z",
            "hasFix": False,
        }
        await asyncio.to_thread(
            collection.upsert,
            ids=[_doc_id(scan_id, finding_id)],
            embeddings=[vector],
            metadatas=[metadata],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_index_finding_failed", scan_id=scan_id, finding_id=finding_id, error=str(exc))


async def record_fix_outcome(
    scan_id: str,
    finding_id: str,
    summary: str,
    verified: bool,
    method: str,
    finding: Optional[dict] = None,
    owner_id: Optional[str] = None,
    repo: Optional[str] = None,
) -> None:
    """Best-effort: attach the fix outcome to the finding's memory point once
    generate_and_verify_fix finishes. If the point was not pre-indexed, upsert it directly
    so Chroma memory is ALWAYS updated."""
    if not is_enabled():
        return
    doc_id = _doc_id(scan_id, finding_id)
    try:
        collection = await chroma_client.get_collection()
        existing = await asyncio.to_thread(collection.get, ids=[doc_id], include=["metadatas"])
        metadatas = existing.get("metadatas") or []

        if metadatas and metadatas[0]:
            metadata = dict(metadatas[0])
            metadata["hasFix"] = True
            metadata["fixSummary"] = summary
            metadata["fixVerified"] = verified
            metadata["fixVerificationMethod"] = method
            metadata["fixRecordedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
            await asyncio.to_thread(collection.update, ids=[doc_id], metadatas=[metadata])
            logger.info(
                "memory_record_fix_outcome_updated",
                scan_id=scan_id,
                finding_id=finding_id,
                verified=verified,
            )
        else:
            # Point missing — construct metadata and upsert into Chroma
            f_dict = finding or {}
            emb_text = _embedding_text(f_dict) if f_dict else summary
            vector = await embeddings.embed(emb_text)
            metadata = {
                "ownerId": owner_id or "",
                "scanId": scan_id,
                "findingId": finding_id,
                "repo": repo or "",
                "title": f_dict.get("title") or summary or "Vulnerability Fix",
                "category": f_dict.get("category") or "",
                "severity": f_dict.get("severity") or "",
                "file": f_dict.get("file") or "",
                "hasFix": True,
                "fixSummary": summary,
                "fixVerified": verified,
                "fixVerificationMethod": method,
                "fixRecordedAt": datetime.datetime.utcnow().isoformat() + "Z",
            }
            await asyncio.to_thread(
                collection.upsert,
                ids=[doc_id],
                embeddings=[vector],
                metadatas=[metadata],
            )
            logger.info(
                "memory_record_fix_outcome_upserted",
                scan_id=scan_id,
                finding_id=finding_id,
                verified=verified,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_record_fix_outcome_failed", scan_id=scan_id, finding_id=finding_id, error=str(exc))


def _score_results(metadatas: list, distances: list, source: str, top_k: int) -> list[dict[str, Any]]:
    """Convert raw Chroma query results into scored, threshold-filtered items.
    `source` is either 'owner' or 'community' — carried through to the prompt
    so the fix model knows the provenance of each piece of prior art."""
    is_mock = get_settings().embedding_provider == "mock"
    threshold = 0.0 if is_mock else MIN_SIMILARITY_THRESHOLD
    items: list[dict[str, Any]] = []

    for idx, (metadata, distance) in enumerate(zip(metadatas, distances)):
        # Only accept records that actually contain a fix outcome
        has_fix = bool(metadata.get("hasFix", False)) or bool(metadata.get("fixSummary"))
        if not has_fix:
            continue

        raw_sim = round(max(0.0, min(1.0, 1.0 - distance)), 4)
        # In mock mode, map pseudo-random distance into a realistic 75%-95% match range
        if is_mock:
            similarity = round(max(0.72, min(0.96, 0.94 - (idx * 0.06))), 2)
        else:
            similarity = raw_sim

        if similarity < threshold:
            continue

        items.append(
            {
                "similarity": similarity,
                "source": source,
                "scanId": metadata.get("scanId"),
                "findingId": metadata.get("findingId"),
                "repo": metadata.get("repo"),
                "title": metadata.get("title") or metadata.get("fixSummary") or "Prior Fix",
                "category": metadata.get("category"),
                "severity": metadata.get("severity"),
                "file": metadata.get("file"),
                "fixSummary": metadata.get("fixSummary"),
                "verified": bool(metadata.get("fixVerified", False)),
            }
        )

    items.sort(key=lambda x: x["similarity"], reverse=True)
    return items[:top_k]


async def retrieve_similar(owner_id: str, finding: dict, top_k: int = 3) -> list[dict[str, Any]]:
    """Semantic retrieval for the fix-generation prompt.

    Three-tier fallback query strategy:
    Tier 1 — Owner-scoped query (ownerId + hasFix)
    Tier 2 — Community query (hasFix)
    Tier 3 — Broad query with Python-side metadata filtering

    Items below similarity threshold are discarded. Degrades safely to [] on error.
    """
    if not is_enabled():
        return []

    try:
        query_vector = await embeddings.embed(_embedding_text(finding))
        collection = await chroma_client.get_collection()

        # Chroma raises if n_results > collection size — clamp to actual count
        # so new deployments (few documents) don't log errors on every fix.
        try:
            total_docs = await asyncio.to_thread(collection.count)
        except Exception:
            total_docs = _QUERY_CANDIDATES
        n_results = max(1, min(_QUERY_CANDIDATES, total_docs))
        if total_docs == 0:
            return []

        # ── Tier 1: Owner-scoped query ─────────────────────────────────────────
        if owner_id:
            for where_clause in [
                {"$and": [{"ownerId": {"$eq": owner_id}}, {"hasFix": {"$eq": True}}]},
                {"ownerId": owner_id},
            ]:
                try:
                    result = await asyncio.to_thread(
                        collection.query,
                        query_embeddings=[query_vector],
                        n_results=n_results,
                        where=where_clause,
                        include=["metadatas", "distances"],
                    )
                    raw_meta = (result.get("metadatas") or [[]])[0]
                    raw_dist = (result.get("distances") or [[]])[0]
                    owner_items = _score_results(raw_meta, raw_dist, source="owner", top_k=top_k)
                    if owner_items:
                        logger.info(
                            "memory_retrieve_owner_scoped_success",
                            finding_id=finding.get("id"),
                            owner_id=owner_id,
                            retrieved=len(owner_items),
                        )
                        return owner_items
                except Exception as exc:  # noqa: BLE001
                    logger.warning("memory_retrieve_owner_tier_error", error=str(exc))

        # ── Tier 2: Community query (hasFix) ───────────────────────────────────
        for where_clause in [{"hasFix": {"$eq": True}}, {"hasFix": True}, None]:
            try:
                kwargs: dict[str, Any] = {
                    "query_embeddings": [query_vector],
                    "n_results": n_results,
                    "include": ["metadatas", "distances"],
                }
                if where_clause is not None:
                    kwargs["where"] = where_clause

                result = await asyncio.to_thread(collection.query, **kwargs)
                raw_meta = (result.get("metadatas") or [[]])[0]
                raw_dist = (result.get("distances") or [[]])[0]
                community_items = _score_results(raw_meta, raw_dist, source="community", top_k=top_k)
                if community_items:
                    logger.info(
                        "memory_retrieve_community_fallback_success",
                        finding_id=finding.get("id"),
                        retrieved=len(community_items),
                    )
                    return community_items
            except Exception as exc:  # noqa: BLE001
                logger.warning("memory_retrieve_community_tier_error", error=str(exc))

        return []

    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_retrieve_similar_failed", owner_id=owner_id, error=str(exc))
        return []
