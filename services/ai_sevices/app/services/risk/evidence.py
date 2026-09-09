"""
Evidence + Explainability layer.

Every number the risk engine produces (an EAL, a VaR, a control-adjusted
likelihood, an investment recommendation) must carry a trail showing:
  - which findings/assets/controls fed it
  - which named data sources and confidence tier backed each input
  - the exact formula/version that combined them
  - a human-readable explanation string

This is the one piece of the 5 upgrades that is close to "just write the
code" — there's no fundamental blocker like there is for calibration. The
trail is what turns "the model said $4.2M" into something a CISO can
actually defend to a board or an auditor.

AUDIT-GRADE FIELDS (SIH 26105 follow-up critique #9) — `input_hash` and
`data_snapshot_id` were added on top of the original 5 fields:
  - `input_hash`: a SHA-256 of `inputs`, computed automatically in
    `__post_init__` — never passed in by a caller, so it can't drift from
    what `inputs` actually contains. This is the concrete form of
    "same inputs + same model/data snapshot = same result": anyone can
    independently recompute this hash from the `inputs` dict in the same
    trail and confirm nothing was altered after the fact.
  - `data_snapshot_id`: identifies which snapshot of an EXTERNAL, mutable
    data source (e.g. the CISA KEV catalog — see kev.py) backed this
    score, when one was consulted. Defaults to "n/a" for the (still
    common) case where no such external, versioned snapshot was involved
    — this codebase's own data_sources.py DataPoints are static citations,
    not a mutable feed, so they don't need a snapshot id of their own.

Deliberately NOT added: a separate "model_version" field distinct from
`formula_version`. The critique that prompted these fields showed both
side by side with independently-varying example values — but this
codebase has exactly one version lineage today (FORMULA_VERSION), and
inventing a second, separately-incrementing "model_version" string with
no real process behind it would be fabricated precision, the exact thing
this module exists to prevent elsewhere. Add a real `model_version` field
the day a specific sub-model (e.g. the calibration engine) actually
acquires its own independent version lineage — not before.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


FORMULA_VERSION = "risk-engine-v1"


@dataclass
class EvidenceTrail:
    score_type: str                     # e.g. "expected_annual_loss"
    inputs: dict[str, Any]               # raw inputs used
    data_sources: list[dict[str, str]]   # [{name, tier, source, as_of}, ...]
    formula_version: str
    explanation: str
    computed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    data_snapshot_id: str = "n/a"
    input_hash: str = field(default="", init=True)

    def __post_init__(self) -> None:
        if not self.input_hash:
            # sort_keys for determinism; default=str so any non-JSON-native
            # value (e.g. a set, a dataclass someone forgot to convert)
            # still hashes instead of raising, at the cost of that value's
            # repr being what's hashed rather than a canonical form — an
            # acceptable tradeoff for an audit aid, not a cryptographic
            # commitment scheme.
            payload = json.dumps(self.inputs, sort_keys=True, default=str)
            self.input_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def has_illustrative_input(self) -> bool:
        """True if ANY input backing this score is a placeholder rather
        than an empirically-sourced figure. Callers (API responses, UI)
        should surface this prominently — e.g. a visible badge — rather
        than let an illustrative number sit next to empirical ones with
        no visual distinction."""
        return any(s.get("tier") == "illustrative" for s in self.data_sources)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score_type": self.score_type,
            "inputs": self.inputs,
            "data_sources": self.data_sources,
            "formula_version": self.formula_version,
            "explanation": self.explanation,
            "computed_at": self.computed_at,
            "data_snapshot_id": self.data_snapshot_id,
            "input_hash": self.input_hash,
            "contains_illustrative_data": self.has_illustrative_input(),
        }


def datapoint_source(name: str, dp) -> dict[str, str]:
    """Convert a data_sources.DataPoint into the dict shape EvidenceTrail
    expects, tagged with its confidence tier so it survives serialization."""
    return {
        "name": name,
        "tier": dp.tier.value,
        "source": dp.source,
        "as_of": dp.as_of,
    }
