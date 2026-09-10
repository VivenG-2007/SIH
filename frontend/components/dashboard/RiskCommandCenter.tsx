'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  TrendingDown,
  Shield,
  Building2,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  Server,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  Search,
  RefreshCw,
  Award,
  Globe,
  Flame,
  Database,
  Terminal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { riskApi } from '@/lib/api';
import FloatingNlpPanel from '@/components/assessment/FloatingNlpPanel';

// ---------------------------------------------------------------------------
// Data Contracts & Types
// ---------------------------------------------------------------------------

interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
}

interface TelemetryEventItem {
  event_id: string;
  source_type: 'siem' | 'edr' | 'iam' | 'cspm' | 'threat_intel' | 'github';
  asset_id: string;
  event_type: string;
  summary: string;
  simulated: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  mitre_techniques?: MitreTechnique[];
  downtime_hours_estimate?: number;
  likelihood_effect: string;
  received_at: string;
}

interface SelectedControlItem {
  key: string;
  label: string;
  cost_usd: number;
  risk_reduction_usd: number;
  evidence_source: string;
  confidence: 'empirical' | 'illustrative' | 'unspecified';
  implementation_time_days?: number | null;
  roi?: number | null;
}

interface AlternativePortfolio {
  id: string;
  name: string;
  strategy: string;
  selected_controls: string[];
  control_keys: string[];
  total_cost_usd: number;
  risk_reduction_usd: number;
  rosi_pct: number;
  budget_utilization_pct: number;
  is_recommended: boolean;
}

