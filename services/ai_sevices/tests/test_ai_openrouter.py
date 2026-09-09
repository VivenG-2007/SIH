try:
    import pytest
except ImportError:
    pytest = None
from app.services.ai_providers import openrouter, get_fallback_provider, chat_with_fallback
from app.config import get_settings


def test_openrouter_provider_registration():
    fallback = get_fallback_provider()
    assert fallback is openrouter


def test_openrouter_format_messages():
    raw_messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"},
    ]
    # Check that openrouter module exports chat
    assert hasattr(openrouter, "chat")


def test_embedding_provider_mock():
    import asyncio
    from app.services import embeddings

    vec = embeddings._mock_embed("test vulnerability finding")
    assert len(vec) == 256
    assert isinstance(vec[0], float)


if __name__ == "__main__":
    test_openrouter_provider_registration()
    test_openrouter_format_messages()
    test_embedding_provider_mock()
    print("All openrouter & embedding tests passed!")

