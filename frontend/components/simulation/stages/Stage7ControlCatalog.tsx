'use client';

import React from 'react';
import { SecurityControl, Currency } from '@/lib/simulation/types';
import { Layers, ArrowRight, Shield, CheckCircle2, Clock, Link as LinkIcon, DollarSign } from 'lucide-react';

interface Stage7ControlCatalogProps {
  controls: SecurityControl[];
  currency: Currency;
  onProceedToOptimization: () => void;
}

export default function Stage7ControlCatalog({
  controls,
  currency,
  onProceedToOptimization,
}: Stage7ControlCatalogProps) {
  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  const formatCost = (ctrl: SecurityControl) => {
    if (isINR) {
      return `₹${(ctrl.costINR / 100000).toFixed(1)} Lakhs`;
    }
    return `$${ctrl.costUSD.toLocaleString()}`;
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
              Step 7 of 11 — Security Control Recommendation Engine
            </span>
            <h3 className="text-xl font-bold text-white">
              Defensive Control Catalog & Vulnerability Coverage Matrix
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
          {controls.length} Security Controls Candidate Pool
        </span>
      </div>

      {/* Control Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {controls.map((ctrl) => (
          <div
            key={ctrl.id}
            className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {ctrl.code}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {ctrl.riskReduction}% Risk Drop
                </span>
              </div>

              <h4 className="text-sm font-bold text-white mb-1">
                {ctrl.name}
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                {ctrl.description}
              </p>

              {/* Coverage list */}
              <div className="mb-3">
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                  Mitigates:
                </span>
                <div className="flex flex-wrap gap-1">
                  {ctrl.coverage.map((cov, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-950 text-slate-300 border border-slate-800"
                    >
                      {cov}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Metadata */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-cyan-300 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-cyan-400" />
                {formatCost(ctrl)}
              </span>
              <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3" />
                {ctrl.implementationTime}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Ready for budget optimization. Feeding controls into 0/1 Knapsack optimizer.
        </span>
        <button
          onClick={onProceedToOptimization}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Run 0/1 Knapsack Optimizer</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
