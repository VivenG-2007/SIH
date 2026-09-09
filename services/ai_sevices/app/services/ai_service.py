import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.config import get_settings
from app.core.db import get_db
from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.services.ai_providers import chat_with_fallback

logger = get_logger()


def _cache_key(messages: list[dict], model: str) -> str:
    digest = hashlib.sha256(json.dumps({"messages": messages, "model": model}, sort_keys=True).encode()).hexdigest()
    return f"ai:cache:{digest}"


# Generic entry point behind /api/ai/chat, /api/ai/generate, /api/ai/analyze, /scenario/what-if, /simulation/run.
async def run_chat(
    owner_id: Optional[str],
    messages: list[dict],
    model: Optional[str] = None,
    conversation_id: Optional[str] = None,
    use_cache: bool = True,
) -> dict:
    settings = get_settings()
    resolved_model = model or settings.ai_model
    cache_key = _cache_key(messages, resolved_model)

    ts_start = time.time()
    preview = (messages[-1].get("content") or "")[:90].replace("\n", " ")
    print(f"\n\033[1;36m[LLM CALL INITIATED]\033[0m Provider: \033[1;33m{settings.ai_provider}\033[0m | Model: \033[1;32m{resolved_model}\033[0m | Messages: {len(messages)}")
    print(f"  \033[90m-> Prompt Preview:\033[0m \"{preview}...\"")

    if use_cache:
        try:
            cached = await get_redis().get(cache_key)
            if cached:
                result = json.loads(cached)
                result["cached"] = True
                elapsed_ms = round((time.time() - ts_start) * 1000, 1)
                print(f"\033[1;32m[LLM CACHE HIT]\033[0m Served from Redis in {elapsed_ms}ms\n")
                return result
        except Exception as exc:
            logger.warning("ai_cache_read_failed", error=str(exc))

    try:
        result = await chat_with_fallback(messages, resolved_model)
        elapsed_ms = round((time.time() - ts_start) * 1000, 1)
        provider_used = result.get("provider_used", settings.ai_provider)
        fallback_tag = " \033[1;31m(FALLBACK TRIGGERED)\033[0m" if result.get("fallback_used") else ""
        usage = result.get("usage", {})
        total_tokens = usage.get("total_tokens") or (usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0))
        token_str = f" | Tokens: {total_tokens}" if total_tokens else ""
        print(f"\033[1;32m[LLM CALL SUCCESS]\033[0m Provider: \033[1;33m{provider_used}\033[0m{fallback_tag} | Duration: \033[1;35m{elapsed_ms}ms\033[0m{token_str}")
        resp_preview = (result.get("content") or "")[:120].replace("\n", " ")
        print(f"  \033[90m-> Response Preview:\033[0m \"{resp_preview}...\"\n")
    except Exception as exc:
        elapsed_ms = round((time.time() - ts_start) * 1000, 1)
        print(f"\033[1;31m[LLM CALL FAILED]\033[0m Error after {elapsed_ms}ms: {exc}\n")
        raise

    if use_cache:
        try:
            await get_redis().set(cache_key, json.dumps(result), ex=300)
        except Exception as exc:
            logger.warning("ai_cache_write_failed", error=str(exc))

    if owner_id:
        try:
            db = get_db()
            now = datetime.now(timezone.utc)
            assistant_message = {"role": "assistant", "content": result["content"]}
            if conversation_id:
                await db.conversations.update_one(
                    {"_id": ObjectId(conversation_id), "owner_id": owner_id},
                    {"$push": {"messages": {"$each": [messages[-1], assistant_message]}}, "$set": {"updated_at": now}},
                )
            else:
                await db.conversations.insert_one(
                    {
                        "owner_id": owner_id,
                        "provider": settings.ai_provider,
                        "model": resolved_model,
                        "messages": messages + [assistant_message],
                        "created_at": now,
                        "updated_at": now,
                    }
                )
        except Exception as exc:
            logger.warning("conversation_persist_failed", error=str(exc))

    result["cached"] = False
    return result
