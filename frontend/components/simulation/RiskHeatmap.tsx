'use client';

import React, { useState } from 'react';
import { VulnerabilityRiskResult, Currency } from '@/lib/simulation/types';
import { HelpCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

interface RiskHeatmapProps {
  results: VulnerabilityRiskResult[];
  currency: Currency;
  onSelectVuln?: (vulnResult: VulnerabilityRiskResult) => void;
  onWhyClick?: (vulnId: string) => void;
}

export default function RiskHeatmap({
  results,
  currency,
  onSelectVuln,
  onWhyClick,
}: RiskHeatmapProps) {
  const [hoveredVuln, setHoveredVuln] = useState<VulnerabilityRiskResult | null>(null);

  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  // Map levels to numeric grid coordinate (0 to 3)
  const impactMap: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  const exploitMap: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

  const formatEal = (eal: number) => {
    if (isINR) {
      return `₹${(eal / 100000).toFixed(1)}L`;
    }
    return `$${(eal / 1000).toFixed(0)}k`;
  };

  const getBubbleColor = (score: number) => {
    if (score >= 81) return 'bg-rose-500/90 border-rose-300 shadow-rose-500/50';
    if (score >= 61) return 'bg-orange-500/90 border-orange-300 shadow-orange-500/50';
    if (score >= 41) return 'bg-amber-500/90 border-amber-300 shadow-amber-500/50';
    if (score >= 21) return 'bg-emerald-500/90 border-emerald-300 shadow-emerald-500/50';
    return 'bg-blue-500/90 border-blue-300 shadow-blue-500/50';
  };

  const getBubbleSize = (criticality: string) => {
    switch (criticality) {
      case 'VERY HIGH':
        return 'w-11 h-11 text-xs';
      case 'HIGH':
        return 'w-9 h-9 text-[11px]';
      case 'MEDIUM':
        return 'w-7 h-7 text-[10px]';
      default:
        return 'w-6 h-6 text-[9px]';
    }
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[11px] font-mono font-bold tracking-wider text-cyan-400 uppercase">
            Multidimensional Cyber Risk Heatmap
          </span>
          <h3 className="text-base font-bold text-white">
            Exploitability vs. Business Impact Matrix
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Critical (81-100)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> High (61-80)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Medium (41-60)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Mod/Low (0-40)
          </span>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="relative flex flex-col border border-slate-800 rounded-xl bg-slate-950/60 p-4">
        {/* Y-Axis Label */}
        <div className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-mono tracking-widest text-slate-400 uppercase pointer-events-none">
          Business Impact →
        </div>

        {/* 4x4 Grid Container */}
        <div className="grid grid-cols-4 grid-rows-4 gap-2 h-72 w-full relative">
          {['Critical', 'High', 'Medium', 'Low'].map((impRow, rowIdx) =>
            ['Low', 'Medium', 'High', 'Critical'].map((expCol, colIdx) => {
              // Vulnerabilities matching this quadrant
              const matched = results.filter(
                (r) =>
                  r.vulnerability.businessImpact === impRow &&
                  r.vulnerability.exploitability === expCol
              );

              // Background tint based on quadrant risk severity
              const quadRisk = (3 - rowIdx) + colIdx; // 0 to 6
              const bgTone =
                quadRisk >= 5
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : quadRisk >= 4
                  ? 'bg-orange-950/15 border-orange-900/30'
                  : quadRisk >= 2
                  ? 'bg-amber-950/10 border-amber-900/20'
                  : 'bg-slate-900/30 border-slate-800/40';

              return (
                <div
                  key={`${impRow}-${expCol}`}
                  className={`relative rounded-lg border flex flex-wrap items-center justify-center gap-1.5 p-1 transition-all ${bgTone}`}
                >
                  <span className="absolute top-1 left-1 text-[8px] font-mono text-slate-600 select-none">
                    {impRow[0]}×{expCol[0]}
                  </span>

                  {matched.map((item) => (
                    <div
                      key={item.vulnerability.id}
                      onMouseEnter={() => setHoveredVuln(item)}
                      onMouseLeave={() => setHoveredVuln(null)}
                      onClick={() => onSelectVuln && onSelectVuln(item)}
                      className={`relative flex items-center justify-center rounded-full font-mono font-bold text-white border shadow-md cursor-pointer transition transform hover:scale-125 z-10 ${getBubbleColor(
                        item.riskScore
                      )} ${getBubbleSize(item.vulnerability.assetCriticality)}`}
                    >
                      <span>#{item.rank}</span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* X-Axis Labels */}
        <div className="grid grid-cols-4 mt-2 text-center text-[10px] font-mono text-slate-400">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
          <span className="text-rose-400 font-bold">Critical</span>
        </div>
        <div className="text-center text-[10px] font-mono tracking-widest text-slate-400 uppercase mt-1">
          ← Exploitability →
        </div>
      </div>

      {/* Hover Info Banner */}
      <div className="mt-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between min-h-[56px]">
        {hoveredVuln ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold text-white ${getBubbleColor(
                  hoveredVuln.riskScore
                )}`}
              >
                Rank #{hoveredVuln.rank} (Score: {hoveredVuln.riskScore})
              </span>
              <div>
                <h4 className="text-xs font-semibold text-white truncate max-w-md">
                  {hoveredVuln.vulnerability.title}
                </h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>Asset: <strong className="text-slate-200">{hoveredVuln.vulnerability.asset}</strong></span>
                  <span>•</span>
                  <span>EAL: <strong className="text-emerald-400">{formatEal(hoveredVuln.eal)}</strong></span>
                  <span>•</span>
                  <span>Loss Prob: <strong className="text-cyan-300">{(hoveredVuln.probabilityOfLoss * 100).toFixed(0)}%</strong></span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onWhyClick && onWhyClick(hoveredVuln.vulnerability.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Why Rank #{hoveredVuln.rank}?
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">
            Hover over any numbered vulnerability bubble to inspect deterministic scores and Expected Annual Loss (EAL). Bubble size reflects Asset Criticality.
          </span>
        )}
      </div>
    </div>
  );
}
