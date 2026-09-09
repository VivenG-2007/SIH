'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const STEPS = ['Repo Fetched', 'File Discovery', 'Static Analysis', 'Dependency Analysis', 'Security Analysis', 'AI Analysis'];

interface ScanProgressProps {
  /** Real status string from the backend poll ('QUEUED' | 'PROCESSING' | ...). */
  phase: string | null;
  repo: string;
}

/**
 * The backend reports coarse status only (QUEUED/PROCESSING), not a granular
 * percentage or per-step signal — so this renders an honest "still working"
 * indicator: a trickling progress bar that approaches (never reaches) 95%
 * while we wait, jumping to 100% only when the parent unmounts this on
 * completion. Steps light up on elapsed time as a visual pace-setter, not a
 * claim about literally which backend stage is running.
 */
export default function ScanProgress({ phase, repo }: ScanProgressProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [startTime] = useState(() => Date.now());
  const startRef = useRef(startTime);
  const lastPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase && phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase;
      const label =
        phase === 'QUEUED'
          ? `Scan job queued for ${repo}`
          : phase === 'PROCESSING'
            ? 'Worker picked up job — running deterministic + AI analysis'
            : `Status: ${phase}`;
      setLog((prev) => [...prev, label]);
    }
  }, [phase, repo]);

  // Asymptotic progress: fast at first, slows as it approaches 95%.
  const progress = 95 * (1 - Math.exp(-elapsedMs / 9000));
  const stepIndex = Math.min(STEPS.length - 1, Math.floor((progress / 95) * STEPS.length));

  return (
    <div className="p-6 mb-6 relative overflow-hidden bg-surface-raised border border-border rounded-xl">
      <div className="scanline" />
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-[11px] font-mono text-faint uppercase tracking-wide">Live Scan</div>
          <h2 className="font-display text-xl text-ink mt-0.5">Scanning repository…</h2>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl text-accent-strong tabular-nums">{Math.round(progress)}%</div>
        </div>
      </div>
      <p className="text-sm text-muted mb-5">Analyzing infrastructure, dependencies, and code patterns for {repo}.</p>

      <div className="h-1.5 w-full rounded-full bg-canvas border border-border overflow-hidden mb-6">
        <div className="h-full rounded-full shimmer-bg transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div
              key={step}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-mono ${
                done
                  ? 'border-success/30 bg-success-soft text-success'
                  : active
                    ? 'border-accent/30 bg-accent-soft text-accent-strong'
                    : 'border-border text-faint'
              }`}
            >
              {done ? <Check size={11} strokeWidth={2.5} /> : active ? <Loader2 size={11} className="animate-spin" /> : <span className="w-[11px] h-[11px] rounded-full border border-current" />}
              {step}
            </div>
          );
        })}
      </div>

      <div className="bg-terminal-bg rounded-lg border border-border/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 text-[11px] font-mono text-terminal-muted">scanner_daemon.log</div>
        <div className="px-4 py-3 space-y-1 max-h-32 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i} className="text-[12px] font-mono text-terminal-text animate-fade-rise-in">
              <span className="text-terminal-muted">[{new Date(startTime + i * 400).toLocaleTimeString('en-US', { hour12: false })}]</span> {line}
            </div>
          ))}
          <div className="text-[12px] font-mono text-accent-strong">_ analyzing…</div>
        </div>
      </div>
    </div>
  );
}
