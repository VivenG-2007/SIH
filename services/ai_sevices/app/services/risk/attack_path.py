"""
Attack-Path Visualization.

Builds the "Internet -> API -> Auth -> Internal Services -> Data Layer"
chain used by the Risk Simulation dashboard. Read this before assuming
every part of it is a real, derived signal:

WHAT IS REAL: which findings land in each stage (via
control_effectiveness.classify_attack_class(), the same real
classification pipeline_integration.py already uses to scope control
applicability), each stage's aggregate severity/status, and each stage's
EAL contribution (summed straight from financialImpact.expectedAnnualLossUsd
on the real findings that map there).

WHAT IS ILLUSTRATIVE: the STAGE TOPOLOGY ITSELF — a fixed, generic
5-stage web-request-flow shape (Internet -> API -> Auth -> Internal
Services -> Data Layer). This platform has no real network topology data
(no CSPM, no asset dependency mapping beyond the illustrative demo graph
in dependency_graph.py), so there is no way to derive an organization's
ACTUAL attack path. Presenting this chain as "your real attack path" would
be exactly the kind of fabricated-specificity this codebase's other
modules refuse to do. It is presented as a representative generic flow
that real, classified findings are plotted onto — accurate about what
kind of risk exists and where in a typical request lifecycle it sits,
honest about not being a map of this organization's actual network.

Findings with attack_class="unclassified" are deliberately NOT placed on
any stage — see classify_attack_class()'s own conservative-default
rationale. They're reported separately (`unclassified_finding_count`) so
their risk isn't hidden, just not assigned a fabricated location.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import control_effectiveness as ce

# Stage id -> (display label, attack classes that land here). A finding's
# attack_class can appear in more than one stage's set (e.g. sql_injection
# is exploited AT the entry point but its impact lands on the data layer)
# — deliberately not mutually exclusive, since a real request path isn't
# either.
STAGES: list[tuple[str, str, set[str]]] = [
    ("internet_entry", "Internet / API", {"injection", "sql_injection", "xss", "command_injection", "path_traversal", "ssrf"}),
    ("authentication", "Authentication", {"authentication_bypass", "credential_exposure"}),
    ("internal_services", "Internal Services", {"code_execution", "command_injection"}),
    ("data_layer", "Data Layer", {"sql_injection", "path_traversal"}),
]

_SEVERITY_RANK = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
_SEVERITY_STATUS = {4: "critical", 3: "high", 2: "medium", 1: "low", 0: "clear"}


@dataclass
class StageResult:
    stage_id: str
    label: str
    status: str  # "critical" | "high" | "medium" | "low" | "clear"
    finding_count: int
    eal_usd: float
    finding_ids: list[str] = field(default_factory=list)


@dataclass
class AttackPathResult:
    stages: list[StageResult]
    unclassified_finding_count: int
    unclassified_eal_usd: float


def build_attack_path(findings: list[dict]) -> AttackPathResult:
    """findings: real scanner Finding dicts (model_dump()), each expected
    to carry `financialImpact` (from pipeline_integration.compute_finding_risk)
    with `attackClass` and `expectedAnnualLossUsd`. Findings with no
    financialImpact (pricing failed/disabled) are skipped entirely rather
    than guessed at.
    """
    stage_results: list[StageResult] = []
    assigned_finding_ids: set[str] = set()

    for stage_id, label, classes in STAGES:
        matched = [
            f for f in findings
            if (f.get("financialImpact") or {}).get("attackClass") in classes
        ]
        severity_rank = max(
            (_SEVERITY_RANK.get(str(f.get("severity", "")).upper(), 0) for f in matched),
            default=0,
        )
        eal_total = sum((f.get("financialImpact") or {}).get("expectedAnnualLossUsd", 0.0) for f in matched)
        ids = [f.get("id") for f in matched if f.get("id")]
        assigned_finding_ids.update(ids)
        stage_results.append(StageResult(
            stage_id=stage_id,
            label=label,
            status=_SEVERITY_STATUS[severity_rank],
            finding_count=len(matched),
            eal_usd=round(eal_total, 2),
            finding_ids=ids,
        ))

    unclassified = [
        f for f in findings
        if (f.get("financialImpact") or {}).get("attackClass") == "unclassified"
    ]
    unclassified_eal = sum((f.get("financialImpact") or {}).get("expectedAnnualLossUsd", 0.0) for f in unclassified)

    return AttackPathResult(
        stages=stage_results,
        unclassified_finding_count=len(unclassified),
        unclassified_eal_usd=round(unclassified_eal, 2),
    )
