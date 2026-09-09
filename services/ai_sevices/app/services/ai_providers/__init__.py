from __future__ import annotations

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.services.ai_providers import azure_openai, groq, mock, openai as openai_provider, openrouter

# Every provider module exports the same shape: async def chat(messages, model) -> dict(content, usage).
# Add a new file here + one entry below to plug in RAG, embeddings, vision, or speech providers later.
_PROVIDERS = {
    "mock": mock,
    "groq": groq,
    "openai": openai_provider,
    "azure_openai": azure_openai,
    "openrouter": openrouter,
}


def get_provider():
    settings = get_settings()
    provider = _PROVIDERS.get(settings.ai_provider)
    if provider is None:
        raise ValueError(f"Unknown AI_PROVIDER '{settings.ai_provider}'. Supported: {', '.join(_PROVIDERS)}")
    return provider


def get_fallback_provider():
    """Return the configured fallback provider module, or None if disabled."""
    settings = get_settings()
    fallback_name = settings.ai_provider_fallback.lower().strip()
    if fallback_name == "none" or not fallback_name:
        return None
    provider = _PROVIDERS.get(fallback_name)
    if provider is None:
        return None
    return provider


async def chat_with_fallback(messages: list[dict], model: str | None = None) -> dict:
    """Call the primary AI provider; if it raises an HTTP 5xx or times out,
    transparently retry through the configured fallback provider (default:
    OpenRouter). Returns the response dict with an additional `fallback_used`
    bool and `provider_used` string so callers can log/surface which provider
    actually answered.

    Failure policy:
      - Primary 4xx → propagate immediately (bad request, auth, quota hard-limit)
      - Primary 5xx or timeout → try fallback
      - Fallback also fails → propagate the fallback error (the primary error is
        already logged as a warning)
    """
    from app.core.logging import get_logger
    logger = get_logger()

    settings = get_settings()
    primary = get_provider()

    try:
        result = await primary.chat(messages, model)
        result.setdefault("fallback_used", False)
        result.setdefault("provider_used", settings.ai_provider)
        return result
    except HTTPException as exc:
        # 4xx = caller error; don't fall back, surface it immediately.
        if exc.status_code < 500:
            raise
        logger.warning(
            "ai_primary_provider_error_triggering_fallback",
            provider=settings.ai_provider,
            status_code=exc.status_code,
            detail=exc.detail,
        )
    except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
        logger.warning(
            "ai_primary_provider_network_error_triggering_fallback",
            provider=settings.ai_provider,
            error=str(exc),
        )

    fallback = get_fallback_provider()
    if fallback is None:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Primary AI provider '{settings.ai_provider}' failed and "
                "AI_PROVIDER_FALLBACK is disabled (set to 'none')."
            ),
        )

    logger.info(
        "ai_provider_fallback_triggered",
        primary=settings.ai_provider,
        fallback=settings.ai_provider_fallback,
    )
    fallback_model = (
        settings.openrouter_model
        if settings.ai_provider_fallback == "openrouter" and settings.openrouter_model
        else (model or settings.openrouter_model)
    )
    result = await fallback.chat(messages, fallback_model)
    result["fallback_used"] = True
    result["provider_used"] = settings.ai_provider_fallback
    return result

