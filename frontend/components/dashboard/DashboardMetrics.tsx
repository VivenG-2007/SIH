'use client';

import React, { useEffect, useRef } from 'react';
import { ShieldAlert, GitPullRequest, Activity, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import Card from '@/components/ui/Card';

interface DashboardMetricsProps {
  kpis: {
    connectedRepos: { value: number; deltaLabel?: string | null };
    openFindings: { value: number };
    criticalIssues: { value: number };
    aiFixesApplied: { value: number; windowLabel?: string | null };
  };
  severityBreakdown: { critical: number; high: number; medium: number };
  activePipelineCount?: number;
  clearanceRate?: number;
  averageFixTime?: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const start = 0;
    const end = value;
    const dur = 800;
    const startTime = performance.now();
    function step(now: number) {
      const pct = Math.min((now - startTime) / dur, 1);
      const eased = 1 - Math.pow(1 - pct, 3);
      if (ref.current) ref.current.textContent = String(Math.round(start + (end - start) * eased));
      if (pct < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [value]);
  return <span ref={ref} className="count-up">{value}</span>;
}

export default function DashboardMetrics({
  kpis,
  severityBreakdown,
  activePipelineCount = 1,
  clearanceRate = 96.2,
  averageFixTime = '1.4 min',
}: DashboardMetricsProps) {

  const cards = [
    {
      label: 'Repositories',
      value: kpis.connectedRepos.value,
      unit: 'connected',
      delta: kpis.connectedRepos.deltaLabel,
      deltaUp: true,
      icon: Activity,
      iconBg: 'rgba(168,85,247,0.12)',
      iconColor: '#A855F7',
      sub: <span style={{ color: '#22C55E', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        ↑ {clearanceRate}% clearance
      </span>,
      stagger: 'stagger-1',
    },
    {
      label: 'Active Pipelines',
      value: activePipelineCount,
      unit: 'live',
      icon: Activity,
      iconBg: 'rgba(34,197,94,0.10)',
      iconColor: '#22C55E',
      sub: <span className="flex items-center gap-1.5" style={{ color: '#22C55E', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot inline-block" />
        Daemon Healthy
      </span>,
      stagger: 'stagger-2',
    },
    {
      label: 'Vulnerabilities',
      value: kpis.openFindings.value,
      unit: 'open',
      icon: ShieldAlert,
      iconBg: 'rgba(244,63,94,0.10)',
      iconColor: '#F43F5E',
      sub: (
        <div className="flex items-center gap-2.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <span style={{ color: '#F43F5E' }}>● {severityBreakdown.critical} Crit</span>
          <span style={{ color: '#F97316' }}>● {severityBreakdown.high} High</span>
          <span style={{ color: '#EAB308' }}>● {severityBreakdown.medium} Med</span>
        </div>
      ),
      stagger: 'stagger-3',
    },
    {
      label: 'AI Fixes Shipped',
      value: kpis.aiFixesApplied.value,
      unit: 'PRs',
      icon: Sparkles,
      iconBg: 'rgba(192,38,211,0.10)',
      iconColor: '#C026D3',
      sub: <span style={{ color: '#A855F7', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        ✦ {kpis.aiFixesApplied.windowLabel ?? `avg ${averageFixTime}`}
      </span>,
      stagger: 'stagger-4',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, unit, icon: Icon, iconBg, iconColor, sub, stagger }) => (
        <Card
          key={label}
          className={`p-5 group animate-fade-rise-in ${stagger}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className="text-[11px] font-mono uppercase tracking-wider"
              style={{ color: 'var(--muted-2)' }}
            >
              {label}
            </div>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
              style={{ background: iconBg, color: iconColor, border: `1px solid ${iconColor}20` }}
            >
              <Icon size={15} strokeWidth={1.8} />
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="font-sans font-bold text-[28px] leading-none count-up" style={{ color: 'var(--foreground)' }}>
              <AnimatedNumber value={value} />
            </span>
            <span className="text-[13px]" style={{ color: 'var(--muted)' }}>{unit}</span>
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {sub}
          </div>
        </Card>
      ))}
    </div>
  );
}
