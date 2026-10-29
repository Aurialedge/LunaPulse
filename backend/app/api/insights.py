"""Analytics endpoints: baselines, insight generation and feed, insight detail, evidence, feedback, corrections."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.data import get_user_or_404
from app.api.errors import ApiError
from app.baselines import compare_to_baseline
from app.db import get_db
from app.config import GOAL_PROGRESS_CAP
from app.metrics import METRIC_ORDER, METRICS
from app.models import Evidence, Feedback, Insight, InsightRun, Reading, User
from app.observations import ReadingData, is_valid_reading
from app.pipeline import (
    HISTORY_DAYS,
    STALE_AFTER_DAYS,
    current_run,
    generate_run,
    has_stale_run,
    load_observations,
    mark_runs_stale,
)
from app.schemas import (
    BaselinesOut,
    BatchCorrectionIn,
    BatchCorrectionOut,
    CandidateOut,
    CorrectionIn,
    CorrectionOut,
    EvidenceOut,
    FeedbackIn,
    FeedbackOut,
    FeedOut,
    GenerateInsightsRequest,
    InsightOut,
    MetricBaselineOut,
)
from app.simulation import local_today

router = APIRouter(prefix="/api/v1")


# --- helpers ---


def resolve_date(user: User, requested: date | None) -> date:
    """Default: the latest day with data, never after the user's local today (D19). Must lie in the data range."""
    target = requested or min(user.data_end, local_today(user.timezone))
    if not user.data_start <= target <= user.data_end:
        raise ApiError(
            422, "date_out_of_range", f"date must be between {user.data_start} and {user.data_end} for this user."
        )
    return target


def goal_progress(metric: str, value: float | None, user: User) -> tuple[float | None, float | None]:
    """(goal, progress %) for the UI's goal rings. Only steps and sleep have a goal."""
    goal = {"steps": user.activity_goal_steps, "sleep_hours": user.sleep_target_hours}.get(metric)
    if goal is None or value is None or goal <= 0:
        return goal, None
    return goal, min(GOAL_PROGRESS_CAP, round(100 * value / goal, 1))


def latest_feedback(session: Session, insight_ids: list[str]) -> dict[str, str]:
    rows = session.scalars(
        select(Feedback).where(Feedback.insight_id.in_(insight_ids)).order_by(Feedback.created_at, Feedback.id)
    ).all()
    return {row.insight_id: row.action for row in rows}


def insight_out(insight: Insight, run: InsightRun, evidence_ids: list[str], feedback: str | None) -> InsightOut:
    return InsightOut(
        insight_id=insight.insight_id,
        run_id=run.run_id,
        user_id=run.user_id,
        target_date=run.target_date,
        rank=insight.rank,
        category=insight.category,
        metrics=insight.metrics,
        direction=insight.direction,
        rule_id=insight.rule_id,
        score=insight.score,
        score_components=insight.score_components,
        confidence_label=insight.confidence_label,
        explanation=insight.explanation,
        explanation_provider=insight.explanation_provider,
        evidence_ids=evidence_ids,
        feedback=feedback,
        is_stale=run.is_stale,
    )


def feed_out(session: Session, run: InsightRun, include_hidden: bool = False) -> FeedOut:
    insights = session.scalars(select(Insight).where(Insight.run_id == run.run_id).order_by(Insight.rank)).all()
    ids = [i.insight_id for i in insights]
    feedback = latest_feedback(session, ids)
    evidence_ids: dict[str, list[str]] = {i: [] for i in ids}
    for evidence_id, insight_id in session.execute(
        select(Evidence.evidence_id, Evidence.insight_id).where(Evidence.insight_id.in_(ids)).order_by(Evidence.evidence_id)
    ):
        evidence_ids[insight_id].append(evidence_id)

    visible = [i for i in insights if include_hidden or i.insight_id not in feedback]
    return FeedOut(
        run_id=run.run_id,
        user_id=run.user_id,
        target_date=run.target_date,
        rule_version=run.rule_version,
        generated_at=run.generated_at,
        provider=run.provider,
        fallback_reason=run.fallback_reason,
        insights=[insight_out(i, run, evidence_ids[i.insight_id], feedback.get(i.insight_id)) for i in visible],
        hidden_count=len(insights) - len([i for i in insights if i.insight_id not in feedback]),
        candidates=[CandidateOut(**{k: c.get(k) for k in CandidateOut.model_fields}) for c in run.candidates],
    )


