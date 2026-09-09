'use client';

import React, { useState } from 'react';
import Card from '@/components/ui/Card';

const VULN_TYPES = [
  'SQL Injection',
  'XSS',
  'Secrets',
  'Cmd Injection',
  'Weak Crypto',
  'Path Traversal',
];

const WEEKS = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'];

const HEAT_COLORS = ['#1B1720', '#241B2D', '#492052', '#7A247C', '#C026D3'];
const HEAT_LABELS = ['0 findings', 'Low', 'Medium', 'High', 'Critical'];

interface Tooltip {
  row: number;
  col: number;
  val: number;
  x: number;
  y: number;
}

interface VulnHeatmapProps {
  data?: { type: string; weeks: number[] }[];
}

export default function VulnHeatmap({ data }: VulnHeatmapProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Map incoming API data or default to 0 matrix
  const matrix: Record<string, number[]> = {};
  for (const t of VULN_TYPES) {
    matrix[t] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  if (data && Array.isArray(data)) {
    for (const item of data) {
      if (matrix[item.type] && Array.isArray(item.weeks)) {
        matrix[item.type] = item.weeks;
      }
    }
  }

  function getIntensity(count: number): number {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  }

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Vulnerability Heatmap
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
            Finding frequency — last 12 weeks
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted-2)' }}>0</span>
          {HEAT_COLORS.map((c, i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-sm inline-block"
              style={{ background: c }}
            />
          ))}
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted-2)' }}>High</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 460 }}>
          {/* Week headers */}
          <div className="flex mb-1.5" style={{ paddingLeft: 88 }}>
            {WEEKS.map((w) => (
              <div
                key={w}
                className="flex-1 text-center text-[9px] font-mono"
                style={{ color: 'var(--muted-2)' }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Rows */}
          {VULN_TYPES.map((vuln, row) => {
            const rowCounts = matrix[vuln] || [0,0,0,0,0,0,0,0,0,0,0,0];
            return (
              <div key={vuln} className="flex items-center mb-1">
                <div
                  className="w-20 shrink-0 text-[10px] font-mono text-right pr-3 truncate"
                  style={{ color: 'var(--muted)' }}
                >
                  {vuln}
                </div>

                {WEEKS.map((_, col) => {
                  const count = rowCounts[col] || 0;
                  const intensity = getIntensity(count);
                  const bg = HEAT_COLORS[intensity];
                  const isHovered = tooltip?.row === row && tooltip?.col === col;

                  return (
                    <div
                      key={col}
                      className="flex-1 mx-0.5"
                      style={{ position: 'relative' }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ row, col, val: count, x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="rounded-sm transition-all duration-100"
                        style={{
                          height: 14,
                          background: bg,
                          border: isHovered ? '1px solid rgba(168,85,247,0.6)' : '1px solid transparent',
                          transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                          cursor: 'default',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip !== null && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x + 8,
            top: tooltip.y - 54,
          }}
        >
          <div
            className="px-2.5 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap"
            style={{
              background: '#17141C',
              border: '1px solid #302A38',
              color: 'var(--foreground)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ color: 'var(--muted-2)', marginBottom: 2 }}>
              {WEEKS[tooltip.col]} — {VULN_TYPES[tooltip.row]}
            </div>
            <div style={{ color: '#C026D3' }}>
              {tooltip.val} finding{tooltip.val === 1 ? '' : 's'} ({HEAT_LABELS[getIntensity(tooltip.val)]})
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
