"""
Portfolio Risk Simulation.

The backend for the Risk Simulation dashboard: given a REAL completed
scan's findings (each already priced by
pipeline_integration.compute_finding_risk, carrying attackClass /
preControlLikelihood / businessCriticality / expectedAnnualLossUsd), and a
budget-constrained set of candidate security-control investments, compute
a "Current" vs "Simulated" comparison — what portfolio risk would look
like if the optimizer's chosen controls were deployed on top of whatever
is already active.

This module adds NO new risk arithmetic of its own except the one score
called out below. Every dollar/likelihood figure comes from a module that
already owns that computation:
  - optimization.optimize_investment() — the budget-constrained knapsack
  - control_effectiveness.apply_controls() — per-finding, attack-class-
    aware residual likelihood under a given control set
  - financial_model.compute_var() — the VaR dollar figure
  - var_simulation.simulate_var() — the Monte Carlo tail distribution
  - attack_path.build_attack_path() — where the risk sits, before/after

RISK SCORE (0-100) is the one genuinely new figure this module
introduces — see `_risk_score()`'s docstring for the exact, reproducible
formula and what it deliberately is NOT (not CVSS-qualitative, not a
FAIR rating, not an external standard of any kind).
"""

from __future__ import annotations

from dataclasses import dataclass

from . import attack_path as ap
from . import control_effectiveness as ce
from . import data_sources as ds
from . import financial_model as fm
from . import optimization as opt
from . import var_simulation as vs


def _risk_score(findings: list[dict], likelihood_key: str) -> int:
    """0-100 composite: criticality-weighted average of per-finding
    likelihood (read from `likelihood_key` — e.g. "postControlLikelihood"),
    rescaled to 0-100. Findings with no financialImpact, or missing the
    requested likelihood/criticality, are excluded. Returns 0 for an
    empty/entirely-unpriced set (the correct default: "nothing priced" is
    not the same as "82/100 critical", and should never look like it).

    Weighting by businessCriticality means a portfolio of findings on
    low-criticality assets scores lower than the same likelihood spread
    across high-criticality assets — consistent with, not a duplicate of,
    the platform's own Business Criticality Engine. Not an external risk-
    scoring standard; a platform-specific composite defined here,
    explicitly, so it stays reproducible.
    """
    weighted: list[tuple[float, float]] = []
    for f in findings:
        fi = f.get("financialImpact") or {}
        likelihood = fi.get(likelihood_key)
        criticality = fi.get("businessCriticality")
        if likelihood is None or criticality is None:
            continue
        # Floor so a 0-criticality finding doesn't erase its own weight
        # from the average entirely.
        weighted.append((likelihood, max(criticality, 0.05)))
    if not weighted:
        return 0
    total_weight = sum(w for _, w in weighted)
    score = sum(l * w for l, w in weighted) / total_weight
    return round(min(max(score, 0.0), 1.0) * 100)


@dataclass
class SimulationResult:
    current_risk_score: int
    simulated_risk_score: int
    current_eal_usd: float
    simulated_eal_usd: float
    current_var95_usd: float
    simulated_var95_usd: float
    risk_reduction_pct: float
    eal_reduction_usd: float
    selected_controls: list[opt.InvestmentOption]
    total_cost_usd: int
    budget_utilization_pct: float
    unevidenced_candidate_count: int
    current_attack_path: ap.AttackPathResult
    simulated_attack_path: ap.AttackPathResult
    var_distribution: vs.VarSimulationResult


def _apply_control_set_to_findings(findings: list[dict], control_keys: list[str]) -> list[dict]:
    """Returns a COPY of `findings` with `financialImpact` recomputed under
    `control_keys` — respecting each finding's own attack_class exactly as
    pipeline_integration.compute_finding_risk does. This IS "the remaining
    process for this simulation" — not a UI-side approximation of it.

    Impact (criticality-scaled dollar severity) doesn't change when
    controls change, only likelihood does, so the new EAL is re-derived
    from the finding's OWN original EAL/likelihood ratio
    (financial_model.compute_eal is exactly `likelihood * impact.total_usd`
    — linear — so this ratio is exact, not an approximation) rather than
    re-running the full business-criticality/CVSS pipeline a second time,
    which would need the original AssetContext/VulnerabilityContext this
    function doesn't have.

    Findings with no financialImpact (pricing failed/disabled originally)
    pass through unchanged — there's no pre-control likelihood to
    re-derive a simulated one from.
    """
    out: list[dict] = []
    for f in findings:
        fi = f.get("financialImpact")
        if not fi:
            out.append(f)
            continue
        pre_likelihood = fi.get("preControlLikelihood")
        if pre_likelihood is None:
            out.append(f)
            continue
        telemetry_mult = fi.get("telemetryLikelihoodMultiplier", 1.0)
        attack_class = fi.get("attackClass")
        adjusted = min(pre_likelihood * telemetry_mult, 1.0)
        control_result, _ = ce.apply_controls(adjusted, control_keys, attack_class)

        original_post_likelihood = fi.get("postControlLikelihood") or 0.0
        original_eal = fi.get("expectedAnnualLossUsd") or 0.0
        implied_impact = (original_eal / original_post_likelihood) if original_post_likelihood else 0.0
        new_eal = control_result.post_control_likelihood * implied_impact

        new_fi = dict(fi)
        new_fi["postControlLikelihood"] = round(control_result.post_control_likelihood, 4)
        new_fi["expectedAnnualLossUsd"] = round(new_eal, 2)
        new_fi["appliedControls"] = control_result.applied_controls
        new_f = dict(f)
        new_f["financialImpact"] = new_fi
        out.append(new_f)
    return out


