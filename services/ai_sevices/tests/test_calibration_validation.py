"""
Synthetic validation of the calibration MACHINERY (P1).

Read this file's name carefully: it validates that the Brier score,
calibration curve, and volatility-feedback CODE are statistically
correct — not that this platform's risk model's real-world assumptions
(the severity->CVSS midpoints, the 0.45/0.30/0.25 criticality weights,
the illustrative control-effectiveness factors, volatility=1.8 itself)
are empirically true of any real organization. That second kind of
validation is impossible to fake honestly: it requires real historical
incidents from real organizations, accumulated over real time, which by
definition doesn't exist for a platform that hasn't been deployed yet.
Conflating "the math is implemented correctly" with "the model's
assumptions are empirically validated" would be exactly the kind of
overclaim this whole codebase's evidence-and-confidence-tier discipline
exists to prevent — so this file only claims the former.

What IS legitimately provable without real data: if you feed the
calibration pipeline synthetic (prediction, outcome) pairs generated from
a KNOWN probability process, does it correctly recover that process's
properties? Two synthetic generators:

  - A WELL-CALIBRATED synthetic predictor: for each synthetic prediction
    of likelihood p, an "incident" is generated with probability exactly
    p (a real, correctly-weighted coin flip via `random.random() < p`).
    Brier score should land near the theoretical value for that process,
    and calibration_curve's actual-rate-per-bucket should track
    predicted-likelihood-per-bucket closely.

  - A MISCALIBRATED synthetic predictor: predictions that are
    systematically overconfident (predicted p, but actual incident
    probability is only p/2) or underconfident (predicted p, actual
    probability min(2p, 1)). Brier score should be MEASURABLY worse than
    the well-calibrated case, and calibration_curve should show the
    actual rate diverging from the predicted rate in the expected
    direction. This is the discriminating test: a metric that can't tell
    well-calibrated from miscalibrated data isn't validating anything.

Large N (thousands of synthetic pairs) is used throughout specifically so
sampling noise doesn't drown out the signal being tested — this is a
statistical-correctness test suite, and it needs enough samples to make
statistical claims meaningfully.
"""

import os
import random

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import calibration as cal

ORG = "org-1"
N = 4000


def _synthetic_predictions_and_outcomes(rng: random.Random, miscalibration: str = "none"):
    """Generates N synthetic (PredictionRecord, OutcomeRecord) pairs.

    miscalibration:
      "none"           -> actual incident probability == predicted_likelihood (well-calibrated)
      "overconfident"  -> actual incident probability == predicted_likelihood / 2
                           (predictor claims MORE risk than is real)
      "underconfident" -> actual incident probability == min(predicted_likelihood * 2, 1.0)
                           (predictor claims LESS risk than is real)
    """
    predictions, outcomes = [], []
    for i in range(N):
        predicted_p = rng.uniform(0.0, 1.0)
        if miscalibration == "overconfident":
            true_p = predicted_p / 2
        elif miscalibration == "underconfident":
            true_p = min(predicted_p * 2, 1.0)
        else:
            true_p = predicted_p

        incident = rng.random() < true_p
        pid = f"synthetic-{i}"
        predictions.append(cal.PredictionRecord(
            prediction_id=pid, finding_or_asset_id="synthetic-asset",
            predicted_eal_usd=100_000.0, predicted_likelihood=predicted_p,
            formula_version="risk-engine-v1",
        ))
        outcomes.append(cal.OutcomeRecord(
            prediction_id=pid,
            outcome_type="incident_occurred" if incident else "confirmed_no_incident_in_window",
            actual_cost_usd=50_000.0 if incident else None,
        ))
    return predictions, outcomes


# --- Brier score correctly discriminates calibrated from miscalibrated -----

def test_brier_score_is_low_for_a_well_calibrated_synthetic_predictor():
    rng = random.Random(1)
    predictions, outcomes = _synthetic_predictions_and_outcomes(rng, "none")
    report = cal.recalibrate(predictions, outcomes)
    # Theoretical Brier score for p ~ Uniform(0,1) predictions that are
    # exactly correct is E[p(1-p)] = 1/6 ≈ 0.1667 — this isn't 0 because
    # even a PERFECTLY calibrated predictor has irreducible outcome
    # randomness at every p strictly between 0 and 1.
    assert report.brier_score == pytest.approx(1 / 6, abs=0.02)


def test_brier_score_is_measurably_worse_when_overconfident():
    calibrated_preds, calibrated_outs = _synthetic_predictions_and_outcomes(random.Random(2), "none")
    miscalibrated_preds, miscalibrated_outs = _synthetic_predictions_and_outcomes(random.Random(2), "overconfident")

    calibrated_report = cal.recalibrate(calibrated_preds, calibrated_outs)
    miscalibrated_report = cal.recalibrate(miscalibrated_preds, miscalibrated_outs)

    assert miscalibrated_report.brier_score > calibrated_report.brier_score


def test_brier_score_is_measurably_worse_when_underconfident():
    calibrated_preds, calibrated_outs = _synthetic_predictions_and_outcomes(random.Random(3), "none")
    miscalibrated_preds, miscalibrated_outs = _synthetic_predictions_and_outcomes(random.Random(3), "underconfident")

    calibrated_report = cal.recalibrate(calibrated_preds, calibrated_outs)
    miscalibrated_report = cal.recalibrate(miscalibrated_preds, miscalibrated_outs)

    assert miscalibrated_report.brier_score > calibrated_report.brier_score


# --- Calibration curve correctly reflects the underlying process -----------

