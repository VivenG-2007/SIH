"""
Financial Risk Model (Upgrade 1).

Computes Expected Annual Loss (EAL) and Value at Risk (VaR) for a finding
or asset, decomposed into downtime, breach, regulatory, and reputation
components, per SIH architecture section 6.

Deliberately deterministic/statistical — no LLM call in this module. An
LLM may EXPLAIN the output (see routers layer), but must never be the
thing computing a dollar figure; that rule comes straight from the
architecture doc and is enforced here by simply not importing any AI
provider.

IMPORTANT — what this module is and is not:
  - It IS a structurally complete, testable, cited implementation of
    downtime / breach / regulatory / reputation impact modeling.
  - It is NOT a validated actuarial model. The base rates come from
    published industry studies (see data_sources.py); the way this module
    combines them (a CVSS/asset-criticality-scaled likelihood times an
    industry-average impact) is a reasonable, transparent approximation,
    not something back-tested against real incidents. Every score's
    EvidenceTrail says exactly which inputs are empirical vs illustrative
    so nobody downstream mistakes this for calibrated output.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import data_sources as ds
from .evidence import EvidenceTrail, FORMULA_VERSION, datapoint_source


@dataclass
class AssetContext:
    asset_id: str
    industry: str                 # key into ds.INDUSTRY_BREACH_COST_USD
    criticality: float            # 0..1, business-criticality score (from
                                   # section 2's Business Criticality Engine)
    daily_revenue_at_risk_usd: float = 0.0  # optional org-specific override
    regulatory_multiplier: float = 1.0      # e.g. >1 for regulated sectors
    has_extensive_security_automation: bool = False


@dataclass
class VulnerabilityContext:
    finding_id: str
    cvss: float                    # 0..10
    is_known_exploited: bool = False   # in CISA KEV or equivalent
    exploit_maturity: str = "unknown"  # "poc" | "weaponized" | "unknown"


@dataclass
class ImpactBreakdown:
    downtime_usd: float
    breach_usd: float
    regulatory_usd: float
    reputation_usd: float

    @property
    def total_usd(self) -> float:
        return self.downtime_usd + self.breach_usd + self.regulatory_usd + self.reputation_usd


def _industry_base_cost(industry: str) -> tuple[float, ds.ConfidenceTier, str, str]:
    dp = ds.INDUSTRY_BREACH_COST_USD.get(industry) or ds.INDUSTRY_BREACH_COST_USD["global_average"]
    return dp.value, dp.tier, dp.source, dp.as_of


def compute_impact(asset: AssetContext) -> tuple[ImpactBreakdown, EvidenceTrail]:
    """Decompose expected impact into 4 components if this asset suffers a
    breach. IBM's total breach-cost figure is the anchor; we split it
    across categories using published component shares where available
    and a documented illustrative split otherwise (IBM's public report
    gives a total, not a downtime/breach/regulatory/reputation split for
    every industry, so the split itself is illustrative even where the
    total is empirical)."""
    base_cost, tier, source, as_of = _industry_base_cost(asset.industry)

    # Illustrative split of the empirical total. IBM's report breaks total
    # cost into detection/escalation, notification, post-breach response,
    # and lost business — not exactly downtime/breach/regulatory/reputation
    # as this architecture names them, so this mapping is itself a modeling
    # choice, flagged illustrative even though the total it splits is
    # empirical.
    split = {"downtime": 0.20, "breach": 0.35, "regulatory": 0.20, "reputation": 0.25}

    automation_discount = (
        ds.AUTOMATION_COST_REDUCTION_USD.value if asset.has_extensive_security_automation else 0.0
    )
    adjusted_total = max(base_cost - automation_discount, 0.0) * asset.criticality

    breakdown = ImpactBreakdown(
        downtime_usd=adjusted_total * split["downtime"],
        breach_usd=adjusted_total * split["breach"],
        regulatory_usd=adjusted_total * split["regulatory"] * asset.regulatory_multiplier,
        reputation_usd=adjusted_total * split["reputation"],
    )

    sources = [datapoint_source(f"industry_breach_cost:{asset.industry}", ds.INDUSTRY_BREACH_COST_USD.get(asset.industry, ds.INDUSTRY_BREACH_COST_USD["global_average"]))]
    if asset.has_extensive_security_automation:
        sources.append(datapoint_source("automation_cost_reduction", ds.AUTOMATION_COST_REDUCTION_USD))

    trail = EvidenceTrail(
        score_type="impact_breakdown",
        inputs={
            "asset_id": asset.asset_id,
            "industry": asset.industry,
            "criticality": asset.criticality,
            "regulatory_multiplier": asset.regulatory_multiplier,
            "has_extensive_security_automation": asset.has_extensive_security_automation,
            "category_split_used": split,
        },
        data_sources=sources,
        formula_version=FORMULA_VERSION,
        explanation=(
            f"Base industry breach cost (${base_cost:,.0f}, {source}, {as_of}) scaled "
            f"by asset criticality ({asset.criticality:.2f})"
            + (f" minus automation discount (${automation_discount:,.0f})" if automation_discount else "")
            + f", then split across categories using an illustrative allocation "
            f"({split})."
        ),
    )
    return breakdown, trail


def compute_likelihood(vuln: VulnerabilityContext, active_controls: list[str] | None = None) -> tuple[float, EvidenceTrail]:
    """Annualized likelihood (0..1) that this specific vulnerability is
    exploited, before control effectiveness. Control effectiveness is
    applied separately in control_effectiveness.py so the two concerns
    stay decoupled and independently testable/auditable."""
    active_controls = active_controls or []

    # CVSS-scaled base rate. This mapping (cvss/10 as a raw annual
    # probability) is ILLUSTRATIVE — CVSS is a severity score, not a
    # calibrated probability of exploitation in any given year. It is
    # nudged upward for known-exploited / weaponized vulnerabilities using
    # DBIR's finding that KEV-listed vulnerabilities are the actively
    # observed attack vector, which is a directional empirical signal, not
    # a calibrated probability multiplier.
    base = min(vuln.cvss / 10.0, 1.0)
    if vuln.is_known_exploited:
        base = min(base * 1.5, 1.0)
    if vuln.exploit_maturity == "weaponized":
        base = min(base * 1.3, 1.0)

    sources = []
    if vuln.is_known_exploited:
        sources.append(datapoint_source("median_days_to_patch_kev", ds.MEDIAN_DAYS_TO_PATCH_KEV))
        sources.append(datapoint_source("pct_critical_kev_fully_remediated", ds.PCT_CRITICAL_KEV_FULLY_REMEDIATED))

    trail = EvidenceTrail(
        score_type="pre_control_likelihood",
        inputs={
            "finding_id": vuln.finding_id,
            "cvss": vuln.cvss,
            "is_known_exploited": vuln.is_known_exploited,
            "exploit_maturity": vuln.exploit_maturity,
        },
        data_sources=sources,
        formula_version=FORMULA_VERSION,
        explanation=(
            f"CVSS {vuln.cvss}/10 mapped to a base annual likelihood of {base:.2f} "
            f"(illustrative mapping — CVSS is a severity score, not a calibrated "
            f"probability)"
            + (", boosted for known-exploited status (DBIR: KEVs are the dominant "
               "observed initial-access vector)" if vuln.is_known_exploited else "")
            + "."
        ),
    )
    return base, trail


def compute_eal(likelihood: float, impact: ImpactBreakdown) -> float:
    """Expected Annual Loss = likelihood x impact. Pure arithmetic —
    deliberately has no data-source dependency of its own; correctness
    lives entirely in its two inputs' EvidenceTrails."""
    return likelihood * impact.total_usd


