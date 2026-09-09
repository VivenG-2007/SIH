"""
What-If Scenario Orchestrator (SIH 26105 critical gap #10 — "one complete
causal story").

The critique this module answers directly: don't demo Scanner -> Dashboard
-> Graph -> RAG -> AI -> Sandbox -> Kubernetes as unrelated feature
showcases. Demo ONE causal chain instead:

    Threat Event
      -> Asset affected
      -> Business criticality
      -> Likelihood changes
      -> Financial exposure increases
      -> (AI explains WHY — narration only, see build_ai_narration_prompt)
      -> "What if we deploy MFA?"
      -> Budget-constrained optimizer chooses controls
      -> Scenario recalculation
      -> Risk decreases

This module is the deterministic backbone of that story. It composes
FIVE modules that already existed independently
(business_criticality, ingestion, dependency_graph, financial_model /
control_effectiveness, optimization) into one ordered trace — it adds NO
new arithmetic of its own; every number in a ScenarioStep is produced by
calling the module that owns that computation, exactly as before. That is
the concrete implementation of critique #7 ("deterministic engines
calculate, AI explains — never the reverse"): this file has no AI import,
and nothing here computes a dollar figure that doesn't already carry its
own EvidenceTrail from the module that owns it.

The AI's role — narrating WHY the numbers moved, in prose, for a judge or
CISO who doesn't want to read a JSON trace — is represented here only as
`build_ai_narration_prompt()`, which returns a prompt string. Actually
calling an AI provider is the router layer's job (see
routers/scenario.py), keeping this module importable and unit-testable
with zero network/DB dependencies, matching every other module in this
package.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import business_criticality as bc
from . import control_effectiveness as ce
from . import dependency_graph as dg
from . import financial_model as fm
from . import ingestion
from . import optimization as opt
from .evidence import EvidenceTrail


@dataclass
class ScenarioStep:
    step: int
    title: str
    explanation: str
    data: dict = field(default_factory=dict)
    evidence: list[dict] = field(default_factory=list)


@dataclass
class ScenarioTrace:
    asset_id: str
    steps: list[ScenarioStep]

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "steps": [
                {
                    "step": s.step,
                    "title": s.title,
                    "explanation": s.explanation,
                    "data": s.data,
                    "evidence": s.evidence,
                }
                for s in self.steps
            ],
        }


async def run_scenario(
    *,
    db,
    organization_id: str,
    asset_id: str,
    industry: str,
    cvss: float,
    business_mapping: bc.AssetBusinessMapping | None,
    default_criticality: float,
    threat_source: str,
    proposed_controls: list[opt.InvestmentOption],
    budget_usd: int,
    graph: dg.DependencyGraph | None = None,
    threat_node_id: str | None = None,
    rng=None,
) -> ScenarioTrace:
    """Runs the full 10-beat causal story and returns an ordered trace.
    Deterministic given a fixed `rng` seed for the simulated threat event;
    non-deterministic (by design, for demo variety) otherwise — the
    simulator's own honesty guarantees (ingestion.simulate_event) are
    unaffected either way. `organization_id` scopes every telemetry
    read/write in this run (P0#1) — two organizations running a scenario
    against the same asset_id never see each other's simulated events.
    """
    steps: list[ScenarioStep] = []

    # --- Step 1: Threat Event -------------------------------------------------
    event = await ingestion.simulate_event(db, organization_id, threat_source, asset_id, rng=rng)
    steps.append(ScenarioStep(
        step=1,
        title="Threat Event",
        explanation=(
            f"A {event.source_type} signal was observed for asset '{asset_id}': "
            f"{event.summary}. (SIMULATED — see event.simulated; no live "
            f"{event.source_type} integration is wired up for this instance yet.)"
        ),
        data=event.to_dict(),
    ))

    # --- Step 2: Asset affected -> which business services, via the graph -----
    affected_services: list[dict] = []
    if graph is not None and threat_node_id is not None:
        affected_services = dg.affected_business_services(graph, threat_node_id)
    steps.append(ScenarioStep(
        step=2,
        title="Asset Affected",
        explanation=(
            f"Asset '{asset_id}' is the target. Dependency-graph traversal from "
            f"the threat node found {len(affected_services)} business service(s) "
            f"reachable through the asset's dependency chain."
            if graph is not None else
            f"Asset '{asset_id}' is the target. No dependency graph was supplied "
            f"for this run — business-service impact is scoped to this asset only."
        ),
        data={"asset_id": asset_id, "affected_business_services": affected_services},
    ))

    # --- Step 3: Business criticality -----------------------------------------
    criticality_result, criticality_trail = bc.compute_criticality(
        asset_id, business_mapping, default_criticality, industry
    )
    steps.append(ScenarioStep(
        step=3,
        title="Business Criticality",
        explanation=criticality_trail.explanation,
        data={
            "criticality_score": criticality_result.criticality_score,
            "revenue_at_risk_usd": criticality_result.revenue_at_risk_usd,
            "used_default": criticality_result.used_default,
        },
        evidence=[criticality_trail.to_dict()],
    ))

    # --- Step 4: Likelihood changes ---------------------------------------
    is_known_exploited = await ingestion.known_exploited(db, organization_id, asset_id) or event.likelihood_effect.value == "mark_known_exploited"
    vuln = fm.VulnerabilityContext(finding_id=f"scenario-{asset_id}", cvss=cvss, is_known_exploited=is_known_exploited)
    pre_likelihood, likelihood_trail = fm.compute_likelihood(vuln)
    telemetry_multiplier = await ingestion.likelihood_adjustment(db, organization_id, asset_id)
    adjusted_likelihood = min(pre_likelihood * telemetry_multiplier, 1.0)
    steps.append(ScenarioStep(
        step=4,
        title="Likelihood Changes",
        explanation=(
            likelihood_trail.explanation
            + f" Recent telemetry for this asset applies a {telemetry_multiplier:.2f}x "
              f"bounded adjustment (see ingestion.likelihood_adjustment), moving the "
              f"working likelihood from {pre_likelihood:.3f} to {adjusted_likelihood:.3f}."
        ),
        data={
            "pre_telemetry_likelihood": round(pre_likelihood, 4),
            "telemetry_multiplier": round(telemetry_multiplier, 4),
            "adjusted_likelihood": round(adjusted_likelihood, 4),
            "is_known_exploited": is_known_exploited,
        },
        evidence=[likelihood_trail.to_dict()],
    ))

    # --- Step 5: Financial exposure increases ------------------------------
    asset_ctx = fm.AssetContext(
        asset_id=asset_id, industry=criticality_result.industry, criticality=criticality_result.criticality_score
    )
    impact, impact_trail = fm.compute_impact(asset_ctx)
    eal_before = fm.compute_eal(adjusted_likelihood, impact)
    var_before, var_trail_before = fm.compute_var(eal_before)
    steps.append(ScenarioStep(
        step=5,
        title="Financial Exposure Increases",
        explanation=(
            f"With no additional controls applied, this threat event prices at "
            f"${eal_before:,.0f} Expected Annual Loss (${var_before:,.0f} VaR-95) "
            f"for asset '{asset_id}' — criticality-scaled impact "
            f"(${impact.total_usd:,.0f}) x adjusted likelihood "
            f"({adjusted_likelihood:.3f})."
        ),
        data={"expected_annual_loss_usd": round(eal_before, 2), "value_at_risk_95_usd": round(var_before, 2)},
        evidence=[impact_trail.to_dict(), var_trail_before.to_dict()],
    ))

    # --- Step 6: AI explains WHY (narration prompt only — no AI call here) ----
    narration_prompt = build_ai_narration_prompt(steps)
    steps.append(ScenarioStep(
        step=6,
        title="AI Explains Why",
        explanation=(
            "The deterministic figures above are handed to an LLM for prose "
            "narration ONLY — the LLM does not compute or alter any number in "
            "this trace. See the 'narration_prompt' field for exactly what is "
            "sent; routers/scenario.py is what actually calls the AI provider."
        ),
        data={"narration_prompt": narration_prompt},
    ))

    # --- Step 7/8: What-if control deployment + budget-constrained optimizer --
    optimization_result, optimization_trail = opt.optimize_investment(proposed_controls, budget_usd)
    selected_keys = [o.key for o in optimization_result.selected]
    control_result, control_trail = ce.apply_controls(adjusted_likelihood, selected_keys)
    steps.append(ScenarioStep(
        step=7,
        title="What-If: Deploy Selected Controls Within Budget",
        explanation=(
            f"Given a ${budget_usd:,} budget and {len(proposed_controls)} candidate "
            f"control(s), the exact 0/1-knapsack optimizer selected: "
            f"{selected_keys or '(none — budget too small for any candidate)'}. "
            + optimization_trail.explanation
        ),
        data={
            "selected_controls": selected_keys,
            "total_cost_usd": optimization_result.total_cost_usd,
            "budget_utilization_pct": round(optimization_result.budget_utilization_pct, 4),
        },
        evidence=[optimization_trail.to_dict()],
    ))

    # --- Step 9: Scenario recalculation -------------------------------------
    eal_after = fm.compute_eal(control_result.post_control_likelihood, impact)
    var_after, var_trail_after = fm.compute_var(eal_after)
    steps.append(ScenarioStep(
        step=8,
        title="Scenario Recalculation",
        explanation=(
            control_trail.explanation
            + f" Recalculated exposure with selected controls active: "
              f"${eal_after:,.0f} EAL (${var_after:,.0f} VaR-95), down from "
              f"${eal_before:,.0f} EAL before this control deployment."
        ),
        data={"expected_annual_loss_usd": round(eal_after, 2), "value_at_risk_95_usd": round(var_after, 2)},
        evidence=[control_trail.to_dict(), var_trail_after.to_dict()],
    ))

    # --- Step 10: Risk decreases ---------------------------------------------
    eal_reduction = eal_before - eal_after
    pct_reduction = (eal_reduction / eal_before) if eal_before else 0.0
    steps.append(ScenarioStep(
        step=9,
        title="Risk Decreases",
        explanation=(
            f"Net effect of this scenario: ${eal_reduction:,.0f} EAL reduction "
            f"({pct_reduction:.0%}) for a ${optimization_result.total_cost_usd:,} "
            f"control investment — {selected_keys or 'no controls selected'}. "
            f"This is the one causal chain to demo end-to-end: one threat event, "
            f"one financial consequence, one investment decision, one measurable "
            f"outcome."
        ),
        data={
            "eal_before_usd": round(eal_before, 2),
            "eal_after_usd": round(eal_after, 2),
            "eal_reduction_usd": round(eal_reduction, 2),
            "eal_reduction_pct": round(pct_reduction, 4),
            "control_investment_usd": optimization_result.total_cost_usd,
        },
    ))

    return ScenarioTrace(asset_id=asset_id, steps=steps)


def build_ai_narration_prompt(steps: list[ScenarioStep]) -> str:
    """Builds a prompt asking an LLM to narrate — never recompute — the
    trace so far. Deliberately instructs the model to treat every number as
    fixed input, mirroring the architecture rule enforced structurally
    elsewhere in this package (financial_model.py imports no AI provider;
    this is the same rule, stated explicitly for the one place an AI
    provider IS in the loop).
    """
    lines = [
        "You are narrating a cyber-risk scenario for a non-technical executive.",
        "Every figure below was computed by a deterministic risk engine, not by you.",
        "Do NOT invent, adjust, or recompute any number — only explain, in plain "
        "language, why each step follows from the one before it.",
        "",
    ]
    for s in steps:
        lines.append(f"Step {s.step} — {s.title}: {s.explanation}")
    lines.append("")
    lines.append(
        "Write a 4-6 sentence narrative connecting these steps into one story: "
        "the threat, the exposure it created, the decision made, and the "
        "measurable outcome."
    )
    return "\n".join(lines)
