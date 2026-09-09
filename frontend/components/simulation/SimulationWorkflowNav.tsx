'use client';

import React from 'react';
import {
  Building2,
  Brain,
  Sliders,
  ShieldAlert,
  Calculator,
  ListOrdered,
  Layers,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Award,
  Check,
} from 'lucide-react';
import { PipelineStage } from '@/lib/simulation/types';

interface StageItem {
  id: PipelineStage;
  label: string;
  stepNumber: number;
  icon: any;
  category: 'Business' | 'Risk Engine' | 'Knapsack & What-If' | 'Executive';
}

const STAGES: StageItem[] = [
  { id: 'company_input', label: 'Company Profile', stepNumber: 1, icon: Building2, category: 'Business' },
  { id: 'business_context', label: 'AI Business Context', stepNumber: 2, icon: Brain, category: 'Business' },
  { id: 'priorities', label: 'Business Priorities', stepNumber: 3, icon: Sliders, category: 'Business' },
  { id: 'vulnerabilities', label: 'Vulnerabilities Feed', stepNumber: 4, icon: ShieldAlert, category: 'Risk Engine' },
  { id: 'risk_calculation', label: 'Deterministic Risk', stepNumber: 5, icon: Calculator, category: 'Risk Engine' },
  { id: 'ai_ranking', label: 'AI Explainable Ranking', stepNumber: 6, icon: ListOrdered, category: 'Risk Engine' },
  { id: 'control_recommendations', label: 'Control Recommendations', stepNumber: 7, icon: Layers, category: 'Knapsack & What-If' },
  { id: 'budget_optimization', label: 'Budget Optimization', stepNumber: 8, icon: CheckCircle2, category: 'Knapsack & What-If' },
  { id: 'what_if_lab', label: 'What-If Simulation Lab', stepNumber: 9, icon: HelpCircle, category: 'Knapsack & What-If' },
  { id: 'what_if_comparison', label: 'What-If Comparison', stepNumber: 10, icon: TrendingDown, category: 'Knapsack & What-If' },
  { id: 'executive_decision', label: 'Executive Decision', stepNumber: 11, icon: Award, category: 'Executive' },
];

interface SimulationWorkflowNavProps {
  currentStage: PipelineStage;
  completedStages: PipelineStage[];
  onSelectStage: (stage: PipelineStage) => void;
}

export default function SimulationWorkflowNav({
  currentStage,
  completedStages,
  onSelectStage,
}: SimulationWorkflowNavProps) {
  return (
    <div className="w-full bg-[#0d1424] border border-slate-800/90 rounded-2xl p-4 shadow-xl flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 px-1">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
          Workflow Pipeline
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
          11 Stages
        </span>
      </div>

      <div className="flex flex-col space-y-1">
        {STAGES.map((s) => {
          const isCurrent = s.id === currentStage;
          const isCompleted = completedStages.includes(s.id);
          const Icon = s.icon;

          return (
            <button
              key={s.id}
              onClick={() => onSelectStage(s.id)}
              className={`group flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left transition duration-150 border ${
                isCurrent
                  ? 'bg-cyan-950/60 border-cyan-500/80 text-white shadow-md shadow-cyan-900/20 ring-1 ring-cyan-500/50'
                  : isCompleted
                  ? 'bg-slate-900/50 border-emerald-900/40 text-slate-200 hover:bg-slate-850'
                  : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono shrink-0 transition ${
                    isCurrent
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : (
                    s.stepNumber
                  )}
                </div>

                <div className="truncate">
                  <span className="text-xs font-medium block truncate">
                    {s.label}
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {s.category}
                  </span>
                </div>
              </div>

              {isCurrent && (
                <span className="w-1.5 h-4 rounded-full bg-cyan-400 shrink-0 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