def test_calibration_curve_tracks_actual_rate_for_well_calibrated_data():
    rng = random.Random(4)
    predictions, outcomes = _synthetic_predictions_and_outcomes(rng, "none")
    buckets = cal.calibration_curve(predictions, outcomes, n_buckets=10)

    well_populated = [b for b in buckets if not b["low_sample_size"]]
    assert len(well_populated) >= 8  # nearly every bucket should have plenty of samples at N=4000

    for bucket in well_populated:
        # Well-calibrated: actual rate should track the bucket's mean
        # predicted likelihood within a reasonable sampling-noise margin.
        assert bucket["actual_incident_rate"] == pytest.approx(bucket["mean_predicted_likelihood"], abs=0.08)


def test_calibration_curve_diverges_for_overconfident_data():
    rng = random.Random(5)
    predictions, outcomes = _synthetic_predictions_and_outcomes(rng, "overconfident")
    buckets = cal.calibration_curve(predictions, outcomes, n_buckets=10)

    well_populated = [b for b in buckets if not b["low_sample_size"] and b["mean_predicted_likelihood"] > 0.3]
    assert well_populated  # sanity: we have buckets to check

    for bucket in well_populated:
        # Overconfident: real incident rate should sit measurably BELOW
        # what was predicted (predictor claimed more risk than was real).
        assert bucket["actual_incident_rate"] < bucket["mean_predicted_likelihood"] - 0.05


def test_calibration_curve_diverges_for_underconfident_data():
    rng = random.Random(6)
    predictions, outcomes = _synthetic_predictions_and_outcomes(rng, "underconfident")
    buckets = cal.calibration_curve(predictions, outcomes, n_buckets=10)

    well_populated = [b for b in buckets if not b["low_sample_size"] and b["mean_predicted_likelihood"] < 0.4]
    assert well_populated

    for bucket in well_populated:
        # Underconfident: real incident rate should sit measurably ABOVE
        # what was predicted (predictor claimed less risk than was real).
        assert bucket["actual_incident_rate"] > bucket["mean_predicted_likelihood"] + 0.05


def test_calibration_curve_flags_low_sample_buckets():
    # Tiny N -> most buckets should be flagged, not silently reported as
    # if they were statistically meaningful.
    rng = random.Random(7)
    predictions, outcomes = _synthetic_predictions_and_outcomes(rng, "none")
    tiny_predictions, tiny_outcomes = predictions[:3], outcomes[:3]
    buckets = cal.calibration_curve(tiny_predictions, tiny_outcomes, n_buckets=10)
    assert sum(1 for b in buckets if b["low_sample_size"]) >= 7


def test_calibration_curve_empty_buckets_report_none_not_zero():
    # An empty bucket's actual_incident_rate must be None, never 0 —
    # reporting 0 would look like "we measured a 0% incident rate here"
    # instead of "we have no data here".
    buckets = cal.calibration_curve([], [], n_buckets=10)
    assert all(b["count"] == 0 for b in buckets)
    assert all(b["actual_incident_rate"] is None for b in buckets)


# --- Volatility feedback loop -----------------------------------------------

async def test_get_calibrated_volatility_returns_default_when_uncalibrated(db):
    volatility, basis = await cal.get_calibrated_volatility(db, ORG)
    assert volatility == 1.8
    assert basis == "illustrative_default"


async def test_get_calibrated_volatility_adjusts_once_real_data_exists(db):
    # Seed enough real (prediction, outcome) pairs showing actual losses
    # running systematically HIGHER than predicted — should nudge
    # volatility upward (a real tail-risk correction), not leave it fixed.
    for i in range(cal.MIN_SAMPLE_SIZE):
        await cal.record_prediction(db, ORG, cal.PredictionRecord(
            prediction_id=f"p{i}", finding_or_asset_id="a", predicted_eal_usd=100_000.0,
            predicted_likelihood=0.5, formula_version="risk-engine-v1",
        ))
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=200_000.0,
        ))
    volatility, basis = await cal.get_calibrated_volatility(db, ORG)
    assert volatility != 1.8
    assert basis.startswith("calibrated_from_")


async def test_get_calibrated_volatility_adjustment_is_bounded(db):
    # Seed an extreme single-direction miscalibration and confirm the
    # resulting volatility never exceeds the documented bounds, even
    # though the raw suggested_volatility_adjustment might be extreme.
    for i in range(cal.MIN_SAMPLE_SIZE):
        await cal.record_prediction(db, ORG, cal.PredictionRecord(
            prediction_id=f"p{i}", finding_or_asset_id="a", predicted_eal_usd=1_000.0,
            predicted_likelihood=0.5, formula_version="risk-engine-v1",
        ))
        await cal.record_outcome(db, ORG, cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=1_000_000.0,  # 1000x predicted
        ))
    volatility, _ = await cal.get_calibrated_volatility(db, ORG, default=1.8)
    low, high = cal._VOLATILITY_ADJUSTMENT_BOUNDS
    assert 1.8 * low <= volatility <= 1.8 * high


async def test_get_calibrated_volatility_is_organization_scoped(db):
    for i in range(cal.MIN_SAMPLE_SIZE):
        await cal.record_prediction(db, "org-a", cal.PredictionRecord(
            prediction_id=f"p{i}", finding_or_asset_id="a", predicted_eal_usd=100_000.0,
            predicted_likelihood=0.5, formula_version="risk-engine-v1",
        ))
        await cal.record_outcome(db, "org-a", cal.OutcomeRecord(
            prediction_id=f"p{i}", outcome_type="incident_occurred", actual_cost_usd=500_000.0,
        ))
    org_a_volatility, org_a_basis = await cal.get_calibrated_volatility(db, "org-a")
    org_b_volatility, org_b_basis = await cal.get_calibrated_volatility(db, "org-b")
    assert org_a_basis.startswith("calibrated_from_")
    assert org_b_basis == "illustrative_default"
    assert org_a_volatility != org_b_volatility
