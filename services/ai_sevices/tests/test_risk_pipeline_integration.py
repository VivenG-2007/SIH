import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import business_criticality as bc
from app.services.risk import calibration
from app.services.risk import kev
from app.services.risk import pipeline_integration as rp

ORG = "org-1"


def _finding(severity="MEDIUM", finding_id="f1"):
    return {"id": finding_id, "title": "x", "severity": severity, "file": "a.py", "line": 1, "description": "x"}


async def test_compute_finding_risk_returns_positive_eal_and_var(db):
    result = await rp.compute_finding_risk(db, ORG, _finding("CRITICAL"), "acme/webapp")
    assert result["expectedAnnualLossUsd"] > 0
    assert result["valueAtRisk95Usd"] > result["expectedAnnualLossUsd"]


async def test_higher_severity_yields_higher_eal(db):
    low = await rp.compute_finding_risk(db, ORG, _finding("LOW"), "acme/webapp")
    critical = await rp.compute_finding_risk(db, ORG, _finding("CRITICAL"), "acme/webapp")
    assert critical["expectedAnnualLossUsd"] > low["expectedAnnualLossUsd"]


async def test_unknown_severity_falls_back_to_default_cvss_rather_than_raising(db):
    result = await rp.compute_finding_risk(db, ORG, _finding("SOMETHING_WEIRD"), "acme/webapp")
    assert result["severityMappedToCvss"] == rp.DEFAULT_CVSS
    assert result["expectedAnnualLossUsd"] > 0


async def test_evidence_trail_is_attached_and_serializable(db):
    result = await rp.compute_finding_risk(db, ORG, _finding(), "acme/webapp")
    # 5 trails: business_criticality (default-fallback), impact, likelihood,
    # control, var — see pipeline_integration.compute_finding_risk.
    assert len(result["evidence"]) == 5
    for trail in result["evidence"]:
        assert "explanation" in trail
        assert "data_sources" in trail


async def test_asset_context_note_flags_the_default_business_criticality_gap(db):
    result = await rp.compute_finding_risk(db, ORG, _finding(), "acme/webapp")
    assert result["usedDefaultCriticality"] is True
    assert "No Business Service mapping is registered" in result["assetContextNote"]


async def test_registered_business_mapping_replaces_the_default(db):
    svc = bc.BusinessService(
        service_id="payments", name="Customer Payments", industry="financial_services",
        annual_revenue_usd=50_000_000, revenue_dependency_pct=0.6,
        data_sensitivity="restricted", regulatory_frameworks=["dpdp_act_2023"],
    )
    await bc.register_mapping(db, ORG, bc.AssetBusinessMapping(asset_id="acme/payments-api", business_service=svc))
    result = await rp.compute_finding_risk(db, ORG, _finding(), "acme/payments-api")
    assert result["usedDefaultCriticality"] is False
    assert "registered mapping" in result["assetContextNote"]


async def test_business_mapping_does_not_leak_across_organizations(db):
    svc = bc.BusinessService(
        service_id="payments", name="Customer Payments", industry="financial_services",
        annual_revenue_usd=50_000_000, revenue_dependency_pct=0.6,
        data_sensitivity="restricted", regulatory_frameworks=["dpdp_act_2023"],
    )
    await bc.register_mapping(db, "org-a", bc.AssetBusinessMapping(asset_id="acme/payments-api", business_service=svc))
    result = await rp.compute_finding_risk(db, "org-b", _finding(), "acme/payments-api")
    assert result["usedDefaultCriticality"] is True


async def test_aggregate_portfolio_risk_sums_across_findings(db):
    priced = [
        {"financialImpact": await rp.compute_finding_risk(db, ORG, _finding("HIGH", "f1"), "acme/webapp")},
        {"financialImpact": await rp.compute_finding_risk(db, ORG, _finding("LOW", "f2"), "acme/webapp")},
    ]
    agg = rp.aggregate_portfolio_risk(priced)
    expected_total = (
        priced[0]["financialImpact"]["expectedAnnualLossUsd"]
        + priced[1]["financialImpact"]["expectedAnnualLossUsd"]
    )
    assert agg["totalExpectedAnnualLossUsd"] == pytest.approx(expected_total)
    assert agg["findingsPriced"] == 2


def test_aggregate_portfolio_risk_handles_empty_scan():
    agg = rp.aggregate_portfolio_risk([])
    assert agg["findingsPriced"] == 0
    assert agg["totalExpectedAnnualLossUsd"] == 0.0


async def test_aggregate_portfolio_risk_skips_unpriced_findings(db):
    priced = [
        {"financialImpact": await rp.compute_finding_risk(db, ORG, _finding("HIGH", "f1"), "acme/webapp")},
        {"financialImpact": None},  # e.g. a finding whose pricing failed
    ]
    agg = rp.aggregate_portfolio_risk(priced)
    assert agg["findingsPriced"] == 1


# --- Real org-scoped write authorization -------------------------------------

async def test_user_can_manage_asset_true_when_org_has_scanned_it(db):
    await db.scan_history.insert_one({"scanId": "s1", "organizationId": ORG, "repo": "acme/webapp"})
    assert await rp.user_can_manage_asset(db, ORG, "acme/webapp") is True


async def test_user_can_manage_asset_false_for_a_different_organization(db):
    await db.scan_history.insert_one({"scanId": "s1", "organizationId": "org-a", "repo": "acme/webapp"})
    assert await rp.user_can_manage_asset(db, "org-b", "acme/webapp") is False


