import {
  Vulnerability,
  VulnerabilitySeverity,
  ExploitabilityLevel,
  ImpactLevel,
  PriorityLevel,
  RiskLevel,
  DeterministicRiskBreakdown,
  VulnerabilityRiskResult,
  BusinessPriority,
  Currency,
} from '../types';
import { logger } from '../logger/streamLogger';

// Weights mapping (strictly deterministic mathematical constants)
export const SEVERITY_WEIGHTS: Record<VulnerabilitySeverity, number> = {
  Critical: 1.0,
  High: 0.82,
  Medium: 0.58,
  Low: 0.3,
};

export const EXPLOITABILITY_WEIGHTS: Record<ExploitabilityLevel, number> = {
  Critical: 1.0,
  High: 0.9,
  Medium: 0.65,
  Low: 0.35,
};

export const BUSINESS_IMPACT_WEIGHTS: Record<ImpactLevel, number> = {
  Critical: 1.0,
  High: 0.85,
  Medium: 0.55,
  Low: 0.3,
};

export const ASSET_CRITICALITY_WEIGHTS: Record<PriorityLevel, number> = {
  'VERY HIGH': 1.0,
  HIGH: 0.82,
  MEDIUM: 0.55,
  LOW: 0.3,
};

export const COMPLIANCE_WEIGHTS: Record<'High' | 'Medium' | 'Low', number> = {
  High: 1.0,
  Medium: 0.75,
  Low: 0.5,
};

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 81) return 'Critical';
  if (score >= 61) return 'High';
  if (score >= 41) return 'Medium';
  if (score >= 21) return 'Moderate';
  return 'Low';
}

export function calculateDeterministicRisk(
  vuln: Vulnerability,
  businessPriorities?: BusinessPriority[],
  currency: Currency = 'INR'
): VulnerabilityRiskResult {
  const sevW = SEVERITY_WEIGHTS[vuln.severity] ?? 0.5;
  const expW = EXPLOITABILITY_WEIGHTS[vuln.exploitability] ?? 0.5;
  const impW = BUSINESS_IMPACT_WEIGHTS[vuln.businessImpact] ?? 0.5;

  // Check if asset priority was dynamically adjusted in businessPriorities
  let assetCritPriority: PriorityLevel = vuln.assetCriticality;
  if (businessPriorities) {
    const matched = businessPriorities.find(
      (bp) => bp.name.toLowerCase() === vuln.asset.toLowerCase() || vuln.asset.toLowerCase().includes(bp.name.toLowerCase())
    );
    if (matched) {
      assetCritPriority = matched.priority;
    }
  }

  const critW = ASSET_CRITICALITY_WEIGHTS[assetCritPriority] ?? 0.5;
  const compW = COMPLIANCE_WEIGHTS[vuln.complianceImpact] ?? 0.7;

  // Product of dimensional risk weights
  const rawProduct = sevW * expW * impW * critW * compW;

  // Normalized strictly to 0 - 100 with calibrated scaling
  // A Critical (1.0) * High (0.9) * Critical (1.0) * Very High (1.0) * High (1.0) = 0.90 -> 90 score
  let normalizedScore = Math.min(100, Math.max(5, Math.round(rawProduct * 100)));

  // Probability of loss: calibrated by exploitability + severity
  const probabilityOfLoss = Math.min(0.95, Math.max(0.08, Number(((sevW * 0.4 + expW * 0.6) * 0.92).toFixed(2))));

  // Financial impact base: scaled for INR (Lakhs) or USD
  // Critical financial loss: ~₹12L - ₹15L ($120k - $150k)
  const baseFinancialMultiplier = currency === 'INR' ? 1400000 : 140000;
  const financialImpactRatio = (impW * 0.6 + critW * 0.4);
  const potentialFinancialImpact = Math.round(baseFinancialMultiplier * financialImpactRatio);

  // Expected Annual Loss (EAL) = Probability of Loss * Estimated Financial Impact
  const eal = Math.round(probabilityOfLoss * potentialFinancialImpact);

  const breakdown: DeterministicRiskBreakdown = {
    severityWeight: sevW,
    exploitabilityWeight: expW,
    businessImpactWeight: impW,
    assetCriticalityWeight: critW,
    complianceWeight: compW,
    rawScore: Number(rawProduct.toFixed(4)),
    normalizedScore,
    riskLevel: getRiskLevel(normalizedScore),
    probabilityOfLoss,
    estimatedFinancialImpact: potentialFinancialImpact,
    eal,
  };

  return {
    vulnerability: {
      ...vuln,
      assetCriticality: assetCritPriority,
    },
    riskScore: normalizedScore,
    riskLevel: breakdown.riskLevel,
    eal,
    potentialFinancialImpact,
    probabilityOfLoss,
    breakdown,
    rank: 0, // Assigned after sorting
  };
}