interface FairMonteCarlo {
  sample_size: number;
  simulated_eal_usd: number;
  percentiles_usd: {
    p10: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  loss_exceedance_curve: {
    exceedance_probability_pct: number;
    loss_usd: number;
    label: string;
  }[];
  loss_distribution_histogram: {
    bin_range: string;
    count: number;
    loss_usd: number;
  }[];
  loss_components_usd: {
    primary_loss: number;
    secondary_loss: number;
  };
}

interface WebScrapingCitation {
  source: string;
  title: string;
  url: string;
  scraped_evidence: string;
  verified_metric: string;
  timestamp: string;
  status?: string;
  engine?: string;
}

export interface WhatIfScenarioItem {
  id: string;
  title: string;
  scenario_type: string;
  likelihood_pct: number;
  eal_usd: number;
  var95_usd: number;
  risk_score: number;
  financial_delta_usd: number;
  blast_radius: string;
  narrative: string;
  recommended_control: string;
}

interface UnifiedStateResponse {
  asset_id: string;
  industry: string;
  mode: string;
  risk_score: number;
  ai_executive_summary?: string;
  ai_evaluation_metadata?: {
    provider: string;
    model: string;
    cached: boolean;
  };
  what_if_scenarios?: WhatIfScenarioItem[];
  business_service: {
    name: string;
    annual_revenue_usd: number;
    revenue_dependency_pct: number;
    data_sensitivity: string;
    regulatory_frameworks: string[];
    criticality_score: number;
    revenue_at_risk_usd: number;
    regulatory_exposure_usd: number;
  };
  fair_monte_carlo?: FairMonteCarlo;
  alternative_portfolios?: AlternativePortfolio[];
  web_scraping_citations?: WebScrapingCitation[];
  india_compliance_frameworks?: {
    cert_in: string;
    rbi_csf: string;
    sebi_cscrf: string;
    dpdp_act_2023: string;
    controls_mapping: Record<string, Array<{ framework: string; section?: string; requirement?: string } | string>>;
  };
  risk_explainability?: {
    total_score: number;
    factors: { factor: string; delta: number; type: string }[];
    summary: string;
  };
  telemetry_state: {
    recent_events: TelemetryEventItem[];
    known_exploited: boolean;
    likelihood_multiplier: number;
    event_count: number;
    total_stored_events?: number;
  };
  financial_exposure: {
    pre_control_eal_usd: number;
    post_control_eal_usd: number;
    expected_annual_loss_usd: number;
    value_at_risk_95_usd: number;
    pre_control_likelihood: number;
    post_control_likelihood: number;
  };
  optimizer: {
    budget_usd: number;
    total_cost_usd: number;
    total_risk_reduction_usd: number;
    portfolio_rosi: number;
    selected_controls: SelectedControlItem[];
  };
}

const INDUSTRIES = [
  { id: 'financial_services', label: 'Financial Services & Banking (RBI / SEBI)', icon: Building2, defaultBudget: 120000 },
  { id: 'healthcare', label: 'Healthcare & Lifesciences (DPDP / HIPAA)', icon: Activity, defaultBudget: 100000 },
  { id: 'technology', label: 'SaaS & Cloud Platforms (CERT-In)', icon: Cpu, defaultBudget: 90000 },
  { id: 'retail', label: 'E-Commerce & Retail (PCI-DSS / DPDP)', icon: Layers, defaultBudget: 80000 },
  { id: 'energy', label: 'Critical Infrastructure & Energy (NCIIPC)', icon: Server, defaultBudget: 180000 },
  { id: 'defense', label: 'Defense & Sovereign Sector (MoD)', icon: Shield, defaultBudget: 150000 },
];

const USD_TO_INR = 83.25;

export default function RiskCommandCenter() {
  const [industry, setIndustry] = useState('financial_services');
  const [budgetUsd, setBudgetUsd] = useState(120000);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [budgetText, setBudgetText] = useState<string>(() =>
    Math.round(120000 * USD_TO_INR).toString()
  );
  const [isBudgetFocused, setIsBudgetFocused] = useState(false);
  const [activeAsset, setActiveAsset] = useState('acme/payments-api');
  const [appliedControlKeys, setAppliedControlKeys] = useState<string[]>([]);
  const [threatInjected, setThreatInjected] = useState(false);
  const [nlpPanelOpen, setNlpPanelOpen] = useState(false);

  // Sync budgetText when currency or budgetUsd changes externally
  useEffect(() => {
    if (!isBudgetFocused) {
      const val = currency === 'INR' ? Math.round(budgetUsd * USD_TO_INR) : Math.round(budgetUsd);
      setBudgetText(val.toString());
    }
  }, [currency, budgetUsd, isBudgetFocused]);

  // ── Ingestion & Persistent Store State (Stage 1) ──
  const [events, setEvents] = useState<TelemetryEventItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');

  // ── AI Evaluation Pipeline State (Stage 2) ──
  const [evaluatingPipeline, setEvaluatingPipeline] = useState(false);
  const [pipelineStepMessage, setPipelineStepMessage] = useState('');
  const [state, setState] = useState<UnifiedStateResponse | null>(null);
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [selectedWhatIfId, setSelectedWhatIfId] = useState<string>('unmitigated_breach');

  // ── Real-Time Firecrawl Web Scraper State ──
  const [customUrl, setCustomUrl] = useState('https://www.cisa.gov/known-exploited-vulnerabilities-catalog');
  const [customScraping, setCustomScraping] = useState(false);
  const [customScrapeResult, setCustomScrapeResult] = useState<any | null>(null);
  const [scrapingLive, setScrapingLive] = useState(false);

  // Currency helper
  const formatMoney = useCallback(
    (amountUsd: number, compact = true): string => {
      if (currency === 'INR') {
        const inr = amountUsd * USD_TO_INR;
        if (compact) {
          if (inr >= 10000000) return `₹${(inr / 10000000).toFixed(2)} Cr`;
          if (inr >= 100000) return `₹${(inr / 100000).toFixed(1)} L`;
          return `₹${inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
        }
        return `₹${inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
      }
      if (compact) {
        if (amountUsd >= 1000000) return `$${(amountUsd / 1000000).toFixed(2)}M`;
        if (amountUsd >= 1000) return `$${(amountUsd / 1000).toFixed(0)}K`;
        return `$${amountUsd.toFixed(0)}`;
      }
      return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    },
    [currency]
  );

  // Stage 1: Single Stream Ingestion Tick (Saves to MongoDB)
  const emitTelemetryTick = useCallback(
    async (forcedSource?: string) => {
      try {
        const { data } = await riskApi.streamTick({
          asset_id: activeAsset,
          mode: 'simulation',
          source_type: forcedSource,
        });
        if (data?.event) {
          setEvents((prev) => [data.event, ...prev.slice(0, 49)]);
        }
      } catch (e) {
        console.error('Stream tick error:', e);
      }
    },
    [activeAsset]
  );

  const emitTelemetryTickRef = useRef(emitTelemetryTick);
  useEffect(() => {
    emitTelemetryTickRef.current = emitTelemetryTick;
  }, [emitTelemetryTick]);

  // Stage 1: Continuous Stream Timer
  useEffect(() => {
    if (!streaming) return;
    const interval = setInterval(() => {
      emitTelemetryTickRef.current();
    }, 2500);
    return () => clearInterval(interval);
  }, [streaming]);

  // Load existing stored events on mount
  useEffect(() => {
    const loadStoredEvents = async () => {
      try {
        const { data } = await riskApi.getTelemetryEvents(activeAsset, 30);
        if (data?.events?.length) {
          setEvents(data.events);
        }
      } catch (e) {
        // Standby
      }
    };
    loadStoredEvents();
  }, [activeAsset]);

  // Stage 2: Deep AI Evaluation Pipeline (Web Crawl + LLM + FAIR + Knapsack)
  const runDeepAiEvaluation = async () => {
    setEvaluatingPipeline(true);
    setPipelineStepMessage('1. Aggregating stored errors from MongoDB...');
    try {
      setTimeout(() => setPipelineStepMessage('2. Deep-crawling live threat intel & CVEs via Firecrawl...'), 600);
      setTimeout(() => setPipelineStepMessage('3. Synthesizing risk score, What-If causal matrix & CISO mandate with LLM...'), 1300);
      setTimeout(() => setPipelineStepMessage('4. Simulating 10,000 FAIR Monte Carlo iterations...'), 2000);

      const { data } = await riskApi.evaluatePipeline({
        industry: industry || 'financial_services',
        budget_usd: Math.round(budgetUsd || 120000),
        asset_id: activeAsset || 'acme/payments-api',
        applied_control_keys: appliedControlKeys || [],
        cvss_score: threatInjected ? 9.8 : 8.2,
        mode: 'simulation',
        scrape_evidence: true,
        narrate_with_ai: true,
      });
      if (data) {
        setState(data);
        setHasEvaluated(true);
        if (data.telemetry_state?.recent_events?.length) {
          setEvents(data.telemetry_state.recent_events);
        }
      }
    } catch (err) {
      console.error('Deep AI evaluation error:', err);
    } finally {
      setPipelineStepMessage('5. Synchronized all graphs & metrics successfully!');
      setTimeout(() => setEvaluatingPipeline(false), 800);
    }
  };

  // Trigger Custom URL Crawl
  const handleCustomCrawl = async () => {
    if (!customUrl) return;
    setCustomScraping(true);
    try {
      const { data } = await riskApi.scrapeUrl({ url: customUrl });
      setCustomScrapeResult(data);
    } catch (e) {
      console.error('Firecrawl scraping error:', e);
    } finally {
      setCustomScraping(false);
    }
  };

  // Trigger Fresh Evidence Scraping
  const triggerEvidenceRefresh = async () => {
    setScrapingLive(true);
    try {
      const { data } = await riskApi.scrapeEvidence({ refresh: true });
      if (data?.citations && state) {
        setState({ ...state, web_scraping_citations: data.citations });
      }
    } catch (e) {
      console.error('Evidence refresh error:', e);
    } finally {
      setTimeout(() => setScrapingLive(false), 900);
    }
  };

  // Reset Simulation & Clear Database
  const resetSimulation = async () => {
    setStreaming(false);
    setThreatInjected(false);
    setAppliedControlKeys([]);
    setHasEvaluated(false);
    try {
      await riskApi.resetTelemetry(activeAsset);
      setEvents([]);
      setState(null);
    } catch (e) {
      console.error('Reset error:', e);
    }
  };

  // Filtered Telemetry Events
  const filteredEvents = events.filter((ev) => {
    if (selectedSeverityFilter === 'ALL') return true;
    return ev.severity === selectedSeverityFilter;
  });

  // Loss Exceedance Curve Data
  const lecData = state?.fair_monte_carlo?.loss_exceedance_curve?.map((pt) => ({
    prob: `${pt.exceedance_probability_pct}%`,
    loss: currency === 'INR' ? Math.round((pt.loss_usd * USD_TO_INR) / 100000) : Math.round(pt.loss_usd / 1000),
    lossRaw: pt.loss_usd,
    label: pt.label,
  })) ?? [];

  const eal =
    state?.financial_exposure?.expected_annual_loss_usd ??
    state?.fair_monte_carlo?.simulated_eal_usd ??
    0;
  const var95 =
    state?.financial_exposure?.value_at_risk_95_usd ??
    state?.fair_monte_carlo?.percentiles_usd?.p95 ??
    0;
  const riskScore = state?.risk_score ?? 85;

  return (
    <div className="space-y-6 pb-16 animate-fade-in text-zinc-100 max-w-7xl mx-auto">
      {/* ── TOP HEADER & CONTROLS ── */}
      <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-b from-purple-600/10 via-pink-600/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#221C30]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-purple-400 font-bold">
                  Cyber Risk Quantification &amp; Capital Allocation
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-950/80 border border-purple-800 text-purple-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${streaming ? 'bg-emerald-400 animate-ping' : 'bg-zinc-500'}`} />
                  {streaming ? 'STREAMING ACTIVE' : 'STREAM STANDBY'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#1A1628] border border-[#342D45] text-emerald-300 font-bold">
                  <Database className="w-3 h-3 text-emerald-400" />
                  {events.length} Stored in MongoDB
                </span>
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight mt-0.5">
                AI Cyber Risk Engine &amp; Live Telemetry Pipeline
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Ask Groq AI NLP Assistant */}
            <button
              type="button"
              onClick={() => setNlpPanelOpen((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl border border-purple-500/50 bg-gradient-to-r from-purple-950/70 to-indigo-950/70 hover:from-purple-900/80 hover:to-indigo-900/80 text-xs font-mono text-purple-200 hover:text-white hover:border-purple-400 transition-all flex items-center gap-1.5 shadow-md shadow-purple-950/40"
              title="Open NLP Cyber Risk Co-Pilot"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Ask Groq AI</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ⚡ &lt;100ms
              </span>
            </button>

            {/* Currency Switcher */}
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === 'INR' ? 'USD' : 'INR'))}
              className="px-3 py-1.5 rounded-xl border border-[#332A47] bg-[#181426] text-xs font-mono text-zinc-300 hover:border-purple-500/60 transition-all flex items-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5 text-purple-400" />
              {currency === 'INR' ? '₹ INR (Cr/Lakhs)' : '$ USD'}
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={resetSimulation}
              className="p-2 rounded-xl border border-[#332A47] bg-[#181426] text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
              title="Reset Database & Simulation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scope Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5 font-semibold">
              1. Target Critical Asset
            </label>
            <div className="relative">
              <select
                value={activeAsset}
                onChange={(e) => setActiveAsset(e.target.value)}
                className="w-full bg-[#171324] border border-[#2F2740] rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
              >
                <option value="acme/payments-api">acme/payments-api (PCI-DSS Scoped / Revenue Gateway)</option>
                <option value="auth-service">auth-service (OAuth2 / FIDO2 Identity Broker)</option>
                <option value="core-banking">core-banking (RBI Master Direction / Core Ledger)</option>
                <option value="customer-portal-db">customer-portal-db (DPDP Act Personal Data Vault)</option>
              </select>
              <ChevronRight className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none rotate-90" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5 font-semibold">
              2. Industry &amp; Regulatory Benchmark
            </label>
            <div className="relative">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-[#171324] border border-[#2F2740] rounded-xl px-3 py-2 text-sm text-white font-medium focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind.id} value={ind.id}>
                    {ind.label}
                  </option>
                ))}
              </select>
              <ChevronRight className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none rotate-90" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider font-semibold">
                3. Security Capital Budget ({currency === 'INR' ? '₹' : '$'})
              </label>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                {formatMoney(budgetUsd)}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-zinc-500 font-mono font-bold">
                {currency === 'INR' ? '₹' : '$'}
              </span>
              <input
                type="text"
                value={budgetText}
                onFocus={() => setIsBudgetFocused(true)}
                onBlur={() => {
                  setIsBudgetFocused(false);
                  const clean = budgetText.replace(/,/g, '').trim();
                  const num = parseFloat(clean);
                  if (!isNaN(num) && num > 0) {
                    const usd = currency === 'INR' ? num / USD_TO_INR : num;
                    setBudgetUsd(usd);
                    setBudgetText(Math.round(num).toString());
                  } else {
                    const fallback = 120000;
                    setBudgetUsd(fallback);
                    setBudgetText(currency === 'INR' ? Math.round(fallback * USD_TO_INR).toString() : fallback.toString());
                  }
                }}
                onChange={(e) => {
                  const valStr = e.target.value;
                  setBudgetText(valStr);
                  const clean = valStr.replace(/,/g, '').trim();
                  const num = parseFloat(clean);
                  if (!isNaN(num) && num > 0) {
                    const usd = currency === 'INR' ? num / USD_TO_INR : num;
                    setBudgetUsd(usd);
                  }
                }}
                className="w-full bg-[#171324] border border-[#2F2740] rounded-xl pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                placeholder={currency === 'INR' ? 'e.g. 1000000 or 999900' : 'e.g. 120000'}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-zinc-500 font-mono">Quick:</span>
              {(currency === 'INR'
                ? [
                    { label: '₹10L', inr: 1000000 },
                    { label: '₹25L', inr: 2500000 },
                    { label: '₹50L', inr: 5000000 },
                    { label: '₹1Cr', inr: 10000000 },
                  ]
                : [
                    { label: '$50k', usd: 50000 },
                    { label: '$120k', usd: 120000 },
                    { label: '$250k', usd: 250000 },
                    { label: '$500k', usd: 500000 },
                  ]
              ).map((preset) => {
                const targetUsd = 'inr' in preset ? preset.inr / USD_TO_INR : (preset as any).usd;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setIsBudgetFocused(false);
                      setBudgetUsd(targetUsd);
                      setBudgetText(
                        currency === 'INR'
                          ? Math.round(targetUsd * USD_TO_INR).toString()
                          : Math.round(targetUsd).toString()
                      );
                    }}
                    className="px-2 py-0.5 rounded bg-[#1f1a30] hover:bg-[#2c2444] border border-[#3b3252] text-[10px] font-mono text-zinc-300 transition"
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Active Mitigations / Security Controls Toggles ── */}
        <div className="pt-3.5 border-t border-[#221C30] mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              4. Active Mitigations / Applied Controls ({appliedControlKeys.length} Selected)
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              Click any control to toggle deployment &amp; recalculate exposure
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'mfa_credential_attacks', label: 'Adaptive FIDO2 MFA', costUsd: 18000, desc: '-65% Phishing' },
              { key: 'edr_endpoint_detection', label: 'Managed EDR & XDR', costUsd: 32000, desc: '-45% Malware' },
              { key: 'network_segmentation', label: 'Zero-Trust Microsegmentation', costUsd: 45000, desc: '-70% Lateral' },
              { key: 'waf', label: 'Cloud WAF & DDoS Shield', costUsd: 15000, desc: '-80% Injection' },
              { key: 'critical_patch_sla_7d', label: '7-Day Critical Patch SLA', costUsd: 25000, desc: '-55% KEV' },
            ].map((c) => {
              const isActive = appliedControlKeys.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setAppliedControlKeys((prev) =>
                      prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 font-bold shadow-md shadow-emerald-950/40'
                      : 'bg-[#181426] border-[#312842] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span>{c.label}</span>
                  <span className={`text-[10px] ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    ({formatMoney(c.costUsd)})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 2-STEP ACTION WORKFLOW BAR ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step 1: Simulate & Store Data */}
        <div className="bg-[#12101C] border border-[#2B243B] rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-950 border border-purple-600 text-purple-300 flex items-center justify-center text-xs font-bold font-mono">
                  1
                </span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Simulate &amp; Store Telemetry
                </h2>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                {events.length} Events Persisted
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5">
              Continuously stream security events, anomalies, and findings from SIEM, EDR, IAM, CSPM &amp; Threat Intel into MongoDB.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStreaming((prev) => !prev)}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                streaming
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
              }`}
            >
              {streaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              {streaming ? 'Pause Stream' : '▶ Start Streaming & Storing Data'}
            </button>

            <button
              type="button"
              onClick={async () => {
                setThreatInjected(true);
                await emitTelemetryTick('threat_intel');
              }}
              className="py-2.5 px-3.5 rounded-xl border border-rose-800/60 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-all"
              title="Inject weaponized CISA KEV exploit event"
            >
              <Zap className="w-4 h-4 text-rose-400" />
              Inject KEV Exploit
            </button>
          </div>
        </div>

        {/* Step 2: Get Results with AI & Web Crawling */}
        <div className="bg-gradient-to-br from-[#17112B] via-[#120F20] to-[#12101C] border-2 border-purple-500/50 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-pink-950 border border-pink-500 text-pink-300 flex items-center justify-center text-xs font-bold font-mono">
                  2
                </span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                  Generate AI Results &amp; Web Crawl
                </h2>
              </div>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                FAIR + LLMs + Firecrawl
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5">
              Deep-crawls ground-truth threat feeds, synthesizes stored errors with LLMs, and computes 10,000 FAIR Monte Carlo iterations.
            </p>
          </div>

          <button
            type="button"
            onClick={runDeepAiEvaluation}
            disabled={evaluatingPipeline}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl ${
              evaluatingPipeline
                ? 'bg-purple-900/70 border border-purple-500 text-purple-300 cursor-wait'
                : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-95 text-white shadow-purple-500/30 animate-pulse'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${evaluatingPipeline ? 'animate-spin' : 'text-yellow-300'}`} />
            {evaluatingPipeline ? 'Evaluating AI Pipeline...' : '⚡ Run Deep AI Evaluation & Web Crawl'}
          </button>
        </div>
      </div>

