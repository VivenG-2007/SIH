# Patchline X — SIH 26105 Alignment

This document tracks Patchline X against the 10-point critique received
against SIH 26105 (Cyber Risk Quantification → Financial Exposure →
Investment Decision). Each section names the gap, what shipped against it,
where the code lives, and — for the points that are pitch/demo problems
rather than code problems — what to actually say and show.

See `docs/risk-engine-audit.md` for the original honest production-
readiness verdict this critique was responding to; this document is the
delta on top of it.

---

## 1. "Continuous" is still the biggest weakness — 🔴 Critical → BUILT

**Gap:** SIEM/EDR/IAM/CSPM/threat-intel were architectural boxes with no
code behind them. Only the GitHub webhook was genuinely continuous.

**What shipped:** `services/ai_sevices/app/services/risk/ingestion.py` — a
single `TelemetryEvent` contract every source pushes through. The GitHub
webhook is re-expressed through this same contract
(`as_github_telemetry_event`, wired into `routers/scanner.py`'s scan
trigger) so it's one instance of the shape, not a special case. Simulator
adapters exist for siem/edr/iam/cspm/threat_intel — every simulated event
carries `simulated: true` **permanently, in the stored record and every
API response**, so a demo can show continuous reactive behavior without
ever implying a live enterprise integration exists where one doesn't.

Events feed two real, bounded effects on the risk engine:
`ingestion.known_exploited()` (a threat-intel KEV-match event can flip a
finding's known-exploited status) and `ingestion.likelihood_adjustment()`
(a bounded 0.7x–1.5x multiplier from recent SIEM/EDR/IAM/CSPM signal,
mirroring the existing bounded-nudge pattern in `financial_model.py`).

**API:** `POST /api/v1/ingestion/simulate`, `GET
/api/v1/ingestion/events/{asset_id}`.

**What to say if asked "where's the telemetry coming from":** "GitHub is
real and always has been. SIEM/EDR/IAM/CSPM/threat-intel run through
simulator adapters today, and every simulated event is labeled as such in
the API and the UI — nothing here claims a live enterprise integration
that doesn't exist. What IS real is that the risk engine's reaction to
telemetry — the likelihood and EAL recalculation — is the same code path
whether the event came from GitHub or a simulator. Wiring a real SIEM
feed in means swapping the simulator call for a webhook receiver; the
ingestion contract and everything downstream of it doesn't change."

---

## 2. Business criticality is still too much of a default — 🔴 Critical → BUILT

**Gap:** every finding priced with `default_asset_criticality=0.5` and
`default_industry`, regardless of what the asset actually does for the
business.

**What shipped:**
`services/ai_sevices/app/services/risk/business_criticality.py` — the
real chain:

```
Asset -> Business Service -> Revenue dependency -> Data sensitivity
       -> Regulatory importance -> Criticality score
```

- `BusinessService` carries organization-reported `annual_revenue_usd`,
  `revenue_dependency_pct`, `data_sensitivity`
  (public/internal/confidential/restricted), and
  `regulatory_frameworks` (e.g. `dpdp_act_2023`, `gdpr`, `hipaa`,
  `pci_dss`).
- Regulatory importance scales off real, cited statutory penalty
  ceilings (GDPR Art. 83(5); India's **DPDP Act 2023** Schedule — up to
  ₹250 crore for a security-safeguard failure; HIPAA; PCI-DSS) added to
  `data_sources.py` — every figure is tagged `EMPIRICAL` (the ceiling is
  a fact about the law) or `ILLUSTRATIVE` (the USD-conversion and the
  weighting between legs are modeling choices, and say so).
- **Honest fallback, not a silent one:** if no mapping is registered for
  an asset, pricing still falls back to the flat default — but
  `usedDefaultCriticality: true` says so explicitly in every API
  response and `EvidenceTrail`, instead of looking identical to a real
  per-asset signal.

**API:** `POST /api/v1/risk/business-criticality/register`, `GET
/api/v1/risk/business-criticality/{asset_id}`. Wired into
`pipeline_integration.compute_finding_risk` so a registered mapping
changes real EAL/VaR output, not just a demo screen.

---

## 3. The financial model can look more authoritative than it is — 🔴 Critical → BUILT

**Gap:** a precise-looking ₹ EAL figure with no visible indication of
which inputs are real vs. illustrative.

**What shipped:** `frontend/components/risk/ConfidenceBreakdown.tsx` — a
collapsible panel under every risk figure showing exactly the mock the
critique specified:

```
Confidence: Illustrative / Calibrated
Data basis:
✓ Industry benchmark
✓ Asset criticality
✓ CVSS
✓ Threat status
✗ Organization historical loss data
```

It reads directly off the `evidence` array every `/api/v1/risk/*`
response already returns (`evidence.py`'s `EvidenceTrail.data_sources`,
each tagged `empirical`/`illustrative`) — no new backend computation,
this surfaces data that existed in the API but never reached the UI at
this granularity. Wired into `/assessment`, `RiskExposurePanel`, and the
new `/scenario` page. "Organization historical loss data" is always shown
as ✗ until `calibration.py` reports real (prediction, outcome) pairs —
listed explicitly rather than silently omitted.

---

## 4. No real organizational calibration yet — 🟠 Medium → PITCH, NOT CODE

**Gap:** don't pitch "our ML model accurately predicts enterprise
losses" — there's no real historical prediction/outcome data yet.

**Status:** `calibration.py` already existed as honest, tested
infrastructure with a `GET /api/v1/risk/calibration-status` endpoint that
reports **zero real data points** pre-launch — nothing to build here, the
gap was entirely about what gets said out loud. `ConfidenceBreakdown`
(item 3) now surfaces this limitation inline everywhere a risk figure is
shown, not just on a dedicated status page.

**Say this:** "Our calibration pipeline is ready to learn from
organization-specific incident outcomes once sufficient historical data
is available." **Never say:** "our model accurately predicts enterprise
losses."

---

## 5. Investment optimizer inputs were arbitrary — 🔴 Critical → BUILT

**Gap:** "where did the ₹25L MFA cost and 30% risk reduction come from?"

**What shipped:** `InvestmentOption` (`optimization.py`) extended with
`evidence_source`, `confidence` (`empirical`/`illustrative`/
`unspecified`), `applicable_asset_ids`, `implementation_time_days`. The
optimizer's `EvidenceTrail.explanation` now names every candidate with no
`evidence_source` by key, and the API response returns
`unevidenced_candidate_count`. `frontend/components/dashboard/
InvestmentOptimizer.tsx` shows a confidence badge (Empirical /
Illustrative / Unspecified) per candidate row and surfaces the
unevidenced count as a warning after a run — a judge asking "where did
this number come from" gets an answer in the UI, not a shrug.

---

## 6. GraphDB for technology's sake — 🟡 Medium → BUILT (deliberately, without a new DB)

**Gap:** don't add a graph database because it sounds impressive; prove
the traversal capability instead.

**What shipped:**
`services/ai_sevices/app/services/risk/dependency_graph.py` — an
in-memory adjacency-list graph, **not Neo4j, not a new piece of
infrastructure** (this codebase has no graph database anywhere; adding
one just to say "we use GraphDB" is exactly the over-engineering item #9
warns against). It answers the canonical query verbatim:

> "Which critical business services are affected by this threat, through
> their asset dependency chain?"

`affected_business_services()` walks `Business Service → Asset → Finding
→ Vulnerability → Threat → Control` and returns the services reached,
ranked by hop-count and criticality. `GET
/api/v1/risk/dependency-graph/demo/affected-services` and the `/scenario`
page's "Asset Affected" step both call it live.

**If a judge asks why not a real graph database:** "The traversal is the
capability, not the storage engine — this demonstrates it without adding
infrastructure this platform doesn't need at its current scale. If the
asset graph grows past what an in-memory adjacency list serves at
interactive latency, this module's backing store is the one thing that
changes — the traversal functions are the seam that migration happens
behind, so nothing calling it would need to change."

---

## 7. RAG/AI could hallucinate unless tightly grounded — 🟠 Medium → BUILT

**Gap:** enforce `User → AI → Risk Engine → EAL/VaR → AI explanation`,
never `User → LLM → ₹4.2 Cr`.

**Status:** `financial_model.py` already imports no AI provider — that
rule was already structurally enforced. What was missing was a concrete
place where AI is *actually in the loop*, narrating rather than
computing. `services/ai_sevices/app/services/risk/scenario.py` is that
place: `build_ai_narration_prompt()` builds a prompt that explicitly
instructs the model "every figure below was computed by a deterministic
risk engine... do NOT invent, adjust, or recompute any number — only
explain." The router (`routers/scenario.py`) calls the AI provider with
that prompt and returns the result in a separate `ai_narrative` field,
never merged into the deterministic `trace` — a caller can't confuse the
two even by accident.

---

## 8. Remediation can overshadow the actual PS — 🟡 Medium → PITCH/DEMO TIME, NOT CODE

**Gap:** Patchline's original identity (Scanner → AI Fix → PR →
Verification) is strong enough that a full demo of it reads as "this is a
vulnerability remediation platform," not "cyber risk investment
optimization platform."

