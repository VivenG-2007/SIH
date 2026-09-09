"""Internal sandbox-execution API.

    Frontend -> Main API -> BullMQ -> Agent Worker -> Sandbox -> Verification
                                                          ^
                                                    this router

Deliberately NOT reachable with an end-user JWT (unlike scanner.py's
routes) — this is an internal boundary between the Agent Worker and the
execution sandbox, gated only by the shared internal-service token main-
service attaches server-side (see app/core/security.py::
require_internal_service_token). The frontend/browser has no path to this
endpoint at all; keep it that way — don't add `Depends(require_auth)` here
without also re-checking who's allowed to trigger arbitrary code execution.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.core.security import require_internal_service_token
from app.services.sandbox import execute_patch
from app.services.sandbox.base import SandboxLimits

router = APIRouter(
    prefix="/internal/sandbox",
    tags=["sandbox"],
    dependencies=[Depends(require_internal_service_token)],
)
logger = get_logger()


class SandboxExecuteRequest(BaseModel):
    runId: Optional[str] = None
    repositoryId: Optional[str] = None
    language: Optional[str] = None
    entryPoint: str = Field(..., description="Patched file's path/name, e.g. 'app.js'")
    fixedContent: str = Field(..., description="Full content of the patched file to execute")
    timeoutSeconds: int = 30
    cpuSeconds: int = 10
    memoryMb: int = 256


@router.post("/execute")
async def sandbox_execute(payload: SandboxExecuteRequest):
    limits = SandboxLimits(
        cpu_seconds=max(1, min(payload.cpuSeconds, 60)),
        memory_mb=max(32, min(payload.memoryMb, 1024)),
        wall_clock_timeout_seconds=max(1, min(payload.timeoutSeconds, 120)),
    )

    logger.info(
        "sandbox_execute_requested",
        run_id=payload.runId,
        repository_id=payload.repositoryId,
        entry_point=payload.entryPoint,
        language=payload.language,
    )

    result = await execute_patch(
        file_path=payload.entryPoint,
        fixed_content=payload.fixedContent,
        language=payload.language,
        limits=limits,
    )

    return result.to_dict()