def get_insight_or_404(session: Session, insight_id: str) -> tuple[Insight, InsightRun]:
    insight = session.get(Insight, insight_id)
    if insight is None:
        raise ApiError(404, "insight_not_found", f"Unknown insight_id '{insight_id}'.")
    return insight, session.get(InsightRun, insight.run_id)


# --- endpoints ---


@router.get("/users/{user_id}/baselines", response_model=BaselinesOut)
def get_baselines(
    user_id: str, on_date: date | None = Query(default=None, alias="date"), session: Session = Depends(get_db)
) -> BaselinesOut:
    user = get_user_or_404(session, user_id)
    target = resolve_date(user, on_date)
    observations = load_observations(session, user_id, target - timedelta(days=HISTORY_DAYS), target)
    metrics = []
    for metric in METRIC_ORDER:
        c = compare_to_baseline(observations, metric, target)
        b = c.baseline
        goal, progress = goal_progress(metric, c.observed_value, user)
        metrics.append(MetricBaselineOut(
            metric=metric, label=METRICS[metric].label, unit=c.unit, observed_value=c.observed_value,
            target_flags=c.target_flags, status=b.status, valid_observation_count=b.valid_count,
            window_days=b.window_days, window_start=b.window_start, window_end=b.window_end, mean=b.mean,
            median=b.median, std=b.std, mad=b.mad, latest_value=b.latest_value, latest_date=b.latest_date,
            absolute_difference=c.absolute_difference, percentage_difference=c.percentage_difference,
            standardized_score=c.standardized_score, score_method=c.score_method, direction=c.direction,
            interpretation=c.interpretation, day_over_day=c.day_over_day, week_over_week=c.week_over_week,
            goal_value=goal, goal_progress_percent=progress,
        ))
    return BaselinesOut(user_id=user_id, date=target, metrics=metrics)


@router.post("/users/{user_id}/insights/generate", response_model=FeedOut)
def generate_insights(
    user_id: str, body: GenerateInsightsRequest, request: Request, session: Session = Depends(get_db)
) -> FeedOut:
    user = get_user_or_404(session, user_id)
    target = resolve_date(user, body.date)
    run = generate_run(session, user, target, request.app.state.chat_factory, force=body.force)
    return feed_out(session, run)


@router.get("/users/{user_id}/insights", response_model=FeedOut)
def get_feed(
    user_id: str,
    on_date: date | None = Query(default=None, alias="date"),
    include_hidden: bool = False,
    session: Session = Depends(get_db),
) -> FeedOut:
    user = get_user_or_404(session, user_id)
    target = resolve_date(user, on_date)
    run = current_run(session, user_id, target)
    if run is None and has_stale_run(session, user_id, target):
        raise ApiError(
            404, "insights_outdated", f"The data for {target} changed since its insights were made. Recalculate them."
        )
    if run is None:
        raise ApiError(404, "insights_not_generated", f"No current insights for {target}. Generate them first.")
    return feed_out(session, run, include_hidden)


@router.get("/insights/{insight_id}", response_model=InsightOut)
def get_insight(insight_id: str, session: Session = Depends(get_db)) -> InsightOut:
    insight, run = get_insight_or_404(session, insight_id)
    evidence_ids = session.scalars(
        select(Evidence.evidence_id).where(Evidence.insight_id == insight_id).order_by(Evidence.evidence_id)
    ).all()
    return insight_out(insight, run, list(evidence_ids), latest_feedback(session, [insight_id]).get(insight_id))


