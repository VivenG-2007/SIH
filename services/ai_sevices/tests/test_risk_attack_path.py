import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.services.risk import attack_path as ap


def _finding(severity, attack_class, eal=10_000, finding_id="f1"):
    return {
        "id": finding_id,
        "severity": severity,
        "financialImpact": {"attackClass": attack_class, "expectedAnnualLossUsd": eal},
    }


def test_sql_injection_finding_lands_on_both_entry_and_data_layer_stages():
    findings = [_finding("CRITICAL", "sql_injection")]
    result = ap.build_attack_path(findings)
    stage_ids_with_findings = {s.stage_id for s in result.stages if s.finding_count > 0}
    assert "internet_entry" in stage_ids_with_findings
    assert "data_layer" in stage_ids_with_findings


def test_credential_exposure_only_lands_on_authentication_stage():
    findings = [_finding("HIGH", "credential_exposure")]
    result = ap.build_attack_path(findings)
    hit_stages = {s.stage_id for s in result.stages if s.finding_count > 0}
    assert hit_stages == {"authentication"}


def test_unclassified_findings_are_not_assigned_to_any_stage():
    findings = [_finding("CRITICAL", "unclassified")]
    result = ap.build_attack_path(findings)
    assert all(s.finding_count == 0 for s in result.stages)
    assert result.unclassified_finding_count == 1
    assert result.unclassified_eal_usd == 10_000


def test_stage_status_reflects_highest_severity_present():
    findings = [_finding("LOW", "xss", finding_id="f1"), _finding("CRITICAL", "xss", finding_id="f2")]
    result = ap.build_attack_path(findings)
    entry_stage = next(s for s in result.stages if s.stage_id == "internet_entry")
    assert entry_stage.status == "critical"


def test_empty_stage_has_clear_status():
    result = ap.build_attack_path([])
    assert all(s.status == "clear" for s in result.stages)
    assert all(s.finding_count == 0 for s in result.stages)


def test_findings_with_no_financial_impact_are_skipped_not_guessed_at():
    findings = [{"id": "f1", "severity": "CRITICAL"}]  # no financialImpact key at all
    result = ap.build_attack_path(findings)
    assert all(s.finding_count == 0 for s in result.stages)
    assert result.unclassified_finding_count == 0


def test_eal_sums_correctly_within_a_stage():
    findings = [
        _finding("HIGH", "xss", eal=5_000, finding_id="f1"),
        _finding("HIGH", "sql_injection", eal=7_000, finding_id="f2"),
    ]
    result = ap.build_attack_path(findings)
    entry_stage = next(s for s in result.stages if s.stage_id == "internet_entry")
    assert entry_stage.eal_usd == 12_000
