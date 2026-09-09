import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.routers.search import _mongo_fallback_search


async def test_mongo_fallback_search_only_returns_this_organizations_findings(db, monkeypatch):
    import app.routers.search as search_module
    monkeypatch.setattr(search_module, "get_db", lambda: db)

    await db.scan_history.insert_one({
        "scanId": "s1", "organizationId": "org-a", "repo": "acme/webapp", "scannedAt": "2026-01-01",
        "findings": [{"id": "f1", "title": "SQL Injection", "description": "x", "file": "a.py", "severity": "HIGH"}],
        "fixes": {},
    })
    await db.scan_history.insert_one({
        "scanId": "s2", "organizationId": "org-b", "repo": "other/repo", "scannedAt": "2026-01-01",
        "findings": [{"id": "f2", "title": "SQL Injection", "description": "x", "file": "b.py", "severity": "HIGH"}],
        "fixes": {},
    })

    results_a = await _mongo_fallback_search("org-a", "SQL", None, None, 20)
    results_b = await _mongo_fallback_search("org-b", "SQL", None, None, 20)

    assert len(results_a) == 1
    assert results_a[0]["scanId"] == "s1"
    assert len(results_b) == 1
    assert results_b[0]["scanId"] == "s2"


async def test_mongo_fallback_search_filters_by_severity(db, monkeypatch):
    import app.routers.search as search_module
    monkeypatch.setattr(search_module, "get_db", lambda: db)

    await db.scan_history.insert_one({
        "scanId": "s1", "organizationId": "org-a", "repo": "acme/webapp", "scannedAt": "2026-01-01",
        "findings": [
            {"id": "f1", "title": "Critical bug", "description": "x", "file": "a.py", "severity": "CRITICAL"},
            {"id": "f2", "title": "Minor bug", "description": "x", "file": "a.py", "severity": "LOW"},
        ],
        "fixes": {},
    })

    results = await _mongo_fallback_search("org-a", "", "CRITICAL", None, 20)
    assert len(results) == 1
    assert results[0]["findingId"] == "f1"


async def test_mongo_fallback_search_returns_empty_for_organization_with_no_scans(db, monkeypatch):
    import app.routers.search as search_module
    monkeypatch.setattr(search_module, "get_db", lambda: db)
    results = await _mongo_fallback_search("org-nonexistent", "anything", None, None, 20)
    assert results == []
