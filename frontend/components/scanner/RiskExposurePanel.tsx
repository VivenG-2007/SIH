'use client';

import { DollarSign, AlertTriangle, Info } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ConfidenceBreakdown, { EvidenceTrail } from '@/components/risk/ConfidenceBreakdown';

export interface RiskSummary {
  totalExpectedAnnualLossUsd: number;
  totalValueAtRisk95Usd: number;
  findingsPriced: number;
  containsIllustrativeData: boolean;
  note: string;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Displays the scan's portfolio-level financial exposure — the frontend
 * side of the Scanner → Risk Engine wiring (see
 * app/services/risk/pipeline_integration.py on the ai-storage-service side).
 *
 * Deliberately shows the "illustrative data" and asset-context caveats
 * inline rather than only in an API response nobody reads — see
 * docs/risk-engine-audit.md for the full honesty framing this reflects.
 */
export default function RiskExposurePanel({
  summary,
  evidence,
}: {
  summary?: RiskSummary | null;
  /** Optional — pass a representative finding's evidence array (e.g. the
   * highest-severity priced finding's financialImpact.evidence) to render
   * the itemized confidence breakdown. Omitted by default because
   * aggregate_portfolio_risk() doesn't roll evidence up across findings
   * today (summing dollar figures across findings is valid; summing
   * EvidenceTrails is not — each finding's trail is specific to that
   * finding's own CVSS/criticality inputs). */
  evidence?: EvidenceTrail[];
}) {
  if (!summary || summary.findingsPriced === 0) return null;

  return (
    <Card className="p-4 border border-border-default bg-bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan">
            <DollarSign size={18} />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-text-primary flex items-center gap-2">
              Financial Risk Exposure
              {summary.containsIllustrativeData && (
                <Badge tone="warning" dot>
                  Illustrative data
                </Badge>
              )}
            </h3>
            <p className="text-xs text-text-muted mt-0.5 max-w-xl">
              {summary.findingsPriced} finding{summary.findingsPriced === 1 ? '' : 's'} priced by the
              Cyber Risk Quantification engine.
            </p>
          </div>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
              Expected Annual Loss
            </div>
            <div className="text-lg font-display font-bold text-text-primary">
              {formatUsd(summary.totalExpectedAnnualLossUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted font-mono">
              Value at Risk (95%)
            </div>
            <div className="text-lg font-display font-bold text-accent-cyan">
              {formatUsd(summary.totalValueAtRisk95Usd)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border-default flex items-start gap-2 text-xs text-text-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>{summary.note}</span>
      </div>

      {evidence && evidence.length > 0 && <ConfidenceBreakdown evidence={evidence} />}
    </Card>
  );
}
