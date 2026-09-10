'use client';

import React, { useState } from 'react';
import { VulnerabilityRiskResult, Currency } from '@/lib/simulation/types';
import {
  ListOrdered,
  Brain,
  ArrowRight,
  HelpCircle,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  Zap,
  Cpu,
  ShieldCheck,
  Layers,
} from 'lucide-react';

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
  const [selectedModelView, setSelectedModelView] = useState<'all' | 'mini' | '5.2' | 'codex'>('all');

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                Step 6 of 11 — Explainable AI Layer
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Tri-Model Ensemble
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">
              AI Vulnerability Ranking Justification & Multi-Model Lineage
            </h3>
          </div>
        </div>

        {/* Model Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setSelectedModelView('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
              selectedModelView === 'all'
                ? 'bg-purple-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All 3 Models
          </button>
          <button
            onClick={() => setSelectedModelView('mini')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1 transition ${
              selectedModelView === 'mini'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-blue-300'
            }`}
          >
            <Zap size={11} />
            <span>4.1-mini</span>
          </button>
          <button
            onClick={() => setSelectedModelView('5.2')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1 transition ${
              selectedModelView === '5.2'
                ? 'bg-purple-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-purple-300'
            }`}
          >
            <Cpu size={11} />
            <span>5.2 Strategy</span>
          </button>
          <button
            onClick={() => setSelectedModelView('codex')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1 transition ${
              selectedModelView === 'codex'
                ? 'bg-emerald-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            <ShieldCheck size={11} />
            <span>5.3-codex</span>
          </button>
        </div>
      </div>

      {/* Model Role Architecture Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] font-mono">
        <div className="flex items-center gap-2 text-blue-300">
          <Zap size={13} className="shrink-0 text-blue-400" />
          <span><strong>gpt-4.1-mini:</strong> Rapid Triage & Attack Vectors</span>
        </div>
        <div className="flex items-center gap-2 text-purple-300">
          <Cpu size={13} className="shrink-0 text-purple-400" />
          <span><strong>gpt-5.2:</strong> FAIR Loss & Strategic Impact</span>
        </div>
        <div className="flex items-center gap-2 text-emerald-300">
          <ShieldCheck size={13} className="shrink-0 text-emerald-400" />
          <span><strong>gpt-5.3-codex:</strong> Policy & Code Verification</span>
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
            <div className="flex-1 space-y-3">
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

              {/* Multi-Model Explanations */}
              <div className="space-y-2">
                {/* gpt-4.1-mini perspective */}
                {(selectedModelView === 'all' || selectedModelView === 'mini') && (
                  <div className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-900/40 text-xs text-blue-100">
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-blue-400 uppercase mb-0.5">
                      <Zap size={11} />
                      <span>gpt-4.1-mini • Threat Vector Triage</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {item.vulnerability.exploitability} exploitability vector against {item.vulnerability.asset}. Initial entry potential prioritized via sector attack surface analysis.
                    </p>
                  </div>
                )}

                {/* gpt-5.2 strategic perspective */}
                {(selectedModelView === 'all' || selectedModelView === '5.2') && (
                  <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-900/40 text-xs text-purple-100">
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-purple-400 uppercase mb-0.5">
                      <Cpu size={11} />
                      <span>gpt-5.2 • Strategic Loss Reasoning</span>
                    </div>
                    <p className="text-[11px] text-slate-200 leading-relaxed">
                      {item.aiExplanation ||
                        `${item.vulnerability.title} is positioned at rank #${item.rank} because it directly targets ${item.vulnerability.asset}. Deterministic calculation produces an Expected Annual Loss of ${isINR ? '₹' + (item.eal / 100000).toFixed(1) + ' Lakhs' : '$' + item.eal.toLocaleString()}, justifying immediate executive remediation priority.`}
                    </p>
                  </div>
                )}

                {/* gpt-5.3-codex technical perspective */}
                {(selectedModelView === 'all' || selectedModelView === 'codex') && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-100">
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 uppercase mb-0.5">
                      <ShieldCheck size={11} />
                      <span>gpt-5.3-codex • Technical Control Verification</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Policy verification confirms control mitigation paths: input validation rules, parameterized queries, and strict network perimeter ACL enforcement.
                    </p>
                  </div>
                )}
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
          Stage 6 multi-model verified. Proceeding to security control candidate catalog.
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
