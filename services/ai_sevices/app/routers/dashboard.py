"""
Dashboard aggregation endpoint.

Everything the redesigned frontend dashboard renders (KPI cards, risk
trend chart, activity feed, repository health table, AI fix engine, heatmap,
repos at risk, and security radar) comes from ONE call to GET /api/v1/dashboard/stats,
computed live from this user's scan_history documents in Mongo / Elasticsearch.
Nothing is hardcoded or mocked — an account with no scans gets back real zeros
and empty structures, which the frontend renders as an empty state.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_auth
from app.core.es_client import search_findings

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
logger = get_logger()

SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 4, "MEDIUM": 1.5, "LOW": 0.5}


def _finding_status(scan_doc: dict, finding_id: str) -> str:
    return ((scan_doc.get("fixes") or {}).get(finding_id) or {}).get("status") or "AWAITING_APPROVAL"


def _is_open(status: str) -> bool:
    return status != "FIX_VERIFIED"


def _parse_dt(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _classify_category(title: str, file_path: str = "") -> str:
    t = (title + " " + file_path).lower()
    if "sql" in t or "query" in t or "database" in t:
        return "Injection"
    elif "xss" in t or "script" in t or "html" in t:
        return "XSS"
    elif "secret" in t or "key" in t or "token" in t or "credential" in t or "password" in t:
        return "Secrets"
    elif "crypto" in t or "hash" in t or "cipher" in t or "md5" in t or "des" in t:
        return "Crypto"
    elif "command" in t or "exec" in t or "shell" in t:
        return "Commands"
    else:
        return "Dependencies"


_STATS_PROJECTION = {
    "_id": 0,
    "scanId": 1,
    "repo": 1,
    "branch": 1,
    "scannedAt": 1,
    "findingsCount": 1,
    "fixes": 1,
    "findings.id": 1,
    "findings.title": 1,
    "findings.severity": 1,
    "findings.file": 1,
}

_STATS_SCAN_LIMIT = 300


@router.get("/stats")
async def get_dashboard_stats(user: CurrentUser = Depends(require_auth)) -> dict[str, Any]:
    db = get_db()
    cursor = (
        db.scan_history.find({"ownerId": user.id}, _STATS_PROJECTION)
        .sort("scannedAt", -1)
        .limit(_STATS_SCAN_LIMIT)
    )
    scans = [doc async for doc in cursor]

    # Try fetching ES findings if available
    try:
        es_results = await search_findings(owner_id=user.id, size=500)
    except Exception:
        es_results = None

    now = datetime.datetime.now(datetime.timezone.utc)
    week_ago = now - datetime.timedelta(days=7)
    twelve_weeks_ago = now - datetime.timedelta(weeks=12)

    latest_by_repo: dict[str, dict] = {}
    for scan in scans:
        repo = scan.get("repo") or "unknown"
        if repo not in latest_by_repo:
            latest_by_repo[repo] = scan

    open_findings = 0
    critical_open = 0
    high_open = 0
    medium_open = 0
    low_open = 0
    fixes_generated_total = 0
    fixes_verified_total = 0
    prs_created_total = 0
    fixes_applied_last7 = 0
    repos_added_last7 = 0
    activity: list[dict] = []
    risk_by_day: dict[str, float] = defaultdict(float)

    # Category counts for security radar
    radar_counts: dict[str, int] = defaultdict(int)

    # Heatmap matrix: 6 categories x 12 weeks
    heatmap_matrix: dict[str, list[int]] = {
        "SQL Injection": [0] * 12,
        "XSS": [0] * 12,
        "Secrets": [0] * 12,
        "Cmd Injection": [0] * 12,
        "Weak Crypto": [0] * 12,
        "Path Traversal": [0] * 12,
    }

    for scan in scans:
        scanned_at = _parse_dt(scan.get("scannedAt"))
        findings = scan.get("findings") or []
        fixes = scan.get("fixes") or {}
        is_latest_for_repo = latest_by_repo.get(scan.get("repo")) is scan

        fixes_generated_total += len(fixes)

        for finding_id, fix in fixes.items():
            if fix.get("status") == "FIX_VERIFIED":
                fixes_verified_total += 1
                if scanned_at and scanned_at >= week_ago:
                    fixes_applied_last7 += 1
            if fix.get("pullRequestUrl") or fix.get("status") in ("FIX_VERIFIED", "PR_CREATED"):
                prs_created_total += 1

        for f in findings:
            status = _finding_status(scan, f.get("id"))
            severity = (f.get("severity") or "").upper()
            title = f.get("title") or ""
            file_path = f.get("file") or ""

            if is_latest_for_repo and _is_open(status):
                open_findings += 1
                if severity == "CRITICAL":
                    critical_open += 1
                elif severity == "HIGH":
                    high_open += 1
                elif severity == "MEDIUM":
                    medium_open += 1
                elif severity == "LOW":
                    low_open += 1

                cat = _classify_category(title, file_path)
                radar_counts[cat] += 1

            # Populate weekly heatmap if within 12 weeks
            if scanned_at and scanned_at >= twelve_weeks_ago:
                week_idx = min(11, max(0, int((now - scanned_at).days / 7)))
                col = 11 - week_idx  # 0 is oldest (W1), 11 is latest (W12)

                t_lower = (title + " " + file_path).lower()
                if "sql" in t_lower or "query" in t_lower:
                    heatmap_matrix["SQL Injection"][col] += 1
                elif "xss" in t_lower or "script" in t_lower:
                    heatmap_matrix["XSS"][col] += 1
                elif "secret" in t_lower or "key" in t_lower or "token" in t_lower:
                    heatmap_matrix["Secrets"][col] += 1
                elif "command" in t_lower or "exec" in t_lower:
                    heatmap_matrix["Cmd Injection"][col] += 1
                elif "crypto" in t_lower or "hash" in t_lower or "cipher" in t_lower:
                    heatmap_matrix["Weak Crypto"][col] += 1
                elif "path" in t_lower or "traversal" in t_lower or "directory" in t_lower:
                    heatmap_matrix["Path Traversal"][col] += 1

        if scanned_at and scanned_at >= week_ago:
            day_key = scanned_at.strftime("%a")
            for f in findings:
                sev = (f.get("severity") or "").upper()
                risk_by_day[day_key] += SEVERITY_WEIGHT.get(sev, 0)

        if scanned_at and scanned_at >= week_ago and is_latest_for_repo:
            repos_added_last7 += 1

        activity.append(
            {
                "id": f"scan-{scan.get('scanId')}",
                "type": "scan_completed",
                "message": "Full repository scan completed",
                "repo": scan.get("repo"),
                "findingsCount": scan.get("findingsCount", len(findings)),
                "timestamp": scan.get("scannedAt"),
            }
        )

    activity.sort(key=lambda a: a.get("timestamp") or "", reverse=True)

    # Repo health & repos at risk table
    repo_health = []
    repos_at_risk = []
    for repo, scan in latest_by_repo.items():
        findings = scan.get("findings") or []
        open_count = sum(1 for f in findings if _is_open(_finding_status(scan, f.get("id"))))
        c_count = sum(1 for f in findings if (f.get("severity") or "").upper() == "CRITICAL" and _is_open(_finding_status(scan, f.get("id"))))
        h_count = sum(1 for f in findings if (f.get("severity") or "").upper() == "HIGH" and _is_open(_finding_status(scan, f.get("id"))))
        m_count = sum(1 for f in findings if (f.get("severity") or "").upper() == "MEDIUM" and _is_open(_finding_status(scan, f.get("id"))))
        l_count = sum(1 for f in findings if (f.get("severity") or "").upper() == "LOW" and _is_open(_finding_status(scan, f.get("id"))))

        if c_count > 0:
            risk_level = "Critical"
        elif h_count > 0:
            risk_level = "High"
        elif open_count > 0:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        item = {
            "repo": repo,
            "branch": scan.get("branch") or "main",
            "riskLevel": risk_level,
            "findings": open_count,
            "lastScan": scan.get("scannedAt"),
            "status": "Action Required" if c_count > 0 else ("Review Fixes" if open_count > 0 else "Healthy"),
        }
        repo_health.append(item)

        repos_at_risk.append({
            "name": repo,
            "critical": c_count,
            "high": h_count,
            "medium": m_count,
            "low": l_count,
            "total": open_count or 1,
        })

    repo_health.sort(key=lambda r: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}[r["riskLevel"]])
    repos_at_risk.sort(key=lambda r: (r["critical"], r["high"], r["total"]), reverse=True)

    # Risk score over time
    days_order = []
    d = week_ago
    while d <= now:
        days_order.append(d.strftime("%a"))
        d += datetime.timedelta(days=1)
    seen = set()
    ordered_days = [d for d in days_order if not (d in seen or seen.add(d))]
    risk_series = [{"day": day, "score": round(risk_by_day.get(day, 0), 1)} for day in ordered_days]

    global_risk_score = min(100, round(critical_open * 10 + high_open * 4 + medium_open * 1.5))
    verification_rate = round((fixes_verified_total / fixes_generated_total * 100), 1) if fixes_generated_total > 0 else 0.0

    security_radar = [
        {"axis": "Secrets",      "value": min(100, radar_counts["Secrets"] * 20)},
        {"axis": "Injection",    "value": min(100, radar_counts["Injection"] * 20)},
        {"axis": "XSS",          "value": min(100, radar_counts["XSS"] * 20)},
        {"axis": "Crypto",       "value": min(100, radar_counts["Crypto"] * 20)},
        {"axis": "Commands",     "value": min(100, radar_counts["Commands"] * 20)},
        {"axis": "Dependencies", "value": min(100, radar_counts["Dependencies"] * 20)},
    ]

    vuln_heatmap_list = [
        {"type": k, "weeks": v} for k, v in heatmap_matrix.items()
    ]

    return {
        "kpis": {
            "connectedRepos": {"value": len(latest_by_repo), "deltaLabel": f"+{repos_added_last7}" if repos_added_last7 else None},
            "openFindings": {"value": open_findings},
            "criticalIssues": {"value": critical_open},
            "aiFixesApplied": {"value": fixes_verified_total, "windowLabel": f"+{fixes_applied_last7} last 7d"},
        },
        "globalRiskScore": global_risk_score,
        "riskScoreSeries": risk_series,
        "activityFeed": activity[:15],
        "repoHealth": repo_health,
        "severityBreakdown": {"critical": critical_open, "high": high_open, "medium": medium_open, "low": low_open},
        "aiFixEngine": {
            "fixesGenerated": fixes_generated_total,
            "fixesVerified": fixes_verified_total,
            "prsCreated": prs_created_total,
            "verificationRate": verification_rate,
        },
        "vulnHeatmap": vuln_heatmap_list,
        "reposAtRisk": repos_at_risk[:6],
        "securityRadar": security_radar,
        "isElasticActive": es_results is not None,
    }
