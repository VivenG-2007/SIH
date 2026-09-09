"""Natural-Language Risk Query Interface (PS Gap #3).

Provides an intelligent natural language interface for CISOs and security
analysts to query financial risk exposure, EAL, VaR, ROSI, and compliance gaps.
Grounds the AI response in live risk quantification figures from the user's
scan history and business context.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_auth
from app.services.ai_providers import chat_with_fallback

router = APIRouter(prefix="/api/v1/risk", tags=["risk-query"])
logger = get_logger()


class RiskQueryRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Plain-English security or financial risk question",
        example="What is our highest financial risk today and what control gives the best return?",
    )
    repo: Optional[str] = Field(
        None,
        description="Optional repository identifier (e.g. 'org/repo') to scope query context",
    )


async def _gather_risk_context(db, user: CurrentUser, repo: Optional[str]) -> dict[str, Any]:
    """Gather live risk context from Mongo scan_history to ground the LLM response."""
    query: dict[str, Any] = {"ownerId": user.id}
    if repo:
        query["repo"] = repo

    cursor = db.scan_history.find(query).sort("scannedAt", -1).limit(50)
    scans = [doc async for doc in cursor]

    if not scans:
        return {
            "has_data": False,
            "total_eal_usd": 0.0,
            "total_var_usd": 0.0,
            "scanned_repos": [],
            "top_findings": [],
        }

    latest_by_repo: dict[str, dict] = {}
    for scan in scans:
        r = scan.get("repo") or "unknown"
        if r not in latest_by_repo:
            latest_by_repo[r] = scan

    total_eal = 0.0
    total_var = 0.0
    top_findings: list[dict] = []

    for r, scan in latest_by_repo.items():
        pr = scan.get("portfolioRisk") or {}
        total_eal += float(pr.get("totalExpectedAnnualLossUsd") or 0.0)
        total_var += float(pr.get("totalValueAtRisk95Usd") or 0.0)

        for f in scan.get("findings") or []:
            fi = f.get("financialImpact") or {}
            eal = float(fi.get("expectedAnnualLossUsd") or 0.0)
            if eal > 0 or f.get("severity") in ("CRITICAL", "HIGH"):
                top_findings.append({
                    "repo": r,
                    "title": f.get("title") or f.get("id"),
                    "severity": f.get("severity"),
                    "category": f.get("category"),
                    "file": f.get("file"),
                    "line": f.get("line"),
                    "eal_usd": eal,
                    "var_usd": float(fi.get("valueAtRisk95Usd") or 0.0),
                    "cve": fi.get("cveId"),
                    "known_exploited": fi.get("kevMatch", False),
                })

    top_findings.sort(key=lambda x: x["eal_usd"], reverse=True)
    top_findings = top_findings[:10]

    return {
        "has_data": True,
        "total_eal_usd": round(total_eal, 2),
        "total_var_usd": round(total_var, 2),
        "scanned_repos": list(latest_by_repo.keys()),
        "top_findings": top_findings,
    }


@router.post("/query")
@limiter.limit("10/minute")
async def query_risk_intelligence(
    request: Request,
    req: RiskQueryRequest,
    user: CurrentUser = Depends(require_auth),
):
    """Answer a natural language risk query using live scan risk metrics and the fallback-aware AI model."""
    db = get_db()
    context = await _gather_risk_context(db, user, req.repo)

    system_prompt = (
        "You are PatchlineX Cyber Risk Copilot, an AI risk actuary and security advisor.\n"
        "Your role is to explain cybersecurity risk, Expected Annual Loss (EAL), 95% Value at Risk (VaR), "
        "Return on Security Investment (ROSI), and remediation priorities to executives and engineers.\n\n"
        "Guidelines:\n"
        "1. Base your quantitative statements strictly on the provided Context figures.\n"
        "2. If no scans have been performed yet (has_data=false), explain that no codebase has been scanned "
        "and describe typical risk methodology (EAL = Likelihood * Business Impact, VaR, ROSI).\n"
        "3. Cite concrete numbers, specific repositories, and critical findings when available.\n"
        "4. Be concise, professional, and provide clear actionable guidance.\n"
    )

    user_message = (
        f"Context from PatchlineX Risk Engine:\n"
        f"- Scanned Repositories: {context['scanned_repos']}\n"
        f"- Aggregate Expected Annual Loss (EAL): ${context['total_eal_usd']:,.2f}\n"
        f"- Aggregate 95% Value at Risk (VaR): ${context['total_var_usd']:,.2f}\n"
        f"- Top Risk Findings: {context['top_findings']}\n\n"
        f"User Question: {req.question}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        result = await chat_with_fallback(messages)
    except Exception as exc:
        logger.error("risk_nlquery_failed", error=str(exc))
        raise HTTPException(status_code=502, detail=f"Failed to generate risk query answer: {exc}")

    return {
        "question": req.question,
        "answer": result.get("content", ""),
        "cited_figures": {
            "total_eal_usd": context["total_eal_usd"],
            "total_var_usd": context["total_var_usd"],
            "scanned_repos": context["scanned_repos"],
            "top_findings_count": len(context["top_findings"]),
            "top_findings": context["top_findings"][:3],
        },
        "provider_used": result.get("provider_used", "unknown"),
        "fallback_used": result.get("fallback_used", False),
        "usage": result.get("usage"),
    }
