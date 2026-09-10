'use client';

import React, { useState } from 'react';
import { SecurityControl, Currency } from '@/lib/simulation/types';
import { HelpCircle, Sparkles, ArrowRight, Play, Sliders, ToggleLeft, ToggleRight, DollarSign } from 'lucide-react';

interface Stage9WhatIfStudioProps {
  currentBudget: number;
  currency: Currency;
  controls: SecurityControl[];
  selectedControlIds: string[];
  onRunWhatIfQuery: (query: string) => void;
  onRunManualWhatIf: (appliedIds: string[], removedIds: string[], newBudget?: number) => void;
}

const QUICK_WHAT_IF_PROMPTS = [
  'What if I deploy WAF?',
  'What if I add MFA?',
  'What if budget becomes ₹5 Lakhs?',
  'What if I remove MFA?',
  'What if I reduce the security budget by 20%?',
  'What if I deploy Cloud Security & EDR?',
];

export default function Stage9WhatIfStudio({
  currentBudget,
  currency,
  controls,
  selectedControlIds,
  onRunWhatIfQuery,
  onRunManualWhatIf,
}: Stage9WhatIfStudioProps) {
  const [nlQuery, setNlQuery] = useState('');
  const [hypoControls, setHypoControls] = useState<Set<string>>(new Set(selectedControlIds));
  const [hypoBudget, setHypoBudget] = useState<number>(currentBudget);
  const [isBudgetFocused, setIsBudgetFocused] = useState(false);
  const [hypoBudgetText, setHypoBudgetText] = useState<string>(() => {
    return currency === 'INR' ? (currentBudget / 100000).toString() : (currentBudget / 1000).toString();
  });

  const isINR = currency === 'INR';
  const currencySymbol = isINR ? '₹' : '$';

  React.useEffect(() => {
    if (!isBudgetFocused) {
      setHypoBudgetText(isINR ? (hypoBudget / 100000).toString() : (hypoBudget / 1000).toString());
    }
  }, [hypoBudget, isINR, isBudgetFocused]);

  const toggleControl = (code: string) => {
    const next = new Set(hypoControls);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setHypoControls(next);
  };

  const handleApplyHypothetical = () => {
    const applied: string[] = [];
    const removed: string[] = [];

    controls.forEach((c) => {
      const wasSelected = selectedControlIds.includes(c.id) || selectedControlIds.includes(c.code);
      const isNowSelected = hypoControls.has(c.id) || hypoControls.has(c.code);

      if (!wasSelected && isNowSelected) applied.push(c.code);
      if (wasSelected && !isNowSelected) removed.push(c.code);
    });

    onRunManualWhatIf(applied, removed, hypoBudget !== currentBudget ? hypoBudget : undefined);
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 font-bold">
              Step 9 of 11 — Interactive What-If Scenario Studio
            </span>
            <h3 className="text-xl font-bold text-white">
              Hypothetical Simulation & Sensitivity Analysis
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
          Clones state: Never mutates your baseline plan
        </span>
      </div>

      {/* Natural Language Prompt Input */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-3">
        <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-400" />
          Ask Any Natural-Language "What If?" Question:
        </label>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="e.g. What if I deploy WAF? or What if budget increases to ₹15 Lakhs?"
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && nlQuery.trim() && onRunWhatIfQuery(nlQuery)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => nlQuery.trim() && onRunWhatIfQuery(nlQuery)}
            disabled={!nlQuery.trim()}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition disabled:opacity-50 shrink-0"
          >
            Simulate Question
          </button>
        </div>

        {/* Quick-Action Chips */}
        <div>
          <span className="text-[10px] font-mono text-slate-400 block mb-1.5 uppercase">
            Or Click a Quick Pre-Configured Scenario:
          </span>
          <div className="flex flex-wrap gap-2">
            {QUICK_WHAT_IF_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setNlQuery(prompt);
                  onRunWhatIfQuery(prompt);
                }}
                className="px-3 py-1 text-xs rounded-lg bg-slate-950 hover:bg-purple-950/60 text-purple-200 border border-purple-900/40 hover:border-purple-500 transition"
              >
                [{prompt}]
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manual Hypothetical Tuning (Interactive Controls Toggles & Budget Slider) */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <span className="text-xs font-bold text-white uppercase font-mono block">
          Manual Hypothetical Controls Tuning
        </span>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {controls.map((ctrl) => {
            const isSelected = hypoControls.has(ctrl.id) || hypoControls.has(ctrl.code);
            return (
              <button
                key={ctrl.id}
                type="button"
                onClick={() => toggleControl(ctrl.code)}
                className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-purple-950/60 border-purple-500 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">{ctrl.code}</span>
                  <span className="text-[10px] text-slate-400">{ctrl.name}</span>
                </div>
                {isSelected ? (
                  <ToggleRight className="w-5 h-5 text-purple-400 shrink-0" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-slate-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Budget Adjustment Slider & Direct Input */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300">Hypothetical Budget Limit:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[10px]">Type amount:</span>
              <div className="relative">
                <span className="absolute left-2 top-1 text-slate-500 font-mono text-xs">
                  {isINR ? '₹' : '$'}
                </span>
                <input
                  type="text"
                  value={hypoBudgetText}
                  onFocus={() => setIsBudgetFocused(true)}
                  onBlur={() => {
                    setIsBudgetFocused(false);
                    const clean = hypoBudgetText.replace(/,/g, '').trim().toLowerCase();
                    const raw = parseFloat(clean);
                    if (!isNaN(raw) && raw > 0) {
                      const finalBudget = raw >= 1000 ? Math.round(raw) : Math.round(isINR ? raw * 100000 : raw * 1000);
                      setHypoBudget(finalBudget);
                    } else {
                      setHypoBudgetText(isINR ? (hypoBudget / 100000).toString() : (hypoBudget / 1000).toString());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  onChange={(e) => {
                    setHypoBudgetText(e.target.value);
                    const clean = e.target.value.replace(/,/g, '').trim().toLowerCase();
                    const raw = parseFloat(clean);
                    if (!isNaN(raw) && raw > 0) {
                      const finalBudget = raw >= 1000 ? Math.round(raw) : Math.round(isINR ? raw * 100000 : raw * 1000);
                      setHypoBudget(finalBudget);
                    }
                  }}
                  className="w-24 pl-5 pr-6 py-0.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-xs font-bold focus:outline-none focus:border-cyan-500 text-right"
                />
                <span className="absolute right-1.5 top-1 text-[10px] text-slate-400 font-mono">
                  {isINR ? 'L' : 'k'}
                </span>
              </div>
              <span className="font-bold text-cyan-400">
                ({isINR ? `₹${(hypoBudget / 100000).toFixed(1)} Lakhs` : `$${hypoBudget.toLocaleString()}`})
              </span>
            </div>
          </div>
          <input
            type="range"
            min={isINR ? 100000 : 10000}
            max={Math.max(isINR ? 5000000 : 500000, hypoBudget)}
            step={isINR ? 50000 : 5000}
            value={Math.min(Math.max(hypoBudget, isINR ? 100000 : 10000), Math.max(isINR ? 5000000 : 500000, hypoBudget))}
            onChange={(e) => {
              setIsBudgetFocused(false);
              setHypoBudget(Number(e.target.value));
            }}
            className="w-full accent-purple-500 h-2 bg-slate-950 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleApplyHypothetical}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition"
          >
            <Play className="w-3.5 h-3.5" />
            Evaluate Custom Hypothetical
          </button>
        </div>
      </div>
    </div>
  );
}
