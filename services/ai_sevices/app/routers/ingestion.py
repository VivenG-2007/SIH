"""
Continuous Telemetry Ingestion API (SIH 26105 critical gap #1).

One common contract for every telemetry source — real or simulated — see
app/services/risk/ingestion.py for the full rationale. `simulated` is
never optional and never defaulted away in a response: every event and
every list of events says, per item, whether it's real or simulated.

Every event is organization-scoped (P0#1) and persisted to Mongo (P0#2) —
see ingestion.py's own module docstring for the storage/encryption split.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import audit
from app.core.db import get_db
from app.core.security import CurrentUser, require_auth
from app.services.risk import ingestion
from app.services.risk import pipeline_integration

router = APIRouter(prefix="/api/v1/ingestion", tags=["ingestion"])


class SimulateRequest(BaseModel):
    asset_id: str
    source_type: str = Field(..., description="One of: siem, edr, iam, cspm, threat_intel")


class StreamTickRequest(BaseModel):
    asset_id: str = "acme/payments-api"
    mode: str = Field("simulation", description="'simulation' | 'live' | 'hybrid'")
    source_type: Optional[str] = Field(None, description="Optional forced source_type, or auto-selected")


@router.post("/simulate")
async def simulate(req: SimulateRequest, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    allowed = await pipeline_integration.authorize_asset_write(db, user.org_id, req.asset_id)
    if not allowed:
        await audit.record_audit_event(db, audit.AuditEvent(
            user_id=user.id, organization_id=user.org_id, action="ingestion.simulate",
            resource=f"asset:{req.asset_id}", result="failure", detail={"reason": "no_scan_history_for_asset"},
        ))
        raise HTTPException(
            status_code=403,
            detail=(
                f"No scan history found for asset '{req.asset_id}' under this organization — "
                f"scan it with this platform first before pushing telemetry for it."
            ),
        )
    try:
        event = await ingestion.simulate_event(db, user.org_id, req.source_type, req.asset_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await audit.record_audit_event(db, audit.AuditEvent(
        user_id=user.id, organization_id=user.org_id, action="ingestion.simulate",
        resource=f"asset:{req.asset_id}", result="success", detail={"source_type": req.source_type},
    ))
    return event.to_dict()


@router.post("/stream-tick")
async def stream_tick(req: StreamTickRequest, user: CurrentUser = Depends(require_auth)):
    """Generates or ingests the next continuous telemetry event in real-time,
    returning the event with its MITRE ATT&CK mapping and updated risk multipliers."""
    db = get_db()
    allowed = await pipeline_integration.authorize_asset_write(db, user.org_id, req.asset_id)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                f"No scan history found for asset '{req.asset_id}' under this organization — "
                f"scan it with this platform first before pushing telemetry for it."
            ),
        )
    source_type = req.source_type
    if not source_type:
        import random
        sources = ["siem", "edr", "iam", "cspm", "threat_intel"]
        source_type = random.choice(sources)

    try:
        event = await ingestion.simulate_event(db, user.org_id, source_type, req.asset_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    known_exp = await ingestion.known_exploited(db, user.org_id, req.asset_id)
    adj = await ingestion.likelihood_adjustment(db, user.org_id, req.asset_id)

    print(
        f"\033[1;33m[TELEMETRY STREAM]\033[0m Asset: \033[1;37m{req.asset_id}\033[0m | Source: \033[1;36m{source_type.upper()}\033[0m | Event: \033[1;32m{event.event_type}\033[0m | Severity: {event.severity.upper()} | Multiplier: {round(adj, 2)}x"
    )

    return {
        "event": event.to_dict(),
        "known_exploited": known_exp,
        "likelihood_multiplier": round(adj, 4),
        "mode": req.mode,
    }


@router.get("/events")
@router.get("/events/{asset_id:path}")
async def events(asset_id: Optional[str] = None, limit: int = 20, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    target_asset = asset_id or "core-banking"
    evs = await ingestion.recent_events(db, user.org_id, target_asset, limit=limit)
    return {
        "asset_id": target_asset,
        "events": [e.to_dict() for e in evs],
        "known_exploited": await ingestion.known_exploited(db, user.org_id, target_asset),
        "likelihood_multiplier": round(await ingestion.likelihood_adjustment(db, user.org_id, target_asset), 4),
    }


@router.post("/events/reset")
@router.post("/events/{asset_id:path}/reset")
async def reset(asset_id: Optional[str] = None, user: CurrentUser = Depends(require_auth)):
    """Demo/test helper — clears simulated + recorded telemetry for one asset."""
    target_asset = asset_id or "core-banking"
    await ingestion.clear_asset(get_db(), user.org_id, target_asset)
    return {"asset_id": target_asset, "cleared": True}

