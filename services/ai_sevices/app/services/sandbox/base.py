"""Process-level isolation primitives shared by every language runner.

What this module actually enforces (and what it honestly can't):

  * CPU time, memory (address space), open-file, and process-count limits —
    enforced via `resource.setrlimit` in a `preexec_fn`, applied to every
    phase subprocess. Real and effective.
  * Wall-clock timeout — enforced by the caller via `asyncio.wait_for`
    around the subprocess, with a SIGKILL on expiry. Real and effective.
  * Non-root execution — if the parent process is already non-root (true in
    production: the ai-storage-service container runs as `appuser`, see
    Dockerfile), phases just inherit that. If the parent happens to be root
    (e.g. a local dev shell), phases are re-exec'd as the `nobody` user via
    `preexec_fn`.
  * No host filesystem access beyond the sandbox — each execution gets its
    own throwaway `tempfile.mkdtemp()` workspace containing only the patched
    file, and the subprocess's cwd is pinned there. It is NOT a chroot/jail,
    so a sufficiently malicious patch could still read paths elsewhere on
    disk if it tried — that would need a real container/VM boundary
    (Kubernetes Job / gVisor / Firecracker) to close completely. Tracked as
    a follow-up; see docs/architecture.md.
  * Network isolation — attempted best-effort via `unshare --net` when the
    kernel/container runtime allows unprivileged user+net namespaces; when
    it doesn't (the common case for a container already running as a
    non-root, non-CAP_SYS_ADMIN user), we fall back to running the phase
    with no network sandboxing at the process level and report that
    honestly in `SandboxExecutionResult.network_blocked` rather than
    claiming a guarantee we didn't enforce. Real network segmentation for
    this stage belongs one layer down, at the container/orchestration
    boundary (Docker `--network none` / a Kubernetes NetworkPolicy on the
    Job's pod) — see docs/architecture.md.
"""

from __future__ import annotations

import dataclasses
import os
import resource
import shutil
import subprocess
from typing import Optional


@dataclasses.dataclass
class SandboxLimits:
    cpu_seconds: int = 10
    memory_mb: int = 256
    max_processes: int = 16
    max_output_bytes: int = 200_000
    wall_clock_timeout_seconds: int = 30


@dataclasses.dataclass
class PhaseResult:
    name: str
    cmd: list[str]
    exit_code: Optional[int]
    stdout: str
    stderr: str
    timed_out: bool = False
    skipped: bool = False
    skip_reason: str = ""

    @property
    def passed(self) -> bool:
        return not self.skipped and not self.timed_out and self.exit_code == 0


@dataclasses.dataclass
class SandboxExecutionResult:
    execution_id: str
    language: str
    status: str  # "completed" | "error" | "timeout"
    exit_code: Optional[int]
    phases: list[PhaseResult]
    stdout: str
    stderr: str
    network_blocked: bool
    network_block_method: str
    non_root: bool
    resource_limits_applied: bool

    @property
    def passed(self) -> bool:
        return self.status == "completed" and bool(self.phases) and all(
            p.passed or p.skipped for p in self.phases
        ) and any(p.passed for p in self.phases)

    def to_dict(self) -> dict:
        return {
            "executionId": self.execution_id,
            "status": self.status,
            "exitCode": self.exit_code,
            "language": self.language,
            "passed": self.passed,
            "phases": [
                {
                    "name": p.name,
                    "cmd": p.cmd,
                    "exitCode": p.exit_code,
                    "passed": p.passed,
                    "skipped": p.skipped,
                    "skipReason": p.skip_reason,
                    "timedOut": p.timed_out,
                }
                for p in self.phases
            ],
            "security": {
                "networkBlocked": self.network_blocked,
                "networkBlockMethod": self.network_block_method,
                "nonRoot": self.non_root,
                "resourceLimitsApplied": self.resource_limits_applied,
            },
            "stdout": self.stdout,
            "stderr": self.stderr,
        }


def _nobody_uid_gid() -> Optional[tuple[int, int]]:
    try:
        import pwd

        entry = pwd.getpwnam("nobody")
        return entry.pw_uid, entry.pw_gid
    except Exception:
        return None


def build_preexec_fn(limits: SandboxLimits, enforce_memory_limit: bool = True):
    """Returns a preexec_fn that drops privileges (if running as root) and
    applies rlimits, run in the forked child before exec — never in the
    parent event loop.

    `enforce_memory_limit=False` is used for Node: V8 reserves a large
    virtual address range up front (well beyond what it actually commits)
    and simply fails to start under a tight RLIMIT_AS — confirmed against
    this image's Node build, not a hypothetical. Node still gets the
    CPU-time, process-count, and (from the caller) wall-clock limits; only
    the address-space cap is skipped for it."""

    running_as_root = os.geteuid() == 0
    drop_to = _nobody_uid_gid() if running_as_root else None

    def _preexec():
        # Detach from the parent's process group so a timeout SIGKILL to the
        # child doesn't need to hunt down orphans it spawned.
        os.setsid()

        if drop_to is not None:
            uid, gid = drop_to
            os.setgid(gid)
            os.setuid(uid)

        cpu = limits.cpu_seconds
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))

        if enforce_memory_limit:
            mem_bytes = limits.memory_mb * 1024 * 1024
            try:
                resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
            except (ValueError, OSError):
                # Unavailable under some interpreters — CPU/timeout/nproc
                # limits below still bound the damage even if this is skipped.
                pass

        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (limits.max_processes, limits.max_processes))
        except (ValueError, OSError):
            pass

        try:
            resource.setrlimit(resource.RLIMIT_FSIZE, (limits.max_output_bytes, limits.max_output_bytes))
        except (ValueError, OSError):
            pass

    return _preexec, (drop_to is not None or not running_as_root)


_UNSHARE_NET_CHECKED = False
_UNSHARE_NET_AVAILABLE = False


def network_isolation_prefix() -> tuple[list[str], str]:
    """Best-effort: prefix a command with `unshare --net` when this kernel
    allows an unprivileged process to create its own (network-less, no
    interfaces configured) net namespace. Returns (prefix_args, method)."""
    global _UNSHARE_NET_CHECKED, _UNSHARE_NET_AVAILABLE

    if shutil.which("unshare") is None:
        return [], "unavailable_no_unshare_binary"

    if not _UNSHARE_NET_CHECKED:
        _UNSHARE_NET_CHECKED = True
        try:
            probe = subprocess.run(
                ["unshare", "--net", "--map-root-user", "true"],
                capture_output=True,
                timeout=3,
            )
            _UNSHARE_NET_AVAILABLE = probe.returncode == 0
        except Exception:
            _UNSHARE_NET_AVAILABLE = False

    if _UNSHARE_NET_AVAILABLE:
        return ["unshare", "--net", "--map-root-user"], "unshare_net_namespace"
    return [], "unavailable_insufficient_privileges"
