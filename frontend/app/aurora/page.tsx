'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AuroraColorProvider } from '@/context/AuroraColorContext';
import { AuroraNavbar } from '@/components/aurora/AuroraNavbar';
import { AuroraCursorGlow } from '@/components/aurora/AuroraCursorGlow';

const AuroraHero = dynamic(
  () => import('@/components/ui/aurora-hero').then((m) => ({ default: m.AuroraHero })),
  { ssr: false, loading: () => <div className="min-h-screen bg-[#020617]" /> }
);
import { AuroraStats } from '@/components/aurora/AuroraStats';
import { AuroraFeatureCards } from '@/components/aurora/AuroraFeatureCards';
import { AuroraDivider } from '@/components/aurora/AuroraDivider';
import { AuroraReveal } from '@/components/aurora/AuroraReveal';
import { AuroraTestimonials } from '@/components/aurora/AuroraTestimonials';
import { AuroraPricing } from '@/components/aurora/AuroraPricing';
import { AuroraFooter } from '@/components/aurora/AuroraFooter';

export default function AuroraShowcasePage() {
  return (
    <AuroraColorProvider>
      <div className="min-h-screen bg-[#020617] text-gray-100 font-sans selection:bg-cyan-500 selection:text-white relative">
        {/* Desktop Spring Cursor Glow */}
        <AuroraCursorGlow />

        {/* Sticky Dynamic Glowing Navbar */}
        <AuroraNavbar />

        {/* Full-Viewport Hero with 3D Starfield & Radial Aurora */}
        <AuroraHero
          badgeText="Beta Now Live — Patchline X AI v2.0"
          title={
            <>
              Decrease vulnerability dwell time by over <span className="text-white font-bold">90%</span>
            </>
          }
          description="Autonomous AST syntax discovery, GPT-4.1 mini isolated patch synthesis, and deterministic regression certification for modern engineering workflows."
          ctaText="Start Free Security Scan"
          ctaHref="/login?mode=register"
        />

        {/* Animated Aurora Divider */}
        <AuroraDivider />

        {/* Stats Counter Section */}
        <section id="stats" className="py-20">
          <AuroraReveal>
            <div className="text-center max-w-2xl mx-auto px-6 mb-12">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                Verified Benchmark Telemetry
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-2">
                Deterministic security at lightning velocity
              </h2>
            </div>
          </AuroraReveal>
          <AuroraStats />
        </section>

        {/* Animated Aurora Divider */}
        <AuroraDivider />

        {/* Feature Cards Grid Section */}
        <section id="features" className="py-20">
          <AuroraReveal>
            <div className="text-center max-w-2xl mx-auto px-6 mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                8-Stage Security Pipeline
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-2">
                Engineered for zero-regression autonomous remediation
              </h2>
              <p className="text-sm text-gray-400 mt-2">
                Every scan executes on isolated BullMQ workers with human-in-the-loop gates.
              </p>
            </div>
          </AuroraReveal>
          <AuroraFeatureCards />
        </section>

        {/* Animated Aurora Divider */}
        <AuroraDivider />

        {/* Testimonials Carousel Section */}
        <section id="testimonials" className="py-20">
          <AuroraReveal>
            <div className="text-center max-w-2xl mx-auto px-6 mb-8">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                Industry Endorsements
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-2">
                Trusted by security engineering leaders
              </h2>
            </div>
          </AuroraReveal>
          <AuroraTestimonials />
        </section>

        {/* Animated Aurora Divider */}
        <AuroraDivider />

        {/* Pricing Section */}
        <section id="pricing" className="py-20">
          <AuroraReveal>
            <div className="text-center max-w-2xl mx-auto px-6 mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                Predictable Transparent Tiers
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-2">
                Scale from solo developer to enterprise fleet
              </h2>
            </div>
          </AuroraReveal>
          <AuroraPricing />
        </section>

        {/* Footer with 20s Aurora Gradient Continuation */}
        <AuroraFooter />
      </div>
    </AuroraColorProvider>
  );
}
