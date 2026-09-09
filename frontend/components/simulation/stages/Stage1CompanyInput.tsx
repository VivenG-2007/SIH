'use client';

import React, { useState, useEffect } from 'react';
import { Company, CompanyType, DataSensitivity, Currency } from '@/lib/simulation/types';
import { DEMO_COMPANIES } from '@/lib/simulation/business';
import { Building2, DollarSign, Layers, ShieldCheck, ArrowRight, Sparkles, Database } from 'lucide-react';

interface Stage1CompanyInputProps {
  company: Company;
  onChangeCompany: (updated: Company) => void;
  onAnalyzeBusiness: () => void;
  onLoadPreset: (type: CompanyType) => void;
}

const COMPANY_TYPES: CompanyType[] = [
  'Banking',
  'Healthcare',
  'SaaS / Cloud',
  'Retail',
  'Critical Infrastructure / Energy',
  'Defense',
];

const ALL_SERVICES = [
  'Payment System',
  'Customer Portal',
  'Employee Portal',
  'Public Website',
  'APIs',
  'Data Platform',
  'SCADA Network',
  'Identity Provider',
];

const ALL_ASSETS = [
  'Customer Database',
  'Payment System',
  'Authentication System',
  'Employee Systems',
  'Cloud Infrastructure',
  'Electronic Health Records',
  'Cryptographic Hardware',
];

const DATA_SENSITIVITIES: DataSensitivity[] = [
  'Public',
  'Internal',
  'Confidential',
  'Financial',
  'Personal',
  'Highly Sensitive',
];

