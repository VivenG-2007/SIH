'use client';

import React, { useState } from 'react';
import { motion, useMotionTemplate } from 'motion/react';
import { Radar, ShieldCheck, Sparkles, GitPullRequest, Terminal, Cpu, Lock, CheckCircle2 } from 'lucide-react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export interface FeatureItem {
  icon: React.ElementType;
  title: string;
  description: string;
  tag: string;
}

const DEFAULT_FEATURES: FeatureItem[] = [
  {
    icon: Radar,
    title: 'AST & SAST Vulnerability Radar',
    description: 'Tree-sitter AST syntax parsing combined with deterministic Semgrep rulesets catches injection sinks and tainted data-flow.',
    tag: 'Stage 1-4',
  },
  {
    icon: Sparkles,
    title: 'GPT-4.1 mini Patch Synthesis',
    description: 'Generates secure, isolated fix candidates directly on dedicated PR branches with zero context pollution.',
    tag: 'Stage 5-6',
  },
  {
    icon: ShieldCheck,
    title: 'Deterministic Regression Gate',
    description: 'Re-scans synthesized diffs to certify 0 new vulnerabilities before requesting human approval.',
    tag: 'Stage 7',
  },
  {
    icon: GitPullRequest,
    title: 'Automated GitHub PR Dispatch',
    description: 'Dispatches complete pull requests with comprehensive remediation notes and security audit logs.',
    tag: 'Stage 8',
  },
  {
    icon: Terminal,
    title: 'Real-Time Telemetry Inspector',
    description: 'Live log stream traces worker daemon execution, BullMQ jobs, and Redis status across the pipeline.',
    tag: 'Live Logs',
  },
  {
    icon: Lock,
    title: 'Zero-Trust Isolation',
    description: 'RS256 asymmetric cryptographic verification with httpOnly token rotation for complete enterprise compliance.',
    tag: 'Enterprise',
  },
];

export function AuroraFeatureCards({ features = DEFAULT_FEATURES }: { features?: FeatureItem[] }) {
  const color = useAuroraColor();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto px-6">
      {features.map((feature, idx) => (
        <FeatureCardItem key={feature.title} feature={feature} color={color} />
      ))}
    </div>
  );
}

function FeatureCardItem({ feature, color }: { feature: FeatureItem; color: any }) {
  const [hovered, setHovered] = useState(false);
  const Icon = feature.icon;

  const border = useMotionTemplate`1px solid ${hovered ? color : 'rgba(255, 255, 255, 0.1)'}`;
  const boxShadow = useMotionTemplate`0 8px 32px -4px ${hovered ? color : 'transparent'}`;

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.03 }}
      style={{
        border,
        boxShadow,
      }}
      className="relative p-7 rounded-2xl bg-gray-900/60 backdrop-blur-md transition-all duration-300 flex flex-col justify-between group overflow-hidden"
    >
      <div>
        <div className="flex items-center justify-between mb-5">
          <motion.div
            animate={{
              rotate: hovered ? 8 : 0,
              scale: hovered ? 1.15 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-inner group-hover:bg-white/10 transition-colors"
          >
            <Icon size={22} strokeWidth={2} />
          </motion.div>

          <span className="text-[11px] font-mono uppercase tracking-wider text-gray-400 px-2.5 py-1 rounded-md bg-white/5 border border-white/10">
            {feature.tag}
          </span>
        </div>

        <h3 className="font-display text-lg font-bold text-white mb-2 tracking-tight">
          {feature.title}
        </h3>

        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
          {feature.description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-1.5 text-xs font-mono text-gray-300">
        <CheckCircle2 size={13} className="text-emerald-400" />
        <span>Enterprise Verified</span>
      </div>
    </motion.div>
  );
}

export default AuroraFeatureCards;
