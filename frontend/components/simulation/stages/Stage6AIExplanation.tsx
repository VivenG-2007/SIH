'use client';

import React from 'react';
import { VulnerabilityRiskResult, Currency } from '@/lib/simulation/types';
import { ListOrdered, Brain, ArrowRight, HelpCircle, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';

interface Stage6AIExplanationProps {
  riskResults: VulnerabilityRiskResult[];
  currency: Currency;
  onProceedToControls: () => void;
  onWhyClick: (vulnId: string) => void;
}

export default function Stage6AIExplanation({
  riskResults,
  currency,
  onProceedToControls,
  onWhyClick,
}: Stage6AIExplanationProps) {
  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 font-bold">
              Step 6 of 11 — Explainable AI Layer
            </span>
            <h3 className="text-xl font-bold text-white">
              AI Vulnerability Ranking Justification & Lineage
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1 rounded-xl border border-slate-800">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Explaining Deterministic Results — No Numerical Fabrication</span>
        </div>
      </div>

      {/* Ranked Explanations Cards */}
      <div className="space-y-4">
        {riskResults.map((item) => (
          <div
            key={item.vulnerability.id}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-start gap-4"
          >
            {/* Left Rank & Score Pill */}
            <div className="flex md:flex-col items-center justify-between md:justify-center gap-2 shrink-0 md:w-32 bg-[#090d18] p-3 rounded-xl border border-slate-800/80">
              <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                Rank #{item.rank}
              </span>
              <div className="text-xl font-mono font-black text-rose-400">
                {item.riskScore}
                <span className="text-[10px] text-slate-500 font-normal block">/ 100 Score</span>
              </div>
              <span className="text-[10px] font-mono text-amber-300">
                EAL: {isINR ? `₹${(item.eal / 100000).toFixed(1)}L` : `$${(item.eal / 1000).toFixed(0)}k`}
              </span>
            </div>

            {/* Middle Content */}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-white">
                  {item.vulnerability.title}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {item.vulnerability.cwe}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-medium">
                  Asset: {item.vulnerability.asset}
                </span>
              </div>

              {/* AI Strategic Explanation */}
              <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-900/40 text-xs text-purple-100 leading-relaxed">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-purple-400 uppercase mb-1">
                  <Brain className="w-3 h-3 text-purple-400" />
                  <span>AI Ranking Rationale</span>
                </div>
                <p>
                  {item.aiExplanation ||
                    `${item.vulnerability.title} is positioned at rank #${item.rank} because it directly targets ${item.vulnerability.asset}. With ${item.vulnerability.exploitability} exploitability and ${item.vulnerability.businessImpact} business impact, deterministic calculation produces an annual loss expectancy of ${isINR ? '₹' + (item.eal / 100000).toFixed(1) + ' Lakhs' : '$' + item.eal.toLocaleString()}.`}
                </p>
              </div>
            </div>

            {/* Right Action */}
            <div className="shrink-0 flex items-center md:flex-col justify-end gap-2">
              <button
                onClick={() => onWhyClick(item.vulnerability.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-cyan-400 border border-slate-700 text-xs font-semibold transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Inspect Formula
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Stage 6 verified. Proceeding to security control candidate catalog.
        </span>
        <button
          onClick={onProceedToControls}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Map Security Controls</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
