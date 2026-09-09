'use client';

import React, { useEffect, useRef } from 'react';
import Card from '@/components/ui/Card';
import { Sparkles } from 'lucide-react';

interface AIFixEngineProps {
  data?: {
    fixesGenerated?: number;
    fixesVerified?: number;
    prsCreated?: number;
    verificationRate?: number;
  };
  fixesGenerated?: number;
  fixesVerified?: number;
  prsCreated?: number;
}

function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const startTime = performance.now();
    function step(now: number) {
      const pct = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - pct, 3);
      if (ref.current) ref.current.textContent = String(Math.round(value * eased));
      if (pct < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [value, duration]);
  return <span ref={ref} className="count-up">0</span>;
}

export default function AIFixEngine({
  data,
  fixesGenerated: fgProp,
  fixesVerified: fvProp,
  prsCreated: prProp,
}: AIFixEngineProps) {
  const fixesGenerated = data?.fixesGenerated ?? fgProp ?? 0;
  const fixesVerified = data?.fixesVerified ?? fvProp ?? 0;
  const prsCreated = data?.prsCreated ?? prProp ?? 0;

  const verificationRate =
    data?.verificationRate ??
    (fixesGenerated > 0 ? Math.round((fixesVerified / fixesGenerated) * 100) : 0);

  const circumference = 251;
  const dashOffset = circumference - (circumference * verificationRate) / 100;

  const stats = [
    { label: 'Fixes Generated',       value: fixesGenerated, color: '#A855F7' },
    { label: 'Successfully Verified', value: fixesVerified,  color: '#22C55E' },
    { label: 'PRs Created',           value: prsCreated,     color: '#EC4899' },
  ];

  return (
    <Card className="p-5 pl-card-glow" glow>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(192,38,211,0.12)', border: '1px solid rgba(192,38,211,0.25)' }}
        >
          <Sparkles size={14} style={{ color: '#C026D3' }} />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold leading-none" style={{ color: 'var(--foreground)' }}>
            AI Fix Engine
          </h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#C026D3' }}>
            ✦ Patchline X Intelligence Telemetry
          </p>
        </div>
      </div>

      {/* Circular progress + stats */}
      <div className="flex items-center gap-5">
        {/* SVG ring */}
        <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="48" cy="48" r="40"
              fill="none"
              stroke="#241B2D"
              strokeWidth="7"
            />
            <circle
              cx="48" cy="48" r="40"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
                filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.5))',
              }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-bold text-[18px] leading-none count-up" style={{ color: 'var(--foreground)' }}>
              {verificationRate}%
            </span>
            <span className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--muted-2)' }}>
              Verified
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          {stats.map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</span>
              <span
                className="font-mono font-semibold text-[14px] count-up"
                style={{ color }}
              >
                <AnimatedNumber value={value} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rate bar */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>Verification Rate</span>
          <span className="text-[12px] font-mono font-semibold" style={{ color: '#22C55E' }}>
            {verificationRate}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#241B2D' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.min(100, Math.max(0, verificationRate))}%`,
              background: 'linear-gradient(90deg, #A855F7, #C026D3, #EC4899)',
            }}
          />
        </div>
      </div>
    </Card>
  );
}
