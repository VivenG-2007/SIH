'use client';

import React from 'react';
import { BusinessPriority, PriorityLevel } from '@/lib/simulation/types';
import { Sliders, ArrowRight, Shield, AlertCircle, Database, Layers } from 'lucide-react';

interface Stage3BusinessPrioritiesProps {
  priorities: BusinessPriority[];
  onUpdatePriority: (id: string, newPriority: PriorityLevel) => void;
  onProceedToVulnerabilities: () => void;
}

const PRIORITY_OPTIONS: PriorityLevel[] = ['VERY HIGH', 'HIGH', 'MEDIUM', 'LOW'];

export default function Stage3BusinessPriorities({
  priorities,
  onUpdatePriority,
  onProceedToVulnerabilities,
}: Stage3BusinessPrioritiesProps) {
  const getBadgeStyle = (p: PriorityLevel) => {
    switch (p) {
      case 'VERY HIGH':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'LOW':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    }
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
              Step 3 of 11 — Business Priorities Engine
            </span>
            <h3 className="text-xl font-bold text-white">
              Asset & Service Criticality Priority Mapping
            </h3>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Interactive: Modifying priorities immediately recalibrates deterministic risk scores
        </span>
      </div>

      {/* Priorities Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Asset / Business Service</th>
              <th className="py-3 px-4">Priority Level</th>
              <th className="py-3 px-4">Criticality Multiplier</th>
              <th className="py-3 px-4">Direct Business Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {priorities.map((item) => (
              <tr key={item.id} className="hover:bg-slate-900/40 transition">
                <td className="py-3.5 px-4 font-mono">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                      item.type === 'asset'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                        : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                    }`}
                  >
                    {item.type === 'asset' ? 'ASSET' : 'SERVICE'}
                  </span>
                </td>

                <td className="py-3.5 px-4 font-semibold text-white">
                  <div className="flex items-center gap-2">
                    {item.type === 'asset' ? (
                      <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                    <span>{item.name}</span>
                    {item.isManualOverride && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                        Manual Override
                      </span>
                    )}
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
                    {PRIORITY_OPTIONS.map((level) => (
                      <button
                        key={level}
                        onClick={() => onUpdatePriority(item.id, level)}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg border transition ${
                          item.priority === level
                            ? getBadgeStyle(level)
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </td>

                <td className="py-3.5 px-4 font-mono text-cyan-300 font-semibold">
                  {item.criticalityScore.toFixed(2)}x
                </td>

                <td className="py-3.5 px-4 text-slate-300 max-w-sm">
                  {item.businessImpact}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Stored as <code className="text-cyan-300">businessPriorities</code> → Directly weights Step 5 risk engine calculations
        </span>
        <button
          onClick={onProceedToVulnerabilities}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Ingest Telemetry Vulnerabilities</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
