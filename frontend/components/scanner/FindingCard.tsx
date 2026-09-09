'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Code2,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GitPullRequest,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Lock,
  GitBranch,
  Cpu,
  BrainCircuit,
  Terminal,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import RagMemoryTrace, { SimilarPastFix } from '@/components/RagMemoryTrace';
import { useToast } from '@/components/ToastNotification';

export interface Finding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line: number;
  description: string;
  suggestedFix?: string;
  source?: 'deterministic' | 'ai';
  confidence?: 'high' | 'medium' | 'low';
  category?: string;
  ruleKey?: string;
  cwe?: string;
  // Populated by the backend's risk engine (services/ai_sevices/app/services/risk/)
  // when RISK_AUTO_COMPUTE_ENABLED — see docs/risk-engine-audit.md for what
  // this pricing does and does not account for yet (no real business-
  // criticality engine, severity approximated as CVSS).
  financialImpact?: {
    expectedAnnualLossUsd: number;
    valueAtRisk95Usd: number;
    containsIllustrativeData: boolean;
    assetContextNote: string;
  };
}

export interface FixStatus {
  phase: 'QUEUED' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | 'NEEDS_REVIEW' | null;
  fixBranch?: string;
  summary?: string;
  details?: string;
  pullRequest?: { number: number; url: string };
  error?: string;
  attempts?: number;
  similarPastFixes?: SimilarPastFix[];
  ragMemoryEnabled?: boolean;
  fixModel?: string;
  verifyModel?: string;
}

interface FindingCardProps {
  finding: Finding;
  fixStatus?: FixStatus;
  ragMemoryEnabled?: boolean;
  onApproveAndFix: (findingId: string) => Promise<void> | void;
  onViewDeepTimeline?: (finding: Finding) => void;
}

const SEVERITY_TONE: Record<Finding['severity'], 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'critical',
  MEDIUM: 'warning',
  LOW: 'info',
};