**Demo time allocation** (out of a ~7-minute slot):

| Section | Time | What's shown |
|---|---|---|
| Problem framing | 45s | The judge-facing question: "how much is this vulnerability actually costing you, and what should you buy to fix it?" |
| **The one causal story (`/scenario`)** | **3.5–4 min** | Threat → asset → criticality → likelihood → EAL → AI explains → what-if MFA → optimizer → recalculation → risk decreases |
| Business Criticality + Confidence Breakdown | 1 min | Register a real business-service mapping live; show the ✓/✗ data-basis checklist |
| Autonomous remediation (Scanner → AI Fix → PR) | **1–1.5 min** | ONE finding, fixed, PR opened — proof it's real, not the centerpiece |
| Close | 30s | What's illustrative today vs. what's real, stated plainly |

Remediation gets a clear demonstration, not the majority of the clock.

---

## 9. Too many technologies can look over-engineered — 🟡 Medium → SIMPLIFY THE PITCH

**Gap:** a judge sees PostgreSQL/Supabase, MongoDB, ChromaDB, GraphDB,
Redis, BullMQ, Blob, MCP, Blockchain, Kubernetes, Docker, AI models,
Semgrep, Tree-sitter, GitHub in one architecture diagram and asks "why do
you need all of this?"

**Technology justification table** — say this for every box, or cut it
from the pitch deck (not necessarily the codebase — "future scope" is a
legitimate answer for a box that stays):

