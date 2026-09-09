import os
import random

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import calibration as cal
from app.services.risk import var_simulation as vs

ORG = "org-1"


async def test_falls_back_to_illustrative_with_no_real_data(db):
    result, trail = await vs.simulate_var(db, ORG, 100_000)
    assert result.method == "illustrative_lognormal_fallback"
    assert result.sample_size == 0
    assert "ILLUSTRATIVE" in trail.explanation


async def test_fallback_percentiles_are_monotonically_increasing(db):
    result, _ = await vs.simulate_var(db, ORG, 100_000)
    assert result.p50_usd <= result.p75_usd <= result.p90_usd <= result.p95_usd <= result.p99_usd


async def test_monte_carlo_fit_kicks_in_once_enough_real_outcomes_exist(db):
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=100_000 + i * 1000,
        ))
    result, trail = await vs.simulate_var(db, ORG, 100_000, rng=random.Random(42))
    assert result.method == "monte_carlo_empirical_fit"
    assert result.sample_size == vs.MIN_SAMPLE_SIZE_FOR_FIT
    assert "real recorded incident outcomes" in trail.explanation


async def test_monte_carlo_percentiles_are_monotonically_increasing(db):
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=50_000 + i * 5000,
        ))
    result, _ = await vs.simulate_var(db, ORG, 100_000, rng=random.Random(1))
    assert result.p50_usd <= result.p75_usd <= result.p90_usd <= result.p95_usd <= result.p99_usd


async def test_non_incident_outcomes_never_count_toward_the_fit(db):
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="confirmed_no_incident_in_window", actual_cost_usd=None,
        ))
    result, _ = await vs.simulate_var(db, ORG, 100_000)
    assert result.method == "illustrative_lognormal_fallback"


async def test_zero_and_negative_costs_are_excluded_from_the_fit(db):
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=0,
        ))
    result, _ = await vs.simulate_var(db, ORG, 100_000)
    # All recorded costs are 0, which get filtered out of the fit sample
    # entirely (a log-normal has no support at 0) — so this should NOT
    # count as having enough real data, and falls back.
    assert result.method == "illustrative_lognormal_fallback"


async def test_outcomes_from_another_organization_never_leak_into_the_fit(db):
    for i in range(vs.MIN_SAMPLE_SIZE_FOR_FIT):
        await cal.record_outcome(db, "org-other", cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=100_000,
        ))
    result, _ = await vs.simulate_var(db, ORG, 100_000)
    assert result.method == "illustrative_lognormal_fallback"


def test_fit_lognormal_params_matches_known_values():
    import math
    samples = [math.exp(1.0), math.exp(1.0), math.exp(1.0)]  # log(sample) == 1.0 for all
    mu, sigma = vs._fit_lognormal_params(samples)
    assert mu == pytest.approx(1.0)
    assert sigma == pytest.approx(0.0)