def compute_var(eal: float, confidence: float = 0.95, volatility: float = 1.8) -> tuple[float, EvidenceTrail]:
    """Value at Risk at the given confidence level.

    Uses a log-normal tail approximation: VaR = EAL * exp(z * sigma), where
    sigma (volatility) is a shape parameter, NOT derived from this
    organization's loss history (none exists yet for a pre-launch
    platform). volatility=1.8 is an ILLUSTRATIVE placeholder chosen to
    produce a plausible fat-tailed distribution (breach costs are known to
    be heavy-tailed — a handful of catastrophic breaches dominate total
    industry losses per IBM/Ponemon's own reporting — but the specific
    shape parameter for THIS organization can only come from either (a) its
    own incident history, which barely exists pre-launch, or (b) a cyber
    insurer's actuarial table, which this codebase does not have access to.
    """
    import math

    z_scores = {0.90: 1.2816, 0.95: 1.6449, 0.99: 2.3263}
    z = z_scores.get(round(confidence, 2), 1.6449)
    var = eal * math.exp(z * math.log(volatility) / 3)

    trail = EvidenceTrail(
        score_type="value_at_risk",
        inputs={"eal": eal, "confidence": confidence, "volatility_shape_param": volatility},
        data_sources=[],
        formula_version=FORMULA_VERSION,
        explanation=(
            f"Log-normal tail approximation at {confidence:.0%} confidence. The "
            f"volatility shape parameter ({volatility}) is an ILLUSTRATIVE "
            f"placeholder, not fit to this organization's own loss history — "
            f"treat this VaR figure as directional only until real incident data "
            f"is available to calibrate it (see calibration.py)."
        ),
    )
    return var, trail
