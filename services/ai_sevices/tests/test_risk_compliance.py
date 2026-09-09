try:
    import pytest
except ImportError:
    pytest = None
from app.services.risk import compliance


def test_list_frameworks_returns_all_five():
    frameworks = compliance.list_frameworks()
    assert len(frameworks) == 5
    ids = {f["framework_id"] for f in frameworks}
    assert ids == {
        "iso27001",
        "nist_csf",
        "cis_controls",
        "rbi_csf",
        "sebi_cscrf",
    }
    for f in frameworks:
        assert f["total_controls"] > 0
        assert f["name"]


def test_map_findings_standard_categories():
    res = compliance.map_findings(["sql_injection", "hardcoded_secret", "insecure_cors"])
    assert res.mapping_confidence == "directional"
    assert "sql_injection" in res.finding_categories
    assert len(res.frameworks) == 5

    # Check ISO 27001 mapping
    iso = res.frameworks["iso27001"]
    assert iso.matched_control_ids
    assert iso.coverage_pct > 0.0
    assert len(iso.gap_control_ids) + len(iso.matched_control_ids) == iso.total_controls


def test_map_findings_unknown_categories():
    res = compliance.map_findings(["nonexistent_vuln_category_12345"])
    assert "nonexistent_vuln_category_12345" in res.unrecognized_categories
    for f in res.frameworks.values():
        assert f.matched_control_ids == []
        assert f.coverage_pct == 0.0


def test_map_findings_filter_framework_ids():
    res = compliance.map_findings(["sql_injection"], framework_ids=["nist_csf"])
    assert list(res.frameworks.keys()) == ["nist_csf"]
