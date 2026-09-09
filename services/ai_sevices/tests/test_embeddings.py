# Unit tests for app/services/embeddings.py — the embedding provider layer
# for the RAG memory pipeline (app/core/memory_store.py). Covers:
#   - the "mock" provider is deterministic, unit-norm, and dimension-stable
#   - different inputs produce different vectors (not a constant embedding)
#   - the "azure_openai" provider calls the right URL/headers and surfaces a
#     clear error when required settings are missing
#   - embed() dispatches on EMBEDDING_PROVIDER and rejects unknown values
#   - cosine_similarity behaves correctly on identical/orthogonal/empty input

import math
import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest
from fastapi import HTTPException

from app.services import embeddings
from app.services.embeddings import MOCK_EMBEDDING_DIMENSIONS


# ──────────────────────── mock provider ────────────────────────

def test_mock_embed_is_deterministic():
    a = embeddings._mock_embed("SQL injection in login")
    b = embeddings._mock_embed("SQL injection in login")
    assert a == b


def test_mock_embed_has_expected_dimensions():
    vector = embeddings._mock_embed("anything")
    assert len(vector) == MOCK_EMBEDDING_DIMENSIONS


def test_mock_embed_is_unit_norm():
    vector = embeddings._mock_embed("Hardcoded credentials in config.py")
    norm = math.sqrt(sum(v * v for v in vector))
    assert norm == pytest.approx(1.0, abs=1e-6)


def test_mock_embed_differs_for_different_inputs():
    a = embeddings._mock_embed("SQL injection in login")
    b = embeddings._mock_embed("XSS in comment form")
    assert a != b


def test_mock_embed_handles_empty_string():
    # index_finding/_embedding_text already guards against a truly empty
    # string reaching embed(), but the provider itself must not blow up if
    # one arrives (e.g. a future call site that skips that guard).
    vector = embeddings._mock_embed("")
    assert len(vector) == MOCK_EMBEDDING_DIMENSIONS


# ──────────────────────── embed() dispatch ────────────────────────

@pytest.mark.asyncio
async def test_embed_dispatches_to_mock_by_default(monkeypatch):
    settings = embeddings.get_settings()
    monkeypatch.setattr(settings, "embedding_provider", "mock", raising=False)
    monkeypatch.setattr(embeddings, "get_settings", lambda: settings)
    vector = await embeddings.embed("test finding")
    assert vector == embeddings._mock_embed("test finding")


@pytest.mark.asyncio
async def test_embed_rejects_unknown_provider(monkeypatch):
    settings = embeddings.get_settings()
    monkeypatch.setattr(settings, "embedding_provider", "not_a_real_provider", raising=False)
    monkeypatch.setattr(embeddings, "get_settings", lambda: settings)
    with pytest.raises(ValueError):
        await embeddings.embed("test finding")


# ──────────────────────── azure_openai provider ────────────────────────

class _FakeSettings:
    embedding_provider = "azure_openai"
    azure_openai_endpoint = "https://example.openai.azure.com"
    azure_openai_api_key = "test-key"
    ai_api_key = ""
    azure_openai_embedding_deployment = "text-embedding-3-small"
    azure_openai_api_version = "2024-12-01-preview"


@pytest.mark.asyncio
async def test_azure_openai_embed_missing_config_raises_clear_error(monkeypatch):
    settings = _FakeSettings()
    settings.azure_openai_endpoint = ""  # missing required config
    monkeypatch.setattr(embeddings, "get_settings", lambda: settings)
    with pytest.raises(HTTPException) as exc_info:
        await embeddings._azure_openai_embed("some finding text")
    assert "EMBEDDING_PROVIDER=azure_openai" in exc_info.value.detail


@pytest.mark.asyncio
async def test_azure_openai_embed_calls_expected_url_and_parses_response(monkeypatch):
    settings = _FakeSettings()
    monkeypatch.setattr(embeddings, "get_settings", lambda: settings)

    captured = {}

    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": [{"embedding": [0.1, 0.2, 0.3]}]}

    class _FakeAsyncClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _FakeResponse()

    monkeypatch.setattr(embeddings.httpx, "AsyncClient", _FakeAsyncClient)

    vector = await embeddings._azure_openai_embed("finding text")

    assert vector == [0.1, 0.2, 0.3]
    assert captured["url"] == (
        "https://example.openai.azure.com/openai/deployments/"
        "text-embedding-3-small/embeddings?api-version=2024-12-01-preview"
    )
    assert captured["headers"]["api-key"] == "test-key"
    assert captured["json"] == {"input": "finding text"}


@pytest.mark.asyncio
async def test_azure_openai_embed_strips_pasted_endpoint_suffix(monkeypatch):
    settings = _FakeSettings()
    settings.azure_openai_endpoint = "https://example.openai.azure.com/openai/v1/responses"
    monkeypatch.setattr(embeddings, "get_settings", lambda: settings)

    captured = {}

    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": [{"embedding": [1.0]}]}

    class _FakeAsyncClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            return _FakeResponse()

    monkeypatch.setattr(embeddings.httpx, "AsyncClient", _FakeAsyncClient)

    await embeddings._azure_openai_embed("finding text")

    assert captured["url"].startswith("https://example.openai.azure.com/openai/deployments/")
    assert "/openai/v1/responses" not in captured["url"]


# ──────────────────────── cosine_similarity ────────────────────────

def test_cosine_similarity_identical_vectors_is_one():
    v = [0.5, 0.5, 0.5, 0.5]
    assert embeddings.cosine_similarity(v, v) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors_is_zero():
    assert embeddings.cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_opposite_vectors_is_negative_one():
    assert embeddings.cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


def test_cosine_similarity_handles_empty_or_mismatched_input():
    assert embeddings.cosine_similarity([], []) == 0.0
    assert embeddings.cosine_similarity([1.0], [1.0, 2.0]) == 0.0
    assert embeddings.cosine_similarity([0.0, 0.0], [1.0, 1.0]) == 0.0
