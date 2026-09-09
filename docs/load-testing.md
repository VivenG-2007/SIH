# Load Testing Guide

This guide covers benchmarking procedures for Patchline X backends using `autocannon` and `k6`.

## Local vs. Azure Production Benchmarks

> [!IMPORTANT]
> **Local benchmarks** (`npm run loadtest:*` against `localhost`) measure single-process CPU performance on a local machine without network hops or cloud latency.
> **Azure benchmarks** (`TARGET_URL=https://... npm run loadtest:*`) measure actual deployed App Service performance, cloud database response times, and multi-region network latency.

The `~3,000 req/s` figure is a benchmark target for lightweight endpoints (`/health` or cached reads) on a Premium v3 App Service plan. Heavy endpoints performing database writes or LLM requests will naturally exhibit different throughput profiles.

---

## Running Benchmarks

### Autocannon Benchmarks

```bash
# Local environment testing
npm run loadtest:main
npm run loadtest:auth
npm run loadtest:ai      # Requires ACCESS_TOKEN environment variable
npm run loadtest:mixed

# Azure production testing
TARGET_URL=https://your-main-service.azurewebsites.net npm run loadtest:main
```

Each benchmark reports:
- Requests per second (RPS distribution)
- Latency metrics (p50 / p95 / p99)
- Error rate and total error count
- Data throughput (bytes transferred)

### k6 Benchmarks

An equivalent `k6` script (`load-test/k6-benchmark.js`) supports staged traffic ramp-up:

```bash
k6 run load-test/k6-benchmark.js -e TARGET_URL=https://your-main-service.azurewebsites.net
```

---

## Azure Monitoring Metrics

During load test runs, monitor the following metrics in Azure App Service (**Monitoring → Metrics**):

- **CPU Percentage**
- **Memory Percentage**
- **Http Queue Length**
- **Requests (by HTTP status code)**
- **Average Response Time**

> [!TIP]
> A rising **Http Queue Length** while CPU usage remains under 100% indicates I/O bottlenecks (database or Redis latency) rather than CPU saturation. Scale database capacity or add read replicas before upgrading App Service plans.
