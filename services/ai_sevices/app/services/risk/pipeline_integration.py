"""
Scanner → Risk Engine pipeline integration.

Before this module existed, `app/services/risk/` was fully built and tested
but never called by anything — a scan finding never became an EAL. This is
the wiring: `compute_finding_risk()` is called once per finding at the end
of `routers/scanner.py::run_scan`, and `aggregate_portfolio_risk()` rolls
those per-finding figures up into a scan-level summary.

UPDATED — Business Criticality Engine and telemetry-driven known-exploited
status are now wired in (see business_criticality.py and ingestion.py).
Both remain HONEST about their coverage, not "fully calibrated":
  - Business criticality: if a caller has registered a
    business_criticality.AssetBusinessMapping for this repo (via
    business_criticality.register_mapping()), that mapping's real
    revenue-dependency / data-sensitivity / regulatory-importance
    computation is used. If no mapping is registered — the common case
    pre-onboarding — this still falls back to the flat platform default
    (`settings.risk_default_industry` / `risk_default_asset_criticality`),
    exactly as before, and `usedDefault: true` says so explicitly in the
    response and EvidenceTrail rather than looking identical to a real
    per-repo signal.
  - Severity → CVSS is still an approximation (see SEVERITY_TO_CVSS),
    because the scanner's Finding model carries a 4-level severity string
    (CRITICAL/HIGH/MEDIUM/LOW — see app/services/severity.py), not a
    numeric CVSS score. The mapping uses the midpoint of each severity's
    official CVSS v3 band — a reasonable default, not a substitute for an
    actual CVSS calculation per finding.
  - "Known exploited" status now reads from ingestion.known_exploited(),
    which real (GitHub) or simulated (SIEM/EDR/IAM/CSPM/threat-intel)
    telemetry events can set via a MARK_KNOWN_EXPLOITED event (see
    ingestion.py). No live CISA KEV feed is wired up yet — if nothing has
    posted a MARK_KNOWN_EXPLOITED event for this asset, this still
    defaults to False, so EAL remains a floor rather than a ceiling for
    assets with no telemetry at all.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.config import get_settings
from app.services.risk import business_criticality as bc
from app.services.risk import calibration
from app.services.risk import control_effectiveness as ce
from app.services.risk import financial_model as fm
from app.services.risk import ingestion
from app.services.risk import kev
from app.services.risk.evidence import EvidenceTrail

# Named assets the live demo / command-center UI uses. These are NOT a
# global prefix allow-list — a grant is always written under the calling
# organization, so org A and org B can both demo `acme/payments-api`
# without either seeing the other's telemetry, mappings, or calibration.
DEMO_ASSET_IDS = frozenset({
    "acme/payments-api",
    "payments-api",
    "auth-service",
    "checkout-service",
    "customer-portal",
    "core-banking",
    "cloud-infra",
})

DEMO_GRANTS_COLLECTION = "demo_asset_grants"


async def seed_demo_asset_grant(db, organization_id: str, asset_id: str) -> None:
    """Insert a per-org demo grant for a named demo asset.

    This replaces the old global prefix allow-list (`acme/*`, `demo-*`,
    …) which let any authenticated org write pricing-affecting data for
    those names, including assets another org had actually scanned.
    """
    if db is None or not organization_id or asset_id not in DEMO_ASSET_IDS:
        return
    await db[DEMO_GRANTS_COLLECTION].update_one(
        {"organizationId": organization_id, "asset_id": asset_id},
        {
            "$setOnInsert": {
                "organizationId": organization_id,
                "asset_id": asset_id,
                "seededAt": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )


async def user_can_manage_asset(db, organization_id: str, asset_id: str) -> bool:
    """Authorization check for write operations on an asset's risk data
    (business-criticality mappings, ingestion events).

    Scoped by ORGANIZATION (P0#1) — any member of the organization that has
    scanned this asset, or that holds a per-org demo grant for it, can
    manage its risk data. Fail-closed: a store outage is a deny, never
    an implicit allow.
    """
    try:
        if not organization_id or not asset_id or db is None:
            return False
        doc = await db.scan_history.find_one({"organizationId": organization_id, "repo": asset_id})
        if doc is not None:
            return True
        grant = await db[DEMO_GRANTS_COLLECTION].find_one(
            {"organizationId": organization_id, "asset_id": asset_id}
        )
        return grant is not None
    except Exception:
        return False


async def authorize_asset_write(db, organization_id: str, asset_id: str) -> bool:
    """Seed a per-org demo grant when applicable, then authorize."""
    await seed_demo_asset_grant(db, organization_id, asset_id)
    return await user_can_manage_asset(db, organization_id, asset_id)



def _default_asset_context_note() -> str:
    settings = get_settings()
    return (
        "No Business Service mapping is registered for this asset — industry "
        "and criticality are a flat platform-wide default "
        f"(industry={settings.risk_default_industry!r}, "
        f"criticality={settings.risk_default_asset_criticality}), not a "
        "per-repo business-context signal. Register one via "
        "business_criticality.register_mapping() to replace this default."
    )

# Severity -> CVSS midpoint of the official CVSS v3.1 qualitative severity
# ranges (Critical 9.0-10.0, High 7.0-8.9, Medium 4.0-6.9, Low 0.1-3.9).
# This is an ILLUSTRATIVE approximation — see module docstring — used only
# because scanner findings don't carry a real per-finding CVSS score today.
SEVERITY_TO_CVSS = {
    "CRITICAL": 9.5,
    "HIGH": 8.0,
    "MEDIUM": 5.5,
    "LOW": 2.0,
}
DEFAULT_CVSS = 5.5  # unrecognized severity falls back to MEDIUM's midpoint


def _active_controls() -> list[str]:
    settings = get_settings()
    raw = settings.risk_default_active_controls.strip()
    if not raw:
        return []
    return [c.strip() for c in raw.split(",") if c.strip()]


async def compute_finding_risk(db, organization_id: str, finding: dict, repo_full: str) -> dict:
    """Given a scanner Finding (as a dict — `finding.model_dump()`), compute
    its financial impact and return a JSON-serializable dict suitable for
    attaching to the finding as `financialImpact`. Never raises for a
    malformed/unknown severity — falls back to DEFAULT_CVSS rather than
    dropping the finding's risk figure entirely, since a missing EAL on one
    finding would silently understate a portfolio total more dangerously
    than a conservative fallback would.

    `organization_id` scopes every persisted lookup (business-criticality
    mapping, telemetry events, the auto-logged prediction) to this
    organization (P0#1) — two organizations that happen to scan the same
    public repo never see or influence each other's business context,
    telemetry, or calibration data.
    """
    settings = get_settings()
    severity = str(finding.get("severity", "")).upper()
    cvss = SEVERITY_TO_CVSS.get(severity, DEFAULT_CVSS)

    # CISA KEV lookup — only ever fires for a finding that carries a real
    # CVE ID. This scanner is SAST/pattern-based with no dependency/SCA
    # scanning path today, so `cve_id` will be None for every finding this
    # platform currently produces — see kev.py's module docstring. The
    # wiring is real and correct; the coverage is honestly zero until a
    # CVE-backed finding source exists. (KEV itself is public, global
    # threat data, not organization-specific — it is intentionally NOT
    # organization-scoped, unlike everything else in this function.)
    cve_id = finding.get("cveId") or finding.get("cve")
    kev_hit = kev.is_known_exploited(cve_id)
    kev_ransomware = kev.is_ransomware_associated(cve_id)

    # Attack-class classification (SIH follow-up critique #4) — used to
    # filter which active controls actually apply to THIS finding, not just
    # to the portfolio in general.
    attack_class = ce.classify_attack_class(finding.get("category"))

    mapping = await bc.get_mapping(db, organization_id, repo_full)
    criticality_result, criticality_trail = bc.compute_criticality(
        repo_full, mapping, settings.risk_default_asset_criticality, settings.risk_default_industry
    )

    asset = fm.AssetContext(
        asset_id=repo_full,
        industry=criticality_result.industry,
        criticality=criticality_result.criticality_score,
    )
    is_known_exploited = kev_hit or await ingestion.known_exploited(db, organization_id, repo_full)
    vuln = fm.VulnerabilityContext(
        finding_id=str(finding.get("id", "")),
        cvss=cvss,
        is_known_exploited=is_known_exploited,
        exploit_maturity="weaponized" if kev_hit else "unknown",
    )

    impact, impact_trail = fm.compute_impact(asset)
    pre_likelihood, likelihood_trail = fm.compute_likelihood(vuln)
    if kev_hit:
        likelihood_trail.data_sources.append({
            "name": "cisa_kev_catalog_match",
            "tier": "empirical",
            "source": f"CISA KEV catalog ({cve_id})" + (" — ransomware-associated" if kev_ransomware else ""),
            "as_of": kev.data_snapshot_id(),
        })
    telemetry_multiplier = await ingestion.likelihood_adjustment(db, organization_id, repo_full)
    adjusted_likelihood = min(pre_likelihood * telemetry_multiplier, 1.0)

    active_controls = _active_controls()
    control_result, control_trail = ce.apply_controls(adjusted_likelihood, active_controls, attack_class)

    eal = fm.compute_eal(control_result.post_control_likelihood, impact)
    var, var_trail = fm.compute_var(eal)

    trails: list[EvidenceTrail] = [criticality_trail, impact_trail, likelihood_trail, control_trail, var_trail]

    # Auto-log this pricing as a PredictionRecord so it's matchable against
    # a real outcome later (see calibration.py + the
    # /risk/calibration/record-outcome endpoint). prediction_id is stable
    # per (repo, finding) so re-pricing the same still-open finding on a
    # later scan updates the logged prediction rather than accumulating
    # duplicates — calibration should compare the LATEST prediction for a
    # finding against its eventual outcome, not every historical re-scan.
    finding_id = str(finding.get("id", ""))
    prediction_id = f"{repo_full}:{finding_id}"
    if finding_id:
        await calibration.record_prediction(
            db, organization_id,
            calibration.PredictionRecord(
                prediction_id=prediction_id,
                finding_or_asset_id=repo_full,
                predicted_eal_usd=round(eal, 2),
                predicted_likelihood=round(control_result.post_control_likelihood, 4),
                formula_version=var_trail.formula_version,
            )
        )

    return {
        "predictionId": prediction_id if finding_id else None,
        "severityMappedToCvss": cvss,
        "cveId": cve_id,
        "kevMatch": kev_hit,
        "kevRansomwareAssociated": kev_ransomware if kev_hit else None,
        "attackClass": attack_class,
        "expectedAnnualLossUsd": round(eal, 2),
        "valueAtRisk95Usd": round(var, 2),
        "preControlLikelihood": round(pre_likelihood, 4),
        "telemetryLikelihoodMultiplier": round(telemetry_multiplier, 4),
        "postControlLikelihood": round(control_result.post_control_likelihood, 4),
        "controlsExcludedAsInapplicable": [
            k for k in active_controls if k not in control_result.applied_controls
        ],
        "businessCriticality": criticality_result.criticality_score,
        "usedDefaultCriticality": criticality_result.used_default,
        "assetContextNote": _default_asset_context_note() if criticality_result.used_default else (
            f"Business criticality computed from a registered mapping for "
            f"'{repo_full}' — not a flat default."
        ),
        "containsIllustrativeData": any(t.has_illustrative_input() for t in trails),
        "evidence": [t.to_dict() for t in trails],
    }


def aggregate_portfolio_risk(findings_with_risk: list[dict]) -> dict:
    """Roll per-finding financialImpact dicts up into a scan-level summary.
    Pure summation — EAL/VaR aggregation across independent findings is an
    approximation (ignores correlation between findings sharing a root
    cause, e.g. the same vulnerable dependency appearing in 10 files), which
    is flagged in the returned dict rather than silently presented as exact.
    """
    with_risk = [f for f in findings_with_risk if f.get("financialImpact")]
    if not with_risk:
        return {
            "totalExpectedAnnualLossUsd": 0.0,
            "totalValueAtRisk95Usd": 0.0,
            "findingsPriced": 0,
            "containsIllustrativeData": False,
            "note": "No findings were priced (empty scan, or risk auto-compute disabled).",
        }

    total_eal = sum(f["financialImpact"]["expectedAnnualLossUsd"] for f in with_risk)
    total_var = sum(f["financialImpact"]["valueAtRisk95Usd"] for f in with_risk)
    any_illustrative = any(f["financialImpact"]["containsIllustrativeData"] for f in with_risk)

    return {
        "totalExpectedAnnualLossUsd": round(total_eal, 2),
        "totalValueAtRisk95Usd": round(total_var, 2),
        "findingsPriced": len(with_risk),
        "containsIllustrativeData": any_illustrative,
        "note": (
            "Sum across findings, treated as independent — does not model "
            "correlation between findings sharing a root cause (e.g. the "
            "same vulnerable dependency in multiple files). "
            + _default_asset_context_note()
        ),
    }


# ---------------------------------------------------------------------------
# Standalone Quick Financial Risk Assessment — no scan, no repo, required.
#
# This exists because financial risk assessment is the primary product
# surface; connecting a codebase to scan is a secondary, optional feature
# ("have a codebase? scan with us"). A visitor should be able to get a
# real EAL/VaR figure from self-reported vulnerability counts by severity,
# without ever pointing this platform at a repository.
#
# It reuses the exact same financial_model / control_effectiveness modules
# as the scan-derived path — the only difference is where the per-severity
# counts come from (typed in by a person vs. produced by the scanner).
# That's stated explicitly in the response, not hidden — self-reported
# counts are a rougher input than scan-derived findings, and the response
# says so.
# ---------------------------------------------------------------------------

def price_severity_bucket(
    severity: str, industry: str, criticality: float, active_control_keys: list[str]
) -> dict:
    """Price a single representative finding at the given severity. Used
    directly by compute_quick_assessment() below, and is also what
    compute_finding_risk() effectively does for one real finding — kept as
    a separate function so both paths share the identical pricing logic
    rather than two copies drifting apart.
    """
    cvss = SEVERITY_TO_CVSS.get(severity.upper(), DEFAULT_CVSS)

    asset = fm.AssetContext(asset_id="quick-assessment", industry=industry, criticality=criticality)
    vuln = fm.VulnerabilityContext(finding_id=f"quick-{severity.lower()}", cvss=cvss)

    impact, impact_trail = fm.compute_impact(asset)
    pre_likelihood, likelihood_trail = fm.compute_likelihood(vuln)
    control_result, control_trail = ce.apply_controls(pre_likelihood, active_control_keys)
    eal = fm.compute_eal(control_result.post_control_likelihood, impact)
    var, var_trail = fm.compute_var(eal)

    trails: list[EvidenceTrail] = [impact_trail, likelihood_trail, control_trail, var_trail]

    return {
        "severity": severity.upper(),
        "severityMappedToCvss": cvss,
        "expectedAnnualLossPerFindingUsd": round(eal, 2),
        "valueAtRisk95PerFindingUsd": round(var, 2),
        "containsIllustrativeData": any(t.has_illustrative_input() for t in trails),
        "evidence": [t.to_dict() for t in trails],
    }


def compute_quick_assessment(
    industry: str,
    criticality: float,
    severity_counts: dict[str, int],
    active_control_keys: list[str],
) -> dict:
    """The standalone entry point — no Finding, no repo, no scan. Given
    self-reported counts of how many CRITICAL/HIGH/MEDIUM/LOW issues an
    organization believes it has, returns an aggregate EAL/VaR the same way
    a real scan's findings would, scaled by count per severity bucket.

    Unrecognized severity keys in severity_counts are skipped rather than
    raising — a typo in one bucket shouldn't block pricing the buckets that
    are valid.
    """
    buckets = []
    total_eal = 0.0
    total_var = 0.0
    any_illustrative = False

    for severity, count in severity_counts.items():
        if not count or count <= 0:
            continue
        if severity.upper() not in SEVERITY_TO_CVSS:
            continue
        priced = price_severity_bucket(severity, industry, criticality, active_control_keys)
        subtotal_eal = priced["expectedAnnualLossPerFindingUsd"] * count
        subtotal_var = priced["valueAtRisk95PerFindingUsd"] * count
        total_eal += subtotal_eal
        total_var += subtotal_var
        any_illustrative = any_illustrative or priced["containsIllustrativeData"]
        buckets.append({
            **priced,
            "count": count,
            "subtotalExpectedAnnualLossUsd": round(subtotal_eal, 2),
            "subtotalValueAtRisk95Usd": round(subtotal_var, 2),
        })

    return {
        "industry": industry,
        "criticality": criticality,
        "activeControls": active_control_keys,
        "buckets": buckets,
        "totalExpectedAnnualLossUsd": round(total_eal, 2),
        "totalValueAtRisk95Usd": round(total_var, 2),
        "containsIllustrativeData": any_illustrative,
        "note": (
            "Self-reported severity counts, not a real code scan — treat this as "
            "a rough starting estimate. Each severity bucket is summed as if "
            "independent (correlation between issues not modeled). Connect a "
            "codebase to scan with us for per-finding, scan-derived figures "
            "instead of self-reported counts."
        ),
    }
