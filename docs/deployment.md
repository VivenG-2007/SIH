# Deployment Guide

## Azure — Backend Services Setup

Each of `services/auth-service`, `services/main-service`, and `services/ai-storage-service` deploys independently to its own **Azure App Service** (Linux).
- `auth-service` and `main-service` run natively on the **Node 18** App Service runtime.
- `ai-storage-service` is **Python / FastAPI** and deploys as a **Web App for Containers** using its Dockerfile (gunicorn + uvicorn workers).

### 1. Create the App Services

```bash
az group create --name hackathon-rg --location eastus

# auth-service and main-service: native Node runtime
for svc in auth main; do
  az appservice plan create --name "plan-$svc" --resource-group hackathon-rg --sku B1 --is-linux
  az webapp create --name "your-$svc-service" --resource-group hackathon-rg \
    --plan "plan-$svc" --runtime "NODE:18-lts"
done

# ai-storage-service: Web App for Containers
az appservice plan create --name "plan-ai-storage" --resource-group hackathon-rg --sku B1 --is-linux
az webapp create --name "your-ai-storage-service" --resource-group hackathon-rg \
  --plan "plan-ai-storage" --deployment-container-image-name "mcr.microsoft.com/appsvc/staticsite:latest"
az webapp config appsettings set --name "your-ai-storage-service" --resource-group hackathon-rg \
  --settings WEBSITES_PORT=5002
```

> [!TIP]
> **Recommended Azure SKUs**:
> - **B1 / B2** for `auth-service` and `ai-storage-service`.
> - **P0v3 / P1v3** (Premium v3) for `main-service` when benchmarking high request throughput (~3,000 req/s target).

### 2. Configure Autoscaling (main-service)

```bash
az monitor autoscale create --resource-group hackathon-rg \
  --resource "your-main-service" --resource-type Microsoft.Web/sites \
  --name main-autoscale --min-count 2 --max-count 10 --count 2

az monitor autoscale rule create --resource-group hackathon-rg \
  --autoscale-name main-autoscale \
  --condition "CpuPercentage > 70 avg 5m" --scale out 2
```

Stateless design (no in-memory session state, Redis-backed rate limiting) allows `main-service` to scale horizontally without sticky sessions.

### 3. Environment Variables

Set each service's variables using `az webapp config appsettings set` or via the Azure Portal Configuration blade.

```bash
az webapp config appsettings set --name your-auth-service --resource-group hackathon-rg \
  --settings JWT_PRIVATE_KEY_BASE64="$(cat private-key-base64.txt)" \
             MONGODB_URI="mongodb+srv://..."
```

> [!CAUTION]
> Never commit `.env` files containing real production credentials to Git repositories.

### 4. GitHub Actions (Path-Filtered CI/CD)

The repo includes path-filtered deployment workflows under `.github/workflows/deploy-<service>.yml`. Each workflow deploys only when files within its target service folder change.

To configure Azure OIDC federated credentials for GitHub Actions:

