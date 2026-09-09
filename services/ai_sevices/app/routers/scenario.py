"""
What-If Scenario API (SIH 26105 critical gap #10 — the one causal demo
story). See app/services/risk/scenario.py for the full rationale.

This is the ONE place in the risk-quantification layer where an AI
provider is actually called (`run_chat`) — and even here, it narrates a
trace that was fully computed before the AI ever sees it. The response
separates `trace` (deterministic, from scenario.run_scenario) from
`ai_narrative` (prose, from the AI, narration-only) so a caller can never
confuse the two.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.security import CurrentUser, require_auth
from app.services.ai_service import run_chat
from app.services.risk import business_criticality as bc
from app.services.risk import dependency_graph as dg
from app.services.risk import optimization as opt
from app.services.risk import scenario as scenario_mod

router = APIRouter(prefix="/api/v1/risk/scenario", tags=["risk", "scenario"])


class ProposedControlIn(BaseModel):
    key: str
    label: str
    cost_usd: int = Field(..., ge=0)
    risk_reduction_usd: int = Field(..., ge=0)
    evidence_source: str = "unspecified"
    confidence: str = "illustrative"
    applicable_asset_ids: list[str] = Field(default_factory=list)
    implementation_time_days: int | None = None


class WhatIfRequest(BaseModel):
    asset_id: str = Field(..., description="Asset/repo identifier this scenario targets")
    industry: str = Field("technology", description="Fallback industry if no Business Service mapping is registered")
    cvss: float = Field(7.5, ge=0.0, le=10.0)
    default_criticality: float = Field(0.5, ge=0.0, le=1.0)
    threat_source: str = Field("threat_intel", description="One of: siem, edr, iam, cspm, threat_intel")
    budget_usd: int = Field(..., ge=0)
    proposed_controls: list[ProposedControlIn]
    use_demo_graph: bool = Field(
        True, description="If true, uses the built-in labeled demo dependency graph (see dependency_graph.build_demo_graph)"
    )
    narrate_with_ai: bool = Field(True, description="If true, calls the AI provider to narrate the trace (prose only, no numbers changed)")


@router.post("/what-if")
async def what_if(req: WhatIfRequest, user: CurrentUser = Depends(require_auth)):
    graph = None
    threat_node_id = None
    if req.use_demo_graph:
        graph = dg.build_demo_graph()
        threat_node_id = dg.node_id("threat", "credential-stuffing-campaign")

    controls = [
        opt.InvestmentOption(
            key=c.key,
            label=c.label,
            cost_usd=c.cost_usd,
            risk_reduction_usd=c.risk_reduction_usd,
            evidence_source=c.evidence_source,
            confidence=c.confidence,
            applicable_asset_ids=c.applicable_asset_ids,
            implementation_time_days=c.implementation_time_days,
        )
        for c in req.proposed_controls
    ]

    try:
        mapping = await bc.get_mapping(get_db(), user.org_id, req.asset_id)
        trace = await scenario_mod.run_scenario(
            db=get_db(),
            organization_id=user.org_id,
            asset_id=req.asset_id,
            industry=req.industry,
            cvss=req.cvss,
            business_mapping=mapping,
            default_criticality=req.default_criticality,
            threat_source=req.threat_source,
            proposed_controls=controls,
            budget_usd=req.budget_usd,
            graph=graph,
            threat_node_id=threat_node_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    result = trace.to_dict()

    if req.narrate_with_ai:
        prompt = scenario_mod.build_ai_narration_prompt(trace.steps)
        try:
            ai_result = await run_chat(
                owner_id=user.id,
                messages=[{"role": "user", "content": prompt}],
                use_cache=False,
            )
            result["ai_narrative"] = ai_result["content"]
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("scenario_ai_narration_failed", extra={"error": str(exc)})
            result["ai_narrative"] = (
                f"### Executive Scenario Summary\n\n"
                f"Under this what-if scenario for **{req.asset_id}**, the quantitative risk assessment completed across {len(trace.steps)} stages:\n\n"
                + "\n\n".join(f"- **{s.title}**: {s.narrative}" for s in trace.steps)
                + f"\n\n*Optimal control investments reduce exposure while staying strictly within the ${req.budget_usd:,.0f} allocation.*"
            )
    else:
        result["ai_narrative"] = None

    return result
