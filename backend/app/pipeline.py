"""The daily insight pipeline (PRD §10 steps 1–15), plus idempotency and staleness (D8, D11, D18).

Steps 3–9 (validation, baselines, deviations, candidates, ranking, selection) are the pure functions in
observations / baselines / candidates / ranking. This module does the I/O around them.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.candidates import Goals, generate_candidates
from app.config import (
    BASELINE_WINDOW_DAYS,
    NOVELTY_LOOKBACK_DAYS,
    RULE_VERSION,
    TOOL_MAX_RANGE_DAYS,
    TREND_RECENT_DAYS,
    Settings,
)
from app.evidence import build_evidence, confidence_label
from app.explanations import ChatFactory, GeminiChat, InsightForLlm, explain_insights
from app.models import Evidence, Insight, InsightRun, Note, Reading, User
from app.observations import DailyObservation, build_observations
from app.ranking import InsightKey, rank_candidates

# The furthest back any calculation or tool looks from the target day, and the furthest forward (D16 uses t+1).
HISTORY_DAYS = max(BASELINE_WINDOW_DAYS + TREND_RECENT_DAYS - 1, TOOL_MAX_RANGE_DAYS - 1)
# A changed value on day d can affect runs for target days in [d - 1, d + this] (spike check, trend baseline)
STALE_AFTER_DAYS = BASELINE_WINDOW_DAYS + TREND_RECENT_DAYS - 1


def gemini_chat_factory(settings: Settings) -> ChatFactory | None:
    """None means fallback mode (no key configured)."""
    api_key = settings.gemini_api_key.get_secret_value().strip()
    if not api_key:
        return None
    return lambda: GeminiChat(api_key, settings.gemini_model)


def load_observations(session: Session, user_id: str, start: date, end: date) -> list[DailyObservation]:
    readings = session.scalars(
        select(Reading).where(Reading.user_id == user_id, Reading.date >= start, Reading.date <= end)
    ).all()
    return build_observations(user_id, readings, start, end)


def current_run(session: Session, user_id: str, target_date: date) -> InsightRun | None:
    return session.scalars(
        select(InsightRun)
        .where(
            InsightRun.user_id == user_id,
            InsightRun.target_date == target_date,
            InsightRun.rule_version == RULE_VERSION,
            InsightRun.is_stale.is_(False),
        )
        .order_by(InsightRun.generated_at.desc())
    ).first()


def has_stale_run(session: Session, user_id: str, target_date: date) -> bool:
    """True when this day had insights that were made outdated by a data change (D30)."""
    return session.scalars(
        select(InsightRun.run_id).where(
            InsightRun.user_id == user_id,
            InsightRun.target_date == target_date,
            InsightRun.rule_version == RULE_VERSION,
            InsightRun.is_stale.is_(True),
        )
    ).first() is not None


def previously_surfaced(session: Session, user_id: str, target_date: date) -> set[InsightKey]:
    """Insights selected in non-stale runs for the 3 days before the target date (D8)."""
    rows = session.execute(
        select(Insight.category, Insight.metrics, Insight.direction)
        .join(InsightRun, Insight.run_id == InsightRun.run_id)
        .where(
            InsightRun.user_id == user_id,
            InsightRun.is_stale.is_(False),
            InsightRun.target_date >= target_date - timedelta(days=NOVELTY_LOOKBACK_DAYS),
            InsightRun.target_date < target_date,
        )
    ).all()
    return {(category, tuple(metrics), direction) for category, metrics, direction in rows}


def mark_runs_stale(session: Session, user_id: str, start: date | None = None, end: date | None = None) -> int:
    """Marks the user's non-stale runs stale (all of them, or those with target_date in [start, end])."""
    query = update(InsightRun).where(InsightRun.user_id == user_id, InsightRun.is_stale.is_(False))
    if start is not None and end is not None:
        query = query.where(InsightRun.target_date >= start, InsightRun.target_date <= end)
    return session.execute(query.values(is_stale=True)).rowcount or 0