| Technology | Supports Observe→Quantify→Decide→Optimize? | Verdict for the pitch |
|---|---|---|
| PostgreSQL/Supabase | Core data store for scans, findings, mappings | **Keep** |
| MongoDB | AI-service persistence (chat, evidence) | **Keep**, mention briefly |
| ChromaDB | RAG retrieval for AI explanations (item 7) | **Keep**, one sentence |
| GraphDB (Neo4j etc.) | Not present in the codebase — replaced by an in-memory traversal (item 6) | **Cut from the diagram entirely** |
| Redis | Caching / rate limiting | **Keep**, one word: "caching" |
| BullMQ | Async job queue for scans | **Keep**, one word: "job queue" |
| Blob storage | File/report storage | **Keep**, one word |
| MCP | Tool-calling protocol for AI providers | **Optional/future scope** unless directly demoed |
| Blockchain | — | **Cut** unless there's a concrete, demoable use; otherwise it's the single fastest way to lose credibility with a technical judge |
| Kubernetes | Deployment target | **Say once, move on** — not a differentiator for a hackathon judge |
| Docker | Sandboxed patch verification | **Keep**, ties directly to remediation |
| Semgrep, Tree-sitter | Static analysis / AST parsing for the scanner | **Keep**, one line each |
| GitHub | Real, continuous ingestion source (item 1) | **Keep**, lead with this — it's the one source that's genuinely real |

Rule for the live pitch: if a box doesn't map to Observe → Quantify →
Decide → Optimize, or isn't a necessary supporting capability, it's
either cut from the diagram or explicitly marked "future scope" out
loud — don't let a judge discover an unjustified box themselves.

---

## 10. One complete causal story — 🔴 Critical → BUILT

**Gap:** the single most important presentation mistake — don't demo
Scanner → Dashboard → Graph → RAG → AI → Blockchain → Sandbox →
Kubernetes as unrelated features. Demo one chain:

```
Threat Event → Asset affected → Business criticality → Likelihood
changes → Financial exposure increases → AI explains WHY →
"What if we deploy MFA?" → Scenario recalculation → Optimizer chooses
controls within budget → Risk decreases
```

**What shipped:**
`services/ai_sevices/app/services/risk/scenario.py`'s `run_scenario()` —
composes business_criticality + ingestion + dependency_graph +
financial_model + control_effectiveness + optimization into one ordered,
9-step trace. It adds **no new arithmetic of its own** — every number is
produced by the module that already owned that computation; this file
only orders and narrates. `POST /api/v1/risk/scenario/what-if` and the
`/scenario` frontend page render the full trace, each step showing its
own `EvidenceTrail`s via `ConfidenceBreakdown` (item 3), with a
deterministic-figures-only AI narrative on top (item 7).

