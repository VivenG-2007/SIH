'use client';

import dynamic from 'next/dynamic';

// aurora-hero uses motion/react + @react-three/fiber which crash during SSR
const AuroraHero = dynamic(
  () => import('@/components/ui/aurora-hero').then((m) => ({ default: m.AuroraHero })),
  { ssr: false, loading: () => <div className="min-h-screen" style={{ background: '#070609' }} /> }
);

export default function AuroraHeroDemoPage() {
  return (
    <AuroraHero
      badgeText="Patchline X AI v2.0 Live"
      title={
        <>
          Autonomous Vulnerability <span className="text-white">Remediation</span>
        </>
      }
      description="Find security flaws, synthesize isolated GPT-4.1 mini patches, certify zero regressions, and open verified GitHub Pull Requests in minutes."
      ctaText="Launch Free Scanner"
      ctaHref="/login?mode=register"
    />
  );
}
