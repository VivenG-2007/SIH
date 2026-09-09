'use client';

export default function ScanSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stepper Card Skeleton */}
      <div className="p-6 rounded-xl border border-border-default bg-bg-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-bg-card-raised skeleton-shimmer" />
            <div className="h-7 w-56 rounded-lg bg-bg-card-raised skeleton-shimmer" />
          </div>
          <div className="h-8 w-16 rounded bg-bg-card-raised skeleton-shimmer" />
        </div>

        {/* 8 Step Connectors Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <div key={s} className="p-3 rounded-lg border border-border-default bg-bg-card-raised/50 space-y-2">
              <div className="w-5 h-5 rounded-full bg-bg-card-raised skeleton-shimmer" />
              <div className="h-3 w-16 rounded bg-bg-card-raised skeleton-shimmer" />
            </div>
          ))}
        </div>

        {/* Terminal Log Box Skeleton */}
        <div className="h-32 w-full rounded-lg bg-bg-subtle border border-border-default" />
      </div>

      {/* Finding Card Skeletons */}
      <div className="space-y-3">
        <div className="h-5 w-36 rounded bg-bg-card skeleton-shimmer" />
        {[1, 2, 3].map((f) => (
          <div key={f} className="p-5 rounded-xl border border-border-default bg-bg-card space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-20 rounded-full bg-bg-card-raised skeleton-shimmer" />
              <div className="h-5 w-64 rounded bg-bg-card-raised skeleton-shimmer" />
            </div>
            <div className="h-4 w-full rounded bg-bg-card-raised skeleton-shimmer" />
            <div className="h-4 w-3/4 rounded bg-bg-card-raised skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
