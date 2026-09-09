import { SimulationLogEntry, SimulationSession } from '../types';

export async function createSimulationSession(session: Partial<SimulationSession>): Promise<SimulationSession> {
  try {
    const res = await fetch('/api/simulation/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fallback: could not reach session API:', err);
  }

  // Fallback object if offline
  return {
    sessionId: session.sessionId || `sim-${Date.now()}`,
    companyName: session.companyName || 'Unknown Company',
    industry: session.industry || 'General',
    currency: session.currency || 'INR',
    budget: session.budget || 1000000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    totalLogsCount: 0,
    llmCallsCount: 0,
  };
}

export async function fetchSessionLogs(sessionId: string): Promise<SimulationLogEntry[]> {
  try {
    const res = await fetch(`/api/simulation/session/${encodeURIComponent(sessionId)}/logs`);
    if (res.ok) {
      const data = await res.json();
      return data.logs || [];
    }
  } catch (err) {
    console.warn('Fallback fetching session logs:', err);
  }
  return [];
}

export async function fetchRecentSessions(): Promise<SimulationSession[]> {
  try {
    const res = await fetch('/api/simulation/session');
    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
  } catch (err) {
    console.warn('Fallback fetching sessions:', err);
  }
  return [];
}
