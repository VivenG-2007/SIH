import httpx
from fastapi import HTTPException

from app.config import get_settings


async def chat(messages: list[dict], model: str | None = None) -> dict:
    settings = get_settings()

    # Resolve API key (AZURE_OPENAI_API_KEY preferred, falls back to AI_API_KEY)
    api_key = settings.azure_openai_api_key or settings.ai_api_key

    # Resolve deployment/model name (default to gpt-4.1-mini if unsupported or missing)
    deployment = (
        model
        or settings.azure_openai_deployment_name
        or settings.azure_openai_deployment
        or "gpt-4.1-mini"
    )
    if deployment in ("llama-3.1-8b-instant", "mock"):
        deployment = settings.azure_openai_deployment_name or "gpt-4.1-mini"

    if not settings.azure_openai_endpoint:
        raise HTTPException(status_code=500, detail="AZURE_OPENAI_ENDPOINT not configured")
    if not api_key:
        raise HTTPException(status_code=500, detail="AZURE_OPENAI_API_KEY not configured")

    api_version = settings.azure_openai_api_version or "2024-08-01-preview"

    # Strip any trailing path from AZURE_OPENAI_ENDPOINT
    base = settings.azure_openai_endpoint.rstrip("/")
    for suffix in (
        "/openai/v1/responses",
        "/openai/v1",
        "/models/chat/completions",
        "/openai/deployments",
    ):
        if base.endswith(suffix):
            base = base[: -len(suffix)].rstrip("/")
            break

    # Standard Azure OpenAI Chat Completions Endpoint
    url = f"{base}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"

    headers = {
        "api-key": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "messages": messages,
    }

    from app.core.logging import get_logger
    get_logger().info(
        "azure_openai_request",
        url=url,
        deployment=deployment,
    )

    is_codex = "codex" in deployment.lower()
    
    # Codex models or non-chat completion deployments use the Foundry Responses API
    if not is_codex:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json=payload)
    else:
        response = None

    # If deployment endpoint returns 400 (unsupported) or 404 (not found), or is codex, try Foundry Responses API
    if is_codex or (response is not None and response.status_code in (400, 404)):
        responses_url = f"{base}/openai/v1/responses"
        system_content = ""
        turns: list[dict] = []
        for msg in messages:
            if msg.get("role") == "system":
                system_content = msg.get("content", "")
            else:
                turns.append({"role": msg["role"], "content": msg.get("content", "")})
        responses_body = {"model": deployment, "input": turns}
        if system_content:
            responses_body["instructions"] = system_content

        async with httpx.AsyncClient(timeout=60) as client:
            resp_foundry = await client.post(responses_url, headers=headers, json=responses_body)
            if resp_foundry.status_code < 400:
                data_f = resp_foundry.json()
                content = ""
                output_items = data_f.get("output") or []
                for item in output_items:
                    if item.get("type") == "message":
                        for part in item.get("content") or []:
                            if part.get("type") == "output_text":
                                content = part.get("text", "")
                                break
                        if content:
                            break
                return {"content": content, "usage": data_f.get("usage", {})}
            elif is_codex:
                raise HTTPException(
                    status_code=502,
                    detail=f"Azure OpenAI Codex error {resp_foundry.status_code}: {resp_foundry.text}",
                )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Azure OpenAI error {response.status_code}: {response.text}",
        )

    data = response.json()
    choices = data.get("choices") or []
    choice = choices[0] if choices else {}
    content = choice.get("message", {}).get("content", "")
    return {
        "content": content,
        "usage": data.get("usage", {}),
    }
