'use client';

import React from 'react';
import { OptimizationResult, Company, Currency } from '@/lib/simulation/types';
import { Award, CheckCircle2, DollarSign, TrendingDown, ShieldCheck, Sparkles, Check, FileText } from 'lucide-react';

interface Stage11ExecutiveDecisionProps {
  company: Company;
  optimization: OptimizationResult | null;
  currency: Currency;
  onWhyClick: (subjectId: string) => void;
  onRestartSimulation: () => void;
}

export default function Stage11ExecutiveDecision({
  company,
  optimization,
  currency,
  onWhyClick,
  onRestartSimulation,
}: Stage11ExecutiveDecisionProps) {
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

  const invStr = formatCurrency(optimization.totalInvestment);
  const remStr = formatCurrency(optimization.remainingBudget);
  const ealRedStr = formatCurrency(optimization.ealReduction);

  return (
    <div className="bg-[#0f172a] border border-cyan-500/40 rounded-2xl p-8 shadow-2xl text-slate-100 space-y-8 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-500 text-white shadow-lg shadow-cyan-500/30">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold">
              Final Executive Decision & Strategic Briefing
            </span>
            <h2 className="text-2xl font-black text-white">
              Security Investment Recommendation
            </h2>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          Board-Ready Portfolio Plan
        </span>
      </div>

      {/* Recommended Controls List & Decision Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        {/* Left: Recommended Controls Card */}
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono block">
            Recommended Security Controls Portfolio
          </span>

          <div className="space-y-2.5">
            {optimization.selectedControls.map((ctrl, idx) => {
              const cost = isINR ? ctrl.costINR : ctrl.costUSD;
              return (
                <div
                  key={ctrl.id}
                  className="p-3 rounded-xl bg-slate-950 border border-cyan-900/40 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-white block">{ctrl.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Coverage: {ctrl.coverage.slice(0, 2).join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-cyan-300 block">
                      {formatCurrency(cost)}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      +{ctrl.riskReduction}% Risk Drop
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Total Capital Investment:</span>
            <span className="text-base font-bold text-cyan-300">{invStr}</span>
          </div>
        </div>

        {/* Right: Decision Statement & Metrics */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-purple-950/40 border border-cyan-500/40 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-mono font-bold text-cyan-400 uppercase">
              <Sparkles className="w-4 h-4" />
              <span>Recommended Strategic Decision</span>
            </div>

            <p className="text-sm font-semibold text-white leading-relaxed bg-[#0a0f1d] p-4 rounded-xl border border-cyan-900/50">
              &quot;Invest {invStr} to reduce {company.name}&apos;s highest business-critical cyber risks from {optimization.baselineRiskScore} to {optimization.projectedRiskScore} while preserving {remStr} for additional security requirements and operational reserves.&quot;
            </p>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2 font-mono">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Projected Risk</span>
              <span className="text-lg font-bold text-emerald-400">
                {optimization.projectedRiskScore} / 100
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Risk Reduction</span>
              <span className="text-lg font-bold text-purple-300">
                {optimization.totalRiskReductionPct}%
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">EAL Savings</span>
              <span className="text-lg font-bold text-amber-300">
                {ealRedStr}
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Remaining Reserve</span>
              <span className="text-lg font-bold text-slate-200">
                {remStr}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Capabilities Checklist */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 relative z-10">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block mb-3">
          Platform Decision Rigor Verified
        </span>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {[
            'Business-aware vulnerability ranking',
            'Deterministic cyber risk quantification',
            'Expected Annual Loss calculation',
            'Security control recommendations',
            'Optimal security investment within budget',
            'What-if scenario analysis',
            'Before / after risk comparison',
            'Explainable AI without math tampering',
            'Board-ready executive briefing',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-300">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[2.5]" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Final Grand Quote Message */}
      <div className="text-center py-6 border-t border-slate-800/80 relative z-10 space-y-3">
        <h3 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-400 to-purple-400 tracking-tight">
          &quot;Smarter decisions. Lower risk. Better security investment.&quot;
        </h3>
        <p className="text-xs font-mono text-slate-400">
          Patchline X Cyber Risk Quantification & Portfolio Capital Allocation Platform
        </p>

        <div className="pt-2 flex justify-center">
          <button
            onClick={onRestartSimulation}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
          >
            Start New Simulation Session
          </button>
        </div>
      </div>
    </div>
  );
}
