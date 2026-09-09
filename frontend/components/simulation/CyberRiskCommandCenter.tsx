'use client';

import React from 'react';
import {
  ShieldAlert,
  TrendingDown,
  DollarSign,
  Briefcase,
  Play,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Terminal,
  Layers,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import { Company, OptimizationResult, Currency } from '@/lib/simulation/types';

interface CyberRiskCommandCenterProps {
  company: Company;
  optimization: OptimizationResult | null;
  baselineRiskScore: number;
  baselineEal: number;
  isSimulating: boolean;
  onRunFullSimulation: () => void;
  onLoadDemoCompany: () => void;
  onSelectCompanyType?: (type: any) => void;
  onOpenTelemetryConsole: () => void;
  onWhyClick: (metricKey: string) => void;
  onViewAllocationImpact?: () => void;
}

export default function CyberRiskCommandCenter({
  company,
  optimization,
  baselineRiskScore,
  baselineEal,
  isSimulating,
  onRunFullSimulation,
  onLoadDemoCompany,
  onSelectCompanyType,
  onOpenTelemetryConsole,
  onWhyClick,
  onViewAllocationImpact,
}: CyberRiskCommandCenterProps) {
  const isINR = company.currency === 'INR';
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

  const currentRisk = baselineRiskScore;
  const projectedRisk = optimization ? optimization.projectedRiskScore : currentRisk;
  const riskReduction = optimization ? optimization.totalRiskReductionPct : 0;
  const investment = optimization ? optimization.totalInvestment : 0;
  const remainingBudget = optimization ? optimization.remainingBudget : company.annualSecurityBudget;
  const eal = baselineEal;
  const projectedEal = optimization ? optimization.projectedEal : baselineEal;

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 mb-6">
      {/* Top Banner: Company Info & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono tracking-wider text-cyan-400 font-bold uppercase px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80">
              Executive Cyber Risk Command Center
            </span>
            {onSelectCompanyType ? (
              <select
                value={company.type}
                onChange={(e) => onSelectCompanyType(e.target.value)}
                className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 border border-cyan-500/50 text-cyan-300 font-semibold cursor-pointer focus:outline-none focus:border-cyan-400"
              >
                <option value="Banking">🏦 Banking (FinBank)</option>
                <option value="Healthcare">🏥 Healthcare (HealthGuard)</option>
                <option value="SaaS / Cloud">☁️ SaaS / Cloud (CloudScale)</option>
                <option value="Retail">🛍️ Retail (RetailSphere)</option>
                <option value="Critical Infrastructure / Energy">⚡ Critical Infra / Energy</option>
                <option value="Defense">🛡️ Defense (AeroShield)</option>
              </select>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {company.type}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            {company.name}
            <span className="text-sm font-normal text-slate-400">({company.industry})</span>
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onViewAllocationImpact && (
            <button
              onClick={onViewAllocationImpact}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition shadow-sm"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Capital Allocation & Impact Matrix
            </button>
          )}

          <button
            onClick={onLoadDemoCompany}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            Load Demo (FinBank)
          </button>

          <button
            onClick={onOpenTelemetryConsole}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 transition relative"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            Live Telemetry Logs
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />
            <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-1 -right-1" />
          </button>

          <button
            onClick={onRunFullSimulation}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Simulating Pipeline...' : 'Run Full Automated Simulation'}
          </button>
        </div>
      </div>

      {/* 6 Executive KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mt-5">
        {/* Current Risk */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-rose-500/30 relative group hover:border-rose-500/60 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-rose-400">Current Risk</span>
            <button
              onClick={() => onWhyClick('CURRENT_RISK')}
              title="Why is current risk quantified at this score?"
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-rose-400 tracking-tight">
            {currentRisk} <span className="text-xs font-normal text-slate-500">/ 100</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            Critical Vulnerability Baseline
          </span>
        </div>

        {/* Expected Annual Loss */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 relative group hover:border-amber-500/60 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-amber-400">Expected Annual Loss</span>
            <button
              onClick={() => onWhyClick('EAL')}
              title="Why this EAL figure?"
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-amber-300 tracking-tight">
            {formatCurrency(eal)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            Annualized Loss Exposure
          </span>
        </div>

        {/* Security Budget */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 relative group hover:border-slate-600 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Security Budget</span>
            <button
              onClick={() => onWhyClick('BUDGET')}
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {formatCurrency(company.annualSecurityBudget)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            Total Authorized Cap
          </span>
        </div>

        {/* Optimized Investment */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/30 relative group hover:border-cyan-500/60 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-cyan-400">Optimized Investment</span>
            <button
              onClick={() => onWhyClick('KNAPSACK_INVESTMENT')}
              title="Why this allocation?"
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-cyan-300 tracking-tight">
            {formatCurrency(investment)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            {optimization ? `${optimization.selectedControls.length} Controls Selected` : '0 Controls'}
          </span>
        </div>

        {/* Projected Risk */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 relative group hover:border-emerald-500/60 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">Projected Risk</span>
            <button
              onClick={() => onWhyClick('PROJECTED_RISK')}
              title="Why will risk drop to this score?"
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-emerald-300 tracking-tight flex items-center gap-1.5">
            {projectedRisk} <span className="text-xs font-normal text-slate-500">/ 100</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-[10px] text-emerald-400/90 font-mono mt-1 block">
            Residual Risk Post-Controls
          </span>
        </div>

        {/* Risk Reduction % */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-purple-500/30 relative group hover:border-purple-500/60 transition">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase font-bold text-purple-400">Risk Reduction</span>
            <button
              onClick={() => onWhyClick('RISK_REDUCTION')}
              className="p-1 text-slate-500 hover:text-cyan-300 rounded transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-2xl font-black text-purple-300 tracking-tight">
            {riskReduction}%
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            Remaining: {formatCurrency(remainingBudget)}
          </span>
        </div>
      </div>
    </div>
  );
}
