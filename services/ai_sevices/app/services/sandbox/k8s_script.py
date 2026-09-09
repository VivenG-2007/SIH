"""Builds the in-pod execution script for the Kubernetes sandbox backend.

Why a marker-based text protocol instead of, say, writing a JSON result file:
the *only* channel this service gets back from an ephemeral pod is its
container logs (`kubectl logs` / `read_namespaced_pod_log`) — the pod and its
writable emptyDir are gone the moment the Job finishes and gets cleaned up.
So the script's real job is to serialize each phase's outcome onto its own
stdout in a form that survives arbitrary program output (including control
characters or `###`-looking text the patched file itself might print) and is
cheap to parse back out. Each phase's captured stdout/stderr is therefore
base64-encoded before being echoed, and wrapped in fixed marker lines that
`k8s_executor.parse_phase_log` looks for. See that module for the reader
side.

Only python3/node are ever passed in today (runners.py's `_RUNNERS`
registry) — this module doesn't care what the command is, it just needs each
phase's argv, a name, and a per-phase timeout.
"""

from __future__ import annotations

import shlex

PHASE_MARKER = "###PATCHLINEX_PHASE###"
STDOUT_MARKER = "###PATCHLINEX_STDOUT_B64###"
STDERR_MARKER = "###PATCHLINEX_STDERR_B64###"
PHASE_END_MARKER = "###PATCHLINEX_PHASE_END###"
DONE_MARKER = "###PATCHLINEX_DONE###"


def render_sandbox_script(
    phase_specs: list[dict],
    filename: str,
    wall_clock_timeout_seconds: int,
) -> str:
    """Returns the full `/bin/sh` script text.

    `phase_specs` is exactly what `BaseRunner.plan()` returns (see
    runners.py) — a list of `{"name": str, "cmd": list[str]}` in execution
    order. The generated script runs them in that same order and stops at
    the first failing/timed-out phase, mirroring `execute.py::execute_patch`'s
    break-on-first-failure behavior for the process backend, so both
    backends produce comparable results.

    The patched file itself is NOT embedded in this script — it's delivered
    separately via the ConfigMap's `source` key and copied into place by the
    first line below, so this script's own content never depends on
    (and can't be corrupted by) the patched file's content.
    """

    filename_q = shlex.quote(filename)
    timeout_q = str(max(1, int(wall_clock_timeout_seconds)))

    lines = [
        "#!/bin/sh",
        "set -u",
        "cp /cm/source " + filename_q,
        "",
        "run_phase() {",
        '  _name="$1"; _to="$2"; shift 2',
        '  _out="/workspace/.phase_out"; _err="/workspace/.phase_err"',
        '  : > "$_out"; : > "$_err"',
        '  timeout -k 2 "$_to" "$@" >"$_out" 2>"$_err"',
        '  _code=$?',
        '  if [ "$_code" -eq 124 ] || [ "$_code" -eq 137 ]; then _timedout=1; else _timedout=0; fi',
        f'  printf \'%s name=%s exit=%s timedout=%s\\n\' "{PHASE_MARKER}" "$_name" "$_code" "$_timedout"',
        f'  echo "{STDOUT_MARKER}"',
        '  base64 -w0 "$_out" 2>/dev/null || base64 "$_out" | tr -d \'\\n\'',
        "  echo",
        f'  echo "{STDERR_MARKER}"',
        '  base64 -w0 "$_err" 2>/dev/null || base64 "$_err" | tr -d \'\\n\'',
        "  echo",
        f'  echo "{PHASE_END_MARKER}"',
        '  return "$_code"',
        "}",
        "",
    ]

    if not phase_specs:
        # No phases to run (shouldn't normally happen — the executor checks
        # for a mapped language/image before ever creating this script —
        # but fail loudly and cleanly rather than silently reporting success).
        lines += [
            f'echo "{DONE_MARKER}"',
            "exit 1",
        ]
        return "\n".join(lines) + "\n"

    for i, spec in enumerate(phase_specs):
        name_q = shlex.quote(str(spec["name"]))
        argv_q = " ".join(shlex.quote(str(a)) for a in spec["cmd"])
        lines.append(f"run_phase {name_q} {timeout_q} {argv_q}")
        lines.append("_final=$?")
        if i < len(phase_specs) - 1:
            lines.append('if [ "$_final" -ne 0 ]; then')
            lines.append(f'  echo "{DONE_MARKER}"')
            lines.append('  exit "$_final"')
            lines.append("fi")

    lines.append(f'echo "{DONE_MARKER}"')
    lines.append('exit "$_final"')

    return "\n".join(lines) + "\n"
