"""
Allocation service — pure CRUD over `transaction_allocations`.

Why a service layer?
- Multiple routes (manual match, ignore, unmatch, expense tagging)
  need to write allocations, and we want a single place that enforces
  sum-equals-headline and keeps `Transaction.matched_tenant_id` in sync.
- Routers stay thin and testable.

`matched_tenant_id` invariant (PR-3):
  Set only when exactly one tenant allocation covers the full amount.
  For splits (2+ allocations, or any non-tenant allocation) it is NULL
  and reads go through `transaction_allocations`.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Iterable, List, Optional, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from ..models import (
    BankStatement,
    Transaction,
    TransactionAllocation,
)

_TOLERANCE = Decimal("0.01")


# ──────────────────────────────────────────────────────────────────────────────
# Period helpers
# ──────────────────────────────────────────────────────────────────────────────

def derive_period(
    transaction: Transaction,
    db: Session,
) -> tuple[Optional[int], Optional[int]]:
    """Return (month, year) the allocation should default to.

    Order of preference:
      1. Parent bank-statement period (most authoritative).
      2. Transaction `activity_date` (works for manual transactions where
         `statement_id` is null).
    """
    if transaction.statement_id:
        statement = (
            db.query(BankStatement)
            .filter(BankStatement.id == transaction.statement_id)
            .first()
        )
        if statement and statement.period_month and statement.period_year:
            return statement.period_month, statement.period_year

    if transaction.activity_date:
        return transaction.activity_date.month, transaction.activity_date.year

    return None, None


# ──────────────────────────────────────────────────────────────────────────────
# Read helpers
# ──────────────────────────────────────────────────────────────────────────────

def list_for_transaction(
    db: Session, transaction_id: UUID
) -> List[TransactionAllocation]:
    return (
        db.query(TransactionAllocation)
        .filter(TransactionAllocation.transaction_id == transaction_id)
        .order_by(TransactionAllocation.created_at)
        .all()
    )


def sum_allocated(db: Session, transaction_id: UUID) -> Decimal:
    """Sum of allocation amounts for a given transaction."""
    rows = (
        db.query(TransactionAllocation.amount)
        .filter(TransactionAllocation.transaction_id == transaction_id)
        .all()
    )
    return sum((Decimal(r[0]) for r in rows), Decimal("0"))


# ──────────────────────────────────────────────────────────────────────────────
# Mutations
# ──────────────────────────────────────────────────────────────────────────────

def clear_for_transaction(db: Session, transaction_id: UUID) -> int:
    """Delete every allocation for the given transaction. Returns row count.

    Used by `unmatch` / `ignore` / `delete` paths. Does NOT touch
    `Transaction.matched_tenant_id` — callers do that explicitly so the
    intent stays visible at the call site.
    """
    deleted = (
        db.query(TransactionAllocation)
        .filter(TransactionAllocation.transaction_id == transaction_id)
        .delete(synchronize_session=False)
    )
    return deleted


def upsert_single_tenant_allocation(
    db: Session,
    transaction: Transaction,
    tenant_id: UUID,
    amount: Optional[Decimal] = None,
    period_month: Optional[int] = None,
    period_year: Optional[int] = None,
) -> TransactionAllocation:
    """Replace any existing allocations on `transaction` with exactly one row
    pointing at `tenant_id` for the full transaction amount.

    This is the PR-2 path used by both auto-match and manual-match — neither
    creates splits yet, so we always end with a single allocation per
    transaction. PR-3 introduces a different `set_split_allocations` helper
    for the multi-allocation case.

    Note: callers are responsible for committing the session.
    """
    # Wipe any existing allocations first to keep the invariant simple
    clear_for_transaction(db, transaction.id)

    if amount is None:
        amount = (
            Decimal(transaction.credit_amount)
            if transaction.credit_amount is not None
            else Decimal(transaction.debit_amount or 0)
        )

    if period_month is None or period_year is None:
        derived_month, derived_year = derive_period(transaction, db)
        period_month = period_month if period_month is not None else derived_month
        period_year = period_year if period_year is not None else derived_year

    allocation = TransactionAllocation(
        transaction_id=transaction.id,
        tenant_id=tenant_id,
        amount=amount,
        period_month=period_month,
        period_year=period_year,
    )
    db.add(allocation)
    db.flush()  # so the row has an id if the caller wants it
    return allocation


# ──────────────────────────────────────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────────────────────────────────────

def validate_sum_matches_amount(
    transaction: Transaction,
    allocations: Sequence[TransactionAllocation] | Iterable[dict],
    *,
    tolerance: Decimal = Decimal("0.01"),
) -> bool:
    """True when the allocation amounts sum to the transaction's headline
    amount within tolerance. Used to gate the frontend save button.
    """
    headline = (
        Decimal(transaction.credit_amount)
        if transaction.credit_amount is not None
        else Decimal(transaction.debit_amount or 0)
    )
    total = Decimal("0")
    for a in allocations:
        amount = a.amount if hasattr(a, "amount") else a["amount"]
        total += Decimal(amount)
    return abs(total - headline) <= tolerance


def _headline_amount(transaction: Transaction) -> Decimal:
    return (
        Decimal(str(transaction.credit_amount))
        if transaction.credit_amount is not None
        else Decimal(str(transaction.debit_amount or 0))
    )


def set_split_allocations(
    db: Session,
    transaction: Transaction,
    allocations: List[dict],
) -> List[TransactionAllocation]:
    """Atomically replace all allocations for `transaction` with the given list.

    Each dict must contain:
      - `amount` (Decimal or float, positive)
      - `tenant_id` (UUID/str) OR `label` (str) — at least one required
      - `period_month`, `period_year` (int, optional — derived from statement if absent)

    Raises ValueError on sum mismatch or missing tenant_id/label.
    Sets `transaction.matched_tenant_id` per the PR-3 invariant:
      single full-amount tenant allocation → set it; anything else → None.
    Callers must commit.
    """
    if not allocations:
        raise ValueError("allocations list must not be empty")

    headline = _headline_amount(transaction)
    total = sum(Decimal(str(a["amount"])) for a in allocations)
    if abs(total - headline) > _TOLERANCE:
        raise ValueError(
            f"Allocation sum ({total}) does not match transaction amount ({headline})"
        )

    for i, a in enumerate(allocations):
        if not a.get("tenant_id") and not a.get("label"):
            raise ValueError(f"allocation[{i}]: tenant_id or label is required")

    clear_for_transaction(db, transaction.id)

    created: List[TransactionAllocation] = []
    for a in allocations:
        pm = a.get("period_month")
        py = a.get("period_year")
        if pm is None or py is None:
            derived_month, derived_year = derive_period(transaction, db)
            pm = pm if pm is not None else derived_month
            py = py if py is not None else derived_year

        row = TransactionAllocation(
            transaction_id=transaction.id,
            tenant_id=a.get("tenant_id"),
            label=a.get("label"),
            amount=Decimal(str(a["amount"])),
            period_month=pm,
            period_year=py,
            category=a.get("category"),
            notes=a.get("notes"),
        )
        db.add(row)
        created.append(row)

    # Derive matched_tenant_id per PR-3 invariant
    single_tenant = (
        len(created) == 1
        and created[0].tenant_id is not None
        and abs(Decimal(str(created[0].amount)) - headline) <= _TOLERANCE
    )
    transaction.matched_tenant_id = (
        created[0].tenant_id if single_tenant else None
    )

    db.flush()
    return created
