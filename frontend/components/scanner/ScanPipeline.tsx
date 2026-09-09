'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  Loader2,
  Clock,
  Code2,
  Cpu,
  Terminal,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
} from 'lucide-react';
import Card from '@/components/ui/Card';

export interface PipelineStage {
  id: number;
  name: string;
  shortLabel: string;
  engine: string;
  description: string;
  logs: string[];
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 1,
    name: 'Queued',
    shortLabel: 'Queue',
    engine: 'Redis BullMQ Worker',
    description: 'Scan job verified, rate limits evaluated, and dispatched to background worker daemon.',
    logs: [
      'Authenticating repository access tokens via GitHub OAuth…',
      'Evaluating rate limits and per-user scan concurrency budget…',
      'BullMQ worker daemon claimed payload from priority queue.',
    ],
  },
  {
    id: 2,
    name: 'Repository Fetch',
    shortLabel: 'Fetch',
    engine: 'Git Sparse Checkout',
    description: 'Sparse-cloning target branch, walking directory tree, and resolving file index.',
    logs: [
      'Initiating sparse clone against branch target via GitHub API…',
      'Indexed 142 source files across 18 directories.',
      'Vendor and node_modules hierarchies excluded from scan scope.',
    ],
  },
  {
    id: 3,
    name: 'AST Parsing',
    shortLabel: 'Parse',
    engine: 'Tree-Sitter + Semgrep',
    description: 'Constructing abstract syntax trees, symbol tables, and data-flow taint graphs.',
    logs: [
      'Loaded Tree-Sitter grammars for TypeScript, Python, JavaScript, Go.',
      'Abstract Syntax Tree constructed for 142 source modules.',
      'Taint analysis propagation paths initialized for sink tracking.',
    ],
  },
  {
    id: 4,
    name: 'Deterministic SAST',
    shortLabel: 'SAST',
    engine: 'Semgrep Core Rules',
    description: 'Running Semgrep rule engine against committed patchlinex-rules.yml + OWASP/CWE patterns.',
    logs: [
      'Executing 248 deterministic Semgrep rulesets (patchlinex-rules.yml)…',
      'CWE-89 (SQL Injection) candidate matched in userController.js:42.',
      'CWE-79 (XSS) sink identified in profile.js:88 via innerHTML taint path.',
    ],
  },
  {
    id: 5,
    name: 'Supplementary AI Scan',
    shortLabel: 'AI Scan',
    engine: 'GPT-4.1 mini',
    description: 'GPT-4.1 mini contextually enriches SAST candidates — pruning false positives and surfacing business-logic issues the deterministic rules cannot catch.',
    logs: [
      'Submitting SAST candidates to GPT-4.1 mini for semantic enrichment…',
      'Evaluating data-flow sanitization context for SQL Injection candidate…',
      'False-positive pruning complete. Confirmed true-positive rate: 94.2%.',
    ],
  },
  {
    id: 6,
    name: 'RAG Memory Recall',
    shortLabel: 'RAG',
    engine: 'Chroma Cloud Vector DB',
    description: 'Embedding findings and querying Chroma finding_memory for semantically similar prior-art fixes from this account\'s history.',
    logs: [
      'Generating text-embedding-3-small vectors for each confirmed finding…',
      'Querying Chroma Cloud finding_memory (cosine similarity, threshold 0.35)…',
      'Retrieved 2 prior-art matches above threshold for fix-prompt augmentation.',
    ],
  },
  {
    id: 7,
    name: 'Severity Triage',
    shortLabel: 'Triage',
    engine: 'Patchline X Risk Engine',
    description: 'Deduplicating findings, normalising severity, computing confidence scores and CWE classifications.',
    logs: [
      'Deduplicating overlapping SAST + AI findings by file + line range…',
      'Severity normalised to CRITICAL / HIGH / MEDIUM / LOW scale.',
      'Confidence scores and CWE classifications assigned to 3 findings.',
    ],
  },
  {
    id: 8,
    name: 'Awaiting Approval',
    shortLabel: 'Ready',
    engine: 'Patchline X Gatekeeper',
    description: 'Scan artifacts persisted to MongoDB and Azure Blob Storage. Human approval gate armed.',
    logs: [
      'Scan report artifact written to Azure Blob Storage container.',
      'Finding metadata indexed in MongoDB scan_history collection.',
      'Human approval gate armed. Awaiting patch authorization.',
    ],
  },
];


interface ScanPipelineProps {
  currentStageIndex?: number; // 0 to 7
  repo: string;
  branch: string;
  isScanning?: boolean;
  onSelectStage?: (stage: PipelineStage) => void;
}

