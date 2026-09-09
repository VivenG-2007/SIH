'use client';

import React from 'react';
import {
  Building2,
  Brain,
  Sliders,
  ShieldAlert,
  Calculator,
  ListOrdered,
  Sparkles,
  Layers,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  TrendingDown,
  Award,
} from 'lucide-react';
import { PipelineStage } from '@/lib/simulation/types';

interface PipelineArchitectureProps {
  currentStage: PipelineStage;
  completedStages: PipelineStage[];
  onSelectStage?: (stage: PipelineStage) => void;
}

interface StepDef {
  stage: PipelineStage;
  label: string;
  type: 'AI' | 'DETERMINISTIC' | 'INPUT';
  icon: any;
}

const PIPELINE_STEPS: StepDef[] = [
  { stage: 'company_input', label: 'Company Profile', type: 'INPUT', icon: Building2 },
  { stage: 'business_context', label: 'Business AI Understanding', type: 'AI', icon: Brain },
  { stage: 'priorities', label: 'Priority Engine', type: 'DETERMINISTIC', icon: Sliders },
  { stage: 'vulnerabilities', label: 'Vuln Telemetry', type: 'INPUT', icon: ShieldAlert },
  { stage: 'risk_calculation', label: 'Deterministic Risk Math', type: 'DETERMINISTIC', icon: Calculator },
  { stage: 'ai_ranking', label: 'AI Explainable Ranking', type: 'AI', icon: ListOrdered },
  { stage: 'control_recommendations', label: 'Control Catalog', type: 'DETERMINISTIC', icon: Layers },
  { stage: 'budget_optimization', label: '0/1 Knapsack Optimizer', type: 'DETERMINISTIC', icon: CheckCircle },
  { stage: 'what_if_lab', label: 'What-If Simulator', type: 'DETERMINISTIC', icon: HelpCircle },
  { stage: 'what_if_comparison', label: 'Delta Recalculation', type: 'DETERMINISTIC', icon: TrendingDown },
  { stage: 'executive_decision', label: 'Executive Decision', type: 'AI', icon: Award },
];

export default function PipelineArchitecture({
  currentStage,
  completedStages,
  onSelectStage,
}: PipelineArchitectureProps) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.stage === currentStage);

  return (
    <div className="w-full bg-[#0c1222] border border-slate-800/90 rounded-2xl p-4 shadow-xl overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
            Platform Pipeline Data Flow Architecture
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            End-to-End Decision Lineage
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> LLM Reasoning
          </span>
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Deterministic Engine
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> Input Data
          </span>
        </div>
      </div>

      <div className="flex items-center min-w-max gap-1 py-2">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCurrent = step.stage === currentStage;
          const isCompleted = completedStages.includes(step.stage);
          const isPassed = idx < currentIndex;
          const Icon = step.icon;

          const typeStyles =
            step.type === 'AI'
              ? 'border-purple-500/40 text-purple-300 bg-purple-950/20'
              : step.type === 'DETERMINISTIC'
              ? 'border-cyan-500/40 text-cyan-300 bg-cyan-950/20'
              : 'border-slate-600/40 text-slate-300 bg-slate-900/40';

          const activeBorder = isCurrent
            ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20 scale-105 bg-[#172554]'
            : isCompleted
            ? 'border-emerald-500/40'
            : 'opacity-70 hover:opacity-100';

          return (
            <React.Fragment key={step.stage}>
              <button
                onClick={() => onSelectStage && onSelectStage(step.stage)}
                className={`group relative flex flex-col items-center p-2.5 rounded-xl border transition-all duration-200 cursor-pointer text-left w-32 shrink-0 ${typeStyles} ${activeBorder}`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-slate-400">
                    #{idx + 1}
                  </span>
                  <span
                    className={`text-[8px] font-mono uppercase font-bold px-1 rounded ${
                      step.type === 'AI'
                        ? 'bg-purple-900/80 text-purple-200'
                        : step.type === 'DETERMINISTIC'
                        ? 'bg-cyan-900/80 text-cyan-200'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {step.type}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 w-full">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isCurrent
                        ? 'text-cyan-300 animate-pulse'
                        : isCompleted
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                    {step.label}
                  </span>
                </div>

                {isCurrent && (
                  <span className="absolute -bottom-1 w-8 h-1 rounded-full bg-cyan-400" />
                )}
              </button>

              {idx < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center justify-center px-1">
                  <ArrowRight
                    className={`w-3.5 h-3.5 transition ${
                      isPassed || isCurrent ? 'text-cyan-400 animate-pulse' : 'text-slate-600'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
