"""
Audit Trail (P0#5).

Records exactly the shape asked for: who, organization, action, resource,
timestamp, result, request/correlation ID. Every write path migrated to
Mongo in this pass (business-criticality mapping registration, telemetry
ingestion, calibration outcome recording, simulation runs) calls
record_audit_event() alongside its actual write — see
business_criticality.py, ingestion.py, calibration.py, and
routers/simulation.py for the call sites.

BEST-EFFORT, DELIBERATELY — same tradeoff as es_client.py's search
indexing: an audit-log write failure is logged LOUDLY (never silently
swallowed — see the ERROR-level log call below) but never blocks the
underlying operation. The alternative — a Mongo hiccup on the audit
collection taking down real scans or simulations — would turn the audit
log into a denial-of-service lever against the platform itself, which is
a worse security posture than occasionally missing one entry during a
genuine outage. This is a stated tradeoff, not an oversight: a
deployment that cannot tolerate ANY audit-write failure (e.g. a
compliance regime requiring fail-closed audit logging) needs a different
architecture — a durable local buffer with guaranteed delivery, or making
the write transactional with the operation it's auditing — which this
module does not attempt to be.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.logging import get_logger

logger = get_logger()

AUDIT_COLLECTION = "audit_log"


@dataclass
class AuditEvent:
    user_id: str
    organization_id: Optional[str]
    action: str                      # e.g. "business_criticality.register", "ingestion.simulate", "simulation.run"
    resource: str                    # e.g. "asset:acme/payments-api", "scan:scan-abc123"
    result: str                      # "success" | "failure"
    request_id: Optional[str] = None
    detail: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "userId": self.user_id,
            "organizationId": self.organization_id,
            "action": self.action,
            "resource": self.resource,
            "result": self.result,
            "requestId": self.request_id,
            "detail": self.detail,
            "timestamp": self.timestamp,
        }


async def record_audit_event(db, event: AuditEvent) -> None:
    try:
        await db[AUDIT_COLLECTION].insert_one(event.to_dict())
    except Exception as exc:  # noqa: BLE001 — see module docstring for why this is caught, not propagated
        logger.error(
            "audit_log_write_failed",
            action=event.action, resource=event.resource, organization_id=event.organization_id,
            error=str(exc),
        )


async def list_audit_events(
    db, organization_id: str, *, action: Optional[str] = None, resource: Optional[str] = None, limit: int = 100
) -> list[dict]:
    query: dict[str, Any] = {"organizationId": organization_id}
    if action:
        query["action"] = action
    if resource:
        query["resource"] = resource
    cursor = db[AUDIT_COLLECTION].find(query, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return [doc async for doc in cursor]
