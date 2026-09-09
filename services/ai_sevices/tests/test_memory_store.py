# Unit tests for app/core/memory_store.py — the RAG "Remember"/"Recall"
# pipeline built on top of Chroma Cloud. Covers:
#   - is_enabled() reflects RAG_MEMORY_ENABLED
#   - index_finding: no-ops when disabled or when a finding has no id,
#     otherwise embeds + upserts with the right metadata shape; never raises
#   - record_fix_outcome: updates an existing point's metadata when found,
#     falls back to a fresh upsert (with a freshly embedded vector) when the
#     point wasn't pre-indexed; never raises
#   - _score_results: threshold filtering, hasFix gating, mock-mode score
#     remapping, and top_k truncation/sorting
#   - retrieve_similar: owner-scoped tier returns first when it has matches,
#     otherwise falls back to the community tier; returns [] when disabled,
#     when the collection is empty, or on any unexpected error

import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.core import memory_store


class _FakeSettings:
    rag_memory_enabled = True
    embedding_provider = "azure_openai"  # non-mock so MIN_SIMILARITY_THRESHOLD applies


def _settings(**overrides):
    s = _FakeSettings()
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


class _FakeCollection:
    """Minimal stand-in for a Chroma Collection. Storage-backed for
    upsert/get/update so index_finding + record_fix_outcome can be tested
    against real state transitions; query() is driven by a per-test handler
    since retrieve_similar's tiered where-clause fallback needs precise
    control over what each attempt returns."""

    def __init__(self, query_handler=None, count_value=5):
        self.store: dict[str, dict] = {}
        self.query_calls: list[dict] = []
        self._query_handler = query_handler
        self._count_value = count_value

    def upsert(self, ids, embeddings, metadatas):
        for doc_id, meta in zip(ids, metadatas):
            self.store[doc_id] = dict(meta)

    def update(self, ids, metadatas):
        for doc_id, meta in zip(ids, metadatas):
            self.store[doc_id] = dict(meta)

    def get(self, ids, include=None):
        metadatas = [self.store[i] for i in ids if i in self.store]
        return {"metadatas": metadatas}

    def count(self):
        return self._count_value

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        if self._query_handler is None:
            return {"metadatas": [[]], "distances": [[]]}
        return self._query_handler(kwargs, len(self.query_calls))


async def _fake_get_collection_factory(collection):
    async def _fake_get_collection():
        return collection

    return _fake_get_collection


# ──────────────────────── is_enabled ────────────────────────

def test_is_enabled_reflects_settings(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(rag_memory_enabled=True))
    assert memory_store.is_enabled() is True
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(rag_memory_enabled=False))
    assert memory_store.is_enabled() is False


# ──────────────────────── index_finding ────────────────────────

@pytest.mark.asyncio
async def test_index_finding_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(rag_memory_enabled=False))
    collection = _FakeCollection()
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    await memory_store.index_finding("owner-1", "scan-1", "org/repo", {"id": "f1", "title": "SQLi"})

    assert collection.store == {}


