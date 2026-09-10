import os
import sys
from unittest.mock import MagicMock

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

if "motor" not in sys.modules:
    try:
        import motor
    except ImportError:
        sys.modules["motor"] = MagicMock()
        sys.modules["motor.motor_asyncio"] = MagicMock()

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


@pytest.mark.asyncio
async def test_tri_model_assessment_orchestration(monkeypatch):
    from app.routers import risk
    from app.services.ai_providers import azure_openai

    async def fake_chat(messages, model=None):
        return {"content": f"Mocked response for {model}", "usage": {"total_tokens": 42}}

    monkeypatch.setattr(azure_openai, "chat", fake_chat)

    res = await risk._run_tri_model_assessment(
        industry="healthcare",
        criticality=0.8,
        severity_counts={"CRITICAL": 2, "HIGH": 4},
        active_control_keys=["mfa_credential_attacks", "edr_endpoint_detection"],
        total_eal=250000.0,
        total_var=950000.0,
    )

    assert "models" in res
    assert "threat_triage" in res["models"]
    assert "financial_strategy" in res["models"]
    assert "technical_verification" in res["models"]
    assert res["models"]["threat_triage"]["status"] == "completed"
    assert res["models"]["financial_strategy"]["status"] == "completed"
    assert res["models"]["technical_verification"]["status"] == "completed"
    assert "underwriter_assessment" in res
    assert "ensemble_verdict" in res


@pytest.mark.asyncio
async def test_risk_nlp_query_endpoint(monkeypatch):
    from app.routers import risk
    from app.services.ai_providers import groq
    from app.core.security import CurrentUser

    async def fake_groq_chat(messages, model=None):
        return {
            "content": "Deploying MFA and EDR reduces expected annual loss by 42%.",
            "provider_used": "groq",
            "model_used": "llama-3.3-70b-versatile",
            "usage": {"total_tokens": 30},
        }

    monkeypatch.setattr(groq, "chat", fake_groq_chat)

    req = risk.RiskNlpQueryRequest(
        query="What is the impact of MFA?",
        industry="technology",
        criticality=0.6,
        total_eal_usd=150000.0,
        total_var95_usd=400000.0,
        severity_counts={"CRITICAL": 1},
        active_controls=["mfa_credential_attacks"],
    )
    user = CurrentUser(user_id="test-user", org_id="test-org", role="admin")
    res = await risk.risk_nlp_query(req, user=user)

    assert "answer" in res
    assert "MFA and EDR" in res["answer"]
    assert res["provider"] == "groq"
    assert "latency_ms" in res