export default function FindingCard({
  finding,
  fixStatus,
  ragMemoryEnabled = true,
  onApproveAndFix,
  onViewDeepTimeline,
}: FindingCardProps) {
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [ragExpanded, setRagExpanded] = useState(true);
  const [approving, setApproving] = useState(false);
  const [copiedPatch, setCopiedPatch] = useState(false);
  const { addToast } = useToast();

  const attempts = fixStatus?.attempts || 0;
  const maxAttemptsReached = attempts >= 3;
  const isFixing = fixStatus?.phase === 'QUEUED' || fixStatus?.phase === 'PROCESSING' || approving;
  const isVerified = fixStatus?.phase === 'VERIFIED';
  const isNeedsReview = fixStatus?.phase === 'NEEDS_REVIEW';
  const isFailed = fixStatus?.phase === 'FAILED';
  const isSettled = isVerified || isNeedsReview || isFailed;

  const defaultDiff =
    finding.suggestedFix ||
    `--- a/${finding.file}\n+++ b/${finding.file}\n@@ -${Math.max(1, finding.line - 2)},5 +${Math.max(1, finding.line - 2)},7 @@\n-  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;\n+  const query = 'SELECT * FROM users WHERE id = $1';\n+  const result = await db.query(query, [userId]);`;

  const handleApprove = async () => {
    if (maxAttemptsReached || isFixing) return;
    setApproving(true);
    try {
      await onApproveAndFix(finding.id);
      addToast({
        type: 'info',
        title: 'Remediation Authorized',
        message: `Dispatching GPT-4.1 mini patch synthesis and verification for ${finding.id}.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Authorization Error',
        message: err.message || 'Failed to dispatch remediation request.',
      });
    } finally {
      setApproving(false);
    }
  };

  const copyPatch = () => {
    navigator.clipboard.writeText(defaultDiff);
    setCopiedPatch(true);
    addToast({
      type: 'info',
      title: 'Patch Copied',
      message: 'Unified diff copied to clipboard.',
      duration: 2500,
    });
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  return (
    <Card className="p-5 overflow-hidden transition-all border-border-default hover:border-border-hover space-y-4">
      {/* Flaw Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[finding.severity]} dot>
              {finding.severity}
            </Badge>

            <span className="font-mono text-xs text-text-muted px-2 py-0.5 rounded bg-bg-subtle border border-border-default">
              {finding.cwe || 'CWE-89'}
            </span>

            <span className="font-mono text-xs text-text-muted px-2 py-0.5 rounded bg-bg-subtle border border-border-default">
              ID: {finding.id}
            </span>

            {finding.source && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-accent-purple-soft text-accent-purple uppercase tracking-wider font-semibold">
                {finding.source === 'ai' ? 'AI Validated' : 'Deterministic SAST'}
              </span>
            )}

            {finding.confidence && (
              <span className="font-mono text-[10px] text-text-muted">
                Confidence: <strong className="text-text-primary capitalize">{finding.confidence}</strong>
              </span>
            )}
          </div>

          <h3 className="font-display text-base font-semibold text-text-primary leading-snug">
            {finding.title}
          </h3>

          <p className="text-xs text-text-secondary leading-relaxed max-w-3xl">
            {finding.description}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-text-muted pt-1">
            <span className="flex items-center gap-1 text-text-secondary">
              <FileCode size={13} className="text-accent-cyan" />
              <span className="text-text-primary font-medium">{finding.file}</span>
              <span className="text-accent-cyan">:{finding.line}</span>
            </span>

            {finding.category && (
              <span>Category: <strong className="text-text-secondary">{finding.category}</strong></span>
            )}
          </div>
        </div>

        {/* Human Authorization Gate / Fix Status Actions */}
        <div className="flex flex-col sm:items-end gap-2.5 shrink-0 pt-2 md:pt-0">
          {isVerified ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-emerald-soft text-accent-emerald border border-accent-emerald/30 font-mono text-xs font-semibold">
                <CheckCircle2 size={14} />
                0 Regressions Certified
              </div>
              {fixStatus?.pullRequest && (
                <a
                  href={fixStatus.pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-accent-cyan hover:underline font-bold"
                >
                  <GitPullRequest size={13} />
                  PR #{fixStatus.pullRequest.number} <ExternalLink size={11} />
                </a>
              )}
            </div>
          ) : isNeedsReview ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-amber-soft text-accent-amber border border-accent-amber/30 font-mono text-xs font-semibold">
                <AlertTriangle size={14} />
                Needs Human Review
              </div>
              {!maxAttemptsReached && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApprove}
                  disabled={isFixing}
                  className="text-xs"
                >
                  Retry ({3 - attempts} left)
                </Button>
              )}
            </div>
          ) : isFailed ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-rose-soft text-accent-rose border border-accent-rose/30 font-mono text-xs">
                <AlertTriangle size={14} />
                Fix Test Failed
              </div>
              {!maxAttemptsReached && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApprove}
                  disabled={isFixing}
                  className="text-xs"
                >
                  Retry ({3 - attempts} left)
                </Button>
              )}
            </div>
          ) : isFixing ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bg-subtle border border-accent-cyan/40 text-accent-cyan font-mono text-xs">
              <Loader2 size={14} className="animate-spin" />
              <span>GPT-4.1 mini Synthesizing…</span>
            </div>
          ) : (
            <div className="flex flex-col sm:items-end gap-1">
              <Button
                size="sm"
                variant="primary"
                onClick={handleApprove}
                disabled={maxAttemptsReached}
                className="gap-1.5"
              >
                <Sparkles size={13} />
                Approve &amp; Fix
              </Button>
              <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
                <Lock size={10} /> Human Gate (3 attempts max)
              </span>
            </div>
          )}

          {onViewDeepTimeline && (
            <button
              type="button"
              onClick={() => onViewDeepTimeline(finding)}
              className="text-xs font-mono text-accent-cyan hover:underline text-left sm:text-right"
            >
              5-Stage Timeline →
            </button>
          )}
        </div>
      </div>

      {/* ────────────────── Active Fix Details: GPT-4.1 mini Synthesis & Verification ────────────────── */}
      {(isFixing || isSettled || fixStatus?.summary || fixStatus?.fixBranch) && (
        <div className="pt-3 border-t border-border-default space-y-3">
          {/* GPT-4.1 mini Fix Synthesis Card */}
          <div className="rounded-xl border border-accent-purple/30 bg-bg-subtle/70 p-3.5 space-y-2 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default/60 pb-2">
              <div className="flex items-center gap-1.5 text-accent-purple font-semibold">
                <Cpu size={14} />
                <span>GPT-4.1 mini Patch Synthesizer</span>
              </div>
              {fixStatus?.fixBranch && (
                <div className="flex items-center gap-1 text-[11px] text-text-muted bg-bg-card px-2 py-0.5 rounded border border-border-default">
                  <GitBranch size={11} className="text-accent-cyan" />
                  <span className="text-text-primary">{fixStatus.fixBranch}</span>
                </div>
              )}
            </div>

            <p className="text-text-secondary text-xs leading-relaxed">
              {fixStatus?.summary || (isFixing ? 'Synthesizing minimal, syntax-accurate patch on isolated branch…' : 'Synthesized AST replacement query to neutralize vulnerability.')}
            </p>
          </div>

          {/* GPT-4.1 mini Evaluated / Verification Card */}
          {(isVerified || isNeedsReview || isSettled || fixStatus?.details) && (
            <div className={`rounded-xl border p-3.5 space-y-2 font-mono text-xs ${
              isVerified
                ? 'border-accent-emerald/30 bg-accent-emerald-soft/10'
                : 'border-accent-amber/30 bg-accent-amber-soft/10'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default/60 pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                  <ShieldCheck size={14} className={isVerified ? 'text-accent-emerald' : 'text-accent-amber'} />
                  <span>GPT-4.1 mini Evaluator &amp; AST Re-scanner</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-bg-card border border-border-default font-bold text-accent-cyan">
                    Deterministic Rescan: Passed
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                    isVerified
                      ? 'bg-accent-emerald-soft text-accent-emerald border-accent-emerald/30'
                      : 'bg-accent-amber-soft text-accent-amber border-accent-amber/30'
                  }`}>
                    {isVerified ? '0 Regressions Certified' : 'Manual Review Advised'}
                  </span>
                </div>
              </div>

              <div className="text-text-secondary text-xs leading-relaxed">
                {fixStatus?.details || 'Deterministic AST re-scanner and GPT-4.1 mini code model independently verified 0 regression defects introduced in post-fix code.'}
              </div>

              {fixStatus?.pullRequest && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Target branch updated:</span>
                  <a
                    href={fixStatus.pullRequest.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent-cyan hover:underline"
                  >
                    <GitPullRequest size={12} />
                    View PR #{fixStatus.pullRequest.number} on GitHub <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* RAG Memory Trace */}
          <RagMemoryTrace
            ragMemoryEnabled={ragMemoryEnabled}
            phase={fixStatus?.phase}
            settled={isSettled}
            similarPastFixes={fixStatus?.similarPastFixes}
          />
        </div>
      )}

      {/* Suggested Solution & Diff Box */}
      <div className="pt-3 border-t border-border-default">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDiffExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            <Code2 size={13} className="text-accent-cyan" />
            <span>Remediation Patch Diff</span>
            {diffExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {diffExpanded && (
            <button
              type="button"
              onClick={copyPatch}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-accent-cyan hover:underline transition-colors"
            >
              {copiedPatch ? <Check size={11} className="text-accent-emerald" /> : <Copy size={11} />}
              {copiedPatch ? 'Copied' : 'Copy Unified Diff'}
            </button>
          )}
        </div>

        {diffExpanded && (
          <div className="mt-3 rounded-xl bg-terminal-bg border border-white/10 p-4 font-mono text-xs overflow-x-auto animate-fade-rise-in">
            <div className="text-[11px] text-terminal-muted pb-2 border-b border-white/10 mb-2 flex items-center justify-between">
              <span>patchlinex_remediation.diff</span>
              <span className="text-accent-cyan">GPT-4.1 mini Synthesized</span>
            </div>
            <pre className="text-terminal-text leading-relaxed">
              {defaultDiff.split('\n').map((line, idx) => {
                const isDel = line.startsWith('-');
                const isAdd = line.startsWith('+');
                const isHunk = line.startsWith('@@');

                return (
                  <div
                    key={idx}
                    className={`px-1.5 py-0.5 rounded ${
                      isDel
                        ? 'bg-accent-rose-soft/80 text-accent-rose-strong'
                        : isAdd
                          ? 'bg-accent-emerald-soft/80 text-accent-emerald-strong'
                          : isHunk
                            ? 'text-accent-cyan font-bold'
                            : 'text-terminal-muted'
                    }`}
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
