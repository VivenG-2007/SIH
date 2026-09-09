# Runner image for PythonRunner (see services/ai_sevices/app/services/sandbox/runners.py).
# Referenced by SANDBOX_K8S_IMAGE_PYTHON (config.py). Built to run as an
# arbitrary non-root numeric UID (65534, set by the Pod's securityContext —
# see k8s_executor.py) with a read-only root filesystem, so it needs no
# writable directories of its own; /workspace is provided at runtime as a
# separate emptyDir volume mount.
FROM python:3.12-slim

# pytest: PythonRunner.plan() runs `python -m pytest` when the patched file
# looks like a test file. Nothing else — no compilers, no network tools, no
# package manager left reachable at runtime beyond what's already resident
# in the image (dependency installation happens at image-build time only,
# never per-execution).
RUN pip install --no-cache-dir --no-compile pytest==8.3.4 \
    && rm -rf /root/.cache /var/lib/apt/lists/*

# coreutils' `timeout`/`base64` (used by the generated run.sh harness) ship
# in this base image already — nothing extra to add for those.

WORKDIR /workspace

# No ENTRYPOINT/CMD: the Job always overrides command to
# ["/bin/sh", "/cm/run.sh"] (k8s_executor.py), so nothing here is ever
# actually invoked as a default.
