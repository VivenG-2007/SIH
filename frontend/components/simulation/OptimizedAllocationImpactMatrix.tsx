'use client';

import React, { useState } from 'react';
import {
  OptimizationResult,
  SecurityControl,
  VulnerabilityRiskResult,
  Currency,
} from '@/lib/simulation/types';
import { recalculateRiskWithControls } from '@/lib/simulation/risk-engine';
import {
  DollarSign,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Layers,
  ArrowDownRight,
  Database,
  Lock,
  Zap,
} from 'lucide-react';

interface OptimizedAllocationImpactMatrixProps {
  optimization: OptimizationResult | null;
  riskResults: VulnerabilityRiskResult[];
  currency: Currency;
  onWhyClick?: (subjectId: string) => void;
}

export default function OptimizedAllocationImpactMatrix({
  optimization,
  riskResults,
  currency,
  onWhyClick,
}: OptimizedAllocationImpactMatrixProps) {
  const [activeTab, setActiveTab] = useState<'allocation' | 'vulnerabilities' | 'assets'>('allocation');

  if (!optimization) return null;

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

  // Compute exact before vs after for each vulnerability using recalculateRiskWithControls
  const selectedCodes = optimization.selectedControls.map((c) => c.code);
  const { residualResults } = recalculateRiskWithControls(riskResults, selectedCodes, currency);

  // Group by assets for asset-level impact
  const assetMap = new Map<string, { baseline: number[]; residual: number[]; count: number }>();
  riskResults.forEach((r, idx) => {
    const asset = r.vulnerability.asset;
    const residual = residualResults[idx]?.riskScore ?? r.riskScore;
    if (!assetMap.has(asset)) {
      assetMap.set(asset, { baseline: [], residual: [], count: 0 });
    }
    const entry = assetMap.get(asset)!;
    entry.baseline.push(r.riskScore);
    entry.residual.push(residual);
    entry.count += 1;
  });

  const assetList = Array.from(assetMap.entries()).map(([name, data]) => {
    const avgBase = Math.round(data.baseline.reduce((a, b) => a + b, 0) / data.count);
    const avgRes = Math.round(data.residual.reduce((a, b) => a + b, 0) / data.count);
    return {
      name,
      count: data.count,
      baselineScore: avgBase,
      residualScore: avgRes,
      dropPct: avgBase > 0 ? Math.round(((avgBase - avgRes) / avgBase) * 100) : 0,
    };
  });

  return (
    <div className="bg-[#0f172a] border border-cyan-500/40 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80">
              Knapsack Capital Optimization & Impact Engine
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
              Converged Solution
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Optimized Capital Allocation & Direct Residual Impact
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Clear visibility into where every rupee/dollar is invested, what controls are deployed, and the exact risk reduction produced.
          </p>
        </div>

        {/* View switcher tabs */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('allocation')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'allocation' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Where Money is Allocated ({optimization.selectedControls.length})
          </button>
          <button
            onClick={() => setActiveTab('vulnerabilities')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'vulnerabilities' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Risk Impact on Findings ({riskResults.length})
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'assets' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Asset Impact ({assetList.length})
          </button>
        </div>
      </div>

      {/* Top Impact Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] uppercase text-slate-400 block font-sans">Authorized Budget</span>
          <span className="text-xl font-bold text-white block mt-1">
            {formatCurrency(optimization.availableBudget)}
          </span>
          <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">100% Authorized Pool</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40">
          <span className="text-[10px] uppercase text-cyan-400 block font-sans">Optimized Allocation</span>
          <span className="text-xl font-bold text-cyan-300 block mt-1">
            {formatCurrency(optimization.totalInvestment)}
          </span>
          <span className="text-[10px] text-cyan-400/90 font-sans mt-0.5 block">
            {optimization.budgetUtilizationPct}% of total budget
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/40">
          <span className="text-[10px] uppercase text-emerald-400 block font-sans">Portfolio Risk Shift</span>
          <span className="text-xl font-bold text-emerald-300 flex items-center gap-1 mt-1">
            {optimization.baselineRiskScore} → {optimization.projectedRiskScore}
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
          </span>
          <span className="text-[10px] text-emerald-400/90 font-sans mt-0.5 block">
            {optimization.totalRiskReductionPct}% Net Risk Reduction
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/40">
          <span className="text-[10px] uppercase text-amber-400 block font-sans">Financial EAL Savings</span>
          <span className="text-xl font-bold text-amber-300 block mt-1">
            {formatCurrency(optimization.ealReduction)}
          </span>
          <span className="text-[10px] text-amber-400/90 font-sans mt-0.5 block">
            Loss: {formatCurrency(optimization.baselineEal)} → {formatCurrency(optimization.projectedEal)}
          </span>
        </div>
      </div>

      {/* Visual Allocation Stacked Bar */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-semibold">Visual Capital Allocation Distribution:</span>
          <span className="text-slate-400">
            {formatCurrency(optimization.totalInvestment)} allocated / {formatCurrency(optimization.remainingBudget)} reserve
          </span>
        </div>

        <div className="w-full h-5 bg-slate-950 rounded-lg overflow-hidden flex border border-slate-800">
          {optimization.selectedControls.map((ctrl, i) => {
            const cost = isINR ? ctrl.costINR : ctrl.costUSD;
            const pct = (cost / optimization.availableBudget) * 100;
            const colors = ['bg-cyan-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500'];
            return (
              <div
                key={ctrl.id}
                style={{ width: `${pct}%` }}
                title={`${ctrl.name} (${ctrl.code}): ${formatCurrency(cost)} (${pct.toFixed(1)}%)`}
                className={`${colors[i % colors.length]} h-full transition-all flex items-center justify-center text-[10px] font-mono font-bold text-slate-950 truncate px-1`}
              >
                {ctrl.code} {pct.toFixed(0)}%
              </div>
            );
          })}
          <div
            style={{ width: `${(optimization.remainingBudget / optimization.availableBudget) * 100}%` }}
            className="bg-slate-800 h-full flex items-center justify-center text-[10px] font-mono text-slate-400 px-1"
            title={`Operational Reserve: ${formatCurrency(optimization.remainingBudget)}`}
          >
            Reserve ({((optimization.remainingBudget / optimization.availableBudget) * 100).toFixed(0)}%)
          </div>
        </div>
      </div>

      {/* TAB 1: EXACT CAPITAL ALLOCATION TABLE */}
      {activeTab === 'allocation' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] bg-slate-900/60">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Recommended Security Control</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 font-bold text-cyan-300">Exact Allocation</th>
                  <th className="py-3 px-4">% of Budget</th>
                  <th className="py-3 px-4 text-emerald-300">Risk Drop</th>
                  <th className="py-3 px-4 font-mono">ROI Metric</th>
                  <th className="py-3 px-4">Timeline</th>
                  <th className="py-3 px-4 text-right">Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {optimization.selectedControls.map((ctrl) => {
                  const cost = isINR ? ctrl.costINR : ctrl.costUSD;
                  const pct = ((cost / optimization.availableBudget) * 100).toFixed(1);
                  return (
                    <tr key={ctrl.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-400">
                        <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800">
                          {ctrl.code}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-white block">{ctrl.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                          Protects: {ctrl.coverage.join(', ')}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {ctrl.category}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-300 text-sm">
                        {formatCurrency(cost)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {pct}%
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        +{ctrl.riskReduction}%
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {ctrl.roiScore} pts / cap
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 text-[11px] font-mono">
                        {ctrl.implementationTime}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onWhyClick && onWhyClick(ctrl.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 hover:border-cyan-500/50 transition font-medium"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          Why
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Remaining Reserve Row */}
                <tr className="bg-slate-900/40 font-mono text-xs">
                  <td className="py-3.5 px-4 font-bold text-slate-400">RESERVE</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-300">
                    Remaining Unallocated Security Budget Reserve
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">Contingency Fund</td>
                  <td className="py-3.5 px-4 font-bold text-slate-200 text-sm">
                    {formatCurrency(optimization.remainingBudget)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    {((optimization.remainingBudget / optimization.availableBudget) * 100).toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-slate-500">—</td>
                  <td className="py-3.5 px-4 text-slate-500">Immediate</td>
                  <td className="py-3.5 px-4 text-right text-slate-500">Operational</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: VULNERABILITY IMPACT (BEFORE VS AFTER CONTROLS) */}
      {activeTab === 'vulnerabilities' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] bg-slate-900/60">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Vulnerability Finding</th>
                  <th className="py-3 px-4">Target Asset</th>
                  <th className="py-3 px-4">Mitigating Control Allocated</th>
                  <th className="py-3 px-4 font-bold text-rose-400">Pre-Investment Score</th>
                  <th className="py-3 px-4 font-bold text-emerald-400">Post-Investment Score</th>
                  <th className="py-3 px-4 font-bold text-cyan-300">Risk Reduction Delta</th>
                  <th className="py-3 px-4 font-mono text-amber-300">EAL Savings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {riskResults.map((r, idx) => {
                  const residual = residualResults[idx] || r;
                  const scoreDrop = r.riskScore - residual.riskScore;
                  const ealDrop = r.eal - residual.eal;

                  // Find which allocated control mitigates this finding
                  const mitigatingCtrl = optimization.selectedControls.find(
                    (c) =>
                      c.supportedVulnerabilities.some((sv) => r.vulnerability.id.includes(sv) || sv.includes(r.vulnerability.id)) ||
                      c.coverage.some((cov) => r.vulnerability.title.toLowerCase().includes(cov.toLowerCase()))
                  );

                  return (
                    <tr key={r.vulnerability.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-400">
                        #{r.rank}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-white block">{r.vulnerability.title}</span>
                        <span className="text-[10px] font-mono text-slate-400">{r.vulnerability.cwe}</span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 font-medium">
                        {r.vulnerability.asset}
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        {mitigatingCtrl ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-semibold flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {mitigatingCtrl.code}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Unmitigated</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-rose-400 text-sm">
                        {r.riskScore} <span className="text-[10px] font-normal text-slate-500">/ 100</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                        {residual.riskScore} <span className="text-[10px] font-normal text-slate-500">/ 100</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                        {scoreDrop > 0 ? (
                          <span className="flex items-center gap-0.5 text-emerald-400">
                            <ArrowDownRight className="w-3.5 h-3.5" /> -{scoreDrop} pts ({Math.round((scoreDrop / r.riskScore) * 100)}%)
                          </span>
                        ) : (
                          <span className="text-slate-500">0 pts</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-amber-300">
                        {ealDrop > 0 ? formatCurrency(ealDrop) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ASSET-LEVEL RISK REDUCTION */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assetList.map((asset) => (
              <div
                key={asset.name}
                className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    {asset.name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                    {asset.count} Findings
                  </span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Pre-Investment Score:</span>
                    <span className="font-bold text-rose-400">{asset.baselineScore} / 100</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Post-Investment Score:</span>
                    <span className="font-bold text-emerald-400">{asset.residualScore} / 100</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-cyan-300">
                    <span>Net Asset Protection:</span>
                    <span className="font-bold flex items-center gap-0.5 text-emerald-400">
                      <ArrowDownRight className="w-3.5 h-3.5" /> -{asset.baselineScore - asset.residualScore} pts ({asset.dropPct}%)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
