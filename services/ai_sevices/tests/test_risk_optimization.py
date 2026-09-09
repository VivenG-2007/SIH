import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import optimization as opt


def _opt(key, cost, reduction):
    return opt.InvestmentOption(key=key, label=key, cost_usd=cost, risk_reduction_usd=reduction)


def test_optimizer_picks_best_combination_within_budget():
    # Classic knapsack sanity check: best value combo, not greedy-by-ratio.
    options = [
        _opt("mfa", 25, 60),
        _opt("patching", 35, 70),
        _opt("edr", 20, 30),
    ]
    result, _ = opt.optimize_investment(options, budget_usd=60)
    selected_keys = {o.key for o in result.selected}
    # mfa+edr = 45 cost / 90 reduction; patching+edr = 55/100; mfa+patching = 60/130 (best)
    assert selected_keys == {"mfa", "patching"}
    assert result.total_cost_usd == 60
    assert result.total_risk_reduction_usd == 130


def test_optimizer_never_exceeds_budget():
    options = [_opt("a", 10, 5), _opt("b", 15, 8), _opt("c", 7, 4)]
    result, _ = opt.optimize_investment(options, budget_usd=20)
    assert result.total_cost_usd <= 20


def test_optimizer_empty_options_returns_nothing():
    result, _ = opt.optimize_investment([], budget_usd=100)
    assert result.selected == []
    assert result.total_cost_usd == 0


def test_optimizer_zero_budget_selects_nothing():
    options = [_opt("a", 10, 5)]
    result, _ = opt.optimize_investment(options, budget_usd=0)
    assert result.selected == []


def test_optimizer_rejects_negative_budget():
    with pytest.raises(ValueError):
        opt.optimize_investment([], budget_usd=-1)


def test_investment_option_evidence_fields_default_to_unspecified_illustrative():
    o = opt.InvestmentOption(key="a", label="A", cost_usd=10, risk_reduction_usd=5)
    assert o.evidence_source == "unspecified"
    assert o.confidence == "illustrative"
    assert o.applicable_asset_ids == []
    assert o.implementation_time_days is None


def test_optimizer_trail_flags_unevidenced_candidates():
    evidenced = opt.InvestmentOption(
        key="mfa", label="MFA", cost_usd=25, risk_reduction_usd=60,
        evidence_source="control_effectiveness.marginal_risk_reduction_usd()", confidence="empirical",
    )
    unevidenced = opt.InvestmentOption(key="edr", label="EDR", cost_usd=20, risk_reduction_usd=30)
    _, trail = opt.optimize_investment([evidenced, unevidenced], budget_usd=60)
    assert "edr" in trail.explanation
    assert "no evidence_source" in trail.explanation


def test_optimizer_trail_notes_when_every_candidate_is_evidenced():
    evidenced = opt.InvestmentOption(
        key="mfa", label="MFA", cost_usd=25, risk_reduction_usd=60,
        evidence_source="control_effectiveness.marginal_risk_reduction_usd()", confidence="empirical",
    )
    _, trail = opt.optimize_investment([evidenced], budget_usd=60)
    assert "Every candidate carries an evidence_source" in trail.explanation


# --- ROI (SIH follow-up critique #8) ----------------------------------------

def test_roi_is_reduction_over_cost():
    o = opt.InvestmentOption(key="mfa", label="MFA", cost_usd=80_000, risk_reduction_usd=1_400_000)
    assert o.roi == pytest.approx(17.5)


def test_roi_is_none_for_free_candidate():
    o = opt.InvestmentOption(key="free", label="Free control", cost_usd=0, risk_reduction_usd=100)
    assert o.roi is None


def test_rank_by_roi_sorts_descending():
    low = opt.InvestmentOption(key="low", label="Low ROI", cost_usd=250_000, risk_reduction_usd=900_000)   # 3.6x
    high = opt.InvestmentOption(key="high", label="High ROI", cost_usd=80_000, risk_reduction_usd=1_400_000)  # 17.5x
    ranked = opt.rank_by_roi([low, high])
    assert [o.key for o in ranked] == ["high", "low"]


def test_rank_by_roi_puts_undefined_roi_last():
    free = opt.InvestmentOption(key="free", label="Free", cost_usd=0, risk_reduction_usd=100)
    paid = opt.InvestmentOption(key="paid", label="Paid", cost_usd=10, risk_reduction_usd=50)
    ranked = opt.rank_by_roi([free, paid])
    assert ranked[-1].key == "free"


def test_optimizer_rejects_negative_cost_or_reduction():
    with pytest.raises(ValueError):
        opt.optimize_investment([_opt("a", -5, 10)], budget_usd=100)


def test_optimizer_is_exact_not_greedy():
    # Greedy-by-ratio would pick "small" (ratio 10) first, filling budget
    # with 2x small = cost 20, reduction 200. But two "medium" items are
    # strictly better: cost 20, reduction 240. An exact solver must find
    # the 240 solution; a naive greedy-by-ratio implementation would not.
    options = [
        _opt("small", 10, 100),
        _opt("medium", 10, 120),
    ]
    result, _ = opt.optimize_investment(options, budget_usd=20)
    assert result.total_risk_reduction_usd == 220  # both fit exactly
    assert {o.key for o in result.selected} == {"small", "medium"}


def test_evidence_trail_lists_all_candidates_considered():
    options = [_opt("a", 10, 5), _opt("b", 15, 8)]
    _, trail = opt.optimize_investment(options, budget_usd=25)
    assert len(trail.inputs["candidates"]) == 2
