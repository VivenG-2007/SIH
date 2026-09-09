"""
Business & Asset Criticality Engine (SIH 26105 critical gap #2).

Before this module existed, every finding priced by pipeline_integration.py
used a flat platform-wide default (`settings.risk_default_asset_criticality
= 0.5`) for EVERY asset, regardless of what that asset actually does for
the business. That made the downstream EAL/VaR figure look precise (two
decimal places) while the business-context input underneath it was
illustrative for every single asset — the exact "financial result can look
more authoritative than it actually is" problem this engine exists to fix.

This module computes a real, per-asset criticality score by walking the
chain SIH judges will ask about directly:

    Asset
      -> Business Service (what does this asset actually support?)
      -> Revenue dependency (how much revenue rides on that service?)
      -> Data sensitivity (what class of data does it touch?)
      -> Regulatory importance (which regimes apply, and how severe are
         their penalty ceilings?)
      -> Criticality score (0..1, feeds financial_model.AssetContext)

Same honesty rule as the rest of this package: a criticality score
computed from a REAL business-service mapping is tagged as such: an asset
with NO mapping on file still gets a flat default, but that default is now
an explicit, visible fallback (`used_default=True` in the result and the
EvidenceTrail) rather than the only path that exists. Nothing here invents
an organization's revenue figures — those must be supplied by the caller
(self-reported is fine; it beats a project-wide constant).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core import encryption
from . import data_sources as ds
from .evidence import EvidenceTrail, FORMULA_VERSION, datapoint_source

VALID_DATA_SENSITIVITY = tuple(ds.DATA_SENSITIVITY_WEIGHT.keys())  # public/internal/confidential/restricted


class UnknownDataSensitivityError(ValueError):
    """Raised for a data_sensitivity value with no entry in the registry —
    same "refuse, don't silently default" pattern as
    control_effectiveness.UnknownControlError. A typo'd sensitivity level
    should not silently score as 'public'."""


@dataclass
class BusinessService:
    """A business service or process that one or more assets support.
    Revenue and dependency figures are ORGANIZATION-REPORTED — this module
    has no source of truth for what a specific company's revenue actually
    is, and does not pretend to."""

    service_id: str
    name: str
    industry: str                              # key into data_sources.INDUSTRY_BREACH_COST_USD — replaces the flat platform default alongside criticality
    annual_revenue_usd: float                 # organization-reported
    revenue_dependency_pct: float              # 0..1 — how much of that revenue would stop if this service went down
    data_sensitivity: str                      # "public" | "internal" | "confidential" | "restricted"
    regulatory_frameworks: list[str] = field(default_factory=list)  # e.g. ["dpdp_act_2023", "gdpr"]


@dataclass
class AssetBusinessMapping:
    """The mapping this engine needs per asset. Absence of a mapping for a
    given asset_id is the explicit fallback case handled in
    compute_criticality() below — it is not an error, but it IS flagged."""

    asset_id: str
    business_service: BusinessService


@dataclass
class CriticalityResult:
    asset_id: str
    criticality_score: float           # 0..1 — feeds financial_model.AssetContext.criticality
    industry: str                      # feeds financial_model.AssetContext.industry
    revenue_at_risk_usd: float         # annual_revenue_usd * revenue_dependency_pct
    used_default: bool                 # True if no business-service mapping existed for this asset
    regulatory_exposure_usd: float     # max penalty ceiling among applicable frameworks (illustrative combination)


def _regulatory_importance(frameworks: list[str]) -> tuple[float, float, list[dict[str, str]]]:
    """Regulatory importance (0..1) scales with the largest statutory
    penalty ceiling among the frameworks that apply to this service.
    Combining multiple frameworks by taking the MAX (not sum) is a
    deliberate, flagged modeling choice: a breach can trigger obligations
    under several regimes at once, but summing their ceilings would double
    count the same underlying incident's exposure rather than reflect
    realistic aggregate liability."""
    if not frameworks:
        return 0.0, 0.0, []

    known = [f for f in frameworks if f in ds.REGULATORY_PENALTY_CEILING_USD]
    if not known:
        return 0.0, 0.0, []

    ceilings = [(f, ds.REGULATORY_PENALTY_CEILING_USD[f]) for f in known]
    max_name, max_dp = max(ceilings, key=lambda pair: pair[1].value)

    # Normalize against the largest ceiling in the registry so the score
    # stays in 0..1 regardless of which frameworks get added later.
    registry_max = max(dp.value for dp in ds.REGULATORY_PENALTY_CEILING_USD.values())
    importance = min(max_dp.value / registry_max, 1.0) if registry_max else 0.0

    sources = [datapoint_source(f"regulatory_penalty_ceiling:{f}", dp) for f, dp in ceilings]
    return importance, max_dp.value, sources


def compute_criticality(
    asset_id: str,
    mapping: AssetBusinessMapping | None,
    default_criticality: float,
    default_industry: str = "technology",
) -> tuple[CriticalityResult, EvidenceTrail]:
    """Compute a real per-asset criticality score when a business-service
    mapping exists; fall back to the flat platform default, explicitly
    flagged, when it doesn't. This function never raises for a missing
    mapping — a missing mapping is the expected, common case pre-onboarding
    and must not block pricing; it DOES raise for a mapping with an
    unrecognized data_sensitivity value, since that's a caller bug, not a
    legitimate "we don't have data yet" state.
    """
    if mapping is None:
        trail = EvidenceTrail(
            score_type="business_criticality",
            inputs={
                "asset_id": asset_id,
                "default_criticality": default_criticality,
                "default_industry": default_industry,
            },
            data_sources=[],
            formula_version=FORMULA_VERSION,
            explanation=(
                f"No Business Service mapping is on file for asset '{asset_id}'. "
                f"Falling back to the flat platform default "
                f"(criticality={default_criticality}, industry={default_industry!r}) "
                f"— this is NOT a calibrated business-context signal for this "
                f"specific asset. Register a BusinessService mapping for this "
                f"asset to replace this default with a real industry / "
                f"revenue-dependency / data-sensitivity / regulatory-importance "
                f"score."
            ),
        )
        result = CriticalityResult(
            asset_id=asset_id,
            criticality_score=default_criticality,
            industry=default_industry,
            revenue_at_risk_usd=0.0,
            used_default=True,
            regulatory_exposure_usd=0.0,
        )
        return result, trail

    svc = mapping.business_service

    if svc.data_sensitivity not in ds.DATA_SENSITIVITY_WEIGHT:
        raise UnknownDataSensitivityError(
            f"Unrecognized data_sensitivity '{svc.data_sensitivity}' for service "
            f"'{svc.service_id}'. Valid values: {', '.join(VALID_DATA_SENSITIVITY)}."
        )

    revenue_dep = max(0.0, min(svc.revenue_dependency_pct, 1.0))
    revenue_at_risk = svc.annual_revenue_usd * revenue_dep

    sensitivity_dp = ds.DATA_SENSITIVITY_WEIGHT[svc.data_sensitivity]
    reg_importance, reg_ceiling_usd, reg_sources = _regulatory_importance(svc.regulatory_frameworks)

    # Three legs combined as a weighted average, NOT summed — summing three
    # 0..1 legs could exceed 1.0 and would need re-normalizing anyway; a
    # weighted average keeps the result directly interpretable as "how
    # critical, 0..1" and keeps each leg's contribution legible. Weights
    # below (0.45 revenue / 0.30 sensitivity / 0.25 regulatory) are an
    # ILLUSTRATIVE modeling choice — an organization's own risk-governance
    # policy should override these weights wherever one exists.
    weights = {"revenue": 0.45, "sensitivity": 0.30, "regulatory": 0.25}
    criticality = (
        weights["revenue"] * revenue_dep
        + weights["sensitivity"] * sensitivity_dp.value
        + weights["regulatory"] * reg_importance
    )
    criticality = round(min(max(criticality, 0.0), 1.0), 4)

    sources = [datapoint_source(f"data_sensitivity:{svc.data_sensitivity}", sensitivity_dp)] + reg_sources

    trail = EvidenceTrail(
        score_type="business_criticality",
        inputs={
            "asset_id": asset_id,
            "service_id": svc.service_id,
            "service_name": svc.name,
            "annual_revenue_usd": svc.annual_revenue_usd,
            "revenue_dependency_pct": revenue_dep,
            "data_sensitivity": svc.data_sensitivity,
            "regulatory_frameworks": svc.regulatory_frameworks,
            "leg_weights": weights,
        },
        data_sources=sources,
        formula_version=FORMULA_VERSION,
        explanation=(
            f"Asset '{asset_id}' maps to business service '{svc.name}' "
            f"(${svc.annual_revenue_usd:,.0f}/yr, {revenue_dep:.0%} revenue "
            f"dependency -> ${revenue_at_risk:,.0f} revenue at risk). "
            f"Data sensitivity '{svc.data_sensitivity}' (weight "
            f"{sensitivity_dp.value:.2f}, illustrative ordinal scale). "
            f"Regulatory importance {reg_importance:.2f} from "
            f"{svc.regulatory_frameworks or 'no applicable frameworks'} "
            f"(largest cited penalty ceiling: ${reg_ceiling_usd:,.0f}). "
            f"Weighted combination ({weights['revenue']:.0%} revenue / "
            f"{weights['sensitivity']:.0%} sensitivity / "
            f"{weights['regulatory']:.0%} regulatory — an illustrative "
            f"weighting, not an externally cited formula) -> criticality "
            f"score {criticality:.2f}."
        ),
    )

    result = CriticalityResult(
        asset_id=asset_id,
        criticality_score=criticality,
        industry=svc.industry,
        revenue_at_risk_usd=round(revenue_at_risk, 2),
        used_default=False,
        regulatory_exposure_usd=reg_ceiling_usd,
    )
    return result, trail


# ---------------------------------------------------------------------------
# Persisted mapping store — Mongo-backed, organization-scoped (P0#1/#2).

COLLECTION = "business_criticality_mappings"


def _to_document(organization_id: str, mapping: AssetBusinessMapping) -> dict:
    svc = mapping.business_service
    return {
        "organizationId": organization_id,
        "assetId": mapping.asset_id,
        "serviceId": svc.service_id,
        "name": svc.name,
        "industry": svc.industry,
        "annualRevenueUsdEncrypted": encryption.encrypt_value(svc.annual_revenue_usd),
        "revenueDependencyPctEncrypted": encryption.encrypt_value(svc.revenue_dependency_pct),
        "dataSensitivity": svc.data_sensitivity,
        "regulatoryFrameworks": svc.regulatory_frameworks,
    }


def _from_document(doc: dict) -> AssetBusinessMapping:
    svc = BusinessService(
        service_id=doc["serviceId"],
        name=doc["name"],
        industry=doc["industry"],
        annual_revenue_usd=encryption.decrypt_value(doc["annualRevenueUsdEncrypted"]),
        revenue_dependency_pct=encryption.decrypt_value(doc["revenueDependencyPctEncrypted"]),
        data_sensitivity=doc["dataSensitivity"],
        regulatory_frameworks=doc.get("regulatoryFrameworks", []),
    )
    return AssetBusinessMapping(asset_id=doc["assetId"], business_service=svc)


async def register_mapping(db, organization_id: str, mapping: AssetBusinessMapping) -> None:
    await db[COLLECTION].update_one(
        {"organizationId": organization_id, "assetId": mapping.asset_id},
        {"$set": _to_document(organization_id, mapping)},
        upsert=True,
    )


async def get_mapping(db, organization_id: str, asset_id: str) -> AssetBusinessMapping | None:
    doc = await db[COLLECTION].find_one({"organizationId": organization_id, "assetId": asset_id})
    if doc is None:
        return None
    return _from_document(doc)


async def list_mappings(db, organization_id: str) -> list[AssetBusinessMapping]:
    cursor = db[COLLECTION].find({"organizationId": organization_id})
    return [_from_document(doc) async for doc in cursor]


async def clear_registry(db, organization_id: str) -> None:
    """Test/demo-reset helper only."""
    await db[COLLECTION].delete_many({"organizationId": organization_id})
