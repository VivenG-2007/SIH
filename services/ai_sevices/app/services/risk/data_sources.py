"""
Central registry of every external data point the risk-quantification layer
depends on.

Why this file exists: a financial or control-effectiveness model is only as
trustworthy as its inputs. It is trivially easy to make a risk score *look*
authoritative (a number with two decimal places) while it is actually a
guess. This module draws a hard line between:

  - EMPIRICAL: a number traceable to a named, dated, public study or report.
    These still are NOT a substitute for your own incident data — they are
    industry averages, not predictions about any specific organization.
  - ILLUSTRATIVE: a number we chose because something has to be plugged in
    to make the arithmetic run, with no empirical backing. These exist so
    the platform is demoable and structurally complete; they MUST be
    replaced with organization-specific or actuarially-reviewed figures
    before any of this is used for a real financial or board-level decision.

Every constant below is tagged with its tier. financial_model.py and
control_effectiveness.py are required to carry that tag through into the
EvidenceTrail (see evidence.py) attached to every score they produce, so
nothing downstream can present an ILLUSTRATIVE number as if it were
EMPIRICAL.

Sources are current as of the date noted per entry. They will go stale —
breach-cost and patch-time figures are republished annually (IBM Cost of a
Data Breach Report, Verizon DBIR). Re-check and update `as_of` whenever a
new edition ships; a `data_sources_test.py` staleness check should flag
entries older than ~14 months.
"""

from dataclasses import dataclass
from enum import Enum


class ConfidenceTier(str, Enum):
    EMPIRICAL = "empirical"       # traceable to a named, dated public study
    ILLUSTRATIVE = "illustrative"  # placeholder, no empirical backing


@dataclass(frozen=True)
class DataPoint:
    value: float
    tier: ConfidenceTier
    source: str
    as_of: str
    note: str = ""


