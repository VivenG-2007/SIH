import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import kev


_FIXTURE_CATALOG = {
    "catalogVersion": "2026.08.01",
    "dateReleased": "2026-08-01T00:00:00.000Z",
    "vulnerabilities": [
        {
            "cveID": "CVE-2021-44228",
            "vendorProject": "Apache",
            "product": "Log4j2",
            "vulnerabilityName": "Apache Log4j2 Remote Code Execution Vulnerability",
            "dateAdded": "2021-12-10",
            "requiredAction": "Apply updates per vendor instructions.",
            "knownRansomwareCampaignUse": "Known",
        },
        {
            "cveID": "CVE-2023-99999",
            "vendorProject": "ExampleCo",
            "product": "ExampleProduct",
            "vulnerabilityName": "Example Vulnerability",
            "dateAdded": "2023-01-01",
            "requiredAction": "Apply updates.",
            "knownRansomwareCampaignUse": "Unknown",
        },
    ],
}


@pytest.fixture(autouse=True)
def _seed_catalog():
    kev.load_from_json(_FIXTURE_CATALOG)
    yield
    kev._state = None  # reset between tests


def test_lookup_finds_seeded_entry_case_insensitive():
    entry = kev.lookup("cve-2021-44228")
    assert entry is not None
    assert entry.vendor_project == "Apache"


def test_lookup_returns_none_for_unknown_cve():
    assert kev.lookup("CVE-9999-00000") is None


def test_is_known_exploited_true_for_kev_entry():
    assert kev.is_known_exploited("CVE-2021-44228") is True


def test_is_known_exploited_false_for_missing_cve():
    assert kev.is_known_exploited(None) is False
    assert kev.is_known_exploited("") is False


def test_is_ransomware_associated_reflects_real_field():
    assert kev.is_ransomware_associated("CVE-2021-44228") is True
    assert kev.is_ransomware_associated("CVE-2023-99999") is False


def test_data_snapshot_id_reflects_catalog_version():
    assert kev.data_snapshot_id() == "kev:2026.08.01"


def test_last_sync_status_reports_entry_count():
    status = kev.last_sync_status()
    assert status["synced"] is True
    assert status["entry_count"] == 2


def test_last_sync_status_before_any_sync():
    kev._state = None
    status = kev.last_sync_status()
    assert status["synced"] is False


def test_lookup_before_sync_returns_none_not_raises():
    kev._state = None
    assert kev.lookup("CVE-2021-44228") is None
    assert kev.is_known_exploited("CVE-2021-44228") is False


def test_parse_catalog_skips_entries_with_no_cve_id():
    kev.load_from_json({"vulnerabilities": [{"vendorProject": "NoId"}], "catalogVersion": "x", "dateReleased": "x"})
    assert len(kev._state.entries_by_cve) == 0
