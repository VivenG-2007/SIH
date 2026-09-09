import axios from 'axios';

// withCredentials: true means the browser sends/receives the httpOnly cookies
// (access_token / refresh_token) that auth-service sets. This is why CORS on
// every backend must set credentials:true and echo the exact origin.
export const authApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:5000',
  withCredentials: true,
});

export const mainApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_MAIN_API_URL || 'http://localhost:5001',
  withCredentials: true,
});

// AI + file endpoints are reached THROUGH the main backend's proxy
// (/api/proxy/...), so the browser only ever talks to two hosts: auth-service
// and main-service. Swap to a direct ai-storage URL later if you want the
// frontend to bypass the gateway for large file uploads.
export const aiApi = {
  chat: (payload: { messages: { role: string; content: string }[] }) =>
    mainApi.post('/api/proxy/api/ai/chat', payload),
  analyze: (payload: { input: string; instructions?: string }) =>
    mainApi.post('/api/proxy/api/ai/analyze', payload),
};

export const riskApi = {
  quickAssessment: (payload: {
    industry: string;
    criticality: number;
    severity_counts: Record<string, number>;
    active_control_keys: string[];
  }) => mainApi.post('/api/proxy/api/v1/risk/quick-assessment', payload),
  optimizeInvestment: (payload: {
    budget_usd: number;
    options: {
      key: string;
      label: string;
      cost_usd: number;
      risk_reduction_usd: number;
      evidence_source?: string;
      confidence?: string;
      applicable_asset_ids?: string[];
      implementation_time_days?: number | null;
    }[];
  }) => mainApi.post('/api/proxy/api/v1/risk/optimize-investment', payload),
  calibrationStatus: () => mainApi.get('/api/proxy/api/v1/risk/calibration-status'),

  // Business & Asset Criticality Engine (SIH 26105 gap #2) — see
  // services/ai_sevices/app/services/risk/business_criticality.py
  registerBusinessCriticality: (payload: {
    asset_id: string;
    business_service: {
      service_id: string;
      name: string;
      industry: string;
      annual_revenue_usd: number;
      revenue_dependency_pct: number;
      data_sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
      regulatory_frameworks: string[];
    };
  }) => mainApi.post('/api/proxy/api/v1/risk/business-criticality/register', payload),
  getBusinessCriticality: (assetId: string) =>
    mainApi.get(`/api/proxy/api/v1/risk/business-criticality/${encodeURIComponent(assetId)}`),

  // Dependency graph traversal (SIH 26105 gap #6)
  dependencyGraphDemoAffectedServices: () =>
    mainApi.get('/api/proxy/api/v1/risk/dependency-graph/demo/affected-services'),

  // Continuous telemetry ingestion (SIH 26105 gap #1) — see
  // services/ai_sevices/app/services/risk/ingestion.py
  simulateTelemetry: (payload: { asset_id: string; source_type: 'siem' | 'edr' | 'iam' | 'cspm' | 'threat_intel' }) =>
    mainApi.post('/api/proxy/api/v1/ingestion/simulate', payload),
  streamTick: (payload: { asset_id?: string; mode?: 'simulation' | 'live' | 'hybrid'; source_type?: string }) =>
    mainApi.post('/api/proxy/api/v1/ingestion/stream-tick', payload),
  getTelemetryEvents: (assetId: string, limit = 20) =>
    mainApi.get('/api/proxy/api/v1/ingestion/events', { params: { asset_id: assetId, limit } }),
  resetTelemetry: (assetId: string) =>
    mainApi.post('/api/proxy/api/v1/ingestion/events/reset', { asset_id: assetId }, { params: { asset_id: assetId } }),

  // Unified Real-Time Command Center State (SIH 26105 MVP Core)
  getUnifiedRiskState: (payload: {
    industry: string;
    budget_usd: number;
    asset_id?: string;
    applied_control_keys?: string[];
    cvss_score?: number;
    mode?: 'simulation' | 'live' | 'hybrid';
    narrate_with_ai?: boolean;
  }) => mainApi.post('/api/proxy/api/v1/risk/unified-state', payload),

  // Deep Post-Streaming AI Evaluation Pipeline
  evaluatePipeline: (payload: {
    industry: string;
    budget_usd: number;
    asset_id?: string;
    applied_control_keys?: string[];
    cvss_score?: number;
    mode?: 'simulation' | 'live' | 'hybrid';
    scrape_evidence?: boolean;
    narrate_with_ai?: boolean;
  }) => mainApi.post('/api/proxy/api/v1/risk/evaluate-pipeline', payload),

  // Firecrawl Web Scraping & Evidence Validation
  scrapeUrl: (payload: { url: string; formats?: string[] }) =>
    mainApi.post('/api/proxy/api/v1/risk/scrape-url', payload),
  scrapeEvidence: (payload?: { refresh?: boolean }) =>
    mainApi.post('/api/proxy/api/v1/risk/scrape-evidence', payload || {}),

  // What-if scenario — the one end-to-end causal demo story (SIH 26105 gap
  // #10). See services/ai_sevices/app/services/risk/scenario.py.
  runScenario: (payload: {
    asset_id: string;
    industry: string;
    cvss: number;
    default_criticality: number;
    threat_source: 'siem' | 'edr' | 'iam' | 'cspm' | 'threat_intel';
    budget_usd: number;
    proposed_controls: {
      key: string;
      label: string;
      cost_usd: number;
      risk_reduction_usd: number;
      evidence_source?: string;
      confidence?: string;
      applicable_asset_ids?: string[];
      implementation_time_days?: number | null;
    }[];
    use_demo_graph?: boolean;
    narrate_with_ai?: boolean;
  }) => mainApi.post('/api/proxy/api/v1/risk/scenario/what-if', payload),
};