@pytest.mark.asyncio
async def test_index_finding_noop_without_finding_id(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    collection = _FakeCollection()
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    await memory_store.index_finding("owner-1", "scan-1", "org/repo", {"title": "SQLi"})  # no "id"

    assert collection.store == {}


@pytest.mark.asyncio
async def test_index_finding_upserts_with_expected_metadata(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(embedding_provider="mock"))
    collection = _FakeCollection()
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    finding = {
        "id": "f1",
        "title": "SQL Injection",
        "category": "SQL Injection",
        "severity": "high",
        "file": "app.py",
        "description": "string concatenation in query",
    }
    await memory_store.index_finding("owner-1", "scan-1", "org/repo", finding)

    assert "scan-1:f1" in collection.store
    meta = collection.store["scan-1:f1"]
    assert meta["ownerId"] == "owner-1"
    assert meta["scanId"] == "scan-1"
    assert meta["findingId"] == "f1"
    assert meta["repo"] == "org/repo"
    assert meta["title"] == "SQL Injection"
    assert meta["hasFix"] is False


@pytest.mark.asyncio
async def test_index_finding_never_raises_on_embed_failure(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    async def _boom(text):
        raise RuntimeError("embedding service down")

    monkeypatch.setattr(memory_store.embeddings, "embed", _boom)

    # Should swallow the error and simply not index — never propagate.
    await memory_store.index_finding("owner-1", "scan-1", "org/repo", {"id": "f1", "title": "x"})


# ──────────────────────── record_fix_outcome ────────────────────────

@pytest.mark.asyncio
async def test_record_fix_outcome_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(rag_memory_enabled=False))
    collection = _FakeCollection()
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    await memory_store.record_fix_outcome("scan-1", "f1", "Fixed via parameterized query", True, "rescan")

    assert collection.store == {}


@pytest.mark.asyncio
async def test_record_fix_outcome_updates_existing_point(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    collection = _FakeCollection()
    collection.store["scan-1:f1"] = {
        "ownerId": "owner-1", "scanId": "scan-1", "findingId": "f1",
        "title": "SQLi", "hasFix": False,
    }
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    await memory_store.record_fix_outcome("scan-1", "f1", "Parameterized the query", True, "rescan")

    meta = collection.store["scan-1:f1"]
    assert meta["hasFix"] is True
    assert meta["fixSummary"] == "Parameterized the query"
    assert meta["fixVerified"] is True
    assert meta["fixVerificationMethod"] == "rescan"
    # Original metadata preserved, not clobbered.
    assert meta["title"] == "SQLi"


@pytest.mark.asyncio
async def test_record_fix_outcome_upserts_when_point_missing(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(embedding_provider="mock"))
    collection = _FakeCollection()  # empty — point was never pre-indexed
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    await memory_store.record_fix_outcome(
        "scan-2", "f9", "Escaped output", True, "rescan",
        finding={"title": "XSS", "category": "XSS", "severity": "medium", "file": "views.py"},
        owner_id="owner-2", repo="org/repo2",
    )

    assert "scan-2:f9" in collection.store
    meta = collection.store["scan-2:f9"]
    assert meta["hasFix"] is True
    assert meta["fixSummary"] == "Escaped output"
    assert meta["ownerId"] == "owner-2"
    assert meta["title"] == "XSS"


@pytest.mark.asyncio
async def test_record_fix_outcome_never_raises_on_failure(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    async def _boom():
        raise RuntimeError("chroma unreachable")

    monkeypatch.setattr(memory_store.chroma_client, "get_collection", _boom)

    # Should swallow the error, not propagate to the caller (fix pipeline
    # must never fail because memory recording failed).
    await memory_store.record_fix_outcome("scan-1", "f1", "summary", True, "rescan")


# ──────────────────────── _score_results ────────────────────────

def test_score_results_filters_items_without_a_fix():
    metadatas = [{"hasFix": False, "title": "no fix yet"}]
    distances = [0.1]
    items = memory_store._score_results(metadatas, distances, source="owner", top_k=3)
    assert items == []


def test_score_results_filters_below_threshold(monkeypatch):
    # Non-mock provider so the real MIN_SIMILARITY_THRESHOLD gate applies
    # instead of _score_results' mock-mode score remapping.
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    # distance 0.9 -> similarity 0.1, well under MIN_SIMILARITY_THRESHOLD (0.35)
    metadatas = [{"hasFix": True, "title": "weak match", "fixSummary": "x"}]
    distances = [0.9]
    items = memory_store._score_results(metadatas, distances, source="owner", top_k=3)
    assert items == []


def test_score_results_keeps_items_above_threshold_and_sorts_desc(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    metadatas = [
        {"hasFix": True, "title": "weaker match", "fixSummary": "a"},
        {"hasFix": True, "title": "stronger match", "fixSummary": "b"},
    ]
    distances = [0.5, 0.1]  # similarities: 0.5, 0.9
    items = memory_store._score_results(metadatas, distances, source="community", top_k=3)
    assert [i["title"] for i in items] == ["stronger match", "weaker match"]
    assert items[0]["similarity"] == 0.9
    assert items[0]["source"] == "community"


def test_score_results_respects_top_k(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    metadatas = [{"hasFix": True, "title": f"match {i}", "fixSummary": "x"} for i in range(5)]
    distances = [0.1] * 5
    items = memory_store._score_results(metadatas, distances, source="owner", top_k=2)
    assert len(items) == 2


# ──────────────────────── retrieve_similar ────────────────────────

@pytest.mark.asyncio
async def test_retrieve_similar_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings(rag_memory_enabled=False))
    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"})
    assert result == []


@pytest.mark.asyncio
async def test_retrieve_similar_empty_collection_returns_empty(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())
    collection = _FakeCollection(count_value=0)
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"})
    assert result == []
    assert collection.query_calls == []  # never even queries an empty collection


@pytest.mark.asyncio
async def test_retrieve_similar_returns_owner_tier_when_it_matches(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    def handler(kwargs, call_num):
        if kwargs.get("where") and "ownerId" in str(kwargs["where"]):
            return {
                "metadatas": [[{"hasFix": True, "title": "owner match", "fixSummary": "x", "ownerId": "owner-1"}]],
                "distances": [[0.1]],
            }
        raise AssertionError("community tier should not be queried when owner tier succeeds")

    collection = _FakeCollection(query_handler=handler)
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"}, top_k=3)

    assert len(result) == 1
    assert result[0]["source"] == "owner"
    assert result[0]["title"] == "owner match"
    assert len(collection.query_calls) == 1  # first where_clause attempt already matched


@pytest.mark.asyncio
async def test_retrieve_similar_falls_back_to_community_tier(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    def handler(kwargs, call_num):
        where = kwargs.get("where")
        if where and "ownerId" in str(where):
            return {"metadatas": [[]], "distances": [[]]}  # owner tier: no matches
        return {
            "metadatas": [[{"hasFix": True, "title": "community match", "fixSummary": "y"}]],
            "distances": [[0.15]],
        }

    collection = _FakeCollection(query_handler=handler)
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"}, top_k=3)

    assert len(result) == 1
    assert result[0]["source"] == "community"
    assert result[0]["title"] == "community match"


@pytest.mark.asyncio
async def test_retrieve_similar_no_owner_id_skips_straight_to_community(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    def handler(kwargs, call_num):
        assert "ownerId" not in str(kwargs.get("where"))
        return {
            "metadatas": [[{"hasFix": True, "title": "community only", "fixSummary": "z"}]],
            "distances": [[0.2]],
        }

    collection = _FakeCollection(query_handler=handler)
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    result = await memory_store.retrieve_similar("", {"id": "f1", "title": "SQLi"}, top_k=3)

    assert len(result) == 1
    assert result[0]["source"] == "community"


@pytest.mark.asyncio
async def test_retrieve_similar_returns_empty_when_nothing_clears_threshold(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    def handler(kwargs, call_num):
        # Every tier returns only weak, below-threshold matches.
        return {
            "metadatas": [[{"hasFix": True, "title": "weak", "fixSummary": "x"}]],
            "distances": [[0.9]],
        }

    collection = _FakeCollection(query_handler=handler)
    monkeypatch.setattr(memory_store.chroma_client, "get_collection", await _fake_get_collection_factory(collection))

    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"}, top_k=3)
    assert result == []


@pytest.mark.asyncio
async def test_retrieve_similar_never_raises_on_unexpected_error(monkeypatch):
    monkeypatch.setattr(memory_store, "get_settings", lambda: _settings())

    async def _boom():
        raise RuntimeError("chroma cloud timeout")

    monkeypatch.setattr(memory_store.chroma_client, "get_collection", _boom)

    result = await memory_store.retrieve_similar("owner-1", {"id": "f1", "title": "SQLi"})
    assert result == []
