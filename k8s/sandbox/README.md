# Kubernetes sandbox backend

Ephemeral-Job-per-execution isolation for AI-generated patch verification,
replacing (optionally — see below) the in-process subprocess sandbox at
`services/ai_sevices/app/services/sandbox/`.

```
ai_sevices (SANDBOX_BACKEND=kubernetes)
      │  app/services/sandbox/k8s_executor.py
      ▼
Kubernetes API  (RBAC-scoped to this namespace only, see 10-rbac.yaml)
      │
      ▼
patchlinex-sandbox namespace
      │
      ├── ConfigMap  (patched file + generated run.sh harness)
      ├── Job (backoffLimit=0, activeDeadlineSeconds, ttlSecondsAfterFinished)
      │     └── Pod (non-root, read-only rootfs, no capabilities, NetworkPolicy default-deny)
      │
      └── deleted immediately after the result is read back (Job + ConfigMap)
```

## Why this exists

The process backend is honest about what it can't do (see
`sandbox/base.py`'s module docstring): it shares this service's filesystem
namespace, and its network isolation is best-effort. This backend gives
every single execution its own disposable Pod with real kernel-enforced
boundaries — that's the gap it closes.

## Applying the cluster resources (one-time, per cluster)

```bash
# 1. Edit 10-rbac.yaml first: replace <AI_SERVICES_NAMESPACE> and
#    <AI_SERVICES_SERVICE_ACCOUNT> with ai_sevices' actual Deployment
#    namespace/service account — that's the identity that will
#    authenticate to the Kubernetes API; it's separate from the
#    zero-permission identity the sandbox Pods themselves run as.
kubectl apply -k k8s/sandbox/
```

This creates the `patchlinex-sandbox` namespace (restricted Pod Security
Admission enforced), the RBAC Role/RoleBinding/ServiceAccounts, the
default-deny NetworkPolicy (+ a narrow DNS-egress exception), and a
ResourceQuota/LimitRange.

## Building and pushing the runner images

```bash
docker build -t ghcr.io/<your-org>/sandbox-python-runner:latest     k8s/sandbox/docker/python
docker build -t ghcr.io/<your-org>/sandbox-javascript-runner:latest k8s/sandbox/docker/javascript
docker push ghcr.io/<your-org>/sandbox-python-runner:latest
docker push ghcr.io/<your-org>/sandbox-javascript-runner:latest
```

Point `SANDBOX_K8S_IMAGE_PYTHON` / `SANDBOX_K8S_IMAGE_JAVASCRIPT` (ai_sevices'
env, see `app/config.py`) at wherever you pushed them. Adding a language
follows the same pattern already documented in `runners.py`: implement a
`BaseRunner` subclass there, add a Dockerfile here, add its image setting to
`config.py` and `_image_for_language` in `k8s_executor.py`.

## Enabling it

```bash
# ai_sevices' environment:
SANDBOX_BACKEND=kubernetes
SANDBOX_K8S_NAMESPACE=patchlinex-sandbox
SANDBOX_K8S_IMAGE_PYTHON=ghcr.io/<your-org>/sandbox-python-runner:latest
SANDBOX_K8S_IMAGE_JAVASCRIPT=ghcr.io/<your-org>/sandbox-javascript-runner:latest
```

When ai_sevices itself runs in-cluster, no further auth config is needed —
`k8s_executor.py` uses the Pod's own mounted service account token
automatically (that's the identity `10-rbac.yaml`'s RoleBinding grants
access to).

`SANDBOX_BACKEND` defaults to `process`, so none of this is required to keep
running exactly as today — switching backends is an env var change, not a
code change, and both paths return the identical `SandboxExecutionResult`
shape to `routers/sandbox.py`.

## Local testing against kind/minikube

```bash
kind create cluster --name patchlinex-sandbox-dev
kubectl apply -k k8s/sandbox/           # after filling in 10-rbac.yaml's placeholders
kind load docker-image ghcr.io/<your-org>/sandbox-python-runner:latest --name patchlinex-sandbox-dev
kind load docker-image ghcr.io/<your-org>/sandbox-javascript-runner:latest --name patchlinex-sandbox-dev
```

Then run ai_sevices locally with `SANDBOX_BACKEND=kubernetes` and
`SANDBOX_K8S_KUBECONFIG_PATH=/path/to/kind/kubeconfig` (the executor loads
in-cluster config first and only falls back to a kubeconfig file when that
fails, so this is what lets it reach the kind cluster from your machine —
see `_ensure_k8s_config` in `k8s_executor.py`).

## What's deliberately out of scope here

- **gVisor/Kata Containers as the pod runtime class** — the manifests here
  use the cluster's default runtime. If your threat model needs a stronger
  boundary than a standard container (fully untrusted, adversarial input is
  the realistic case for this system), add `runtimeClassName: gvisor` (or
  `kata`) to the Job's pod template in `k8s_executor.py` once the cluster has
  that RuntimeClass installed — the rest of this design (RBAC, NetworkPolicy,
  securityContext) is unchanged either way.
- **Cloning a full repo + installing its dependencies inside the sandbox** —
  today's runners (and this backend) operate on a single already-patched
  file, same scope as the process backend (see `runners.py`'s module
  docstring). Real repo-level test execution is future work this design
  doesn't block.
