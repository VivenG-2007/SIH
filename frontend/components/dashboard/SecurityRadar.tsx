'use client';

import React, { useSyncExternalStore } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import Card from '@/components/ui/Card';

const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface SecurityRadarProps {
  data?: { axis: string; value: number }[];
}

const EMPTY_RADAR = [
  { axis: 'Secrets',      value: 0 },
  { axis: 'Injection',    value: 0 },
  { axis: 'XSS',          value: 0 },
  { axis: 'Crypto',       value: 0 },
  { axis: 'Commands',     value: 0 },
  { axis: 'Dependencies', value: 0 },
];

export default function SecurityRadar({ data }: SecurityRadarProps) {
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  const radarData = data && data.length > 0 ? data : EMPTY_RADAR;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Security Exposure
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
            Attack surface by category
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: 'var(--muted-2)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'rgba(168,85,247,0.35)' }} />
          Exposure surface
        </div>
      </div>

      {!mounted ? (
        <div className="h-52 rounded-lg skeleton-obsidian" />
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
              <PolarGrid
                stroke="rgba(168,85,247,0.12)"
                gridType="polygon"
              />
              <PolarAngleAxis
                dataKey="axis"
                tick={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fill: 'var(--muted)',
                }}
              />
              <Radar
                name="Exposure"
                dataKey="value"
                stroke="#A855F7"
                strokeWidth={1.5}
                fill="rgba(168,85,247,0.18)"
                fillOpacity={1}
                dot={{
                  r: 3,
                  fill: '#A855F7',
                  stroke: '#17141C',
                  strokeWidth: 1.5,
                } as any}
                activeDot={{ r: 4, fill: '#C026D3' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
