FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production

FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runtime
# nodejs is here ONLY for app/services/sandbox's JavaScriptRunner (`node
# --check` / `node <file>` against a single AI-patched file inside the
# isolated sandbox, never against the wider app). Not related to serving
# this API — this container has no other Node dependency. util-linux
# provides `unshare`, used best-effort by the sandbox for network
# isolation (see app/services/sandbox/base.py::network_isolation_prefix —
# it degrades gracefully and reports honestly when unshare isn't
# permitted, so this is a nice-to-have, not a hard requirement).
RUN apt-get update \
    && apt-get install --no-install-recommends -y nodejs util-linux \
    && rm -rf /var/lib/apt/lists/*
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY . .
USER appuser
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5002/health').status==200 else 1)"
# 4 workers is a reasonable default for a v3-plan-sized container; tune via
# WEB_CONCURRENCY if you resize the App Service plan.
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:5002", "--workers", "4", "--timeout", "60"]
