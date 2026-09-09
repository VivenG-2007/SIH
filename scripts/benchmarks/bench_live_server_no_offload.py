"""
Real-server test: does the Monte Carlo simulation (running inline, no
executor offload — the current implementation's actual pattern) degrade
latency for OTHER, unrelated concurrent requests on the same event loop?

This is the thing an isolated microbenchmark can't show: it requires an
actual running ASGI server with two endpoints competing for the same
single-threaded event loop.
"""
import os
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import asyncio
import math
import random
import time

from fastapi import FastAPI
import uvicorn
import httpx

app = FastAPI()


def run_monte_carlo(seed: int):
    samples = [50_000 + i * 1500 for i in range(40)]
    logs = [math.log(s) for s in samples]
    mu = sum(logs) / len(logs)
    sigma = (sum((x - mu) ** 2 for x in logs) / len(logs)) ** 0.5
    rng = random.Random(seed)
    draws = sorted(math.exp(rng.gauss(mu, sigma)) for _ in range(10_000))
    return draws[5000]


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/heavy")
async def heavy():
    # Mirrors the current implementation exactly: a sync CPU-bound call
    # awaited directly with no run_in_executor offload.
    result = run_monte_carlo(42)
    return {"p50": result}


async def main():
    config = uvicorn.Config(app, host="127.0.0.1", port=8734, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    await asyncio.sleep(1.0)  # let it boot

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8734", timeout=30) as client:
        # --- Baseline: /health latency with NO concurrent /heavy load ---
        baseline_latencies = []
        for _ in range(30):
            t0 = time.perf_counter()
            await client.get("/health")
            baseline_latencies.append((time.perf_counter() - t0) * 1000)

        # --- /health latency WHILE 20 concurrent /heavy requests are in flight ---
        async def hit_health():
            t0 = time.perf_counter()
            await client.get("/health")
            return (time.perf_counter() - t0) * 1000

        async def hit_heavy():
            await client.get("/heavy")

        heavy_tasks = [asyncio.create_task(hit_heavy()) for _ in range(20)]
        await asyncio.sleep(0.01)  # let the heavy requests actually start hitting the server
        health_tasks = [asyncio.create_task(hit_health()) for _ in range(30)]
        health_latencies_under_load = await asyncio.gather(*health_tasks)
        await asyncio.gather(*heavy_tasks)

    server.should_exit = True
    await server_task

    def pctl(data, p):
        s = sorted(data)
        return s[min(int(p * len(s)), len(s) - 1)]

    print("\n=== /health latency, NO concurrent heavy load ===")
    print(f"  p50={pctl(baseline_latencies, 0.5):.1f}ms  p95={pctl(baseline_latencies, 0.95):.1f}ms  max={max(baseline_latencies):.1f}ms")

    print("\n=== /health latency, WITH 20 concurrent /heavy (Monte Carlo) requests in flight ===")
    print(f"  p50={pctl(health_latencies_under_load, 0.5):.1f}ms  p95={pctl(health_latencies_under_load, 0.95):.1f}ms  max={max(health_latencies_under_load):.1f}ms")

    degradation = pctl(health_latencies_under_load, 0.95) / pctl(baseline_latencies, 0.95)
    print(f"\np95 degradation factor: {degradation:.1f}x")


asyncio.run(main())
