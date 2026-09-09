# Monte Carlo Performance Benchmarks (P2)

Reproducible scripts backing the P2 performance findings in
`docs/sih-26105-alignment.md`. Run each with:

```
PYTHONPATH=services/ai_sevices python3 scripts/benchmarks/<script>.py
```

- `bench_montecarlo_isolated.py` — isolated CPU-bound latency/throughput
  of `var_simulation`'s 10,000-draw Monte Carlo loop, at 1/10/50/100
  logical concurrency, across three execution strategies (inline,
  thread-pool, process-pool). No real ASGI server involved — measures the
  computation alone.

- `bench_live_server_no_offload.py` — a REAL uvicorn server with two
  routes: a trivial `/health` and a `/heavy` that runs the same Monte
  Carlo computation **inline** (the pattern this codebase's routers
  currently use: `await` a sync function directly, no executor offload).
  Measures whether 20 concurrent `/heavy` requests degrade `/health`'s
  latency — i.e., whether the computation blocks the whole event loop,
  not just the endpoint that triggered it.

- `bench_live_server_thread_pool.py` / `bench_live_server_process_pool.py`
  — the same live-server test with `/heavy` offloaded via
  `run_in_executor` to a thread pool / process pool respectively — the
  standard fixes for a blocking sync call in an async route.

## Honest limitation

This sandbox (and the box these were last run on) has **1 CPU core**
(`nproc`). That means:

- The inline-blocking result (event-loop degradation) is real and not an
  artifact of the core count — it reproduces the actual mechanism
  (Python holding the event-loop thread hostage during a CPU-bound call).
- The thread-pool / process-pool "fix" results are **not conclusive** on
  this hardware: with only one core, there is no real parallelism to
  exploit, so neither offload strategy showed improvement here. On a
  real multi-core host, `run_in_executor` (thread pool) is expected to
  meaningfully un-block the event loop for *other* endpoints even without
  speeding up the Monte Carlo computation itself, and a process pool
  should additionally parallelize the computation. Re-run these scripts
  on real production-shaped hardware before trusting the offload-fix
  numbers specifically — only the "inline blocking is real" finding
  should be taken from this session's single-core run.
