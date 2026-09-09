import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import financial_model as fm
from app.services.risk import data_sources as ds


def test_compute_impact_scales_with_criticality():
    low = fm.AssetContext(asset_id="a1", industry="healthcare", criticality=0.1)
    high = fm.AssetContext(asset_id="a2", industry="healthcare", criticality=1.0)
    low_impact, _ = fm.compute_impact(low)
    high_impact, _ = fm.compute_impact(high)
    assert high_impact.total_usd > low_impact.total_usd
    # 10x criticality -> ~10x impact (linear scaling, same industry base)
    assert high_impact.total_usd == pytest.approx(low_impact.total_usd * 10, rel=0.01)


def test_compute_impact_unknown_industry_falls_back_to_global_average():
    asset = fm.AssetContext(asset_id="a1", industry="not_a_real_industry", criticality=1.0)
    impact, trail = fm.compute_impact(asset)
    expected_total = ds.INDUSTRY_BREACH_COST_USD["global_average"].value
    assert impact.total_usd == pytest.approx(expected_total, rel=0.01)


def test_compute_impact_automation_discount_reduces_total():
    without_auto = fm.AssetContext(asset_id="a1", industry="technology", criticality=1.0, has_extensive_security_automation=False)
    with_auto = fm.AssetContext(asset_id="a2", industry="technology", criticality=1.0, has_extensive_security_automation=True)
    impact_without, _ = fm.compute_impact(without_auto)
    impact_with, _ = fm.compute_impact(with_auto)
    assert impact_with.total_usd < impact_without.total_usd


def test_impact_breakdown_components_sum_to_total():
    asset = fm.AssetContext(asset_id="a1", industry="financial_services", criticality=0.7)
    impact, _ = fm.compute_impact(asset)
    assert impact.downtime_usd + impact.breach_usd + impact.regulatory_usd + impact.reputation_usd == pytest.approx(impact.total_usd)


def test_regulatory_multiplier_only_affects_regulatory_component():
    base = fm.AssetContext(asset_id="a1", industry="financial_services", criticality=1.0, regulatory_multiplier=1.0)
    boosted = fm.AssetContext(asset_id="a2", industry="financial_services", criticality=1.0, regulatory_multiplier=2.0)
    base_impact, _ = fm.compute_impact(base)
    boosted_impact, _ = fm.compute_impact(boosted)
    assert boosted_impact.regulatory_usd == pytest.approx(base_impact.regulatory_usd * 2)
    assert boosted_impact.downtime_usd == pytest.approx(base_impact.downtime_usd)
    assert boosted_impact.breach_usd == pytest.approx(base_impact.breach_usd)
    assert boosted_impact.reputation_usd == pytest.approx(base_impact.reputation_usd)


def test_compute_likelihood_scales_with_cvss():
    low_cvss = fm.VulnerabilityContext(finding_id="f1", cvss=2.0)
    high_cvss = fm.VulnerabilityContext(finding_id="f2", cvss=9.0)
    low_l, _ = fm.compute_likelihood(low_cvss)
    high_l, _ = fm.compute_likelihood(high_cvss)
    assert high_l > low_l


def test_compute_likelihood_known_exploited_boosts_score():
    normal = fm.VulnerabilityContext(finding_id="f1", cvss=6.0, is_known_exploited=False)
    kev = fm.VulnerabilityContext(finding_id="f2", cvss=6.0, is_known_exploited=True)
    normal_l, _ = fm.compute_likelihood(normal)
    kev_l, _ = fm.compute_likelihood(kev)
    assert kev_l > normal_l


def test_compute_likelihood_capped_at_one():
    maxed = fm.VulnerabilityContext(finding_id="f1", cvss=10.0, is_known_exploited=True, exploit_maturity="weaponized")
    l, _ = fm.compute_likelihood(maxed)
    assert l <= 1.0


def test_compute_eal_is_likelihood_times_impact():
    impact = fm.ImpactBreakdown(downtime_usd=10, breach_usd=20, regulatory_usd=5, reputation_usd=5)
    assert fm.compute_eal(0.5, impact) == 20.0  # 0.5 * 40


def test_compute_var_exceeds_eal_for_positive_volatility():
    var, trail = fm.compute_var(eal=100_000, confidence=0.95, volatility=1.8)
    assert var > 100_000
    assert "ILLUSTRATIVE" in trail.explanation


def test_compute_var_higher_confidence_yields_higher_var():
    var_90, _ = fm.compute_var(eal=100_000, confidence=0.90)
    var_99, _ = fm.compute_var(eal=100_000, confidence=0.99)
    assert var_99 > var_90


def test_impact_evidence_trail_flags_illustrative_split():
    asset = fm.AssetContext(asset_id="a1", industry="healthcare", criticality=1.0)
    _, trail = fm.compute_impact(asset)
    # the industry total is empirical but the category split is not, so the
    # trail as a whole should NOT claim to be fully empirical
    assert trail.data_sources[0]["tier"] == "empirical"
    assert "illustrative" in trail.explanation.lower()
