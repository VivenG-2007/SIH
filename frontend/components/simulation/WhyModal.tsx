'use client';

import React from 'react';
import { X, HelpCircle, Calculator, Brain, CheckCircle2, ChevronRight, ShieldAlert } from 'lucide-react';
import { WhyExplanation } from '@/lib/simulation/types';

interface WhyModalProps {
  explanation: WhyExplanation | null;
  onClose: () => void;
}

export default function WhyModal({ explanation, onClose }: WhyModalProps) {
  if (!explanation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-mono tracking-wider text-cyan-400 uppercase font-semibold">
                Quantification Explainability Engine
              </span>
              <h3 className="text-base font-bold text-white leading-tight">
                {explanation.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Deterministic Mathematical Formula Section */}
          <div className="rounded-xl p-4 bg-slate-900/90 border border-cyan-500/30">
            <div className="flex items-center gap-2 mb-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
              <Calculator className="w-4 h-4" />
              <span>1. Deterministic Calculation (Zero Hallucination Math)</span>
            </div>
            <pre className="text-xs font-mono text-cyan-200 whitespace-pre-wrap leading-relaxed bg-[#0a0f1d] p-3 rounded-lg border border-slate-800">
              {explanation.deterministicMathExplanation}
            </pre>

            {explanation.formulaDetails && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800/80">
                {Object.entries(explanation.formulaDetails).map(([key, val]) => (
                  <div key={key} className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block truncate">{key}</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Strategic Explanation Section */}
          <div className="rounded-xl p-4 bg-slate-900/90 border border-purple-500/30">
            <div className="flex items-center gap-2 mb-2 text-purple-400 font-semibold text-xs uppercase tracking-wider">
              <Brain className="w-4 h-4" />
              <span>2. AI Strategic Business Context</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-[#0a0f1d] p-3 rounded-lg border border-slate-800">
              {explanation.aiBusinessExplanation}
            </p>
          </div>

          {/* Key Drivers */}
          {explanation.keyDrivers && explanation.keyDrivers.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Primary Decision Drivers
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {explanation.keyDrivers.map((driver, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs bg-slate-850 px-3 py-2 rounded-lg border border-slate-800 text-slate-300"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{driver}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            Deterministic risk engine + LLM explainability separated for audit safety
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
