"""
Per-tenant report payload builder.
Mirrors report_data.py but scoped to a single tenant.
"""
import datetime as dt
from typing import Optional

HEB_MONTHS = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
]
HEB_QUARTERS = {1: "רבעון א", 2: "רבעון ב", 3: "רבעון ג", 4: "רבעון ד"}


def _period_label(from_d: dt.date, to_d: dt.date) -> str:
    if from_d.year == to_d.year and from_d.month == to_d.month:
        return f"{HEB_MONTHS[from_d.month - 1]} {from_d.year}"
    if (
        from_d.year == to_d.year
        and from_d.month % 3 == 1
        and to_d.month == from_d.month + 2
    ):
        q = (from_d.month - 1) // 3 + 1
        return f"{HEB_QUARTERS[q]} {from_d.year}"
    if from_d.year == to_d.year and from_d.month == 1 and to_d.month == 12:
        return str(from_d.year)
    return f"{from_d.strftime('%d.%m.%Y')} – {to_d.strftime('%d.%m.%Y')}"


def _period_months(
    from_d: dt.date,
    to_d: dt.date,
    move_in_date: Optional[dt.date] = None,
) -> list[tuple[int, int]]:
    start = from_d
    if move_in_date and move_in_date > from_d:
        start = move_in_date.replace(day=1)
    months: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (to_d.year, to_d.month):
        months.append((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1
    return months


def _compute_summary(
    *, period_expected: float, period_paid: float, lifetime_debt: float, tx_count: int
) -> dict:
    return {
        "period_expected": float(period_expected),
        "period_paid": float(period_paid),
        "period_debt": float(max(period_expected - period_paid, 0)),
        "lifetime_debt": float(lifetime_debt),
        "transaction_count": int(tx_count),
    }
