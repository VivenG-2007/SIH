'use client';

import React from 'react';
import { OptimizationResult, Currency, VulnerabilityRiskResult } from '@/lib/simulation/types';
import { CheckCircle2, ArrowRight, TrendingDown, DollarSign, HelpCircle, Layers, Check, X } from 'lucide-react';
import OptimizedAllocationImpactMatrix from '../OptimizedAllocationImpactMatrix';

interface Stage8BudgetOptimizerProps {
  optimization: OptimizationResult | null;
  riskResults: VulnerabilityRiskResult[];
  currency: Currency;
  onProceedToWhatIf: () => void;
  onWhyClick: (subjectId: string) => void;
}

export default function Stage8BudgetOptimizer({
  optimization,
  riskResults,
  currency,
  onProceedToWhatIf,
  onWhyClick,
}: Stage8BudgetOptimizerProps) {
  if (!optimization) return null;

  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  const formatCurrency = (val: number) => {
    if (isINR) {
      if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
      if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
      return `₹${val.toLocaleString()}`;
    }
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
    return `$${val.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Primary Optimized Allocation & Impact Matrix */}
      <OptimizedAllocationImpactMatrix
        optimization={optimization}
        riskResults={riskResults}
        currency={currency}
        onWhyClick={onWhyClick}
      />

      {/* Excluded Controls & Algorithmic Rationale */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase font-mono flex items-center gap-1.5">
              <X className="w-4 h-4 text-rose-400" />
              Excluded Security Candidates ({optimization.rejectedControls.length})
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Controls not chosen by 0/1 Knapsack solver because cost exceeds remaining budget or provides lower marginal risk drop per currency unit
            </span>
          </div>
          <button
            onClick={() => onWhyClick('KNAPSACK_INVESTMENT')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-cyan-400 border border-slate-800 text-xs font-semibold transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Why This Portfolio?
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {optimization.rejectedControls.map((ctrl) => {
            const cost = isINR ? ctrl.costINR : ctrl.costUSD;
            return (
              <div
                key={ctrl.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs opacity-80 hover:opacity-100 transition"
              >
                <div>
                  <span className="font-semibold text-slate-300 block">{ctrl.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Mitigates: {ctrl.coverage.slice(0, 2).join(', ')} • Potential drop: +{ctrl.riskReduction}%
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-slate-400 block">{formatCurrency(cost)}</span>
                  <button
                    onClick={() => onWhyClick(ctrl.id)}
                    className="text-[10px] text-cyan-400 hover:underline font-mono"
                  >
                    Why Excluded?
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rejected Controls */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono flex items-center gap-1.5">
              <X className="w-4 h-4" />
              Excluded / Budget Exceeded ({optimization.rejectedControls.length})
            </span>
          </div>
          <div className="space-y-2">
            {optimization.rejectedControls.map((ctrl) => {
              const cost = isINR ? ctrl.costINR : ctrl.costUSD;
              return (
                <div
                  key={ctrl.id}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs opacity-75"
                >
                  <div>
                    <span className="font-medium text-slate-300 block">{ctrl.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Reason: Lower marginal ROI or budget limit
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-slate-400 block">{formatCurrency(cost)}</span>
                    <button
                      onClick={() => onWhyClick(ctrl.id)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Why Excluded?
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Knapsack solution converged in {optimization.iterationsCount} branch evaluations. Ready for What-If scenario testing.
        </span>
        <button
          onClick={onProceedToWhatIf}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Ask What-If Questions</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
