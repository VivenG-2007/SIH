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


@router.post("/simulate")
async def simulate(req: SimulateRequest, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    # Same write-authorization scoping as business-criticality registration
    # — see pipeline_integration.user_can_manage_asset's docstring.
    allowed = await pipeline_integration.user_can_manage_asset(db, user.org_id, req.asset_id)
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


@router.get("/events/{asset_id}")
async def events(asset_id: str, limit: int = 20, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    evs = await ingestion.recent_events(db, user.org_id, asset_id, limit=limit)
    return {
        "asset_id": asset_id,
        "events": [e.to_dict() for e in evs],
        "known_exploited": await ingestion.known_exploited(db, user.org_id, asset_id),
        "likelihood_multiplier": round(await ingestion.likelihood_adjustment(db, user.org_id, asset_id), 4),
    }


@router.post("/events/{asset_id}/reset")
async def reset(asset_id: str, user: CurrentUser = Depends(require_auth)):
    """Demo/test helper — clears simulated + recorded telemetry for one asset."""
    await ingestion.clear_asset(get_db(), user.org_id, asset_id)
    return {"asset_id": asset_id, "cleared": True}
