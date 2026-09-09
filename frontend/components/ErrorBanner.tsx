'use client';

import { useState } from 'react';
import { AlertCircle, RefreshCw, Copy, Check, Terminal } from 'lucide-react';

interface ErrorBannerProps {
  title?: string;
  message: string;
  category?: 'NETWORK' | 'GATEWAY' | 'STORAGE' | 'AUTH' | 'PARSER' | 'RATE_LIMIT';
  traceId?: string;
  onRetry?: () => void | Promise<void>;
  className?: string;
}

export default function ErrorBanner({
  title = 'Service Anomaly Encountered',
  message,
  category = 'GATEWAY',
  traceId,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const currentTraceId = traceId || `trc_${Math.random().toString(36).substring(2, 10)}`;

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const copyTrace = () => {
    navigator.clipboard.writeText(`Error: ${message}\nTraceID: ${currentTraceId}\nCategory: ${category}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-accent-rose/30 bg-bg-card p-5 shadow-lg transition-all animate-fade-rise-in ${className}`}
    >
      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-accent-rose" />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pl-1">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-accent-rose-soft text-accent-rose flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle size={18} strokeWidth={2} />
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold text-text-primary text-sm">{title}</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-accent-rose-soft text-accent-rose uppercase tracking-wider font-medium">
                {category}
              </span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed break-words">{message}</p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-text-muted">
              <span className="flex items-center gap-1.5">
                <Terminal size={12} className="text-text-muted" />
                Trace: <span className="text-text-primary">{currentTraceId}</span>
              </span>
              <button
                type="button"
                onClick={copyTrace}
                className="inline-flex items-center gap-1 text-accent-cyan hover:underline transition-colors"
                title="Copy trace details for debugging"
              >
                {copied ? <Check size={11} className="text-accent-emerald" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy Trace'}
              </button>
            </div>
          </div>
        </div>

        {onRetry && (
          <div className="shrink-0 flex sm:self-center">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bg-subtle hover:bg-bg-card-raised border border-border-default hover:border-accent-cyan text-text-primary text-xs font-mono font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={13} className={retrying ? 'animate-spin text-accent-cyan' : 'text-text-secondary'} />
              {retrying ? 'Retrying…' : 'Retry Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
