"""
CISA Known Exploited Vulnerabilities (KEV) catalog integration.

The gap this module answers: `VulnerabilityContext.is_known_exploited` was
hardcoded `False` for every finding — a permanent floor, never a ceiling,
because no external exploit-intelligence signal was wired up. This module
is that signal.

The catalog itself is real: a free, public, no-authentication-required
JSON feed CISA publishes and updates multiple times per week
(https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json).
Every entry is, by definition, a CVE CISA has confirmed is being actively
exploited in the wild — the strongest publicly-available "this isn't
theoretical" signal available for a given CVE, which is why a KEV match
maps to `exploit_maturity="weaponized"` (see financial_model.py) rather
than merely `is_known_exploited=True` at some lower maturity.

READ THIS BEFORE ASSUMING THIS MODULE "SOLVES" EXPLOIT INTELLIGENCE:
---------------------------------------------------------------------
KEV entries are keyed by CVE ID. This platform's scanner
(routers/scanner.py) is SAST/pattern-based — Semgrep rules and
tree-sitter AST matching over an organization's own source code (hardcoded
credentials, injection patterns, and similar coding weaknesses). It has no
dependency/SCA scanning path today, so **no finding this scanner produces
carries a CVE ID**, and this module will correctly report "not in KEV" —
indistinguishable from "genuinely not exploited" — for every one of them.
This module is real, tested, and ready to enrich findings the moment a
CVE-backed finding source exists (e.g. `npm audit`/`pip-audit`-style
dependency scanning); it does not retroactively make today's SAST findings
CVE-aware. Do not present a 0%-match KEV integration as if it were
covering findings it structurally cannot see.

Design choices that matter for correctness:
  - In-memory cache with a TTL (see config.kev_cache_ttl_seconds), not a
    fetch-per-lookup — the catalog has 1,000+ entries and changes at most
    a few times a week; fetching it per finding would be both slow and
    needlessly hammer CISA's feed.
  - A KEV feed outage must NEVER take down risk pricing. Every lookup
    function degrades to "unknown" (treated the same as "not in KEV") on
    any fetch/parse failure, and callers can inspect `last_sync_status()`
    to know whether that "not in KEV" answer is trustworthy or just means
    the feed couldn't be reached.
  - `catalog_version` / `date_released` from the feed itself are exposed
    so EvidenceTrail entries can cite exactly which KEV snapshot backed a
    given score (the "data_snapshot_id" audit-grade requirement).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import get_settings

_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=get_settings().kev_fetch_timeout_seconds)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


@dataclass
class KevEntry:
    cve_id: str
    vendor_project: str
    product: str
    vulnerability_name: str
    date_added: str
    known_ransomware_campaign_use: bool  # real field CISA publishes ("Known"/"Unknown")
    required_action: str


@dataclass
class _CatalogState:
    entries_by_cve: dict[str, KevEntry]
    catalog_version: str
    date_released: str
    fetched_at: datetime
    fetch_ok: bool
    fetch_error: str | None = None


_state: Optional[_CatalogState] = None


def _parse_catalog(payload: dict) -> _CatalogState:
    entries: dict[str, KevEntry] = {}
    for row in payload.get("vulnerabilities", []):
        cve_id = row.get("cveID")
        if not cve_id:
            continue
        entries[cve_id.upper()] = KevEntry(
            cve_id=cve_id.upper(),
            vendor_project=row.get("vendorProject", ""),
            product=row.get("product", ""),
            vulnerability_name=row.get("vulnerabilityName", ""),
            date_added=row.get("dateAdded", ""),
            known_ransomware_campaign_use=str(row.get("knownRansomwareCampaignUse", "")).lower() == "known",
            required_action=row.get("requiredAction", ""),
        )
    return _CatalogState(
        entries_by_cve=entries,
        catalog_version=str(payload.get("catalogVersion", "")),
        date_released=str(payload.get("dateReleased", "")),
        fetched_at=datetime.now(timezone.utc),
        fetch_ok=True,
    )


def load_from_json(payload: dict) -> None:
    """Seed the in-memory catalog directly from an already-fetched JSON
    payload — the path both `sync()` (real fetch) and tests (fixture
    payload, no network) go through, so both exercise the exact same
    parsing logic."""
    global _state
    _state = _parse_catalog(payload)


async def sync(force: bool = False) -> _CatalogState:
    """Fetch the live CISA KEV feed if the cache is stale (or `force`),
    and return the resulting catalog state. NEVER raises — a feed outage
    degrades to a stale-or-empty cache with `fetch_ok=False`, and every
    lookup function below treats that the same as "not found" rather than
    crashing finding pricing over an external dependency being down.
    """
    global _state
    settings = get_settings()

    if not force and _state is not None and _state.fetch_ok:
        age = (datetime.now(timezone.utc) - _state.fetched_at).total_seconds()
        if age < settings.kev_cache_ttl_seconds:
            return _state

    try:
        resp = await _get_client().get(settings.kev_feed_url)
        resp.raise_for_status()
        _state = _parse_catalog(resp.json())
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any failure mode degrades the same way
        # Keep serving the previous (possibly stale, possibly empty) cache
        # rather than wiping it out on a transient failure.
        previous = _state
        _state = _CatalogState(
            entries_by_cve=(previous.entries_by_cve if previous else {}),
            catalog_version=(previous.catalog_version if previous else ""),
            date_released=(previous.date_released if previous else ""),
            fetched_at=(previous.fetched_at if previous else datetime.now(timezone.utc)),
            fetch_ok=False,
            fetch_error=repr(exc),
        )
    return _state


def last_sync_status() -> dict:
    if _state is None:
        return {"synced": False, "fetch_ok": False, "entry_count": 0, "note": "sync() has not been called yet"}
    return {
        "synced": True,
        "fetch_ok": _state.fetch_ok,
        "fetch_error": _state.fetch_error,
        "entry_count": len(_state.entries_by_cve),
        "catalog_version": _state.catalog_version,
        "date_released": _state.date_released,
        "fetched_at": _state.fetched_at.isoformat(),
    }


def lookup(cve_id: str) -> Optional[KevEntry]:
    """Synchronous lookup against whatever is currently cached — does NOT
    trigger a fetch (call `await sync()` first, typically once at startup
    and then lazily on TTL expiry). Returns None for "not in KEV" AND for
    "catalog never synced" alike; check `last_sync_status()` if you need
    to distinguish those for an audit trail."""
    if _state is None:
        return None
    return _state.entries_by_cve.get(cve_id.upper())


def is_known_exploited(cve_id: str | None) -> bool:
    if not cve_id:
        return False
    return lookup(cve_id) is not None


def is_ransomware_associated(cve_id: str | None) -> bool:
    if not cve_id:
        return False
    entry = lookup(cve_id)
    return bool(entry and entry.known_ransomware_campaign_use)


def data_snapshot_id() -> str:
    """A stable identifier for the exact KEV snapshot currently cached, for
    EvidenceTrail's audit-grade `data_snapshot_id` field. Falls back to a
    fetch-time timestamp if the feed's own `catalogVersion` field is
    unavailable (e.g. never synced)."""
    if _state is None:
        return "kev:not-synced"
    if _state.catalog_version:
        return f"kev:{_state.catalog_version}"
    return f"kev:unsynced-{_state.fetched_at.isoformat()}"
