import { SimulationLogEntry, PipelineStage, LogLevel } from '../types';

type LogListener = (entry: SimulationLogEntry) => void;

class StreamLogger {
  private listeners: Set<LogListener> = new Set();
  private sessionLogs: Map<string, SimulationLogEntry[]> = new Map();
  private pendingBatch: SimulationLogEntry[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private currentSessionId: string = 'session-default';

  public setSessionId(sessionId: string) {
    this.currentSessionId = sessionId;
    if (!this.sessionLogs.has(sessionId)) {
      this.sessionLogs.set(sessionId, []);
    }
  }

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public log(
    stage: PipelineStage,
    stageName: string,
    level: LogLevel,
    message: string,
    payload?: Record<string, any>,
    durationMs?: number
  ): SimulationLogEntry {
    const entry: SimulationLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: this.currentSessionId,
      timestamp: new Date().toISOString(),
      stage,
      stageName,
      level,
      message,
      payload,
      durationMs,
    };

    // Store in memory
    const existing = this.sessionLogs.get(this.currentSessionId) || [];
    existing.push(entry);
    this.sessionLogs.set(this.currentSessionId, existing);

    // Notify all active UI listeners continuously in real time
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    });

    // Queue for persistence
    this.queueForPersistence(entry);

    return entry;
  }

  public getLogsForSession(sessionId: string): SimulationLogEntry[] {
    return this.sessionLogs.get(sessionId) || [];
  }

  public clearSession(sessionId: string) {
    this.sessionLogs.delete(sessionId);
  }

  private queueForPersistence(entry: SimulationLogEntry) {
    this.pendingBatch.push(entry);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushPendingBatch();
      }, 500); // Flush every 500ms or on completion
    }
  }

  public async flushPendingBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingBatch.length === 0) return;

    const toSend = [...this.pendingBatch];
    this.pendingBatch = [];

    try {
      // Send to server persistence endpoint asynchronously (non-blocking)
      await fetch('/api/simulation/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.currentSessionId,
          logs: toSend,
        }),
      }).catch((err) => {
        // Degrade gracefully if offline/in standalone
        console.warn('Simulation log persistence fallback:', err.message);
      });
    } catch (err) {
      console.warn('Failed to persist simulation logs:', err);
    }
  }
}

export const logger = new StreamLogger();
