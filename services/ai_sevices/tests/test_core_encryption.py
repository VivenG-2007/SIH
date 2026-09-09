import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.config import get_settings
from app.core import encryption, secrets as secrets_mod


@pytest.fixture(autouse=True)
def _dev_key(monkeypatch):
    key = encryption.generate_dev_key()
    monkeypatch.setenv("RISK_FIELD_ENCRYPTION_KEY", key)
    get_settings().secrets_provider = "env"
    secrets_mod.reset_provider_cache()
    yield key
    secrets_mod.reset_provider_cache()


def test_roundtrip_number():
    token = encryption.encrypt_value(1_916_000.0)
    assert encryption.decrypt_value(token) == 1_916_000.0


def test_roundtrip_string_and_dict():
    assert encryption.decrypt_value(encryption.encrypt_value("hello")) == "hello"
    payload = {"a": 1, "b": [1, 2, 3]}
    assert encryption.decrypt_value(encryption.encrypt_value(payload)) == payload


def test_ciphertext_is_not_the_plaintext():
    token = encryption.encrypt_value(42)
    assert "42" not in token


def test_two_encryptions_of_the_same_value_differ_due_to_random_nonce():
    a = encryption.encrypt_value(100)
    b = encryption.encrypt_value(100)
    assert a != b
    assert encryption.decrypt_value(a) == encryption.decrypt_value(b) == 100


def test_tampered_ciphertext_fails_to_decrypt():
    token = encryption.encrypt_value(100)
    tampered = token[:-4] + ("A" if token[-4] != "A" else "B") + token[-3:]
    with pytest.raises(Exception):
        encryption.decrypt_value(tampered)


def test_missing_key_raises_not_configured_error(monkeypatch):
    monkeypatch.delenv("RISK_FIELD_ENCRYPTION_KEY", raising=False)
    secrets_mod.reset_provider_cache()
    with pytest.raises(encryption.EncryptionKeyNotConfiguredError):
        encryption.encrypt_value(1)


def test_wrong_length_key_raises_not_configured_error(monkeypatch):
    import base64
    monkeypatch.setenv("RISK_FIELD_ENCRYPTION_KEY", base64.b64encode(b"too-short").decode())
    secrets_mod.reset_provider_cache()
    with pytest.raises(encryption.EncryptionKeyNotConfiguredError):
        encryption.encrypt_value(1)


def test_generate_dev_key_produces_valid_32_byte_key():
    import base64
    key = encryption.generate_dev_key()
    assert len(base64.b64decode(key)) == 32
