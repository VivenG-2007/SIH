import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import optimization as opt
from app.services.risk import pipeline_integration as rp
from app.services.risk import simulation as sim

ORG = "org-1"


async def _real_findings(db):
    """Real finding dicts, produced by the actual pricing pipeline — not
    hand-constructed — so these tests exercise the real contract
    simulation.py depends on. Mirrors exactly how routers/scanner.py
    attaches this: `finding["financialImpact"] = compute_finding_risk(...)`
    — a NESTED key, not a flat merge.
    """
    raw = [
        {"id": "f1", "severity": "CRITICAL", "category": "SQL Injection", "title": "x", "file": "x", "line": 1, "description": "x"},
        {"id": "f2", "severity": "HIGH", "category": "Hardcoded Credentials", "title": "x", "file": "x", "line": 2, "description": "x"},
        {"id": "f3", "severity": "MEDIUM", "category": "Cross-Site Scripting", "title": "x", "file": "x", "line": 3, "description": "x"},
    ]
    out = []
    for f in raw:
        finding = dict(f)
        finding["financialImpact"] = await rp.compute_finding_risk(db, ORG, f, "acme/webapp")
        out.append(finding)
    return out


def _candidates():
    return [
        opt.InvestmentOption(key="mfa_credential_attacks", label="MFA", cost_usd=150_000, risk_reduction_usd=0,
                              evidence_source="empirical study", confidence="empirical"),
        opt.InvestmentOption(key="waf", label="WAF", cost_usd=300_000, risk_reduction_usd=0,
                              evidence_source="unspecified", confidence="illustrative"),
    ]


async def test_run_simulation_reduces_eal_with_enough_budget(db):
    findings = await _real_findings(db)
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=500_000, baseline_control_keys=[])
    assert result.simulated_eal_usd <= result.current_eal_usd


async def test_run_simulation_with_zero_budget_selects_nothing_and_changes_nothing(db):
    findings = await _real_findings(db)
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=0, baseline_control_keys=[])
    assert result.selected_controls == []
    assert result.simulated_eal_usd == pytest.approx(result.current_eal_usd)


async def test_risk_score_is_between_zero_and_hundred(db):
    findings = await _real_findings(db)
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=200_000, baseline_control_keys=[])
    assert 0 <= result.current_risk_score <= 100
    assert 0 <= result.simulated_risk_score <= 100


async def test_risk_score_is_zero_for_empty_findings(db):
    result = await sim.run_simulation(db, ORG, [], _candidates(), budget_usd=100_000, baseline_control_keys=[])
    assert result.current_risk_score == 0
    assert result.simulated_risk_score == 0


async def test_attack_paths_are_present_on_the_result(db):
    findings = await _real_findings(db)
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=200_000, baseline_control_keys=[])
    assert len(result.current_attack_path.stages) == 4
    assert len(result.simulated_attack_path.stages) == 4


async def test_var_distribution_is_attached(db):
    findings = await _real_findings(db)
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=200_000, baseline_control_keys=[])
    assert result.var_distribution.method == "illustrative_lognormal_fallback"  # no real calibration data in a fresh test


async def test_scenario_tiers_current_has_zero_selected_controls(db):
    findings = await _real_findings(db)
    tiers = await sim.scenario_tiers(db, ORG, findings, _candidates(), baseline_control_keys=[], recommended_budget_usd=300_000)
    assert tiers["current"].selected_controls == []
    assert set(tiers.keys()) == {"current", "patch_criticals", "recommended", "maximum"}


async def test_scenario_tiers_maximum_spends_the_most(db):
    findings = await _real_findings(db)
    tiers = await sim.scenario_tiers(db, ORG, findings, _candidates(), baseline_control_keys=[], recommended_budget_usd=100_000)
    assert tiers["maximum"].total_cost_usd >= tiers["recommended"].total_cost_usd


async def test_patch_criticals_budget_only_funds_controls_applicable_to_critical_findings(db):
    # f1 is a CRITICAL sql_injection finding -> "waf" applies (injection
    # class), "mfa_credential_attacks" does not (no CRITICAL credential
    # finding exists) -> patch_criticals tier should not select MFA.
    findings = await _real_findings(db)
    tiers = await sim.scenario_tiers(db, ORG, findings, _candidates(), baseline_control_keys=[], recommended_budget_usd=100_000)
    selected_keys = {c.key for c in tiers["patch_criticals"].selected_controls}
    assert "mfa_credential_attacks" not in selected_keys


async def test_what_if_exclude_removes_a_candidate_from_consideration_entirely(db):
    findings = await _real_findings(db)
    result = await sim.what_if_exclude(db, ORG, findings, _candidates(), budget_usd=500_000, baseline_control_keys=[], excluded_control_keys=["waf"])
    assert all(c.key != "waf" for c in result.selected_controls)


async def test_price_default_candidates_returns_real_nonzero_reduction_for_applicable_control(db):
    findings = await _real_findings(db)  # includes a credential_exposure finding (f2)
    priced = sim.price_default_candidates(findings, baseline_control_keys=[])
    mfa = next(c for c in priced if c.key == "mfa_credential_attacks")
    assert mfa.risk_reduction_usd > 0


async def test_price_default_candidates_zero_for_inapplicable_control(db):
    # Findings have no lateral-movement/ssrf class, so network segmentation
    # should price out to (near) zero real reduction.
    findings = await _real_findings(db)
    priced = sim.price_default_candidates(findings, baseline_control_keys=[])
    seg = next(c for c in priced if c.key == "network_segmentation")
    assert seg.risk_reduction_usd == 0


async def test_findings_missing_financial_impact_pass_through_unchanged(db):
    findings = [{"id": "f1", "severity": "HIGH"}]  # no financialImpact
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=200_000, baseline_control_keys=[])
    assert result.current_eal_usd == 0
    assert result.simulated_eal_usd == 0


async def test_simulation_does_not_use_another_organizations_calibration_data(db):
    findings = await _real_findings(db)
    # Seed org-other's calibration outcomes; org-1's simulation should
    # still use the illustrative fallback, not org-other's fitted distribution.
    from app.services.risk import calibration as cal
    from app.services.risk import var_simulation as vs
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, "org-other", cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=100_000,
        ))
    result = await sim.run_simulation(db, ORG, findings, _candidates(), budget_usd=200_000, baseline_control_keys=[])
    assert result.var_distribution.method == "illustrative_lognormal_fallback"
