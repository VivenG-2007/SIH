'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
  steps?: string[];
  durationMs?: number;
  onComplete?: () => void;
}

const DEFAULT_STEPS = [
  'Initializing Patchline X engine…',
  'Authenticating workspace credentials…',
  'Connecting to Elasticsearch telemetry node…',
  'Resolving multi-repo compliance rules…',
  'Loading AST scanner & GPT-4.1 mini pipeline…',
  'Workspace ready',
];

export default function LoadingScreen({
  title = 'Initializing Workspace…',
  subtitle = 'Verifying session credentials, establishing telemetry socket & loading workspace.',
  steps = DEFAULT_STEPS,
  durationMs = 2200,
  onComplete,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, onComplete]);

  const visibleSteps = Math.max(1, Math.ceil((progress / 100) * steps.length));

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 animate-fade-in"
      style={{ background: '#070609' }}
    >
      <div className="w-full max-w-md">
        {/* Header Logo & Title */}
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 relative"
            style={{
              background: '#17121D',
              border: '1px solid #302A38',
              boxShadow: '0 0 24px rgba(168,85,247,0.25)',
            }}
          >
            {/* Patchline X ◈ symbol */}
            <svg width="24" height="24" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L16 9L9 16L2 9L9 2Z" stroke="url(#loadLogoGrad)" strokeWidth="1.5" fill="none"/>
              <path d="M9 5L13 9L9 13L5 9L9 5Z" fill="url(#loadLogoGrad)" opacity="0.75"/>
              <defs>
                <linearGradient id="loadLogoGrad" x1="2" y1="2" x2="16" y2="16">
                  <stop offset="0%" stopColor="#A855F7"/>
                  <stop offset="100%" stopColor="#EC4899"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h1 className="font-sans font-bold text-[20px] tracking-tight" style={{ color: '#F4F1F7' }}>
            {title}
          </h1>
          <p className="text-[12px] mt-1.5 max-w-sm leading-relaxed" style={{ color: '#9B93A5' }}>
            {subtitle}
          </p>
        </div>

        {/* Terminal box */}
        <div
          className="rounded-xl overflow-hidden mb-5"
          style={{ background: '#0E0D12', border: '1px solid #24202B', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-2.5"
            style={{ borderBottom: '1px solid #1B1820', background: '#121017' }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F43F5E', opacity: 0.8 }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#EAB308', opacity: 0.8 }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22C55E', opacity: 0.8 }} />
            <span className="ml-2 text-[10px] font-mono tracking-widest uppercase" style={{ color: '#6B6373' }}>
              PATCHLINEX_INITIALIZATION
            </span>
          </div>

          <div className="px-4 py-3.5 space-y-2 min-h-[160px] font-mono text-[11px]">
            {steps.slice(0, visibleSteps).map((step, i) => {
              const isLast = i === visibleSteps - 1 && progress < 100;
              return (
                <div key={step} className="flex items-center justify-between gap-2 animate-fade-rise-in">
                  <span style={{ color: '#6B6373' }} className="shrink-0">
                    [{String(i + 1).padStart(2, '0')}]
                  </span>
                  <span className="flex-1 truncate" style={{ color: isLast ? '#F4F1F7' : '#9B93A5' }}>
                    {step}
                  </span>
                  <span className="shrink-0" style={{ color: isLast ? '#A855F7' : '#22C55E' }}>
                    {isLast ? <span className="pulse-dot">···</span> : 'OK'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div
            className="h-2 w-full rounded-full overflow-hidden"
            style={{ background: '#121017', border: '1px solid #24202B' }}
          >
            <div
              className="h-full rounded-full transition-all duration-100 ease-linear"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #A855F7, #C026D3, #EC4899)',
                boxShadow: '0 0 12px rgba(168,85,247,0.4)',
              }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: '#A855F7' }}>
              <Sparkles size={11} /> Loading Security Telemetry
            </span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: '#F4F1F7' }}>
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
