"""
Allocation service — pure CRUD over `transaction_allocations`.

Why a service layer?
- Multiple routes (manual match, ignore, unmatch, future expense tagging)
  need to write allocations, and we want a single place that enforces the
  PR-2 invariants (≤1 tenant allocation per transaction; sum equals parent
  amount; cleanup keeps `Transaction.matched_tenant_id` in sync).
- Routers stay thin and testable.

PR-2 keeps `Transaction.matched_tenant_id` as a denormalized cache. Helpers
in this module that mutate allocations also touch that column so the rest
of the app (notably `routers/payments.py`) keeps working unchanged. PR-3
will lift this dual-write once payment-status reads move to allocations.
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
    amount within `tolerance` (default 1 agora). Used by PR-3 split editing
    to gate the "save" button. Doesn't touch the DB.
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
