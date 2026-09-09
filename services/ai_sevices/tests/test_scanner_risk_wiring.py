import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.routers.scanner import Finding, _attach_financial_impact
from app.config import get_settings

ORG = "org-1"


def _findings():
    return [
        Finding(id="f1", title="SQLi", severity="CRITICAL", file="a.py", line=1, description="x", source="deterministic"),
        Finding(id="f2", title="XSS", severity="LOW", file="b.py", line=2, description="x", source="ai"),
    ]


async def test_attach_financial_impact_prices_every_finding(db):
    findings = _findings()
    summary = await _attach_financial_impact(db, ORG, findings, "acme/webapp")

    assert all(f.financialImpact is not None for f in findings)
    assert summary["findingsPriced"] == 2
    assert summary["totalExpectedAnnualLossUsd"] > 0


async def test_attach_financial_impact_critical_priced_higher_than_low(db):
    findings = _findings()
    await _attach_financial_impact(db, ORG, findings, "acme/webapp")
    critical_eal = findings[0].financialImpact["expectedAnnualLossUsd"]
    low_eal = findings[1].financialImpact["expectedAnnualLossUsd"]
    assert critical_eal > low_eal


async def test_attach_financial_impact_respects_disabled_setting(db, monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("RISK_AUTO_COMPUTE_ENABLED", "false")
    get_settings.cache_clear()
    try:
        findings = _findings()
        summary = await _attach_financial_impact(db, ORG, findings, "acme/webapp")
        assert summary is None
        assert all(f.financialImpact is None for f in findings)
    finally:
        monkeypatch.delenv("RISK_AUTO_COMPUTE_ENABLED", raising=False)
        get_settings.cache_clear()


async def test_attach_financial_impact_isolates_a_single_finding_failure(db, monkeypatch):
    from app.services.risk import pipeline_integration as rp

    findings = _findings()
    original = rp.compute_finding_risk

    async def flaky(db_, org_id, finding, repo_full):
        if finding["id"] == "f1":
            raise RuntimeError("boom")
        return await original(db_, org_id, finding, repo_full)

    monkeypatch.setattr(rp, "compute_finding_risk", flaky)
    # scanner.py imported the module as `risk_pipeline` — patch the same
    # object attribute it calls through.
    from app.routers import scanner as scanner_module
    monkeypatch.setattr(scanner_module.risk_pipeline, "compute_finding_risk", flaky)

    summary = await _attach_financial_impact(db, ORG, findings, "acme/webapp")

    assert findings[0].financialImpact is None   # the one that raised
    assert findings[1].financialImpact is not None  # unaffected
    assert summary["findingsPriced"] == 1
