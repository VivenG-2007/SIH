"""Isolated execution sandbox for AI-generated patches.

See docs/architecture.md ("Isolated Execution Sandbox") for the design this
package implements: every generated patch gets compiled/executed in a
fresh, resource-limited, ephemeral sandbox, and the result (exit code,
stdout/stderr, which security controls were actually applied) is handed
back to the verification engine as an independent signal alongside the
deterministic rescan and the AI review pass.

Two interchangeable backends, selected by SANDBOX_BACKEND (see config.py):
  * "process" (default) — in-process subprocess sandbox (execute.py/base.py).
    Real rlimits + non-root + best-effort netns, zero extra infra.
  * "kubernetes" — each execution gets its own ephemeral Job/Pod
    (k8s_executor.py) for real filesystem/network namespace isolation. See
    k8s/sandbox/ for the cluster-side Namespace/RBAC/NetworkPolicy this
    needs applied first.

Both backends return the same `SandboxExecutionResult` shape, so
routers/sandbox.py (and everything upstream of it) never needs to know
which one actually ran.

Public entry point: `execute_patch()` below.
"""

from __future__ import annotations

from app.config import get_settings
from app.core.logging import get_logger
from app.services.sandbox.base import SandboxExecutionResult, SandboxLimits
from app.services.sandbox.execute import execute_patch as _execute_patch_process

logger = get_logger()

__all__ = ["execute_patch", "SandboxExecutionResult"]


async def execute_patch(
    file_path: str,
    fixed_content: str,
    language: str | None = None,
    limits: SandboxLimits | None = None,
) -> SandboxExecutionResult:
    settings = get_settings()

    if settings.sandbox_backend == "kubernetes":
        # Imported lazily so the default "process" backend never requires
        # the `kubernetes` package to be installed.
        from app.services.sandbox.k8s_executor import execute_patch_k8s

        return await execute_patch_k8s(file_path, fixed_content, language=language, limits=limits)

    if settings.sandbox_backend != "process":
        logger.error(
            "sandbox_unknown_backend",
            backend=settings.sandbox_backend,
            fallback="process",
        )

    return await _execute_patch_process(file_path, fixed_content, language=language, limits=limits)
