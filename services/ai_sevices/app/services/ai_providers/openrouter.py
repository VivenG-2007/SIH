"""OpenRouter AI provider.

OpenRouter (https://openrouter.ai) exposes an OpenAI-compatible
/v1/chat/completions endpoint that proxies to 200+ LLMs. This provider
is primarily used as an automatic fallback when the primary AI provider
(Azure OpenAI, Groq, etc.) returns an HTTP 5xx or times out.

Required env var: OPENROUTER_API_KEY=sk-or-...
Optional env var: OPENROUTER_MODEL=<provider>/<model>  (default: openai/gpt-4.1-mini)

OpenRouter requires two additional headers for attribution/routing:
  HTTP-Referer  — your site URL (we use the service name)
  X-Title       — human-readable app name shown in their dashboard
"""
import httpx

from app.config import get_settings
from fastapi import HTTPException

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"


async def chat(messages: list[dict], model: str | None = None) -> dict:
    settings = get_settings()

    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not configured — cannot use OpenRouter provider.",
        )

    resolved_model = model or settings.openrouter_model or "openai/gpt-4.1-mini"

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        # OpenRouter attribution headers — required per their API docs.
        "HTTP-Referer": "https://patchlinex.io",
        "X-Title": "PatchlineX AI Security Platform",
    }

    payload = {
        "model": resolved_model,
        "messages": messages,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{_OPENROUTER_BASE}/chat/completions",
            headers=headers,
            json=payload,
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter API error {response.status_code}: {response.text}",
        )

    data = response.json()
    choice = (data.get("choices") or [{}])[0]
    return {
        "content": choice.get("message", {}).get("content", ""),
        "usage": data.get("usage", {}),
        "provider": "openrouter",
        "model_used": resolved_model,
    }
