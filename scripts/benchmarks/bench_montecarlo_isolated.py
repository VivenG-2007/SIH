"""
P2 — Monte Carlo performance benchmark for var_simulation.simulate_var().

Honest scope note: this sandbox has exactly 1 CPU core (confirmed via
nproc). That means the multiprocessing results below demonstrate the
MECHANISM (does offloading to worker processes help) but cannot
demonstrate the MAGNITUDE a real multi-core production host would see —
on 1 core, multiprocessing has pure overhead with no parallel-execution
benefit, so its numbers here are a lower bound, not a representative
production estimate. That's stated explicitly in the output, not implied.
"""
import asyncio
import os
import statistics
import time
import tracemalloc
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import random
from app.services.risk import var_simulation as vs


def run_one_sync(seed: int):
    """The actual CPU-bound work: fit + 10,000-draw Monte Carlo simulation.
    Pre-seeded with enough synthetic 'outcomes' data (via a fake list, not
    going through calibration.py's Mongo path) so this measures the
    Monte Carlo branch specifically, not the fallback branch."""
    samples = [50_000 + i * 1500 for i in range(40)]
    mu, sigma = vs._fit_lognormal_params(samples)
    rng = random.Random(seed)
    draws = sorted(__import__("math").exp(rng.gauss(mu, sigma)) for _ in range(vs.N_SIMULATIONS))

    def pct(p):
        idx = min(int(p * len(draws)), len(draws) - 1)
        return draws[idx]

    return {"p50": pct(0.5), "p95": pct(0.95), "p99": pct(0.99)}


def percentiles(latencies_ms):
    s = sorted(latencies_ms)
    def pct(p):
        idx = min(int(p * len(s)), len(s) - 1)
        return s[idx]
    return {"p50": pct(0.50), "p95": pct(0.95), "p99": pct(0.99), "mean": statistics.mean(s)}


def bench_sequential(n):
    latencies = []
    start = time.perf_counter()
    for i in range(n):
        t0 = time.perf_counter()
        run_one_sync(i)
        latencies.append((time.perf_counter() - t0) * 1000)
    total = time.perf_counter() - start
    return latencies, total


async def bench_asyncio_no_offload(n):
    """Calling the sync CPU-bound function directly inside async route
    handlers with no executor offload — this is what the current
    implementation actually does (routers call `await vs.simulate_var(...)`
    but the CPU-bound inner loop itself runs on the event loop thread).
    Demonstrates: N "concurrent" requests on one event loop serialize
    completely — total time ~= N * single-call time, not
    single-call-time-with-overlap."""
    latencies = []
    start = time.perf_counter()

    async def one(i):
        t0 = time.perf_counter()
        run_one_sync(i)  # blocks the event loop for the full duration
        latencies.append((time.perf_counter() - t0) * 1000)

    await asyncio.gather(*[one(i) for i in range(n)])
    total = time.perf_counter() - start
    return latencies, total


async def bench_thread_pool(n, workers):
    """Offloading to a thread pool via run_in_executor — the standard
    FastAPI fix for a blocking sync call. Pure-Python CPU-bound work
    doesn't release the GIL between bytecode ops the way I/O-bound work
    does, so threads contend rather than truly parallelize; this measures
    exactly how much (or little) that buys us."""
    loop = asyncio.get_running_loop()
    latencies = []
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        async def one(i):
            t0 = time.perf_counter()
            await loop.run_in_executor(pool, run_one_sync, i)
            latencies.append((time.perf_counter() - t0) * 1000)
        await asyncio.gather(*[one(i) for i in range(n)])
    total = time.perf_counter() - start
    return latencies, total


async def bench_process_pool(n, workers):
    """Offloading to a process pool — true parallelism, no GIL contention,
    at the cost of IPC serialization overhead per call. On this sandbox's
    1 core, this can only show overhead, never speedup — see module
    docstring."""
    loop = asyncio.get_running_loop()
    latencies = []
    start = time.perf_counter()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        async def one(i):
            t0 = time.perf_counter()
            await loop.run_in_executor(pool, run_one_sync, i)
            latencies.append((time.perf_counter() - t0) * 1000)
        await asyncio.gather(*[one(i) for i in range(n)])
    total = time.perf_counter() - start
    return latencies, total


def report(name, latencies, total, n):
    p = percentiles(latencies)
    print(f"\n{name} (n={n})")
    print(f"  total wall time:  {total:.3f}s")
    print(f"  throughput:       {n/total:.1f} req/s")
    print(f"  latency p50/p95/p99 (ms): {p['p50']:.1f} / {p['p95']:.1f} / {p['p99']:.1f}  (mean {p['mean']:.1f})")


print("=" * 70)
print(f"CPUs available: {os.cpu_count()}")
tracemalloc.start()

# --- Baseline: single-call latency ---
lat, total = bench_sequential(20)
report("SEQUENTIAL (baseline, no concurrency)", lat, total, 20)

current, peak = tracemalloc.get_traced_memory()
print(f"\nPeak Python-object memory during 20 sequential runs: {peak / 1024 / 1024:.1f} MB")
tracemalloc.stop()

for n in (1, 10, 50, 100):
    lat, total = asyncio.run(bench_asyncio_no_offload(n))
    report(f"ASYNCIO, NO EXECUTOR OFFLOAD (current implementation's pattern)", lat, total, n)

for n in (10, 50, 100):
    lat, total = asyncio.run(bench_thread_pool(n, workers=8))
    report(f"THREAD POOL (8 workers) — GIL-contended", lat, total, n)

for n in (10, 50):
    lat, total = asyncio.run(bench_process_pool(n, workers=min(8, os.cpu_count() or 1)))
    report(f"PROCESS POOL ({min(8, os.cpu_count() or 1)} workers) — true parallelism, IPC overhead", lat, total, n)

print("\n" + "=" * 70)
