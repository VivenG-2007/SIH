'use client';

import React from 'react';
import { Search, Filter, RotateCcw, ArrowUpDown } from 'lucide-react';

export interface FilterState {
  searchQuery: string;
  status: string;
  severity: string;
  sortBy: 'recent' | 'oldest' | 'risk_desc' | 'findings_desc';
}

interface DashboardFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  paddingLeft: 10,
  paddingRight: 28,
  paddingTop: 6,
  paddingBottom: 6,
  borderRadius: 9,
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  color: 'var(--foreground)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  cursor: 'pointer',
};

export default function DashboardFilters({
  filters,
  onFilterChange,
  onReset,
  totalCount,
  filteredCount,
}: DashboardFiltersProps) {
  const isFiltered =
    filters.searchQuery !== '' ||
    filters.status !== 'ALL' ||
    filters.severity !== 'ALL' ||
    filters.sortBy !== 'recent';

  return (
    <div
      className="p-4 rounded-xl space-y-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-2)' }} />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search repository, branch, or vulnerability…"
            className="pl-input w-full"
            style={{ paddingLeft: 32, fontSize: 12 }}
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status */}
          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
              style={selectStyle}
            >
              <option value="ALL">All Statuses</option>
              <option value="Healthy">Healthy</option>
              <option value="Action Required">Action Required</option>
              <option value="Review Fixes">Review Fixes</option>
              <option value="Warning">Warning</option>
            </select>
            <Filter size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-2)' }} />
          </div>

          {/* Severity */}
          <div className="relative">
            <select
              value={filters.severity}
              onChange={(e) => onFilterChange({ ...filters, severity: e.target.value })}
              style={selectStyle}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <Filter size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-2)' }} />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(e) =>
                onFilterChange({ ...filters, sortBy: e.target.value as FilterState['sortBy'] })
              }
              style={selectStyle}
            >
              <option value="recent">Newest First (Date ↓)</option>
              <option value="oldest">Oldest First (Date ↑)</option>
              <option value="risk_desc">Risk: High → Low</option>
              <option value="findings_desc">Findings Count</option>
            </select>
            <ArrowUpDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-2)' }} />
          </div>

          {/* Reset */}
          {isFiltered && (
            <button
              type="button"
              onClick={onReset}
              title="Reset all filters"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 9,
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.22)',
                color: '#F43F5E',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={11} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <div
        className="flex items-center justify-between text-[11px] font-mono pt-2"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-2)' }}
      >
        <span>
          Showing <strong style={{ color: 'var(--foreground)' }}>{filteredCount}</strong> of {totalCount} repositories
        </span>
        {isFiltered && <span style={{ color: 'var(--primary)' }}>Active filters applied</span>}
      </div>
    </div>
  );
}
