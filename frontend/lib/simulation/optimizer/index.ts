import { SecurityControl, OptimizationResult, Currency, Vulnerability, VulnerabilityRiskResult } from '../types';

export function runKnapsackOptimization(
  controls: SecurityControl[],
  availableBudget: number,
  currency: Currency = 'INR',
  baselineRiskScore: number = 72,
  baselineEal: number = 1240000,
  vulnerabilities?: (Vulnerability | VulnerabilityRiskResult)[]
): OptimizationResult {
  const isINR = currency === 'INR';

  // Normalize vulnerabilities if provided to evaluate sector-specific contextual ROI
  const activeVulnList: Vulnerability[] = vulnerabilities
    ? vulnerabilities.map((v) => ('vulnerability' in v ? (v as VulnerabilityRiskResult).vulnerability : (v as Vulnerability)))
    : [];

  const vulnTitles = activeVulnList.map((v) => `${v.title} ${v.asset} ${v.service} ${v.id}`.toLowerCase());

  // Calculate context-weighted risk reduction and ROI score for each control
  const evaluatedControls = controls.map((ctrl) => {
    const cost = isINR ? ctrl.costINR : ctrl.costUSD;
    let relevanceFactor = 1.0;

    if (activeVulnList.length > 0) {
      // Check how well this control addresses the company's active findings
      let matchCount = 0;
      const coverageKeywords = [...ctrl.coverage, ctrl.name, ctrl.code].map((c) => c.toLowerCase());

      vulnTitles.forEach((vt) => {
        const matchesKeyword = coverageKeywords.some((kw) => vt.includes(kw) || kw.includes(vt));
        const matchesExplicitId = ctrl.supportedVulnerabilities?.some((id) => vt.includes(id.toLowerCase())) ?? false;
        if (matchesKeyword || matchesExplicitId) {
          matchCount++;
        }
      });

      if (matchCount > 0) {
        // Boost value proportional to matching threats in the environment
        relevanceFactor = Math.min(2.2, 0.8 + matchCount * 0.35);
      } else {
        // Lower priority if organization has no matching vulnerability vectors
        relevanceFactor = 0.25;
      }
    }

    const effectiveReduction = Math.round(ctrl.riskReduction * relevanceFactor);
    const roi = cost > 0 ? Number(((effectiveReduction / cost) * (isINR ? 100000 : 1000)).toFixed(2)) : 0;

    return {
      ...ctrl,
      effectiveReduction,
      roiScore: roi,
    };
  });

  const n = evaluatedControls.length;
  let bestCombination: (SecurityControl & { effectiveReduction: number })[] = [];
  let maxScore = -1;
  let optimalCost = 0;
  let iterations = 0;

  const totalCombinations = 1 << n; // 2^n up to 32768

  for (let mask = 0; mask < totalCombinations; mask++) {
    iterations++;
    const currentSubset: (SecurityControl & { effectiveReduction: number })[] = [];
    let currentCost = 0;
    let currentRawReduction = 0;
    const selectedIds = new Set<string>();

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) {
        const ctrl = evaluatedControls[i];
        currentSubset.push(ctrl);
        selectedIds.add(ctrl.id);
        currentCost += isINR ? ctrl.costINR : ctrl.costUSD;
        currentRawReduction += ctrl.effectiveReduction;
      }
    }

    // Check budget constraint
    if (currentCost > availableBudget) {
      continue;
    }

    // Check dependencies constraint (e.g. API_SEC requires WAF, PAM requires MFA)
    let dependenciesMet = true;
    for (const ctrl of currentSubset) {
      if (ctrl.dependencies && ctrl.dependencies.length > 0) {
        for (const depId of ctrl.dependencies) {
          if (!selectedIds.has(depId)) {
            dependenciesMet = false;
            break;
          }
        }
      }
      if (!dependenciesMet) break;
    }

    if (!dependenciesMet) {
      continue;
    }

    // Diminishing returns scaling: as more controls stack, overlap dampens marginal gain
    const normalizedReduction = Math.min(
      88,
      Math.round(currentRawReduction * (1 - currentSubset.length * 0.025))
    );

    // Knapsack objective: maximize risk reduction; tie-break by lower cost
    if (
      normalizedReduction > maxScore ||
      (normalizedReduction === maxScore && currentCost < optimalCost)
    ) {
      maxScore = normalizedReduction;
      bestCombination = currentSubset;
      optimalCost = currentCost;
    }
  }

  // Fallback if no combination fit within budget
  if (maxScore < 0) {
    bestCombination = [];
    optimalCost = 0;
    maxScore = 0;
  }

  const selectedIds = new Set(bestCombination.map((c) => c.id));
  const rejectedControls = evaluatedControls.filter((c) => !selectedIds.has(c.id));

  const totalInvestment = optimalCost;
  const remainingBudget = Math.max(0, availableBudget - totalInvestment);
  const totalRiskReductionPct = maxScore;

  const projectedRiskScore = Math.max(
    10,
    Math.round(baselineRiskScore * (1 - totalRiskReductionPct / 100))
  );

  const ealReduction = Math.round(baselineEal * (totalRiskReductionPct / 100));
  const projectedEal = Math.max(0, baselineEal - ealReduction);
  const budgetUtilizationPct = availableBudget > 0 ? Math.round((totalInvestment / availableBudget) * 100) : 0;

  return {
    availableBudget,
    currency,
    selectedControls: bestCombination,
    rejectedControls,
    totalInvestment,
    remainingBudget,
    totalRiskReductionPct,
    baselineRiskScore,
    projectedRiskScore,
    baselineEal,
    projectedEal,
    ealReduction,
    budgetUtilizationPct,
    optimizationMethod: '0/1_Knapsack_Exact',
    iterationsCount: iterations,
    aiRationale: `The Knapsack optimizer selected ${bestCombination.length} prioritized controls (${bestCombination.map((c) => c.code).join(', ')}) to achieve ${totalRiskReductionPct}% risk reduction. Capital invested: ${isINR ? '₹' + (totalInvestment / 100000).toFixed(1) + 'L' : '$' + totalInvestment.toLocaleString()}, leaving ${isINR ? '₹' + (remainingBudget / 100000).toFixed(1) + 'L' : '$' + remainingBudget.toLocaleString()} in reserve.`,
  };
}
