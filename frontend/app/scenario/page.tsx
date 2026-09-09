'use client';

import { useState } from 'react';
import { Workflow, Loader2, PlayCircle, Sparkles } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ProtectedShell from '@/components/ProtectedShell';
import ConfidenceBreakdown, { EvidenceTrail } from '@/components/risk/ConfidenceBreakdown';
import { riskApi } from '@/lib/api';

interface ScenarioStep {
  step: number;
  title: string;
  explanation: string;
  data: Record<string, unknown>;
  evidence: EvidenceTrail[];
}

interface ScenarioResponse {
  asset_id: string;
  steps: ScenarioStep[];
  ai_narrative: string | null;
}

const THREAT_SOURCES = [
  { key: 'threat_intel', label: 'Threat Intel (KEV match)' },
  { key: 'siem', label: 'SIEM' },
  { key: 'edr', label: 'EDR' },
  { key: 'iam', label: 'IAM' },
  { key: 'cspm', label: 'CSPM' },
];

const DEFAULT_CONTROLS = [
  { key: 'mfa_credential_attacks', label: 'MFA rollout', cost_usd: 25000, risk_reduction_usd: 2200000, evidence_source: 'control_effectiveness.marginal_risk_reduction_usd()', confidence: 'empirical' },
  { key: 'edr_endpoint_detection', label: 'EDR deployment', cost_usd: 35000, risk_reduction_usd: 1400000, evidence_source: 'control_effectiveness.marginal_risk_reduction_usd()', confidence: 'empirical' },
];

/**
 * The frontend for SIH 26105 critique gap #10 — "your demo needs one
 * complete causal story". This page walks the SAME chain judges were told
 * to expect:
 *
 *   Threat Event -> Asset affected -> Business criticality -> Likelihood
 *   changes -> Financial exposure increases -> AI explains WHY ->
 *   "What if we deploy MFA?" -> Optimizer chooses controls (within budget)
 *   -> Scenario recalculation -> Risk decreases
 *
 * One button run, one linear trace — deliberately NOT a feature showcase
 * of scanner/graph/RAG/sandbox as separate tabs. See
 * services/ai_sevices/app/services/risk/scenario.py for the deterministic
 * backbone this calls.
 */
export default function ScenarioPage() {
  const [assetId, setAssetId] = useState('acme/payments-api');
  const [industry, setIndustry] = useState('financial_services');
  const [cvss, setCvss] = useState(8.5);
  const [threatSource, setThreatSource] = useState('threat_intel');
  const [budget, setBudget] = useState(30000);
  const [narrateWithAi, setNarrateWithAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await riskApi.runScenario({
        asset_id: assetId,
        industry,
        cvss,
        default_criticality: 0.5,
        threat_source: threatSource as any,
        budget_usd: budget,
        proposed_controls: DEFAULT_CONTROLS,
        use_demo_graph: true,
        narrate_with_ai: narrateWithAi,
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Scenario run failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedShell>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan">
            <Workflow size={20} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-text-primary">What-If Scenario</h1>
            <p className="text-sm text-text-muted mt-1 max-w-2xl">
              One threat event, one financial consequence, one investment decision, one measurable
              outcome — end to end, deterministic engines calculate every figure, AI only narrates
              why they moved.
            </p>
          </div>
        </div>

        <Card className="p-5 border border-border-default bg-bg-card space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-text-muted block mb-1">Asset ID</label>
              <input
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-text-muted block mb-1">Threat Source</label>
              <select
                value={threatSource}
                onChange={(e) => setThreatSource(e.target.value)}
                className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
              >
                {THREAT_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-text-muted block mb-1">CVSS</label>
              <input
                type="number" min={0} max={10} step={0.1}
                value={cvss}
                onChange={(e) => setCvss(Number(e.target.value))}
                className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-text-muted block mb-1">Control Budget (₹)</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={narrateWithAi} onChange={(e) => setNarrateWithAi(e.target.checked)} />
            Narrate with AI (prose summary only — never recomputes a figure)
          </label>

          <Button type="button" onClick={run} disabled={loading} className="gap-2 text-xs font-mono flex items-center">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
            <span>Run Scenario</span>
          </Button>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </Card>

        {result && (
          <div className="space-y-4">
            {result.ai_narrative && (
              <Card className="p-5 border border-accent-cyan/30 bg-accent-cyan/5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-accent-cyan" />
                  <span className="text-xs font-mono text-accent-cyan">AI Narrative (narration only — figures come from the trace below)</span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{result.ai_narrative}</p>
              </Card>
            )}

            <ol className="space-y-3">
              {result.steps.map((s) => (
                <li key={s.step}>
                  <Card className="p-4 border border-border-default bg-bg-card">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge tone="info">Step {s.step}</Badge>
                      <h3 className="font-display text-sm font-bold text-text-primary">{s.title}</h3>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">{s.explanation}</p>
                    {s.evidence && s.evidence.length > 0 && (
                      <ConfidenceBreakdown evidence={s.evidence} label="Evidence for this step" />
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </ProtectedShell>
  );
}
