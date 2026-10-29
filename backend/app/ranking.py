"""Deterministic scoring, tie-breaking, redundancy suppression and top-N selection (PRD §7, D7, D8).

score = Σ weight · component, each component in [0, 1]:
  magnitude   min(|change| / threshold, 3) / 3          (combined: mean over its metrics)
  persistence consecutive days beyond the threshold, capped at 7, ÷ 7
  reliability baseline coverage, × 0.5 if not reliably standardized, a suspicious spike, or the target is flagged
  relevance   1.0 if the target day itself crosses the threshold, else 0.5
  novelty     0.3 if an equivalent insight was surfaced in the previous 3 days, else 1.0
data_quality candidates have a fixed score.
Ties: score ↓, category priority, metric order, rule_id ↑.
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass

from app.candidates import Candidate
from app.config import (
    CATEGORY_PRIORITY,
    DATA_QUALITY_SCORE,
    MAGNITUDE_CAP,
    MAX_INSIGHTS,
    MAX_PERSISTENCE_DAYS,
    NOVELTY_REPEAT,
    RANKING_WEIGHTS,
    RELEVANCE_NOT_ON_TARGET,
    UNRELIABLE_FACTOR,
)
from app.metrics import METRIC_ORDER

# (category, metrics, direction): what makes two insights "the same" for novelty (D8)
InsightKey = tuple[str, tuple[str, ...], str]


@dataclass
class RankedCandidate:
    candidate: Candidate
    score: float
    components: dict[str, float]
    status: str = "candidate"  # selected | suppressed_redundant | below_limit
    rank: int | None = None  # 1-based, selected only


def insight_key(candidate: Candidate) -> InsightKey:
    return candidate.category, tuple(candidate.metrics), candidate.direction


def has_flagged_target(candidate: Candidate) -> bool:
    """A target-day value is missing, invalid, conflicting or low quality (a user correction is not a problem)."""
    return any(
        not f.startswith("corrected:") for m in candidate.metrics for f in candidate.comparisons[m].target_flags
    )


def is_unreliable(candidate: Candidate) -> bool:
    return (
        "not_reliably_standardized" in candidate.qualifiers
        or "suspicious_spike" in candidate.qualifiers
        or has_flagged_target(candidate)
    )


def score_components(candidate: Candidate, previously_surfaced: Collection[InsightKey] = ()) -> dict[str, float]:
    ratios = list(candidate.magnitude_ratios.values())
    magnitude = sum(min(r, MAGNITUDE_CAP) / MAGNITUDE_CAP for r in ratios) / len(ratios)
    reliability = candidate.coverage * (UNRELIABLE_FACTOR if is_unreliable(candidate) else 1.0)
    return {
        "magnitude": round(magnitude, 4),
        "persistence": round(min(candidate.persistence_days, MAX_PERSISTENCE_DAYS) / MAX_PERSISTENCE_DAYS, 4),
        "reliability": round(reliability, 4),
        "relevance": 1.0 if candidate.on_target_day else RELEVANCE_NOT_ON_TARGET,
        "novelty": NOVELTY_REPEAT if insight_key(candidate) in previously_surfaced else 1.0,
    }


def score_candidate(
    candidate: Candidate, previously_surfaced: Collection[InsightKey] = ()
) -> tuple[float, dict[str, float]]:
    if candidate.category == "data_quality":
        return DATA_QUALITY_SCORE, {}
    components = score_components(candidate, previously_surfaced)
    score = sum(RANKING_WEIGHTS[name] * value for name, value in components.items())
    return round(score, 4), components


def _sort_key(ranked: RankedCandidate) -> tuple:
    c = ranked.candidate
    return (-ranked.score, CATEGORY_PRIORITY.index(c.category), METRIC_ORDER.index(c.metrics[0]), c.rule_id)


def rank_candidates(
    candidates: Sequence[Candidate],
    previously_surfaced: Collection[InsightKey] = (),
    max_insights: int = MAX_INSIGHTS,
) -> list[RankedCandidate]:
    """Every candidate, sorted, each with a status. At most `max_insights` are selected; zero is valid.

    A candidate is suppressed as redundant if any of its metrics is already covered by a selected insight (D7).
    """
    ranked = sorted(
        (RankedCandidate(c, *score_candidate(c, previously_surfaced)) for c in candidates), key=_sort_key
    )
    covered: set[str] = set()
    selected = 0
    for item in ranked:
        if covered.intersection(item.candidate.metrics):
            item.status = "suppressed_redundant"
        elif selected >= max_insights:
            item.status = "below_limit"
        else:
            selected += 1
            item.status, item.rank = "selected", selected
            covered.update(item.candidate.metrics)
    return ranked
