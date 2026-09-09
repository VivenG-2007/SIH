import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import asyncio
import base64

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request

from app.config import get_settings
from app.core import security


def _keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def _sign(private_pem: str, claims: dict) -> str:
    settings = get_settings()
    return pyjwt.encode(
        {"type": "access", **claims}, private_pem, algorithm="RS256",
        headers={"kid": "test-key"},
    ) if not (settings.jwt_issuer or settings.jwt_audience) else pyjwt.encode(
        {"type": "access", "iss": settings.jwt_issuer, "aud": settings.jwt_audience, **claims},
        private_pem, algorithm="RS256", headers={"kid": "test-key"},
    )


def _fake_request() -> Request:
    scope = {"type": "http", "headers": [], "method": "GET", "path": "/", "state": {}}
    return Request(scope)


@pytest.fixture()
def swapped_key():
    private_pem, public_pem = _keypair()
    settings = get_settings()
    original = (settings.jwt_public_key_base64, settings.jwt_previous_public_key_base64)
    settings.jwt_public_key_base64 = base64.b64encode(public_pem.encode()).decode()
    settings.jwt_previous_public_key_base64 = None
    try:
        yield private_pem
    finally:
        settings.jwt_public_key_base64, settings.jwt_previous_public_key_base64 = original


def test_require_auth_rejects_token_with_no_org_claim(swapped_key):
    token = _sign(swapped_key, {"sub": "user-1", "role": "user"})  # no org claim
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(security.require_auth(_fake_request(), authorization=f"Bearer {token}", access_token=None))
    assert exc_info.value.status_code == 401
    assert "organization" in exc_info.value.detail.lower()


def test_require_auth_admits_token_with_org_claim_and_populates_current_user(swapped_key):
    token = _sign(swapped_key, {"sub": "user-1", "role": "user", "org": "org-123", "orgRole": "owner"})
    user = asyncio.run(security.require_auth(_fake_request(), authorization=f"Bearer {token}", access_token=None))
    assert user.id == "user-1"
    assert user.org_id == "org-123"
    assert user.org_role == "owner"


def test_require_auth_optional_rejects_real_token_with_no_org_claim(swapped_key):
    token = _sign(swapped_key, {"sub": "user-1", "role": "user"})
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(security.require_auth_optional(
            _fake_request(), authorization=f"Bearer {token}", access_token=None,
            x_system_user_id=None, x_system_org_id=None, x_internal_service_token=None,
        ))
    assert exc_info.value.status_code == 401


def test_require_auth_optional_system_path_carries_org_id_when_provided():
    settings = get_settings()
    original_token = settings.internal_service_token
    settings.internal_service_token = "shared-secret"
    try:
        user = asyncio.run(security.require_auth_optional(
            _fake_request(), authorization=None, access_token=None,
            x_system_user_id="system-user-1", x_system_org_id="org-456",
            x_internal_service_token="shared-secret",
        ))
        assert user.id == "system-user-1"
        assert user.org_id == "org-456"
        assert user.role == "system"
    finally:
        settings.internal_service_token = original_token


def test_require_auth_optional_system_path_allows_missing_org_id_known_gap():
    # Documents the known, flagged gap: webhook-triggered scans have no
    # org claim source yet (watchedRepoStore isn't org-scoped), so this
    # path tolerates org_id=None rather than rejecting the whole webhook
    # flow — see core/security.py's own comment on this.
    settings = get_settings()
    original_token = settings.internal_service_token
    settings.internal_service_token = "shared-secret"
    try:
        user = asyncio.run(security.require_auth_optional(
            _fake_request(), authorization=None, access_token=None,
            x_system_user_id="system-user-1", x_system_org_id=None,
            x_internal_service_token="shared-secret",
        ))
        assert user.org_id is None
    finally:
        settings.internal_service_token = original_token
