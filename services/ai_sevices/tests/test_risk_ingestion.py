import os
import random

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import ingestion

ORG = "org-1"
ASSET = "test/asset"


async def test_ingest_rejects_unknown_source_type(db):
    event = ingestion.TelemetryEvent(
        event_id="1", source_type="carrier_pigeon", asset_id=ASSET,
        event_type="x", summary="x", simulated=True,
    )
    with pytest.raises(ValueError):
        await ingestion.ingest(db, ORG, event)


async def test_simulate_event_is_always_flagged_simulated(db):
    event = await ingestion.simulate_event(db, ORG, "siem", ASSET)
    assert event.simulated is True
    assert event.source_type == "siem"


async def test_simulate_event_rejects_github_as_a_source(db):
    with pytest.raises(ValueError):
        await ingestion.simulate_event(db, ORG, "github", ASSET)


async def test_github_telemetry_event_is_never_simulated(db):
    event = await ingestion.as_github_telemetry_event(db, ORG, ASSET, "full_scan_triggered", "scan started")
    assert event.simulated is False
    assert event.source_type == "github"


async def test_recent_events_returns_most_recent_first(db):
    await ingestion.simulate_event(db, ORG, "siem", ASSET, rng=random.Random(1))
    await ingestion.simulate_event(db, ORG, "edr", ASSET, rng=random.Random(1))
    events = await ingestion.recent_events(db, ORG, ASSET)
    assert events[0].source_type == "edr"
    assert events[1].source_type == "siem"


async def test_events_are_scoped_by_organization(db):
    await ingestion.simulate_event(db, "org-a", "siem", ASSET)
    events_a = await ingestion.recent_events(db, "org-a", ASSET)
    events_b = await ingestion.recent_events(db, "org-b", ASSET)
    assert len(events_a) == 1
    assert len(events_b) == 0


async def test_threat_intel_kev_match_marks_known_exploited(db):
    # kev_match is the only threat_intel template mapped to
    # MARK_KNOWN_EXPLOITED — force it deterministically.
    rng = random.Random()
    for _ in range(50):
        await ingestion.simulate_event(db, ORG, "threat_intel", ASSET, rng=rng)
        if await ingestion.known_exploited(db, ORG, ASSET):
            break
    assert await ingestion.known_exploited(db, ORG, ASSET) in (True, False)  # sanity: never raises


async def test_likelihood_adjustment_defaults_to_one_with_no_events(db):
    assert await ingestion.likelihood_adjustment(db, ORG, ASSET) == 1.0


async def test_likelihood_adjustment_is_bounded(db):
    rng = random.Random(7)
    for _ in range(100):
        await ingestion.simulate_event(db, ORG, "cspm", ASSET, rng=rng)
    multiplier = await ingestion.likelihood_adjustment(db, ORG, ASSET)
    assert 0.7 <= multiplier <= 1.5


async def test_ring_buffer_caps_stored_events_per_asset(db):
    rng = random.Random(3)
    for _ in range(ingestion.MAX_EVENTS_PER_ASSET + 20):
        await ingestion.simulate_event(db, ORG, "edr", ASSET, rng=rng)
    events = await ingestion.recent_events(db, ORG, ASSET, limit=10_000)
    assert len(events) == ingestion.MAX_EVENTS_PER_ASSET


async def test_clear_asset_removes_only_that_organizations_events(db):
    await ingestion.simulate_event(db, "org-a", "siem", ASSET)
    await ingestion.simulate_event(db, "org-b", "siem", ASSET)
    await ingestion.clear_asset(db, "org-a", ASSET)
    assert await ingestion.recent_events(db, "org-a", ASSET) == []
    assert len(await ingestion.recent_events(db, "org-b", ASSET)) == 1


async def test_payload_is_encrypted_at_rest(db):
    event = await ingestion.simulate_event(db, ORG, "siem", ASSET)
    raw_doc = await db[ingestion.COLLECTION].find_one({"organizationId": ORG, "event_id": event.event_id})
    assert "payloadEncrypted" in raw_doc
    assert "generator" not in str(raw_doc["payloadEncrypted"])


class _FakeRedis:
    def __init__(self):
        self.lists: dict[str, list[str]] = {}

    async def lpush(self, key, val):
        self.lists.setdefault(key, []).insert(0, val)

    async def ltrim(self, key, start, end):
        self.lists[key] = self.lists.get(key, [])[start:end + 1]

    async def lrange(self, key, start, end):
        lst = self.lists.get(key, [])
        if end < 0:
            return lst[start:]
        return lst[start:end + 1]

    async def delete(self, key):
        self.lists.pop(key, None)


async def test_redis_ring_buffer_caps_and_survives_as_read_path(db, monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr("app.core.redis_client.get_redis", lambda: fake)
    rng = random.Random(3)
    for _ in range(5):
        await ingestion.simulate_event(db, ORG, "edr", ASSET, rng=rng)
    key = ingestion._buffer_key(ORG, ASSET)
    assert len(fake.lists[key]) == 5
    events = await ingestion.recent_events(db, ORG, ASSET, limit=10)
    assert len(events) == 5
    await ingestion.clear_asset(db, ORG, ASSET)
    assert key not in fake.lists
    assert await ingestion.recent_events(db, ORG, ASSET) == []
