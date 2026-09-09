import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import business_criticality as bc


def _service(**overrides):
    defaults = dict(
        service_id="payments",
        name="Customer Payments",
        industry="financial_services",
        annual_revenue_usd=50_000_000,
        revenue_dependency_pct=0.6,
        data_sensitivity="restricted",
        regulatory_frameworks=["dpdp_act_2023"],
    )
    defaults.update(overrides)
    return bc.BusinessService(**defaults)


def test_no_mapping_falls_back_to_flat_default_and_flags_it():
    result, trail = bc.compute_criticality("repo/none", None, default_criticality=0.42, default_industry="technology")
    assert result.criticality_score == 0.42
    assert result.industry == "technology"
    assert result.used_default is True
    assert "No Business Service mapping" in trail.explanation


def test_mapping_computes_a_real_score_not_the_default():
    svc = _service()
    mapping = bc.AssetBusinessMapping(asset_id="repo/payments", business_service=svc)
    result, trail = bc.compute_criticality("repo/payments", mapping, default_criticality=0.5)
    assert result.used_default is False
    assert result.industry == "financial_services"
    assert result.revenue_at_risk_usd == pytest.approx(30_000_000)
    # restricted data + a cited regulatory framework should push criticality
    # meaningfully above a middling default.
    assert result.criticality_score > 0.5


def test_higher_revenue_dependency_yields_higher_criticality():
    low = _service(revenue_dependency_pct=0.1)
    high = _service(revenue_dependency_pct=0.9)
    low_result, _ = bc.compute_criticality("a", bc.AssetBusinessMapping("a", low), 0.5)
    high_result, _ = bc.compute_criticality("a", bc.AssetBusinessMapping("a", high), 0.5)
    assert high_result.criticality_score > low_result.criticality_score


def test_public_data_sensitivity_scores_lower_than_restricted():
    public = _service(data_sensitivity="public", regulatory_frameworks=[])
    restricted = _service(data_sensitivity="restricted")
    public_result, _ = bc.compute_criticality("a", bc.AssetBusinessMapping("a", public), 0.5)
    restricted_result, _ = bc.compute_criticality("a", bc.AssetBusinessMapping("a", restricted), 0.5)
    assert restricted_result.criticality_score > public_result.criticality_score


def test_unknown_data_sensitivity_raises_rather_than_silently_defaulting():
    svc = _service(data_sensitivity="top-secret-ish")
    mapping = bc.AssetBusinessMapping(asset_id="a", business_service=svc)
    with pytest.raises(bc.UnknownDataSensitivityError):
        bc.compute_criticality("a", mapping, default_criticality=0.5)


def test_criticality_score_never_exceeds_one():
    svc = _service(revenue_dependency_pct=1.0, data_sensitivity="restricted", regulatory_frameworks=["dpdp_act_2023", "gdpr"])
    mapping = bc.AssetBusinessMapping(asset_id="a", business_service=svc)
    result, _ = bc.compute_criticality("a", mapping, default_criticality=0.5)
    assert result.criticality_score <= 1.0


async def test_registry_register_get_list_clear_roundtrip(db):
    org_id = "org-1"
    mapping = bc.AssetBusinessMapping(asset_id="repo/x", business_service=_service())
    await bc.register_mapping(db, org_id, mapping)
    fetched = await bc.get_mapping(db, org_id, "repo/x")
    assert fetched is not None
    assert fetched.asset_id == "repo/x"
    assert fetched.business_service.annual_revenue_usd == mapping.business_service.annual_revenue_usd
    assert len(await bc.list_mappings(db, org_id)) == 1
    await bc.clear_registry(db, org_id)
    assert await bc.get_mapping(db, org_id, "repo/x") is None
    assert await bc.list_mappings(db, org_id) == []


async def test_mappings_are_scoped_by_organization(db):
    mapping = bc.AssetBusinessMapping(asset_id="repo/shared", business_service=_service())
    await bc.register_mapping(db, "org-a", mapping)
    assert await bc.get_mapping(db, "org-a", "repo/shared") is not None
    assert await bc.get_mapping(db, "org-b", "repo/shared") is None


async def test_register_mapping_encrypts_revenue_fields_at_rest(db):
    org_id = "org-1"
    mapping = bc.AssetBusinessMapping(asset_id="repo/x", business_service=_service())
    await bc.register_mapping(db, org_id, mapping)
    raw_doc = await db[bc.COLLECTION].find_one({"organizationId": org_id, "assetId": "repo/x"})
    assert "annualRevenueUsdEncrypted" in raw_doc
    assert str(mapping.business_service.annual_revenue_usd) not in str(raw_doc["annualRevenueUsdEncrypted"])
    # Regulatory frameworks/data sensitivity stay plaintext (queryable classification labels).
    assert raw_doc["dataSensitivity"] == "restricted"


def test_unrecognized_regulatory_framework_is_ignored_not_fatal():
    svc = _service(regulatory_frameworks=["some_made_up_regime"])
    mapping = bc.AssetBusinessMapping(asset_id="a", business_service=svc)
    result, trail = bc.compute_criticality("a", mapping, default_criticality=0.5)
    # Should not raise; unrecognized frameworks just don't contribute to
    # regulatory_exposure_usd.
    assert result.regulatory_exposure_usd == 0.0
