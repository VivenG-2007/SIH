'use client';

import React from 'react';
import Card from '@/components/ui/Card';
import { FolderGit2, CheckCircle2 } from 'lucide-react';

interface RepoRisk {
  name: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

const MAX_SQUARES = 24;

function RiskBar({ repo }: { repo: RepoRisk }) {
  const total = Math.max(1, repo.total);
  const squares = Array.from({ length: MAX_SQUARES }, (_, i) => {
    const critThreshold = Math.round((repo.critical / total) * MAX_SQUARES);
    const highThreshold = Math.round(((repo.critical + repo.high) / total) * MAX_SQUARES);
    const medThreshold  = Math.round(((repo.critical + repo.high + repo.medium) / total) * MAX_SQUARES);

    if (i < critThreshold) return '#F43F5E';
    if (i < highThreshold) return '#F97316';
    if (i < medThreshold)  return '#EAB308';
    return '#1B1720';
  });

  return (
    <div className="flex gap-0.5">
      {squares.map((color, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

interface RepoAtRiskProps {
  repos?: RepoRisk[];
}

export default function RepoAtRisk({ repos = [] }: RepoAtRiskProps) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Repositories at Risk
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
            Severity distribution by repository
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {[['#F43F5E','Crit'],['#F97316','High'],['#EAB308','Med']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1" style={{ color: 'var(--muted-2)' }}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Repo list */}
      {repos.length === 0 ? (
        <div className="h-44 flex flex-col items-center justify-center text-center p-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
            style={{ background: 'rgba(34,197,94,0.10)', color: '#22C55E' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--foreground)' }}>Zero At-Risk Repositories</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted-2)' }}>No critical or high severity vulnerabilities found.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {repos.map((repo) => (
            <div key={repo.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <FolderGit2 size={12} style={{ color: 'var(--muted-2)', flexShrink: 0 }} />
                  <span className="font-mono text-[12px] truncate max-w-[220px]" style={{ color: 'var(--foreground)' }}>
                    {repo.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  {repo.critical > 0 && (
                    <span style={{ color: '#F43F5E' }}>Crit: {repo.critical}</span>
                  )}
                  <span style={{ color: '#F97316' }}>High: {repo.high}</span>
                </div>
              </div>
              <RiskBar repo={repo} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
