import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.core import audit


@pytest.fixture()
def db():
    client = AsyncMongoMockClient()
    return client["test_db"]


@pytest.mark.asyncio
async def test_record_and_list_audit_event(db):
    event = audit.AuditEvent(
        user_id="user-1", organization_id="org-1", action="business_criticality.register",
        resource="asset:acme/webapp", result="success", request_id="req-abc",
    )
    await audit.record_audit_event(db, event)
    events = await audit.list_audit_events(db, "org-1")
    assert len(events) == 1
    assert events[0]["action"] == "business_criticality.register"
    assert events[0]["requestId"] == "req-abc"


@pytest.mark.asyncio
async def test_list_audit_events_scoped_by_organization(db):
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-1", "a", "r", "success"))
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-2", "a", "r", "success"))
    events = await audit.list_audit_events(db, "org-1")
    assert len(events) == 1


@pytest.mark.asyncio
async def test_list_audit_events_filters_by_action(db):
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-1", "action_a", "r1", "success"))
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-1", "action_b", "r2", "success"))
    events = await audit.list_audit_events(db, "org-1", action="action_a")
    assert len(events) == 1
    assert events[0]["resource"] == "r1"


@pytest.mark.asyncio
async def test_record_audit_event_never_raises_on_db_failure():
    class BrokenCollection:
        async def insert_one(self, doc):
            raise RuntimeError("mongo is down")

    class BrokenDb:
        def __getitem__(self, name):
            return BrokenCollection()

    event = audit.AuditEvent("u1", "org-1", "a", "r", "success")
    # Should not raise, per the module's documented fail-open tradeoff.
    await audit.record_audit_event(BrokenDb(), event)


@pytest.mark.asyncio
async def test_events_sorted_most_recent_first(db):
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-1", "first", "r", "success", timestamp="2026-01-01T00:00:00"))
    await audit.record_audit_event(db, audit.AuditEvent("u1", "org-1", "second", "r", "success", timestamp="2026-06-01T00:00:00"))
    events = await audit.list_audit_events(db, "org-1")
    assert events[0]["action"] == "second"