async def run_simulation(
    db,
    organization_id: str,
    findings: list[dict],
    candidates: list[opt.InvestmentOption],
    budget_usd: int,
    baseline_control_keys: list[str],
) -> SimulationResult:
    """CURRENT (findings priced under baseline_control_keys — whatever's
    already active, same as a normal scan) vs SIMULATED (findings re-priced
    under baseline_control_keys + whatever the budget-constrained optimizer
    selects from `candidates`)."""
    optimize_result, _ = opt.optimize_investment(candidates, budget_usd)
    selected_keys = [o.key for o in optimize_result.selected]
    combined_keys = list(dict.fromkeys(baseline_control_keys + selected_keys))  # dedupe, preserve order

    current_findings = _apply_control_set_to_findings(findings, baseline_control_keys)
    simulated_findings = _apply_control_set_to_findings(findings, combined_keys)

    current_eal = sum((f.get("financialImpact") or {}).get("expectedAnnualLossUsd", 0.0) for f in current_findings)
    simulated_eal = sum((f.get("financialImpact") or {}).get("expectedAnnualLossUsd", 0.0) for f in simulated_findings)
    current_var, _ = fm.compute_var(current_eal)
    simulated_var, _ = fm.compute_var(simulated_eal)

    current_score = _risk_score(current_findings, "postControlLikelihood")
    simulated_score = _risk_score(simulated_findings, "postControlLikelihood")

    reduction_pct = ((current_eal - simulated_eal) / current_eal) if current_eal else 0.0
    var_dist, _ = await vs.simulate_var(db, organization_id, simulated_eal)

    unevidenced = sum(
        1 for o in candidates
        if o.confidence == "unspecified" or o.evidence_source == "unspecified"
    )

    return SimulationResult(
        current_risk_score=current_score,
        simulated_risk_score=simulated_score,
        current_eal_usd=round(current_eal, 2),
        simulated_eal_usd=round(simulated_eal, 2),
        current_var95_usd=round(current_var, 2),
        simulated_var95_usd=round(simulated_var, 2),
        risk_reduction_pct=round(reduction_pct, 4),
        eal_reduction_usd=round(current_eal - simulated_eal, 2),
        selected_controls=optimize_result.selected,
        total_cost_usd=optimize_result.total_cost_usd,
        budget_utilization_pct=optimize_result.budget_utilization_pct,
        unevidenced_candidate_count=unevidenced,
        current_attack_path=ap.build_attack_path(current_findings),
        simulated_attack_path=ap.build_attack_path(simulated_findings),
        var_distribution=var_dist,
    )


def _critical_attack_classes(findings: list[dict]) -> set[str]:
    return {
        (f.get("financialImpact") or {}).get("attackClass")
        for f in findings
        if str(f.get("severity", "")).upper() == "CRITICAL" and (f.get("financialImpact") or {}).get("attackClass")
    } - {"unclassified", None}


def _critical_only_budget(findings: list[dict], candidates: list[opt.InvestmentOption]) -> int:
    """Budget = total cost of every candidate genuinely applicable to at
    least one attack class actually present among this scan's CRITICAL-
    severity findings (via the same CONTROL_APPLICABLE_ATTACK_CLASSES
    registry apply_controls() itself uses) — a real, derived "patch the
    criticals" budget tier, not an arbitrary round number."""
    critical_classes = _critical_attack_classes(findings)
    if not critical_classes:
        return 0
    total = 0
    for c in candidates:
        scope = ds.CONTROL_APPLICABLE_ATTACK_CLASSES.get(c.key, "*")
        if scope == "*" or (isinstance(scope, set) and scope & critical_classes):
            total += c.cost_usd
    return total


async def scenario_tiers(
    db,
    organization_id: str,
    findings: list[dict],
    candidates: list[opt.InvestmentOption],
    baseline_control_keys: list[str],
    recommended_budget_usd: int,
) -> dict[str, SimulationResult]:
    """The "Current / Patch Criticals / Recommended / Maximum" comparison
    table. Each tier is the SAME run_simulation() at a different budget —
    "patch_criticals" and "maximum" are both real, derived budgets (see
    _critical_only_budget above and the sum of every candidate's cost,
    respectively), not fabricated round numbers picked to look good.
    """
    max_budget = sum(c.cost_usd for c in candidates)
    critical_budget = _critical_only_budget(findings, candidates)
    return {
        "current": await run_simulation(db, organization_id, findings, candidates, 0, baseline_control_keys),
        "patch_criticals": await run_simulation(db, organization_id, findings, candidates, critical_budget, baseline_control_keys),
        "recommended": await run_simulation(db, organization_id, findings, candidates, recommended_budget_usd, baseline_control_keys),
        "maximum": await run_simulation(db, organization_id, findings, candidates, max_budget, baseline_control_keys),
    }


