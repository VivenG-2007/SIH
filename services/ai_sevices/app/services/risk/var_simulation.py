"""
Monte Carlo Value-at-Risk (SIH follow-up critique #6).

financial_model.compute_var() uses a single fixed, ILLUSTRATIVE log-normal
shape parameter (volatility=1.8) because no real loss distribution exists
for this organization yet — see that function's own docstring. This module
is the honest upgrade path: once calibration.py has accumulated real
`OutcomeRecord.actual_cost_usd` values from actual incidents, THIS module
fits a distribution to them and Monte Carlo simulates P50/P75/P90/P95/P99
loss instead of using the fixed illustrative shape parameter.

Until enough real outcomes exist — which is the honest state of any
newly-deployed instance, including this one right now, since
MIN_SAMPLE_SIZE_FOR_FIT mirrors calibration.py's own floor —
`simulate_var()` falls back to financial_model.compute_var()'s
single-point illustrative approximation and SAYS SO in its result, rather
than running a Monte Carlo simulation against a distribution fit to too
little data to mean anything. Running 10,000 simulated draws from an
unfit distribution isn't more rigorous than a single formula — it's the
same illustrative guess with more theater wrapped around it, which is
exactly the failure mode this whole risk-engine package exists to avoid
elsewhere. Don't lower MIN_SAMPLE_SIZE_FOR_FIT to make a demo look more
finished, for the same reason calibration.py says not to lower its own.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from . import calibration
from . import financial_model as fm
from .evidence import EvidenceTrail, FORMULA_VERSION

MIN_SAMPLE_SIZE_FOR_FIT = calibration.MIN_SAMPLE_SIZE
N_SIMULATIONS = 10_000


@dataclass
class VarSimulationResult:
    method: str  # "monte_carlo_empirical_fit" | "illustrative_lognormal_fallback"
    p50_usd: float
    p75_usd: float
    p90_usd: float
    p95_usd: float
    p99_usd: float
    sample_size: int


def _fit_lognormal_params(samples: list[float]) -> tuple[float, float]:
    """Fit mu/sigma of a log-normal distribution to positive real loss
    samples via mean and stdev of the natural log of each sample (the
    standard method-of-moments-on-logs approach). Samples <= 0 are
    dropped — a log-normal has no support at 0, and a recorded "loss" of
    exactly $0 almost always means a confirmed-no-incident outcome, which
    belongs on the likelihood/calibration side of this system, not the
    loss-severity distribution being fit here."""
    logs = [math.log(s) for s in samples if s > 0]
    n = len(logs)
    mu = sum(logs) / n
    variance = sum((x - mu) ** 2 for x in logs) / n if n > 1 else 0.0
    sigma = math.sqrt(variance)
    return mu, sigma


async def simulate_var(db, organization_id: str, eal: float, *, rng: random.Random | None = None) -> tuple[VarSimulationResult, EvidenceTrail]:
    """Returns Monte Carlo-simulated P50/P75/P90/P95/P99 loss if enough
    real incident outcomes have been recorded to fit a distribution to;
    otherwise falls back to financial_model.compute_var()'s illustrative
    single-point approximation for every requested percentile — clearly
    labeled `method="illustrative_lognormal_fallback"`, never silently
    presented as a real Monte Carlo fit."""
    all_outcomes = await calibration.list_outcomes(db, organization_id)
    outcomes = [
        o.actual_cost_usd for o in all_outcomes
        if o.outcome_type == "incident_occurred" and o.actual_cost_usd and o.actual_cost_usd > 0
    ]

    if len(outcomes) < MIN_SAMPLE_SIZE_FOR_FIT:
        # Even in the fallback path, don't necessarily use the raw fixed
        # illustrative constant — if this organization's calibration data
        # (which pools ALL matched pairs, not just fittable incident-cost
        # samples) has already crossed MIN_SAMPLE_SIZE, use its calibrated
        # volatility instead. This is the concrete "re-estimate
        # parameters" feedback loop: a real calibration signal correcting
        # the illustrative shape parameter even before there's enough
        # incident-cost data to fit a full empirical distribution.
        volatility, volatility_basis = await calibration.get_calibrated_volatility(db, organization_id)
        var90, _ = fm.compute_var(eal, confidence=0.90, volatility=volatility)
        var95, _ = fm.compute_var(eal, confidence=0.95, volatility=volatility)
        var99, _ = fm.compute_var(eal, confidence=0.99, volatility=volatility)
        result = VarSimulationResult(
            method="illustrative_lognormal_fallback",
            p50_usd=eal,
            # Coarse linear interpolation, NOT a real percentile estimate
            # — flagged explicitly in the trail below.
            p75_usd=(eal + var90) / 2,
            p90_usd=var90,
            p95_usd=var95,
            p99_usd=var99,
            sample_size=len(outcomes),
        )
        trail = EvidenceTrail(
            score_type="value_at_risk_simulation",
            inputs={
                "eal": eal,
                "real_outcome_sample_size": len(outcomes),
                "min_required_to_fit": MIN_SAMPLE_SIZE_FOR_FIT,
                "volatility_used": volatility,
                "volatility_basis": volatility_basis,
            },
            data_sources=[],
            formula_version=FORMULA_VERSION,
            explanation=(
                f"Only {len(outcomes)} real incident outcome(s) recorded "
                f"(need {MIN_SAMPLE_SIZE_FOR_FIT} to fit a distribution) — "
                f"falling back to financial_model.compute_var()'s single "
                f"log-normal-tail approximation at each percentile rather "
                f"than Monte Carlo simulating against an unfit "
                f"distribution, which would look more rigorous without "
                f"being more true. p75 here is a coarse linear "
                f"interpolation between EAL and p90, not a real percentile "
                f"estimate — do not present it as one. Volatility shape "
                f"parameter used: {volatility:.3f} ({volatility_basis}) — "
                + (
                    "still the fixed ILLUSTRATIVE default, not yet corrected "
                    "by any real calibration signal."
                    if volatility_basis == "illustrative_default" else
                    "corrected from the fixed illustrative default by this "
                    "organization's own real calibration data — see "
                    "calibration.get_calibrated_volatility()."
                )
            ),
        )
        return result, trail

    mu, sigma = _fit_lognormal_params(outcomes)
    rng = rng or random.Random()
    draws = sorted(math.exp(rng.gauss(mu, sigma)) for _ in range(N_SIMULATIONS))

    def pct(p: float) -> float:
        idx = min(int(p * len(draws)), len(draws) - 1)
        return draws[idx]

    result = VarSimulationResult(
        method="monte_carlo_empirical_fit",
        p50_usd=pct(0.50), p75_usd=pct(0.75), p90_usd=pct(0.90), p95_usd=pct(0.95), p99_usd=pct(0.99),
        sample_size=len(outcomes),
    )
    trail = EvidenceTrail(
        score_type="value_at_risk_simulation",
        inputs={
            "real_outcome_sample_size": len(outcomes),
            "n_simulations": N_SIMULATIONS,
            "fitted_mu": mu,
            "fitted_sigma": sigma,
        },
        data_sources=[],
        formula_version=FORMULA_VERSION,
        explanation=(
            f"Log-normal distribution fit to {len(outcomes)} real recorded "
            f"incident outcomes (mu={mu:.3f}, sigma={sigma:.3f}), then Monte "
            f"Carlo simulated ({N_SIMULATIONS:,} draws) for P50/P75/P90/P95/"
            f"P99 loss. This is a real fit to this organization's own "
            f"incident history, not the illustrative fixed-shape fallback — "
            f"still treat it as approximate with only {len(outcomes)} "
            f"sample(s) backing the fit."
        ),
    )
    return result, trail
