import httpx

from app.config import get_settings
from fastapi import HTTPException


# Groq exposes an OpenAI-compatible chat completions endpoint.
async def chat(messages: list[dict], model: str | None = None) -> dict:
    settings = get_settings()
    api_key = settings.groq_api_key or settings.ai_api_key
    chosen_model = model or settings.groq_model or "llama-3.3-70b-versatile"

    if not api_key:
        # Fallback seamlessly to Azure OpenAI or OpenRouter if Groq is unconfigured
        from app.services.ai_providers import azure_openai
        result = await azure_openai.chat(messages, model="gpt-4.1-mini")
        result["provider_used"] = "azure_openai (groq-fallback)"
        return result

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"authorization": f"Bearer {api_key}"},
                json={"model": chosen_model, "messages": messages},
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Groq API error: {response.text}")
        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        return {
            "content": choice.get("message", {}).get("content", ""),
            "usage": data.get("usage", {}),
            "provider_used": "groq",
            "model_used": chosen_model,
        }
    except Exception as exc:
        # Resilient fallback to Azure OpenAI so user NLP query never fails
        from app.services.ai_providers import azure_openai
        result = await azure_openai.chat(messages, model="gpt-4.1-mini")
        result["provider_used"] = "azure_openai (groq-fallback)"
        return result