async def what_if_exclude(
    db,
    organization_id: str,
    findings: list[dict],
    candidates: list[opt.InvestmentOption],
    budget_usd: int,
    baseline_control_keys: list[str],
    excluded_control_keys: list[str],
) -> SimulationResult:
    """"What if we don't deploy X" — re-runs the simulation with the named
    candidate(s) removed from the optimizer's INPUT set entirely (not
    merely unselected), so the optimizer is free to reallocate that
    budget elsewhere rather than just leaving it unspent."""
    filtered = [c for c in candidates if c.key not in excluded_control_keys]
    return await run_simulation(db, organization_id, findings, filtered, budget_usd, baseline_control_keys)


# ---------------------------------------------------------------------------
# Default candidate control set — used when a caller doesn't supply their
# own. Costs are illustrative placeholders (same posture as
# InvestmentOptimizer.tsx's frontend defaults) an org is expected to edit
# to its own quoted figures; evidence_source/confidence per candidate
# mirror data_sources.CONTROL_LIKELIHOOD_REDUCTION's own real tier for
# that control's EFFECTIVENESS figure — MFA is empirical there, so it's
# tagged empirical here too; the others are illustrative there, so
# illustrative here.
# ---------------------------------------------------------------------------

DEFAULT_CANDIDATE_CONTROLS: list[opt.InvestmentOption] = [
    opt.InvestmentOption(
        key="mfa_credential_attacks", label="Enable MFA", cost_usd=150_000, risk_reduction_usd=0,
        evidence_source="control_effectiveness.marginal_risk_reduction_usd() — cited MFA efficacy factor",
        confidence="empirical", implementation_time_days=14,
    ),
    opt.InvestmentOption(
        key="waf", label="Deploy WAF", cost_usd=300_000, risk_reduction_usd=0,
        evidence_source="unspecified — edit before relying on this figure", confidence="illustrative",
        implementation_time_days=21,
    ),
    opt.InvestmentOption(
        key="edr_endpoint_detection", label="Deploy EDR", cost_usd=350_000, risk_reduction_usd=0,
        evidence_source="control_effectiveness.marginal_risk_reduction_usd() — cited EDR efficacy factor",
        confidence="empirical", implementation_time_days=45,
    ),
    opt.InvestmentOption(
        key="network_segmentation", label="Network Segmentation", cost_usd=400_000, risk_reduction_usd=0,
        evidence_source="unspecified — edit before relying on this figure", confidence="illustrative",
        implementation_time_days=60,
    ),
    opt.InvestmentOption(
        key="critical_patch_sla_7d", label="7-day Critical Patch SLA", cost_usd=120_000, risk_reduction_usd=0,
        evidence_source="data_sources.py critical_patch_sla_7d — directionally informed by Verizon DBIR, not a measured causal effect",
        confidence="illustrative", implementation_time_days=7,
    ),
]


def price_default_candidates(findings: list[dict], baseline_control_keys: list[str]) -> list[opt.InvestmentOption]:
    """Fills in each DEFAULT_CANDIDATE_CONTROLS entry's risk_reduction_usd
    with a REAL figure — the actual portfolio-wide EAL reduction from
    adding that one control on top of baseline_control_keys, summed across
    every real finding in this scan (via
    control_effectiveness.marginal_risk_reduction_usd(), attack-class-aware
    per finding) — replacing the placeholder 0 the constants above ship
    with. A candidate whose risk_reduction_usd comes out to 0 (e.g. MFA
    against a scan with zero credential-exposure findings) is real
    information: THIS specific control doesn't apply to THIS specific
    scan's actual findings, not a bug.
    """
    priced: list[opt.InvestmentOption] = []
    for candidate in DEFAULT_CANDIDATE_CONTROLS:
        total_reduction = 0.0
        for f in findings:
            fi = f.get("financialImpact") or {}
            pre_likelihood = fi.get("preControlLikelihood")
            if pre_likelihood is None:
                continue
            telemetry_mult = fi.get("telemetryLikelihoodMultiplier", 1.0)
            adjusted = min(pre_likelihood * telemetry_mult, 1.0)
            original_post_likelihood = fi.get("postControlLikelihood") or 0.0
            original_eal = fi.get("expectedAnnualLossUsd") or 0.0
            implied_impact = (original_eal / original_post_likelihood) if original_post_likelihood else 0.0
            attack_class = fi.get("attackClass")
            try:
                total_reduction += ce.marginal_risk_reduction_usd(
                    adjusted, implied_impact, baseline_control_keys, candidate.key, attack_class,
                )
            except ce.UnknownControlError:
                continue
        priced.append(opt.InvestmentOption(
            key=candidate.key, label=candidate.label, cost_usd=candidate.cost_usd,
            risk_reduction_usd=round(total_reduction),
            evidence_source=candidate.evidence_source, confidence=candidate.confidence,
            implementation_time_days=candidate.implementation_time_days,
        ))
    return priced