@router.get("/insights/{insight_id}/evidence", response_model=list[EvidenceOut])
def get_evidence(insight_id: str, session: Session = Depends(get_db)) -> list[EvidenceOut]:
    get_insight_or_404(session, insight_id)
    rows = session.scalars(
        select(Evidence).where(Evidence.insight_id == insight_id).order_by(Evidence.evidence_id)
    ).all()
    return [EvidenceOut.model_validate(row, from_attributes=True) for row in rows]


@router.post("/insights/{insight_id}/feedback", response_model=FeedbackOut, status_code=201)
def add_feedback(insight_id: str, body: FeedbackIn, session: Session = Depends(get_db)) -> FeedbackOut:
    get_insight_or_404(session, insight_id)
    feedback = Feedback(insight_id=insight_id, action=body.action)
    session.add(feedback)
    session.commit()
    return FeedbackOut.model_validate(feedback, from_attributes=True)


@router.post("/users/{user_id}/corrections", response_model=CorrectionOut)
def add_correction(
    user_id: str, body: CorrectionIn, request: Request, session: Session = Depends(get_db)
) -> CorrectionOut:
    """Stores a user correction, marks every affected run stale and regenerates the corrected day (D18)."""
    user = get_user_or_404(session, user_id)
    target = resolve_date(user, body.date)
    metric = METRICS[body.metric]
    value = float(round(body.value)) if body.metric == "steps" else body.value
    if not is_valid_reading(ReadingData(target, body.metric, value, metric.unit)):
        raise ApiError(
            422, "invalid_value", f"{metric.label} must be between {metric.min_value:g} and {metric.max_value:g} {metric.unit}."
        )

    session.add(Reading(
        user_id=user_id, date=target, metric=body.metric, value=value, unit=metric.unit,
        is_available=True, source="user_correction",
    ))
    stale = mark_runs_stale(
        session, user_id, target - timedelta(days=1), target + timedelta(days=STALE_AFTER_DAYS)
    )
    session.commit()
    run = generate_run(session, user, target, request.app.state.chat_factory)
    return CorrectionOut(
        user_id=user_id, date=target, metric=body.metric, value=value, unit=metric.unit,
        stale_run_count=stale, feed=feed_out(session, run),
    )


@router.post("/users/{user_id}/corrections/batch", response_model=BatchCorrectionOut)
def add_corrections_batch(user_id: str, body: BatchCorrectionIn, session: Session = Depends(get_db)) -> BatchCorrectionOut:
    """Data editor (D29): stores every edit or none, marks affected runs outdated, and does NOT recalculate."""
    user = get_user_or_404(session, user_id)
    seen: set[tuple[date, str]] = set()
    readings = []
    for item in body.corrections:
        where = f"{item.date} {item.metric}"
        if (item.date, item.metric) in seen:
            raise ApiError(422, "invalid_value", f"{where}: the same value is edited twice in one batch.")
        seen.add((item.date, item.metric))
        if not user.data_start <= item.date <= user.data_end:
            raise ApiError(422, "invalid_value", f"{where}: date must be between {user.data_start} and {user.data_end}.")
        metric = METRICS[item.metric]
        value = float(round(item.value)) if item.metric == "steps" else item.value
        if not is_valid_reading(ReadingData(item.date, item.metric, value, metric.unit)):
            raise ApiError(
                422, "invalid_value",
                f"{where}: {metric.label} must be between {metric.min_value:g} and {metric.max_value:g} {metric.unit}.",
            )
        readings.append(Reading(
            user_id=user_id, date=item.date, metric=item.metric, value=value, unit=metric.unit,
            is_available=True, source="user_correction",
        ))

    session.add_all(readings)
    dates = sorted({d for d, _ in seen})
    stale = mark_runs_stale(session, user_id, dates[0] - timedelta(days=1), dates[-1] + timedelta(days=STALE_AFTER_DAYS))
    session.commit()
    return BatchCorrectionOut(user_id=user_id, saved=len(readings), stale_run_count=stale, dates=dates)