export function rankVulnerabilities(
  vulnerabilities: Vulnerability[],
  businessPriorities?: BusinessPriority[],
  currency: Currency = 'INR'
): VulnerabilityRiskResult[] {
  const scored = vulnerabilities.map((v) => calculateDeterministicRisk(v, businessPriorities, currency));

  // Sort descending by risk score, tie-break by EAL
  scored.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.eal - a.eal;
  });

  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

export function recalculateRiskWithControls(
  baseResults: VulnerabilityRiskResult[],
  appliedControlCodes: string[],
  currency: Currency = 'INR'
): {
  residualResults: VulnerabilityRiskResult[];
  baselineTotalScore: number;
  residualTotalScore: number;
  baselineTotalEal: number;
  residualTotalEal: number;
  riskReductionPct: number;
  ealReduction: number;
} {
  const codeSet = new Set(appliedControlCodes.map((c) => c.toUpperCase()));

  const residualResults = baseResults.map((item) => {
    let reductionMultiplier = 1.0;
    const title = item.vulnerability.title.toLowerCase();

    // Map control mitigation efficacy deterministically across all industry vectors
    if ((codeSet.has('WAF') || codeSet.has('API_SEC')) && (title.includes('sql') || title.includes('injection') || title.includes('api') || title.includes('cart') || title.includes('xss') || title.includes('parameter'))) {
      reductionMultiplier *= 0.62; // 38% reduction
    }
    if ((codeSet.has('MFA') || codeSet.has('IAM_PAM') || codeSet.has('IAM_PROT')) && (title.includes('password') || title.includes('authentication') || title.includes('auth') || title.includes('login') || title.includes('credential') || title.includes('loyalty'))) {
      reductionMultiplier *= 0.52; // 48% reduction
    }
    if (codeSet.has('PATCH') && (title.includes('library') || title.includes('outdated') || title.includes('struts') || title.includes('cve') || title.includes('rce') || title.includes('buffer'))) {
      reductionMultiplier *= 0.48; // 52% reduction
    }
    if (codeSet.has('DLP') && (title.includes('data') || title.includes('sensitive') || title.includes('exposure') || title.includes('phi') || title.includes('ehr') || title.includes('pii') || title.includes('unencrypted'))) {
      reductionMultiplier *= 0.50; // 50% reduction
    }
    if (codeSet.has('EDR') && (title.includes('ransomware') || title.includes('smb') || title.includes('pos') || title.includes('lateral') || title.includes('usb') || title.includes('auto-run'))) {
      reductionMultiplier *= 0.45; // 55% reduction
    }
    if (codeSet.has('CLOUD_SEC') && (title.includes('s3') || title.includes('bucket') || title.includes('cloud') || title.includes('container') || title.includes('kubernetes') || title.includes('k8s') || title.includes('tenant') || title.includes('breakout'))) {
      reductionMultiplier *= 0.48; // 52% reduction
    }
    if (codeSet.has('API_SEC') && (title.includes('idor') || title.includes('graphql') || title.includes('secret') || title.includes('token') || title.includes('b2b') || title.includes('clearing'))) {
      reductionMultiplier *= 0.55; // 45% reduction
    }
    if (codeSet.has('ZTNA') && (title.includes('bridge') || title.includes('segmentation') || title.includes('subnet') || title.includes('lateral') || title.includes('traversal') || title.includes('air-gap'))) {
      reductionMultiplier *= 0.46; // 54% reduction
    }
    if (codeSet.has('SIEM_SOAR') && (title.includes('firmware') || title.includes('telemetry') || title.includes('reconnaissance') || title.includes('detection'))) {
      reductionMultiplier *= 0.58; // 42% reduction
    }
    if (codeSet.has('OT_DIODE') && (title.includes('scada') || title.includes('modbus') || title.includes('rtu') || title.includes('plc') || title.includes('turbine') || title.includes('grid'))) {
      reductionMultiplier *= 0.35; // 65% reduction
    }
    if (codeSet.has('HSM_CRYPTO') && (title.includes('crypto') || title.includes('side-channel') || title.includes('rsa') || title.includes('private key') || title.includes('satellite') || title.includes('firmware'))) {
      reductionMultiplier *= 0.38; // 62% reduction
    }
    if (codeSet.has('MED_ISOLATION') && (title.includes('dicom') || title.includes('pacs') || title.includes('infusion') || title.includes('imaging') || title.includes('clinical'))) {
      reductionMultiplier *= 0.36; // 64% reduction
    }
    if (codeSet.has('FRAUD_SHIELD') && (title.includes('payment') || title.includes('settlement') || title.includes('wire') || title.includes('fraud') || title.includes('ledger') || title.includes('loyalty'))) {
      reductionMultiplier *= 0.42; // 58% reduction
    }
    if (codeSet.has('SUPPLY_SEC') && (title.includes('trojan') || title.includes('supply') || title.includes('upstream') || title.includes('backdoor') || title.includes('math library'))) {
      reductionMultiplier *= 0.40; // 60% reduction
    }

    const residualScore = Math.max(10, Math.round(item.riskScore * reductionMultiplier));
    const residualEal = Math.round(item.eal * reductionMultiplier);

    return {
      ...item,
      riskScore: residualScore,
      eal: residualEal,
      riskLevel: getRiskLevel(residualScore),
    };
  });

  const baselineTotalScore = Math.round(
    baseResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, baseResults.length)
  );
  const residualTotalScore = Math.round(
    residualResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, residualResults.length)
  );

  const baselineTotalEal = baseResults.reduce((acc, curr) => acc + curr.eal, 0);
  const residualTotalEal = residualResults.reduce((acc, curr) => acc + curr.eal, 0);

  const riskReductionPct = baselineTotalScore > 0
    ? Math.round(((baselineTotalScore - residualTotalScore) / baselineTotalScore) * 100)
    : 0;

  const ealReduction = baselineTotalEal - residualTotalEal;

  logger.log(
    'control_recommendations',
    'Residual Risk & Security Level Engine',
    'RRSL',
    `RRSL [Residual Risk & Security Level]: Baseline Risk ${baselineTotalScore}/100 -> Residual Risk ${residualTotalScore}/100 (${riskReductionPct}% net reduction). EAL Reduced: ${currency === 'INR' ? '₹' + (ealReduction / 100000).toFixed(1) + 'L' : '$' + ealReduction.toLocaleString()}. Applied controls: ${appliedControlCodes.length > 0 ? appliedControlCodes.join(', ') : 'None'}.`,
    {
      appliedControls: appliedControlCodes,
      baselineTotalScore,
      residualTotalScore,
      riskReductionPct,
      baselineTotalEal,
      residualTotalEal,
      ealReduction,
    }
  );

  return {
    residualResults,
    baselineTotalScore,
    residualTotalScore,
    baselineTotalEal,
    residualTotalEal,
    riskReductionPct,
    ealReduction,
  };
}
