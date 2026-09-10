"""
Control Effectiveness Engine (Upgrade 2).

Quantifies how much a given set of active controls reduces the likelihood
of exploitation, per SIH architecture section 2/6.

Every reduction factor is looked up in data_sources.CONTROL_LIKELIHOOD_REDUCTION,
which is explicit about which factors are empirically grounded (currently:
MFA, against credential-attack findings specifically, from a peer-reviewed
population study) versus illustrative placeholders. This module refuses to
silently invent a number for a control it doesn't recognize — it raises,
rather than defaulting to 0% or 100% reduction, either of which would be a
worse lie than an explicit error.

FINDING-AWARE APPLICABILITY (SIH 26105 follow-up critique #4) — MFA
shouldn't reduce every finding's likelihood by its full cited factor; it
should only apply to findings whose attack class it actually mitigates
(credential attacks), not e.g. a SQL injection finding. `apply_controls()`
takes an OPTIONAL `attack_class` parameter:
  - omitted (None): behaves exactly as before — every active control is
    applied, no filtering. Existing callers (portfolio-level aggregation,
    quick-assessment, which don't have a single finding's attack class to
    reason about) are unaffected.
  - provided: controls not applicable to that attack class are excluded
    from the multiplicative reduction entirely (0% credit for that
    finding, not a discounted version of their cited factor) and named in
    the EvidenceTrail, so a judge asking "why doesn't MFA show up here"
    gets an explicit answer instead of a silently-smaller number.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import data_sources as ds
from .evidence import EvidenceTrail, FORMULA_VERSION, datapoint_source


class UnknownControlError(ValueError):
    """Raised when asked to score a control with no entry in the registry.
    Deliberately not a silent fallback — an unrecognized control should
    block the computation, surface in logs/tests, and force a deliberate
    decision (add a cited entry, or an explicit illustrative one) rather
    than quietly contributing 0 risk reduction to a real EAL figure."""


CONTROL_KEY_ALIASES: dict[str, str] = {
    "mfa": "mfa_credential_attacks",
    "fido2": "mfa_credential_attacks",
    "fido2_mfa": "mfa_credential_attacks",
    "edr": "edr_endpoint_detection",
    "xdr": "edr_endpoint_detection",
    "managed_edr": "edr_endpoint_detection",
    "microsegmentation": "network_segmentation",
    "segmentation": "network_segmentation",
    "patch_sla": "critical_patch_sla_7d",
    "patching": "critical_patch_sla_7d",
}


def normalize_control_key(control_key: str) -> str:
    """Resolve frontend shorthand aliases to canonical registered control keys."""
    cleaned = control_key.lower().strip()
    return CONTROL_KEY_ALIASES.get(cleaned, cleaned)


def _reduction_for(control_key: str) -> ds.DataPoint:
    canonical_key = normalize_control_key(control_key)
    dp = ds.CONTROL_LIKELIHOOD_REDUCTION.get(canonical_key)
    if dp is None:
        raise UnknownControlError(
            f"No effectiveness data for control '{control_key}'. Add a cited "
            f"entry (empirical) or an explicit placeholder (illustrative) to "
            f"data_sources.CONTROL_LIKELIHOOD_REDUCTION before using this "
            f"control in a risk calculation."
        )
    return dp


# ---------------------------------------------------------------------------
# Attack-class classification. Findings in this codebase carry a free-text
# `category` (Semgrep/tree-sitter rule labels like "SQL Injection",
# "Hardcoded Credentials", "Cross-Site Scripting") — NOT a structured attack
# taxonomy. This is a keyword-based heuristic mapping from that free text
# into the small canonical set of classes CONTROL_APPLICABLE_ATTACK_CLASSES
# uses. It is a modeling judgment call, not a cited classifier — treat
# misclassification as expected at the margins, which is exactly why
# unmatched categories fall back to the CONSERVATIVE side (see below)
# rather than either extreme.
# ---------------------------------------------------------------------------
_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    ("sql injection", "sql_injection"),
    ("sqli", "sql_injection"),
    ("command injection", "command_injection"),
    ("os command", "command_injection"),
    ("cross-site scripting", "xss"),
    ("cross site scripting", "xss"),
    ("xss", "xss"),
    ("path traversal", "path_traversal"),
    ("directory traversal", "path_traversal"),
    ("ssrf", "ssrf"),
    ("server-side request forgery", "ssrf"),
    ("credential", "credential_exposure"),
    ("hardcoded secret", "credential_exposure"),
    ("hardcoded password", "credential_exposure"),
    ("api key", "credential_exposure"),
    ("authentication", "authentication_bypass"),
    ("auth bypass", "authentication_bypass"),
    ("deserialization", "code_execution"),
    ("remote code execution", "code_execution"),
    ("rce", "code_execution"),
    ("injection", "injection"),  # generic catch-all injection, checked after specific injection types above
]


def classify_attack_class(category: str | None) -> str:
    """Best-effort mapping from a finding's free-text category into a
    canonical attack class. Returns "unclassified" — never a guess dressed
    up as a match — when nothing keys off the category text; callers treat
    "unclassified" conservatively (see apply_controls' docstring)."""
    if not category:
        return "unclassified"
    lowered = category.lower()
    for keyword, attack_class in _CATEGORY_KEYWORDS:
        if keyword in lowered:
            return attack_class
    return "unclassified"


def applicable_controls(attack_class: str, candidate_control_keys: list[str]) -> tuple[list[str], list[str]]:
    """Splits candidate_control_keys into (applicable, excluded) for the
    given attack_class.

    "unclassified" gets the CONSERVATIVE treatment deliberately: only
    genuinely attack-class-agnostic controls ("*" in the registry, e.g.
    critical_patch_sla_7d) apply; everything else is excluded. This is an
    intentional under-credit rather than the old indiscriminate
    over-credit — being wrong in the direction of "we didn't credit a
    control that might actually have applied" is defensible in front of a
    judge; being wrong in the direction of "we credited MFA against a SQL
    injection finding" is not.
    """
    applicable, excluded = [], []
    for key in candidate_control_keys:
        canon = normalize_control_key(key)
        scope = ds.CONTROL_APPLICABLE_ATTACK_CLASSES.get(canon, "*")
        if scope == "*":
            applicable.append(canon)
        elif attack_class != "unclassified" and attack_class in scope:
            applicable.append(canon)
        else:
            excluded.append(canon)
    return applicable, excluded


@dataclass
class ControlResidualResult:
    pre_control_likelihood: float
    post_control_likelihood: float
    applied_controls: list[str]
    risk_reduction_pct: float


def apply_controls(
    pre_control_likelihood: float,
    active_control_keys: list[str],
    attack_class: str | None = None,
) -> tuple[ControlResidualResult, EvidenceTrail]:
    """Combine multiple controls' reduction factors multiplicatively against
    surviving risk (i.e. independent-defense-in-depth assumption: each
    control reduces what's LEFT, not the original total). This avoids the
    common naive-additive bug where 3 controls each claiming ~40% reduction
    would otherwise sum past 100%. The independence assumption itself is a
    simplification — real controls often have correlated failure modes
    (e.g. an attacker who bypasses EDR may also be positioned to bypass
    segmentation) — flagged here rather than silently assumed away.

    If `attack_class` is given, controls inapplicable to it (see
    applicable_controls()) are excluded from the reduction entirely before
    the multiplicative combination runs, and named in the trail.
    """
    if attack_class is not None:
        applicable_keys, excluded_keys = applicable_controls(attack_class, active_control_keys)
    else:
        applicable_keys, excluded_keys = list(active_control_keys), []

    residual = pre_control_likelihood
    sources = []
    for key in applicable_keys:
        dp = _reduction_for(key)
        residual *= (1.0 - dp.value)
        sources.append(datapoint_source(f"control:{key}", dp))

    reduction_pct = (
        0.0 if pre_control_likelihood == 0
        else (pre_control_likelihood - residual) / pre_control_likelihood
    )

    result = ControlResidualResult(
        pre_control_likelihood=pre_control_likelihood,
        post_control_likelihood=residual,
        applied_controls=applicable_keys,
        risk_reduction_pct=reduction_pct,
    )

    illustrative_count = sum(
        1 for k in applicable_keys
        if ds.CONTROL_LIKELIHOOD_REDUCTION[k].tier == ds.ConfidenceTier.ILLUSTRATIVE
    )

    trail = EvidenceTrail(
        score_type="control_adjusted_likelihood",
        inputs={
            "pre_control_likelihood": pre_control_likelihood,
            "active_controls": active_control_keys,
            "attack_class": attack_class,
            "applied_controls": applicable_keys,
            "excluded_as_inapplicable": excluded_keys,
            "combination_method": "multiplicative_independent_defense_in_depth",
        },
        data_sources=sources,
        formula_version=FORMULA_VERSION,
        explanation=(
            f"Applied {len(applicable_keys)} control(s) multiplicatively "
            f"against surviving likelihood, reducing {pre_control_likelihood:.3f} "
            f"to {residual:.3f} ({reduction_pct:.0%} reduction). "
            + (f"{illustrative_count} of {len(applicable_keys)} control(s) use "
               f"ILLUSTRATIVE (non-empirical) effectiveness estimates. "
               if illustrative_count else
               "All applied controls use empirically-sourced estimates. " if applicable_keys else "")
            + (f"Excluded as inapplicable to attack_class={attack_class!r}: "
               f"{excluded_keys} — these receive 0% credit for this finding, "
               f"not their normal cited factor."
               if excluded_keys else "")
        ),
    )
    return result, trail


def marginal_risk_reduction_usd(
    pre_control_likelihood: float,
    impact_total_usd: float,
    already_active: list[str],
    candidate_control: str,
    attack_class: str | None = None,
) -> float:
    """EAL reduction (in USD) from adding ONE more control on top of
    whatever's already active. This is the per-candidate number the
    Optimization Engine (optimization.py) needs to run a budget-constrained
    knapsack over control investments. Pass `attack_class` to correctly
    return 0 for a candidate control that doesn't apply to this finding's
    attack class, instead of crediting it anyway."""
    before, _ = apply_controls(pre_control_likelihood, already_active, attack_class)
    after, _ = apply_controls(pre_control_likelihood, already_active + [candidate_control], attack_class)
    return (before.post_control_likelihood - after.post_control_likelihood) * impact_total_usd
