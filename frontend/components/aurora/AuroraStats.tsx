'use client';

import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionTemplate } from 'motion/react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export interface StatItem {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel?: string;
}

const DEFAULT_STATS: StatItem[] = [
  { value: 98, suffix: '%', label: 'Vulnerability Detection Rate', sublabel: 'Benchmarked against OWASP Top 10' },
  { value: 0, suffix: ' Regressions', label: 'Certified Clean Code', sublabel: 'AST re-scanned before PR creation' },
  { value: 1.4, suffix: 'm', label: 'Mean Time to Remediation', sublabel: 'From ingestion to verified PR' },
  { value: 100, suffix: '%', label: 'Human-Gated Control', sublabel: 'Strict 3-attempt safety thresholds' },
];

export function AuroraStats({ stats = DEFAULT_STATS }: { stats?: StatItem[] }) {
  const color = useAuroraColor();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto px-6">
      {stats.map((stat, idx) => (
        <StatCard key={stat.label} stat={stat} color={color} delay={idx * 0.1} />
      ))}
    </div>
  );
}

function StatCard({ stat, color, delay }: { stat: StatItem; color: any; delay: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  const border = useMotionTemplate`1px solid ${color}`;
  const boxShadow = useMotionTemplate`0 4px 20px -6px ${color}`;

  useEffect(() => {
    if (isInView) {
      const controls = animate(0, stat.value, {
        duration: 2.2,
        delay,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (latest) => {
          setDisplayValue(stat.value % 1 !== 0 ? Number(latest.toFixed(1)) : Math.round(latest));
        },
      });
      return () => controls.stop();
    }
  }, [isInView, stat.value, delay]);

  return (
    <motion.div
      ref={ref}
      style={{
        border,
        boxShadow,
      }}
      className="p-6 rounded-2xl bg-gray-900/60 backdrop-blur-md text-center flex flex-col justify-between"
    >
      <div>
        <div className="font-display text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent mb-2 tabular-nums">
          {stat.prefix}
          {displayValue}
          {stat.suffix}
        </div>
        <h4 className="text-sm font-semibold text-white tracking-tight">{stat.label}</h4>
      </div>
      {stat.sublabel && (
        <p className="text-xs text-gray-400 mt-2 font-sans">{stat.sublabel}</p>
      )}
    </motion.div>
  );
}

export default AuroraStats;
