"""
Continuous Risk Calibration (Upgrade 4) — INFRASTRUCTURE ONLY.

Read this docstring before assuming anything in this file makes the
platform "calibrated." It does not, and cannot, yet.

WHY THIS CAN'T BE "PRODUCTION READY" TODAY
-------------------------------------------
Calibration means comparing this platform's PREDICTED risk (an EAL/VaR
figure computed pre-incident) against ACTUAL observed outcomes (what a
real incident, if one occurs, actually cost this organization), and using
the gap to correct the model's future predictions — e.g. adjusting
volatility shape parameters, control-effectiveness factors, or likelihood
mappings.

That requires a population of real (prediction, outcome) pairs. A
pre-launch or newly-launched platform has zero. This isn't a "write more
code" gap — it's a "wait for real usage" gap. Any recalibration performed
against fewer than a statistically meaningful sample size would be
overfitting noise and could easily make predictions WORSE while looking
more "data-driven." recalibrate() below enforces a minimum sample size
and refuses to run below it, on purpose.

WHAT THIS FILE DOES PROVIDE
----------------------------
The scaffolding so that calibration becomes possible the moment real data
exists, without a schema migration or a redesign:
  - PredictionRecord: every EAL/VaR/likelihood score the platform emits
    should be logged here, WITH the finding/asset ID it was about, so it
    can be matched against a later outcome.
  - OutcomeRecord: when an actual incident occurs (or a near-miss /
    confirmed non-event over a review period), record what actually
    happened.
  - recalibrate(): the actual comparison + adjustment logic. Deliberately
    raises InsufficientDataError below MIN_SAMPLE_SIZE rather than
    producing a false sense of calibration.
  - record_prediction() / record_outcome() / current_status(): an
    in-memory store (same "real plumbing, honest about not being
    persisted yet" pattern as business_criticality.py's registry and
    ingestion.py's event buffers) so predictions actually accumulate
    somewhere instead of only existing as recalibrate()'s function
    parameters. `current_status()` is what routers/risk.py's
    `/calibration-status` endpoint now reports from — it will keep
    reporting `calibrated: false` truthfully until MIN_SAMPLE_SIZE real
    outcomes are recorded, because that's still actually true.

PRODUCTION-READINESS VERDICT FOR THIS FILE SPECIFICALLY: infrastructure is
implemented and tested (the plumbing works). The CAPABILITY it exists to
provide is not usable and should not be represented as usable until
MIN_SAMPLE_SIZE real (prediction, outcome) pairs have been collected in
production. Do not remove or lower MIN_SAMPLE_SIZE to make a demo look
more finished — that defeats the entire point of this module existing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

# Deliberately conservative. 30 is a common rule-of-thumb minimum for a
# distribution-shape estimate to mean anything at all; even at 30 the
# resulting calibration should be treated as a rough correction, not a
# precise one. This is a floor, not a target.
MIN_SAMPLE_SIZE = 30


class InsufficientDataError(RuntimeError):
    """Raised by recalibrate() when fewer than MIN_SAMPLE_SIZE outcome
    records are available. This is the expected, correct state for any
    newly-deployed instance of this platform — treat it as a status, not
    a bug."""


@dataclass
class PredictionRecord:
    prediction_id: str
    finding_or_asset_id: str
    predicted_eal_usd: float
    predicted_likelihood: float
    formula_version: str
    predicted_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class OutcomeRecord:
    prediction_id: str  # foreign key back to PredictionRecord
    outcome_type: Literal["incident_occurred", "confirmed_no_incident_in_window"]
    actual_cost_usd: float | None  # None if no incident occurred
    observed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class CalibrationReport:
    sample_size: int
    mean_absolute_error_usd: float
    predicted_mean_usd: float
    actual_mean_usd: float
    suggested_volatility_adjustment: float | None
    # Likelihood-calibration metrics (SIH follow-up critique #5's
    # "brier_score" / "calibration_error"). Computed across ALL matched
    # (prediction, outcome) pairs — incident AND confirmed-no-incident
    # alike — unlike mean_absolute_error_usd above, which only makes sense
    # for pairs where an incident actually occurred (there's no "actual
    # cost" to compare against for a non-event).
    brier_score: float | None = None
    calibration_error: float | None = None


def _brier_and_calibration_error(
    predictions: list[PredictionRecord], outcomes: list[OutcomeRecord]
) -> tuple[float | None, float | None, int]:
    """Brier score: mean squared error between predicted_likelihood (a
    0..1 probability) and the actual binary outcome (1.0 if an incident
    occurred, 0.0 if confirmed it didn't over the review window). Lower is
    better; 0 is perfect, 0.25 is what an uninformative constant 0.5
    prediction scores against a 50/50 base rate. This is the real,
    standard Brier score definition — not a stand-in metric with a
    similar-sounding name.

    calibration_error here is the mean ABSOLUTE (not squared) error on the
    same pairs — a more interpretable companion figure ("on average, our
    stated likelihood was off by this much"), not an established external
    standard on its own; documented here as this codebase's own definition
    so nobody mistakes it for a term-of-art metric.
    """
    outcomes_by_pred = {o.prediction_id: o for o in outcomes}
    pairs = [
        (p, outcomes_by_pred[p.prediction_id])
        for p in predictions
        if p.prediction_id in outcomes_by_pred
    ]
    if not pairs:
        return None, None, 0

    squared_errors = []
    abs_errors = []
    for p, o in pairs:
        actual = 1.0 if o.outcome_type == "incident_occurred" else 0.0
        diff = p.predicted_likelihood - actual
        squared_errors.append(diff * diff)
        abs_errors.append(abs(diff))

    return (
        sum(squared_errors) / len(squared_errors),
        sum(abs_errors) / len(abs_errors),
        len(pairs),
    )


def recalibrate(
    predictions: list[PredictionRecord],
    outcomes: list[OutcomeRecord],
) -> CalibrationReport:
    """Compare predicted vs actual and suggest a model adjustment.

    Raises InsufficientDataError below MIN_SAMPLE_SIZE. Callers (an
    /risk/calibration-status endpoint, a scheduled job) should surface
    that as an honest "not enough production data yet" status rather than
    swallowing it or falling back to a fabricated report.
    """
    outcomes_by_pred = {o.prediction_id: o for o in outcomes}
    matched = [
        (p, outcomes_by_pred[p.prediction_id])
        for p in predictions
        if p.prediction_id in outcomes_by_pred
        and outcomes_by_pred[p.prediction_id].outcome_type == "incident_occurred"
    ]

    brier, calib_err, all_pairs_count = _brier_and_calibration_error(predictions, outcomes)

    if len(matched) < MIN_SAMPLE_SIZE and all_pairs_count < MIN_SAMPLE_SIZE:
        raise InsufficientDataError(
            f"Only {len(matched)} matched (prediction, incident) pairs and "
            f"{all_pairs_count} total matched (prediction, outcome) pairs "
            f"available; need at least {MIN_SAMPLE_SIZE} of one before "
            f"recalibration is statistically meaningful. This is expected "
            f"for a newly-deployed instance — it is not an error to fix, "
            f"it's a status to wait out."
        )

    errors = [
        abs(p.predicted_eal_usd - (o.actual_cost_usd or 0.0))
        for p, o in matched
    ]
    predicted_mean = sum(p.predicted_eal_usd for p, _ in matched) / len(matched) if matched else 0.0
    actual_mean = sum((o.actual_cost_usd or 0.0) for _, o in matched) / len(matched) if matched else 0.0

    # Simple ratio-based volatility nudge: if actuals are running hotter
    # than predictions on average, suggest increasing the VaR volatility
    # shape parameter (see financial_model.compute_var) proportionally.
    # This is intentionally simple — a real calibration job would fit a
    # proper distribution to the residuals rather than a single ratio, but
    # that refinement is meaningless before there's enough data for even
    # this simple version to be worth running.
    suggested_adj = (actual_mean / predicted_mean) if predicted_mean else None

    return CalibrationReport(
        sample_size=len(matched),
        mean_absolute_error_usd=(sum(errors) / len(errors)) if errors else 0.0,
        predicted_mean_usd=predicted_mean,
        actual_mean_usd=actual_mean,
        suggested_volatility_adjustment=suggested_adj,
        brier_score=brier,
        calibration_error=calib_err,
    )


# ---------------------------------------------------------------------------
# Persisted store — Mongo-backed, organization-scoped (P0#1/#2). Previously
# an in-memory dict/list; every function below now takes `db` and
# `organization_id` explicitly.
#
# ENCRYPTION (P0#6): predicted_eal_usd, predicted_likelihood, and
# actual_cost_usd are the actual financial/risk figures here, so they're
# encrypted at rest. prediction_id / finding_or_asset_id / formula_version
# / outcome_type / timestamps stay plaintext — they're identifiers and
# classification metadata this module's own matching logic (and Mongo's
# own upsert-by-prediction_id) needs to query on, not sensitive figures
# themselves.
# ---------------------------------------------------------------------------

from app.core import encryption  # noqa: E402 — see business_criticality.py for this module's import-placement convention

PREDICTIONS_COLLECTION = "risk_predictions"
OUTCOMES_COLLECTION = "risk_outcomes"


def _prediction_to_document(organization_id: str, record: PredictionRecord) -> dict:
    return {
        "organizationId": organization_id,
        "predictionId": record.prediction_id,
        "findingOrAssetId": record.finding_or_asset_id,
        "predictedEalUsdEncrypted": encryption.encrypt_value(record.predicted_eal_usd),
        "predictedLikelihoodEncrypted": encryption.encrypt_value(record.predicted_likelihood),
        "formulaVersion": record.formula_version,
        "predictedAt": record.predicted_at,
    }


def _prediction_from_document(doc: dict) -> PredictionRecord:
    return PredictionRecord(
        prediction_id=doc["predictionId"],
        finding_or_asset_id=doc["findingOrAssetId"],
        predicted_eal_usd=encryption.decrypt_value(doc["predictedEalUsdEncrypted"]),
        predicted_likelihood=encryption.decrypt_value(doc["predictedLikelihoodEncrypted"]),
        formula_version=doc["formulaVersion"],
        predicted_at=doc["predictedAt"],
    )


def _outcome_to_document(organization_id: str, record: OutcomeRecord) -> dict:
    return {
        "organizationId": organization_id,
        "predictionId": record.prediction_id,
        "outcomeType": record.outcome_type,
        "actualCostUsdEncrypted": encryption.encrypt_value(record.actual_cost_usd) if record.actual_cost_usd is not None else None,
        "observedAt": record.observed_at,
    }


def _outcome_from_document(doc: dict) -> OutcomeRecord:
    return OutcomeRecord(
        prediction_id=doc["predictionId"],
        outcome_type=doc["outcomeType"],
        actual_cost_usd=encryption.decrypt_value(doc["actualCostUsdEncrypted"]) if doc.get("actualCostUsdEncrypted") else None,
        observed_at=doc["observedAt"],
    )


async def record_prediction(db, organization_id: str, record: PredictionRecord) -> None:
    """Stores (or overwrites, if this exact prediction_id was already
    recorded — e.g. the same finding re-scanned) the given prediction.
    Called automatically by pipeline_integration.compute_finding_risk() for
    every finding it prices — see that module for the prediction_id
    scheme."""
    await db[PREDICTIONS_COLLECTION].update_one(
        {"organizationId": organization_id, "predictionId": record.prediction_id},
        {"$set": _prediction_to_document(organization_id, record)},
        upsert=True,
    )


async def record_outcome(db, organization_id: str, record: OutcomeRecord) -> None:
    await db[OUTCOMES_COLLECTION].insert_one(_outcome_to_document(organization_id, record))


async def list_predictions(db, organization_id: str) -> list[PredictionRecord]:
    cursor = db[PREDICTIONS_COLLECTION].find({"organizationId": organization_id})
    return [_prediction_from_document(doc) async for doc in cursor]


async def list_outcomes(db, organization_id: str) -> list[OutcomeRecord]:
    cursor = db[OUTCOMES_COLLECTION].find({"organizationId": organization_id})
    return [_outcome_from_document(doc) async for doc in cursor]


async def clear_store(db, organization_id: str) -> None:
    """Test/demo-reset helper only."""
    await db[PREDICTIONS_COLLECTION].delete_many({"organizationId": organization_id})
    await db[OUTCOMES_COLLECTION].delete_many({"organizationId": organization_id})


def calibration_curve(
    predictions: list[PredictionRecord], outcomes: list[OutcomeRecord], n_buckets: int = 10
) -> list[dict]:
    """The reliability diagram: groups matched (prediction, outcome) pairs
    into `n_buckets` equal-width bins by predicted_likelihood, and reports
    each bin's actual incident rate alongside its mean predicted
    likelihood. For a well-calibrated predictor, actual rate ≈ mean
    predicted likelihood in every bucket with enough samples to be
    meaningful; systematic over- or under-confidence shows up as buckets
    where the actual rate consistently sits above or below the diagonal.

    Buckets with fewer than 5 samples are still returned (so the shape is
    visible) but flagged `low_sample_size: true` — a single-sample bucket
    reporting "0% actual rate" or "100% actual rate" is not a calibration
    signal, it's noise, and callers (a UI, a report) should visually
    de-emphasize those buckets rather than plot them with equal weight to
    a bucket backed by hundreds of pairs.

    Same population as recalibrate()'s Brier-score calculation — ALL
    matched pairs (incident and confirmed-non-incident alike), not just
    incidents, since this is what "were 0.3-likelihood predictions right
    about 30% of the time" actually means.
    """
    outcomes_by_pred = {o.prediction_id: o for o in outcomes}
    pairs = [
        (p, outcomes_by_pred[p.prediction_id])
        for p in predictions
        if p.prediction_id in outcomes_by_pred
    ]

    bucket_width = 1.0 / n_buckets
    buckets: list[dict] = []
    for i in range(n_buckets):
        low, high = i * bucket_width, (i + 1) * bucket_width
        in_bucket = [
            (p, o) for p, o in pairs
            if low <= p.predicted_likelihood < high or (i == n_buckets - 1 and p.predicted_likelihood == 1.0)
        ]
        if not in_bucket:
            buckets.append({
                "bucket_range": [round(low, 2), round(high, 2)],
                "count": 0, "mean_predicted_likelihood": None, "actual_incident_rate": None,
                "low_sample_size": True,
            })
            continue
        mean_predicted = sum(p.predicted_likelihood for p, _ in in_bucket) / len(in_bucket)
        actual_rate = sum(1 for _, o in in_bucket if o.outcome_type == "incident_occurred") / len(in_bucket)
        buckets.append({
            "bucket_range": [round(low, 2), round(high, 2)],
            "count": len(in_bucket),
            "mean_predicted_likelihood": round(mean_predicted, 4),
            "actual_incident_rate": round(actual_rate, 4),
            "low_sample_size": len(in_bucket) < 5,
        })
    return buckets


# Bounds on how far a calibration-derived volatility adjustment may move
# the illustrative default. Deliberately narrow: a handful of real
# outcomes producing a wild multiplier (e.g. one catastrophic early loss)
# should nudge the estimate, not let it swing to an implausible extreme —
# same "bounded, not free-form" discipline as ingestion.py's telemetry
# likelihood multiplier.
_VOLATILITY_ADJUSTMENT_BOUNDS = (0.5, 3.0)


async def get_calibrated_volatility(db, organization_id: str, default: float = 1.8) -> tuple[float, str]:
    """The concrete "re-estimate parameters" feedback loop P1 asks for:
    reads this organization's REAL calibration status and, once
    calibrated (MIN_SAMPLE_SIZE+ real outcomes exist), returns
    `default * suggested_volatility_adjustment` — clamped to
    _VOLATILITY_ADJUSTMENT_BOUNDS — instead of the permanently-fixed
    illustrative constant. Returns (volatility, basis) where `basis` is
    "illustrative_default" or "calibrated_from_n_outcomes" so a caller
    can label which one actually produced a given VaR figure, rather than
    silently blending them.

    Before this function existed, `recalibrate()` computed
    `suggested_volatility_adjustment` and NOTHING read it — the
    calibration pipeline had a feedback signal that fed back into
    nothing. This is the wiring that closes that loop.
    """
    status = await current_status(db, organization_id)
    if not status["calibrated"] or not status.get("suggested_volatility_adjustment"):
        return default, "illustrative_default"
    adjustment = status["suggested_volatility_adjustment"]
    low, high = _VOLATILITY_ADJUSTMENT_BOUNDS
    bounded_adjustment = max(low, min(adjustment, high))
    return default * bounded_adjustment, f"calibrated_from_{status['current_sample_size']}_outcomes"


async def current_status(db, organization_id: str) -> dict:
    """What routers/risk.py's /calibration-status endpoint reports.
    Truthfully returns calibrated=False with whatever the REAL current
    sample size is — 0 on a freshly-deployed instance, growing as
    compute_finding_risk() logs predictions and record_outcome() is called
    (e.g. from an incident-response workflow) — until MIN_SAMPLE_SIZE
    matched pairs actually exist.
    """
    predictions = await list_predictions(db, organization_id)
    outcomes = await list_outcomes(db, organization_id)
    try:
        report = recalibrate(predictions, outcomes)
    except InsufficientDataError:
        prediction_ids = {p.prediction_id for p in predictions}
        matched = sum(1 for o in outcomes if o.prediction_id in prediction_ids)
        return {
            "calibrated": False,
            "min_sample_size_required": MIN_SAMPLE_SIZE,
            "current_sample_size": matched,
            "predictions_logged": len(predictions),
            "message": (
                "Continuous risk calibration requires real (prediction, incident) "
                "pairs from production usage. This instance has "
                f"{matched} matched pair(s) so far, {len(predictions)} prediction(s) "
                "logged in total. All EAL/VaR/likelihood figures should be treated "
                "as illustrative priors, not calibrated forecasts, until this "
                "endpoint reports calibrated=true."
            ),
        }

    return {
        "calibrated": True,
        "min_sample_size_required": MIN_SAMPLE_SIZE,
        "current_sample_size": report.sample_size,
        "predictions_logged": len(predictions),
        "brier_score": report.brier_score,
        "calibration_error": report.calibration_error,
        "mean_absolute_error_usd": report.mean_absolute_error_usd,
        "suggested_volatility_adjustment": report.suggested_volatility_adjustment,
        "message": (
            f"Calibrated against {report.sample_size} real (prediction, outcome) "
            f"pair(s). Brier score {report.brier_score:.3f} "
            f"({'lower is better; 0 is perfect' if report.brier_score is not None else 'n/a'})."
        ),
    }
