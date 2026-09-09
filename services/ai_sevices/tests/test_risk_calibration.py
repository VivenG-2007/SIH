import os

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import pytest

from app.services.risk import calibration as cal


def _prediction(i):
    return cal.PredictionRecord(
        prediction_id=f"p{i}",
        finding_or_asset_id=f"f{i}",
        predicted_eal_usd=100_000,
        predicted_likelihood=0.1,
        formula_version="risk-engine-v1",
    )


def _outcome(i, actual_cost):
    return cal.OutcomeRecord(
        prediction_id=f"p{i}",
        outcome_type="incident_occurred",
        actual_cost_usd=actual_cost,
    )


def test_recalibrate_refuses_below_minimum_sample_size():
    predictions = [_prediction(i) for i in range(5)]
    outcomes = [_outcome(i, 90_000) for i in range(5)]
    assert len(predictions) < cal.MIN_SAMPLE_SIZE
    with pytest.raises(cal.InsufficientDataError):
        cal.recalibrate(predictions, outcomes)


def test_recalibrate_runs_once_minimum_sample_size_met():
    n = cal.MIN_SAMPLE_SIZE
    predictions = [_prediction(i) for i in range(n)]
    outcomes = [_outcome(i, 120_000) for i in range(n)]
    report = cal.recalibrate(predictions, outcomes)
    assert report.sample_size == n
    assert report.predicted_mean_usd == 100_000
    assert report.actual_mean_usd == 120_000
    assert report.suggested_volatility_adjustment == pytest.approx(1.2)


def test_recalibrate_ignores_non_incident_outcomes_for_eal_accuracy():
    n = cal.MIN_SAMPLE_SIZE
    predictions = [_prediction(i) for i in range(n)]
    # Half are confirmed non-incidents. They don't count toward
    # `sample_size` (the EAL-dollar-accuracy metric, which only makes
    # sense for pairs where an incident actually occurred) — but they DO
    # count toward the Brier-score/calibration_error metrics, which
    # legitimately need the full incident+non-incident population. With
    # n total matched pairs (>= MIN_SAMPLE_SIZE) but only n/2 incident
    # pairs (< MIN_SAMPLE_SIZE), recalibrate() should NOT raise — Brier
    # score is computable — but sample_size should reflect only the
    # incident-matched subset.
    outcomes = [
        cal.OutcomeRecord(prediction_id=f"p{i}", outcome_type="confirmed_no_incident_in_window", actual_cost_usd=None)
        if i % 2 == 0 else _outcome(i, 100_000)
        for i in range(n)
    ]
    report = cal.recalibrate(predictions, outcomes)
    assert report.sample_size < cal.MIN_SAMPLE_SIZE  # incident-only subset stays small
    assert report.brier_score is not None  # but Brier score used the full matched population


def test_recalibrate_raises_when_neither_metric_has_enough_data():
    predictions = [_prediction(i) for i in range(5)]
    outcomes = [_outcome(i, 100_000) for i in range(5)]
    with pytest.raises(cal.InsufficientDataError):
        cal.recalibrate(predictions, outcomes)


def test_recalibrate_unmatched_predictions_are_ignored():
    n = cal.MIN_SAMPLE_SIZE
    predictions = [_prediction(i) for i in range(n + 5)]  # 5 with no outcome at all
    outcomes = [_outcome(i, 100_000) for i in range(n)]
    report = cal.recalibrate(predictions, outcomes)
    assert report.sample_size == n


def test_brier_score_is_zero_for_perfect_predictions():
    predictions = [
        cal.PredictionRecord(prediction_id=f"p{i}", finding_or_asset_id=f"f{i}",
                              predicted_eal_usd=100_000, predicted_likelihood=1.0 if i % 2 == 0 else 0.0,
                              formula_version="risk-engine-v1")
        for i in range(cal.MIN_SAMPLE_SIZE)
    ]
    outcomes = [
        cal.OutcomeRecord(prediction_id=f"p{i}",
                           outcome_type="incident_occurred" if i % 2 == 0 else "confirmed_no_incident_in_window",
                           actual_cost_usd=50_000 if i % 2 == 0 else None)
        for i in range(cal.MIN_SAMPLE_SIZE)
    ]
    report = cal.recalibrate(predictions, outcomes)
    assert report.brier_score == pytest.approx(0.0)
    assert report.calibration_error == pytest.approx(0.0)


def test_brier_score_is_high_for_confidently_wrong_predictions():
    predictions = [
        cal.PredictionRecord(prediction_id=f"p{i}", finding_or_asset_id=f"f{i}",
                              predicted_eal_usd=100_000, predicted_likelihood=1.0 if i % 2 == 0 else 0.0,
                              formula_version="risk-engine-v1")
        for i in range(cal.MIN_SAMPLE_SIZE)
    ]
    # Predictions are exactly backwards from outcomes.
    outcomes = [
        cal.OutcomeRecord(prediction_id=f"p{i}",
                           outcome_type="confirmed_no_incident_in_window" if i % 2 == 0 else "incident_occurred",
                           actual_cost_usd=None if i % 2 == 0 else 50_000)
        for i in range(cal.MIN_SAMPLE_SIZE)
    ]
    report = cal.recalibrate(predictions, outcomes)
    assert report.brier_score == pytest.approx(1.0)


async def test_record_and_list_predictions_roundtrip(db):
    org = "org-1"
    await cal.record_prediction(db, org, _prediction(1))
    assert len(await cal.list_predictions(db, org)) == 1
    # Re-recording the same prediction_id overwrites, not duplicates.
    await cal.record_prediction(db, org, _prediction(1))
    assert len(await cal.list_predictions(db, org)) == 1


async def test_record_outcome_appends(db):
    org = "org-1"
    await cal.record_outcome(db, org, _outcome(1, 50_000))
    await cal.record_outcome(db, org, _outcome(2, 60_000))
    assert len(await cal.list_outcomes(db, org)) == 2


async def test_predictions_are_scoped_by_organization(db):
    await cal.record_prediction(db, "org-a", _prediction(1))
    assert len(await cal.list_predictions(db, "org-a")) == 1
    assert len(await cal.list_predictions(db, "org-b")) == 0


async def test_current_status_reports_uncalibrated_with_zero_data(db):
    status = await cal.current_status(db, "org-1")
    assert status["calibrated"] is False
    assert status["current_sample_size"] == 0
    assert status["predictions_logged"] == 0


async def test_current_status_becomes_calibrated_once_enough_real_data_exists(db):
    org = "org-1"
    n = cal.MIN_SAMPLE_SIZE
    for i in range(n):
        await cal.record_prediction(db, org, _prediction(i))
        await cal.record_outcome(db, org, _outcome(i, 100_000))
    status = await cal.current_status(db, org)
    assert status["calibrated"] is True
    assert status["current_sample_size"] == n
    assert status["brier_score"] is not None


async def test_predicted_figures_are_encrypted_at_rest(db):
    org = "org-1"
    await cal.record_prediction(db, org, _prediction(1))
    raw_doc = await db[cal.PREDICTIONS_COLLECTION].find_one({"organizationId": org, "predictionId": "p1"})
    assert "predictedEalUsdEncrypted" in raw_doc
    assert "100000" not in str(raw_doc["predictedEalUsdEncrypted"])
