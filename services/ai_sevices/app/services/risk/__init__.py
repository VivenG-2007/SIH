"""
Cyber Risk Quantification layer — the 5 upgrades over the baseline
scan/fix platform:

  1. financial_model.py          — EAL/VaR, downtime/breach/regulatory/reputation
  2. control_effectiveness.py    — cited risk-reduction factors per control
  3. optimization.py             — exact budget-constrained knapsack solver
  4. calibration.py              — INFRASTRUCTURE ONLY, not usable pre-launch
  5. evidence.py                 — audit trail attached to every score above

See docs/risk-engine-audit.md for the honest production-readiness verdict
per module — some of this is real and tested, some of it (calibration,
and any ILLUSTRATIVE-tier figures in data_sources.py) is structurally
complete but not yet backed by the data it needs to be trustworthy.
"""
