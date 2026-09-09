"""Compliance Framework Mapping Router (PS Gap #2).

Exposes compliance framework metadata and control-gap mapping for:
  - ISO/IEC 27001:2022
  - NIST CSF 2.0
  - CIS Controls v8
  - RBI Cyber Security Framework
  - SEBI Cybersecurity and Cyber Resilience Framework (CSCRF 2023)

Allows mapping from finding categories or directly from scan results.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.core.security import CurrentUser, require_auth
from app.services.risk import compliance

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])
logger = get_logger()


class MapFindingsRequest(BaseModel):
    finding_categories: list[str] = Field(
        ...,
        description="List of finding categories (e.g. ['sql_injection', 'hardcoded_secret'])",
        example=["sql_injection", "hardcoded_secret", "broken_access_control"],
    )
    framework_ids: Optional[list[str]] = Field(
        None,
        description="Optional subset of framework IDs to map against (e.g. ['nist_csf_2', 'iso_27001_2022']). Defaults to all 5.",
    )


@router.get("/frameworks")
async def get_frameworks(user: CurrentUser = Depends(require_auth)):
    """List all supported compliance frameworks with metadata and control counts."""
    frameworks = compliance.list_frameworks()
    return {
        "frameworks": frameworks,
        "total_frameworks": len(frameworks),
    }


@router.post("/map")
async def map_findings_to_compliance(
    req: MapFindingsRequest,
    user: CurrentUser = Depends(require_auth),
):
    """Map finding categories to compliance framework controls and compute gap analysis."""
    if not req.finding_categories:
        raise HTTPException(status_code=400, detail="finding_categories cannot be empty")

    res = compliance.map_findings(
        finding_categories=req.finding_categories,
        framework_ids=req.framework_ids,
    )

    frameworks_out = {}
    for fid, gap in res.frameworks.items():
        frameworks_out[fid] = {
            "framework_id": gap.framework_id,
            "framework_name": gap.framework_name,
            "total_controls": gap.total_controls,
            "matched_control_count": len(gap.matched_control_ids),
            "matched_control_ids": gap.matched_control_ids,
            "gap_control_count": len(gap.gap_control_ids),
            "gap_control_ids": gap.gap_control_ids,
            "coverage_pct": gap.coverage_pct,
            "matched_controls": gap.matched_controls,
        }

    return {
        "finding_categories": res.finding_categories,
        "unrecognized_categories": res.unrecognized_categories,
        "mapping_confidence": res.mapping_confidence,
        "note": res.note,
        "frameworks": frameworks_out,
    }
