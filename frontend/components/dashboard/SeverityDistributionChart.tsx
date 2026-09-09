'use client';

import React, { useSyncExternalStore } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '@/components/ui/Card';
import { ShieldCheck } from 'lucide-react';

const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface SeverityDistributionProps {
  critical: number;
  high: number;
  medium: number;
  low?: number;
  globalRiskScore?: number;
}

export default function SeverityDistributionChart({
  critical,
  high,
  medium,
  low = 0,
  globalRiskScore = 32,
}: SeverityDistributionProps) {
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  const total = critical + high + medium + low;

  const data = [
    { name: 'Critical', value: critical, color: '#F43F5E' },
    { name: 'High',     value: high,     color: '#F97316' },
    { name: 'Medium',   value: medium,   color: '#EAB308' },
    { name: 'Low',      value: low,      color: '#22C55E' },
  ].filter((d) => d.value > 0);

  const riskColor = globalRiskScore > 60 ? '#F43F5E' : globalRiskScore > 30 ? '#EAB308' : '#22C55E';

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const pct = Math.round(((d.value as number) / total) * 100);
    return (
      <div style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '6px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--foreground)',
        boxShadow: 'var(--card-glow)',
      }}>
        <span style={{ color: d.payload.color }}>● </span>
        <span style={{ color: 'var(--foreground)' }}>{d.name}: {d.value} ({pct}%)</span>
      </div>

    );
  };

  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Severity Spectrum
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>Breakdown by CVSS risk tier</p>
        </div>
        <span
          className="font-mono text-[11px] px-2 py-0.5 rounded-md"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          {total} issues
        </span>
      </div>

      {total === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
            style={{ background: 'rgba(34,197,94,0.10)', color: '#22C55E' }}>
            <ShieldCheck size={22} />
          </div>
          <div className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Zero Flaws Detected</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--muted-2)' }}>All repositories passed checks.</div>
        </div>
      ) : !mounted ? (
        <div className="h-44 my-2 rounded-lg skeleton-obsidian" />
      ) : (
        <>
          <div className="relative h-44 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                  animationBegin={0}
                  animationDuration={900}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>
                Risk Index
              </span>
              <span className="font-bold text-[26px] leading-none count-up" style={{ color: riskColor }}>
                {globalRiskScore}
              </span>
              <span className="text-[9px] font-mono" style={{ color: 'var(--muted-2)' }}>/100</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {data.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--surface-2)' }}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                  {item.name}
                </span>
                <span className="font-mono font-semibold text-[12px]" style={{ color: 'var(--foreground)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
