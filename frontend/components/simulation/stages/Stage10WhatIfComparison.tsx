'use client';

import React from 'react';
import { WhatIfComparison, Currency } from '@/lib/simulation/types';
import {
  TrendingDown,
  ArrowRight,
  Brain,
  CheckCircle2,
  DollarSign,
  Shield,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';

interface Stage10WhatIfComparisonProps {
  comparison: WhatIfComparison | null;
  currency: Currency;
  onProceedToDecision: () => void;
  onResetWhatIf: () => void;
}

export default function Stage10WhatIfComparison({
  comparison,
  currency,
  onProceedToDecision,
  onResetWhatIf,
}: Stage10WhatIfComparisonProps) {
  if (!comparison) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <p>No What-If scenario active. Ask a question or trigger a scenario in Step 9.</p>
      </div>
    );
  }

  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (isINR) {
      if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
      if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
      return `${sign}₹${abs.toLocaleString()}`;
    }
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}k`;
    return `${sign}$${abs.toLocaleString()}`;
  };

  const { baseline, hypothetical, deltas, aiExplanation, scenario } = comparison;

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
              Step 10 of 11 — What-If Recalculation Engine
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
              Query: &quot;{scenario.query}&quot;
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Side-by-Side Baseline vs. Hypothetical Risk Delta
          </h3>
        </div>

        <button
          onClick={onResetWhatIf}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs font-semibold transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Baseline
        </button>
      </div>

      {/* 3-Column Comparison: Baseline | Hypothetical | Impact Deltas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Baseline Column */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Current Baseline
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Committed State
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Risk Score</span>
              <div className="text-2xl font-black text-white">{baseline.riskScore} <span className="text-xs font-normal text-slate-500">/ 100</span></div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Expected Annual Loss (EAL)</span>
              <div className="text-xl font-bold text-amber-300">{formatCurrency(baseline.eal)}</div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Budget Utilized</span>
              <div className="text-base font-bold text-slate-300">{formatCurrency(baseline.budgetUsed)}</div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Deployed Controls</span>
              <div className="text-xs text-slate-300 font-sans mt-1">
                {baseline.selectedControls.length > 0
                  ? baseline.selectedControls.map((c) => c.code).join(', ')
                  : 'None (Unmitigated)'}
              </div>
            </div>
          </div>
        </div>

        {/* Hypothetical Column */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/40 shadow-lg shadow-cyan-950/20 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Hypothetical &quot;What-If&quot;
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 animate-pulse">
              Simulated Clone
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Simulated Risk Score</span>
              <div className="text-2xl font-black text-cyan-300 flex items-center gap-2">
                {hypothetical.riskScore}
                <span className="text-xs font-normal text-slate-400">/ 100</span>
                {deltas.riskDelta < 0 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-0.5">
                    <ArrowDownRight className="w-3 h-3" /> {Math.abs(deltas.riskDelta)} pts
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Simulated EAL</span>
              <div className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                {formatCurrency(hypothetical.eal)}
                {deltas.ealDelta < 0 && (
                  <span className="text-xs font-normal text-emerald-400">
                    (↓ {formatCurrency(Math.abs(deltas.ealDelta))})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Hypothetical Budget Used</span>
              <div className="text-base font-bold text-cyan-300">{formatCurrency(hypothetical.budgetUsed)}</div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Simulated Controls</span>
              <div className="text-xs text-cyan-200 font-sans mt-1">
                {hypothetical.selectedControls.map((c) => c.code).join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* Impact Deltas Column */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-purple-950/40 to-slate-900 border border-purple-500/40 space-y-4">
          <div className="flex items-center justify-between border-b border-purple-900/50 pb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300">
              Net Impact & Deltas
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900 text-purple-200">
              Differential
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">Risk Reduction %</span>
              <div className="text-2xl font-black text-purple-300">
                {deltas.riskReductionPct}%
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase block">EAL Financial Savings</span>
              <div className="text-xl font-bold text-emerald-400">
                {formatCurrency(Math.abs(deltas.ealDelta))}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase block">Remaining Reserve</span>
              <div className="text-base font-bold text-slate-200">
                {formatCurrency(hypothetical.remainingBudget)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Narrative Explanation (Step 11) */}
      <div className="p-5 rounded-xl bg-purple-950/20 border border-purple-900/50 space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-400 uppercase">
          <Brain className="w-4 h-4" />
          <span>Step 11 — AI What-If Explanation & Trade-Off Analysis</span>
        </div>
        <p className="text-xs text-purple-100 leading-relaxed font-sans bg-[#0c101c] p-4 rounded-lg border border-purple-900/40">
          {aiExplanation}
        </p>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          What-if simulation complete. Ready to formulate final executive investment decision.
        </span>
        <button
          onClick={onProceedToDecision}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>View Final Executive Decision</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
