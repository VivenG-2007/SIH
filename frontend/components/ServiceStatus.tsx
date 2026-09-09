'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

type Status = 'checking' | 'up' | 'down';

const SERVICES = [
  { label: 'auth-service', getUrl: () => `${process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:5000'}/health` },
  { label: 'main-service', getUrl: () => `${process.env.NEXT_PUBLIC_MAIN_API_URL || 'http://localhost:5001'}/health` },
];

export default function ServiceStatus() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({
    'auth-service': 'checking',
    'main-service': 'checking',
  });

  useEffect(() => {
    SERVICES.forEach((s) => {
      axios
        .get(s.getUrl(), { timeout: 4000 })
        .then(() => setStatuses((prev) => ({ ...prev, [s.label]: 'up' })))
        .catch(() => setStatuses((prev) => ({ ...prev, [s.label]: 'down' })));
    });
  }, []);

  const dotColor = (s: Status) => (s === 'up' ? 'bg-accent-emerald' : s === 'down' ? 'bg-accent-rose' : 'bg-text-muted');
  const textColor = (s: Status) => (s === 'up' ? 'text-accent-emerald' : s === 'down' ? 'text-accent-rose' : 'text-text-muted');

  return (
    <div className="border border-border-default rounded-2xl p-5 bg-bg-card font-mono text-xs shadow-sm">
      <div className="text-text-muted uppercase tracking-wider text-[10px] mb-3 flex items-center justify-between">
        <span>System Status Telemetry</span>
        <span className="text-[10px] font-normal text-text-secondary">Direct Health Checks</span>
      </div>
      <div className="space-y-2.5">
        {SERVICES.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-text-primary font-medium">{s.label}</span>
            <span className={`flex items-center gap-1.5 ${textColor(statuses[s.label])}`}>
              <span className={`w-2 h-2 rounded-full ${dotColor(statuses[s.label])} ${statuses[s.label] === 'checking' ? 'pulse-dot' : ''}`} />
              {statuses[s.label] === 'checking' ? 'Checking…' : statuses[s.label] === 'up' ? 'Online' : 'Unreachable'}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between opacity-60 pt-1 border-t border-border-default">
          <span className="text-text-primary">ai-storage-service</span>
          <span className="text-accent-cyan text-[11px]">Forwarded (Proxy)</span>
        </div>
      </div>
    </div>
  );
}
