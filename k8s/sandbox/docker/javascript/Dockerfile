# Runner image for JavaScriptRunner (see services/ai_sevices/app/services/sandbox/runners.py).
# Referenced by SANDBOX_K8S_IMAGE_JAVASCRIPT (config.py). Same non-root,
# read-only-rootfs runtime shape as the Python image — see its Dockerfile
# for the full explanation.
FROM node:20-slim

RUN rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# No ENTRYPOINT/CMD: the Job always overrides command to
# ["/bin/sh", "/cm/run.sh"] (k8s_executor.py).
