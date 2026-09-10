'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Github,
  ArrowRight,
  Loader2,
  Info,
  Sparkles,
  Bot,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  CheckCircle2,
  Building2,
  FileCheck2,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { riskApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProtectedShell from '@/components/ProtectedShell';
import InvestmentOptimizer from '@/components/dashboard/InvestmentOptimizer';
import ConfidenceBreakdown, { EvidenceTrail } from '@/components/risk/ConfidenceBreakdown';
import FloatingNlpPanel from '@/components/assessment/FloatingNlpPanel';

const INDUSTRIES = [
  { key: 'technology', label: 'Technology' },
  { key: 'financial_services', label: 'Financial Services' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'retail', label: 'Retail' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'energy', label: 'Energy' },
  { key: 'education', label: 'Education' },
  { key: 'public_sector', label: 'Public Sector' },
  { key: 'global_average', label: 'Other / Not Sure' },
];

const CONTROL_OPTIONS = [
  { key: 'mfa_credential_attacks', label: 'MFA enforced org-wide' },
  { key: 'edr_endpoint_detection', label: 'EDR deployed' },
  { key: 'network_segmentation', label: 'Network segmentation' },
  { key: 'waf', label: 'WAF in front of public apps' },
  { key: 'critical_patch_sla_7d', label: '7-day critical patch SLA' },
];

interface AssessmentBucket {
  severity: string;
  count: number;
  subtotalExpectedAnnualLossUsd: number;
  subtotalValueAtRisk95Usd: number;
  evidence?: EvidenceTrail[];
}

interface ModelAnalysis {
  model: string;
  role: string;
  status: string;
  latency_ms: number;
  content: string;
  usage?: Record<string, any>;
}

interface AiAssessment {
  pipeline_version: string;
  total_latency_ms: number;
  models: {
    threat_triage: ModelAnalysis;
    financial_strategy: ModelAnalysis;
    technical_verification: ModelAnalysis;
  };
  ensemble_verdict: string;
  underwriter_assessment: {
    current_grade: string;
    post_control_grade: string;
    estimated_premium_discount_pct: number;
  };
}

interface AssessmentResult {
  totalExpectedAnnualLossUsd: number;
  totalValueAtRisk95Usd: number;
  containsIllustrativeData: boolean;
  note: string;
  buckets: AssessmentBucket[];
  ai_assessment?: AiAssessment;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function AssessmentPage() {
  const [industry, setIndustry] = useState('technology');
  const [criticality, setCriticality] = useState(0.5);
  const [counts, setCounts] = useState({ CRITICAL: 1, HIGH: 3, MEDIUM: 5, LOW: 8 });
  const [activeControls, setActiveControls] = useState<string[]>(['mfa_credential_attacks', 'waf']);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModelTab, setActiveModelTab] = useState<'synthesis' | 'triage' | 'strategy' | 'verification'>('synthesis');

  const toggleControl = (key: string) => {
    setActiveControls((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const runAssessment = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await riskApi.quickAssessment({
        industry,
        criticality,
        severity_counts: counts,
        active_control_keys: activeControls,
        narrate_with_ai: true,
        model_mode: 'ensemble',
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Assessment request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedShell>
      {/* Floating NLP Assistant Panel on the left */}
      <FloatingNlpPanel
        industry={industry}
        criticality={criticality}
        totalEalUsd={result?.totalExpectedAnnualLossUsd || 0}
        totalVar95Usd={result?.totalValueAtRisk95Usd || 0}
        counts={counts}
        activeControls={activeControls}
      />

      <div className="max-w-5xl mx-auto pb-16">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 font-mono text-xs text-accent-cyan border border-accent-cyan/30 bg-accent-cyan-soft rounded-full px-3.5 py-1.5">
              <DollarSign size={13} />
              Financial Risk Assessment
            </div>
            <div className="inline-flex items-center gap-1.5 font-mono text-xs text-purple-300 border border-purple-500/30 bg-purple-950/40 rounded-full px-3.5 py-1.5">
              <Layers size={13} />
              Tri-Model AI Pipeline (4.1 mini • 5.2 • 5.3 codex)
            </div>
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary">
            What is your cyber risk actually costing you?
          </h1>
          <p className="mt-2.5 text-text-secondary max-w-2xl leading-relaxed">
            Answer a few questions about your organization and open vulnerabilities. Our engine calculates
            deterministic FAIR Expected Annual Loss (EAL) and executes concurrent evaluations across
            <strong className="text-white"> gpt-4.1-mini</strong> (Threat Triage),
            <strong className="text-white"> gpt-5.2</strong> (Financial Strategy), and
            <strong className="text-white"> gpt-5.3-codex</strong> (Technical Verification).
          </p>
        </div>

        {/* Multi-Model Role Spec Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0 mt-0.5">
              <Zap size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white font-mono">gpt-4.1-mini</span>
                <span className="text-[9px] font-mono px-1 rounded bg-blue-500/20 text-blue-300">Tier 1</span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Rapid threat triage, sector breach prior ingestion & MITRE ATT&CK vector screening.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0 mt-0.5">
              <Cpu size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white font-mono">gpt-5.2</span>
                <span className="text-[9px] font-mono px-1 rounded bg-purple-500/20 text-purple-300">Tier 2</span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Strategic financial quantification, CISO board mandate & cyber insurance underwriting.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white font-mono">gpt-5.3-codex</span>
                <span className="text-[9px] font-mono px-1 rounded bg-emerald-500/20 text-emerald-300">Tier 3</span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Code-level technical control verification, hardening specs & CERT-In / DPDP audit.
              </p>
            </div>
          </div>
        </div>

        {/* Intake Questionnaire Form */}
        <Card className="p-6 border border-border-default bg-bg-card space-y-6">
          {/* Industry Selection */}
          <div>
            <label className="text-xs font-mono text-text-muted block mb-2 font-bold uppercase tracking-wider">
              1. Industry Sector
            </label>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => setIndustry(i.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    industry === i.key
                      ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan font-bold shadow-sm'
                      : 'border-border-default text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope Criticality */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-mono text-text-muted font-bold uppercase tracking-wider">
                2. Business Scope Criticality
              </label>
              <span className="text-xs font-mono text-accent-cyan font-bold">
                {Math.round(criticality * 100)}% Criticality Score
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={criticality}
              onChange={(e) => setCriticality(Number(e.target.value))}
              className="w-full accent-cyan-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Severity Issue Counts */}
          <div>
            <label className="text-xs font-mono text-text-muted block mb-2 font-bold uppercase tracking-wider">
              3. Estimated Open Vulnerabilities by Severity
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                <div key={sev} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span
                    className={`text-[11px] font-bold font-mono tracking-wide ${
                      sev === 'CRITICAL'
                        ? 'text-rose-400'
                        : sev === 'HIGH'
                        ? 'text-orange-400'
                        : sev === 'MEDIUM'
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {sev}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={counts[sev]}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [sev]: Math.max(0, Number(e.target.value)) }))
                    }
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-purple-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Active Controls */}
          <div>
            <label className="text-xs font-mono text-text-muted block mb-2 font-bold uppercase tracking-wider">
              4. Active Defensive Controls in Place
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTROL_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleControl(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    activeControls.includes(c.key)
                      ? 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald font-bold shadow-sm'
                      : 'border-border-default text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Run Action */}
          <div className="pt-2 flex items-center justify-between flex-wrap gap-4">
            <Button
              type="button"
              onClick={runAssessment}
              disabled={loading}
              className="gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg transition"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>Orchestrating Tri-Model AI Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Run Tri-Model Risk Assessment</span>
                </>
              )}
            </Button>

            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400" />
              <span>Orchestrates 4.1 mini + 5.2 + 5.3 codex concurrently</span>
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 font-mono">
              {error}
            </div>
          )}
        </Card>

        {/* Loading Visualizer State */}
        {loading && (
          <Card className="p-6 mt-6 border border-purple-500/30 bg-slate-900/90 text-center space-y-4 animate-pulse">
            <div className="flex justify-center items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <h3 className="font-bold text-base text-white">
                Computing Quantitative Exposure & Orchestrating 3 AI Models
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto text-xs font-mono text-slate-400">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-blue-500/30 text-blue-300">
                ⚡ gpt-4.1-mini: Triage & Vector Intake
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-purple-500/30 text-purple-300">
                🧠 gpt-5.2: FAIR Financial Reasoning
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-500/30 text-emerald-300">
                🛡️ gpt-5.3-codex: Code & Policy Verification
              </div>
            </div>
          </Card>
        )}

        {/* Assessment Results */}
        {result && (
          <div className="space-y-6 mt-6">
            {/* Deterministic Financial Card */}
            <Card className="p-6 border border-border-default bg-bg-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display text-xl font-bold text-text-primary flex items-center gap-2">
                    Quantitative Financial Exposure State
                    {result.containsIllustrativeData && (
                      <Badge tone="warning" dot>
                        Illustrative benchmark
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-text-secondary mt-1">
                    Deterministic FAIR model calculation (Industry baseline: {industry.replace('_', ' ').toUpperCase()})
                  </p>
                </div>

                <div className="flex gap-6 text-right">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
                      Expected Annual Loss (EAL)
                    </div>
                    <div className="text-2xl font-display font-bold text-text-primary">
                      {formatUsd(result.totalExpectedAnnualLossUsd)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-accent-cyan/30">
                    <div className="text-[10px] uppercase tracking-wide text-accent-cyan font-mono">
                      Catastrophic VaR (95%)
                    </div>
                    <div className="text-2xl font-display font-bold text-accent-cyan">
                      {formatUsd(result.totalValueAtRisk95Usd)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Severity Bucket Breakdown */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {result.buckets.map((b) => (
                  <div key={b.severity} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="flex justify-between items-center text-xs font-mono font-bold text-white">
                      <span>{b.severity}</span>
                      <span className="text-slate-400">×{b.count}</span>
                    </div>
                    <div className="text-sm font-mono font-black text-rose-400 mt-1">
                      {formatUsd(b.subtotalExpectedAnnualLossUsd)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      95% VaR: {formatUsd(b.subtotalValueAtRisk95Usd)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border-default flex items-start gap-2 text-xs text-text-muted font-sans">
                <Info size={14} className="mt-0.5 shrink-0 text-cyan-400" />
                <span>{result.note}</span>
              </div>
            </Card>

            {/* Tri-Model AI Intelligence Hub */}
            {result.ai_assessment && (
              <Card className="p-6 border border-purple-500/40 bg-[#0c1222] shadow-2xl space-y-6">
                {/* AI Section Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      <Cpu className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold">
                          Tri-Model Cyber Risk Intelligence
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                          {result.ai_assessment.pipeline_version}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white mt-0.5">
                        Multi-Perspective Assessment: Triage • Strategy • Verification
                      </h3>
                    </div>
                  </div>

                  {/* Underwriter Grade Pill */}
                  <div className="flex items-center gap-3 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-slate-400 uppercase">
                        Insurance Underwriter Grade
                      </div>
                      <div className="text-xs font-bold text-emerald-400 font-mono">
                        {result.ai_assessment.underwriter_assessment.current_grade}
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
                      -{result.ai_assessment.underwriter_assessment.estimated_premium_discount_pct}% Premium
                    </div>
                  </div>
                </div>

                {/* Model Navigation Tabs */}
                <div className="flex flex-wrap gap-2 p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <button
                    onClick={() => setActiveModelTab('synthesis')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-colors ${
                      activeModelTab === 'synthesis'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Layers size={13} />
                    <span>Ensemble Synthesis</span>
                  </button>

                  <button
                    onClick={() => setActiveModelTab('triage')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-colors ${
                      activeModelTab === 'triage'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Zap size={13} />
                    <span>Threat Triage (gpt-4.1-mini)</span>
                    {result.ai_assessment.models.threat_triage.latency_ms && (
                      <span className="text-[10px] opacity-75 font-normal">
                        {result.ai_assessment.models.threat_triage.latency_ms}ms
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveModelTab('strategy')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-colors ${
                      activeModelTab === 'strategy'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Cpu size={13} />
                    <span>Financial Strategy (gpt-5.2)</span>
                    {result.ai_assessment.models.financial_strategy.latency_ms && (
                      <span className="text-[10px] opacity-75 font-normal">
                        {result.ai_assessment.models.financial_strategy.latency_ms}ms
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveModelTab('verification')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-colors ${
                      activeModelTab === 'verification'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <ShieldCheck size={13} />
                    <span>Technical Verification (gpt-5.3-codex)</span>
                    {result.ai_assessment.models.technical_verification.latency_ms && (
                      <span className="text-[10px] opacity-75 font-normal">
                        {result.ai_assessment.models.technical_verification.latency_ms}ms
                      </span>
                    )}
                  </button>
                </div>

                {/* Active Tab Content Area */}
                <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/90 text-slate-100 min-h-[180px]">
                  {activeModelTab === 'synthesis' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-xs font-mono font-bold text-purple-300 uppercase">
                          Tri-Model Unified Executive Verdict
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Total Concurrency Latency: {result.ai_assessment.total_latency_ms}ms
                        </span>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                        {result.ai_assessment.ensemble_verdict}
                      </div>
                    </div>
                  )}

                  {activeModelTab === 'triage' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-blue-400 uppercase">
                            Tier 1: Threat Intake & Exposure Triage
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            {result.ai_assessment.models.threat_triage.model}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Status: {result.ai_assessment.models.threat_triage.status} ({result.ai_assessment.models.threat_triage.latency_ms}ms)
                        </span>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                        {result.ai_assessment.models.threat_triage.content}
                      </div>
                    </div>
                  )}

                  {activeModelTab === 'strategy' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-purple-400 uppercase">
                            Tier 2: Strategic Financial & Executive Quantification
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                            {result.ai_assessment.models.financial_strategy.model}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Status: {result.ai_assessment.models.financial_strategy.status} ({result.ai_assessment.models.financial_strategy.latency_ms}ms)
                        </span>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                        {result.ai_assessment.models.financial_strategy.content}
                      </div>
                    </div>
                  )}

                  {activeModelTab === 'verification' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                            Tier 3: Technical Control & Architecture Verification
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {result.ai_assessment.models.technical_verification.model}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Status: {result.ai_assessment.models.technical_verification.status} ({result.ai_assessment.models.technical_verification.latency_ms}ms)
                        </span>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                        {result.ai_assessment.models.technical_verification.content}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Evidence & Confidence Breakdown */}
            <Card className="p-6 border border-border-default bg-bg-card">
              <h3 className="font-display text-base font-bold text-text-primary mb-3">
                Evidence Trails & Citations
              </h3>
              <ConfidenceBreakdown evidence={result.buckets.flatMap((b) => b.evidence || [])} />
            </Card>

            {/* Investment Optimizer Integration */}
            <div className="mt-6">
              <InvestmentOptimizer />
            </div>
          </div>
        )}

        {/* Code Scanning Secondary Path */}
        <Card className="p-5 mt-8 border border-dashed border-border-default bg-bg-card/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Github size={18} className="text-text-muted" />
              <div>
                <div className="text-sm font-semibold text-text-primary">Have a codebase?</div>
                <div className="text-xs text-text-muted">
                  Scan with us for automated repo findings instead of self-reported counts — fully optional.
                </div>
              </div>
            </div>
            <Link href="/onboarding">
              <Button variant="secondary" className="text-xs font-mono gap-1.5 flex items-center">
                Scan with us <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </ProtectedShell>
  );
}
