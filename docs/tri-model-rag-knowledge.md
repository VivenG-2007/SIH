# Tri-Model AI Risk Assessment & Groq NLP Co-Pilot

## 1. Tri-Model Orchestration Engine
- **Tier 1 (`gpt-4.1-mini`)**: Threat Intake & Exposure Triage. Ingests self-reported issue counts, sector breach baselines, and maps likely MITRE ATT&CK initial entry vectors.
- **Tier 2 (`gpt-5.2`)**: Strategic Financial Quantification & Executive Directive. Evaluates FAIR Expected Annual Loss (EAL) and 95% Value at Risk (VaR), assigns Cyber Insurance Underwriting Grades (Grade A vs Grade C+), and models premium discounts (up to 34%).
- **Tier 3 (`gpt-5.3-codex`)**: Technical Controls & Policy Verification. Audits engineering configurations (FIDO2 WebAuthn MFA, EDR runtime hooks, WAF ACLs, patch SLAs) and audits compliance against CERT-In 6-hour reporting, DPDP Act 2023, and RBI/SEBI CSCRF.
- **Execution**: Concurrent execution via `asyncio.gather()` in `services/ai_sevices/app/routers/risk.py` (`POST /api/v1/risk/quick-assessment`).

## 2. Azure AI Foundry Codex Responses API Routing
- Azure OpenAI chat completions endpoint returns HTTP 400 (`The requested operation is unsupported`) for new Codex deployments.
- `services/ai_sevices/app/services/ai_providers/azure_openai.py` intercepts `codex` deployments or HTTP 400/404 responses and automatically routes to `/openai/v1/responses`, extracting content from `output[].content[type='output_text']`.

## 3. Groq API Real-Time NLP Assessment Co-Pilot
- **Model**: `llama-3.3-70b-versatile` on Groq LPU inference engine.
- **Endpoint**: `POST /api/v1/risk/nlp-query` (`services/ai_sevices/app/routers/risk.py`).
- **Telemetry Context**: Injects Industry, Criticality, EAL, 95% VaR, Active Controls, and Issue Counts into the prompt for sub-second analytical answers.
- **Resilience**: Automatically falls back to Azure OpenAI (`gpt-4.1-mini`) if `GROQ_API_KEY` is not set or times out.
- **UI**: Left-anchored floating glassmorphic panel (`frontend/components/assessment/FloatingNlpPanel.tsx`).

## 4. Chroma Cloud Vector Memory
- Synced into Chroma Cloud `finding_memory` collection via `update_rag_knowledge.py` under:
  - `kb_tri_model_assessment_pipeline`
  - `kb_groq_nlp_assessment_copilot`
  - `kb_azure_foundry_codex_responses_api`
  - `kb_underwriting_compliance_linkage`
