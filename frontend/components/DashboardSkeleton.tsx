'use client';

function Skel({ w = 'w-full', h = 'h-4', className = '' }) {
  return (
    <div
      className={`skeleton-obsidian ${w} ${h} ${className}`}
      style={{ borderRadius: 8 }}
    />
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-xl space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <Skel w="w-24" h="h-3" />
              <div className="w-8 h-8 rounded-xl skeleton-obsidian" />
            </div>
            <Skel w="w-20" h="h-7" />
            <Skel w="w-32" h="h-2.5" />
          </div>
        ))}
      </div>

      {/* Hero chart + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-2 p-5 rounded-xl space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <Skel w="w-40" h="h-4" />
            <Skel w="w-24" h="h-7" />
          </div>
          <Skel h="h-56" />
        </div>
        <div
          className="p-5 rounded-xl space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <Skel w="w-36" h="h-4" />
          <div className="flex items-center justify-center h-44">
            <div
              className="w-28 h-28 rounded-full skeleton-obsidian"
              style={{ border: '6px solid var(--surface-elevated)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[1,2,3,4].map((i) => <Skel key={i} h="h-8" />)}
          </div>
        </div>
      </div>

      {/* Heatmap + AI engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1,2].map((i) => (
          <div key={i} className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Skel w="w-40" h="h-4" />
            <Skel h="h-40" />
          </div>
        ))}
      </div>

      {/* Repos at risk + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1,2].map((i) => (
          <div key={i} className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Skel w="w-36" h="h-4" />
            {[1,2,3,4].map((j) => (
              <div key={j} className="space-y-1.5">
                <Skel w="w-32" h="h-3" />
                <Skel h="h-2.5" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-4 flex flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-[200px]"><Skel h="h-9" /></div>
          <Skel w="w-24" h="h-9" />
          <Skel w="w-24" h="h-9" />
        </div>
        <div>
          {[1,2,3,4,5].map((row) => (
            <div
              key={row}
              className="px-5 py-3 flex items-center justify-between gap-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="space-y-1.5 flex-1">
                <Skel w="w-48" h="h-3.5" />
                <Skel w="w-28" h="h-2.5" />
              </div>
              <Skel w="w-16" h="h-5" />
              <Skel w="w-20" h="h-5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
