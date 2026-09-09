import Link from 'next/link';
import { ArrowRight, ShieldCheck, GitPullRequest, Radar, Sparkles, CheckCircle2, Lock, Cpu, Play } from 'lucide-react';
import ServiceStatus from '@/components/ServiceStatus';
import TopNav from '@/components/TopNav';
import { GradientButton } from '@/components/ui/gradient-button';

const PILLARS = [
  {
    icon: Radar,
    title: 'Find it',
    body: 'Point it at any repository. 8-stage deterministic SAST + AI analysis returns CWE-tagged findings with exact coordinates.',
  },
  {
    icon: ShieldCheck,
    title: 'Fix it',
    body: 'Every fix is synthesized on an isolated branch and gated for human review with a 3-attempt safety threshold.',
  },
  {
    icon: Sparkles,
    title: 'Verify it',
    body: 'The generated patch undergoes deterministic AST re-scanning and test execution to certify 0 regressions.',
  },
  {
    icon: GitPullRequest,
    title: 'Ship it',
    body: 'One-click human approval triggers a direct Pull Request dispatch on GitHub, ready for team merge.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-bg-base transition-colors duration-300">
      <TopNav />

      {/* Hero section */}
      <section className="relative overflow-hidden grid-overlay pt-16">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-xs text-accent-cyan border border-accent-cyan/30 bg-accent-cyan-soft rounded-full px-3.5 py-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-accent-cyan pulse-dot" />
            Patchline X Financial Risk Intelligence Platform
          </div>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mt-6 text-text-primary">
            What is your cyber risk <span className="text-accent-cyan">actually costing you?</span>
          </h1>

          <p className="mt-6 text-text-secondary text-lg leading-relaxed max-w-2xl mx-auto font-sans">
            Quantify cyber risk in real financial terms — Expected Annual Loss, Value at Risk,
            and a provably-optimal security investment plan — backed by cited industry data.
            No codebase required to get started.
          </p>

          <div className="mt-9 flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login?mode=register&next=/assessment">
              <GradientButton className="text-xs font-mono py-3 px-6 gap-2">
                Get My Financial Risk Assessment <ArrowRight size={15} />
              </GradientButton>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-border-default hover:border-border-hover bg-bg-card text-text-primary font-semibold rounded-xl px-6 py-3 text-xs font-mono hover:bg-bg-subtle transition-all shadow-sm active:scale-95"
            >
              Sign In to Console
            </Link>
          </div>

          <p className="mt-5 text-xs font-mono text-text-muted">
            Have a codebase?{' '}
            <Link href="/login?mode=register&next=/onboarding" className="text-accent-cyan hover:underline">
              Scan with us
            </Link>{' '}
            — optional, for scan-derived findings instead of self-reported estimates.
          </p>

          {/* Interactive Console Teaser */}
          <div className="relative mt-16 max-w-3xl mx-auto">
            <div className="relative bg-bg-card border border-border-default rounded-2xl overflow-hidden shadow-2xl text-left transition-all">
              <div className="scanline" />
              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border-default">
                <div className="p-4 space-y-2">
                  <div className="font-mono text-[10px] text-accent-cyan uppercase tracking-wider font-semibold">
                    8-Stage Pipeline
                  </div>
                  <div className="text-xs text-text-secondary space-y-1.5">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" /> AST Syntax Tree Built
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" /> Semgrep SAST Executed
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-accent-rose font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-rose pulse-dot" /> CWE-89 Flaw Caught
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-1.5">
                  <div className="font-mono text-[10px] text-accent-rose uppercase tracking-wider font-semibold">
                    Discovered Flaw
                  </div>
                  <div className="text-xs text-text-primary font-mono font-bold">SQL Injection in Controller</div>
                  <div className="text-xs text-text-secondary leading-relaxed">Raw string template in db.query</div>
                  <div className="text-[11px] font-mono text-accent-rose bg-accent-rose-soft/80 px-2 py-0.5 rounded inline-block">
                    − const q = `SELECT * WHERE id = &apos;${'${userId}'}&apos;`
                  </div>
                </div>

                <div className="p-4 space-y-1.5">
                  <div className="font-mono text-[10px] text-accent-emerald uppercase tracking-wider font-semibold">
                    Synthesized Patch
                  </div>
                  <div className="text-xs text-text-primary font-mono font-bold">Parameterized Query</div>
                  <div className="text-xs text-text-secondary leading-relaxed">0 Regressions Certified</div>
                  <div className="text-[11px] font-mono text-accent-emerald bg-accent-emerald-soft/80 px-2 py-0.5 rounded inline-block">
                    + const q = &apos;SELECT * WHERE id = $1&apos;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section id="product" className="border-t border-border-default py-20 bg-bg-card/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="font-mono text-xs uppercase tracking-widest text-accent-cyan">Autonomous Architecture</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mt-2">
              Trusted engineering workflow with human-in-the-loop gates
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-6 rounded-2xl border border-border-default bg-bg-card hover:border-border-hover transition-all group">
                <div className="w-10 h-10 rounded-xl bg-accent-cyan-soft border border-accent-cyan/30 flex items-center justify-center text-accent-cyan mb-4 group-hover:scale-110 transition-transform">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <h3 className="font-display text-lg font-bold text-text-primary mb-2">{title}</h3>
                <p className="text-text-secondary text-xs leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture & Services Status */}
      <section id="architecture" className="border-t border-border-default py-20">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div>
              <span className="font-mono text-xs tracking-widest text-accent-cyan uppercase font-semibold">
                Architecture Blueprint
              </span>
              <h2 className="font-display text-3xl font-bold mt-2 text-text-primary">
                Multi-service isolation, zero-trust boundary
              </h2>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {[
                ['auth-service', 'RS256 asymmetric JWT rotation, httpOnly secure cookies, refresh rotation.'],
                ['main-service', 'High-throughput Node.js gateway with local JWT verification & Redis BullMQ queue.'],
                ['ai-storage-service', 'FastAPI Python daemon with AST Tree-sitter, Semgrep engine, and Azure Blob storage.'],
              ].map(([name, desc]) => (
                <div key={name} className="p-4 rounded-xl border border-border-default bg-bg-card flex items-start gap-3">
                  <Cpu size={16} className="text-accent-cyan mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-text-primary">{name}</div>
                    <div className="text-text-secondary text-xs mt-1 leading-relaxed font-sans">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <ServiceStatus />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-default py-8 bg-bg-card/60">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-text-muted">
          <span>© {new Date().getFullYear()} Patchline X AI Technologies. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <Lock size={12} className="text-accent-emerald" /> Enterprise Grade · SOC2 Type II Certified
          </span>
        </div>
      </footer>
    </main>
  );
}
