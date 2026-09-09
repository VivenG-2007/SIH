import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.config import get_settings
from app.core import secrets as secrets_mod


@pytest.fixture(autouse=True)
def _reset():
    secrets_mod.reset_provider_cache()
    yield
    secrets_mod.reset_provider_cache()


def test_env_provider_is_the_default():
    settings = get_settings()
    settings.secrets_provider = "env"
    provider = secrets_mod.get_secrets_provider()
    assert isinstance(provider, secrets_mod.EnvSecretsProvider)


def test_env_provider_reads_uppercased_underscored_name(monkeypatch):
    monkeypatch.setenv("MY_TEST_SECRET", "shh")
    provider = secrets_mod.EnvSecretsProvider()
    assert provider.get_secret("my-test-secret") == "shh"


def test_env_provider_returns_none_for_missing_secret():
    provider = secrets_mod.EnvSecretsProvider()
    assert provider.get_secret("definitely-not-set-anywhere") is None


def test_azure_provider_requires_vault_url():
    settings = get_settings()
    original = (settings.secrets_provider, settings.secrets_keyvault_url)
    settings.secrets_provider = "azure_keyvault"
    settings.secrets_keyvault_url = None
    try:
        with pytest.raises(RuntimeError):
            secrets_mod.get_secrets_provider()
    finally:
        settings.secrets_provider, settings.secrets_keyvault_url = original


def test_get_secrets_provider_is_cached():
    settings = get_settings()
    settings.secrets_provider = "env"
    a = secrets_mod.get_secrets_provider()
    b = secrets_mod.get_secrets_provider()
    assert a is b
