"""
Secrets Management abstraction (P0#4 — "no production secrets in .env
files deployed directly").

Two providers, selected by settings.secrets_provider:

  - EnvSecretsProvider ("env", the default): reads from process
    environment. This is what every environment — including today's
    actual deployment — uses right now. Read this before assuming
    switching providers is optional: reading process env is ALSO
    literally how Azure App Service surfaces a Key-Vault-backed
    "@Microsoft.KeyVault(...)" app setting reference to a running
    process — so EnvSecretsProvider isn't being deprecated by the
    provider below, it's the same read path a Key-Vault-integrated App
    Service deployment still uses. What P0#4 actually flags is secrets
    living in a checked-in .env file with no vault behind them at all —
    that's an operational/deployment practice this code cannot enforce by
    itself, only make easy to do right.

  - AzureKeyVaultProvider ("azure_keyvault"): fetches secrets directly
    from Key Vault using azure-identity's DefaultAzureCredential, which
    picks up a deployed managed identity automatically in Azure and falls
    back to az-cli/env-var credentials for a developer running `az
    login` locally. This is REAL Azure SDK usage — not a stub — but it is
    NOT exercised by this session's test suite: there is no reachable Key
    Vault instance in this sandbox (or, presumably, in CI), so its
    correctness rests on the SDK's documented contract and code review,
    not a passing integration test. That's an open verification item, not
    a "done" — the honest thing to do here is say so plainly rather than
    let an untested code path masquerade as a tested one just because it
    imports the real SDK.

Selecting a provider is one config change
(secrets_provider=azure_keyvault, secrets_keyvault_url=<vault>) plus one
IAM role grant — no code changes at any call site, since every caller
goes through get_secrets_provider().get_secret(name).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional, Protocol

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger()


class SecretsProvider(Protocol):
    def get_secret(self, name: str) -> Optional[str]: ...


class EnvSecretsProvider:
    """name -> os.environ[NAME_UPPERCASED_WITH_UNDERSCORES]."""

    def get_secret(self, name: str) -> Optional[str]:
        return os.environ.get(name.upper().replace("-", "_"))


class AzureKeyVaultProvider:
    """See module docstring's honesty note: real SDK usage, not
    live-tested in this codebase's own test run."""

    def __init__(self, vault_url: str):
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        self._client = SecretClient(vault_url=vault_url, credential=DefaultAzureCredential())

    def get_secret(self, name: str) -> Optional[str]:
        try:
            return self._client.get_secret(name).value
        except Exception as exc:  # noqa: BLE001 — a Key Vault outage must degrade to "secret unavailable", never crash the caller
            logger.warning("keyvault_secret_fetch_failed", secret_name=name, error=str(exc))
            return None


@lru_cache
def get_secrets_provider() -> SecretsProvider:
    settings = get_settings()
    if settings.secrets_provider == "azure_keyvault":
        if not settings.secrets_keyvault_url:
            raise RuntimeError("secrets_provider='azure_keyvault' requires secrets_keyvault_url to be set")
        return AzureKeyVaultProvider(settings.secrets_keyvault_url)
    return EnvSecretsProvider()


def reset_provider_cache() -> None:
    """Test-only: get_secrets_provider() is lru_cache'd (a real Key Vault
    client shouldn't be reconstructed per-call), so tests that swap
    settings.secrets_provider mid-run need to invalidate that cache."""
    get_secrets_provider.cache_clear()
