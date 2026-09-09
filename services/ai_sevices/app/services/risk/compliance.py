"""Compliance Framework Mapping (PS Gap #2).

Maps security finding categories to controls in five frameworks explicitly
named in the SIH Problem Statement:

  1. ISO/IEC 27001:2022 — Annex A control set
  2. NIST Cybersecurity Framework 2.0 — Govern/Identify/Protect/Detect/Respond/Recover
  3. CIS Controls v8 — Implementation Groups 1-3 (controls 1-18)
  4. RBI Cyber Security Framework (2016, updated 2021) — for Indian banking sector
  5. SEBI Cybersecurity and Cyber Resilience Framework (2023) — for market entities

Design notes:
  - This is a STATIC mapping from published framework documents. The mapping
    is illustrative and directional (a real GRC implementation would load
    control definitions from a managed knowledge base), but the structure is
    correct and the framework IDs are real. This is explicitly marked in
    every response's `mapping_confidence` field.
  - Finding categories come from the scanner's existing category strings
    (see deterministic_scanner.py and semgrep-rules/). The mapping covers
    the categories the scanner currently emits.
  - "Coverage %" = (controls with at least one mapped finding) / (total controls
    in framework) — a rough gap indicator, NOT an audit result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import NamedTuple


# ---------------------------------------------------------------------------
# Framework control definitions
# ---------------------------------------------------------------------------

class Control(NamedTuple):
    id: str           # Framework-native control identifier
    name: str         # Short human-readable label
    domain: str       # Top-level domain / function / category in the framework
    description: str  # One-line description


# ── ISO/IEC 27001:2022 Annex A ────────────────────────────────────────────
ISO27001_CONTROLS: dict[str, Control] = {
    "A.5.1":  Control("A.5.1",  "Policies for information security",          "5. Organisational controls", "Management direction for information security"),
    "A.5.15": Control("A.5.15", "Access control",                             "5. Organisational controls", "Rules on access to information and assets"),
    "A.5.16": Control("A.5.16", "Identity management",                        "5. Organisational controls", "Full lifecycle management of identities"),
    "A.5.17": Control("A.5.17", "Authentication information",                 "5. Organisational controls", "Management of authentication information"),
    "A.5.23": Control("A.5.23", "Information security for cloud services",    "5. Organisational controls", "Security requirements for cloud usage"),
    "A.5.24": Control("A.5.24", "Information security incident management",   "5. Organisational controls", "Planning and preparation for incident management"),
    "A.8.2":  Control("A.8.2",  "Privileged access rights",                  "8. Technological controls",  "Allocation and management of privileged access"),
    "A.8.4":  Control("A.8.4",  "Access to source code",                     "8. Technological controls",  "Read/write access to source code and tools"),
    "A.8.8":  Control("A.8.8",  "Management of technical vulnerabilities",   "8. Technological controls",  "Timely identification and remediation of vulnerabilities"),
    "A.8.9":  Control("A.8.9",  "Configuration management",                  "8. Technological controls",  "Correct security configuration of hardware/software"),
    "A.8.11": Control("A.8.11", "Data masking",                              "8. Technological controls",  "Protection of sensitive data via masking/anonymisation"),
    "A.8.12": Control("A.8.12", "Data leakage prevention",                   "8. Technological controls",  "Prevent unauthorised disclosure of sensitive information"),
    "A.8.19": Control("A.8.19", "Installation of software on operational systems", "8. Technological controls", "Secure software installation procedures"),
    "A.8.24": Control("A.8.24", "Use of cryptography",                       "8. Technological controls",  "Rules on cryptographic controls and key management"),
    "A.8.25": Control("A.8.25", "Secure development lifecycle",              "8. Technological controls",  "Security rules for software development"),
    "A.8.26": Control("A.8.26", "Application security requirements",         "8. Technological controls",  "Security requirements for applications"),
    "A.8.27": Control("A.8.27", "Secure system architecture and principles", "8. Technological controls",  "Secure-by-design principles"),
    "A.8.28": Control("A.8.28", "Secure coding",                            "8. Technological controls",  "Secure coding principles and practices"),
    "A.8.29": Control("A.8.29", "Security testing in development and acceptance", "8. Technological controls", "Security testing throughout SDLC"),
}

# ── NIST CSF 2.0 ─────────────────────────────────────────────────────────
NIST_CSF_CONTROLS: dict[str, Control] = {
    "GV.OC-01": Control("GV.OC-01", "Organizational context",              "GOVERN",   "Mission, objectives, stakeholders, legal requirements understood"),
    "ID.AM-02": Control("ID.AM-02", "Software asset inventory",            "IDENTIFY",  "Software platforms and applications inventoried"),
    "ID.RA-01": Control("ID.RA-01", "Vulnerability identification",        "IDENTIFY",  "Vulnerabilities in assets are identified"),
    "ID.RA-02": Control("ID.RA-02", "Cyber threat intelligence",           "IDENTIFY",  "Cyber threat intelligence received from sharing forums"),
    "PR.AA-01": Control("PR.AA-01", "Identity management",                 "PROTECT",   "Identities and credentials managed for authorized users"),
    "PR.AA-02": Control("PR.AA-02", "Authentication",                      "PROTECT",   "Identities proved with appropriate authentication"),
    "PR.AA-05": Control("PR.AA-05", "Access permissions",                  "PROTECT",   "Access permissions managed based on least-privilege"),
    "PR.DS-01": Control("PR.DS-01", "Data-at-rest protection",             "PROTECT",   "Data-at-rest protected"),
    "PR.DS-02": Control("PR.DS-02", "Data-in-transit protection",          "PROTECT",   "Data-in-transit protected"),
    "PR.DS-10": Control("PR.DS-10", "Data-in-use protection",              "PROTECT",   "Data-in-use protected"),
    "PR.PS-01": Control("PR.PS-01", "Configuration management",            "PROTECT",   "Configuration management practices established"),
    "PR.PS-04": Control("PR.PS-04", "Log generation",                      "PROTECT",   "Audit/log records generated"),
    "PR.PS-06": Control("PR.PS-06", "Secure software development",         "PROTECT",   "Secure software development practices integrated"),
    "DE.AE-02": Control("DE.AE-02", "Anomalous activity analysis",         "DETECT",    "Potentially adverse events analyzed"),
    "DE.CM-01": Control("DE.CM-01", "Networks and environment monitoring", "DETECT",    "Networks and environment monitored"),
    "RS.MA-01": Control("RS.MA-01", "Incident response plan",              "RESPOND",   "Incident response plan executed"),
    "RC.RP-01": Control("RC.RP-01", "Recovery plan",                       "RECOVER",   "Recovery plan executed during/after incident"),
}

# ── CIS Controls v8 ──────────────────────────────────────────────────────
CIS_CONTROLS: dict[str, Control] = {
    "CIS-1":  Control("CIS-1",  "Inventory and Control of Enterprise Assets",      "IG1", "Actively manage all enterprise assets"),
    "CIS-2":  Control("CIS-2",  "Inventory and Control of Software Assets",        "IG1", "Actively manage all software on the network"),
    "CIS-3":  Control("CIS-3",  "Data Protection",                                "IG1", "Develop processes to identify, classify, and protect data"),
    "CIS-4":  Control("CIS-4",  "Secure Configuration of Enterprise Assets",      "IG1", "Establish and maintain secure configurations"),
    "CIS-5":  Control("CIS-5",  "Account Management",                             "IG1", "Use processes and tools to assign/manage authorization"),
    "CIS-6":  Control("CIS-6",  "Access Control Management",                      "IG1", "Use processes and tools to create, assign, manage access"),
    "CIS-7":  Control("CIS-7",  "Continuous Vulnerability Management",            "IG1", "Continuously acquire, assess, and remediate vulnerabilities"),
    "CIS-8":  Control("CIS-8",  "Audit Log Management",                           "IG1", "Collect, alert, review, and retain audit logs"),
    "CIS-9":  Control("CIS-9",  "Email and Web Browser Protections",              "IG1", "Improve protections for email and web browsers"),
    "CIS-10": Control("CIS-10", "Malware Defenses",                               "IG1", "Prevent/control malware installation/spread"),
    "CIS-11": Control("CIS-11", "Data Recovery",                                  "IG1", "Establish and maintain data recovery practices"),
    "CIS-12": Control("CIS-12", "Network Infrastructure Management",              "IG2", "Establish and maintain network infrastructure"),
    "CIS-13": Control("CIS-13", "Network Monitoring and Defense",                 "IG2", "Operate processes and tooling to establish network monitoring"),
    "CIS-14": Control("CIS-14", "Security Awareness and Skills Training",         "IG2", "Establish and maintain a security awareness program"),
    "CIS-16": Control("CIS-16", "Application Software Security",                  "IG2", "Manage security lifecycle of in-house and acquired software"),
    "CIS-18": Control("CIS-18", "Penetration Testing",                            "IG3", "Test effectiveness of defenses through red-team exercises"),
}

# ── RBI Cyber Security Framework (2016/2021) ─────────────────────────────
RBI_CONTROLS: dict[str, Control] = {
    "RBI-I.1":   Control("RBI-I.1",   "IT Governance — Board oversight",            "I. Governance",       "Board/senior management oversight of IT/cyber risk"),
    "RBI-I.2":   Control("RBI-I.2",   "IT/Cyber Security Policy",                   "I. Governance",       "Formal IS policy approved and communicated"),
    "RBI-II.1":  Control("RBI-II.1",  "Asset classification and management",        "II. Asset Management","Classify information assets and assign ownership"),
    "RBI-III.1": Control("RBI-III.1", "User access management",                     "III. Access Control", "Formal user access provisioning/de-provisioning process"),
    "RBI-III.2": Control("RBI-III.2", "Privileged access management",               "III. Access Control", "Strict control of privileged/administrator access"),
    "RBI-III.3": Control("RBI-III.3", "Authentication — critical systems",          "III. Access Control", "Strong authentication (MFA) for critical systems"),
    "RBI-IV.1":  Control("RBI-IV.1",  "Patch and vulnerability management",         "IV. IT Operations",   "Timely patching and vulnerability remediation"),
    "RBI-IV.2":  Control("RBI-IV.2",  "Secure configuration",                       "IV. IT Operations",   "Baseline security configuration for all systems"),
    "RBI-V.1":   Control("RBI-V.1",   "Data security and encryption",               "V. Data Protection",  "Encryption of sensitive/critical data at rest and transit"),
    "RBI-VI.1":  Control("RBI-VI.1",  "Network security",                           "VI. Network Sec.",    "Network segmentation and perimeter controls"),
    "RBI-VII.1": Control("RBI-VII.1", "Application security",                       "VII. App Security",   "Secure SDLC, code review, and application testing"),
    "RBI-VIII.1":Control("RBI-VIII.1","Security incident response",                 "VIII. CSIRT",         "Formal incident response plan and CSIRT capability"),
    "RBI-IX.1":  Control("RBI-IX.1",  "Cyber crisis management plan",               "IX. CCMP",            "Documented and tested cyber crisis management plan"),
    "RBI-X.1":   Control("RBI-X.1",   "Audit trails and log management",            "X. Audit",            "Comprehensive audit trails for critical systems"),
    "RBI-XI.1":  Control("RBI-XI.1",  "Vendor/third-party risk management",         "XI. Third-Party",     "Due diligence and ongoing monitoring of third parties"),
}

# ── SEBI CSCRF 2023 ──────────────────────────────────────────────────────
SEBI_CONTROLS: dict[str, Control] = {
    "SEBI-GV-1":  Control("SEBI-GV-1",  "Cyber security governance",            "Governance",      "Board-level cyber security governance structure"),
    "SEBI-GV-2":  Control("SEBI-GV-2",  "Cyber security policy",                "Governance",      "Documented cyber security policy and standards"),
    "SEBI-ID-1":  Control("SEBI-ID-1",  "Asset management",                     "Identify",        "Identify and classify information assets"),
    "SEBI-ID-2":  Control("SEBI-ID-2",  "Risk assessment",                      "Identify",        "Periodic cyber risk assessment"),
    "SEBI-PR-1":  Control("SEBI-PR-1",  "Access control",                       "Protect",         "Access control based on least-privilege and need-to-know"),
    "SEBI-PR-2":  Control("SEBI-PR-2",  "Data security",                        "Protect",         "Data classification, encryption, and masking"),
    "SEBI-PR-3":  Control("SEBI-PR-3",  "Secure configuration",                 "Protect",         "Hardened and auditable system configurations"),
    "SEBI-PR-4":  Control("SEBI-PR-4",  "Vulnerability and patch management",   "Protect",         "Timely identification and remediation of vulnerabilities"),
    "SEBI-PR-5":  Control("SEBI-PR-5",  "Application security",                 "Protect",         "Secure SDLC and application testing requirements"),
    "SEBI-PR-6":  Control("SEBI-PR-6",  "Cryptography",                         "Protect",         "Use of approved cryptographic standards"),
    "SEBI-DE-1":  Control("SEBI-DE-1",  "Audit log and monitoring",             "Detect",          "Log collection, monitoring and anomaly detection"),
    "SEBI-RS-1":  Control("SEBI-RS-1",  "Incident response",                    "Respond",         "Incident response plan, CSIRT, and reporting to SEBI/CERT-In"),
    "SEBI-RC-1":  Control("SEBI-RC-1",  "Recovery and resilience",              "Recover",         "BCP/DRP tested and maintained"),
    "SEBI-TP-1":  Control("SEBI-TP-1",  "Third-party risk management",          "Third-Party",     "Security requirements in vendor contracts"),
}

ALL_FRAMEWORKS: dict[str, dict[str, Control]] = {
    "iso27001": ISO27001_CONTROLS,
    "nist_csf": NIST_CSF_CONTROLS,
    "cis_controls": CIS_CONTROLS,
    "rbi_csf": RBI_CONTROLS,
    "sebi_cscrf": SEBI_CONTROLS,
}

FRAMEWORK_METADATA: dict[str, dict] = {
    "iso27001": {
        "name": "ISO/IEC 27001:2022",
        "full_name": "ISO/IEC 27001:2022 — Information security management systems",
        "issuer": "ISO/IEC JTC 1/SC 27",
        "applicability": "Universal — applicable to any organization",
        "total_controls": len(ISO27001_CONTROLS),
    },
    "nist_csf": {
        "name": "NIST CSF 2.0",
        "full_name": "NIST Cybersecurity Framework 2.0",
        "issuer": "NIST (National Institute of Standards and Technology)",
        "applicability": "Universal — US federal mandate, globally adopted",
        "total_controls": len(NIST_CSF_CONTROLS),
    },
    "cis_controls": {
        "name": "CIS Controls v8",
        "full_name": "CIS Critical Security Controls v8",
        "issuer": "Center for Internet Security",
        "applicability": "Universal — prioritized by Implementation Group (IG1/2/3)",
        "total_controls": len(CIS_CONTROLS),
    },
    "rbi_csf": {
        "name": "RBI CSF",
        "full_name": "RBI Cyber Security Framework for Banks (2016, updated 2021)",
        "issuer": "Reserve Bank of India",
        "applicability": "India — mandatory for RBI-regulated banks and NBFCs",
        "total_controls": len(RBI_CONTROLS),
    },
    "sebi_cscrf": {
        "name": "SEBI CSCRF 2023",
        "full_name": "SEBI Cybersecurity and Cyber Resilience Framework (2023)",
        "issuer": "Securities and Exchange Board of India",
        "applicability": "India — mandatory for SEBI-regulated market entities (brokers, AMCs, etc.)",
        "total_controls": len(SEBI_CONTROLS),
    },
}


# ---------------------------------------------------------------------------
# Finding category → control mapping
# ---------------------------------------------------------------------------
# Keys are finding category strings as emitted by the scanner.
# Values are dicts keyed by framework_id → list of control IDs that apply.
#
# The mapping_confidence is "directional" for all entries: a code finding
# maps to a control if remediating the finding would CONTRIBUTE to that
# control's objective — it doesn't mean the finding alone constitutes a full
# control gap audit.

_CATEGORY_TO_CONTROLS: dict[str, dict[str, list[str]]] = {
    "sql_injection": {
        "iso27001":    ["A.8.25", "A.8.26", "A.8.28", "A.8.29"],
        "nist_csf":    ["PR.PS-06", "ID.RA-01"],
        "cis_controls":["CIS-16", "CIS-7"],
        "rbi_csf":     ["RBI-VII.1", "RBI-IV.1"],
        "sebi_cscrf":  ["SEBI-PR-5", "SEBI-PR-4"],
    },
    "xss": {
        "iso27001":    ["A.8.25", "A.8.26", "A.8.28", "A.8.29"],
        "nist_csf":    ["PR.PS-06", "ID.RA-01"],
        "cis_controls":["CIS-16", "CIS-9"],
        "rbi_csf":     ["RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-5"],
    },
    "hardcoded_secret": {
        "iso27001":    ["A.8.24", "A.8.28", "A.8.12"],
        "nist_csf":    ["PR.PS-06", "PR.DS-01"],
        "cis_controls":["CIS-3", "CIS-16"],
        "rbi_csf":     ["RBI-V.1", "RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-2", "SEBI-PR-6", "SEBI-PR-5"],
    },
    "insecure_deserialization": {
        "iso27001":    ["A.8.25", "A.8.26", "A.8.28"],
        "nist_csf":    ["PR.PS-06", "ID.RA-01"],
        "cis_controls":["CIS-16"],
        "rbi_csf":     ["RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-5"],
    },
    "path_traversal": {
        "iso27001":    ["A.8.26", "A.8.28", "A.5.15"],
        "nist_csf":    ["PR.PS-06", "PR.AA-05"],
        "cis_controls":["CIS-6", "CIS-16"],
        "rbi_csf":     ["RBI-III.1", "RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-1", "SEBI-PR-5"],
    },
    "command_injection": {
        "iso27001":    ["A.8.25", "A.8.26", "A.8.28", "A.8.29"],
        "nist_csf":    ["PR.PS-06", "ID.RA-01"],
        "cis_controls":["CIS-16", "CIS-4"],
        "rbi_csf":     ["RBI-VII.1", "RBI-IV.2"],
        "sebi_cscrf":  ["SEBI-PR-5", "SEBI-PR-3"],
    },
    "insecure_cryptography": {
        "iso27001":    ["A.8.24"],
        "nist_csf":    ["PR.DS-01", "PR.DS-02"],
        "cis_controls":["CIS-3"],
        "rbi_csf":     ["RBI-V.1"],
        "sebi_cscrf":  ["SEBI-PR-6", "SEBI-PR-2"],
    },
    "weak_authentication": {
        "iso27001":    ["A.5.15", "A.5.17", "A.8.2"],
        "nist_csf":    ["PR.AA-01", "PR.AA-02"],
        "cis_controls":["CIS-5", "CIS-6"],
        "rbi_csf":     ["RBI-III.1", "RBI-III.3"],
        "sebi_cscrf":  ["SEBI-PR-1"],
    },
    "broken_access_control": {
        "iso27001":    ["A.5.15", "A.8.2"],
        "nist_csf":    ["PR.AA-05"],
        "cis_controls":["CIS-6"],
        "rbi_csf":     ["RBI-III.1", "RBI-III.2"],
        "sebi_cscrf":  ["SEBI-PR-1"],
    },
    "sensitive_data_exposure": {
        "iso27001":    ["A.8.11", "A.8.12", "A.8.24"],
        "nist_csf":    ["PR.DS-01", "PR.DS-02", "PR.DS-10"],
        "cis_controls":["CIS-3"],
        "rbi_csf":     ["RBI-V.1"],
        "sebi_cscrf":  ["SEBI-PR-2"],
    },
    "security_misconfiguration": {
        "iso27001":    ["A.8.9"],
        "nist_csf":    ["PR.PS-01"],
        "cis_controls":["CIS-4"],
        "rbi_csf":     ["RBI-IV.2"],
        "sebi_cscrf":  ["SEBI-PR-3"],
    },
    "insecure_dependencies": {
        "iso27001":    ["A.8.8", "A.8.19"],
        "nist_csf":    ["ID.RA-01", "PR.PS-01"],
        "cis_controls":["CIS-2", "CIS-7"],
        "rbi_csf":     ["RBI-IV.1"],
        "sebi_cscrf":  ["SEBI-PR-4"],
    },
    "logging_and_monitoring_failure": {
        "iso27001":    ["A.8.9"],
        "nist_csf":    ["PR.PS-04", "DE.CM-01", "DE.AE-02"],
        "cis_controls":["CIS-8"],
        "rbi_csf":     ["RBI-X.1"],
        "sebi_cscrf":  ["SEBI-DE-1"],
    },
    "ssrf": {
        "iso27001":    ["A.8.26", "A.8.28"],
        "nist_csf":    ["PR.PS-06"],
        "cis_controls":["CIS-12", "CIS-16"],
        "rbi_csf":     ["RBI-VI.1", "RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-5"],
    },
    "race_condition": {
        "iso27001":    ["A.8.28"],
        "nist_csf":    ["PR.PS-06"],
        "cis_controls":["CIS-16"],
        "rbi_csf":     ["RBI-VII.1"],
        "sebi_cscrf":  ["SEBI-PR-5"],
    },
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class FrameworkGap:
    framework_id: str
    framework_name: str
    total_controls: int
    matched_control_ids: list[str]
    gap_control_ids: list[str]
    coverage_pct: float
    matched_controls: list[dict] = field(default_factory=list)


@dataclass
class MappingResult:
    finding_categories: list[str]
    unrecognized_categories: list[str]
    frameworks: dict[str, FrameworkGap]
    mapping_confidence: str = "directional"
    note: str = (
        "Coverage % = controls with at least one matched finding / total controls "
        "in this module's subset. This is a code-finding-to-control directional "
        "mapping, not an audit result."
    )


def list_frameworks() -> list[dict]:
    """Return metadata for all 5 supported compliance frameworks."""
    return [
        {
            "framework_id": fid,
            **meta,
        }
        for fid, meta in FRAMEWORK_METADATA.items()
    ]


def map_findings(
    finding_categories: list[str],
    framework_ids: list[str] | None = None,
) -> MappingResult:
    """Map a list of finding category strings to compliance framework controls.

    Args:
        finding_categories: Scanner-emitted category strings. Case-insensitive;
            unknown categories are collected in MappingResult.unrecognized_categories.
        framework_ids: Subset of frameworks to include. None = all 5.

    Returns:
        MappingResult with per-framework gap analysis and coverage %.
    """
    target_frameworks = framework_ids or list(ALL_FRAMEWORKS.keys())

    # Normalize categories
    normalized = [c.lower().strip() for c in finding_categories]
    recognized = [c for c in normalized if c in _CATEGORY_TO_CONTROLS]
    unrecognized = [c for c in normalized if c not in _CATEGORY_TO_CONTROLS]

    # Collect matched control IDs per framework
    matched_per_framework: dict[str, set[str]] = {fid: set() for fid in target_frameworks}
    for cat in recognized:
        cat_map = _CATEGORY_TO_CONTROLS[cat]
        for fid in target_frameworks:
            for ctrl_id in cat_map.get(fid, []):
                matched_per_framework[fid].add(ctrl_id)

    # Build gap results
    frameworks: dict[str, FrameworkGap] = {}
    for fid in target_frameworks:
        all_controls = ALL_FRAMEWORKS.get(fid, {})
        matched_ids = sorted(matched_per_framework[fid])
        gap_ids = sorted(set(all_controls.keys()) - matched_per_framework[fid])
        coverage = len(matched_ids) / len(all_controls) if all_controls else 0.0

        frameworks[fid] = FrameworkGap(
            framework_id=fid,
            framework_name=FRAMEWORK_METADATA[fid]["name"],
            total_controls=len(all_controls),
            matched_control_ids=matched_ids,
            gap_control_ids=gap_ids,
            coverage_pct=round(coverage * 100, 1),
            matched_controls=[
                {
                    "id": c.id,
                    "name": c.name,
                    "domain": c.domain,
                    "description": c.description,
                }
                for cid, c in all_controls.items()
                if cid in matched_per_framework[fid]
            ],
        )

    return MappingResult(
        finding_categories=normalized,
        unrecognized_categories=unrecognized,
        frameworks=frameworks,
    )
