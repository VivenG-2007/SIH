# Unit tests for app/core/chroma_client.py — the process-wide Chroma Cloud
# client/collection singleton used by app/core/memory_store.py. Covers:
#   - _build_client raises a clear error when CHROMA_API_KEY is unset
#   - get_or_create_collection is called with the cosine hnsw space (not
#     Chroma's l2 default) so "similar" keeps meaning what memory_store
#     expects
#   - get_collection() only builds the client/collection once (singleton),
#     even across multiple calls
#   - reset() actually clears the cached singleton so the next call rebuilds

import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.core import chroma_client


class _FakeSettings:
    chroma_api_key = "test-chroma-key"
    chroma_tenant = None
    chroma_database = None
    chroma_host = "api.trychroma.com"
    chroma_collection = "finding_memory"


class _FakeCollection:
    pass


class _FakeCloudClient:
    """Records get_or_create_collection calls so tests can assert on the
    hnsw space that was requested, without touching the real network."""

    instances_created = 0

    def __init__(self, **kwargs):
        _FakeCloudClient.instances_created += 1
        self.kwargs = kwargs
        self.get_or_create_calls = []

    def get_or_create_collection(self, name, metadata=None):
        self.get_or_create_calls.append({"name": name, "metadata": metadata})
        return _FakeCollection()


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Every test starts from a clean singleton state, and cleans up after
    itself so this file never leaks state into other test modules."""
    chroma_client.reset()
    _FakeCloudClient.instances_created = 0
    yield
    chroma_client.reset()


@pytest.mark.asyncio
async def test_missing_api_key_raises_clear_error(monkeypatch):
    settings = _FakeSettings()
    settings.chroma_api_key = None
    monkeypatch.setattr(chroma_client, "get_settings", lambda: settings)
    with pytest.raises(RuntimeError, match="CHROMA_API_KEY"):
        await chroma_client.get_collection()


@pytest.mark.asyncio
async def test_collection_created_with_cosine_space(monkeypatch):
    settings = _FakeSettings()
    monkeypatch.setattr(chroma_client, "get_settings", lambda: settings)
    monkeypatch.setattr(chroma_client.chromadb, "CloudClient", _FakeCloudClient)

    await chroma_client.get_collection()

    # The single CloudClient instance built during this call
    assert _FakeCloudClient.instances_created == 1
    fake_client = chroma_client._client
    assert fake_client.get_or_create_calls == [
        {"name": "finding_memory", "metadata": {"hnsw:space": "cosine"}}
    ]


@pytest.mark.asyncio
async def test_get_collection_is_a_singleton_across_calls(monkeypatch):
    settings = _FakeSettings()
    monkeypatch.setattr(chroma_client, "get_settings", lambda: settings)
    monkeypatch.setattr(chroma_client.chromadb, "CloudClient", _FakeCloudClient)

    first = await chroma_client.get_collection()
    second = await chroma_client.get_collection()
    third = await chroma_client.get_collection()

    # Only one CloudClient (and therefore one TLS handshake / auth) built,
    # no matter how many times get_collection() is awaited.
    assert _FakeCloudClient.instances_created == 1
    assert first is second is third


@pytest.mark.asyncio
async def test_reset_forces_rebuild_on_next_call(monkeypatch):
    settings = _FakeSettings()
    monkeypatch.setattr(chroma_client, "get_settings", lambda: settings)
    monkeypatch.setattr(chroma_client.chromadb, "CloudClient", _FakeCloudClient)

    await chroma_client.get_collection()
    assert _FakeCloudClient.instances_created == 1

    chroma_client.reset()
    assert chroma_client._client is None
    assert chroma_client._collection is None

    await chroma_client.get_collection()
    assert _FakeCloudClient.instances_created == 2


@pytest.mark.asyncio
async def test_cloud_host_override_passed_through_when_set(monkeypatch):
    settings = _FakeSettings()
    settings.chroma_host = "custom.chroma.example.com"
    monkeypatch.setattr(chroma_client, "get_settings", lambda: settings)
    monkeypatch.setattr(chroma_client.chromadb, "CloudClient", _FakeCloudClient)

    await chroma_client.get_collection()

    fake_client = chroma_client._client
    assert fake_client.kwargs["cloud_host"] == "custom.chroma.example.com"
    assert fake_client.kwargs["api_key"] == "test-chroma-key"
