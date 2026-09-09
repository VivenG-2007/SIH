# Unit tests for app/services/sandbox/ — the isolated execution sandbox that
# gives fix verification a third, independent signal (actually compiling/
# running the patch) alongside the deterministic rescan and the AI review
# pass. These tests exercise real subprocesses (python -m py_compile / node
# --check), not mocks, since the whole point of this module is what actually
# happens when the sandbox runs untrusted code.

import os
import shutil

import pytest

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.services.sandbox import execute_patch
from app.services.sandbox.base import SandboxLimits
from app.services.sandbox.runners import detect_language, get_runner, PythonRunner, UnsupportedRunner

NODE_AVAILABLE = shutil.which("node") is not None


def test_detect_language_by_extension():
    assert detect_language("src/app.py") == "python"
    assert detect_language("src/app.js") == "javascript"
    assert detect_language("src/app.jsx") == "javascript"
    assert detect_language("src/App.java") == "java"
    assert detect_language("README.md") is None


def test_get_runner_falls_back_to_unsupported_for_unimplemented_languages():
    runner = get_runner("java")
    assert isinstance(runner, UnsupportedRunner)
    assert runner.available() is False
    assert runner.plan("wd", "App.java", "class App {}") == []


@pytest.mark.asyncio
async def test_valid_python_patch_passes_syntax_check():
    result = await execute_patch(
        file_path="utils.py",
        fixed_content="def add(a, b):\n    return a + b\n",
        limits=SandboxLimits(wall_clock_timeout_seconds=5),
    )
    assert result.status == "completed"
    assert result.language == "python"
    assert result.passed is True
    assert [p.name for p in result.phases] == ["syntax_check"]
    assert result.phases[0].exit_code == 0


@pytest.mark.asyncio
async def test_syntactically_broken_python_patch_fails_and_stops_at_first_phase():
    result = await execute_patch(
        file_path="utils.py",
        fixed_content="def add(a, b:\n    return a + b\n",  # missing closing paren
        limits=SandboxLimits(wall_clock_timeout_seconds=5),
    )
    assert result.status == "completed"
    assert result.passed is False
    assert result.phases[0].name == "syntax_check"
    assert result.phases[0].exit_code != 0
    assert "syntax" in result.stderr.lower() or "SyntaxError" in result.stderr


@pytest.mark.asyncio
async def test_pytest_style_python_file_runs_the_test_phase():
    content = (
        "def add(a, b):\n"
        "    return a + b\n\n"
        "def test_add_returns_sum():\n"
        "    assert add(2, 3) == 5\n"
    )
    result = await execute_patch(
        file_path="test_math.py", fixed_content=content, limits=SandboxLimits(wall_clock_timeout_seconds=10)
    )
    assert [p.name for p in result.phases] == ["syntax_check", "test"]
    assert result.passed is True


@pytest.mark.asyncio
async def test_failing_pytest_case_is_reported_as_not_passed():
    content = (
        "def add(a, b):\n"
        "    return a - b\n\n"  # deliberately wrong\n
        "def test_add_returns_sum():\n"
        "    assert add(2, 3) == 5\n"
    )
    result = await execute_patch(
        file_path="test_math.py", fixed_content=content, limits=SandboxLimits(wall_clock_timeout_seconds=10)
    )
    assert result.passed is False
    assert any(p.name == "test" and not p.passed for p in result.phases)


@pytest.mark.asyncio
async def test_infinite_loop_is_killed_by_wall_clock_timeout():
    content = "if __name__ == '__main__':\n    while True:\n        pass\n"
    result = await execute_patch(
        file_path="loop.py", fixed_content=content, limits=SandboxLimits(wall_clock_timeout_seconds=2, cpu_seconds=2)
    )
    assert result.passed is False
    execute_phase = next(p for p in result.phases if p.name == "execute")
    # Either the CPU rlimit or the wall-clock timeout should have stopped it —
    # either way it must not have run forever or reported a clean exit.
    assert execute_phase.timed_out or execute_phase.exit_code != 0


@pytest.mark.skipif(not NODE_AVAILABLE, reason="node not installed in this test environment")
@pytest.mark.asyncio
async def test_valid_javascript_patch_passes_syntax_check_and_executes():
    result = await execute_patch(
        file_path="app.js",
        fixed_content="console.log('ok');\n",
        limits=SandboxLimits(wall_clock_timeout_seconds=5),
    )
    assert result.language == "javascript"
    assert [p.name for p in result.phases] == ["syntax_check", "execute"]
    assert result.passed is True


@pytest.mark.skipif(not NODE_AVAILABLE, reason="node not installed in this test environment")
@pytest.mark.asyncio
async def test_javascript_file_with_imports_skips_execute_phase():
    result = await execute_patch(
        file_path="app.js",
        fixed_content="const express = require('express');\nconsole.log(express);\n",
        limits=SandboxLimits(wall_clock_timeout_seconds=5),
    )
    # No node_modules in the sandbox — running this would just fail on
    # MODULE_NOT_FOUND, which isn't a signal about the patch itself, so the
    # runner deliberately stops after the syntax check.
    assert [p.name for p in result.phases] == ["syntax_check"]


@pytest.mark.asyncio
async def test_unsupported_language_returns_error_status_without_raising():
    result = await execute_patch(file_path="Main.java", fixed_content="class Main {}")
    assert result.status == "error"
    assert result.phases == []


@pytest.mark.asyncio
async def test_sandbox_workdir_is_destroyed_after_execution():
    captured = {}
    original_plan = PythonRunner.plan

    def spying_plan(self, workdir, filename, content):
        captured["workdir"] = workdir
        return original_plan(self, workdir, filename, content)

    PythonRunner.plan = spying_plan
    try:
        await execute_patch(file_path="a.py", fixed_content="x = 1\n")
    finally:
        PythonRunner.plan = original_plan

    assert captured.get("workdir")
    assert not os.path.exists(captured["workdir"])
