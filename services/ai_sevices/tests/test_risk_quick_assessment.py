import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import pipeline_integration as rp


def test_quick_assessment_prices_multiple_severity_buckets():
    result = rp.compute_quick_assessment(
        industry="technology",
        criticality=0.7,
        severity_counts={"CRITICAL": 2, "HIGH": 5, "LOW": 10},
        active_control_keys=[],
    )
    assert len(result["buckets"]) == 3
    assert result["totalExpectedAnnualLossUsd"] > 0
    assert result["totalValueAtRisk95Usd"] > result["totalExpectedAnnualLossUsd"]


def test_quick_assessment_scales_with_count():
    single = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"HIGH": 1}, active_control_keys=[],
    )
    tenfold = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"HIGH": 10}, active_control_keys=[],
    )
    assert tenfold["totalExpectedAnnualLossUsd"] == pytest.approx(
        single["totalExpectedAnnualLossUsd"] * 10, rel=0.01
    )


def test_quick_assessment_ignores_zero_and_missing_severities():
    result = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"CRITICAL": 0, "HIGH": 3, "MEDIUM": 0},
        active_control_keys=[],
    )
    assert len(result["buckets"]) == 1
    assert result["buckets"][0]["severity"] == "HIGH"


def test_quick_assessment_skips_unrecognized_severity_key_rather_than_raising():
    result = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"NOT_A_SEVERITY": 5, "LOW": 2},
        active_control_keys=[],
    )
    assert len(result["buckets"]) == 1
    assert result["buckets"][0]["severity"] == "LOW"


def test_quick_assessment_no_findings_returns_zero_not_error():
    result = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"CRITICAL": 0}, active_control_keys=[],
    )
    assert result["totalExpectedAnnualLossUsd"] == 0.0
    assert result["buckets"] == []


def test_quick_assessment_controls_reduce_total():
    without = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"HIGH": 5}, active_control_keys=[],
    )
    with_mfa = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"HIGH": 5}, active_control_keys=["mfa_credential_attacks"],
    )
    assert with_mfa["totalExpectedAnnualLossUsd"] < without["totalExpectedAnnualLossUsd"]


def test_quick_assessment_note_flags_self_reported_input():
    result = rp.compute_quick_assessment(
        industry="technology", criticality=0.5,
        severity_counts={"LOW": 1}, active_control_keys=[],
    )
    assert "self-reported" in result["note"].lower() or "Self-reported" in result["note"]


def test_quick_assessment_unknown_control_raises():
    from app.services.risk import control_effectiveness as ce

    with pytest.raises(ce.UnknownControlError):
        rp.compute_quick_assessment(
            industry="technology", criticality=0.5,
            severity_counts={"LOW": 1}, active_control_keys=["not_a_real_control"],
        )
