'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  SimulationState,
  PipelineStage,
  Company,
  CompanyType,
  BusinessPriority,
  PriorityLevel,
  VulnerabilityRiskResult,
  WhatIfScenario,
  WhyExplanation,
} from '@/lib/simulation/types';
import {
  createInitialSimulationState,
  evaluateWhatIfScenario,
  parseNaturalLanguageWhatIf,
} from '@/lib/simulation/simulation';
import { DEMO_COMPANIES, generateBusinessContext, generateBusinessPriorities } from '@/lib/simulation/business';
import { getVulnerabilitiesForCompany } from '@/lib/simulation/vulnerabilities';
import { rankVulnerabilities } from '@/lib/simulation/risk-engine';
import { runKnapsackOptimization } from '@/lib/simulation/optimizer';
import { generateUnifiedAiIntelligence, getWhyModalDetails } from '@/lib/simulation/ai';
import { logger } from '@/lib/simulation/logger/streamLogger';
import { createSimulationSession } from '@/lib/simulation/logger/mongoStorage';

// Component imports
import CyberRiskCommandCenter from './CyberRiskCommandCenter';
import PipelineArchitecture from './PipelineArchitecture';
import SimulationWorkflowNav from './SimulationWorkflowNav';
import LiveTelemetryConsole from './LiveTelemetryConsole';
import WhyModal from './WhyModal';

// Stage components
import Stage1CompanyInput from './stages/Stage1CompanyInput';
import Stage2BusinessContext from './stages/Stage2BusinessContext';
import Stage3BusinessPriorities from './stages/Stage3BusinessPriorities';
import Stage4Vulnerabilities from './stages/Stage4Vulnerabilities';
import Stage5RiskEngine from './stages/Stage5RiskEngine';
import Stage6AIExplanation from './stages/Stage6AIExplanation';
import Stage7ControlCatalog from './stages/Stage7ControlCatalog';
import Stage8BudgetOptimizer from './stages/Stage8BudgetOptimizer';
import Stage9WhatIfStudio from './stages/Stage9WhatIfStudio';
import Stage10WhatIfComparison from './stages/Stage10WhatIfComparison';
import Stage11ExecutiveDecision from './stages/Stage11ExecutiveDecision';

