"""
Same test as live_server_test.py, but /heavy offloads the CPU-bound work
to a thread pool executor instead of awaiting it inline — the standard
FastAPI fix for a blocking sync call in an async route.
"""
import os
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import asyncio
import math
import random
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
import uvicorn
import httpx

app = FastAPI()
_executor = ThreadPoolExecutor(max_workers=8)


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
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_executor, run_monte_carlo, 42)
    return {"p50": result}


async def main():
    config = uvicorn.Config(app, host="127.0.0.1", port=8735, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    await asyncio.sleep(1.0)

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8735", timeout=30) as client:
        baseline_latencies = []
        for _ in range(30):
            t0 = time.perf_counter()
            await client.get("/health")
            baseline_latencies.append((time.perf_counter() - t0) * 1000)

        async def hit_health():
            t0 = time.perf_counter()
            await client.get("/health")
            return (time.perf_counter() - t0) * 1000

        async def hit_heavy():
            await client.get("/heavy")

        heavy_tasks = [asyncio.create_task(hit_heavy()) for _ in range(20)]
        await asyncio.sleep(0.01)
        health_tasks = [asyncio.create_task(hit_health()) for _ in range(30)]
        health_latencies_under_load = await asyncio.gather(*health_tasks)
        await asyncio.gather(*heavy_tasks)

    server.should_exit = True
    await server_task

    def pctl(data, p):
        s = sorted(data)
        return s[min(int(p * len(s)), len(s) - 1)]

    print("\n=== [THREAD-POOL-OFFLOADED] /health latency, NO concurrent heavy load ===")
    print(f"  p50={pctl(baseline_latencies, 0.5):.1f}ms  p95={pctl(baseline_latencies, 0.95):.1f}ms  max={max(baseline_latencies):.1f}ms")

    print("\n=== [THREAD-POOL-OFFLOADED] /health latency, WITH 20 concurrent /heavy requests in flight ===")
    print(f"  p50={pctl(health_latencies_under_load, 0.5):.1f}ms  p95={pctl(health_latencies_under_load, 0.95):.1f}ms  max={max(health_latencies_under_load):.1f}ms")

    degradation = pctl(health_latencies_under_load, 0.95) / pctl(baseline_latencies, 0.95)
    print(f"\np95 degradation factor: {degradation:.1f}x  (vs 85.6x with no offload)")


asyncio.run(main())
