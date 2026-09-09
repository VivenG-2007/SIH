"""Kubernetes Job-based sandbox backend.

    execute_patch_k8s()
          |
    Build phase plan (same runners.py used by the process backend)
          |
    ConfigMap: patched file + generated /bin/sh harness (k8s_script.py)
          |
    Job (1 Pod, restartPolicy=Never, backoffLimit=0, activeDeadlineSeconds)
          |   securityContext: non-root, read-only rootfs, no capabilities
          |   resources.limits: cpu/memory/ephemeral-storage
          |   NetworkPolicy (applied once, see k8s/sandbox/) default-denies
          |   all ingress/egress for pods with this Job's labels
          v
    Poll Job status -> read Pod logs -> parse phase markers
          |
    Delete Job + ConfigMap (always, in `finally`; ttlSecondsAfterFinished
    is a backstop, not the primary cleanup path)
          v
    SandboxExecutionResult (same shape the process backend returns)

This is what closes the gap `base.py`'s module docstring calls out: the
process backend shares this service's filesystem/network namespace with
whatever it executes; this backend gives every execution its own disposable
Pod with a real kernel-enforced boundary. See k8s/sandbox/ for the
Namespace/RBAC/NetworkPolicy this depends on, and k8s/sandbox/docker/ for
the runner images.

Requires the `kubernetes` package (see requirements.txt) — only imported
here, so the default "process" backend never needs it installed.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from base64 import b64decode
from typing import Optional

from app.config import get_settings
from app.core.logging import get_logger
from app.services.sandbox.base import PhaseResult, SandboxExecutionResult, SandboxLimits
from app.services.sandbox.k8s_script import (
    DONE_MARKER,
    render_sandbox_script,
)
from app.services.sandbox.runners import detect_language, get_runner

logger = get_logger()

_PHASE_BLOCK_RE = re.compile(
    r"###PATCHLINEX_PHASE### name=(?P<name>\S+) exit=(?P<exit>-?\d+) timedout=(?P<timedout>[01])\r?\n"
    r"###PATCHLINEX_STDOUT_B64###\r?\n(?P<stdout_b64>[^\r\n]*)\r?\n"
    r"###PATCHLINEX_STDERR_B64###\r?\n(?P<stderr_b64>[^\r\n]*)\r?\n"
    r"###PATCHLINEX_PHASE_END###"
)

_configured = False


def _ensure_k8s_config() -> None:
    """Loads kube client config once per process. In-cluster by default
    (reads the Pod's mounted service account token/CA); falls back to a
    kubeconfig file for local/out-of-cluster testing against kind/minikube —
    see SANDBOX_K8S_KUBECONFIG_PATH in config.py."""
    global _configured
    if _configured:
        return

    from kubernetes import config as k8s_config

    settings = get_settings()
    if settings.sandbox_k8s_kubeconfig_path:
        k8s_config.load_kube_config(config_file=settings.sandbox_k8s_kubeconfig_path)
    else:
        try:
            k8s_config.load_incluster_config()
        except k8s_config.ConfigException:
            k8s_config.load_kube_config()
    _configured = True


def _image_for_language(language: str) -> Optional[str]:
    settings = get_settings()
    return {
        "python": settings.sandbox_k8s_image_python,
        "javascript": settings.sandbox_k8s_image_javascript,
    }.get(language)


def _build_job_and_configmap(
    *,
    execution_id: str,
    language: str,
    image: str,
    filename: str,
    fixed_content: str,
    script: str,
    limits: SandboxLimits,
    phase_count: int,
):
    from kubernetes import client

    settings = get_settings()
    name = f"patchlinex-sbx-{execution_id}"
    labels = {
        "app": "patchlinex-sandbox",
        "patchlinex.io/component": "sandbox-runner",
        "patchlinex.io/execution-id": execution_id,
        "patchlinex.io/language": language,
    }

    config_map = client.V1ConfigMap(
        metadata=client.V1ObjectMeta(name=name, labels=labels),
        data={"source": fixed_content, "run.sh": script},
    )

    # Each phase already carries its own `timeout <n>` inside the script;
    # activeDeadlineSeconds is the Kubernetes-enforced outer bound in case
    # the script itself hangs before ever reaching a phase (e.g. the `cp`
    # step, though that's effectively instant).
    active_deadline = limits.wall_clock_timeout_seconds * max(1, phase_count) + 15

    pod_spec = client.V1PodSpec(
        service_account_name=settings.sandbox_k8s_service_account,
        automount_service_account_token=False,
        restart_policy="Never",
        security_context=client.V1PodSecurityContext(
            run_as_non_root=True,
            run_as_user=65534,
            run_as_group=65534,
            fs_group=65534,
            seccomp_profile=client.V1SeccompProfile(type="RuntimeDefault"),
        ),
        volumes=[
            client.V1Volume(
                name="cm",
                config_map=client.V1ConfigMapVolumeSource(name=name, default_mode=0o555),
            ),
            client.V1Volume(
                name="workspace",
                empty_dir=client.V1EmptyDirVolumeSource(
                    size_limit=settings.sandbox_k8s_ephemeral_storage_limit
                ),
            ),
        ],
        containers=[
            client.V1Container(
                name="runner",
                image=image,
                image_pull_policy="IfNotPresent",
                command=["/bin/sh", "/cm/run.sh"],
                working_dir="/workspace",
                resources=client.V1ResourceRequirements(
                    limits={
                        "cpu": settings.sandbox_k8s_cpu_limit,
                        "memory": settings.sandbox_k8s_memory_limit,
                        "ephemeral-storage": settings.sandbox_k8s_ephemeral_storage_limit,
                    },
                    requests={
                        "cpu": "100m",
                        "memory": "64Mi",
                        "ephemeral-storage": "32Mi",
                    },
                ),
                security_context=client.V1SecurityContext(
                    allow_privilege_escalation=False,
                    read_only_root_filesystem=True,
                    run_as_non_root=True,
                    run_as_user=65534,
                    capabilities=client.V1Capabilities(drop=["ALL"]),
                ),
                volume_mounts=[
                    client.V1VolumeMount(name="cm", mount_path="/cm", read_only=True),
                    client.V1VolumeMount(name="workspace", mount_path="/workspace"),
                ],
            )
        ],
    )

    job = client.V1Job(
        metadata=client.V1ObjectMeta(name=name, labels=labels),
        spec=client.V1JobSpec(
            backoff_limit=0,
            active_deadline_seconds=active_deadline,
            ttl_seconds_after_finished=settings.sandbox_k8s_job_ttl_seconds,
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels=labels),
                spec=pod_spec,
            ),
        ),
    )

    return job, config_map, name


def parse_phase_log(raw: str) -> tuple[list[dict], bool]:
    """Parses the marker-delimited pod log back into phase result dicts.
    See k8s_script.py for the format this reads."""
    phases: list[dict] = []
    for m in _PHASE_BLOCK_RE.finditer(raw):
        try:
            stdout = b64decode(m.group("stdout_b64") or "").decode("utf-8", errors="replace")
        except Exception:
            stdout = ""
        try:
            stderr = b64decode(m.group("stderr_b64") or "").decode("utf-8", errors="replace")
        except Exception:
            stderr = ""
        phases.append(
            {
                "name": m.group("name"),
                "exit_code": int(m.group("exit")),
                "timed_out": m.group("timedout") == "1",
                "stdout": stdout,
                "stderr": stderr,
            }
        )
    return phases, DONE_MARKER in raw


def _truncate(text: str, max_bytes: int) -> str:
    if len(text) > max_bytes:
        return text[:max_bytes] + "\n...[truncated]"
    return text


async def execute_patch_k8s(
    file_path: str,
    fixed_content: str,
    language: str | None = None,
    limits: SandboxLimits | None = None,
) -> SandboxExecutionResult:
    """Same contract as `execute.execute_patch` — never raises for an
    execution-level failure, only for a genuine infra error building the
    request itself (which is still caught below and reported as
    status="error", same as the process backend does)."""

    limits = limits or SandboxLimits()
    execution_id = f"kexec_{uuid.uuid4().hex[:10]}"
    language = language or detect_language(file_path) or "unknown"
    runner = get_runner(language)
    settings = get_settings()

    image = _image_for_language(language)
    if image is None:
        logger.info(
            "sandbox_k8s_execution_skipped",
            execution_id=execution_id,
            language=language,
            reason="no_runner_image_for_language",
        )
        return SandboxExecutionResult(
            execution_id=execution_id,
            language=language,
            status="error",
            exit_code=None,
            phases=[],
            stdout="",
            stderr=f"No Kubernetes sandbox runner image configured for language '{language}'.",
            network_blocked=True,
            network_block_method="kubernetes_networkpolicy_default_deny",
            non_root=True,
            resource_limits_applied=True,
        )

    filename = file_path.rsplit("/", 1)[-1] or "patched_file"
    phase_specs = runner.plan("/workspace", filename, fixed_content)
    phase_count = max(1, len(phase_specs))
    script = render_sandbox_script(phase_specs, filename, limits.wall_clock_timeout_seconds)

    try:
        _ensure_k8s_config()
        from kubernetes import client
        from kubernetes.client.rest import ApiException

        batch_v1 = client.BatchV1Api()
        core_v1 = client.CoreV1Api()
        ns = settings.sandbox_k8s_namespace

        job, config_map, name = _build_job_and_configmap(
            execution_id=execution_id,
            language=language,
            image=image,
            filename=filename,
            fixed_content=fixed_content,
            script=script,
            limits=limits,
            phase_count=phase_count,
        )
    except Exception as exc:  # e.g. kube client not importable/configurable
        logger.error("sandbox_k8s_setup_error", execution_id=execution_id, error=str(exc))
        return SandboxExecutionResult(
            execution_id=execution_id, language=language, status="error", exit_code=None,
            phases=[], stdout="", stderr=f"Kubernetes sandbox setup failed: {exc}",
            network_blocked=True, network_block_method="kubernetes_networkpolicy_default_deny",
            non_root=True, resource_limits_applied=True,
        )

    created_configmap = False
    created_job = False
    try:
        await asyncio.to_thread(core_v1.create_namespaced_config_map, ns, config_map)
        created_configmap = True
        await asyncio.to_thread(batch_v1.create_namespaced_job, ns, job)
        created_job = True

        deadline = time.monotonic() + job.spec.active_deadline_seconds + settings.sandbox_k8s_startup_timeout_seconds
        terminal = False
        while time.monotonic() < deadline:
            status = await asyncio.to_thread(batch_v1.read_namespaced_job_status, name, ns)
            s = status.status
            if (s.succeeded or 0) >= 1 or (s.failed or 0) >= 1:
                terminal = True
                break
            await asyncio.sleep(0.5)

        pods = await asyncio.to_thread(
            core_v1.list_namespaced_pod, ns, label_selector=f"job-name={name}"
        )
        raw_log = ""
        if pods.items:
            pod_name = pods.items[0].metadata.name
            try:
                raw_log = await asyncio.to_thread(
                    core_v1.read_namespaced_pod_log, pod_name, ns
                )
            except ApiException as exc:
                logger.info(
                    "sandbox_k8s_log_fetch_failed",
                    execution_id=execution_id, pod=pod_name, error=str(exc),
                )

        parsed_phases, saw_done = parse_phase_log(raw_log)

        if not terminal and not saw_done:
            status_str = "timeout"
        else:
            status_str = "completed"

        phases: list[PhaseResult] = []
        overall_exit_code = 0
        for i, p in enumerate(parsed_phases):
            spec = phase_specs[i] if i < len(phase_specs) else {"name": p["name"], "cmd": []}
            result = PhaseResult(
                name=p["name"],
                cmd=spec.get("cmd", []),
                exit_code=p["exit_code"],
                stdout=_truncate(p["stdout"], limits.max_output_bytes),
                stderr=_truncate(p["stderr"], limits.max_output_bytes),
                timed_out=p["timed_out"],
            )
            phases.append(result)
            if not result.passed:
                overall_exit_code = result.exit_code if result.exit_code is not None else 1

        combined_stdout = "\n".join(p.stdout for p in phases if p.stdout)
        combined_stderr = "\n".join(p.stderr for p in phases if p.stderr)

        logger.info(
            "sandbox_k8s_execution_completed",
            execution_id=execution_id,
            language=language,
            status=status_str,
            phases=[p.name for p in phases],
        )

        return SandboxExecutionResult(
            execution_id=execution_id,
            language=language,
            status=status_str,
            exit_code=overall_exit_code if status_str == "completed" else None,
            phases=phases,
            stdout=combined_stdout,
            stderr=combined_stderr,
            network_blocked=True,
            network_block_method="kubernetes_networkpolicy_default_deny",
            non_root=True,
            resource_limits_applied=True,
        )
    except Exception as exc:  # pragma: no cover - infra-level failure
        logger.error("sandbox_k8s_execution_error", execution_id=execution_id, language=language, error=str(exc))
        return SandboxExecutionResult(
            execution_id=execution_id, language=language, status="error", exit_code=None,
            phases=[], stdout="", stderr=str(exc),
            network_blocked=True, network_block_method="kubernetes_networkpolicy_default_deny",
            non_root=True, resource_limits_applied=True,
        )
    finally:
        # Always tear down — ttlSecondsAfterFinished is a backstop for if
        # this explicit cleanup itself fails partway (e.g. this process
        # crashes), never the primary mechanism.
        if created_job:
            try:
                await asyncio.to_thread(
                    batch_v1.delete_namespaced_job,
                    name, ns,
                    propagation_policy="Background",
                )
            except Exception as exc:
                logger.info("sandbox_k8s_job_cleanup_failed", execution_id=execution_id, error=str(exc))
        if created_configmap:
            try:
                await asyncio.to_thread(core_v1.delete_namespaced_config_map, name, ns)
            except Exception as exc:
                logger.info("sandbox_k8s_configmap_cleanup_failed", execution_id=execution_id, error=str(exc))