def generate_run(
    session: Session, user: User, target_date: date, chat_factory: ChatFactory | None, force: bool = False
) -> InsightRun:
    """Returns the existing non-stale run unless `force`; otherwise runs the full pipeline and persists it."""
    # 1. user and target date (resolved by the caller); idempotency (D11)
    existing = current_run(session, user.user_id, target_date)
    if existing and not force:
        return existing
    if existing:
        existing.is_stale = True

    # 2–6. history -> validated observations -> baselines and deviations (inside generate_candidates)
    history_start, history_end = target_date - timedelta(days=HISTORY_DAYS), target_date + timedelta(days=1)
    # Newest reading seen at the start: if data is saved while Gemini is still explaining, the run is outdated.
    watermark = session.scalar(select(func.max(Reading.id)).where(Reading.user_id == user.user_id)) or 0
    observations = load_observations(session, user.user_id, history_start, history_end)
    # 7. candidates
    candidates = generate_candidates(
        observations, target_date, Goals(user.activity_goal_steps, user.sleep_target_hours)
    )
    # 8–9. rank, remove redundancy, select up to three
    ranked = rank_candidates(candidates, previously_surfaced(session, user.user_id, target_date))

    # 10. evidence for the selected candidates
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    selected = []
    for item in ranked:
        if item.status == "selected":
            insight_id = f"ins_{uuid.uuid4().hex[:12]}"
            records = build_evidence(item.candidate, user.user_id, observations, insight_id)
            selected.append((item, InsightForLlm(insight_id, item.candidate, records)))

    # 11–13. explanations (Gemini with tools, validation, fallback)
    notes = session.scalars(
        select(Note.text).where(Note.user_id == user.user_id, Note.date == target_date).order_by(Note.id)
    ).all()
    tool_observations = [o for o in observations if o.date <= target_date]
    result = explain_insights(
        [llm for _, llm in selected], tool_observations, target_date, "\n".join(notes) or None, chat_factory
    )

    # 14. persist the run, the insights, their evidence and the provenance
    changed_meanwhile = session.scalar(
        select(func.count(Reading.id)).where(
            Reading.user_id == user.user_id,
            Reading.id > watermark,
            Reading.date >= history_start,
            Reading.date <= history_end,
        )
    )
    insight_ids = {id(item): llm.insight_id for item, llm in selected}
    run = InsightRun(
        run_id=run_id,
        user_id=user.user_id,
        target_date=target_date,
        rule_version=RULE_VERSION,
        provider=result.provider,
        fallback_reason=result.fallback_reason,
        is_stale=bool(changed_meanwhile),  # built from data that changed before it was saved (D30)
        tool_calls=result.tool_calls,
        candidates=[
            {
                "candidate_id": item.candidate.candidate_id,
                "category": item.candidate.category,
                "metrics": item.candidate.metrics,
                "direction": item.candidate.direction,
                "rule_id": item.candidate.rule_id,
                "score": item.score,
                "score_components": item.components,
                "qualifiers": item.candidate.qualifiers,
                "status": "dropped_by_llm" if insight_ids.get(id(item)) in result.dropped else item.status,
                "rank": item.rank,
                "insight_id": insight_ids.get(id(item)),
                "drop_reason": result.dropped.get(insight_ids.get(id(item))),
            }
            for item in ranked
        ],
    )
    session.add(run)
    session.flush()
    for item, llm in selected:
        if llm.insight_id in result.dropped:
            continue
        session.add(Insight(
            insight_id=llm.insight_id,
            run_id=run_id,
            rank=item.rank,
            category=item.candidate.category,
            metrics=item.candidate.metrics,
            direction=item.candidate.direction,
            rule_id=item.candidate.rule_id,
            score=item.score,
            score_components=item.components,
            confidence_label=confidence_label(item.candidate),
            explanation=result.explanations[llm.insight_id],
            explanation_provider=result.providers[llm.insight_id],
        ))
        session.flush()
        for record in llm.records:
            data = vars(record).copy()
            data["supporting_observation_dates"] = [d.isoformat() for d in record.supporting_observation_dates]
            session.add(Evidence(insight_id=llm.insight_id, **data))
    session.commit()
    # 15. the caller turns the run into the API response
    return run
