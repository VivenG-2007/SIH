import os
import random

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import dependency_graph as dg
from app.services.risk import ingestion
from app.services.risk import optimization as opt
from app.services.risk import scenario


ORG = "org-1"


def _controls():
    return [
        opt.InvestmentOption(
            key="mfa_credential_attacks", label="MFA rollout", cost_usd=25_000, risk_reduction_usd=2_200_000,
            evidence_source="control_effectiveness.marginal_risk_reduction_usd()", confidence="empirical",
        ),
        opt.InvestmentOption(
            key="edr_endpoint_detection", label="EDR", cost_usd=35_000, risk_reduction_usd=1_400_000,
            evidence_source="vendor quote 2026-01", confidence="illustrative",
        ),
    ]


async def test_scenario_produces_ten_ordered_steps(db):
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="financial_services",
        cvss=8.5,
        business_mapping=None,
        default_criticality=0.6,
        threat_source="threat_intel",
        proposed_controls=_controls(),
        budget_usd=30_000,
        rng=random.Random(42),
    )
    step_numbers = [s.step for s in trace.steps]
    assert step_numbers == sorted(step_numbers)
    titles = [s.title for s in trace.steps]
    assert "Threat Event" in titles
    assert "Risk Decreases" in titles


async def test_scenario_eal_decreases_after_control_deployment(db):
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="financial_services",
        cvss=9.0,
        business_mapping=None,
        default_criticality=0.8,
        threat_source="threat_intel",
        proposed_controls=_controls(),
        budget_usd=25_000,  # only enough for MFA alone
        rng=random.Random(1),
    )
    before_step = next(s for s in trace.steps if s.title == "Financial Exposure Increases")
    after_step = next(s for s in trace.steps if s.title == "Scenario Recalculation")
    assert after_step.data["expected_annual_loss_usd"] < before_step.data["expected_annual_loss_usd"]


async def test_scenario_zero_budget_still_completes_with_no_controls_selected(db):
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="technology",
        cvss=5.0,
        business_mapping=None,
        default_criticality=0.5,
        threat_source="edr",
        proposed_controls=_controls(),
        budget_usd=0,
        rng=random.Random(2),
    )
    optimize_step = next(s for s in trace.steps if s.title.startswith("What-If"))
    assert optimize_step.data["selected_controls"] == []


async def test_scenario_with_graph_reports_affected_business_services(db):
    graph = dg.build_demo_graph()
    threat_id = dg.node_id("threat", "credential-stuffing-campaign")
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="financial_services",
        cvss=8.0,
        business_mapping=None,
        default_criticality=0.6,
        threat_source="threat_intel",
        proposed_controls=_controls(),
        budget_usd=30_000,
        graph=graph,
        threat_node_id=threat_id,
        rng=random.Random(5),
    )
    asset_step = next(s for s in trace.steps if s.title == "Asset Affected")
    assert len(asset_step.data["affected_business_services"]) == 1


async def test_build_ai_narration_prompt_never_asks_the_model_to_compute(db):
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="technology",
        cvss=6.0,
        business_mapping=None,
        default_criticality=0.5,
        threat_source="siem",
        proposed_controls=_controls(),
        budget_usd=25_000,
        rng=random.Random(9),
    )
    prompt = scenario.build_ai_narration_prompt(trace.steps)
    assert "Do NOT invent" in prompt
    assert "Step 1" in prompt


async def test_to_dict_is_json_serializable_shape(db):
    trace = await scenario.run_scenario(
        db=db,
        organization_id=ORG,
        asset_id="acme/payments-api",
        industry="technology",
        cvss=6.0,
        business_mapping=None,
        default_criticality=0.5,
        threat_source="siem",
        proposed_controls=_controls(),
        budget_usd=25_000,
        rng=random.Random(11),
    )
    d = trace.to_dict()
    assert d["asset_id"] == "acme/payments-api"
    assert isinstance(d["steps"], list)
    assert all("explanation" in s for s in d["steps"])
