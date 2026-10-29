"""Writes the seeded synthetic data to CSV in docs/sample-data/, so it can be read without running the app.

The app generates the same data on first start (seed 42, 120 days); here the end date is fixed so the files never
change unless the simulation does. Run from backend/:  python -m scripts.export_sample_data
"""

import csv
from datetime import date
from pathlib import Path

from app.config import DEFAULT_DAYS, DEFAULT_SEED
from app.simulation import PROFILES, SCENARIOS, simulate_user

END_DATE = date(2026, 6, 30)
OUT = Path(__file__).resolve().parents[2] / "docs" / "sample-data"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "users.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["user_id", "display_name", "description", "activity_goal_steps", "sleep_target_hours", "timezone",
                    "scenario", "scenario_description"])
        for p in PROFILES.values():
            w.writerow([p.user_id, p.display_name, p.description, p.activity_goal_steps, p.sleep_target_hours,
                        p.timezone, p.default_scenario, SCENARIOS[p.default_scenario].description])

    with open(OUT / "readings.csv", "w", newline="", encoding="utf-8") as readings, \
            open(OUT / "notes.csv", "w", newline="", encoding="utf-8") as notes:
        rw, nw = csv.writer(readings), csv.writer(notes)
        rw.writerow(["user_id", "date", "metric", "value", "unit", "is_available", "quality_marker"])
        nw.writerow(["user_id", "date", "text"])
        for p in PROFILES.values():
            data = simulate_user(p, p.default_scenario, DEFAULT_SEED, DEFAULT_DAYS, END_DATE)
            for r in data.readings:
                rw.writerow([p.user_id, r.date.isoformat(), r.metric, "" if r.value is None else r.value, r.unit,
                             r.is_available, r.quality_marker or ""])
            for n in data.notes:
                nw.writerow([p.user_id, n.date.isoformat(), n.text])
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
