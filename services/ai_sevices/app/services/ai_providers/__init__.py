from app.config import get_settings
from app.services.ai_providers import azure_openai, groq, mock, openai as openai_provider

# Every provider module exports the same shape: async def chat(messages, model) -> dict(content, usage).
# Add a new file here + one entry below to plug in RAG, embeddings, vision, or speech providers later.
_PROVIDERS = {
    "mock": mock,
    "groq": groq,
    "openai": openai_provider,
    "azure_openai": azure_openai,
}


def get_provider():
    settings = get_settings()
    provider = _PROVIDERS.get(settings.ai_provider)
    if provider is None:
        raise ValueError(f"Unknown AI_PROVIDER '{settings.ai_provider}'. Supported: {', '.join(_PROVIDERS)}")
    return provider
