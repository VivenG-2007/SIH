import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import control_effectiveness as ce


def test_no_controls_leaves_likelihood_unchanged():
    result, trail = ce.apply_controls(0.5, [])
    assert result.post_control_likelihood == 0.5
    assert result.risk_reduction_pct == 0.0


def test_single_control_reduces_likelihood():
    result, _ = ce.apply_controls(0.5, ["mfa_credential_attacks"])
    assert result.post_control_likelihood == pytest.approx(0.5 * (1 - 0.992))
    assert result.risk_reduction_pct == pytest.approx(0.992)


def test_multiple_controls_combine_multiplicatively_not_additively():
    # Two controls each claiming >50% would break an additive model
    # (>100% "reduction"). Multiplicative combination must never go negative.
    result, _ = ce.apply_controls(1.0, ["edr_endpoint_detection", "network_segmentation", "waf"])
    assert result.post_control_likelihood > 0.0
    assert result.post_control_likelihood < 1.0


def test_unknown_control_raises_rather_than_silently_ignoring():
    with pytest.raises(ce.UnknownControlError):
        ce.apply_controls(0.5, ["some_made_up_control_xyz"])


def test_evidence_trail_flags_illustrative_controls():
    _, trail = ce.apply_controls(0.5, ["edr_endpoint_detection"])
    assert trail.has_illustrative_input()


def test_evidence_trail_all_empirical_when_only_mfa_used():
    _, trail = ce.apply_controls(0.5, ["mfa_credential_attacks"])
    assert not trail.has_illustrative_input()


def test_marginal_risk_reduction_usd_is_positive_for_useful_control():
    reduction = ce.marginal_risk_reduction_usd(
        pre_control_likelihood=0.5,
        impact_total_usd=1_000_000,
        already_active=[],
        candidate_control="mfa_credential_attacks",
    )
    assert reduction > 0


def test_marginal_risk_reduction_diminishes_with_more_active_controls():
    # Adding EDR when nothing else is active should reduce more risk (in
    # absolute USD) than adding it on top of controls that already cover
    # much of the same risk — diminishing returns is the whole point of
    # running this through an optimizer rather than picking controls
    # independently.
    first = ce.marginal_risk_reduction_usd(
        pre_control_likelihood=1.0, impact_total_usd=1_000_000,
        already_active=[], candidate_control="edr_endpoint_detection",
    )
    second = ce.marginal_risk_reduction_usd(
        pre_control_likelihood=1.0, impact_total_usd=1_000_000,
        already_active=["mfa_credential_attacks", "waf", "network_segmentation"],
        candidate_control="edr_endpoint_detection",
    )
    assert second < first


# --- Finding-aware attack-class applicability -------------------------------

def test_classify_attack_class_matches_sql_injection():
    assert ce.classify_attack_class("SQL Injection") == "sql_injection"


def test_classify_attack_class_matches_hardcoded_credentials():
    assert ce.classify_attack_class("Hardcoded Credentials") == "credential_exposure"


def test_classify_attack_class_unmatched_category_is_unclassified():
    assert ce.classify_attack_class("Some Brand New Category Nobody Anticipated") == "unclassified"


def test_classify_attack_class_none_is_unclassified():
    assert ce.classify_attack_class(None) == "unclassified"


def test_mfa_does_not_apply_to_sql_injection():
    applicable, excluded = ce.applicable_controls("sql_injection", ["mfa_credential_attacks", "waf"])
    assert "mfa_credential_attacks" in excluded
    assert "waf" in applicable


def test_patch_sla_applies_to_every_attack_class():
    applicable, excluded = ce.applicable_controls("sql_injection", ["critical_patch_sla_7d"])
    assert applicable == ["critical_patch_sla_7d"]
    assert excluded == []


def test_unclassified_only_gets_wildcard_controls_conservative_default():
    applicable, excluded = ce.applicable_controls(
        "unclassified", ["mfa_credential_attacks", "waf", "critical_patch_sla_7d"]
    )
    assert applicable == ["critical_patch_sla_7d"]
    assert set(excluded) == {"mfa_credential_attacks", "waf"}


def test_apply_controls_with_attack_class_excludes_inapplicable_controls_from_reduction():
    # MFA (99.2% cited reduction) should contribute ZERO credit against a
    # SQL injection finding, not its normal factor.
    result, trail = ce.apply_controls(0.5, ["mfa_credential_attacks"], attack_class="sql_injection")
    assert result.post_control_likelihood == 0.5  # unchanged — MFA excluded entirely
    assert "mfa_credential_attacks" in trail.inputs["excluded_as_inapplicable"]


def test_apply_controls_without_attack_class_preserves_old_indiscriminate_behavior():
    # Backward compatibility: omitting attack_class applies every control,
    # exactly as before this feature existed.
    result, _ = ce.apply_controls(0.5, ["mfa_credential_attacks"])
    assert result.post_control_likelihood == pytest.approx(0.5 * (1 - 0.992))


def test_marginal_risk_reduction_usd_respects_attack_class():
    reduction = ce.marginal_risk_reduction_usd(
        pre_control_likelihood=0.5, impact_total_usd=1_000_000,
        already_active=[], candidate_control="mfa_credential_attacks",
        attack_class="sql_injection",
    )
    assert reduction == 0.0
