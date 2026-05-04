"""
Expense category service — defaults + seeding helper.

The same DEFAULT_CATEGORIES list is used by:
  - the building-create endpoint (`app/routers/buildings.py`) to seed new buildings
  - the Alembic migration `add_expense_categories` to backfill existing buildings

Keep these in sync if the defaults ever change.
"""
from typing import Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from ..models import ExpenseCategory


# (name, hex color) — order is intentional: matches the colorblind-safe palette
# used in the Summary tab pie chart.
DEFAULT_CATEGORIES: Tuple[Tuple[str, str], ...] = (
    ("ניקיון", "#4C72B0"),
    ("גינון", "#55A868"),
    ("חשמל", "#DD8452"),
    ("מים", "#8172B3"),
    ("תיקונים", "#C44E52"),
    ("אחר", "#937860"),
)


def seed_default_categories(db: Session, building_id: UUID) -> None:
    """
    Insert the 6 default ExpenseCategory rows for a building.

    Caller is responsible for `db.commit()` — this just adds rows to the session
    so it can run inside a larger transaction (e.g. the building-create flow).
    Idempotent-ish: if a row with (building_id, name) already exists, the unique
    constraint will raise; callers should only invoke once per building.
    """
    for name, color in DEFAULT_CATEGORIES:
        db.add(
            ExpenseCategory(
                building_id=building_id,
                name=name,
                color=color,
                is_default=True,
            )
        )