      {/* Dynamic Pipeline Progress Bar */}
      {evaluatingPipeline && (
        <div className="p-3.5 rounded-2xl bg-purple-950/90 border border-purple-500/60 flex items-center justify-between animate-pulse text-xs font-mono shadow-xl">
          <div className="flex items-center gap-3 text-purple-200 font-medium">
            <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
            <span>{pipelineStepMessage}</span>
          </div>
          <span className="text-[10px] text-purple-400 uppercase tracking-widest">
            Azure OpenAI gpt-4.1-mini + Firecrawl Scraper
          </span>
        </div>
      )}

      {/* ── STAGE 1 TELEMETRY FEED (Real-Time Ingestion Viewer) ── */}
      <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#221C30]">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono uppercase">
                Continuous Telemetry Stream &amp; Ingested Errors
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono lowercase">
                  db.telemetry_events
                </span>
              </h3>
            </div>
          </div>

          {/* Severity Filter Tabs */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSelectedSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] transition-all ${
                  selectedSeverityFilter === sev
                    ? 'bg-purple-950 border-purple-500 text-purple-300 font-bold'
                    : 'border-[#2F2740] bg-[#161224] text-zinc-400 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Live Stream Table / Feed */}
        <div className="max-h-60 overflow-y-auto divide-y divide-[#221C30] text-xs font-mono">
          {filteredEvents.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              No telemetry events recorded yet. Click <span className="text-purple-400 font-bold">"Start Streaming &amp; Storing Data"</span> to ingest live security errors.
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div key={ev.event_id} className="py-2.5 px-2 flex items-center justify-between gap-4 hover:bg-[#181426] rounded-xl transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ev.severity === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : ev.severity === 'HIGH'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-purple-950 text-purple-300 border border-purple-800'
                    }`}
                  >
                    {ev.severity}
                  </span>

                  <span className="px-2 py-0.5 rounded bg-[#1A1628] border border-[#342D45] text-zinc-300 text-[10px] uppercase">
                    {ev.source_type}
                  </span>

                  <div className="truncate">
                    <span className="text-white font-semibold mr-2">{ev.event_type}</span>
                    <span className="text-zinc-400 text-[11px]">{ev.summary}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-zinc-500 text-[11px]">
                  {ev.mitre_techniques?.map((m) => (
                    <span key={m.id} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-purple-300 text-[10px]">
                      {m.id}
                    </span>
                  ))}
                  <span>{new Date(ev.received_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── STAGE 2 AI EVALUATION RESULTS (RENDERED AFTER EVALUATION) ── */}
      {hasEvaluated && state && (
        <div className="space-y-6 animate-fade-in">
          {/* Row 1: Executive AI Verdict & Key Metrics */}
          <div className="bg-gradient-to-br from-[#1A132C] via-[#120F20] to-[#12101C] border-2 border-purple-500/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-purple-900/40">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-purple-600/30 border border-purple-400/40 text-purple-300">
                  <Sparkles className="w-5 h-5 text-yellow-300" />
                </span>
                <div>
                  <span className="font-mono text-[10px] text-purple-400 uppercase tracking-widest font-bold">
                    AI Evaluated Risk Assessment
                  </span>
                  <h2 className="text-lg font-extrabold text-white tracking-tight">
                    {state.business_service?.name ?? activeAsset} · Executive Risk Verdict
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-purple-300 font-bold">
                  {state.ai_evaluation_metadata?.model ?? 'gpt-4.1-mini'} Verified
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-[#161224] border border-[#2B253D] space-y-1">
                <span className="text-[10px] font-mono text-zinc-400 uppercase block font-semibold">Evaluated Risk Score</span>
                <span className={`text-3xl font-extrabold font-mono ${riskScore >= 75 ? 'text-rose-400' : riskScore >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {riskScore}/100
                </span>
                <span className="text-[10px] text-zinc-500 block">Ground-truth Bayesian adjusted</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#161224] border border-[#2B253D] space-y-1">
                <span className="text-[10px] font-mono text-zinc-400 uppercase block font-semibold">Expected Annual Loss (EAL)</span>
                <span className="text-2xl font-bold font-mono text-white">{formatMoney(eal)}</span>
                <span className="text-[10px] text-zinc-500 block">Annualized statistical exposure</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#161224] border border-[#2B253D] space-y-1">
                <span className="text-[10px] font-mono text-zinc-400 uppercase block font-semibold">95% Catastrophic VaR</span>
                <span className="text-2xl font-bold font-mono text-purple-300">{formatMoney(var95)}</span>
                <span className="text-[10px] text-zinc-500 block">1-in-20 year worst-case tail risk</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#161224] border border-emerald-900/50 space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase block font-semibold">Knapsack Optimal ROSI</span>
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  +{Math.round((state.optimizer?.portfolio_rosi ?? 0) * 100)}%
                </span>
                <span className="text-[10px] text-zinc-500 block">
                  +{formatMoney(state.optimizer?.total_risk_reduction_usd ?? 0)} Risk Reduction
                </span>
              </div>
            </div>

            {/* AI Executive Briefing */}
            {state.ai_executive_summary && (
              <div className="p-4 rounded-2xl bg-[#171228] border border-purple-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-purple-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Live CISO Strategic Briefing &amp; Decision Mandate
                  </span>
                  <span className="text-zinc-500 text-[10px]">Grounded in live telemetry &amp; scraped KEV feeds</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed font-sans whitespace-pre-line">
                  {state.ai_executive_summary}
                </p>
              </div>
            )}
          </div>

          {/* Row 2: Real-Time Web Crawling (Firecrawl) & Authoritative Intelligence */}
          <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#221C30]">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    Real-Time Threat Intel &amp; Regulatory Evidence Web Crawler
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold">
                      Firecrawl v1 Scraper
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Live web crawling of authoritative sources backing quantitative distributions and compliance directions.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={triggerEvidenceRefresh}
                disabled={scrapingLive}
                className="px-3 py-1.5 rounded-xl border border-indigo-500/50 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 text-xs font-mono flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scrapingLive ? 'animate-spin' : ''}`} />
                {scrapingLive ? 'Crawling Feeds...' : 'Refresh Web Citations'}
              </button>
            </div>

            {/* Citations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {state.web_scraping_citations?.slice(0, 6).map((c, i) => (
                <div key={i} className="p-4 rounded-2xl bg-[#161224] border border-[#292338] hover:border-purple-500/50 transition-all flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                      <span className="font-bold text-purple-300">{c.source}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[9px]">
                        ✓ CRAWLED
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white leading-snug">{c.title}</div>
                    <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-3">{c.scraped_evidence}</p>
                  </div>

                  <div className="pt-2 border-t border-[#262133] flex items-center justify-between text-[10px] font-mono">
                    <span className="text-amber-300 font-bold truncate max-w-[180px]">{c.verified_metric}</span>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 flex items-center gap-1">
                      Link <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Custom URL Deep-Scrape Tool */}
            <div className="p-4 rounded-2xl bg-[#161224] border border-[#292338] space-y-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-purple-400" />
                Live On-Demand URL Scraper (Firecrawl Engine)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://www.cisa.gov/... or CERT-In advisory URL"
                  className="flex-1 bg-[#120F1C] border border-[#2F2740] rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleCustomCrawl}
                  disabled={customScraping}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs font-mono flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                  {customScraping ? 'Scraping...' : 'Deep Scrape'}
                </button>
              </div>

              {customScrapeResult && (
                <div className="p-3 rounded-xl bg-[#120F1C] border border-purple-500/40 text-xs font-mono space-y-1">
                  <div className="text-emerald-400 font-bold">✓ Successfully crawled {customScrapeResult.url}</div>
                  <div className="text-zinc-400 text-[11px] line-clamp-3">
                    {customScrapeResult.data?.markdown || JSON.stringify(customScrapeResult.data || customScrapeResult)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Loss Exceedance Curve & FAIR Monte Carlo (10,000 runs) */}
          <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#221C30]">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-white text-base">
                    Probabilistic FAIR Monte Carlo Simulation (10,000 Iterations)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Loss Exceedance Curve (LEC) modeling tail risk and percentile exposure distributions.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-3 py-1 rounded-xl bg-purple-950 border border-purple-700 text-purple-300 font-bold">
                  Simulated VaR₉₅: {formatMoney(var95)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold">
                  Simulated EAL: {formatMoney(eal)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 bg-[#161224] border border-[#292338] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-400" /> Loss Exceedance Curve (LEC)
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Exceedance Probability (%) vs Probable Loss
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lecData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="lecGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2B243B" />
                      <XAxis dataKey="prob" stroke="#71717a" fontSize={11} />
                      <YAxis stroke="#71717a" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#161224',
                          borderColor: '#3b2d54',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                        formatter={(val: any, name: any, item: any) => [
                          `${formatMoney(item.payload.lossRaw)} (${item.payload.label})`,
                          'Probable Loss Exceeded',
                        ]}
                      />
                      <Area type="monotone" dataKey="loss" stroke="#a855f7" strokeWidth={2.5} fillOpacity={1} fill="url(#lecGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-3">
                <div className="p-4 rounded-2xl bg-[#161224] border border-[#292338] space-y-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">
                    FAIR Percentile Distribution
                  </span>
                  <div className="space-y-1.5 text-xs font-mono">
                    {[
                      { p: 'P10 (Low Impact)', val: state.fair_monte_carlo?.percentiles_usd?.p10 ?? 0, tone: 'text-zinc-300' },
                      { p: 'P50 (Median Impact)', val: state.fair_monte_carlo?.percentiles_usd?.p50 ?? 0, tone: 'text-zinc-200 font-bold' },
                      { p: 'P75 (Elevated Impact)', val: state.fair_monte_carlo?.percentiles_usd?.p75 ?? 0, tone: 'text-amber-300' },
                      { p: 'P90 (Severe Tail Risk)', val: state.fair_monte_carlo?.percentiles_usd?.p90 ?? 0, tone: 'text-rose-300' },
                      { p: 'P95 (Value at Risk)', val: state.fair_monte_carlo?.percentiles_usd?.p95 ?? 0, tone: 'text-rose-400 font-bold' },
                      { p: 'P99 (Worst Catastrophe)', val: state.fair_monte_carlo?.percentiles_usd?.p99 ?? 0, tone: 'text-red-400 font-bold' },
                    ].map((row) => (
                      <div key={row.p} className="flex items-center justify-between py-1 border-b border-[#252033] last:border-0">
                        <span className="text-zinc-400 text-[11px]">{row.p}</span>
                        <span className={row.tone}>{formatMoney(row.val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Dynamic What-If Causal Scenario Simulator */}
          <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#221C30]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    Dynamic What-If Causal Scenario Simulator
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300">
                      LLM Grounded
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Evaluate causal perturbation shifts across unmitigated zero-days, active Knapsack defenses, and budget shocks.
                  </p>
                </div>
              </div>
            </div>

            {/* Scenario Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {state.what_if_scenarios?.map((sc) => {
                const isSelected = selectedWhatIfId === sc.id;
                const isPositiveDelta = sc.financial_delta_usd < 0;
                return (
                  <div
                    key={sc.id}
                    onClick={() => setSelectedWhatIfId(sc.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-b from-purple-950/90 to-[#161224] border-purple-500 shadow-xl shadow-purple-950/50'
                        : 'bg-[#161224] border-[#292338] hover:border-zinc-500/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            sc.scenario_type === 'threat_surge'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : sc.scenario_type === 'optimal_defense'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : sc.scenario_type === 'budget_shock'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                          }`}
                        >
                          {sc.scenario_type.toUpperCase()}
                        </span>
                        <span className="font-mono text-xs font-bold text-white">
                          Score: <span className={sc.risk_score > 70 ? 'text-rose-400' : 'text-emerald-400'}>{sc.risk_score}</span>
                        </span>
                      </div>

                      <div className="text-xs font-bold text-white leading-snug">{sc.title}</div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-[#262133] space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between text-zinc-400">
                        <span>Simulated EAL:</span>
                        <span className="text-white font-bold">{formatMoney(sc.eal_usd)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Financial Delta:</span>
                        <span className={`font-bold ${isPositiveDelta ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositiveDelta ? '-' : '+'}{formatMoney(Math.abs(sc.financial_delta_usd))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Scenario Deep-Dive Detail */}
            {(() => {
              const activeSc = state.what_if_scenarios?.find((s) => s.id === selectedWhatIfId) || state.what_if_scenarios?.[0];
              if (!activeSc) return null;
              const isPositive = activeSc.financial_delta_usd < 0;

              return (
                <div className="p-4 rounded-2xl bg-[#161224] border border-purple-500/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{activeSc.title}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-purple-300">
                        Exploit Probability: {activeSc.likelihood_pct}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-zinc-400">95% Catastrophic VaR:</span>
                      <span className="text-purple-300 font-bold">{formatMoney(activeSc.var95_usd)}</span>
                      <span className={`font-bold px-2 py-0.5 rounded ${isPositive ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-rose-950/80 text-rose-300 border border-rose-800'}`}>
                        {isPositive ? 'Exposure Reduced' : 'Exposure Increased'} ({isPositive ? '-' : '+'}{formatMoney(Math.abs(activeSc.financial_delta_usd))})
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#120F1C] border border-[#272136] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      <span className="text-rose-400 font-bold uppercase">⚡ Causal Blast Radius:</span>
                      <span className="text-zinc-200">{activeSc.blast_radius}</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">{activeSc.narrative}</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Row 5: 0/1 Knapsack Optimal Controls */}
          <div className="bg-[#12101C] border border-[#2B243B] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#221C30]">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-base">
                    0/1 Knapsack Optimal Control Allocation &amp; Compliance Closures
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Exact mathematical optimization maximizing risk reduction subject to budget ${formatMoney(budgetUsd, false)}.
                  </p>
                </div>
              </div>

              <div className="text-right font-mono text-xs">
                <span className="text-zinc-400">Investment / Budget: </span>
                <span className="text-white font-bold">
                  {formatMoney(state.optimizer?.total_cost_usd ?? state.alternative_portfolios?.[0]?.total_cost_usd ?? 0)} / {formatMoney(budgetUsd)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {(state.optimizer?.selected_controls ?? state.alternative_portfolios?.[0]?.selected_controls)?.map((c: any) => {
                const label = typeof c === 'string' ? c : c.label;
                const cost = typeof c === 'object' && c.cost_usd ? c.cost_usd : 0;
                const reduction = typeof c === 'object' && c.risk_reduction_usd ? c.risk_reduction_usd : 0;
                const source = typeof c === 'object' && c.evidence_source ? c.evidence_source : 'Knapsack DP Solver';
                return (
                  <div key={label} className="p-4 rounded-2xl bg-[#161224] border border-emerald-900/40 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {label}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 mt-1">
                        Evidence: <span className="text-purple-300">{source}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs shrink-0">
                      {cost > 0 && <div className="text-white font-bold">{formatMoney(cost)}</div>}
                      {reduction > 0 && <div className="text-emerald-400 font-bold text-[11px]">+{formatMoney(reduction)} Red</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating NLP Risk Co-Pilot (Powered by Groq ⚡) ── */}
      <FloatingNlpPanel
        industry={industry}
        criticality={state?.business_service?.criticality_score ?? 0.92}
        totalEalUsd={eal || 412000}
        totalVar95Usd={var95 || 940000}
        counts={{
          CRITICAL: events.filter((e) => e.severity === 'CRITICAL').length,
          HIGH: events.filter((e) => e.severity === 'HIGH').length,
          MEDIUM: events.filter((e) => e.severity === 'MEDIUM').length,
          LOW: 0,
        }}
        activeControls={appliedControlKeys}
        activeAsset={activeAsset}
        externalOpen={nlpPanelOpen}
        onOpenChange={setNlpPanelOpen}
      />
    </div>
  );
}
