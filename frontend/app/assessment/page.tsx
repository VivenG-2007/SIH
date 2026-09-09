'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DollarSign, Github, ArrowRight, Loader2, Info } from 'lucide-react';
import { riskApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProtectedShell from '@/components/ProtectedShell';
import InvestmentOptimizer from '@/components/dashboard/InvestmentOptimizer';
import ConfidenceBreakdown, { EvidenceTrail } from '@/components/risk/ConfidenceBreakdown';

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

interface AssessmentResult {
  totalExpectedAnnualLossUsd: number;
  totalValueAtRisk95Usd: number;
  containsIllustrativeData: boolean;
  note: string;
  buckets: AssessmentBucket[];
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function AssessmentPage() {
  const [industry, setIndustry] = useState('technology');
  const [criticality, setCriticality] = useState(0.5);
  const [counts, setCounts] = useState({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
  const [activeControls, setActiveControls] = useState<string[]>([]);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 font-mono text-xs text-accent-cyan border border-accent-cyan/30 bg-accent-cyan-soft rounded-full px-3.5 py-1.5">
            <DollarSign size={13} />
            Financial Risk Assessment
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-4 text-text-primary">
            What is your cyber risk actually costing you?
          </h1>
          <p className="mt-3 text-text-secondary max-w-2xl">
            Answer a few questions about your organization and known issues — no codebase
            required — and get a real Expected Annual Loss (EAL) and Value at Risk (VaR)
            figure, backed by cited industry data.
          </p>
        </div>

        <Card className="p-6 border border-border-default bg-bg-card space-y-6">
          <div>
            <label className="text-xs font-mono text-text-muted block mb-2">Industry</label>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => setIndustry(i.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    industry === i.key
                      ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                      : 'border-border-default text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-2">
              How business-critical is the assessed scope? ({Math.round(criticality * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={criticality}
              onChange={(e) => setCriticality(Number(e.target.value))}
              className="w-full max-w-md"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-2">
              Estimated open issues by severity
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                <div key={sev}>
                  <span className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
                    {sev}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={counts[sev]}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [sev]: Math.max(0, Number(e.target.value)) }))
                    }
                    className="w-full mt-1 bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-2">
              Controls already in place
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTROL_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleControl(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    activeControls.includes(c.key)
                      ? 'border-accent-emerald bg-accent-emerald/10 text-accent-emerald'
                      : 'border-border-default text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="button" onClick={runAssessment} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
            Get My Risk Assessment
          </Button>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </Card>

        {result && (
          <Card className="p-6 mt-6 border border-border-default bg-bg-card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="font-display text-lg font-bold text-text-primary flex items-center gap-2">
                Your Financial Exposure
                {result.containsIllustrativeData && <Badge tone="warning" dot>Illustrative data</Badge>}
              </h2>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
                    Expected Annual Loss
                  </div>
                  <div className="text-2xl font-display font-bold text-text-primary">
                    {formatUsd(result.totalExpectedAnnualLossUsd)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
                    Value at Risk (95%)
                  </div>
                  <div className="text-2xl font-display font-bold text-accent-cyan">
                    {formatUsd(result.totalValueAtRisk95Usd)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              {result.buckets.map((b) => (
                <div key={b.severity} className="flex justify-between text-xs font-mono text-text-secondary">
                  <span>{b.severity} × {b.count}</span>
                  <span>{formatUsd(b.subtotalExpectedAnnualLossUsd)} EAL</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border-default flex items-start gap-2 text-xs text-text-muted">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>{result.note}</span>
            </div>

            <ConfidenceBreakdown evidence={result.buckets.flatMap((b) => b.evidence || [])} />
          </Card>
        )}

        {result && (
          <div className="mt-6">
            <InvestmentOptimizer />
          </div>
        )}

        {/* Optional, secondary path — code scanning is an add-on, not a
            requirement to get a financial assessment. */}
        <Card className="p-5 mt-8 border border-dashed border-border-default bg-bg-card/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Github size={18} className="text-text-muted" />
              <div>
                <div className="text-sm font-semibold text-text-primary">Have a codebase?</div>
                <div className="text-xs text-text-muted">
                  Scan with us for scan-derived findings instead of self-reported counts —
                  fully optional.
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
