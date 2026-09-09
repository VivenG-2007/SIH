"""
Risk Simulation API.

Powers the "Risk Simulation" dashboard: given a REAL completed scan (the
user's organization must have actually submitted files/a repo and had it
scanned — see `_load_scan` below), simulate the effect of a budget-
constrained set of security-control investments on portfolio risk. Every
figure returned comes from app/services/risk/simulation.py, which is
itself entirely composed of already-existing, already-tested modules
(optimization, control_effectiveness, financial_model, var_simulation,
attack_path) — no new risk arithmetic lives in this router.

Persistence: Mongo (`risk_simulations` collection) is the source of
truth; Elasticsearch (`patchlinex_simulations`, app/core/es_client.py) is
a best-effort, rebuildable search index on top of it — same "Mongo is
truth, ES is a derived search layer" split this codebase already uses for
findings (see es_client.py's own docstring). Search degrades to a Mongo
listing when ES isn't configured/reachable, never fails.

Every record is organization-scoped (P0#1), not user-scoped — any member
of the organization that ran the underlying scan can run and see
simulations against it, matching how a real security team actually
works together on one shared risk picture.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import audit, es_client
from app.core.db import get_db
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_auth
from app.services.ai_service import run_chat
from app.services.risk import optimization as opt
from app.services.risk import pipeline_integration
from app.services.risk import simulation as sim

router = APIRouter(prefix="/api/v1/risk/simulation", tags=["risk", "simulation"])
logger = get_logger()


class CandidateControlIn(BaseModel):
    key: str
    label: str
    cost_usd: int = Field(..., ge=0)
    risk_reduction_usd: int = Field(0, ge=0, description="Ignored if omitted/0 — server re-derives a real figure from this scan's actual findings")
    evidence_source: str = "unspecified"
    confidence: str = "illustrative"
    implementation_time_days: Optional[int] = None


class RunSimulationRequest(BaseModel):
    scan_id: str
    name: str = "Untitled Simulation"
    environment: str = Field("production", description="e.g. 'production' | 'staging'")
    budget_usd: int = Field(..., ge=0)
    candidate_controls: Optional[list[CandidateControlIn]] = Field(
        None, description="Omit to use the platform default candidate set, re-priced against this scan's real findings"
    )
    narrate_with_ai: bool = True


class WhatIfRequest(BaseModel):
    scan_id: str
    budget_usd: int = Field(..., ge=0)
    excluded_control_keys: list[str] = Field(default_factory=list)
    candidate_controls: Optional[list[CandidateControlIn]] = None


async def _load_scan(scan_id: str, user: CurrentUser) -> dict:
    """The write/compute-authorization boundary for this whole router:
    only a scan this user's ORGANIZATION actually ran (real files/a real
    repo, submitted and scanned through this platform) can be simulated
    against — there is no path to running a simulation against data the
    organization hasn't themselves produced a real scan for. Scoped by
    organizationId (P0#1), not ownerId — any org member can simulate
    against any scan their organization ran, not just their own."""
    db = get_db()
    scan = await db.scan_history.find_one({"scanId": scan_id, "organizationId": user.org_id}, {"_id": 0})
    if scan is None:
        raise HTTPException(
            status_code=404,
            detail=f"No scan '{scan_id}' found for this organization. Run a real scan first — simulations run against actual scanned findings, not synthetic data.",
        )
    findings = scan.get("findings") or []
    if not findings:
        raise HTTPException(status_code=422, detail="This scan has no findings to simulate against.")
    return scan


def _to_investment_options(raw: Optional[list[CandidateControlIn]], findings: list[dict], baseline: list[str]) -> list[opt.InvestmentOption]:
    if raw is None:
        return sim.price_default_candidates(findings, baseline)
    return [
        opt.InvestmentOption(
            key=c.key, label=c.label, cost_usd=c.cost_usd,
            risk_reduction_usd=c.risk_reduction_usd,
            evidence_source=c.evidence_source, confidence=c.confidence,
            implementation_time_days=c.implementation_time_days,
        )
        for c in raw
    ]


def _serialize_result(result: sim.SimulationResult) -> dict:
    return {
        "currentRiskScore": result.current_risk_score,
        "simulatedRiskScore": result.simulated_risk_score,
        "currentEalUsd": result.current_eal_usd,
        "simulatedEalUsd": result.simulated_eal_usd,
        "currentVar95Usd": result.current_var95_usd,
        "simulatedVar95Usd": result.simulated_var95_usd,
        "riskReductionPct": result.risk_reduction_pct,
        "ealReductionUsd": result.eal_reduction_usd,
        "selectedControls": [
            {
                "key": o.key, "label": o.label, "costUsd": o.cost_usd,
                "riskReductionUsd": o.risk_reduction_usd, "roi": o.roi,
                "evidenceSource": o.evidence_source, "confidence": o.confidence,
                "implementationTimeDays": o.implementation_time_days,
            }
            for o in result.selected_controls
        ],
        "totalCostUsd": result.total_cost_usd,
        "budgetUtilizationPct": result.budget_utilization_pct,
        "unevidencedCandidateCount": result.unevidenced_candidate_count,
        "currentAttackPath": {
            "stages": [
                {"stageId": s.stage_id, "label": s.label, "status": s.status, "findingCount": s.finding_count, "ealUsd": s.eal_usd}
                for s in result.current_attack_path.stages
            ],
            "unclassifiedFindingCount": result.current_attack_path.unclassified_finding_count,
            "unclassifiedEalUsd": result.current_attack_path.unclassified_eal_usd,
        },
        "simulatedAttackPath": {
            "stages": [
                {"stageId": s.stage_id, "label": s.label, "status": s.status, "findingCount": s.finding_count, "ealUsd": s.eal_usd}
                for s in result.simulated_attack_path.stages
            ],
            "unclassifiedFindingCount": result.simulated_attack_path.unclassified_finding_count,
            "unclassifiedEalUsd": result.simulated_attack_path.unclassified_eal_usd,
        },
        "varDistribution": {
            "method": result.var_distribution.method,
            "p50Usd": result.var_distribution.p50_usd,
            "p75Usd": result.var_distribution.p75_usd,
            "p90Usd": result.var_distribution.p90_usd,
            "p95Usd": result.var_distribution.p95_usd,
            "p99Usd": result.var_distribution.p99_usd,
            "sampleSize": result.var_distribution.sample_size,
        },
    }


def _narration_prompt(name: str, tiers: dict[str, sim.SimulationResult]) -> str:
    rec = tiers["recommended"]
    lines = [
        "You are a CISO advisor narrating a real security-investment simulation.",
        "Every figure below was computed by a deterministic risk engine, not by you.",
        "Do NOT invent, adjust, or recompute any number — only explain, in plain "
        "language, why the recommended investment is worth making.",
        "",
        f"Simulation: {name}",
        f"Current risk score: {tiers['current'].current_risk_score}/100, EAL ₹{tiers['current'].current_eal_usd:,.0f}",
        f"Recommended plan: {[c.label for c in rec.selected_controls]}, cost ₹{rec.total_cost_usd:,}",
        f"Simulated risk score: {rec.simulated_risk_score}/100, EAL ₹{rec.simulated_eal_usd:,.0f}",
        f"Risk reduction: {rec.risk_reduction_pct:.0%}, exposure avoided ₹{rec.eal_reduction_usd:,.0f}",
        "",
        "Write 2-4 sentences recommending this plan, in the voice of an AI advisor, "
        "naming the specific controls and the dollar impact.",
    ]
    return "\n".join(lines)


@router.post("/run")
async def run_simulation_endpoint(req: RunSimulationRequest, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    scan = await _load_scan(req.scan_id, user)
    findings = scan.get("findings") or []
    baseline = pipeline_integration._active_controls()
    candidates = _to_investment_options(req.candidate_controls, findings, baseline)

    tiers = await sim.scenario_tiers(db, user.org_id, findings, candidates, baseline, req.budget_usd)

    # Full priced candidate universe (not just what got selected per tier)
    # — the frontend investment-selector checklist needs every candidate's
    # real cost/risk_reduction/ROI regardless of whether the optimizer
    # picked it at a given budget.
    priced_candidates = [
        {
            "key": c.key, "label": c.label, "costUsd": c.cost_usd,
            "riskReductionUsd": c.risk_reduction_usd, "roi": c.roi,
            "evidenceSource": c.evidence_source, "confidence": c.confidence,
            "implementationTimeDays": c.implementation_time_days,
        }
        for c in candidates
    ]

    ai_narrative = None
    if req.narrate_with_ai:
        try:
            ai_result = await run_chat(
                owner_id=user.id,
                messages=[{"role": "user", "content": _narration_prompt(req.name, tiers)}],
                use_cache=False,
            )
            ai_narrative = ai_result["content"]
        except Exception as exc:  # noqa: BLE001 — narration is a nice-to-have, never blocks the simulation result
            logger.warning("simulation_ai_narration_failed", error=str(exc))

    simulation_id = f"sim-{uuid.uuid4().hex[:12]}"
    created_at = datetime.now(timezone.utc).isoformat()
    rec = tiers["recommended"]

    doc = {
        "simulationId": simulation_id,
        "organizationId": user.org_id,
        "createdByUserId": user.id,
        "scanId": req.scan_id,
        "repo": scan.get("repo"),
        "name": req.name,
        "environment": req.environment,
        "budgetUsd": req.budget_usd,
        "createdAt": created_at,
        "currentRiskScore": tiers["current"].current_risk_score,
        "simulatedRiskScore": rec.simulated_risk_score,
        "currentEalUsd": tiers["current"].current_eal_usd,
        "simulatedEalUsd": rec.simulated_eal_usd,
        "riskReductionPct": rec.risk_reduction_pct,
        "selectedControlKeys": [c.key for c in rec.selected_controls],
        "pricedCandidates": priced_candidates,
        "tiers": {tier: _serialize_result(result) for tier, result in tiers.items()},
        "aiNarrative": ai_narrative,
    }

    try:
        await db.risk_simulations.insert_one(dict(doc))
    except Exception as exc:  # noqa: BLE001 — persistence failure shouldn't hide a computed result from the caller
        logger.warning("simulation_mongo_save_failed", simulation_id=simulation_id, error=str(exc))

    await es_client.index_simulation(doc)  # best-effort, see es_client.index_simulation's own docstring
    await audit.record_audit_event(db, audit.AuditEvent(
        user_id=user.id, organization_id=user.org_id, action="simulation.run",
        resource=f"scan:{req.scan_id}", result="success",
        detail={"simulationId": simulation_id, "budgetUsd": req.budget_usd},
    ))

    doc.pop("_id", None)
    return doc


@router.get("/search")
async def search_simulations(
    q: str = "",
    environment: Optional[str] = None,
    repo: Optional[str] = None,
    limit: int = 20,
    user: CurrentUser = Depends(require_auth),
):
    es_results = await es_client.search_simulations(organization_id=user.org_id, query=q, environment=environment, repo=repo, size=limit)
    if es_results is not None:
        return {"results": es_results, "source": "elasticsearch", "total": len(es_results)}

    # Mongo fallback — same "search still works, just without fuzzy/
    # relevance ranking" contract as routers/search.py.
    db = get_db()
    mongo_filter: dict = {"organizationId": user.org_id}
    if environment:
        mongo_filter["environment"] = environment
    if repo:
        mongo_filter["repo"] = repo
    cursor = db.risk_simulations.find(mongo_filter, {"_id": 0, "tiers": 0}).sort("createdAt", -1).limit(limit)
    results = []
    async for doc in cursor:
        if q and q.lower() not in (doc.get("name") or "").lower():
            continue
        results.append(doc)
    return {"results": results, "source": "mongo_fallback", "total": len(results)}


@router.get("/{simulation_id}")
async def get_simulation(simulation_id: str, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    doc = await db.risk_simulations.find_one({"simulationId": simulation_id, "organizationId": user.org_id}, {"_id": 0})
    if doc is None:
        raise HTTPException(status_code=404, detail=f"No simulation '{simulation_id}' found for this organization.")
    return doc


@router.post("/what-if")
async def what_if_endpoint(req: WhatIfRequest, user: CurrentUser = Depends(require_auth)):
    db = get_db()
    scan = await _load_scan(req.scan_id, user)
    findings = scan.get("findings") or []
    baseline = pipeline_integration._active_controls()
    candidates = _to_investment_options(req.candidate_controls, findings, baseline)

    result = await sim.what_if_exclude(db, user.org_id, findings, candidates, req.budget_usd, baseline, req.excluded_control_keys)
    return {
        "excludedControlKeys": req.excluded_control_keys,
        **_serialize_result(result),
    }
