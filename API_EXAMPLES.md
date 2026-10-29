# API examples

Real requests and responses from the LunaPulse API (`/api/v1`), captured in fallback mode (no Gemini key) with seed 42 and `end_date` 2026-06-30, so they're reproducible. Ids and timestamps differ per run. Long lists are trimmed where noted. Interactive docs are at `http://localhost:8000/docs` while the backend runs.

All data is synthetic.

### Health
```http
GET /api/v1/health
```
`200`
```json
{
  "status": "ok",
  "db": "ok",
  "llm_mode": "fallback",
  "rule_version": "v1"
}
```

### Regenerate a user's data with a scenario
```http
POST /api/v1/simulation/generate

{"user_id": "user_b", "scenario": "reduced_sleep", "seed": 42, "days": 120, "end_date": "2026-06-30"}
```
`200`
```json
{
  "user_id": "user_b",
  "scenario": "reduced_sleep",
  "seed": 42,
  "days": 120,
  "start_date": "2026-03-03",
  "end_date": "2026-06-30",
  "reading_count": 480,
  "note_count": 0
}
```

### Users (first shown)
```http
GET /api/v1/users
```
`200`
```json
[
  {
    "user_id": "user_b",
    "display_name": "User B",
    "profile_description": "Irregular sleep and activity.",
    "activity_goal_steps": 9000,
    "sleep_target_hours": 8.0,
    "timezone": "Europe/London",
    "today": "2026-10-29",
    "scenario": "reduced_sleep",
    "seed": 42,
    "data_start": "2026-03-03",
    "data_end": "2026-06-30"
  }
]
```

### Observations
```http
GET /api/v1/users/user_b/observations?start=2026-06-29&end=2026-06-30
```
`200`
```json
{
  "user_id": "user_b",
  "start": "2026-06-29",
  "end": "2026-06-30",
  "observations": [
    {
      "user_id": "user_b",
      "date": "2026-06-29",
      "steps": 7010,
      "sleep_hours": 4.31,
      "resting_heart_rate_bpm": 64.0,
      "hrv_ms": 30.3,
      "data_quality_flags": []
    },
    {
      "user_id": "user_b",
      "date": "2026-06-30",
      "steps": 8579,
      "sleep_hours": 5.17,
      "resting_heart_rate_bpm": 63.0,
      "hrv_ms": 42.2,
      "data_quality_flags": []
    }
  ]
}
```

### Baselines (sleep shown)
```http
GET /api/v1/users/user_b/baselines?date=2026-06-30
```
`200`
```json
{
  "user_id": "user_b",
  "date": "2026-06-30",
  "metrics": [
    {
      "metric": "sleep_hours",
      "label": "Sleep",
      "unit": "hours",
      "observed_value": 5.17,
      "target_flags": [],
      "status": "ok",
      "valid_observation_count": 27,
      "window_days": 28,
      "window_start": "2026-06-02",
      "window_end": "2026-06-29",
      "mean": 6.32,
      "median": 6.59,
      "std": 1.05,
      "mad": 0.51,
      "latest_value": 4.31,
      "latest_date": "2026-06-29",
      "absolute_difference": -1.42,
      "percentage_difference": -21.5,
      "standardized_score": -1.88,
      "score_method": "robust_z",
      "direction": "below",
      "interpretation": "shorter sleep duration",
      "day_over_day": 0.86,
      "week_over_week": -1.25
    }
  ]
}
```

### Generate insights (fallback mode; first insight shown)
```http
POST /api/v1/users/user_b/insights/generate

{"date": "2026-06-30"}
```
`200`
```json
{
  "run_id": "run_625ea88c9a71",
  "user_id": "user_b",
  "target_date": "2026-06-30",
  "rule_version": "v1",
  "generated_at": "2026-10-29T13:19:07.893872Z",
  "provider": "fallback",
  "fallback_reason": "no_api_key",
  "insights": [
    {
      "insight_id": "ins_1ff68bd1da6b",
      "run_id": "run_625ea88c9a71",
      "user_id": "user_b",
      "target_date": "2026-06-30",
      "rank": 1,
      "category": "deviation",
      "metrics": [
        "sleep_hours"
      ],
      "direction": "below",
      "rule_id": "deviation.sleep_hours.v1",
      "score": 0.6697,
      "score_components": {
        "magnitude": 0.4733,
        "persistence": 0.4286,
        "reliability": 0.9643,
        "relevance": 1.0,
        "novelty": 1.0
      },
      "confidence_label": "high",
      "explanation": {
        "insight_id": "ins_1ff68bd1da6b",
        "title": "Sleep: shorter sleep duration",
        "summary": "Sleep was 5.17 hours on 2026-06-30, compared with your usual 6.59 hours (median of 27 days, 2026-06-02 to 2026-06-29).",
        "what_changed": "That is 1.42 hours below the personal baseline (21.5%).",
        "why_it_matters": "Selected because the change crossed the rule threshold (|change| >= 1 hour from the baseline median) and has lasted 3 day(s).",
        "evidence_ids": [
          "ins_1ff68bd1da6b-ev1"
        ],
        "possible_context": "Day-to-day changes like this can reflect many everyday factors. This is an observation from your own data, not a diagnosis or medical advice.",
        "limitations": [
          "Sleep: 27 of 28 baseline days had valid data."
        ],
        "suggested_reflection": "Does anything about this day stand out to you?"
      },
      "explanation_provider": "fallback",
      "evidence_ids": [
        "ins_1ff68bd1da6b-ev1"
      ],
      "feedback": null,
      "is_stale": false
    }
  ],
  "hidden_count": 0,
  "candidates": [
    {
      "candidate_id": "deviation:sleep_hours",
      "category": "deviation",
      "metrics": [
        "sleep_hours"
      ],
      "direction": "below",
      "rule_id": "deviation.sleep_hours.v1",
      "score": 0.6697,
      "status": "selected",
      "rank": 1,
      "insight_id": "ins_1ff68bd1da6b",
      "drop_reason": null
    },
    {
      "candidate_id": "trend:hrv_ms",
      "category": "trend",
      "metrics": [
        "hrv_ms"
      ],
      "direction": "below",
      "rule_id": "trend.hrv_ms.v1",
      "score": 0.5931,
      "status": "selected",
      "rank": 2,
      "insight_id": "ins_0ce8e233e5a8",
      "drop_reason": null
    }
  ]
}
```

