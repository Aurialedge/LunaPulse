"""Data endpoints: health, users, observations, simulation, notes."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import (
    DEFAULT_DAYS,
    DEFAULT_OBSERVATION_RANGE_DAYS,
    DEFAULT_SEED,
    MAX_OBSERVATION_RANGE_DAYS,
    RULE_VERSION,
)
from app.db import get_db
from app.models import Note, Reading, User
from app.observations import build_observations
from app.schemas import (
    GenerateOut,
    GenerateRequest,
    HealthOut,
    NoteIn,
    NoteOut,
    ObservationOut,
    ObservationsOut,
    ScenarioOut,
    UserOut,
)
from app.simulation import PROFILES, SCENARIOS, local_today, simulate_user

router = APIRouter(prefix="/api/v1")


# --- shared helpers (also used by startup seeding) ---


def regenerate_user(
    session: Session, user_id: str, scenario: str, seed: int, days: int, end_date: date
) -> GenerateOut:
    """Replaces all of the user's readings and notes with a fresh simulation (D1).

    Corrections and user-added notes are part of the replaced data, so they are removed too.
    """
    profile = PROFILES[user_id]
    data = simulate_user(profile, scenario, seed, days, end_date)

    session.execute(delete(Reading).where(Reading.user_id == user_id))
    session.execute(delete(Note).where(Note.user_id == user_id))
    user = session.get(User, user_id) or User(user_id=user_id)
    user.display_name = profile.display_name
    user.profile_description = profile.description
    user.activity_goal_steps = profile.activity_goal_steps
    user.sleep_target_hours = profile.sleep_target_hours
    user.timezone = profile.timezone
    user.seed = seed
    user.scenario = scenario
    user.data_start = data.start_date
    user.data_end = data.end_date
    session.add(user)
    session.add_all(
        Reading(
            user_id=user_id,
            date=r.date,
            metric=r.metric,
            value=r.value,
            unit=r.unit,
            is_available=r.is_available,
            quality_marker=r.quality_marker,
            source=r.source,
        )
        for r in data.readings
    )
    session.add_all(Note(user_id=user_id, date=n.date, text=n.text) for n in data.notes)
    session.commit()

    return GenerateOut(
        user_id=user_id,
        scenario=scenario,
        seed=seed,
        days=days,
        start_date=data.start_date,
        end_date=data.end_date,
        reading_count=len(data.readings),
        note_count=len(data.notes),
    )


def seed_missing_users(session: Session) -> None:
    """Creates users A–D with their default scenario if they are not in the database yet."""
    for profile in PROFILES.values():
        if session.get(User, profile.user_id) is None:
            regenerate_user(
                session, profile.user_id, profile.default_scenario, DEFAULT_SEED, DEFAULT_DAYS,
                local_today(profile.timezone),
            )


def get_user_or_404(session: Session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise ApiError(404, "user_not_found", f"Unknown user_id '{user_id}'.")
    return user


def user_out(user: User) -> UserOut:
    return UserOut(
        user_id=user.user_id,
        display_name=user.display_name,
        profile_description=user.profile_description,
        activity_goal_steps=user.activity_goal_steps,
        sleep_target_hours=user.sleep_target_hours,
        timezone=user.timezone,
        today=local_today(user.timezone),
        scenario=user.scenario,
        seed=user.seed,
        data_start=user.data_start,
        data_end=user.data_end,
    )


# --- endpoints ---


@router.get("/health", response_model=HealthOut)
def health(request: Request, session: Session = Depends(get_db)) -> HealthOut:
    try:
        session.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return HealthOut(
        status="ok" if db_status == "ok" else "degraded",
        db=db_status,
        llm_mode=request.app.state.settings.llm_mode,
        rule_version=RULE_VERSION,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(session: Session = Depends(get_db)) -> list[UserOut]:
    users = session.scalars(select(User).order_by(User.user_id)).all()
    return [user_out(u) for u in users]


@router.get("/users/{user_id}/observations", response_model=ObservationsOut)
def get_observations(
    user_id: str,
    start: date | None = Query(default=None, description="First date (YYYY-MM-DD), inclusive"),
    end: date | None = Query(default=None, description="Last date (YYYY-MM-DD), inclusive"),
    session: Session = Depends(get_db),
) -> ObservationsOut:
    user = get_user_or_404(session, user_id)
    end = end or user.data_end
    start = start or end - timedelta(days=DEFAULT_OBSERVATION_RANGE_DAYS - 1)
    if start > end:
        raise ApiError(422, "invalid_date_range", "start must be on or before end.")
    if (end - start).days + 1 > MAX_OBSERVATION_RANGE_DAYS:
        raise ApiError(422, "invalid_date_range", f"At most {MAX_OBSERVATION_RANGE_DAYS} days per request.")

    readings = session.scalars(
        select(Reading).where(Reading.user_id == user_id, Reading.date >= start, Reading.date <= end)
    ).all()
    observations = build_observations(user_id, readings, start, end)
    return ObservationsOut(
        user_id=user_id,
        start=start,
        end=end,
        observations=[ObservationOut(**vars(o)) for o in observations],
    )


@router.get("/simulation/scenarios", response_model=list[ScenarioOut])
def list_scenarios() -> list[ScenarioOut]:
    return [
        ScenarioOut(
            name=s.name,
            description=s.description,
            affected_metrics=list(s.affected_metrics),
            days_affected=s.days_affected,
        )
        for s in SCENARIOS.values()
    ]


@router.post("/simulation/generate", response_model=GenerateOut)
def generate_simulation(body: GenerateRequest, session: Session = Depends(get_db)) -> GenerateOut:
    user = get_user_or_404(session, body.user_id)
    end_date = body.end_date or local_today(user.timezone)
    seed = DEFAULT_SEED if body.seed is None else body.seed
    return regenerate_user(session, body.user_id, body.scenario, seed, body.days, end_date)


@router.get("/users/{user_id}/notes", response_model=list[NoteOut])
def list_notes(
    user_id: str,
    on_date: date | None = Query(default=None, alias="date"),
    session: Session = Depends(get_db),
) -> list[NoteOut]:
    get_user_or_404(session, user_id)
    query = select(Note).where(Note.user_id == user_id)
    if on_date is not None:
        query = query.where(Note.date == on_date)
    notes = session.scalars(query.order_by(Note.date, Note.id)).all()
    return [NoteOut.model_validate(n, from_attributes=True) for n in notes]


@router.post("/users/{user_id}/notes", response_model=NoteOut, status_code=201)
def add_note(user_id: str, body: NoteIn, session: Session = Depends(get_db)) -> NoteOut:
    user = get_user_or_404(session, user_id)
    if body.date > local_today(user.timezone):
        raise ApiError(422, "date_in_future", "Notes cannot be added for a future date.")
    note = Note(user_id=user_id, date=body.date, text=body.text)
    session.add(note)
    session.commit()
    return NoteOut.model_validate(note, from_attributes=True)
