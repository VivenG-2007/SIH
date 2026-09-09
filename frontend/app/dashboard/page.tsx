'use client';

import ProtectedShell from '@/components/ProtectedShell';
import RiskCommandCenter from '@/components/dashboard/RiskCommandCenter';

export default function DashboardPage() {
  return (
    <ProtectedShell>
      <RiskCommandCenter />
    </ProtectedShell>
  );
}

