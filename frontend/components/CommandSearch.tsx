'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ShieldAlert, X } from 'lucide-react';
import { mainApi } from '@/lib/api';

interface SearchResult {
  scanId: string;
  findingId: string;
  repo: string;
  title: string;
  file: string;
  severity: string;
  status: string;
}

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: 'text-accent-rose bg-accent-rose-soft',
  HIGH: 'text-accent-amber bg-accent-amber-soft',
  MEDIUM: 'text-accent-cyan bg-accent-cyan-soft',
  LOW: 'text-text-muted bg-bg-subtle',
};

export default function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data } = await mainApi.get('/api/proxy/api/v1/search', { params: { q: query, limit: 8 } });
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command search"
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default bg-bg-subtle text-text-muted text-xs hover:border-border-hover transition-colors"
      >
        <Search size={14} strokeWidth={1.75} className="text-text-muted shrink-0" />
        <span className="flex-1 text-left truncate">Search findings, repos, or logs…</span>
        <kbd className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-default bg-bg-card text-text-muted">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search findings and repositories"
    >
      <div
        className="w-full max-w-xl bg-bg-card border border-border-hover rounded-2xl shadow-2xl overflow-hidden animate-fade-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-default">
          <Search size={16} className="text-text-muted shrink-0" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search findings, repos, or logs…"
            aria-label="Search query"
            className="flex-1 bg-transparent outline-none text-xs font-mono text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
            className="text-text-muted hover:text-text-primary p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-xs font-mono text-text-muted">Searching repository index…</div>
          ) : query && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs font-mono text-text-muted">
              No matching records for &ldquo;{query}&rdquo;
            </div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <button
                key={`${r.scanId}-${r.findingId}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/scanner/history?scanId=${encodeURIComponent(r.scanId)}`);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle transition-colors text-left border-b border-border-default last:border-0"
              >
                <div
                  className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                    SEVERITY_CLASSES[r.severity] || SEVERITY_CLASSES.LOW
                  }`}
                >
                  <ShieldAlert size={13} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-text-primary truncate">{r.title}</div>
                  <div className="text-[11px] text-text-muted truncate font-mono">
                    {r.repo} · {r.file}
                  </div>
                </div>
                <span className="font-mono text-[10px] uppercase text-text-muted shrink-0">{r.severity}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-xs font-mono text-text-muted">
              Type to search across every indexed security finding.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