export default function SimulationLayout() {
  const [state, setState] = useState<SimulationState>(() => createInitialSimulationState());
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);

  // Initialize session in MongoDB on mount
  useEffect(() => {
    createSimulationSession({
      sessionId: state.sessionId,
      companyName: state.company.name,
      industry: state.company.industry,
      currency: state.company.currency,
      budget: state.company.annualSecurityBudget,
    });

    logger.log(
      'company_input',
      'Session Initialization',
      'INFO',
      `Session ${state.sessionId} initialized for ${state.company.name} (${state.company.type}). Currency: ${state.company.currency}, Budget: ${state.company.annualSecurityBudget}`,
      { company: state.company }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark stage complete helper
  const markStageComplete = (stage: PipelineStage) => {
    setState((prev) => {
      const set = new Set(prev.completedStages);
      set.add(stage);
      return { ...prev, completedStages: Array.from(set) };
    });
  };

  const handleSelectStage = (stage: PipelineStage) => {
    setState((prev) => ({ ...prev, currentStage: stage }));
  };

  // Stage 1: Update Company Details
  const handleChangeCompany = (updated: Company) => {
    logger.log(
      'company_input',
      'Company Profile Update',
      'INFO',
      `Organization updated: ${updated.name}, type: ${updated.type}, budget: ${updated.annualSecurityBudget} ${updated.currency}`,
      { updated }
    );

    const businessPriorities = generateBusinessPriorities(updated);
    const businessContext = generateBusinessContext(updated);
    const vulnerabilities = getVulnerabilitiesForCompany(updated.type, updated.importantAssets, updated.keyServices);
    const riskResults = rankVulnerabilities(vulnerabilities, businessPriorities, updated.currency);
    const baselineRiskScore = Math.round(
      riskResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, riskResults.length)
    );
    const baselineEal = riskResults.reduce((acc, curr) => acc + curr.eal, 0);
    const optimization = runKnapsackOptimization(
      state.controls,
      updated.annualSecurityBudget,
      updated.currency,
      baselineRiskScore,
      baselineEal,
      vulnerabilities
    );

    setState((prev) => ({
      ...prev,
      company: updated,
      businessContext,
      businessPriorities,
      vulnerabilities,
      riskResults,
      optimization,
      activeWhatIf: null,
      unifiedAiAnalysisLoaded: false,
    }));
  };

  // Stage 4: Update Vulnerability Finding parameters interactively
  const handleUpdateVulnerability = (id: string, updates: Partial<any>) => {
    const updatedVulns = state.vulnerabilities.map((v) => {
      if (v.id === id) {
        return { ...v, ...updates };
      }
      return v;
    });

    const riskResults = rankVulnerabilities(updatedVulns, state.businessPriorities, state.company.currency);
    const baselineRiskScore = Math.round(
      riskResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, riskResults.length)
    );
    const baselineEal = riskResults.reduce((acc, curr) => acc + curr.eal, 0);
    const optimization = runKnapsackOptimization(
      state.controls,
      state.company.annualSecurityBudget,
      state.company.currency,
      baselineRiskScore,
      baselineEal,
      updatedVulns
    );

    logger.log(
      'vulnerabilities',
      'Vulnerability Parameter Recalibration',
      'CALC',
      `Modified vulnerability ${id}: ${JSON.stringify(updates)}. Recalculated baseline risk: ${baselineRiskScore}/100, EAL: ${baselineEal}`,
      { id, updates, baselineRiskScore, baselineEal }
    );

    setState((prev) => ({
      ...prev,
      vulnerabilities: updatedVulns,
      riskResults,
      optimization,
      activeWhatIf: null,
    }));
  };

  // Stage 1: Load preset
  const handleLoadPreset = (type: CompanyType) => {
    const preset = DEMO_COMPANIES[type] || DEMO_COMPANIES['Banking'];
    handleChangeCompany(preset);
  };

  // Stage 1 -> 2: Run Business Analysis
  const handleAnalyzeBusiness = async () => {
    setState((prev) => ({ ...prev, isAiProcessing: true, currentStage: 'business_context' }));
    markStageComplete('company_input');

    logger.log(
      'business_context',
      'AI Business Understanding',
      'AI_THINK',
      `Simulating LLM extraction of goals, critical assets, and compliance exposure for ${state.company.name}...`
    );

    // Simulated short delay for high-fidelity visual animation
    setTimeout(async () => {
      const businessContext = generateBusinessContext(state.company);
      markStageComplete('business_context');

      logger.log(
        'business_context',
        'AI Context Synthesized',
        'INFO',
        `Business context model ready. Identified ${businessContext.potentialBusinessRisks.length} core risks and ${businessContext.regulatoryExposure.length} compliance frameworks.`,
        { businessContext }
      );

      setState((prev) => ({
        ...prev,
        businessContext,
        isAiProcessing: false,
      }));
    }, 600);
  };

  // Stage 3: Priority Update
  const handleUpdatePriority = (id: string, newPriority: PriorityLevel) => {
    const updatedPriorities = state.businessPriorities.map((bp) => {
      if (bp.id === id) {
        let score = 0.55;
        if (newPriority === 'VERY HIGH') score = 1.0;
        else if (newPriority === 'HIGH') score = 0.85;
        else if (newPriority === 'MEDIUM') score = 0.55;
        else score = 0.3;

        return { ...bp, priority: newPriority, criticalityScore: score, isManualOverride: true };
      }
      return bp;
    });

    // Recalculate deterministic risk immediately
    const riskResults = rankVulnerabilities(state.vulnerabilities, updatedPriorities, state.company.currency);
    const baselineRiskScore = Math.round(
      riskResults.reduce((acc, curr) => acc + curr.riskScore, 0) / Math.max(1, riskResults.length)
    );
    const baselineEal = riskResults.reduce((acc, curr) => acc + curr.eal, 0);
    const optimization = runKnapsackOptimization(
      state.controls,
      state.company.annualSecurityBudget,
      state.company.currency,
      baselineRiskScore,
      baselineEal,
      state.vulnerabilities
    );

    logger.log(
      'priorities',
      'Priority Weight Recalibration',
      'CALC',
      `Priority updated for item ${id} to ${newPriority}. Recalculated deterministic risk baseline: ${baselineRiskScore}/100, EAL: ${baselineEal}`,
      { updatedPriorities, baselineRiskScore, baselineEal }
    );

    setState((prev) => ({
      ...prev,
      businessPriorities: updatedPriorities,
      riskResults,
      optimization,
    }));
  };

  // Full Automated Simulation Runner (animates step-by-step through pipeline)
  const handleRunFullSimulation = async () => {
    setState((prev) => ({ ...prev, isSimulating: true }));
    setIsTelemetryOpen(true);

    logger.log('company_input', 'Pipeline Execution', 'INFO', 'Starting end-to-end automated simulation pipeline...');

    const stages: PipelineStage[] = [
      'company_input',
      'business_context',
      'priorities',
      'vulnerabilities',
      'risk_calculation',
      'ai_ranking',
      'control_recommendations',
      'budget_optimization',
      'what_if_lab',
      'what_if_comparison',
      'executive_decision',
    ];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      setState((prev) => ({ ...prev, currentStage: stage }));
      markStageComplete(stage);

      if (stage === 'risk_calculation') {
        logger.log(
          'risk_calculation',
          'Deterministic Risk Engine',
          'CALC',
          `Calculating dimensional weights: normalized baseline risk score ${state.optimization?.baselineRiskScore || 72}/100, EAL ₹12.4L.`
        );
      } else if (stage === 'budget_optimization') {
        logger.log(
          'budget_optimization',
          'Knapsack Optimization',
          'OPTIMIZE',
          `0/1 Knapsack converged: selected ${state.optimization?.selectedControls.map((c) => c.code).join(', ')} within budget.`
        );
      } else if (stage === 'what_if_comparison') {
        // Run default what-if scenario (What if WAF is deployed)
        const defaultScenario = parseNaturalLanguageWhatIf('What if I deploy WAF?', state);
        const comp = evaluateWhatIfScenario(state, defaultScenario);
        setState((prev) => ({ ...prev, activeWhatIf: comp }));
      }

      await new Promise((r) => setTimeout(r, 450));
    }

    // Run unified single-batch LLM intelligence
    if (state.optimization) {
      logger.log(
        'ai_ranking',
        'Single-Batch LLM Intelligence',
        'AI_THINK',
        'Executing unified consolidated LLM call for ranking explanations, control rationale, and executive summary...'
      );
      const unified = await generateUnifiedAiIntelligence(
        state.company,
        state.businessPriorities,
        state.riskResults,
        state.optimization
      );

      // Apply explanations to riskResults
      const enrichedResults = state.riskResults.map((r) => ({
        ...r,
        aiExplanation: unified.rankingExplanations[r.vulnerability.id] || r.aiExplanation,
      }));

      setState((prev) => ({
        ...prev,
        riskResults: enrichedResults,
        unifiedAiAnalysisLoaded: true,
        aiCallsCount: prev.aiCallsCount + 1,
      }));
    }

    setState((prev) => ({ ...prev, isSimulating: false }));
    logger.log('executive_decision', 'Pipeline Complete', 'INFO', 'Full simulation pipeline successfully executed.');
  };

  // What-If Execution from Natural Language
  const handleRunWhatIfQuery = (query: string) => {
    const scenario = parseNaturalLanguageWhatIf(query, state);
    const comparison = evaluateWhatIfScenario(state, scenario);
    setState((prev) => ({
      ...prev,
      activeWhatIf: comparison,
      currentStage: 'what_if_comparison',
    }));
    markStageComplete('what_if_lab');
    markStageComplete('what_if_comparison');
  };

  // What-If Execution from Manual Controls
  const handleRunManualWhatIf = (applied: string[], removed: string[], targetBudget?: number) => {
    const scenario: WhatIfScenario = {
      id: `manual_${Date.now()}`,
      query: `Hypothetical controls: +[${applied.join(', ')}] -[${removed.join(', ')}]`,
      actionType: 'toggle_control',
      appliedControlIds: applied,
      removedControlIds: removed,
      targetBudget,
      resolvedVulnerabilityIds: [],
    };
    const comparison = evaluateWhatIfScenario(state, scenario);
    setState((prev) => ({
      ...prev,
      activeWhatIf: comparison,
      currentStage: 'what_if_comparison',
    }));
    markStageComplete('what_if_lab');
    markStageComplete('what_if_comparison');
  };

  // Why Modal click handler
  const handleOpenWhyModal = (subjectId: string) => {
    const details = getWhyModalDetails(subjectId, {
      riskResults: state.riskResults,
      controls: state.controls,
      optimization: state.optimization,
      currency: state.company.currency,
    });
    setState((prev) => ({ ...prev, activeWhyModal: details }));
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 p-4 md:p-6 lg:p-8 font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Executive KPI Command Center Header */}
      <CyberRiskCommandCenter
        company={state.company}
        optimization={state.optimization}
        baselineRiskScore={state.optimization?.baselineRiskScore || 72}
        baselineEal={state.optimization?.baselineEal || 1240000}
        isSimulating={state.isSimulating}
        onRunFullSimulation={handleRunFullSimulation}
        onLoadDemoCompany={() => handleLoadPreset('Banking')}
        onSelectCompanyType={handleLoadPreset}
        onOpenTelemetryConsole={() => setIsTelemetryOpen(true)}
        onWhyClick={handleOpenWhyModal}
        onViewAllocationImpact={() => handleSelectStage('budget_optimization')}
      />

      {/* Internal Architecture Pipeline Data Flow */}
      <div className="mb-6">
        <PipelineArchitecture
          currentStage={state.currentStage}
          completedStages={state.completedStages}
          onSelectStage={handleSelectStage}
        />
      </div>

      {/* Main Workspace: Left Workflow Nav + Center Stage Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation (3 cols) */}
        <div className="lg:col-span-3 sticky top-4">
          <SimulationWorkflowNav
            currentStage={state.currentStage}
            completedStages={state.completedStages}
            onSelectStage={handleSelectStage}
          />
        </div>

        {/* Center Canvas (9 cols) */}
        <div className="lg:col-span-9 space-y-6">
          {state.currentStage === 'company_input' && (
            <Stage1CompanyInput
              company={state.company}
              onChangeCompany={handleChangeCompany}
              onAnalyzeBusiness={handleAnalyzeBusiness}
              onLoadPreset={handleLoadPreset}
            />
          )}

          {state.currentStage === 'business_context' && (
            <Stage2BusinessContext
              businessContext={state.businessContext}
              isAiProcessing={state.isAiProcessing}
              onProceedToPriorities={() => {
                markStageComplete('business_context');
                handleSelectStage('priorities');
              }}
            />
          )}

          {state.currentStage === 'priorities' && (
            <Stage3BusinessPriorities
              priorities={state.businessPriorities}
              onUpdatePriority={handleUpdatePriority}
              onProceedToVulnerabilities={() => {
                markStageComplete('priorities');
                handleSelectStage('vulnerabilities');
              }}
            />
          )}

          {state.currentStage === 'vulnerabilities' && (
            <Stage4Vulnerabilities
              vulnerabilities={state.vulnerabilities}
              onUpdateVulnerability={handleUpdateVulnerability}
              onProceedToRiskCalculation={() => {
                markStageComplete('vulnerabilities');
                handleSelectStage('risk_calculation');
              }}
            />
          )}

          {state.currentStage === 'risk_calculation' && (
            <Stage5RiskEngine
              riskResults={state.riskResults}
              currency={state.company.currency}
              onProceedToAiExplanation={() => {
                markStageComplete('risk_calculation');
                handleSelectStage('ai_ranking');
              }}
              onWhyClick={handleOpenWhyModal}
            />
          )}

          {state.currentStage === 'ai_ranking' && (
            <Stage6AIExplanation
              riskResults={state.riskResults}
              currency={state.company.currency}
              onProceedToControls={() => {
                markStageComplete('ai_ranking');
                handleSelectStage('control_recommendations');
              }}
              onWhyClick={handleOpenWhyModal}
            />
          )}

          {state.currentStage === 'control_recommendations' && (
            <Stage7ControlCatalog
              controls={state.controls}
              currency={state.company.currency}
              onProceedToOptimization={() => {
                markStageComplete('control_recommendations');
                handleSelectStage('budget_optimization');
              }}
            />
          )}

          {state.currentStage === 'budget_optimization' && (
            <Stage8BudgetOptimizer
              optimization={state.optimization}
              riskResults={state.riskResults}
              currency={state.company.currency}
              onProceedToWhatIf={() => {
                markStageComplete('budget_optimization');
                handleSelectStage('what_if_lab');
              }}
              onWhyClick={handleOpenWhyModal}
            />
          )}

          {state.currentStage === 'what_if_lab' && (
            <Stage9WhatIfStudio
              currentBudget={state.company.annualSecurityBudget}
              currency={state.company.currency}
              controls={state.controls}
              selectedControlIds={state.optimization ? state.optimization.selectedControls.map((c) => c.code) : []}
              onRunWhatIfQuery={handleRunWhatIfQuery}
              onRunManualWhatIf={handleRunManualWhatIf}
            />
          )}

          {state.currentStage === 'what_if_comparison' && (
            <Stage10WhatIfComparison
              comparison={state.activeWhatIf}
              currency={state.company.currency}
              onProceedToDecision={() => {
                markStageComplete('what_if_comparison');
                handleSelectStage('executive_decision');
              }}
              onResetWhatIf={() => {
                setState((prev) => ({ ...prev, activeWhatIf: null, currentStage: 'what_if_lab' }));
              }}
            />
          )}

          {state.currentStage === 'executive_decision' && (
            <Stage11ExecutiveDecision
              company={state.company}
              optimization={state.optimization}
              currency={state.company.currency}
              onWhyClick={handleOpenWhyModal}
              onRestartSimulation={() => {
                const fresh = createInitialSimulationState();
                setState(fresh);
              }}
            />
          )}
        </div>
      </div>

      {/* Universal Explainability Why Slide-Over / Modal */}
      <WhyModal
        explanation={state.activeWhyModal}
        onClose={() => setState((prev) => ({ ...prev, activeWhyModal: null }))}
      />

      {/* Continuous Live Log Streamer & MongoDB Session Retrieval Console */}
      <LiveTelemetryConsole
        sessionId={state.sessionId}
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
      />
    </div>
  );
}
