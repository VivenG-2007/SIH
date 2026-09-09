"""Orchestrates one sandboxed execution of a patched file.

    Patch generated
          |
    Create sandbox (fresh tempdir)
          |
    Copy only the patched file into it
          |
    Run language-specific phases (compile -> test/execute)
          |
    Collect stdout/stderr/exit code
          |
    Destroy sandbox (always, even on error/timeout)

Every execution gets its own throwaway directory — never reused across
findings, patches, or repos (see base.py for exactly what isolation is and
isn't enforced at the process level).
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import uuid

from app.core.logging import get_logger
from app.services.sandbox.base import (
    PhaseResult,
    SandboxExecutionResult,
    SandboxLimits,
    build_preexec_fn,
    network_isolation_prefix,
)
from app.services.sandbox.runners import detect_language, get_runner

logger = get_logger()


async def _run_phase(name: str, cmd: list[str], cwd: str, limits: SandboxLimits) -> PhaseResult:
    # See build_preexec_fn's docstring — Node's V8 needs a large virtual
    # address space reservation just to start, so RLIMIT_AS is skipped for
    # it specifically; CPU-time/process-count/wall-clock limits still apply.
    enforce_memory_limit = os.path.basename(cmd[0]) != "node"
    preexec_fn, non_root = build_preexec_fn(limits, enforce_memory_limit=enforce_memory_limit)
    net_prefix, net_method = network_isolation_prefix()
    full_cmd = [*net_prefix, *cmd]

    exec_kwargs = {
        "cwd": cwd,
        "stdout": asyncio.subprocess.PIPE,
        "stderr": asyncio.subprocess.PIPE,
    }
    if preexec_fn is not None and os.name != "nt":
        exec_kwargs["preexec_fn"] = preexec_fn

    try:
        proc = await asyncio.create_subprocess_exec(
            *full_cmd,
            **exec_kwargs,
        )

    except FileNotFoundError as exc:
        return PhaseResult(
            name=name, cmd=cmd, exit_code=None, stdout="", stderr=str(exc),
            skipped=True, skip_reason="toolchain_binary_not_found",
        )

    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(), timeout=limits.wall_clock_timeout_seconds
        )
        timed_out = False
    except asyncio.TimeoutError:
        proc.kill()
        try:
            await proc.wait()
        except Exception:  # pragma: no cover - best effort cleanup
            pass
        stdout_b, stderr_b, timed_out = b"", b"execution exceeded wall-clock timeout", True

    def _truncate(b: bytes) -> str:
        text = b.decode("utf-8", errors="replace")
        if len(text) > limits.max_output_bytes:
            return text[: limits.max_output_bytes] + "\n...[truncated]"
        return text

    return PhaseResult(
        name=name,
        cmd=cmd,
        exit_code=proc.returncode if not timed_out else None,
        stdout=_truncate(stdout_b),
        stderr=_truncate(stderr_b),
        timed_out=timed_out,
    )


async def execute_patch(
    file_path: str,
    fixed_content: str,
    language: str | None = None,
    limits: SandboxLimits | None = None,
) -> SandboxExecutionResult:
    """Compile/test/execute a single patched file in an isolated,
    resource-limited, ephemeral sandbox. Never raises for an execution-level
    failure (bad patch, missing toolchain, timeout) — those are reported in
    the returned result's status/phases. Only raises on a genuine
    infrastructure error (e.g. can't create a tempdir)."""

    limits = limits or SandboxLimits()
    execution_id = f"exec_{uuid.uuid4().hex[:10]}"
    language = language or detect_language(file_path) or "unknown"
    runner = get_runner(language)

    net_prefix, net_method = network_isolation_prefix()
    _preexec_fn, non_root = build_preexec_fn(limits)

    if not runner.available():
        logger.info("sandbox_execution_skipped", execution_id=execution_id, language=language, reason="runner_unavailable")
        return SandboxExecutionResult(
            execution_id=execution_id, language=language, status="error", exit_code=None,
            phases=[], stdout="", stderr=f"No sandbox runner available for language '{language}'.",
            network_blocked=bool(net_prefix), network_block_method=net_method,
            non_root=non_root, resource_limits_applied=True,
        )

    workdir = tempfile.mkdtemp(prefix="patchlinex-sandbox-")
    try:
        os.chmod(workdir, 0o777)  # so a dropped-privilege ("nobody") child can still write here
        filename = os.path.basename(file_path) or "patched_file"
        target_path = os.path.join(workdir, filename)
        with open(target_path, "w", encoding="utf-8") as fh:
            fh.write(fixed_content)

        phase_specs = runner.plan(workdir, filename, fixed_content)
        phases: list[PhaseResult] = []
        overall_exit_code = 0

        for spec in phase_specs:
            result = await _run_phase(spec["name"], spec["cmd"], workdir, limits)
            phases.append(result)
            if not result.passed and not result.skipped:
                overall_exit_code = result.exit_code if result.exit_code is not None else 1
                break

        status = "completed"
        combined_stdout = "\n".join(p.stdout for p in phases if p.stdout)
        combined_stderr = "\n".join(p.stderr for p in phases if p.stderr)

        logger.info(
            "sandbox_execution_completed",
            execution_id=execution_id,
            language=language,
            phases=[p.name for p in phases],
            passed=all(p.passed or p.skipped for p in phases) if phases else False,
        )

        return SandboxExecutionResult(
            execution_id=execution_id,
            language=language,
            status=status,
            exit_code=overall_exit_code,
            phases=phases,
            stdout=combined_stdout,
            stderr=combined_stderr,
            network_blocked=bool(net_prefix),
            network_block_method=net_method,
            non_root=non_root,
            resource_limits_applied=True,
        )
    except Exception as exc:  # pragma: no cover - infra-level failure, not a patch failure
        logger.error("sandbox_execution_error", execution_id=execution_id, language=language, error=str(exc))
        return SandboxExecutionResult(
            execution_id=execution_id, language=language, status="error", exit_code=None,
            phases=[], stdout="", stderr=str(exc),
            network_blocked=bool(net_prefix), network_block_method=net_method,
            non_root=non_root, resource_limits_applied=True,
        )
    finally:
        # Destroy the sandbox unconditionally — never reused across runs.
        shutil.rmtree(workdir, ignore_errors=True)
