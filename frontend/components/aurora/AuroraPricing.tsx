'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useMotionTemplate } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { useAuroraColor } from '@/context/AuroraColorContext';

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  recommended?: boolean;
  ctaText: string;
  ctaHref: string;
}

const TIERS: PricingTier[] = [
  {
    name: 'Developer',
    price: '$0',
    period: 'forever free',
    description: 'Essential deterministic SAST scanning for individual engineers and open source.',
    features: [
      'Up to 3 GitHub Repositories',
      '8-Stage Security Pipeline',
      'Tree-sitter AST Syntax Parsing',
      'Community Semgrep Rulesets',
      'Manual Unified Diff Export',
    ],
    ctaText: 'Start Free Scan',
    ctaHref: '/login?mode=register',
  },
  {
    name: 'Pro Team',
    price: '$49',
    period: 'per seat / month',
    description: 'Autonomous GPT-4.1 mini patch synthesis with human-approval gates for high-velocity teams.',
    recommended: true,
    features: [
      'Unlimited Monitored Repos',
      'Autonomous GPT-4.1 mini Fix Synthesis',
      'Deterministic Regression Testing',
      'Automated GitHub PR Dispatch',
      'Atlassian Jira Issue Sync',
      'Real-Time Redis BullMQ Telemetry',
    ],
    ctaText: 'Start 14-Day Trial',
    ctaHref: '/login?mode=register',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'annual billing',
    description: 'Dedicated multi-service isolation with custom AST rules and custom SLA guarantees.',
    features: [
      'Dedicated Azure App Service Node',
      'RS256 Private JWKS Key Rotation',
      'Custom OWASP Compliance Policies',
      'Unlimited Azure Blob Audit Archive',
      '99.99% Uptime SLA Guarantee',
      'Dedicated Solutions Architect',
    ],
    ctaText: 'Contact Sales',
    ctaHref: '/login?mode=register',
  },
];

export function AuroraPricing({ tiers = TIERS }: { tiers?: PricingTier[] }) {
  const color = useAuroraColor();

  const recommendedBorder = useMotionTemplate`1.5px solid ${color}`;
  const recommendedShadow = useMotionTemplate`0 10px 40px -8px ${color}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto px-6 items-stretch">
      {tiers.map((tier) => {
        const isRec = tier.recommended;

        return (
          <motion.div
            key={tier.name}
            style={{
              border: isRec ? recommendedBorder : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: isRec ? recommendedShadow : '0 4px 20px -4px rgba(0, 0, 0, 0.5)',
            }}
            whileHover={{ y: -4 }}
            className={`relative rounded-3xl p-8 bg-gray-900/60 backdrop-blur-xl flex flex-col justify-between transition-transform duration-200 ${
              isRec ? 'bg-gradient-to-b from-gray-900/90 to-gray-950/90' : ''
            }`}
          >
            {isRec && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <motion.span
                  style={{ borderColor: color }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gray-950 border text-[11px] font-mono font-semibold text-white shadow-lg"
                >
                  <Sparkles size={12} className="text-amber-400" />
                  Most Popular
                </motion.span>
              </div>
            )}

            <div>
              <h3 className="font-display text-xl font-bold text-white mb-2">{tier.name}</h3>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed">{tier.description}</p>

              <div className="mb-6 flex items-baseline gap-1.5">
                <span className="font-display text-4xl sm:text-5xl font-bold text-white tracking-tight">
                  {tier.price}
                </span>
                <span className="text-xs font-mono text-gray-400">{tier.period}</span>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/10 mb-8">
                {tier.features.map((feat) => (
                  <div key={feat} className="flex items-start gap-2.5 text-xs text-gray-300">
                    <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link href={tier.ctaHref} className="block w-full">
              <button
                type="button"
                className={`w-full py-3 rounded-xl font-mono text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  isRec
                    ? 'bg-white text-gray-950 hover:bg-gray-200 shadow-md active:scale-98'
                    : 'border border-white/20 bg-white/5 text-white hover:bg-white/10 active:scale-98'
                }`}
              >
                {tier.ctaText} →
              </button>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export default AuroraPricing;
