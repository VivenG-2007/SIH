# Risk Quantification Layer — Production Readiness Audit

**Scope:** the 5 upgrades added on top of the core Patchline X scan/fix
platform — Financial Risk Model, Control Effectiveness Engine, Optimization
Engine, Continuous Risk Calibration, and Evidence + Explainability.
Implemented at `services/ai_sevices/app/services/risk/`, exposed at
`services/ai_sevices/app/routers/risk.py` (`/api/v1/risk/*`).

**Not in scope:** the core scan/fix/verify pipeline (Semgrep + Tree-sitter
scanning, AI-assisted fix generation, GitHub PR flow, RAG memory). That
system's status is tracked separately in `docs/production-readiness.md` and
is materially further along than anything in this document — its P0 items
are done; two P1s and two P2s remain open there.

**Test status at time of writing:** 152/152 `ai_sevices` tests passing
(120 pre-existing + 32 added for this layer). All 32 new tests exercise
real logic (knapsack correctness, control-combination math, likelihood
scaling, calibration's sample-size gate) — none are placeholder/smoke
tests.

---

## Summary verdict

**Not production ready as a whole**, and — this is the important part — it
cannot become production ready purely by writing more code. Three of the
five upgrades are genuinely close (structurally complete, tested, real
algorithms). Two have a hard non-engineering blocker: they need either an
outside domain-expert review or your own production incident history,
neither of which exists yet.

| # | Upgrade | Engineering status | Production-ready? | Blocker |
|---|---|---|---|---|
| 1 | Financial Risk Model | Implemented, tested, cited | **No** | Needs actuarial/domain-expert sign-off before dollar figures reach a board |
| 2 | Control Effectiveness Engine | Implemented, tested, cited | **Partially** | Only 1 of 5 controls (MFA) is empirically grounded; rest are labeled illustrative |
| 3 | Optimization Engine | Implemented, tested, exact algorithm | **Yes, on its own terms** | Correct given its inputs; only as trustworthy as #1 and #2's numbers |
| 4 | Continuous Risk Calibration | Infrastructure implemented, tested | **No — not possible yet** | Requires ≥30 real (prediction, incident) pairs from production usage; zero exist pre-launch |
| 5 | Evidence + Explainability | Implemented, tested | **Yes** | Most buildable of the five; done |

---

## 1. Financial Risk Model — `financial_model.py`

**What's real:**
- `compute_impact()` decomposes expected loss into downtime / breach /
  regulatory / reputation, anchored to IBM's *Cost of a Data Breach Report
  2025* (600 orgs, 17 industries) — global average $4.44M, healthcare
  $7.42M, financial services $5.56M, industrial $5.0M, energy $4.83M,
  technology $4.79M, education $3.8M, retail $3.54M, public sector $2.86M.
  Every figure is a named, dated `DataPoint` in `data_sources.py`.
- `compute_eal()` is pure arithmetic (likelihood × impact) — nothing to
  validate beyond correctness, which the tests cover.
- `compute_var()` uses a log-normal tail approximation appropriate for the
  known heavy-tailed shape of breach-cost distributions.
- 12 tests cover scaling behavior, industry fallback, automation discount,
  component-sum invariants, and VaR ordering.

**What's not real, and is labeled as such in the code and every API
response:**
- The **split** of a total breach cost into downtime/breach/regulatory/
  reputation percentages (20/35/20/25) is an illustrative modeling choice.
  IBM's report gives a total and a different internal breakdown
  (detection/escalation, notification, post-breach response, lost
  business), not this architecture's four categories — mapping one onto
  the other is a judgment call, not a cited figure.
- The **likelihood mapping** (`CVSS / 10` as an annual probability) is a
  severity score being used as if it were a calibrated probability. It
  isn't one. CVSS measures how bad an exploit would be, not how likely it
  is to happen to you this year.
- The **VaR volatility shape parameter** (1.8) is a placeholder chosen to
  produce a plausible fat tail, not fit to any organization's real loss
  history — because no organization using this platform has loss history
  in it yet.

**What "production ready" requires here, concretely:**
1. A security/risk domain expert (ideally with actuarial background)
   reviews and either approves or replaces the impact-split percentages
   and the CVSS-to-likelihood mapping.
2. The organization's own revenue-at-risk and regulatory-exposure figures
   replace the industry-average anchors wherever available — industry
   averages should be a fallback, not the primary number a CISO presents
   to a board.
3. This is a "weeks, with a named reviewer," not "more sprints" item.

---

## 2. Control Effectiveness Engine — `control_effectiveness.py`

**What's real:**
- `apply_controls()` combines multiple controls **multiplicatively against
  surviving risk**, not additively — this is a real, deliberate fix for
  the common naive bug where three ~40%-effective controls would
  otherwise "sum" past 100% risk reduction. Tested explicitly.
- Exactly one control — MFA against credential-based attacks — has a real
  empirical backing: a peer-reviewed population study (Meyer et al.,
  Microsoft Research, arXiv:2305.00945) across >8M commercial accounts
  found MFA reduces compromise risk by 99.2%. That paper's scope is
  credential-based initial access specifically, and the code comments and
  data registry say so — it is not applied as a general-purpose "MFA
  reduces everything" number.
- Unknown controls **raise an error** rather than silently contributing 0%
  reduction — tested. This matters: a silent 0% would understate risk
  reduction and make the optimizer under-value a control that's actually
  helping.

**What's not real:**
- EDR (45%), network segmentation (35%), WAF (30%), and a 7-day patch SLA
  (50%) are all `ConfidenceTier.ILLUSTRATIVE` — directionally reasonable
  numbers with no isolated causal study behind them. I searched for a
  causal (not merely correlational, not vendor-marketing) estimate for
  each and did not find one worth citing as empirical.
- The **independence assumption** underlying multiplicative combination
  (each control reduces what's left, as if controls fail independently)
  is itself a simplification the code flags but doesn't solve — real
  controls can have correlated failure modes (an attacker who defeats EDR
  may be positioned to defeat segmentation too).

**What "production ready" requires here:**
1. Either (a) source a cyber-insurer's actuarial control-effectiveness
   table (insurers price this because they have to), or (b) accumulate
   your own control-testing/incident data to fit these factors, before
   presenting EDR/WAF/segmentation numbers as anything more than a
   labeled starting prior.
2. Until then, every response correctly surfaces
   `contains_illustrative_data: true` on any trail using a non-MFA
   control — that flag should drive a visible UI badge, not just live in
   an API response nobody reads.

---

## 3. Optimization Engine — `optimization.py`

**What's real, and this one earns an unqualified "yes":**
- Exact 0/1-knapsack via dynamic programming, O(n × budget). Given a set
  of (cost, risk-reduction) pairs and a budget, it returns the
  **provably optimal** subset — not a greedy approximation.
- Tested specifically against a case where greedy-by-ratio picks the
  wrong answer (`test_optimizer_is_exact_not_greedy`) to confirm this
  isn't secretly a greedy heuristic wearing an optimizer's name.
- Budget/cost validation (negative values rejected, a $50M budget guard
  against accidentally exploding the DP table) is in place and tested.

**The one caveat, and it's about scope, not correctness:**
- This module is exact math over whatever numbers you hand it. It has no
  way to know whether those risk-reduction figures are trustworthy — that
  trust is entirely inherited from wherever the numbers came from
  (typically `control_effectiveness.marginal_risk_reduction_usd()`, which
  inherits Upgrade 2's empirical/illustrative split above). "Production
  ready" for the *solver* and "production ready" for the *decision it
  produces* are two different claims — the first is true today, the
  second isn't until #1 and #2 are further along.

---

## 4. Continuous Risk Calibration — `calibration.py`

**This is the one upgrade where the honest answer is "not yet, and not
soon, regardless of engineering effort."**

**What's real:**
- `PredictionRecord` / `OutcomeRecord` schemas exist, ready to log every
  EAL/likelihood prediction the platform emits and match it against a
  real outcome later.
- `recalibrate()` implements a real comparison (mean absolute error,
  predicted-vs-actual mean, a volatility-adjustment suggestion) — the
  logic is not fake.
- Crucially, it **enforces `MIN_SAMPLE_SIZE = 30`** and raises
  `InsufficientDataError` below that floor, rather than running on 3 data
  points and returning a confident-looking number. This is tested
  (`test_recalibrate_refuses_below_minimum_sample_size`) and is the single
  most important property of this module: it is designed to refuse to lie
  about being calibrated.
- `GET /api/v1/risk/calibration-status` currently and correctly reports
  `calibrated: false, current_sample_size: 0` — it is not wired to a real
  data store yet (there's nothing to wire to; see below), so it says so
  plainly instead of fabricating a report.

**Why this can't be fixed by writing more code:**
Calibration is, by definition, a comparison between what the model
predicted and what actually happened. A platform with zero production
incident history has nothing to compare against. This isn't a missing
feature — it's missing data that can only come from real usage over time
(the 30-sample floor is a statistical minimum, not an arbitrary
gate). Any recalibration run against fewer samples would be fitting noise
and could make predictions *worse* while looking more sophisticated.

**What "production ready" requires here:**
1. Deploy the platform, start logging `PredictionRecord`s for every score
   the risk engine emits (this part IS just an engineering task — wiring
   the storage layer — and is reasonable to do now).
2. Wait for real incidents (or confirmed non-incident review windows) to
   accumulate ≥30 matched pairs. This is a calendar-time blocker, not an
   engineering-effort blocker.
3. Until then, `calibration-status` should stay `false`, and every EAL/VaR
   figure elsewhere in the platform should be presented as an
   illustrative/prior estimate — which the EvidenceTrail on each of them
   already does.

---

## 5. Evidence + Explainability — `evidence.py`

**What's real, and this is the most straightforwardly done of the five:**
- `EvidenceTrail` is attached to every score produced anywhere in this
  layer — impact, likelihood, control-adjusted likelihood, VaR,
  optimization result — with inputs, named data sources (each tagged
  `empirical` or `illustrative`), a formula version string, and a
  human-readable explanation.
- `has_illustrative_input()` gives callers (the API layer, eventually the
  frontend) a single boolean to key a "this number uses unverified
  placeholder data" UI treatment off of, so an illustrative figure can
  never silently look identical to an empirical one.
- Every `/api/v1/risk/*` response includes the full evidence array, not a
  summary — an auditor or CISO can trace any number back to its inputs
  without a separate lookup.

**What's not yet done, and is a real (if modest) gap:**
- There's no persistence layer for evidence trails yet — they're computed
  and returned per-request, not stored for later audit/compliance-report
  generation (SIH architecture section 15/16 imagines this feeding a
  compliance evidence engine and a blockchain hash). That's a genuine
  "needs more engineering" item, unlike calibration's data-time blocker.
- No UI work has been done to actually render the illustrative-data badge
  this was built to support — the flag exists in the API, not yet in
  `frontend/`.

---

## What I'd tell a judge or a CISO, in one paragraph each

**To an SIH judge:** the scanner/fix pipeline is real and close to
production-grade; the risk-quantification layer on top of it is honestly
architected — real algorithms, cited data where citation is possible, and
explicit, tested refusal to fabricate confidence it doesn't have (the
calibration gate is the clearest example). That refusal is a feature to
highlight, not a gap to hide: a system that knows what it doesn't know is
more credible than one that presents every number with the same false
authority.

**To a CISO evaluating this for real money:** don't put the Financial Risk
Model's dollar figures or the non-MFA control-effectiveness numbers in
front of your board yet. Do use the Optimization Engine now — it's exactly
as good as the risk-reduction numbers you feed it, so feed it your own
control-testing data if you have any, and treat the built-in illustrative
defaults as a demo, not an input to a real budget decision.
