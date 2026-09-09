'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Loader2,
  PlayCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import ProtectedShell from '@/components/ProtectedShell';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { simulationApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types — mirror app/routers/simulation.py's response shapes exactly
// (camelCase, same field names). Every figure rendered on this page comes
// from a real backend call against a real, already-scanned repo's
// findings — there is no client-side risk arithmetic here beyond display
// formatting.
// ---------------------------------------------------------------------------

interface AttackPathStage { stageId: string; label: string; status: string; findingCount: number; ealUsd: number }
interface AttackPathResult { stages: AttackPathStage[]; unclassifiedFindingCount: number; unclassifiedEalUsd: number }
interface VarDistribution { method: string; p50Usd: number; p75Usd: number; p90Usd: number; p95Usd: number; p99Usd: number; sampleSize: number }
interface SelectedControl {
  key: string; label: string; costUsd: number; riskReductionUsd: number; roi: number | null;
  evidenceSource: string; confidence: string; implementationTimeDays: number | null;
}
interface TierResult {
  currentRiskScore: number; simulatedRiskScore: number;
  currentEalUsd: number; simulatedEalUsd: number;
  currentVar95Usd: number; simulatedVar95Usd: number;
  riskReductionPct: number; ealReductionUsd: number;
  selectedControls: SelectedControl[];
  totalCostUsd: number; budgetUtilizationPct: number;
  unevidencedCandidateCount: number;
  currentAttackPath: AttackPathResult; simulatedAttackPath: AttackPathResult;
  varDistribution: VarDistribution;
}
interface PricedCandidate {
  key: string; label: string; costUsd: number; riskReductionUsd: number; roi: number | null;
  evidenceSource: string; confidence: string; implementationTimeDays: number | null;
}
interface RunSimulationResponse {
  simulationId: string; scanId: string; repo: string; name: string; environment: string; budgetUsd: number;
  currentRiskScore: number; simulatedRiskScore: number; currentEalUsd: number; simulatedEalUsd: number; riskReductionPct: number;
  selectedControlKeys: string[]; pricedCandidates: PricedCandidate[];
  tiers: { current: TierResult; patch_criticals: TierResult; recommended: TierResult; maximum: TierResult };
  aiNarrative: string | null;
}
type WhatIfResponse = TierResult & { excludedControlKeys: string[] };

function formatLakh(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function formatLakhTooltip(value: number | string | readonly (number | string)[] | undefined): string {
  if (typeof value === 'number') return formatLakh(value);
  if (typeof value === 'string') return formatLakh(Number(value) || 0);
  if (value === undefined) return '';
  return String(value);
}

const STATUS_COLOR: Record<string, string> = {
  critical: '#F43F5E', high: '#F97316', medium: '#EAB308', low: '#22C55E', clear: '#22C55E',
};
const STATUS_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', clear: '🟢',
};

function riskBand(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Critical', color: '#F43F5E' };
  if (score >= 40) return { label: 'Medium', color: '#EAB308' };
  return { label: 'Low', color: '#22C55E' };
}

function SimulationPageInner() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get('scanId') || '';
  const repoParam = searchParams.get('repo') || '';

  const [name, setName] = useState('Q4 Security Investment Plan');
  const [environment, setEnvironment] = useState('production');
  const [budget, setBudget] = useState(1_000_000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunSimulationResponse | null>(null);

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [liveResult, setLiveResult] = useState<WhatIfResponse | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const runSimulation = useCallback(async () => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    setLiveResult(null);
    try {
      const { data } = await simulationApi.run({
        scan_id: scanId,
        name,
        environment,
        budget_usd: budget,
        narrate_with_ai: true,
      });
      setResult(data);
      setCheckedKeys(new Set<string>(data.selectedControlKeys));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Simulation failed to run.');
    } finally {
      setLoading(false);
    }
  }, [scanId, name, environment, budget]);

  const recalculate = useCallback(async (nextChecked: Set<string>) => {
    if (!result) return;
    setRecalcLoading(true);
    try {
      const excluded = result.pricedCandidates
        .map((c) => c.key)
        .filter((k) => !nextChecked.has(k));
      const { data } = await simulationApi.whatIf({
        scan_id: scanId,
        budget_usd: budget,
        excluded_control_keys: excluded,
      });
      setLiveResult(data);
    } catch {
      // Live recalc is a nice-to-have on top of the last full run — a
      // transient failure here shouldn't block the page.
    } finally {
      setRecalcLoading(false);
    }
  }, [result, scanId, budget]);

  const toggleCandidate = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      recalculate(next);
      return next;
    });
  };

  const applyRecommended = () => {
    if (!result) return;
    const next = new Set<string>(result.tiers.recommended.selectedControls.map((c) => c.key));
    setCheckedKeys(next);
    recalculate(next);
  };

  const active: TierResult | null = liveResult ?? result?.tiers.recommended ?? null;

  if (!scanId) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <AlertTriangle className="mx-auto text-amber-400 mb-3" size={28} />
        <h1 className="font-display text-lg font-bold text-text-primary mb-2">No scan selected</h1>
        <p className="text-sm text-text-muted mb-6">
          Risk simulations run against a real, already-scanned repository&apos;s findings — there&apos;s
          no synthetic-data mode. Run a scan first, then open a simulation from there.
        </p>
        <Link href="/scanner">
          <Button type="button" className="text-xs font-mono">Go to Scanner</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan">
          <Activity size={20} />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-text-primary">Risk Simulation</h1>
          <p className="text-sm text-text-muted mt-1">
            {repoParam || 'This repo'}&apos;s real scanned findings — Observe → Quantify → Optimize, against a
            real 0/1-knapsack investment optimizer, not a mock.
          </p>
        </div>
      </div>

      {/* Simulation controls */}
      <Card className="p-5 border border-border-default bg-bg-card space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">Simulation name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">Environment</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-mono text-text-muted block mb-2">
            Budget ({formatLakh(budget)})
          </label>
          <input
            type="range" min={0} max={2_500_000} step={10_000}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-text-muted font-mono mt-1">
            <span>₹0</span><span>₹25L</span>
          </div>
        </div>

        <Button type="button" onClick={runSimulation} disabled={loading} className="gap-2 text-xs font-mono flex items-center">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          <span>Optimize My {formatLakh(budget)} Budget</span>
        </Button>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </Card>

      {result && active && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Current Risk', value: `${result.tiers.current.currentRiskScore}/100`, sub: riskBand(result.tiers.current.currentRiskScore).label, color: riskBand(result.tiers.current.currentRiskScore).color },
              { label: 'Current EAL', value: formatLakh(result.tiers.current.currentEalUsd), sub: '/ year' },
              { label: 'Simulated Risk', value: `${active.simulatedRiskScore}/100`, sub: riskBand(active.simulatedRiskScore).label, color: riskBand(active.simulatedRiskScore).color },
              { label: 'Risk Reduction', value: `${(active.riskReductionPct * 100).toFixed(1)}%`, sub: `↓ ${formatLakh(active.ealReductionUsd)}`, color: '#22C55E' },
            ].map((kpi) => (
              <Card key={kpi.label} className="p-4 border border-border-default bg-bg-card">
                <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono mb-1">{kpi.label}</div>
                <div className="font-display text-xl font-bold" style={{ color: kpi.color || 'var(--foreground)' }}>{kpi.value}</div>
                {kpi.sub && <div className="text-[11px] text-text-muted mt-0.5" style={{ color: kpi.color }}>{kpi.sub}</div>}
              </Card>
            ))}
          </div>

          {/* Scenario comparison chart + table */}
          <Card className="p-5 border border-border-default bg-bg-card">
            <h2 className="font-display text-sm font-bold text-text-primary mb-3">Scenario Comparison</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(['current', 'patch_criticals', 'recommended', 'maximum'] as const).map((tier) => ({
                    tier: tier === 'patch_criticals' ? 'Patch Criticals' : tier[0].toUpperCase() + tier.slice(1),
                    ealUsd: result.tiers[tier].simulatedEalUsd,
                    costUsd: result.tiers[tier].totalCostUsd,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="tier" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => formatLakh(v)} />
                  <Tooltip
                    formatter={formatLakhTooltip}
                    contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="ealUsd" radius={[4, 4, 0, 0]}>
                    {(['current', 'patch_criticals', 'recommended', 'maximum'] as const).map((tier, i) => (
                      <Cell key={i} fill={tier === 'current' ? '#F43F5E' : tier === 'recommended' ? '#06B6D4' : '#22C55E'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="text-text-muted border-b border-border-default">
                  <th className="text-left font-mono font-normal py-1.5">Scenario</th>
                  <th className="text-right font-mono font-normal">Investment</th>
                  <th className="text-right font-mono font-normal">Risk</th>
                  <th className="text-right font-mono font-normal">EAL</th>
                </tr>
              </thead>
              <tbody>
                {(['current', 'patch_criticals', 'recommended', 'maximum'] as const).map((tier) => (
                  <tr key={tier} className="border-b border-border-default/50">
                    <td className="py-1.5 text-text-primary">{tier === 'patch_criticals' ? 'Patch Criticals' : tier[0].toUpperCase() + tier.slice(1)}</td>
                    <td className="text-right font-mono text-text-secondary">{formatLakh(result.tiers[tier].totalCostUsd)}</td>
                    <td className="text-right font-mono text-text-secondary">{result.tiers[tier].simulatedRiskScore}</td>
                    <td className="text-right font-mono text-text-secondary">{formatLakh(result.tiers[tier].simulatedEalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Investment selector */}
          <Card className="p-5 border border-border-default bg-bg-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold text-text-primary">Security Investments</h2>
              {recalcLoading && <Loader2 size={13} className="animate-spin text-text-muted" />}
            </div>
            <div className="space-y-2">
              {result.pricedCandidates.map((c) => (
                <label key={c.key} className="flex items-center gap-3 text-xs py-1.5 border-b border-border-default/50 cursor-pointer">
                  <input type="checkbox" checked={checkedKeys.has(c.key)} onChange={() => toggleCandidate(c.key)} />
                  <span className="flex-1 text-text-primary font-medium">{c.label}</span>
                  <Badge tone={c.confidence === 'empirical' ? 'success' : 'warning'}>
                    {c.confidence === 'empirical' ? 'Empirical' : 'Illustrative'}
                  </Badge>
                  <span className="font-mono text-text-secondary w-20 text-right">{formatLakh(c.costUsd)}</span>
                  <span className="font-mono text-accent-cyan w-24 text-right">
                    {c.riskReductionUsd > 0 ? `↓ ${formatLakh(c.riskReductionUsd)}` : 'not applicable'}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-text-muted mt-3">
              Toggling a control off re-runs the real optimizer with it entirely excluded from
              consideration — the same &quot;what if we don&apos;t deploy X&quot; question the optimizer
              answers, not a client-side estimate.
            </p>
            <div className="flex justify-between text-xs mt-3 pt-3 border-t border-border-default font-mono">
              <span className="text-text-muted">Selected: {formatLakh(active.totalCostUsd)}</span>
              <span className="text-accent-emerald">Expected Reduction: {(active.riskReductionPct * 100).toFixed(1)}%</span>
            </div>
          </Card>

          {/* Attack path */}
          <Card className="p-5 border border-border-default bg-bg-card">
            <h2 className="font-display text-sm font-bold text-text-primary mb-1">Attack Path Simulation</h2>
            <p className="text-[11px] text-text-muted mb-4">
              A representative request-flow layout — this platform has no real network-topology
              data, so the STAGES shown are generic, not your actual architecture. Each stage&apos;s
              color/severity is real, computed from this scan&apos;s actual findings.
            </p>
            {[
              { label: 'Before', path: result.tiers.current.currentAttackPath },
              { label: 'After (selected controls)', path: active.simulatedAttackPath },
            ].map((row) => (
              <div key={row.label} className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono mb-1.5">{row.label}</div>
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-[11px] text-text-muted whitespace-nowrap">Internet</span>
                  {row.path.stages.map((s) => (
                    <div key={s.stageId} className="flex items-center gap-2">
                      <span className="text-text-muted">→</span>
                      <div className="flex flex-col items-center whitespace-nowrap">
                        <span style={{ color: STATUS_COLOR[s.status] }} className="text-base leading-none">
                          {STATUS_EMOJI[s.status]}
                        </span>
                        <span className="text-[10px] text-text-secondary mt-0.5">{s.label}</span>
                        {s.findingCount > 0 && (
                          <span className="text-[9px] text-text-muted font-mono">{s.findingCount} finding(s)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {result.tiers.current.currentAttackPath.unclassifiedFindingCount > 0 && (
              <p className="text-[10px] text-text-muted mt-2">
                {result.tiers.current.currentAttackPath.unclassifiedFindingCount} additional finding(s) couldn&apos;t
                be mapped to a stage and aren&apos;t shown above — their risk isn&apos;t hidden, just not
                assigned a fabricated location (see current EAL, which includes them).
              </p>
            )}
          </Card>

          {/* AI recommendation */}
          <Card className="p-5 border border-accent-cyan/30 bg-accent-cyan/5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-accent-cyan" />
              <span className="text-xs font-mono text-accent-cyan">AI Recommendation (narration only — figures are computed, not generated)</span>
            </div>
            {result.aiNarrative && <p className="text-sm text-text-primary leading-relaxed mb-3">{result.aiNarrative}</p>}
            <div className="grid grid-cols-3 gap-3 text-xs mb-3">
              <div>
                <div className="text-[10px] uppercase text-text-muted font-mono">Investment</div>
                <div className="font-display font-bold text-text-primary">{formatLakh(result.tiers.recommended.totalCostUsd)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-text-muted font-mono">Risk Reduction</div>
                <div className="font-display font-bold text-accent-cyan">{(result.tiers.recommended.riskReductionPct * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-text-muted font-mono">Exposure Avoided</div>
                <div className="font-display font-bold text-accent-emerald">{formatLakh(result.tiers.recommended.ealReductionUsd)}</div>
              </div>
            </div>
            <Button type="button" onClick={applyRecommended} className="gap-2 text-xs font-mono flex items-center">
              <Wand2 size={13} /><span>Apply Recommended Plan</span>
            </Button>
          </Card>

          {/* Monte Carlo distribution */}
          <Card className="p-5 border border-border-default bg-bg-card">
            <h2 className="font-display text-sm font-bold text-text-primary mb-1">Risk Probability Distribution</h2>
            <p className="text-[11px] text-text-muted mb-3">
              {active.varDistribution.method === 'monte_carlo_empirical_fit'
                ? `Monte Carlo simulation fit to ${active.varDistribution.sampleSize} real recorded incident outcome(s).`
                : 'No real incident history exists yet to fit a distribution to (needs 30+ recorded outcomes) — showing the illustrative single-formula approximation at each percentile instead of a fabricated simulation.'}
            </p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { p: 'P50', v: active.varDistribution.p50Usd },
                    { p: 'P75', v: active.varDistribution.p75Usd },
                    { p: 'P90', v: active.varDistribution.p90Usd },
                    { p: 'P95', v: active.varDistribution.p95Usd },
                    { p: 'P99', v: active.varDistribution.p99Usd },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="p" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => formatLakh(v)} />
                  <Tooltip formatter={formatLakhTooltip} contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="v" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {result.tiers.recommended.unevidencedCandidateCount > 0 && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              {result.tiers.recommended.unevidencedCandidateCount} candidate(s) carry no real evidence_source —
              their cost/risk-reduction figures are placeholders to edit, not vendor-quoted numbers.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function SimulationPage() {
  return (
    <ProtectedShell>
      <Suspense fallback={<div className="max-w-5xl mx-auto py-16 text-center text-text-muted text-sm">Loading…</div>}>
        <SimulationPageInner />
      </Suspense>
    </ProtectedShell>
  );
}