# ---------------------------------------------------------------------------
# Breach cost by industry (USD, average total cost of a breach).
# Source: IBM Cost of a Data Breach Report 2025 (Ponemon Institute,
# 600 organizations, 17 industries, global study, published 2025).
# These are GLOBAL averages across organizations of many sizes — not a
# prediction for any one company. Use them as a prior to be replaced with
# the organization's own revenue-at-risk figures where available.
# ---------------------------------------------------------------------------
INDUSTRY_BREACH_COST_USD = {
    "healthcare":         DataPoint(7_420_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "financial_services":  DataPoint(5_560_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "industrial":          DataPoint(5_000_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "energy":              DataPoint(4_830_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "technology":          DataPoint(4_790_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "education":           DataPoint(3_800_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "retail":              DataPoint(3_540_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "public_sector":       DataPoint(2_860_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "global_average":      DataPoint(4_440_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
    "ransomware_extortion": DataPoint(5_080_000, ConfidenceTier.EMPIRICAL, "IBM Cost of a Data Breach Report 2025", "2025-07"),
}

# Fast detection/containment (AI + automation) is associated with lower
# average breach cost. This is a correlational industry figure, not a
# causal estimate for any specific control configuration.
AUTOMATION_COST_REDUCTION_USD = DataPoint(
    1_900_000, ConfidenceTier.EMPIRICAL,
    "IBM Cost of a Data Breach Report 2025 — orgs with extensive security AI/automation "
    "vs. none", "2025-07",
    note="Applies to organizations with EXTENSIVE deployment; partial deployment "
         "should not be assumed to capture the full reduction.",
)

# ---------------------------------------------------------------------------
# Patch/remediation timeliness — used to adjust exploitability likelihood.
# Source: Verizon 2025/2026 Data Breach Investigations Report.
# ---------------------------------------------------------------------------
MEDIAN_DAYS_TO_PATCH_KEV = DataPoint(
    43, ConfidenceTier.EMPIRICAL, "Verizon DBIR 2026", "2026-05",
    note="Median days to patch a CISA Known Exploited Vulnerability, up from 32 "
         "days the prior year.",
)
PCT_CRITICAL_KEV_FULLY_REMEDIATED = DataPoint(
    0.26, ConfidenceTier.EMPIRICAL, "Verizon DBIR 2026", "2026-05",
)
EDGE_DEVICE_MEDIAN_DAYS_TO_MASS_EXPLOITATION = DataPoint(
    0, ConfidenceTier.EMPIRICAL, "Verizon DBIR 2025", "2025-05",
    note="For new critical vulnerabilities in internet-facing edge devices "
         "(VPNs, firewalls), median time from disclosure to mass exploitation.",
)

# ---------------------------------------------------------------------------
# Control effectiveness — risk-REDUCTION factors, 0..1, applied to
# LIKELIHOOD (not impact). See control_effectiveness.py for how these
# combine. Anything not listed here defaults to ILLUSTRATIVE with a
# conservative, clearly-flagged placeholder — never silently to 0.
# ---------------------------------------------------------------------------
CONTROL_LIKELIHOOD_REDUCTION = {
    # MFA reduces the risk of account compromise by ~99.2% across a
    # population of >8M Microsoft commercial accounts studied over a full
    # year (peer-reviewed methodology). This is specific to CREDENTIAL-BASED
    # initial access, not to breach likelihood overall — CredentialAttack
    # findings should map here; other finding classes should not assume
    # this reduction applies.
    "mfa_credential_attacks": DataPoint(
        0.992, ConfidenceTier.EMPIRICAL,
        "Meyer et al., 'How effective is multi-factor authentication at "
        "deterring cyberattacks?', Microsoft Research / arXiv:2305.00945", "2023-05",
    ),
    # Illustrative placeholders below: directionally reasonable, NOT backed
    # by a study that isolated this control's marginal effect. Treat as a
    # starting prior to be replaced with the org's own control-testing data
    # or a vendor/insurer-provided actuarial table before relying on the
    # output for a real investment decision.
    "edr_endpoint_detection": DataPoint(
        0.45, ConfidenceTier.ILLUSTRATIVE, "No isolated causal study found — placeholder", "n/a",
    ),
    "network_segmentation": DataPoint(
        0.35, ConfidenceTier.ILLUSTRATIVE, "No isolated causal study found — placeholder", "n/a",
    ),
    "waf": DataPoint(
        0.30, ConfidenceTier.ILLUSTRATIVE, "No isolated causal study found — placeholder", "n/a",
    ),
    "critical_patch_sla_7d": DataPoint(
        0.50, ConfidenceTier.ILLUSTRATIVE,
        "Directionally informed by Verizon DBIR median-time-to-patch data "
        "(43 days) but not a measured causal effect of a 7-day SLA specifically",
        "n/a",
    ),
    # Direct aliases for common UI / shorthand keys
    "mfa": DataPoint(
        0.992, ConfidenceTier.EMPIRICAL,
        "Meyer et al., Microsoft Research (MFA reduction alias)", "2023-05",
    ),
    "fido2": DataPoint(
        0.992, ConfidenceTier.EMPIRICAL,
        "Meyer et al., Microsoft Research (MFA reduction alias)", "2023-05",
    ),
    "edr": DataPoint(
        0.45, ConfidenceTier.ILLUSTRATIVE,
        "Endpoint detection and response (EDR alias)", "n/a",
    ),
}

# ---------------------------------------------------------------------------
# Regulatory penalty ceilings — used by business_criticality.py to weight
# the "regulatory importance" leg of the criticality chain (Asset ->
# Business Service -> Revenue dependency -> Data sensitivity -> Regulatory
# importance -> Criticality score).
#
# The CEILING FIGURE for each named framework is a matter of public statute
# and is tagged EMPIRICAL — it is a fact about the law, not an estimate.
# What is NOT empirical, and must never be presented as if it were, is any
# claim that a given organization would actually be fined at this ceiling,
# or a precise relative "importance weight" between frameworks — that
# translation from "a statute exists with this ceiling" to "this asset's
# regulatory_importance score is exactly 0.83" is a modeling judgment, and
# business_criticality.py's EvidenceTrail says so explicitly.
# ---------------------------------------------------------------------------
REGULATORY_PENALTY_CEILING_USD = {
    # GDPR Article 83(5): higher of EUR 20M or 4% of total worldwide annual
    # turnover of the preceding financial year. EUR 20M shown here as the
    # statutory floor of the "higher of" ceiling; large multinationals'
    # actual exposure via the 4%-of-turnover branch can be far larger.
    "gdpr": DataPoint(
        20_000_000, ConfidenceTier.EMPIRICAL,
        "GDPR Article 83(5) — statutory ceiling (or 4% of global annual "
        "turnover, whichever is higher)", "2018-05",
        note="Turnover-based branch can exceed this fixed figure for large "
             "organizations; this constant is the fixed-EUR floor only.",
    ),
    # DPDP Act 2023 (India), Schedule: up to INR 250 crore per instance for
    # failure to implement reasonable security safeguards leading to a
    # personal data breach — the single largest tier in the Act's schedule.
    # Converted at an illustrative ~INR 83/USD for cross-framework
    # comparison only; the authoritative figure is the INR amount itself.
    "dpdp_act_2023": DataPoint(
        30_120_000, ConfidenceTier.EMPIRICAL,
        "Digital Personal Data Protection Act, 2023 (India), Schedule — "
        "penalty ceiling for failure to implement reasonable security "
        "safeguards (INR 250 crore)", "2023-08",
        note="USD figure is an illustrative conversion of a statutory INR "
             "250 crore ceiling for cross-framework comparison only; other "
             "DPDP tiers reach INR 200 crore (breach notification failure) "
             "and INR 150 crore (Significant Data Fiduciary audit failure).",
    ),
    # HIPAA civil monetary penalties are tiered by culpability and adjusted
    # for inflation annually by HHS OCR; this is the approximate top of the
    # highest tier's annual cap, not a per-incident figure.
    "hipaa": DataPoint(
        2_000_000, ConfidenceTier.ILLUSTRATIVE,
        "HHS OCR HIPAA civil monetary penalty tiers — approximate top-tier "
        "annual cap, inflation-adjusted yearly; treat as a rounded order-of-"
        "magnitude figure, not an exact current cap", "n/a",
    ),
    # PCI-DSS is a card-network contractual scheme, not a statute — fines
    # are levied by acquiring banks/card networks and vary by merchant
    # level, card brand, and duration of non-compliance. No single official
    # ceiling exists; this is an illustrative mid-point of commonly
    # reported ranges.
    "pci_dss": DataPoint(
        100_000, ConfidenceTier.ILLUSTRATIVE,
        "Commonly reported acquirer/card-network non-compliance fine range "
        "(~$5,000-$100,000/month); contractual, not statutory — no single "
        "official ceiling", "n/a",
    ),
}

# ---------------------------------------------------------------------------
# Data sensitivity ordinal weights (0..1) — how much a data classification
# tier contributes to business criticality. There is no external empirical
# study that says "restricted data is worth exactly 1.0 and internal data
# is worth exactly 0.35" — this is a judgment-call ordinal scale, tagged
# ILLUSTRATIVE, that an organization's own data-classification policy
# should override wherever one exists.
# ---------------------------------------------------------------------------
DATA_SENSITIVITY_WEIGHT = {
    "public":        DataPoint(0.10, ConfidenceTier.ILLUSTRATIVE, "Ordinal modeling scale — not externally cited", "n/a"),
    "internal":      DataPoint(0.35, ConfidenceTier.ILLUSTRATIVE, "Ordinal modeling scale — not externally cited", "n/a"),
    "confidential":  DataPoint(0.65, ConfidenceTier.ILLUSTRATIVE, "Ordinal modeling scale — not externally cited", "n/a"),
    "restricted":    DataPoint(1.00, ConfidenceTier.ILLUSTRATIVE, "Ordinal modeling scale — not externally cited", "n/a"),
}

# ---------------------------------------------------------------------------
# Control -> applicable attack class mapping (SIH 26105 follow-up critique
# #4 — "MFA shouldn't reduce every vulnerability by 99.2%"). "*" means
# genuinely attack-class-agnostic (patching the underlying flaw fixes it
# regardless of technique); every other control is scoped to the attack
# classes it plausibly mitigates. This mapping is a security-judgment call,
# not an externally cited study — see control_effectiveness.py's
# classify_attack_class() docstring for how a finding's free-text category
# gets mapped into one of the classes used as keys/values here, and for why
# an unclassified finding gets the CONSERVATIVE (under-credit, not
# over-credit) treatment.
# ---------------------------------------------------------------------------
CONTROL_APPLICABLE_ATTACK_CLASSES: dict[str, set[str] | str] = {
    "mfa_credential_attacks": {"credential_exposure", "authentication_bypass"},
    "mfa": {"credential_exposure", "authentication_bypass"},
    "fido2": {"credential_exposure", "authentication_bypass"},
    "edr_endpoint_detection": {"code_execution", "command_injection"},
    "edr": {"code_execution", "command_injection"},
    "network_segmentation": {"lateral_movement", "ssrf"},
    "waf": {"injection", "sql_injection", "xss", "command_injection", "path_traversal"},
    "critical_patch_sla_7d": "*",
}