async def test_user_can_manage_asset_true_for_any_member_of_the_scanning_org(db):
    # Two different users, same organization — either should be able to
    # manage the asset, matching a real org's shared working pattern.
    await db.scan_history.insert_one({"scanId": "s1", "organizationId": ORG, "ownerId": "user-a", "repo": "acme/webapp"})
    assert await rp.user_can_manage_asset(db, ORG, "acme/webapp") is True


async def test_user_can_manage_asset_fails_closed_on_store_error():
    class _Boom:
        async def find_one(self, *args, **kwargs):
            raise RuntimeError("mongo unavailable")

    class _Db:
        scan_history = _Boom()

        def __getitem__(self, name):
            return _Boom()

    assert await rp.user_can_manage_asset(_Db(), ORG, "acme/webapp") is False


async def test_demo_asset_grant_is_org_scoped_not_global(db):
    assert await rp.user_can_manage_asset(db, "org-a", "acme/payments-api") is False
    await rp.seed_demo_asset_grant(db, "org-a", "acme/payments-api")
    assert await rp.user_can_manage_asset(db, "org-a", "acme/payments-api") is True
    assert await rp.user_can_manage_asset(db, "org-b", "acme/payments-api") is False
    await rp.seed_demo_asset_grant(db, "org-b", "acme/payments-api")
    assert await rp.user_can_manage_asset(db, "org-b", "acme/payments-api") is True


async def test_demo_seed_does_not_grant_non_demo_assets(db):
    await rp.seed_demo_asset_grant(db, ORG, "acme/webapp")
    assert await rp.user_can_manage_asset(db, ORG, "acme/webapp") is False


async def test_authorize_asset_write_seeds_then_allows_demo_asset(db):
    assert await rp.authorize_asset_write(db, ORG, "acme/payments-api") is True
    grant = await db[rp.DEMO_GRANTS_COLLECTION].find_one(
        {"organizationId": ORG, "asset_id": "acme/payments-api"}
    )
    assert grant is not None


# --- CISA KEV integration (SIH follow-up critique #3) -----------------------

async def test_finding_with_no_cve_id_never_matches_kev(db):
    result = await rp.compute_finding_risk(db, ORG, _finding(), "acme/webapp")
    assert result["cveId"] is None
    assert result["kevMatch"] is False


async def test_finding_with_a_kev_listed_cve_gets_the_weaponized_boost(db):
    kev.load_from_json({
        "catalogVersion": "test", "dateReleased": "test",
        "vulnerabilities": [{
            "cveID": "CVE-2021-44228", "vendorProject": "Apache", "product": "Log4j2",
            "vulnerabilityName": "x", "dateAdded": "2021-12-10", "requiredAction": "x",
            "knownRansomwareCampaignUse": "Known",
        }],
    })
    try:
        finding = _finding()
        finding["cveId"] = "CVE-2021-44228"
        no_kev = await rp.compute_finding_risk(db, ORG, _finding(), "acme/webapp")
        with_kev = await rp.compute_finding_risk(db, ORG, finding, "acme/webapp")
        assert with_kev["kevMatch"] is True
        assert with_kev["kevRansomwareAssociated"] is True
        # is_known_exploited + exploit_maturity="weaponized" nudges likelihood up.
        assert with_kev["preControlLikelihood"] > no_kev["preControlLikelihood"]
    finally:
        kev._state = None


async def test_finding_with_unmatched_cve_does_not_get_kev_boost(db):
    kev.load_from_json({"catalogVersion": "test", "dateReleased": "test", "vulnerabilities": []})
    try:
        finding = _finding()
        finding["cveId"] = "CVE-0000-00000"
        result = await rp.compute_finding_risk(db, ORG, finding, "acme/webapp")
        assert result["kevMatch"] is False
    finally:
        kev._state = None


# --- Finding-aware control effectiveness (SIH follow-up critique #4) --------

async def test_attack_class_is_classified_from_category(db):
    finding = _finding()
    finding["category"] = "SQL Injection"
    result = await rp.compute_finding_risk(db, ORG, finding, "acme/webapp")
    assert result["attackClass"] == "sql_injection"


async def test_inapplicable_controls_are_named_when_active_controls_configured(db, monkeypatch):
    monkeypatch.setattr(rp, "_active_controls", lambda: ["mfa_credential_attacks", "waf"])
    finding = _finding()
    finding["category"] = "SQL Injection"
    result = await rp.compute_finding_risk(db, ORG, finding, "acme/webapp")
    assert "mfa_credential_attacks" in result["controlsExcludedAsInapplicable"]
    assert "waf" not in result["controlsExcludedAsInapplicable"]


# --- Calibration prediction auto-logging -------------------------------------

async def test_compute_finding_risk_auto_logs_a_prediction(db):
    result = await rp.compute_finding_risk(db, ORG, _finding(finding_id="f-log-test"), "acme/webapp")
    assert result["predictionId"] == "acme/webapp:f-log-test"
    logged = {p.prediction_id for p in await calibration.list_predictions(db, ORG)}
    assert "acme/webapp:f-log-test" in logged


async def test_finding_with_no_id_does_not_log_a_prediction(db):
    finding = _finding()
    finding["id"] = ""
    result = await rp.compute_finding_risk(db, ORG, finding, "acme/webapp")
    assert result["predictionId"] is None
    assert len(await calibration.list_predictions(db, ORG)) == 0
