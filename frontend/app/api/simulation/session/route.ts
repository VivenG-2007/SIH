import { NextResponse } from 'next/server';

// Server-side persistent in-memory cache (survives across requests in Node process)
// Also syncs to backend FastAPI / Mongo if available.
const sessionsStore = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sessionData = {
      sessionId,
      companyName: body.companyName || 'FinBank Technologies',
      industry: body.industry || 'Banking',
      currency: body.currency || 'INR',
      budget: body.budget || 1000000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      totalLogsCount: 0,
      llmCallsCount: 0,
      ...body,
    };

    sessionsStore.set(sessionId, sessionData);

    // Forward to FastAPI ai-storage backend if reachable
    try {
      const backendUrl = process.env.AI_STORAGE_SERVICE_URL || 'http://localhost:5002';
      await fetch(`${backendUrl}/api/v1/risk/simulation/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      }).catch(() => {});
    } catch {}

    return NextResponse.json(sessionData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const list = Array.from(sessionsStore.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ sessions: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
