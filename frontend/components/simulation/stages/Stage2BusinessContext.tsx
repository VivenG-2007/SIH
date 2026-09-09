'use client';

import React from 'react';
import { BusinessContext } from '@/lib/simulation/types';
import {
  Brain,
  ShieldAlert,
  FileText,
  Activity,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  Lock,
  GitFork,
} from 'lucide-react';

interface Stage2BusinessContextProps {
  businessContext: BusinessContext | null;
  isAiProcessing: boolean;
  onProceedToPriorities: () => void;
}

export default function Stage2BusinessContext({
  businessContext,
  isAiProcessing,
  onProceedToPriorities,
}: Stage2BusinessContextProps) {
  if (isAiProcessing || !businessContext) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-12 text-center shadow-xl">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 rounded-2xl bg-purple-500/20 animate-ping" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-lg">
            <Brain className="w-8 h-8 animate-pulse" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-white mb-1">
          AI Understanding Business Context & Threat Surface...
        </h3>
        <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
          Single-batch LLM pipeline synthesizing corporate dependencies, regulatory exposure frameworks, and crown jewel assets.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 font-bold">
              Step 2 of 11 — LLM Business Understanding
            </span>
            <h3 className="text-xl font-bold text-white">
              Synthesized Enterprise Threat & Context Model
            </h3>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800">
          Model: {businessContext.aiModelUsed}
        </span>
      </div>

      {/* Grid of AI-Generated Insight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Business Type & Goals */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-cyan-400">
            <FileText className="w-4 h-4" />
            <span>Business Type & Core Mission</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {businessContext.businessTypeAndGoals}
          </p>
        </div>

        {/* Potential Business Risks */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/30 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-rose-400">
            <ShieldAlert className="w-4 h-4" />
            <span>Identified Catastrophic Risks</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {businessContext.potentialBusinessRisks.map((risk, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Regulatory Exposure */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-amber-400">
            <Lock className="w-4 h-4" />
            <span>Regulatory & Compliance Frameworks</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {businessContext.regulatoryExposure.map((reg, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-amber-950/40 text-amber-300 border border-amber-800/60"
              >
                {reg}
              </span>
            ))}
          </div>
        </div>

        {/* Critical Assets */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-400">
            <Database className="w-4 h-4" />
            <span>Crown Jewel Assets</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {businessContext.criticalAssets.map((asset, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-950 text-slate-200 border border-slate-800"
              >
                {asset}
              </span>
            ))}
          </div>
        </div>

        {/* Critical Services */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-blue-400">
            <Layers className="w-4 h-4" />
            <span>High-Throughput Services</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {businessContext.criticalServices.map((srv, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-950 text-slate-200 border border-slate-800"
              >
                {srv}
              </span>
            ))}
          </div>
        </div>

        {/* Operational Dependencies */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-400">
            <GitFork className="w-4 h-4" />
            <span>Operational Dependencies</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {businessContext.operationalDependencies.map((dep, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-purple-400 font-bold">→</span>
                <span>{dep}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Stored in state as <code className="text-purple-300">businessContext</code> → Feeds Step 3 priority weighting
        </span>
        <button
          onClick={onProceedToPriorities}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Map Business Priorities</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
