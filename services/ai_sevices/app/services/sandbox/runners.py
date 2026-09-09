"""Language-specific sandbox runners.

Each runner turns one patched file into an ordered list of phases
(compile/syntax-check → test → execute), matching the pipeline shape in
docs/architecture.md. Every runner here operates on the SINGLE patched file
that's already available at fix-verification time (see
scanner.py::generate_and_verify_fix) rather than a full repo checkout —
running the repo's real test suite would additionally need to clone the repo
and install its dependencies inside the sandbox, which is real future work
(the `BaseRunner.plan()` contract below is what that would plug into) but
out of scope for what this hackathon build ships today. Only JavaScript and
Python are implemented; every other extension in LANGUAGE_BY_EXTENSION
resolves to `UnsupportedRunner`, which reports "unsupported" rather than
silently skipping — the architecture (this registry) already covers adding
java/go/rust/cpp runners the same way.
"""

from __future__ import annotations

import re
import shutil
import sys
from typing import Optional

LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".c": "cpp",
}


def detect_language(file_path: str) -> Optional[str]:
    for ext, lang in LANGUAGE_BY_EXTENSION.items():
        if file_path.endswith(ext):
            return lang
    return None


class BaseRunner:
    language = "unknown"

    def available(self) -> bool:
        """Whether this runner's toolchain is actually installed in this
        container. Checked once per execution — a runner being *implemented*
        doesn't mean its interpreter/compiler is present in this image."""
        return True

    def plan(self, workdir: str, filename: str, content: str) -> list[dict]:
        """Return an ordered list of {"name", "cmd"} phase specs. Execution
        stops at the first non-skipped phase that fails."""
        raise NotImplementedError


class PythonRunner(BaseRunner):
    language = "python"

    def available(self) -> bool:
        return shutil.which(sys.executable) is not None or shutil.which("python3") is not None

    def _interpreter(self) -> str:
        return sys.executable or "python3"

    def plan(self, workdir: str, filename: str, content: str) -> list[dict]:
        py = self._interpreter()
        phases = [{"name": "syntax_check", "cmd": [py, "-m", "py_compile", filename]}]

        looks_like_pytest = bool(re.search(r"^\s*def test_[A-Za-z0-9_]*\s*\(", content, re.MULTILINE)) or (
            "import pytest" in content
        )
        has_main_guard = "__main__" in content and re.search(
            r"if\s+__name__\s*==\s*[\"']__main__[\"']\s*:", content
        )

        if looks_like_pytest:
            phases.append({"name": "test", "cmd": [py, "-m", "pytest", filename, "-q", "--no-header"]})
        elif has_main_guard:
            phases.append({"name": "execute", "cmd": [py, filename]})

        return phases


class JavaScriptRunner(BaseRunner):
    language = "javascript"

    def available(self) -> bool:
        return shutil.which("node") is not None

    def plan(self, workdir: str, filename: str, content: str) -> list[dict]:
        phases = [{"name": "syntax_check", "cmd": ["node", "--check", filename]}]

        # Only attempt a real execute phase when the file has no imports —
        # relative or bare-specifier `require`/`import` almost always means
        # it depends on the rest of the repo (or node_modules) that this
        # single-file sandbox doesn't have, which would just fail on
        # MODULE_NOT_FOUND and produce a misleading "fix broke the patch"
        # signal rather than a real one.
        has_imports = bool(
            re.search(r"require\(\s*['\"]", content) or re.search(r"^\s*import\s.+from\s+['\"]", content, re.MULTILINE)
        )
        if not has_imports:
            phases.append({"name": "execute", "cmd": ["node", filename]})

        return phases


class UnsupportedRunner(BaseRunner):
    def __init__(self, language: str):
        self.language = language

    def available(self) -> bool:
        return False

    def plan(self, workdir: str, filename: str, content: str) -> list[dict]:
        return []


_RUNNERS = {
    "python": PythonRunner(),
    "javascript": JavaScriptRunner(),
}


def get_runner(language: Optional[str]) -> BaseRunner:
    if language and language in _RUNNERS:
        return _RUNNERS[language]
    return UnsupportedRunner(language or "unknown")
