'use client';

import React from 'react';
import { VulnerabilityRiskResult, Currency } from '@/lib/simulation/types';
import { Calculator, ArrowRight, HelpCircle, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import RiskHeatmap from '../RiskHeatmap';

interface Stage5RiskEngineProps {
  riskResults: VulnerabilityRiskResult[];
  currency: Currency;
  onProceedToAiExplanation: () => void;
  onWhyClick: (vulnId: string) => void;
}

export default function Stage5RiskEngine({
  riskResults,
  currency,
  onProceedToAiExplanation,
  onWhyClick,
}: Stage5RiskEngineProps) {
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

  const getScoreColor = (score: number) => {
    if (score >= 81) return 'text-rose-400 bg-rose-950/40 border-rose-500/50';
    if (score >= 61) return 'text-orange-400 bg-orange-950/40 border-orange-500/50';
    if (score >= 41) return 'text-amber-400 bg-amber-950/40 border-amber-500/50';
    return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/50';
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                Step 5 of 11 — Deterministic Risk Engine
              </span>
              <h3 className="text-xl font-bold text-white">
                Mathematical Risk Quantification & Expected Annual Loss (EAL)
              </h3>
            </div>
          </div>

          <span className="text-xs font-mono px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
            Strict Zero-Hallucination Determinism
          </span>
        </div>

        {/* Mathematical Formula Architecture Callout */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 mb-6">
          <div className="text-xs font-mono text-cyan-400 uppercase font-semibold mb-1">
            Quantification Formulation
          </div>
          <div className="text-xs font-mono text-slate-300 leading-relaxed bg-[#0a0f1d] p-3 rounded-lg border border-slate-800">
            <code>
              riskScore = normalize_0_100( severityWeight × exploitabilityWeight × businessImpactWeight × assetCriticalityWeight × complianceWeight )<br />
              eal = probabilityOfLoss × estimatedFinancialImpact
            </code>
          </div>
        </div>

        {/* Deterministic Rankings Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] bg-slate-900/60">
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Vulnerability Title</th>
                <th className="py-3 px-4">Target Asset</th>
                <th className="py-3 px-4">Deterministic Risk Score</th>
                <th className="py-3 px-4">Risk Level</th>
                <th className="py-3 px-4">Loss Probability</th>
                <th className="py-3 px-4">EAL</th>
                <th className="py-3 px-4 text-right">Explainability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {riskResults.map((r) => (
                <tr key={r.vulnerability.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-white">
                    <span className="w-6 h-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                      #{r.rank}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-semibold text-white block">{r.vulnerability.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">{r.vulnerability.cwe}</span>
                  </td>

                  <td className="py-3 px-4 text-slate-300">
                    {r.vulnerability.asset}
                  </td>

                  <td className="py-3 px-4 font-mono">
                    <span className={`px-2.5 py-1 rounded-lg font-bold border text-xs ${getScoreColor(r.riskScore)}`}>
                      {r.riskScore} / 100
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-300">
                    {r.riskLevel}
                  </td>

                  <td className="py-3 px-4 font-mono text-cyan-300">
                    {(r.probabilityOfLoss * 100).toFixed(0)}%
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-amber-300">
                    {formatCurrency(r.eal)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onWhyClick(r.vulnerability.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-900 hover:bg-slate-850 text-cyan-400 border border-slate-800 hover:border-cyan-500/50 transition font-medium"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      Why #{r.rank}?
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            Deterministic scores calculated without LLM tampering. Next: AI explains the rankings.
          </span>
          <button
            onClick={onProceedToAiExplanation}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition"
          >
            <span>Proceed to AI Explainable Ranking</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Embedded Multidimensional Risk Heatmap */}
      <RiskHeatmap
        results={riskResults}
        currency={currency}
        onWhyClick={onWhyClick}
      />
    </div>
  );
}