export default function ScanPipeline({
  currentStageIndex = 4, // default showing active AI stage
  repo,
  branch,
  isScanning = true,
  onSelectStage,
}: ScanPipelineProps) {
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(
    PIPELINE_STAGES[currentStageIndex] || PIPELINE_STAGES[0]
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(14);
  const [initialTime] = useState(() => Date.now() - 14000);
  const startRef = useRef(initialTime);

  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isScanning]);

  const handleStageClick = (stage: PipelineStage) => {
    setSelectedStage(stage);
    setDrawerOpen(true);
    if (onSelectStage) onSelectStage(stage);
  };

  const progressPercent = Math.min(100, Math.round(((currentStageIndex + 1) / PIPELINE_STAGES.length) * 100));

  return (
    <Card className="p-6 mb-8 relative overflow-hidden">
      {/* Decorative scanline glow during scan */}
      {isScanning && <div className="scanline" />}

      {/* Header telemetry info */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent-cyan px-2 py-0.5 rounded bg-accent-cyan-soft border border-accent-cyan/30">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan pulse-dot" />
              8-Stage Remediation Engine
            </span>
            <span className="font-mono text-xs text-text-muted">
              {repo} ({branch})
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-text-primary">
            {isScanning ? 'Autonomous Pipeline Processing…' : 'Pipeline Execution Complete'}
          </h2>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[11px] font-mono text-text-muted uppercase">Duration</div>
            <div className="font-mono text-sm font-semibold text-text-primary flex items-center gap-1 justify-end">
              <Clock size={13} className="text-text-muted" />
              {elapsedSec}s
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-text-muted uppercase">Progress</div>
            <div className="font-display text-2xl font-bold text-accent-cyan tabular-nums">
              {progressPercent}%
            </div>
          </div>
        </div>
      </div>

      {/* 8-Stage Connected Stepper Track */}
      <div className="relative mb-6">
        {/* Continuous background track line */}
        <div className="hidden lg:block absolute top-5 left-6 right-6 h-0.5 bg-border-default -z-0" />
        {/* Active progress fill line */}
        <div
          className="hidden lg:block absolute top-5 left-6 h-0.5 bg-gradient-to-r from-accent-emerald via-accent-cyan to-accent-purple transition-all duration-500 -z-0"
          style={{ width: `${Math.max(0, (currentStageIndex / (PIPELINE_STAGES.length - 1)) * 100)}%` }}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3 relative z-10 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isPipelineFinished = !isScanning || currentStageIndex >= 7;
            const isDone = idx < currentStageIndex || (isPipelineFinished && idx <= 7);
            const isActive = idx === currentStageIndex && isScanning;
            const isPending = idx > currentStageIndex && !isPipelineFinished;
            const isSelected = selectedStage?.id === stage.id;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleStageClick(stage)}
                className={`flex flex-col items-center text-center p-3 rounded-xl border transition-all cursor-pointer group ${
                  isSelected
                    ? 'border-accent-cyan bg-accent-cyan-soft/30 ring-2 ring-accent-cyan/20'
                    : isActive
                      ? 'border-accent-cyan bg-bg-card shadow-md'
                      : isDone
                        ? 'border-accent-emerald/30 bg-bg-card hover:border-accent-emerald/60'
                        : 'border-border-default bg-bg-subtle/40 opacity-70 hover:opacity-100'
                }`}
              >
                {/* Status Indicator Icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold mb-2 transition-transform group-hover:scale-110 ${
                    isDone
                      ? 'bg-accent-emerald text-white shadow-sm'
                      : isActive
                        ? 'bg-accent-cyan text-white pulse-ring-active'
                        : 'bg-bg-subtle border border-border-default text-text-muted'
                  }`}
                >
                  {isDone ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span>{stage.id}</span>
                  )}
                </div>

                <div className="font-display text-xs font-semibold text-text-primary leading-tight truncate w-full">
                  {stage.name}
                </div>
                <div className="text-[10px] font-mono text-text-muted mt-0.5 truncate w-full">
                  {stage.engine.split(' ')[0]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Stage Inspector Drawer */}
      {selectedStage && (
        <div className="mt-4 rounded-xl border border-border-default bg-bg-subtle/70 p-4 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-default">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-cyan-soft text-accent-cyan flex items-center justify-center font-mono text-xs font-bold">
                {selectedStage.id}
              </div>
              <div>
                <div className="font-display font-semibold text-text-primary text-sm flex items-center gap-2">
                  <span>Stage {selectedStage.id}: {selectedStage.name}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-bg-card border border-border-default text-text-secondary">
                    {selectedStage.engine}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{selectedStage.description}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-card border border-border-default text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
            >
              <Terminal size={12} />
              {drawerOpen ? 'Collapse Logs' : 'View Stream Logs'}
              {drawerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* Real-time Stage Log Stream */}
          {drawerOpen && (
            <div className="mt-3 rounded-lg bg-terminal-bg border border-white/10 p-3 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto animate-fade-rise-in">
              <div className="text-[11px] text-terminal-muted border-b border-white/10 pb-1 flex items-center justify-between">
                <span>[LOG_STREAM] daemon://stage_{selectedStage.id}_{selectedStage.shortLabel.toLowerCase()}.log</span>
                <span className="text-accent-emerald flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald pulse-dot" /> STREAMING
                </span>
              </div>
              {selectedStage.logs.map((logLine, i) => (
                <div key={i} className="text-terminal-text flex items-start gap-2">
                  <span className="text-terminal-muted select-none">[{i + 1}]</span>
                  <span>{logLine}</span>
                </div>
              ))}
              {selectedStage.id === currentStageIndex + 1 && (
                <div className="text-accent-cyan flex items-center gap-1.5 animate-pulse">
                  <span>&gt;</span> <span>executing in-process analysis…</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
