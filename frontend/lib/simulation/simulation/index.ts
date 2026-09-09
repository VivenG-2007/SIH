import {
  SimulationState,
  Company,
  PipelineStage,
  WhatIfComparison,
  WhatIfScenario,
  VulnerabilityRiskResult,
  SecurityControl,
} from '../types';
import { DEMO_COMPANIES, generateBusinessContext, generateBusinessPriorities } from '../business';
import { getVulnerabilitiesForCompany } from '../vulnerabilities';
import { rankVulnerabilities, recalculateRiskWithControls } from '../risk-engine';
import { SECURITY_CONTROLS_CATALOG } from '../controls';
import { runKnapsackOptimization } from '../optimizer';
import { generateUnifiedAiIntelligence, generateWhatIfAiExplanation, getWhyModalDetails } from '../ai';
import { logger } from '../logger/streamLogger';

export function createInitialSimulationState(sessionId?: string): SimulationState {
  const sid = sessionId || `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  logger.setSessionId(sid);

  const defaultCompany = DEMO_COMPANIES['Banking'];
  const businessContext = generateBusinessContext(defaultCompany);
  const businessPriorities = generateBusinessPriorities(defaultCompany);
  const vulnerabilities = getVulnerabilitiesForCompany(defaultCompany.type, defaultCompany.importantAssets, defaultCompany.keyServices);
  const riskResults = rankVulnerabilities(vulnerabilities, businessPriorities, defaultCompany.currency);
  const controls = [...SECURITY_CONTROLS_CATALOG];

  const baselineRiskScore = Math.round(
    riskResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, riskResults.length)
  );
  const baselineEal = riskResults.reduce((acc, curr) => acc + curr.eal, 0);

  const optimization = runKnapsackOptimization(
    controls,
    defaultCompany.annualSecurityBudget,
    defaultCompany.currency,
    baselineRiskScore,
    baselineEal,
    vulnerabilities
  );

  return {
    sessionId: sid,
    currentStage: 'company_input',
    completedStages: ['company_input'],
    company: defaultCompany,
    businessContext,
    businessPriorities,
    vulnerabilities,
    riskResults,
    controls,
    optimization,
    activeWhatIf: null,
    logs: [],
    isSimulating: false,
    isAiProcessing: false,
    activeWhyModal: null,
    unifiedAiAnalysisLoaded: false,
    aiCallsCount: 0,
  };
}

/**
 * Execute the What-If simulation engine:
 * 1. Clones the current system state
 * 2. Applies hypothetical change ONLY to clone
 * 3. Recalculates vulnerability risk, total risk, EAL, optimized controls, remaining budget
 * 4. Generates AI explanation of delta
 * 5. Returns baseline vs hypothetical comparison without mutating baseline!
 */
export function evaluateWhatIfScenario(
  state: SimulationState,
  scenario: WhatIfScenario
): WhatIfComparison {
  const baseline = {
    riskScore: state.optimization?.baselineRiskScore || 72,
    eal: state.optimization?.baselineEal || 1240000,
    selectedControls: state.optimization?.selectedControls || [],
    budgetUsed: state.optimization?.totalInvestment || 0,
    remainingBudget: state.optimization?.remainingBudget || 0,
  };

  // Deep clone candidate controls and budget for hypothetical branch
  const targetBudget = scenario.targetBudget ?? state.company.annualSecurityBudget;
  const isINR = state.company.currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  let hypotheticalControls: SecurityControl[] = [...(state.optimization?.selectedControls || [])];

  // Apply hypothetical control toggles
  if (scenario.appliedControlIds.length > 0) {
    scenario.appliedControlIds.forEach((id) => {
      const found = state.controls.find((c) => c.id === id || c.code === id);
      if (found && !hypotheticalControls.some((hc) => hc.id === found.id)) {
        hypotheticalControls.push(found);
      }
    });
  }

  if (scenario.removedControlIds.length > 0) {
    hypotheticalControls = hypotheticalControls.filter(
      (c) => !scenario.removedControlIds.includes(c.id) && !scenario.removedControlIds.includes(c.code)
    );
  }

  // If budget changed and no manual control specified, re-run knapsack with new budget
  if (scenario.targetBudget !== undefined && scenario.appliedControlIds.length === 0 && scenario.removedControlIds.length === 0) {
    const reoptimized = runKnapsackOptimization(
      state.controls,
      targetBudget,
      state.company.currency,
      baseline.riskScore,
      baseline.eal,
      state.vulnerabilities
    );
    hypotheticalControls = reoptimized.selectedControls;
  }

  // Recalculate deterministic risk with hypothetical controls
  const controlCodes = hypotheticalControls.map((c) => c.code);
  const recalculated = recalculateRiskWithControls(
    state.riskResults,
    controlCodes,
    state.company.currency
  );

  const budgetUsed = hypotheticalControls.reduce(
    (sum, c) => sum + (isINR ? c.costINR : c.costUSD),
    0
  );
  const remainingBudget = Math.max(0, targetBudget - budgetUsed);

  const hypothetical = {
    riskScore: recalculated.residualTotalScore,
    eal: recalculated.residualTotalEal,
    selectedControls: hypotheticalControls,
    budgetUsed,
    remainingBudget,
  };

  const deltas = {
    riskDelta: hypothetical.riskScore - baseline.riskScore,
    riskReductionPct: baseline.riskScore > 0
      ? Math.round(((baseline.riskScore - hypothetical.riskScore) / baseline.riskScore) * 100)
      : 0,
    ealDelta: hypothetical.eal - baseline.eal,
    budgetUsedDelta: budgetUsed - baseline.budgetUsed,
    remainingBudgetDelta: remainingBudget - baseline.remainingBudget,
  };

  const comparison: WhatIfComparison = {
    scenario,
    baseline,
    hypothetical,
    deltas,
    aiExplanation: '',
  };

  // Generate business-friendly AI explanation of the deterministic numbers
  comparison.aiExplanation = generateWhatIfAiExplanation(comparison, currencySymbol);

  logger.log(
    'what_if_comparison',
    'Residual Risk & Security Level Engine',
    'RRSL',
    `RRSL [What-If Residual Risk]: Baseline ${baseline.riskScore} -> Hypothetical Residual ${hypothetical.riskScore} (${deltas.riskReductionPct}% reduction). Residual EAL: ${currencySymbol}${(hypothetical.eal / (isINR ? 100000 : 1)).toFixed(1)}${isINR ? 'L' : ''}. Controls: [${controlCodes.join(', ')}].`,
    { scenario, deltas, controls: controlCodes }
  );

  return comparison;
}

/**
 * Natural language query parser for quick What-If inquiries
 */
export function parseNaturalLanguageWhatIf(query: string, state: SimulationState): WhatIfScenario {
  const q = query.toLowerCase();
  const applied: string[] = [];
  const removed: string[] = [];
  let targetBudget: number | undefined;

  // Check controls
  if (q.includes('waf') || q.includes('firewall')) {
    if (q.includes('remove') || q.includes('without')) removed.push('WAF');
    else applied.push('WAF');
  }
  if (q.includes('mfa') || q.includes('multi-factor') || q.includes('two-factor')) {
    if (q.includes('remove') || q.includes('without')) removed.push('MFA');
    else applied.push('MFA');
  }
  if (q.includes('patch') || q.includes('patching')) {
    if (q.includes('remove')) removed.push('PATCH');
    else applied.push('PATCH');
  }
  if (q.includes('edr') || q.includes('endpoint')) {
    if (q.includes('remove')) removed.push('EDR');
    else applied.push('EDR');
  }
  if (q.includes('cloud') || q.includes('s3')) {
    if (q.includes('remove')) removed.push('CLOUD_SEC');
    else applied.push('CLOUD_SEC');
  }
  if (q.includes('dlp') || q.includes('data loss') || q.includes('encryption')) {
    if (q.includes('remove')) removed.push('DLP');
    else applied.push('DLP');
  }

  // Check budget adjustments
  if (q.includes('5 lakhs') || q.includes('5l') || q.includes('500000') || q.includes('500k')) {
    targetBudget = 500000;
  } else if (q.includes('15 lakhs') || q.includes('15l')) {
    targetBudget = 1500000;
  } else if (q.includes('20 lakhs') || q.includes('20l')) {
    targetBudget = 2000000;
  } else if (q.includes('reduce') && q.includes('20%')) {
    targetBudget = Math.round(state.company.annualSecurityBudget * 0.8);
  } else if (q.includes('increase') && q.includes('50%')) {
    targetBudget = Math.round(state.company.annualSecurityBudget * 1.5);
  }

  // Fallback defaults if generic
  if (applied.length === 0 && removed.length === 0 && targetBudget === undefined) {
    applied.push('WAF');
  }

  return {
    id: `whatif_${Date.now()}`,
    query,
    actionType: targetBudget !== undefined ? 'change_budget' : 'toggle_control',
    appliedControlIds: applied,
    removedControlIds: removed,
    targetBudget,
    resolvedVulnerabilityIds: [],
  };
}
