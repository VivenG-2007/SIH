'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { animate, motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { ShieldCheck, Lock, Github, Twitter, Linkedin } from 'lucide-react';
import { AURORA_COLORS } from '@/context/AuroraColorContext';

export function AuroraFooter() {
  const footerColor = useMotionValue(AURORA_COLORS[0]);

  useEffect(() => {
    const controls = animate(footerColor, AURORA_COLORS, {
      ease: 'easeInOut',
      duration: 20,
      repeat: Infinity,
      repeatType: 'mirror',
    });
    return () => controls.stop();
  }, [footerColor]);

  const backgroundImage = useMotionTemplate`radial-gradient(100% 100% at 50% 0%, ${footerColor} 0%, #020617 80%)`;

  return (
    <footer className="relative bg-[#020617] text-gray-400 overflow-hidden border-t border-white/10">
      {/* Top Edge Aurora Glow Continuation */}
      <motion.div
        style={{ backgroundImage }}
        className="absolute inset-x-0 top-0 h-48 opacity-25 pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-12 border-b border-white/10">
          {/* Col 1: Brand */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-sm">
                <ShieldCheck size={18} strokeWidth={2.2} />
              </div>
              <span className="font-display font-bold text-xl text-white">
                Patchline X <span className="font-mono text-xs opacity-75">AI</span>
              </span>
            </Link>
            <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
              Autonomous vulnerability discovery, GPT-4.1 mini patch synthesis, and deterministic AST regression certification.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href="https://github.com" target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors">
                <Github size={16} />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors">
                <Twitter size={16} />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors">
                <Linkedin size={16} />
              </a>
            </div>
          </div>

          {/* Col 2: Product */}
          <div className="space-y-3 text-xs font-mono">
            <div className="text-white font-semibold uppercase tracking-wider text-[11px]">Product</div>
            <div><Link href="/scanner" className="hover:text-white transition-colors">Vulnerability Scanner</Link></div>
            <div><Link href="/dashboard" className="hover:text-white transition-colors">Security Operations</Link></div>
            <div><Link href="/scanner/history" className="hover:text-white transition-colors">Audit Ledger</Link></div>
            <div><Link href="/upload" className="hover:text-white transition-colors">AI Reasoner</Link></div>
          </div>

          {/* Col 3: Integrations */}
          <div className="space-y-3 text-xs font-mono">
            <div className="text-white font-semibold uppercase tracking-wider text-[11px]">Ecosystem</div>
            <div><Link href="/github" className="hover:text-white transition-colors">GitHub OAuth</Link></div>
            <div><Link href="/jira" className="hover:text-white transition-colors">Atlassian Jira</Link></div>
            <div><a href="https://azure.microsoft.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Azure Blob Store</a></div>
            <div><Link href="/onboarding" className="hover:text-white transition-colors">Setup Wizard</Link></div>
          </div>

          {/* Col 4: Compliance */}
          <div className="space-y-3 text-xs font-mono">
            <div className="text-white font-semibold uppercase tracking-wider text-[11px]">Security &amp; Trust</div>
            <div><span className="text-emerald-400">● SOC2 Type II Ready</span></div>
            <div><span>RS256 Asymmetric JWT</span></div>
            <div><span>OWASP Top 10 Rules</span></div>
            <div><span>Zero Data Retention</span></div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-gray-500">
          <div>© {new Date().getFullYear()} Patchline X AI Technologies Inc. All rights reserved.</div>
          <div className="flex items-center gap-2">
            <Lock size={12} className="text-emerald-400" />
            <span>End-to-End Encrypted Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default AuroraFooter;
