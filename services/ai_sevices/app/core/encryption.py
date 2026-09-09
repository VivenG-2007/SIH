"""
Field-level encryption for sensitive business/risk data (P0#6).

Encrypts specific fields before they're written to Mongo: business-
criticality revenue figures (business_criticality.py), calibration
EAL/likelihood figures (calibration.py), and telemetry event payloads
(ingestion.py) — exactly the categories P0#6 named ("business-criticality
information, financial/risk assumptions, telemetry ... organization-
sensitive data").

Uses AES-256-GCM: authenticated encryption, so tampering with a stored
ciphertext is DETECTED (decryption raises) rather than silently producing
garbage that looks like a number. The key is sourced from
app.core.secrets.get_secrets_provider() — never hardcoded, never read
directly from a plain env var at the call site, so swapping the secrets
provider (P0#4) automatically changes where this key comes from with no
change here.

This is APPLICATION-LEVEL field encryption. It is deliberately narrower
than, and complementary to, whatever storage-volume-level encryption a
managed MongoDB offering (Atlas, Cosmos DB's Mongo API) already provides:
volume-level encryption protects against a stolen physical disk; this
protects against anyone with read access to the database itself — a
compromised read-replica credential, an over-permissioned analytics
query, a misconfigured backup export — actually seeing a plaintext
revenue figure or telemetry payload. Neither one replaces the other.

WHAT IS NOT ENCRYPTED, DELIBERATELY: fields a caller needs to filter/query
on in Mongo (asset IDs, organization IDs, data-sensitivity labels,
regulatory framework names, telemetry event_type/source_type/
likelihood_effect) stay in plaintext. AES-GCM ciphertext isn't
selectively queryable — encrypting a field you need to `find()` on would
require either client-side filtering after decrypting every document
(defeats the point of an index) or deterministic encryption (which leaks
equality patterns and would be a false sense of security). Each module
that calls this one documents its own specific field-by-field choice; see
business_criticality.py, calibration.py, ingestion.py.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings
from app.core.secrets import get_secrets_provider


class EncryptionKeyNotConfiguredError(RuntimeError):
    """Raised rather than silently falling back to a hardcoded or
    derived key — a missing/misconfigured encryption key must block the
    write (or the read), not degrade to plaintext, and not degrade to a
    predictable default key either."""


def _get_key() -> bytes:
    settings = get_settings()
    provider = get_secrets_provider()
    key_b64 = provider.get_secret(settings.encryption_key_secret_name)
    if not key_b64:
        raise EncryptionKeyNotConfiguredError(
            f"No encryption key found for secret '{settings.encryption_key_secret_name}' "
            f"via the configured secrets provider ({type(provider).__name__}). Generate one "
            f"with generate_dev_key() for local/dev use, or provision a real one in Key Vault "
            f"for production, before writing any encrypted field."
        )
    try:
        key = base64.b64decode(key_b64, validate=True)
    except Exception as exc:
        raise EncryptionKeyNotConfiguredError(f"Encryption key is not valid base64: {exc}") from exc
    if len(key) != 32:
        raise EncryptionKeyNotConfiguredError(
            f"Encryption key must decode to exactly 32 bytes (AES-256) — got {len(key)}."
        )
    return key


def encrypt_value(value: Any) -> str:
    """Encrypts any JSON-serializable value. Returns a single string
    (base64 of nonce || ciphertext-with-tag) safe to store in an ordinary
    Mongo string field — no separate nonce/tag columns to manage."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(value).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_value(token: str) -> Any:
    """Raises (cryptography.exceptions.InvalidTag, via AESGCM.decrypt) if
    the ciphertext was tampered with or the wrong key is configured —
    this is authenticated encryption, so that failure is a security
    signal, not just a formatting error, and callers should not swallow
    it silently."""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(token)
    nonce, ciphertext = raw[:12], raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))


def generate_dev_key() -> str:
    """Local dev/test convenience ONLY — a fresh random base64-encoded
    32-byte key, ready to set as the encryption_key_secret_name's env var
    under EnvSecretsProvider (e.g. `RISK_FIELD_ENCRYPTION_KEY=...`).
    NEVER use this to source a real deployment's key: that key must be
    generated once, stored in Key Vault, and never silently regenerated —
    regenerating it makes every previously-encrypted field permanently
    undecryptable.
    """
    return base64.b64encode(os.urandom(32)).decode("ascii")