```bash
az ad app federated-credential create --id <app-registration-object-id> --parameters '{
  "name": "github-main-deploy",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<org>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

> [!WARNING]
> **Known OIDC Gotcha (`AADSTS700213`)**: If GitHub appends a numeric suffix to your org or repository name during a rename grace period, the `sub` claim sent by GitHub will differ from the registered subject. Re-create the federated credential with the suffixed subject value if authentication fails.

Add the following repository secrets per service:
- `AZURE_CLIENT_ID`, `AZURE_APP_NAME`
- Shared: `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`

`ai-storage-service` builds its Dockerfile, pushes the container image to GitHub Container Registry (`ghcr.io`), and updates App Service container configuration via `az webapp config container set`.

---

### 5. Health Checks & Monitoring

- Enable **Azure Health Check** (Portal → Monitoring → Health check) pointing to `/health` on each service.
- Enable **Application Insights** to track request timings, dependency latency, and correlate `x-request-id` headers across services.
- Use `/ready` for readiness probes (reporting live MongoDB/Redis connectivity) and `/health` for liveness probes.

---

### 6. Custom Domains & HTTPS

App Service provisions managed SSL/TLS certificates for custom domain bindings.
Because the frontend (Vercel) and backend services (Azure) run on separate domain origins, authentication cookies must be configured with `SameSite=None; Secure`, requiring HTTPS on all environments.

---

### 7. Deployment Slots

For zero-downtime deployments, configure a `staging` slot and swap after verification:

```bash
az webapp deployment slot create --name your-main-service --resource-group hackathon-rg --slot staging
# Deploy build to staging slot, verify /health response, then swap:
az webapp deployment slot swap --name your-main-service --resource-group hackathon-rg --slot staging
```

---

### 8. Standalone Scanner Worker Service

`main-service` supports running standalone BullMQ workers (`node src/worker.js` / `npm run worker`) outside of the API server process (`DISABLE_INLINE_WORKERS=true`).

**Local Compose Setup:**
```bash
docker compose up --scale worker=4
```

**Azure Production Setup:**
Deploy a separate App Service instance dedicated to background queue processing:

```bash
az appservice plan create --name plan-worker --resource-group hackathon-rg --sku B1 --is-linux
az webapp create --name your-scanner-worker --resource-group hackathon-rg \
  --plan plan-worker --runtime "NODE:18-lts"
az webapp config set --name your-scanner-worker --resource-group hackathon-rg \
  --startup-file "npm run worker"
az webapp config appsettings set --name your-scanner-worker --resource-group hackathon-rg \
  --settings REDIS_URL="..." AI_STORAGE_SERVICE_URL="..." INTERNAL_SERVICE_TOKEN="..." \
             SCAN_WORKER_CONCURRENCY=5 FIX_WORKER_CONCURRENCY=4
az webapp config set --name your-scanner-worker --resource-group hackathon-rg --always-on true

# Disable inline workers on the main HTTP API service:
az webapp config appsettings set --name your-main-service --resource-group hackathon-rg \
  --settings DISABLE_INLINE_WORKERS=true
```

> [!NOTE]
> Worker throughput equals `(instance_count) × (concurrency_per_instance)`. Ensure your configured concurrency aligns with upstream AI provider rate limits.

---

## Third-Party Integration Setup

Both integrations require `OAUTH_TOKEN_ENCRYPTION_KEY_BASE64` to be set on `main-service` (generate with `openssl rand -base64 32`).

### Jira Integration Setup

1. Register an OAuth 2.0 (3LO) App at [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Add Jira API scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`.
3. Set callback URL: `https://your-main-service.azurewebsites.net/api/jira/oauth/callback` (must match `JIRA_REDIRECT_URI` exactly).
4. Configure `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` in `main-service`.
5. Execute Supabase `jira_connections` table migration script (see [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md)).

### GitHub Integration Setup

1. Register a new OAuth App at [GitHub Developer Settings](https://github.com/settings/developers).
2. Set Homepage URL to frontend URL (`https://your-app.vercel.app`).
3. Set Authorization Callback URL: `https://your-main-service.azurewebsites.net/api/github/oauth/callback` (must match `GITHUB_REDIRECT_URI` exactly).
4. Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `main-service`.
5. Execute Supabase `github_connections` table migration script (see [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md)).

---

## Vercel — Frontend Deployment

1. Import the repository into Vercel and set the **Root Directory** to `frontend/`.
2. Configure project Environment Variables:
   - `NEXT_PUBLIC_AUTH_API_URL` = URL of deployed `auth-service`
   - `NEXT_PUBLIC_MAIN_API_URL` = URL of deployed `main-service`
   - `JWT_PUBLIC_KEY_BASE64`, `JWT_ISSUER`, `JWT_AUDIENCE` (server-side edge middleware protection)
3. Vercel automatically deploys updates pushed to the `main` branch.