### Evidence for an insight
```http
GET /api/v1/insights/ins_1ff68bd1da6b/evidence
```
`200`
```json
[
  {
    "evidence_id": "ins_1ff68bd1da6b-ev1",
    "insight_id": "ins_1ff68bd1da6b",
    "user_id": "user_b",
    "metric": "sleep_hours",
    "target_date": "2026-06-30",
    "comparison": "target_day_vs_baseline",
    "observed_value": 5.17,
    "observed_unit": "hours",
    "baseline_value": 6.59,
    "baseline_method": "median of valid days 2026-06-02 to 2026-06-29 (target day excluded)",
    "baseline_window_start": "2026-06-02",
    "baseline_window_end": "2026-06-29",
    "valid_observation_count": 27,
    "absolute_difference": -1.42,
    "percentage_difference": -21.5,
    "standardized_score": -1.88,
    "score_method": "robust_z",
    "direction": "below",
    "rule_id": "deviation.sleep_hours.v1",
    "rule_threshold": "|change| >= 1 hour from the baseline median",
    "supporting_observation_dates": [
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-06-29",
      "2026-06-30"
    ],
    "supporting_observation_values": [
      6.99,
      6.63,
      4.12,
      6.41,
      4.75,
      4.31,
      5.17
    ],
    "data_quality_flags": []
  }
]
```

### Feedback
```http
POST /api/v1/insights/ins_1ff68bd1da6b/feedback

{"action": "dismissed"}
```
`201`
```json
{
  "id": 1,
  "insight_id": "ins_1ff68bd1da6b",
  "action": "dismissed",
  "created_at": "2026-10-29T13:19:07.909866Z"
}
```

### Correction (feed trimmed)
```http
POST /api/v1/users/user_b/corrections

{"date": "2026-06-30", "metric": "sleep_hours", "value": 6.6}
```
`200`
```json
{
  "user_id": "user_b",
  "date": "2026-06-30",
  "metric": "sleep_hours",
  "value": 6.6,
  "unit": "hours",
  "stale_run_count": 1,
  "feed": {
    "run_id": "run_308b19e04752",
    "insights": [
      [
        "trend",
        [
          "hrv_ms"
        ]
      ]
    ]
  }
}
```

### Error response
```http
GET /api/v1/users/user_b/insights?date=2020-01-01
```
`422`
```json
{
  "error": {
    "code": "date_out_of_range",
    "message": "date must be between 2026-03-03 and 2026-06-30 for this user."
  }
}
```

## Data editor (D29–D31)

### Save several edits at once (data editor; no recalculation)
```http
POST /api/v1/users/user_b/corrections/batch

{"corrections": [{"date": "2026-06-30", "metric": "sleep_hours", "value": 6.6}, {"date": "2026-06-29", "metric": "steps", "value": 9000}]}
```
`200`
```json
{
  "user_id": "user_b",
  "saved": 2,
  "stale_run_count": 1,
  "dates": [
    "2026-06-29",
    "2026-06-30"
  ]
}
```

### Feed after the data changed
```http
GET /api/v1/users/user_b/insights?date=2026-06-30
```
`404`
```json
{
  "error": {
    "code": "insights_outdated",
    "message": "The data for 2026-06-30 changed since its insights were made. Recalculate them."
  }
}
```

### A batch with one invalid value stores nothing
```http
POST /api/v1/users/user_b/corrections/batch

{"corrections": [{"date": "2026-06-30", "metric": "steps", "value": 5000}, {"date": "2026-06-30", "metric": "sleep_hours", "value": 30}]}
```
`422`
```json
{
  "error": {
    "code": "invalid_value",
    "message": "2026-06-30 sleep_hours: Sleep must be between 0 and 24 hours."
  }
}
```

### Baselines include goal progress (steps shown)
```http
GET /api/v1/users/user_b/baselines?date=2026-06-30
```
`200`
```json
{
  "metric": "steps",
  "observed_value": 8579.0,
  "goal_value": 9000.0,
  "goal_progress_percent": 95.3
}
```
