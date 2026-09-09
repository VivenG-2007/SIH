'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  Brain,
  Zap,
  RefreshCw,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Database,
  Search,
  TrendingDown,
} from 'lucide-react';
import { SimulationLogEntry, LogLevel } from '@/lib/simulation/types';
import { logger } from '@/lib/simulation/logger/streamLogger';
import { fetchSessionLogs } from '@/lib/simulation/logger/mongoStorage';

interface LiveTelemetryConsoleProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LiveTelemetryConsole({
  sessionId,
  isOpen,
  onClose,
}: LiveTelemetryConsoleProps) {
  const [logs, setLogs] = useState<SimulationLogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedPayload, setSelectedPayload] = useState<SimulationLogEntry | null>(null);
  const [isRetrievingFromMongo, setIsRetrievingFromMongo] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to live continuous log stream
  useEffect(() => {
    // Initial logs from logger memory
    setLogs(logger.getLogsForSession(sessionId));

    const unsubscribe = logger.subscribe((entry) => {
      if (entry.sessionId === sessionId) {
        setLogs((prev) => [...prev, entry]);
      }
    });

    return () => unsubscribe();
  }, [sessionId]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Fetch / reload all logs for this session from MongoDB
  const handleRetrieveSessionFromMongo = async () => {
    setIsRetrievingFromMongo(true);
    try {
      const persistedLogs = await fetchSessionLogs(sessionId);
      if (persistedLogs && persistedLogs.length > 0) {
        setLogs(persistedLogs);
      }
    } catch (err) {
      console.warn('MongoDB retrieval error:', err);
    } finally {
      setIsRetrievingFromMongo(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `simulation_logs_${sessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.stageName.toLowerCase().includes(q) ||
        log.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'RRSL':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-400/20 text-cyan-200 border border-cyan-400/50 flex items-center gap-1 shadow-sm shadow-cyan-500/20">
            <TrendingDown className="w-2.5 h-2.5 text-cyan-300" /> RRSL_RESIDUAL
          </span>
        );
      case 'AI_THINK':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
            <Brain className="w-2.5 h-2.5 text-purple-400" /> AI_THINK
          </span>
        );
      case 'CALC':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 text-cyan-400" /> CALC_MATH
          </span>
        );
      case 'OPTIMIZE':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> KNAPSACK
          </span>
        );
      case 'AUDIT':
      case 'ALERT':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5 text-amber-400" /> AUDIT
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-500/20 text-slate-300 border border-slate-500/40">
            INFO
          </span>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed bottom-0 right-0 z-50 transition-all duration-300 shadow-2xl border-t border-l border-cyan-500/30 bg-[#0c101c]/95 backdrop-blur-xl text-slate-200 flex flex-col ${
        isExpanded ? 'w-full h-[85vh]' : 'w-full md:w-[720px] lg:w-[860px] h-[480px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#12182b] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wide text-white uppercase flex items-center gap-2">
              Continuous Telemetry & Audit Stream
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                MongoDB Session: {sessionId}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRetrieveSessionFromMongo}
            disabled={isRetrievingFromMongo}
            title="Retrieve complete session logs from MongoDB"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Database className={`w-3.5 h-3.5 text-emerald-400 ${isRetrievingFromMongo ? 'animate-spin' : ''}`} />
            {isRetrievingFromMongo ? 'Retrieving...' : 'Retrieve Session'}
          </button>

          <button
            onClick={handleExportJson}
            title="Export session logs to JSON"
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Restore' : 'Maximize'}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Control Bar: Filters, Search, AutoScroll */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#0d1324] border-b border-slate-800/80 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 w-44"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
            {['ALL', 'RRSL', 'CALC', 'AI_THINK', 'OPTIMIZE', 'AUDIT'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition ${
                  filterLevel === lvl
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span>{filteredLogs.length} events logged</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-slate-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log Console Window */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-[11px] p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent bg-[#090d18]"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
            <p>Awaiting simulation telemetry stream...</p>
            <p className="text-[10px] text-slate-600 mt-1">
              Actions and deterministic calculations stream here in real time.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => log.payload && setSelectedPayload(log)}
              className={`group flex items-start gap-2.5 px-2.5 py-1.5 rounded hover:bg-slate-800/60 transition cursor-pointer border border-transparent hover:border-slate-700/50 ${
                log.level === 'AI_THINK' ? 'bg-purple-950/10' : log.level === 'CALC' ? 'bg-cyan-950/10' : ''
              }`}
            >
              <span className="text-slate-500 shrink-0 text-[10px] pt-0.5">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>

              <div className="shrink-0">{getLevelBadge(log.level)}</div>

              <span className="text-slate-400 shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                {log.stageName}
              </span>

              <span className="text-slate-200 flex-1 leading-relaxed break-words">
                {log.message}
              </span>

              {log.payload && (
                <span className="shrink-0 text-[9px] text-cyan-400 group-hover:underline px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60">
                  Inspect JSON
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Payload Inspection Drawer/Modal */}
      {selectedPayload && (
        <div className="absolute inset-0 bg-[#0b0f1d]/98 backdrop-blur-md p-4 flex flex-col z-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cyan-300">Payload Inspector</span>
              <span className="text-[11px] text-slate-400 font-mono">[{selectedPayload.stageName}]</span>
            </div>
            <button
              onClick={() => setSelectedPayload(null)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 text-xs"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] text-emerald-400">
            <pre>{JSON.stringify(selectedPayload.payload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
