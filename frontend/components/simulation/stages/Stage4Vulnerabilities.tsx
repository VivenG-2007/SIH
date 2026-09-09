'use client';

import React, { useState } from 'react';
import { Vulnerability, SecuritySource } from '@/lib/simulation/types';
import { SECURITY_SOURCES } from '@/lib/simulation/vulnerabilities';
import { ShieldAlert, Radio, ArrowRight, Filter, Search, Tag, ExternalLink } from 'lucide-react';

interface Stage4VulnerabilitiesProps {
  vulnerabilities: Vulnerability[];
  onUpdateVulnerability?: (id: string, updates: Partial<Vulnerability>) => void;
  onProceedToRiskCalculation: () => void;
}

export default function Stage4Vulnerabilities({
  vulnerabilities,
  onUpdateVulnerability,
  onProceedToRiskCalculation,
}: Stage4VulnerabilitiesProps) {
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');

  const filtered = vulnerabilities.filter((v) => {
    if (selectedSource !== 'ALL' && v.source !== selectedSource) return false;
    if (selectedSeverity !== 'ALL' && v.severity !== selectedSeverity) return false;
    return true;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'Critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      case 'High':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      case 'Medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    }
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 font-bold">
              Step 4 of 11 — Vulnerability Collection & Multi-Source Telemetry Ingestion
            </span>
            <h3 className="text-xl font-bold text-white">
              Correlated Security Vulnerability Posture
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
          Total Ingested: {vulnerabilities.length} CVEs / Findings
        </span>
      </div>

      {/* Security Telemetry Source Feeds Bar */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2 font-semibold">
          9 Active Security Feeds Ingested
        </span>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {SECURITY_SOURCES.map((src) => {
            const isFilterActive = selectedSource === src.name;
            return (
              <button
                key={src.name}
                onClick={() => setSelectedSource(isFilterActive ? 'ALL' : src.name)}
                className={`p-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                  isFilterActive
                    ? 'bg-cyan-950 border-cyan-500 text-white shadow-sm ring-1 ring-cyan-500'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="text-[11px] font-mono font-bold">{src.name}</span>
                <span className="text-[9px] text-slate-500 mt-0.5">{src.count} events</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vulnerabilities Table */}
      <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/40">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] bg-slate-900/60">
              <th className="py-3 px-4">CWE / ID</th>
              <th className="py-3 px-4">Vulnerability Title</th>
              <th className="py-3 px-4">Severity</th>
              <th className="py-3 px-4">Exploitability</th>
              <th className="py-3 px-4">Impact</th>
              <th className="py-3 px-4">Target Asset</th>
              <th className="py-3 px-4">Telemetry Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-slate-900/40 transition">
                <td className="py-3 px-4 font-mono text-[11px] text-cyan-300">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                    {v.cwe}
                  </span>
                </td>

                <td className="py-3 px-4">
                  <span className="font-semibold text-white block">{v.title}</span>
                  {v.description && (
                    <span className="text-[11px] text-slate-400 block line-clamp-1 mt-0.5">
                      {v.description}
                    </span>
                  )}
                </td>

                <td className="py-3 px-4">
                  {onUpdateVulnerability ? (
                    <select
                      value={v.severity}
                      onChange={(e) => onUpdateVulnerability(v.id, { severity: e.target.value as any })}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold border bg-slate-950 focus:outline-none cursor-pointer ${getSeverityBadge(v.severity)}`}
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  ) : (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getSeverityBadge(v.severity)}`}>
                      {v.severity}
                    </span>
                  )}
                </td>

                <td className="py-3 px-4 font-mono text-slate-300">
                  {onUpdateVulnerability ? (
                    <select
                      value={v.exploitability}
                      onChange={(e) => onUpdateVulnerability(v.id, { exploitability: e.target.value as any })}
                      className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  ) : (
                    v.exploitability
                  )}
                </td>

                <td className="py-3 px-4 font-mono text-slate-300">
                  {onUpdateVulnerability ? (
                    <select
                      value={v.businessImpact}
                      onChange={(e) => onUpdateVulnerability(v.id, { businessImpact: e.target.value as any })}
                      className="px-2 py-1 rounded text-[10px] font-mono bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  ) : (
                    v.businessImpact
                  )}
                </td>

                <td className="py-3 px-4 font-medium text-slate-200">
                  {v.asset}
                </td>

                <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                    {v.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          Ready for deterministic dimensional quantification (Severity × Exploitability × Impact × Criticality × Compliance)
        </span>
        <button
          onClick={onProceedToRiskCalculation}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg transition"
        >
          <span>Calculate Deterministic Risk Engine</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
