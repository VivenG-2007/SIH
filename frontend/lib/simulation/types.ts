// ============================================================================
// Types for AI-Powered Cyber Risk Quantification & Investment Optimization
// ============================================================================

export type CompanyType =
  | 'Banking'
  | 'Healthcare'
  | 'SaaS / Cloud'
  | 'Retail'
  | 'Critical Infrastructure / Energy'
  | 'Defense';

export type DataSensitivity =
  | 'Public'
  | 'Internal'
  | 'Confidential'
  | 'Financial'
  | 'Personal'
  | 'Highly Sensitive';

export type Currency = 'INR' | 'USD';

export type PriorityLevel = 'VERY HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RiskLevel = 'Low' | 'Moderate' | 'Medium' | 'High' | 'Critical';

export type VulnerabilitySeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type ExploitabilityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type ImpactLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type SecuritySource =
  | 'SIEM'
  | 'EDR'
  | 'IAM'
  | 'CSPM'
  | 'SCA'
  | 'SAST'
  | 'DAST'
  | 'CISA KEV'
  | 'Threat Intelligence';

export type PipelineStage =
  | 'company_input'
  | 'business_context'
  | 'priorities'
  | 'vulnerabilities'
  | 'risk_calculation'
  | 'ai_ranking'
  | 'control_recommendations'
  | 'budget_optimization'
  | 'what_if_lab'
  | 'what_if_comparison'
  | 'executive_decision';

export interface Company {
  name: string;
  type: CompanyType;
  industry: string;
  keyServices: string[];
  importantAssets: string[];
  dataSensitivity: DataSensitivity[];
  annualSecurityBudget: number; // Stored in base currency units (INR or USD)
  currency: Currency;
  annualRevenueEstimated?: number;
}

export interface BusinessContext {
  businessTypeAndGoals: string;
  criticalAssets: string[];
  criticalServices: string[];
  dataSensitivitySummary: string;
  potentialBusinessRisks: string[];
  regulatoryExposure: string[];
  operationalDependencies: string[];
  aiModelUsed: string;
  generatedAt: string;
}

export interface BusinessPriority {
  id: string;
  name: string;
  type: 'asset' | 'service';
  priority: PriorityLevel;
  businessImpact: string;
  criticalityScore: number; // 0.1 to 1.0 multiplier
  isManualOverride?: boolean;
}

export interface Vulnerability {
  id: string;
  title: string;
  cwe: string;
  severity: VulnerabilitySeverity;
  exploitability: ExploitabilityLevel;
  businessImpact: ImpactLevel;
  assetCriticality: PriorityLevel;
  complianceImpact: 'High' | 'Medium' | 'Low';
  asset: string;
  service: string;
  status: 'Open' | 'Mitigated' | 'In Progress';
  source: SecuritySource;
  cveId?: string;
  description?: string;
}

export interface DeterministicRiskBreakdown {
  severityWeight: number;
  exploitabilityWeight: number;
  businessImpactWeight: number;
  assetCriticalityWeight: number;
  complianceWeight: number;
  rawScore: number;
  normalizedScore: number; // 0 - 100
  riskLevel: RiskLevel;
  probabilityOfLoss: number; // 0.05 to 0.95
  estimatedFinancialImpact: number; // In currency
  eal: number; // Expected Annual Loss
}

export interface VulnerabilityRiskResult {
  vulnerability: Vulnerability;
  riskScore: number;
  riskLevel: RiskLevel;
  eal: number;
  potentialFinancialImpact: number;
  probabilityOfLoss: number;
  breakdown: DeterministicRiskBreakdown;
  rank: number;
  aiExplanation?: string;
}

export interface SecurityControl {
  id: string;
  name: string;
  code: string;
  category: string;
  costINR: number;
  costUSD: number;
  riskReduction: number; // percentage e.g. 30 for 30%
  coverage: string[]; // vulnerability titles or IDs it protects against
  implementationTime: string; // e.g. "2-3 weeks"
  dependencies: string[]; // other control IDs required
  supportedVulnerabilities: string[]; // Vuln IDs
  description: string;
  roiScore?: number; // calculated as risk reduction / cost
}

export interface OptimizationResult {
  availableBudget: number;
  currency: Currency;
  selectedControls: SecurityControl[];
  rejectedControls: SecurityControl[];
  totalInvestment: number;
  remainingBudget: number;
  totalRiskReductionPct: number;
  baselineRiskScore: number;
  projectedRiskScore: number;
  baselineEal: number;
  projectedEal: number;
  ealReduction: number;
  budgetUtilizationPct: number;
  optimizationMethod: '0/1_Knapsack_Exact' | 'Greedy_Heuristic';
  iterationsCount: number;
  aiRationale?: string;
}

export interface WhatIfScenario {
  id: string;
  query: string;
  actionType: 'toggle_control' | 'change_budget' | 'fix_vulnerability' | 'custom';
  appliedControlIds: string[];
  removedControlIds: string[];
  targetBudget?: number;
  resolvedVulnerabilityIds: string[];
}

export interface WhatIfComparison {
  scenario: WhatIfScenario;
  baseline: {
    riskScore: number;
    eal: number;
    selectedControls: SecurityControl[];
    budgetUsed: number;
    remainingBudget: number;
  };
  hypothetical: {
    riskScore: number;
    eal: number;
    selectedControls: SecurityControl[];
    budgetUsed: number;
    remainingBudget: number;
  };
  deltas: {
    riskDelta: number; // e.g. -30
    riskReductionPct: number; // e.g. 33.3%
    ealDelta: number; // e.g. -500000
    budgetUsedDelta: number;
    remainingBudgetDelta: number;
  };
  aiExplanation: string;
}

export interface WhyExplanation {
  subjectId: string;
  title: string;
  category: 'vulnerability_rank' | 'control_selection' | 'metric' | 'what_if';
  deterministicMathExplanation: string;
  aiBusinessExplanation: string;
  formulaDetails?: Record<string, string | number>;
  keyDrivers: string[];
}

// Logging & Session Types
export type LogLevel = 'INFO' | 'CALC' | 'AI_THINK' | 'OPTIMIZE' | 'AUDIT' | 'ALERT' | 'RRSL';

export interface SimulationLogEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  stage: PipelineStage;
  stageName: string;
  level: LogLevel;
  message: string;
  payload?: Record<string, any>;
  durationMs?: number;
}

export interface SimulationSession {
  sessionId: string;
  companyName: string;
  industry: string;
  currency: Currency;
  budget: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed';
  totalLogsCount: number;
  llmCallsCount: number;
  finalMetrics?: {
    baselineRisk: number;
    projectedRisk: number;
    riskReductionPct: number;
    baselineEal: number;
    ealReduction: number;
    totalInvestment: number;
    remainingBudget: number;
  };
}

export interface SimulationState {
  sessionId: string;
  currentStage: PipelineStage;
  completedStages: PipelineStage[];
  company: Company;
  businessContext: BusinessContext | null;
  businessPriorities: BusinessPriority[];
  vulnerabilities: Vulnerability[];
  riskResults: VulnerabilityRiskResult[];
  controls: SecurityControl[];
  optimization: OptimizationResult | null;
  activeWhatIf: WhatIfComparison | null;
  logs: SimulationLogEntry[];
  isSimulating: boolean;
  isAiProcessing: boolean;
  activeWhyModal: WhyExplanation | null;
  unifiedAiAnalysisLoaded: boolean;
  aiCallsCount: number;
}
