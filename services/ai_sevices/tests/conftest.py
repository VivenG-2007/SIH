import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.core import encryption, secrets as secrets_mod


@pytest.fixture()
def db():
    """A real (mongomock-backed) async Mongo database — exercises the
    actual query/index/update logic in the migrated risk-engine modules,
    not a hand-rolled fake. Fresh per test."""
    client = AsyncMongoMockClient()
    return client["test_db"]


@pytest.fixture(autouse=True)
def _stub_redis(monkeypatch):
    """Unit tests exercise Mongo as the durable store. Redis is the live
    ring buffer in production; a ConnectionError here matches 'Redis
    unreachable, fall back to Mongo' rather than talking to a leftover
    local Redis with cross-test state."""

    def _disabled():
        raise ConnectionError("redis disabled in unit tests")

    monkeypatch.setattr("app.core.redis_client.get_redis", _disabled)


@pytest.fixture(autouse=True)
def _dev_encryption_key(monkeypatch):
    """Every test in this suite that touches business_criticality.py,
    ingestion.py, or calibration.py now needs a working encryption key
    (those modules encrypt sensitive fields before writing — see
    app/core/encryption.py). Autouse so no test file has to remember to
    set this up itself; fresh key per test so tests can't leak state via
    a shared key."""
    key = encryption.generate_dev_key()
    monkeypatch.setenv("RISK_FIELD_ENCRYPTION_KEY", key)
    secrets_mod.reset_provider_cache()
    yield key
    secrets_mod.reset_provider_cache()


ORG_A = "org-aaaaaaaaaaaaaaaaaaaaaaaa"
ORG_B = "org-bbbbbbbbbbbbbbbbbbbbbbbb"
