"""
Per-tenant report payload builder.
Mirrors report_data.py but scoped to a single tenant.
"""
import datetime as dt
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from ..models import Apartment, Tenant, Building
from ..models.transaction import Transaction, TransactionType
from ..models.transaction_allocation import TransactionAllocation

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


def _expected_for_apartment(apt: Apartment, building_default: float) -> float:
    return float(apt.expected_payment) if apt.expected_payment is not None else building_default


def _lifetime_debt(
    tenant: Tenant,
    apt: Apartment,
    building: Building,
    total_paid: float,
) -> float:
    """Total expected since move_in_date minus the total paid amount provided by the caller."""
    if tenant.move_in_date is None:
        return 0.0
    today = dt.date.today()
    if tenant.move_in_date > today:
        return 0.0

    months_elapsed = (
        (today.year - tenant.move_in_date.year) * 12
        + (today.month - tenant.move_in_date.month)
        + 1
    )
    expected_per_month = _expected_for_apartment(apt, float(building.expected_monthly_payment or 0))
    return max(months_elapsed * expected_per_month - total_paid, 0.0)


def build_tenant_report_payload(
    db: Session, tenant_id: UUID, from_date: dt.date, to_date: dt.date
) -> dict:
    tenant = (
        db.query(Tenant)
        .options(joinedload(Tenant.apartment), joinedload(Tenant.building))
        .filter(Tenant.id == tenant_id)
        .first()
    )
    if not tenant:
        raise ValueError(f"Tenant {tenant_id} not found")
    apt = tenant.apartment
    if not apt:
        raise ValueError(f"Apartment for tenant {tenant_id} not found")
    building = tenant.building
    if not building:
        raise ValueError(f"Building for tenant {tenant_id} not found")

    expected_per_month = _expected_for_apartment(apt, float(building.expected_monthly_payment or 0))
    months_yyyymm = _period_months(from_date, to_date, tenant.move_in_date)

    # Single join: every PAYMENT allocation for this tenant, paired with its
    # parent Transaction. Used for both lifetime totals and the per-period rows.
    alloc_rows = (
        db.query(TransactionAllocation, Transaction)
        .join(Transaction, TransactionAllocation.transaction_id == Transaction.id)
        .filter(
            TransactionAllocation.tenant_id == tenant.id,
            Transaction.transaction_type == TransactionType.PAYMENT,
        )
        .all()
    )
    lifetime_paid = sum(float(a.amount) for (a, _t) in alloc_rows)

    in_range_keys = set(months_yyyymm)
    in_range = [
        (a, t) for (a, t) in alloc_rows
        if a.period_year is not None
        and a.period_month is not None
        and (a.period_year, a.period_month) in in_range_keys
    ]
    period_paid = sum(float(a.amount) for (a, _t) in in_range)
    period_expected = expected_per_month * len(months_yyyymm)

    # Per-month rows.
    paid_by_month: dict[tuple[int, int], float] = {}
    for (a, _t) in in_range:
        key = (a.period_year, a.period_month)
        paid_by_month[key] = paid_by_month.get(key, 0.0) + float(a.amount)

    months_payload = []
    for (y, m) in months_yyyymm:
        paid = paid_by_month.get((y, m), 0.0)
        diff = paid - expected_per_month
        if paid <= 0:
            status = "unpaid"
        elif paid + 1 < expected_per_month:
            status = "partial"
        else:
            status = "paid"
        months_payload.append({
            "month": m,
            "year": y,
            "period_label": f"{HEB_MONTHS[m - 1]} {y}",
            "expected": expected_per_month,
            "paid": paid,
            "difference": diff,
            "status": status,
        })

    # Transaction rows from the in-range set, sorted by activity_date desc.
    in_range_sorted = sorted(
        in_range,
        key=lambda pair: pair[1].activity_date or dt.datetime.min,
        reverse=True,
    )
    transactions_payload = [
        {
            "date": (t.activity_date.isoformat() if t.activity_date else ""),
            "amount": float(a.amount),
            "description": t.description or "",
            "is_manual": bool(t.is_manual),
            "period_month": a.period_month,
            "period_year": a.period_year,
        }
        for (a, t) in in_range_sorted
    ]

    summary = _compute_summary(
        period_expected=period_expected,
        period_paid=period_paid,
        lifetime_debt=_lifetime_debt(tenant, apt, building, lifetime_paid),
        tx_count=len(transactions_payload),
    )

    return {
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.full_name or tenant.name,
            "apartment_number": apt.number,
            "floor": apt.floor,
            "standing_order": (
                {
                    "start_date": tenant.standing_order_start_date.isoformat(),
                    "end_date": (
                        tenant.standing_order_end_date.isoformat()
                        if tenant.standing_order_end_date else None
                    ),
                    "amount": float(tenant.standing_order_amount or 0),
                }
                if tenant.standing_order_start_date else None
            ),
            "building": {
                "name": building.name,
                "address": building.address,
                "city": building.city,
            },
        },
        "period": {
            "from": from_date.strftime("%Y-%m"),
            "to": to_date.strftime("%Y-%m"),
            "label": _period_label(from_date, to_date),
        },
        "summary": summary,
        "months": months_payload,
        "transactions": transactions_payload,
    }
