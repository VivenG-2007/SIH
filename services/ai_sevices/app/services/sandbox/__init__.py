"""Isolated execution sandbox for AI-generated patches.

See docs/architecture.md ("Isolated Execution Sandbox") for the design this
package implements: every generated patch gets compiled/executed in a
fresh, resource-limited, ephemeral subprocess, and the result (exit code,
stdout/stderr, which security controls were actually applied) is handed
back to the verification engine as an independent signal alongside the
deterministic rescan and the AI review pass.

Backend: \"process\" — in-process subprocess sandbox (execute.py/base.py).
Real rlimits + non-root + best-effort netns, zero extra infra. This is the
sole supported backend; Kubernetes execution has been removed.

Public entry point: `execute_patch()` below.
"""

from __future__ import annotations

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
    """Execute a patch in the process sandbox (the sole supported backend).

    Returns a SandboxExecutionResult with exit_code, stdout, stderr, and
    the set of security controls verified to be present in the patched file.
    Always best-effort: a sandbox error/timeout never blocks the fix
    pipeline — the caller (routers/scanner.py) treats a None result from
    this function the same way it treats a rescan that returned no signal.
    """
    return await _execute_patch_process(file_path, fixed_content, language=language, limits=limits)