export default function Stage1CompanyInput({
  company,
  onChangeCompany,
  onAnalyzeBusiness,
  onLoadPreset,
}: Stage1CompanyInputProps) {
  const [budgetUnit, setBudgetUnit] = useState<'lakh' | 'raw'>('lakh');
  const [isBudgetFocused, setIsBudgetFocused] = useState(false);
  const [budgetText, setBudgetText] = useState<string>(() => {
    if (company.currency === 'INR') {
      return (company.annualSecurityBudget / 100000).toString();
    }
    return (company.annualSecurityBudget / 1000).toString();
  });

  // Helper parser for human-friendly budget strings
  const parseBudget = (text: string, currency: Currency, unit: 'lakh' | 'raw'): number | null => {
    if (!text) return null;
    const clean = text.replace(/,/g, '').replace(/₹/g, '').replace(/\$/g, '').trim().toLowerCase();
    if (!clean) return null;

    let multiplier = 1;
    let numStr = clean;

    if (clean.endsWith('cr') || clean.endsWith('crore') || clean.endsWith('crores')) {
      multiplier = 10000000;
      numStr = clean.replace(/crores?|cr/g, '').trim();
    } else if (clean.endsWith('l') || clean.endsWith('lakh') || clean.endsWith('lakhs')) {
      multiplier = 100000;
      numStr = clean.replace(/lakhs?|l/g, '').trim();
    } else if (clean.endsWith('m') || clean.endsWith('million')) {
      multiplier = 1000000;
      numStr = clean.replace(/million|m/g, '').trim();
    } else if (clean.endsWith('k') || clean.endsWith('thousand')) {
      multiplier = 1000;
      numStr = clean.replace(/thousand|k/g, '').trim();
    } else if (unit === 'lakh') {
      multiplier = currency === 'INR' ? 100000 : 1000;
    }

    const parsed = parseFloat(numStr);
    if (isNaN(parsed) || parsed <= 0) return null;
    return Math.round(parsed * multiplier);
  };

  // Sync text only when the user is NOT actively typing inside the input
  useEffect(() => {
    if (!isBudgetFocused) {
      if (budgetUnit === 'lakh') {
        const val = company.currency === 'INR'
          ? (company.annualSecurityBudget / 100000).toString()
          : (company.annualSecurityBudget / 1000).toString();
        setBudgetText(val);
      } else {
        setBudgetText(company.annualSecurityBudget.toLocaleString(company.currency === 'INR' ? 'en-IN' : 'en-US'));
      }
    }
  }, [company.annualSecurityBudget, company.currency, budgetUnit, isBudgetFocused]);

  const handleBudgetChange = (text: string) => {
    setBudgetText(text);
    const parsed = parseBudget(text, company.currency, budgetUnit);
    const minThreshold = company.currency === 'INR' ? 50000 : 5000;
    if (parsed !== null && parsed >= minThreshold) {
      onChangeCompany({ ...company, annualSecurityBudget: parsed });
    }
  };

  const handleBudgetBlur = () => {
    setIsBudgetFocused(false);
    const parsed = parseBudget(budgetText, company.currency, budgetUnit);
    const minThreshold = company.currency === 'INR' ? 50000 : 5000;
    if (parsed !== null && parsed >= minThreshold) {
      onChangeCompany({ ...company, annualSecurityBudget: parsed });
    } else {
      // Revert to valid company budget
      const resetVal = budgetUnit === 'lakh'
        ? (company.currency === 'INR' ? (company.annualSecurityBudget / 100000).toString() : (company.annualSecurityBudget / 1000).toString())
        : company.annualSecurityBudget.toLocaleString(company.currency === 'INR' ? 'en-IN' : 'en-US');
      setBudgetText(resetVal);
    }
  };

  const adjustBudget = (delta: number) => {
    const current = company.annualSecurityBudget;
    const nextVal = Math.max(company.currency === 'INR' ? 100000 : 10000, current + delta);
    onChangeCompany({ ...company, annualSecurityBudget: nextVal });
  };

  const toggleService = (srv: string) => {
    const exists = company.keyServices.includes(srv);
    const updated = exists
      ? company.keyServices.filter((s) => s !== srv)
      : [...company.keyServices, srv];
    onChangeCompany({ ...company, keyServices: updated });
  };

  const toggleAsset = (asset: string) => {
    const exists = company.importantAssets.includes(asset);
    const updated = exists
      ? company.importantAssets.filter((a) => a !== asset)
      : [...company.importantAssets, asset];
    onChangeCompany({ ...company, importantAssets: updated });
  };

  const toggleSensitivity = (sens: DataSensitivity) => {
    const exists = company.dataSensitivity.includes(sens);
    const updated = exists
      ? company.dataSensitivity.filter((s) => s !== sens)
      : [...company.dataSensitivity, sens];
    onChangeCompany({ ...company, dataSensitivity: updated });
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800 mb-6">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
            Step 1 of 11 — Enterprise Profile Ingestion
          </span>
          <h3 className="text-xl font-bold text-white">
            Company & Business Critical Details
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure your organization profile, critical assets, data sensitivity, and authorized security budget.
          </p>
        </div>

        {/* Preset Selector Chips */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 px-2">Preset:</span>
          {COMPANY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onLoadPreset(type)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                company.type === type
                  ? 'bg-cyan-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Organization & Budget */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Organization Archetype & Industry Sector</span>
              <span className="text-[10px] text-cyan-400 font-mono">Drives threat vectors & findings</span>
            </label>
            <select
              value={company.type}
              onChange={(e) => onLoadPreset(e.target.value as CompanyType)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-cyan-500/50 text-cyan-300 font-semibold text-sm focus:outline-none focus:border-cyan-400 cursor-pointer shadow-sm"
            >
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t} className="bg-slate-900 text-slate-100">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={company.name}
              onChange={(e) => onChangeCompany({ ...company, name: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Industry Domain
            </label>
            <input
              type="text"
              value={company.industry}
              onChange={(e) => onChangeCompany({ ...company, industry: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Budget Input with INR & USD Selector + Multi-mode Entry + Interactive Slider */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40 shadow-lg space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-cyan-400" />
                Annual Security Budget Cap
              </label>

              <div className="flex items-center gap-2">
                {/* Mode toggle: In Lakhs / Full Amount */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setBudgetUnit('lakh');
                      setIsBudgetFocused(false);
                      const val = company.currency === 'INR'
                        ? (company.annualSecurityBudget / 100000).toString()
                        : (company.annualSecurityBudget / 1000).toString();
                      setBudgetText(val);
                    }}
                    className={`px-2 py-0.5 rounded transition ${
                      budgetUnit === 'lakh' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {company.currency === 'INR' ? 'In Lakhs (₹L)' : 'In $k'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBudgetUnit('raw');
                      setIsBudgetFocused(false);
                      setBudgetText(company.annualSecurityBudget.toLocaleString(company.currency === 'INR' ? 'en-IN' : 'en-US'));
                    }}
                    className={`px-2 py-0.5 rounded transition ${
                      budgetUnit === 'raw' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Full Amount
                  </button>
                </div>

                {/* Currency Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBudgetFocused(false);
                      onChangeCompany({ ...company, currency: 'INR', annualSecurityBudget: 1000000 });
                    }}
                    className={`px-2 py-0.5 text-xs font-mono rounded transition ${
                      company.currency === 'INR' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    INR (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBudgetFocused(false);
                      onChangeCompany({ ...company, currency: 'USD', annualSecurityBudget: 100000 });
                    }}
                    className={`px-2 py-0.5 text-xs font-mono rounded transition ${
                      company.currency === 'USD' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    USD ($)
                  </button>
                </div>
              </div>
            </div>

            {/* Input and Normalized Value Badge */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 font-mono font-bold text-sm text-slate-500">
                    {company.currency === 'INR' ? '₹' : '$'}
                  </span>
                  <input
                    type="text"
                    placeholder={
                      budgetUnit === 'lakh'
                        ? company.currency === 'INR' ? 'e.g. 10, 15.5, or 25L' : 'e.g. 100, 150, or 250k'
                        : 'e.g. 10,00,000'
                    }
                    value={budgetText}
                    onFocus={() => setIsBudgetFocused(true)}
                    onBlur={handleBudgetBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onChange={(e) => handleBudgetChange(e.target.value)}
                    className="w-full pl-8 pr-16 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-base font-bold focus:outline-none focus:border-cyan-400 shadow-inner"
                  />
                  <span className="absolute right-3 top-2.5 font-mono text-xs text-slate-400">
                    {budgetUnit === 'lakh' ? (company.currency === 'INR' ? 'Lakhs' : 'k USD') : ''}
                  </span>
                </div>

                {/* Instant Formatted Badge */}
                <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-right shrink-0 min-w-[140px]">
                  <span className="text-[10px] text-slate-500 uppercase block font-mono">Current Budget</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {company.currency === 'INR'
                      ? company.annualSecurityBudget >= 10000000
                        ? `₹${(company.annualSecurityBudget / 10000000).toFixed(2)} Cr`
                        : `₹${(company.annualSecurityBudget / 100000).toFixed(1)} Lakhs`
                      : `$${company.annualSecurityBudget.toLocaleString()}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {budgetUnit === 'lakh'
                    ? `Enter amount in Lakhs (e.g. 10 or 15.5), or type 1.5 Cr / 25L`
                    : `Enter exact numeric amount with or without commas`}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Raw: {company.currency === 'INR' ? '₹' : '$'}{company.annualSecurityBudget.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Interactive Range Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{company.currency === 'INR' ? '₹1L' : '$10k'}</span>
                <span className="text-cyan-400 font-semibold">Interactive Budget Slider</span>
                <span>{company.currency === 'INR' ? '₹50L' : '$500k'}</span>
              </div>
              <input
                type="range"
                min={company.currency === 'INR' ? 100000 : 10000}
                max={company.currency === 'INR' ? 5000000 : 500000}
                step={company.currency === 'INR' ? 50000 : 5000}
                value={company.annualSecurityBudget}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setIsBudgetFocused(false);
                  onChangeCompany({ ...company, annualSecurityBudget: val });
                }}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Increments & Quick Presets */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              {/* Quick Stepper */}
              <div className="flex items-center gap-1">
                <span className="text-slate-500 text-[10px] mr-1">Adjust:</span>
                {company.currency === 'INR' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(-100000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      -₹1L
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(100000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      +₹1L
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(500000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      +₹5L
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(-10000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      -$10k
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(10000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      +$10k
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetFocused(false);
                        adjustBudget(50000);
                      }}
                      className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium"
                    >
                      +$50k
                    </button>
                  </>
                )}
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 text-[10px]">Presets:</span>
                {company.currency === 'INR' ? (
                  <>
                    {[500000, 1000000, 1500000, 2000000, 2500000, 3500000].map((amt) => {
                      const isSel = company.annualSecurityBudget === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setIsBudgetFocused(false);
                            onChangeCompany({ ...company, annualSecurityBudget: amt });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                            isSel
                              ? 'bg-cyan-600 text-white shadow font-bold'
                              : 'bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300'
                          }`}
                        >
                          ₹{amt / 100000}L
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {[50000, 100000, 150000, 250000, 500000].map((amt) => {
                      const isSel = company.annualSecurityBudget === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setIsBudgetFocused(false);
                            onChangeCompany({ ...company, annualSecurityBudget: amt });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                            isSel
                              ? 'bg-cyan-600 text-white shadow font-bold'
                              : 'bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300'
                          }`}
                        >
                          ${amt / 1000}k
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Data Sensitivity Badges */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Data Sensitivity Handled
            </label>
            <div className="flex flex-wrap gap-2">
              {DATA_SENSITIVITIES.map((sens) => {
                const active = company.dataSensitivity.includes(sens);
                return (
                  <button
                    key={sens}
                    type="button"
                    onClick={() => toggleSensitivity(sens)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                      active
                        ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {sens}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Key Services & Important Assets */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <span>Key Business Services</span>
              <span className="text-[10px] text-slate-500">Toggle to customize</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SERVICES.map((srv) => {
                const active = company.keyServices.includes(srv);
                return (
                  <button
                    key={srv}
                    type="button"
                    onClick={() => toggleService(srv)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
                      active
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <Layers className="w-3 h-3 text-cyan-400" />
                    {srv}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <span>Critical Technology Assets</span>
              <span className="text-[10px] text-slate-500">Affects asset criticality multiplier</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_ASSETS.map((asset) => {
                const active = company.importantAssets.includes(asset);
                return (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => toggleAsset(asset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <Database className="w-3 h-3 text-emerald-400" />
                    {asset}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Submission Footer */}
      <div className="mt-8 pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">
          State flows deterministically to Stage 2 (Business Understanding LLM)
        </span>
        <button
          onClick={onAnalyzeBusiness}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 transition"
        >
          <Sparkles className="w-4 h-4" />
          Analyze Business Context
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