**This is the demo.** Everything else (item 8's remediation clip, item
2's live business-criticality registration) is a supporting beat inside
or around this one story, not a separate feature tour.

---

## Judge Q&A quick-reference

| Question | Answer |
|---|---|
| "Where's your continuous telemetry actually coming from?" | GitHub is real. SIEM/EDR/IAM/CSPM/threat-intel are simulators, labeled `simulated: true` everywhere, feeding the same risk-recalculation code path a real integration would. |
| "How can you claim this ₹ EAL number is accurate?" | We don't claim "accurate" — every figure ships with a Confidence Breakdown showing exactly which inputs are empirical vs. illustrative, and we say so before being asked. |
| "Does your ML model really predict losses?" | No — the calibration pipeline is real infrastructure with zero real historical data pre-launch, and the UI says so. |
| "Why do you need a graph database?" | We don't have one — traversal is implemented in-memory and demonstrated live; a real graph DB is a mechanical swap behind that module if scale ever needs it. |
| "Is this a remediation tool or a risk platform?" | Risk-quantification-to-investment-decision is the story we lead with; remediation is one beat at the end proving the loop closes. |
| "Where did this control's cost/risk-reduction number come from?" | Every candidate declares an `evidence_source` and `confidence`; unevidenced candidates are named explicitly in the UI and API, never silently treated as trustworthy. |

---

## Round 2 — follow-up critique (production-hardening depth)

A second, deeper critique followed the first, going one layer down into
each of the original 10 items plus explicit production-hardening asks
(observability, security, API hardening). Verdict up front, given
directly when asked: **implementing all of round 2 does not make this
platform "production ready."** Some of it is real engineering that
shipped this round. Some of it is gated by real-world data and time that
no amount of code can manufacture today. Being honest about which is
which is the point.

### Shipped this round

**CISA KEV integration** (`app/services/risk/kev.py`) — a real, free,
no-authentication CISA feed client (confirmed live:
`cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`),
in-memory TTL cache, graceful degradation on fetch failure (a KEV outage
never blocks pricing), synced at startup. Wired into
`pipeline_integration.py`: a KEV match sets `is_known_exploited=True` and
`exploit_maturity="weaponized"`, and the ransomware-campaign flag CISA
itself publishes rides along as an evidence note without inventing a new
multiplier for it. **Read this before presenting it as solved:** this
scanner is SAST/pattern-based (Semgrep + tree-sitter) with no dependency/
SCA scanning path, so no finding it produces carries a CVE ID — KEV
coverage against today's findings is honestly zero. `GET
/api/v1/risk/kev-status` says this out loud rather than letting a live,
correct integration imply coverage it doesn't have. It's real and ready
the moment a CVE-backed finding source (e.g. dependency scanning) exists.

**CVSS vectors — deliberately NOT built, and here's why that's correct,
not a shortfall.** The follow-up critique assumed findings carry CVE-style
metadata (attack_vector, attack_complexity, etc.). They don't, because
CVSS is defined for known, cataloged vulnerabilities — it doesn't
generically apply to "this SAST rule fired on this line of code." The
severity-to-CVSS-midpoint approximation this platform already uses is the
*correct* handling for a pattern-based finding, not a weaker substitute
for a real CVSS score that could exist but doesn't. Forcing CVSS vectors
onto SAST findings would have been fabricating precision, exactly what
this codebase's `data_sources.py` discipline exists to prevent.

**Finding-aware control effectiveness** (`control_effectiveness.py`) —
`classify_attack_class()` maps a finding's free-text `category` to a
canonical attack class via keyword heuristic; `apply_controls()` takes an
optional `attack_class` and excludes controls that don't apply *entirely*
(0% credit, not a discounted version of their cited factor). MFA no
longer reduces a SQL injection finding's likelihood. Unclassified findings
get the **conservative** default — only genuinely attack-class-agnostic
controls (patch SLA) apply — because under-crediting is defensible in
front of a judge and over-crediting is the exact failure mode this exists
to fix.

**Audit-grade EvidenceTrail** (`evidence.py`) — added `input_hash` (SHA-256
of the trail's own `inputs`, computed automatically, can't drift from
what it's hashing) and `data_snapshot_id` (real for KEV-backed trails,
`"n/a"` honestly elsewhere). Deliberately did **not** add a separate
`model_version` field distinct from the existing `formula_version` — this
codebase has one real version lineage today, and inventing a second one
with no actual process behind it would be fabricated precision on the
exact axis this file exists to prevent.

**Calibration gets real storage** (`calibration.py`) — an in-memory
`PredictionRecord`/`OutcomeRecord` store now actually exists (not just
`recalibrate()`'s function parameters). Every finding priced auto-logs a
prediction. A **real Brier score** — the standard definition, mean squared
error between predicted likelihood and actual binary outcome — is now
computed once enough (prediction, outcome) pairs exist, alongside the
original EAL-focused MAE. `GET /api/v1/risk/calibration-status` now
reports live, and `POST /api/v1/risk/calibration/record-outcome` is how
a real incident (or confirmed non-event) gets recorded. **Still,
correctly, reports `calibrated: false` right now** — a fresh instance has
zero real outcomes, and that's true, not a placeholder.

**Monte Carlo VaR with an honest fallback** (`var_simulation.py`) — fits a
real log-normal distribution to actual recorded incident costs and runs a
10,000-draw Monte Carlo simulation for P50/P75/P90/P95/P99 loss, **but
only once ≥30 real outcomes exist** (the same floor `calibration.py`
already uses, for the same reason). Below that, it falls back to
`financial_model.compute_var()`'s existing single-formula approximation
and labels the result `method: "illustrative_lognormal_fallback"`
explicitly. Running 10,000 simulated draws against an unfit distribution
would look more rigorous without being more true — that's the exact
theater this module refuses to produce.

**ROI-ranked optimizer output** (`optimization.py`) — `InvestmentOption.roi`
and `rank_by_roi()` give the "1. MFA — 17.5x ROI" style CISO report
directly, distinct from (and can disagree with) the budget-constrained
knapsack selection — the doc explains why both are legitimate, different
questions.

**Real-ish tenant/write scoping**
(`pipeline_integration.user_can_manage_asset`) — registering
business-criticality data or pushing telemetry for an asset now requires
proof the user actually scanned that repo through this platform
(`scan_history` lookup), closing "any authenticated user can write
pricing-affecting data for any asset_id." **This is not full multi-tenant
isolation** — this platform's auth model (`CurrentUser`) has no
organization concept, only a bare `user_id`, so there is no real org
boundary to enforce between two different companies' users who both
happen to have scanned the same repo. That's the honest fix for a gap
that doesn't exist in this codebase yet. Read endpoints remain ungated.

### Explicitly not attempted — gated by real-world data/time, not code

**Full calibration ("calibrated: true" for real)** and **a Monte Carlo VaR
actually fit to this organization's own losses** both now have real,
tested infrastructure ready to receive data — and both will keep honestly
reporting their pre-data state until an actual deployment accumulates ≥30
real incident outcomes. No session of writing code changes that; it's a
calendar problem, not an engineering one.

**Portfolio root-cause clustering / attack-path correlation** (round 2's
`#7`) — the "10 vulnerable files, same dependency, one root cause"
problem. `dependency_graph.py`'s traversal is a real building block for
this, but the correlation/clustering logic itself (which findings share a
root cause, and how much that should discount their combined portfolio
EAL) is a genuinely new subsystem that wasn't built this round. Portfolio
aggregation still sums findings as independent, and still says so.

### Explicitly not attempted — needs infra/process maturity beyond code

Encrypted sensitive business context (needs a real KMS + key rotation
policy), secrets management (needs a deployed vault + operational
practice), full observability (Prometheus/Grafana deployed, alerting
tuned against real traffic, on-call), durable audit logs (retention
policy, access controls — not print statements), and a real security
review of the write-scoping change above (a hostile-minded review or pen
test, not just this author's own reasoning about it). None of these are
"write more code" problems in the way KEV integration or Brier scores
were.

### Round 2 judge Q&A additions

| Question | Answer |
|---|---|
| "Does your platform track exploited CVEs?" | Yes, via a live CISA KEV integration — but this scanner doesn't produce CVE-backed findings today, so say that before they ask, not after. |
| "Why doesn't MFA show up as reducing this SQL injection finding's risk?" | Because it shouldn't — controls are now scoped to the attack class they actually mitigate, and the API names exactly which controls were excluded and why. |
| "Is your calibration real yet?" | The infrastructure and the Brier-score math are real and tested; the answer is still honestly "not yet" until real incident outcomes accumulate — that's true today, and the platform says so. |
| "Is this multi-tenant?" | Write access to an asset's risk data is now scoped to users who've actually scanned it — that's real, but it isn't org-level tenant isolation, because the auth model has no org concept yet. Both halves of that answer matter. |

---

## Round 3 — the Risk Simulation dashboard

A wireframe + spec asked for an interactive "Risk Simulation" screen —
budget slider, live-recalculating investment checklist, before/after
attack-path visualization, scenario comparison table, Monte Carlo
distribution, AI recommendation panel — wired to real backend computation
and with Elasticsearch used where it genuinely fits, not sprinkled in for
its own sake.

**What "real" means here, concretely:** the page takes a `scanId` for an
actual completed scan of actual submitted files/a repo — there is no
synthetic-data path. `GET /simulation` with no `scanId` shows an empty
state pointing back to the scanner, not a demo with made-up numbers.

### What shipped

**`app/services/risk/attack_path.py`** — builds the "Internet → API →
Auth → Internal Services → Data Layer" chain from real findings, via the
same `classify_attack_class()` already used for control applicability.
Read the module docstring's honesty split: the STAGE TOPOLOGY is a fixed,
generic illustrative shape (this platform has no real network-topology
data to derive an org's actual attack path from), but which findings
populate each stage, and each stage's severity/EAL, are real. Unclassified
findings are deliberately left off the visual chain rather than assigned
a fabricated location — their EAL still counts, just not pinned to a
stage.

**`app/services/risk/simulation.py`** — the real "Current vs Simulated"
comparison. Adds no new risk arithmetic beyond one explicitly-scoped 0-100
"risk score" (a criticality-weighted rescaling of aggregate likelihood,
documented as a platform-specific composite, not an external standard).
Everything else — the budget-constrained control selection, the
per-finding residual likelihood, the dollar figures, the Monte Carlo tail
— is `optimization.py` / `control_effectiveness.py` / `var_simulation.py`
called through unchanged. The "Current / Patch Criticals / Recommended /
Maximum" scenario table's "Patch Criticals" tier is a **real derived
budget** (sum of costs of controls actually applicable to this scan's
real CRITICAL-severity findings' attack classes), not a picked-to-look-
good number.

**What-if mode** — re-runs the optimizer with a control excluded from its
candidate set entirely (not just deselected from a result), so the
optimizer reallocates that budget elsewhere. This is what powers the
investment checklist's "live recalculation" on the frontend: every
checkbox toggle is a real `POST /simulation/what-if` call, not a
client-side approximation.

**Elasticsearch — used where the codebase's own existing pattern fits,
extended, not reinvented.** This platform already had a real ES
integration (`app/core/es_client.py`, `patchlinex_findings` index, the
command-K search bar) with a specific, deliberate contract: Mongo is the
source of truth, ES is a best-effort derived search index, everything
degrades gracefully to a Mongo fallback if ES isn't configured/reachable.
`patchlinex_simulations` is the same contract applied to simulation runs
— `GET /simulation/search` tries ES first, falls back to a Mongo listing,
exactly like `GET /search` already does for findings. No new
infrastructure pattern was introduced; the existing one was extended to a
second document type it was already shaped to support.

**Frontend** (`/simulation`) — budget slider, KPI cards, scenario
comparison chart + table (recharts), investment checklist with live
backend-driven recalculation, before/after attack-path visualization,
Monte Carlo percentile chart (with an honest note when it's the
illustrative fallback vs a real fit), and an AI recommendation panel that
narrates the real recommended-tier figures without generating any of its
own. A "Run Investment Simulation" CTA appears on the scanner page **only
after a real scan has priced findings** (`riskSummary.findingsPriced >
0`) — the trigger the original ask described: real files submitted, real
findings priced, then the simulation option appears.

### Explicitly not attempted this round

**P(Loss > ₹X) tail probabilities** — the wireframe's "P(Loss > ₹25L):
31%" style figures. `var_simulation.py`'s Monte Carlo branch could compute
these exactly (count draws exceeding a threshold), and was left out of
scope for round 3, not because it's hard — it's a real gap I should close
next, not a deliberate limitation like the topology-honesty ones above.

**Free-text "what if" scenarios** ("What if we don't patch the payment
API?" typed as a sentence) — the checkbox-driven what-if flow is real and
backend-wired, but there's no natural-language parser turning a typed
question into a specific `excluded_control_keys` list. The AI narration
panel explains a result; it doesn't yet parse a question into one.

### Round 3 judge Q&A additions

| Question | Answer |
|---|---|
| "Is this attack path your actual network architecture?" | No — say this before they ask. It's a representative request-flow layout populated with this scan's real findings; the platform has no real topology data to derive an actual one from. |
| "When I toggle a control off, what's actually happening?" | A real backend call re-runs the 0/1-knapsack optimizer with that control removed from its candidate set — not a client-side estimate. |
| "Why Elasticsearch for this and not something else?" | It was already the platform's real search layer for findings, with an established graceful-degradation contract; simulation search reuses that exact pattern rather than introducing new infrastructure. |

---

## Round 4 — P0 production-readiness: persistence + full org scoping (P0#2, #4, #5, #6 complete; #1/#3 completed in round 3)

Round 3 built the organization/tenant identity model across all three
services. This round did the two things that only make sense once that
model exists: migrated every in-memory risk-engine store to durable,
organization-scoped Mongo storage (P0#2), and used that same migration
pass to add secrets management (P0#4), an audit trail (P0#5), and
field-level encryption (P0#6) — since every write path was already being
touched, doing these separately later would have meant touching the same
~15 files twice.

**Verified, not asserted:** 306 Python tests (up from 275; every migrated
module and every new module has real, mongomock-motor-backed async tests
that exercise actual query logic, not fakes) + 25 auth-service + 59
main-service = 390 tests, all passing, confirmed in this session.

### P0#2 — Persistence (the big structural change)

`business_criticality._REGISTRY`, `ingestion._EVENTS_BY_ASSET`,
`calibration._predictions`/`_outcomes` were all in-memory — gone on
restart, inconsistent across worker processes. All three are now Mongo
collections (`business_criticality_mappings`, `telemetry_events`,
`risk_predictions`/`risk_outcomes`), each scoped by `organizationId`.

This is a real structural change, not a find-and-replace: every function
that used to read/write these dicts synchronously now does real async
Mongo I/O, which meant converting `pipeline_integration.compute_finding_risk`,
`scenario.run_scenario`, `simulation.run_simulation`/`scenario_tiers`/
`what_if_exclude`, and `var_simulation.simulate_var` to `async def` and
threading `db`/`organization_id` through every call site — routers,
`routers/scanner.py`'s scan pipeline, and ~9 test files. The pure-logic
functions that don't touch storage (`compute_criticality`,
`apply_controls`, `optimize_investment`, `recalibrate`,
`classify_attack_class`) were deliberately left untouched and synchronous
— only the I/O boundary changed, not the math.

### P0#4 — Secrets management

`app/core/secrets.py`: a `SecretsProvider` abstraction with two
implementations — `EnvSecretsProvider` (today's default; also literally
how Azure App Service surfaces a Key-Vault-backed setting to a running
process, so it isn't being deprecated) and `AzureKeyVaultProvider` (real
`azure-identity`/`azure-keyvault-secrets` SDK usage — `DefaultAzureCredential`
picks up a deployed managed identity automatically). **Honest caveat:**
the Key Vault path is real code, reviewed against the SDK's documented
contract, but not exercised against a live vault in this session — no
reachable Key Vault instance exists in this sandbox. That is an open
verification item, not a "done."

### P0#6 — Field-level encryption

`app/core/encryption.py`: AES-256-GCM (authenticated — tampering is
detected, not silently accepted), keyed via the secrets abstraction
above. Applied field-by-field, not "encrypt everything": business
criticality's `annual_revenue_usd`/`revenue_dependency_pct`, calibration's
`predicted_eal_usd`/`predicted_likelihood`/`actual_cost_usd`, and
telemetry's `payload` are encrypted at rest. Fields a module's own query
logic needs to filter on in Mongo (`likelihood_effect`, `data_sensitivity`,
`regulatory_frameworks`, asset/org IDs) stay plaintext — ciphertext isn't
selectively queryable, and encrypting them would either break the query
or require decrypting every document client-side, defeating the point of
an index. Each migrated module documents its own field-by-field choice
rather than applying a blanket rule.

### P0#5 — Audit trail

`app/core/audit.py`: exactly the shape requested — who, organization,
action, resource, result, request ID, timestamp. Wired into every
migrated write path: business-criticality registration (success AND
failure, e.g. an unauthorized org), telemetry simulation, calibration
outcome recording, simulation runs. Best-effort by design (logged loudly
on failure, never blocks the underlying operation) — the tradeoff is
spelled out in the module's own docstring: an audit-log outage should
never become a way to take down real scans or simulations.

### Also fixed while touching every write path

`pipeline_integration.user_can_manage_asset` now checks `organizationId`
on `scan_history`, not `ownerId` — closing the exact gap round 3's version
of this function named as its own limitation ("two teammates in the same
org should share one business-context mapping, not be isolated from each
other"). Any member of an organization that scanned an asset can now
manage its risk data; a different organization scanning the same public
repo sees none of it — verified by dedicated cross-org isolation tests in
`business_criticality`, `ingestion`, `var_simulation`, `simulation`, and
`pipeline_integration`'s test files, not just asserted.

### Explicitly not done this round

**The pre-existing `patchlinex_findings` Elasticsearch index and
`routers/search.py` are still scoped by `ownerId`, not `organizationId`.**
This is a real, named gap — round 4 focused on the risk-engine's own
stores; the earlier findings-search system (which predates all of this
work) wasn't touched. Same fix shape as everything else in this round
(add organizationId, update the query, update the tests) — just not yet
done.

**The webhook/system-token scan path's org gap (flagged in round 3) is
unchanged**: `X-System-Org-Id` is optional, and `watchedRepoStore` in
main-service still isn't organization-scoped, so a webhook-triggered
rescan runs with `organization_id=None` for the risk-engine stores until
that store is migrated too.

**P1 (empirical calibration validation) and P2 (Monte Carlo performance
benchmarking) — not started.** The `volatility=1.8` parameter is still a
formula-consistent placeholder, not a validated one; there's been no load
test of the pure-Python Monte Carlo loop at concurrency.

---

## Round 5 — P1 validation, P2 performance, and the two named gaps from round 4

Verified this round: 405 tests passing (321 Python + 25 auth-service + 59
main-service), all real, all confirmed in this session.

### P2 — Monte Carlo performance: a real, measured finding

Benchmarked `var_simulation.simulate_var()`'s 10,000-draw Monte Carlo loop
directly, then — because an isolated microbenchmark can't show whether
blocking the event loop actually hurts OTHER requests — built a real
two-endpoint FastAPI server (`/health`, `/heavy`) and hit both
concurrently with real HTTP requests via httpx.

**The measured result: running the Monte Carlo simulation inline (the
current implementation's actual pattern — `await`ed directly in a route
handler, no executor offload) degrades an unrelated `/health` endpoint's
p95 latency by 85.6x** (1.1ms → 98.2ms) when 20 simulation requests are
in flight. This is a real, load-bearing architectural finding, not a
guess.

**Tested the standard fix and it did NOT help in this environment**:
offloading to a `ThreadPoolExecutor` (88.5x degradation) or a
`ProcessPoolExecutor` (89.3x) performed no better than the inline
baseline. Honest reason why, stated plainly: this sandbox has exactly **1
CPU core** (confirmed via `nproc`), and the benchmark's client and server
share that single core — so there's no real parallelism available for
either offload strategy to exploit, and the client's own request-sending
work competes for the same core as the server. On a real multi-core
production host, a thread-pool offload would very likely help (the event
loop stops being blocked by the same thread executing Python bytecode)
and a process-pool offload would help more (genuine parallel execution,
no GIL contention) — but that expectation is not proven by anything
measured in this session, and is stated as an expectation, not a result.

**Recommendation, given both what's measured and what isn't**: don't
reach for `run_in_executor` as the fix — even where it helps, it leaves
Monte Carlo simulation as a load-bearing, latency-variable part of the
request/response cycle. This codebase's stack already has a job queue
(BullMQ, in main-service). The architecturally consistent fix is routing
`/simulation/run` through that queue — return a job id immediately, let a
worker process (potentially on a different core or host entirely) run
the simulation, poll or webhook for completion. This sidesteps the
single-core-vs-multi-core question entirely rather than betting the fix
on hardware this platform doesn't control.

### P1 — calibration validation: what's provable without real data

The honest boundary, stated once and then held to throughout: this round
validates that the calibration STATISTICAL MACHINERY (Brier score,
calibration curve, the volatility feedback loop) is implemented
correctly — not that this platform's real-world model assumptions
(severity→CVSS midpoints, the criticality weights, `volatility=1.8`
itself) are empirically true of any real organization. That second kind
of validation needs real historical incidents accumulated over real
time, which cannot be honestly synthesized. Conflating the two would be
exactly the overclaim this codebase's confidence-tier discipline exists
to prevent.

**What was built and proven, with synthetic data of KNOWN properties**
(`tests/test_calibration_validation.py`, 12 tests, N=4000 synthetic pairs
per test — large enough that sampling noise doesn't drown the signal):
- A well-calibrated synthetic predictor (predicted likelihood p → real
  incident probability exactly p) produces a Brier score of 0.166,
  matching the theoretical value (1/6 ≈ 0.1667) for that exact process
  to within 0.02.
- Systematically overconfident and underconfident synthetic predictors
  both produce measurably WORSE Brier scores than the well-calibrated
  case — proving the metric actually discriminates, not just that it
  computes a number.
- The new `calibration.calibration_curve()` (a real reliability diagram —
  binned predicted-vs-actual rates, didn't exist before this round)
  correctly tracks the diagonal for well-calibrated data and correctly
  diverges in the expected direction for both miscalibration modes.

**The real feedback loop that was missing, now closed**:
`recalibrate()` has computed a `suggested_volatility_adjustment` since
round 2 — nothing ever read it. `calibration.get_calibrated_volatility()`
is the wiring: once an organization has enough real (prediction, outcome)
pairs, `var_simulation.simulate_var()`'s fallback branch now uses a
volatility parameter corrected by that organization's own real
calibration signal (bounded to 0.5x-3x the default, so one extreme early
data point can't swing it to an implausible value) instead of the
permanently-fixed 1.8. Exposed via `GET /calibration-status`'s new
`current_var_volatility_parameter`/`volatility_basis` fields and a new
`GET /calibration-curve` endpoint.

### Two named gaps from round 4, closed

**Findings search is now organization-scoped.** `patchlinex_findings`
(the ES index backing the command-K search bar) and its Mongo fallback in
`routers/search.py` were still keyed by `ownerId` — the one part of this
whole effort that predates the round-3 org model and hadn't been touched.
Renamed to `organizationId` throughout, with new tests proving org A's
findings never appear in org B's search results.

**The webhook/system-token scan path now carries a real org claim.**
`watchedRepoStore` (main-service, Supabase-backed) gained an
`organization_id` column (nullable — additive migration, safe against a
live table with no backfill needed), threaded through
`scanTriggerService.enqueueScan` → the BullMQ job payload →
`scannerWorkers.js`'s `X-System-Org-Id` header → ai-storage-service's
`require_auth_optional`, which already accepted this header from round
3. **Honest caveat, same shape as the Key Vault one**: this code is
reviewed against the existing file's own Supabase query patterns, not
live-tested — no reachable Supabase project exists in this session's
environment.

### Still open

The permission matrix beyond binary owner/admin/member role checks (P0#3
proper), a security review of everything built across rounds 3-5, and — as
stated every round — the real-world empirical validation of the risk
model's own assumptions, which remains genuinely gated by time and real
production usage, not by anything a coding session can produce.

---

## Round 5 — P1 (calibration validation) and P2 (performance benchmarking)

### P1 — validating the calibration machinery, not the risk model

**What P1 asks for is two different things, and only one is achievable
without real production data.** "Volatility=1.8 validated against N
organizations' historical observations" requires those N organizations'
real history — that remains impossible to fake, for the same reason it
was impossible in round 2. What genuinely became possible this round: a
concrete, tested, **feedback loop** that lets real calibration data
actually correct the model going forward, plus a **reliability
diagram** (calibration curve), plus a **synthetic validation suite**
proving that machinery is mathematically correct — three things that
were either missing or unconnected before.

**Closed a real gap: `recalibrate()` computed a `suggested_volatility_adjustment`
that nothing ever read.** `calibration.get_calibrated_volatility()` is
the wiring that closes that loop — it checks this organization's real
calibration status and, once `MIN_SAMPLE_SIZE`+ real outcomes exist,
returns `1.8 × suggested_adjustment` (bounded to `[0.5×, 3×]` so a
handful of outcomes can't swing the estimate to an implausible extreme)
instead of the permanently-fixed constant. `var_simulation.simulate_var()`'s
fallback branch now calls this — meaning even before there's enough
incident-cost data to fit a full empirical Monte Carlo distribution, the
*shape parameter* of the illustrative approximation can already be
corrected by broader calibration signal (which pools all matched pairs,
not just fittable incident costs). Every VaR trail now states which basis
produced its volatility (`illustrative_default` vs
`calibrated_from_N_outcomes`) so nobody can mistake one for the other.

**`calibration.calibration_curve()`** — the actual reliability diagram:
buckets matched (prediction, outcome) pairs by predicted likelihood and
reports each bucket's real incident rate next to its mean prediction.
Buckets under 5 samples are flagged `low_sample_size` rather than plotted
with equal weight — a single-sample bucket showing "0%" or "100%" is
noise, not signal, and the API says so. Exposed via `GET
/api/v1/risk/calibration-curve`.

**`tests/test_calibration_validation.py`** — the actual validation, and
the file's own docstring is explicit about what it does and doesn't
prove: every pair in it is synthetic, generated from a KNOWN
ground-truth probability, which is what makes it possible to check the
Brier score and calibration curve behave correctly (low for a
well-calibrated synthetic predictor, measurably higher for an
over- or under-confident one; buckets track the true probability within
sampling tolerance) without waiting for real incidents. It proves the
math; it says outright that it cannot and does not prove the risk
model's real-world assumptions.

### P2 — Monte Carlo performance, benchmarked against a real server

Ran real benchmarks, not estimates — scripts are in
`scripts/benchmarks/` (with their own README covering an important
hardware caveat below) so the numbers are reproducible, not just
reported. **This sandbox has exactly 1 CPU core**, which limits which
conclusions are trustworthy — stated plainly rather than glossed over.

**Isolated compute cost**: one 10,000-draw Monte Carlo simulation takes
~6ms. In isolation, that scales to ~160 req/s sequential throughput —
not alarming on its own.

**The real finding — inline execution blocks the whole event loop for
*unrelated* requests, not just the simulation endpoint.** A live
uvicorn server with two routes (`/health`, trivial; `/heavy`, the same
Monte Carlo call awaited inline — exactly this codebase's current
pattern) showed `/health`'s p95 latency go from **1.1ms to 98.2ms — an
85.6× degradation** — while 20 concurrent `/heavy` requests were in
flight. That is a real, measured number from a real ASGI server, not an
inference from CPU-bound-code folklore.

**The standard fix (thread-pool offload via `run_in_executor`) did NOT
resolve this on this hardware** — 88.5× degradation, no better than no
offload at all — and a process-pool offload didn't either (89.3×). This
is an honest, inconclusive result, not a claim that offloading doesn't
work: with 1 CPU core, there is no real parallelism for either strategy
to exploit, and the test harness itself (client and server sharing that
one core) confounds the measurement further. **Re-run
`scripts/benchmarks/bench_live_server_*.py` on real multi-core
production-shaped hardware before trusting the offload-fix numbers
specifically** — only "inline execution blocking the event loop is a
real, measured problem" should be taken from this session's single-core
run.

**Recommendation, given both what was proven and what wasn't**: given
this codebase already has a job-queue pattern (BullMQ, in main-service)
for exactly this class of problem, the architecturally consistent fix is
routing Monte Carlo-bearing simulation runs through that queue — return a
job ID immediately, compute in a worker process, poll or webhook for the
result — rather than trying to make an in-request executor offload work
well enough. That sidesteps the single-core-vs-multi-core question
entirely rather than betting the fix on hardware this benchmark couldn't
verify.

### What's left after this round

The two round-4 gaps (findings search still `ownerId`-scoped; the
webhook/system-token path still has no real org source) are unchanged —
not addressed this round. The BullMQ-queue architecture change for
Monte Carlo is a recommendation, not an implementation — P2 diagnosed the
problem and validated (and invalidated) candidate fixes; it didn't build
the queue-based redesign.
