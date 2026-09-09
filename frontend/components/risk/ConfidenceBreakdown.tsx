'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, ShieldQuestion } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

export interface EvidenceDataSource {
  name: string;
  tier: 'empirical' | 'illustrative' | string;
  source: string;
  as_of: string;
}

export interface EvidenceTrail {
  score_type: string;
  inputs: Record<string, unknown>;
  data_sources: EvidenceDataSource[];
  formula_version: string;
  explanation: string;
  computed_at: string;
  contains_illustrative_data: boolean;
}

/**
 * The frontend half of critique gap #3 ("the financial model can look more
 * authoritative than it actually is"). Renders the exact mock the critique
 * asked for:
 *
 *   ₹3.4 Cr Estimated EAL
 *   Confidence: Illustrative / Calibrated
 *   Data basis:
 *   ✓ Industry benchmark
 *   ✓ Asset criticality
 *   ✓ CVSS
 *   ✓ Threat status
 *   ✗ Organization historical loss data
 *
 * Reads directly off the `evidence` array every /api/v1/risk/* response
 * already returns (see evidence.py) — no new backend computation, this is
 * purely surfacing data that already existed in the API but never reached
 * the UI at this level of detail (the existing "Illustrative data" Badge
 * in RiskExposurePanel.tsx / assessment/page.tsx is the summary form; this
 * is the itemized form for someone who wants to see exactly why).
 */
export default function ConfidenceBreakdown({
  evidence,
  label = 'Confidence Breakdown',
  defaultOpen = false,
}: {
  evidence: EvidenceTrail[];
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!evidence || evidence.length === 0) return null;

  // One row per named data source across all trails, deduped by name.
  // "Calibrated" would mean every input traces to real org-specific data
  // (currently never true pre-launch — see calibration.py's honest
  // calibration-status endpoint) vs "Illustrative" meaning at least one
  // input is a placeholder. This platform never claims "Calibrated" for
  // itself yet; it shows exactly which inputs are empirical vs
  // illustrative instead of collapsing that into one word.
  const rows = new Map<string, EvidenceDataSource>();
  for (const trail of evidence) {
    for (const src of trail.data_sources) {
      if (!rows.has(src.name)) rows.set(src.name, src);
    }
  }
  const anyIllustrative = evidence.some((t) => t.contains_illustrative_data);
  const allEmpirical = rows.size > 0 && [...rows.values()].every((r) => r.tier === 'empirical');

  return (
    <div className="mt-3 pt-3 border-t border-border-default">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <ShieldQuestion size={14} className="text-text-muted" />
          <span className="text-xs font-mono text-text-secondary group-hover:text-text-primary transition-colors">
            {label}
          </span>
          <Badge tone={allEmpirical ? 'success' : anyIllustrative ? 'warning' : 'neutral'} dot>
            Confidence: {allEmpirical ? 'Calibrated' : 'Illustrative'}
          </Badge>
        </div>
        {open ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
      </button>

      {open && (
        <Card className="mt-2 p-3 border border-border-default bg-bg-elevated/50 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono mb-1.5">Data basis</div>
            <ul className="space-y-1">
              {[...rows.values()].map((src) => (
                <li key={src.name} className="flex items-start gap-2 text-xs">
                  {src.tier === 'empirical' ? (
                    <CheckCircle2 size={13} className="text-accent-emerald mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={13} className="text-text-muted mt-0.5 shrink-0" />
                  )}
                  <span className={src.tier === 'empirical' ? 'text-text-primary' : 'text-text-muted'}>
                    {src.name.replace(/_/g, ' ')}
                    {src.source && src.source !== 'n/a' && (
                      <span className="text-text-muted"> — {src.source}{src.as_of && src.as_of !== 'n/a' ? ` (${src.as_of})` : ''}</span>
                    )}
                  </span>
                </li>
              ))}
              {/* Organization historical loss data is never in data_sources
                  today — calibration.py's own honest calibration-status
                  endpoint reports zero real (prediction, outcome) pairs
                  pre-launch, so this row is always shown as missing until
                  that changes. It's listed explicitly rather than omitted
                  so nobody mistakes its absence for an oversight. */}
              <li className="flex items-start gap-2 text-xs">
                <XCircle size={13} className="text-text-muted mt-0.5 shrink-0" />
                <span className="text-text-muted">
                  Organization historical loss data — not yet available (needs ≥30 real
                  prediction/outcome pairs; see /api/v1/risk/calibration-status)
                </span>
              </li>
            </ul>
          </div>

          <div className="pt-2 border-t border-border-default space-y-1.5">
            {evidence.map((trail, i) => (
              <div key={i} className="text-[11px] text-text-muted leading-relaxed">
                <span className="font-mono text-text-secondary">{trail.score_type}:</span> {trail.explanation}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