// Risk Simulation dashboard — see
// services/ai_sevices/app/routers/simulation.py and
// services/ai_sevices/app/services/risk/simulation.py. Runs entirely
// against a REAL, already-scanned repo's findings (scanId) — there is no
// synthetic-data path.
export interface SimulationCandidateControl {
  key: string;
  label: string;
  cost_usd: number;
  risk_reduction_usd?: number;
  evidence_source?: string;
  confidence?: string;
  implementation_time_days?: number | null;
}

export const simulationApi = {
  run: (payload: {
    scan_id: string;
    name?: string;
    environment?: string;
    budget_usd: number;
    candidate_controls?: SimulationCandidateControl[];
    narrate_with_ai?: boolean;
  }) => mainApi.post('/api/proxy/api/v1/risk/simulation/run', payload),
  get: (simulationId: string) => mainApi.get(`/api/proxy/api/v1/risk/simulation/${encodeURIComponent(simulationId)}`),
  search: (params: { q?: string; environment?: string; repo?: string; limit?: number }) =>
    mainApi.get('/api/proxy/api/v1/risk/simulation/search', { params }),
  whatIf: (payload: {
    scan_id: string;
    budget_usd: number;
    excluded_control_keys: string[];
    candidate_controls?: SimulationCandidateControl[];
  }) => mainApi.post('/api/proxy/api/v1/risk/simulation/what-if', payload),
};

export const filesApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return mainApi.post('/api/proxy/api/files/upload', form, {
      headers: { 'content-type': 'multipart/form-data' },
    });
  },
  list: () => mainApi.get('/api/proxy/api/files'),
};

let refreshing: Promise<unknown> | null = null;

// One shared 401 interceptor: on the first 401, try /refresh once and replay
// the original request. Avoids a stampede of parallel refresh calls. Shared
// `refreshing` promise below is deliberately reused by BOTH interceptors
// (mainApi's and authApi's) so a 401 from either client triggers at most one
// concurrent refresh call, not two racing ones.
mainApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing || authApi.post('/api/auth/refresh');
        await refreshing;
        refreshing = null;
        return mainApi(original);
      } catch (refreshErr) {
        refreshing = null;
        return Promise.reject(refreshErr);
      }
    }
    if (typeof window !== 'undefined' && error.response?.status) {
      console.error(
        `[mainApi Error ${error.response.status}] ${error.config?.method?.toUpperCase()} ${error.config?.url}:`,
        error.response.data || error.message
      );
    }
    return Promise.reject(error);
  }
);

authApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isRefreshCall = typeof original?.url === 'string' && original.url.includes('/api/auth/refresh');
    if (error.response?.status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;
      try {
        refreshing = refreshing || authApi.post('/api/auth/refresh');
        await refreshing;
        refreshing = null;
        return authApi(original);
      } catch (refreshErr) {
        refreshing = null;
        return Promise.reject(refreshErr);
      }
    }
    if (typeof window !== 'undefined' && error.response?.status) {
      console.error(
        `[authApi Error ${error.response.status}] ${error.config?.method?.toUpperCase()} ${error.config?.url}:`,
        error.response.data || error.message
      );
    }
    return Promise.reject(error);
  }
);

export const jiraApi = {
  status: () => mainApi.get('/api/jira/status'),
  // Full-page navigation, not an axios call — the user needs to actually see
  // and approve Atlassian's consent screen, which an XHR redirect can't show.
  // `returnTo` lets a caller (e.g. the onboarding wizard) get sent back to a
  // specific in-app page instead of always landing on /jira.
  connectUrl: (returnTo?: string) =>
    `${process.env.NEXT_PUBLIC_MAIN_API_URL || 'http://localhost:5001'}/api/jira/oauth/start${
      returnTo ? `?redirect=${encodeURIComponent(returnTo)}` : ''
    }`,
  disconnect: () => mainApi.delete('/api/jira/disconnect'),
  createIssue: (payload: { summary: string; description: string; issueType?: string }) =>
    mainApi.post('/api/jira/issues', payload),
  getIssue: (key: string) => mainApi.get(`/api/jira/issues/${encodeURIComponent(key)}`),
};

export const githubApi = {
  status: () => mainApi.get('/api/github/status'),
  connectUrl: (returnTo?: string) =>
    `${process.env.NEXT_PUBLIC_MAIN_API_URL || 'http://localhost:5001'}/api/github/oauth/start${
      returnTo ? `?redirect=${encodeURIComponent(returnTo)}` : ''
    }`,
  disconnect: () => mainApi.delete('/api/github/disconnect'),
  listRepos: () => mainApi.get('/api/github/repos'),
  createIssue: (payload: { owner: string; repo: string; title: string; body?: string }) =>
    mainApi.post('/api/github/issues', payload),

  // Continuous scanning (watch a repo -> push webhook -> auto-rescan).
  listWatched: () => mainApi.get('/api/github/watched'),
  watchRepo: (payload: { repoOwner: string; repoName: string; branch?: string }) =>
    mainApi.post('/api/github/watched', payload),
  unwatchRepo: (repositoryId: string) =>
    mainApi.delete(`/api/github/watched/${encodeURIComponent(repositoryId)}`),
  updateRepoSettings: (repositoryId: string, payload: { autoRescan: boolean }) =>
    mainApi.patch(`/api/github/watched/${encodeURIComponent(repositoryId)}/settings`, payload),
};

export const scannerApi = {
  scan: (payload: { repoOwner: string; repoName: string; branch?: string }) =>
    mainApi.post('/api/scanner/scan', payload),
  status: (scanId: string) =>
    mainApi.get(`/api/scanner/status/${scanId}`),
  approveAndFix: (payload: { scanId: string; findingId: string }) =>
    mainApi.post('/api/scanner/approve-fix', payload),
  history: (limit = 20) =>
    mainApi.get(`/api/scanner/history?limit=${limit}`),
};

// Used right after login/register to decide whether to route the person
// into the onboarding wizard (GitHub + Jira not connected yet) or straight
// to the dashboard. Failures are treated as "not connected" — an integration
// being briefly unreachable shouldn't block someone who already connected it
// on a previous visit; getting redirected to onboarding again is a minor
// inconvenience they can skip through, not a lockout.
export async function getConnectionStatus() {
  const [githubRes, jiraRes] = await Promise.allSettled([githubApi.status(), jiraApi.status()]);
  return {
    githubConnected: githubRes.status === 'fulfilled' && !!githubRes.value.data?.connected,
    jiraConnected: jiraRes.status === 'fulfilled' && !!jiraRes.value.data?.connected,
  };
}



export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}
