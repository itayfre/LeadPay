"""
Expenses router — per-building user-defined expense categories + the
expense-allocations they tag.

Coexists with the legacy `TransactionAllocation.category` string column.
This router only reads/writes the new `category_id` FK; the legacy column
is still populated by the upload flow (vendor_classifier) and remains
untouched.

Expense allocations are TransactionAllocation rows where
  tenant_id IS NULL AND label IS NOT NULL
(matches the convention used by `app/routers/statements.py:843+`.)

Building scoping for allocations: walk
  TransactionAllocation -> Transaction -> BankStatement.building_id
"""
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..dependencies.auth import require_viewer_plus, require_worker_plus
from ..models import (
    BankStatement,
    Building,
    ExpenseCategory,
    Transaction,
    TransactionAllocation,
)
from ..models.user import User
from ..schemas.expense import (
    BulkCategorizeRequest,
    BulkCategorizeResponse,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseRow,
    SetCategoryRequest,
)


router = APIRouter(
    prefix="/api/v1/expenses",
    tags=["expenses"],
)


# ---------- Helpers ----------

def _parse_period(p: str, field_name: str) -> tuple[int, int]:
    """Parse 'YYYY-MM' into (year, month). Raises 422 on bad input."""
    try:
        y_str, m_str = p.split("-")
        y, m = int(y_str), int(m_str)
        if not (1 <= m <= 12) or y < 1900 or y > 2999:
            raise ValueError
        return y, m
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be in YYYY-MM format",
        )


def _period_range_pairs(from_y: int, from_m: int, to_y: int, to_m: int) -> List[tuple]:
    """All (year, month) pairs from (from_y, from_m) through (to_y, to_m), inclusive."""
    out = []
    y, m = from_y, from_m
    while (y, m) <= (to_y, to_m):
        out.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def _ensure_building(db: Session, building_id: UUID) -> Building:
    b = db.query(Building).filter(Building.id == building_id).first()
    if not b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found",
        )
    return b


# ---------- Categories CRUD ----------

@router.get("/{building_id}/categories/", response_model=List[ExpenseCategoryResponse])
def list_categories(
    building_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer_plus),
):
    """List active expense categories for a building."""
    _ensure_building(db, building_id)
    rows = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.building_id == building_id,
            ExpenseCategory.is_active == True,
        )
        .order_by(ExpenseCategory.is_default.desc(), ExpenseCategory.name.asc())
        .all()
    )
    return rows


@router.post(
    "/{building_id}/categories/",
    response_model=ExpenseCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    building_id: UUID,
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """Create a new expense category. 409 on duplicate name within the building."""
    _ensure_building(db, building_id)
    try:
        cat = ExpenseCategory(
            building_id=building_id,
            name=payload.name.strip(),
            color=payload.color,
            is_default=False,
            is_active=True,
        )
        db.add(cat)
        db.commit()
        db.refresh(cat)
        return cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category '{payload.name}' already exists for this building",
        )


@router.patch("/categories/{category_id}", response_model=ExpenseCategoryResponse)
def update_category(
    category_id: UUID,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """Rename or recolor a category."""
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    if payload.name is not None:
        cat.name = payload.name.strip()
    if payload.color is not None:
        cat.color = payload.color

    try:
        db.commit()
        db.refresh(cat)
        return cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name already exists for this building",
        )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """
    Hard-delete a category. Refuses (409) if any allocation still references it,
    so the user is forced to first move/clear those allocations.
    """
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    in_use = (
        db.query(TransactionAllocation.id)
        .filter(TransactionAllocation.category_id == category_id)
        .first()
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category is referenced by one or more expenses. Reassign them first.",
        )

    db.delete(cat)
    db.commit()
    return None


# ---------- Expense allocations listing + tagging ----------

@router.get("/{building_id}/", response_model=List[ExpenseRow])
def list_expenses(
    building_id: UUID,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer_plus),
):
    """
    List expense allocations for a building over an inclusive YYYY-MM range,
    joined to category metadata (left-join — uncategorized included).

    Building scoping is via Transaction.statement_id -> BankStatement.building_id.
    Manual transactions without a statement are not currently emitted as expenses
    by any flow, so this scoping is correct for today; revisit if that changes.
    """
    _ensure_building(db, building_id)
    from_y, from_m = _parse_period(from_, "from")
    to_y, to_m = _parse_period(to, "to")
    if (from_y, from_m) > (to_y, to_m):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`from` must be <= `to`",
        )
    pairs = _period_range_pairs(from_y, from_m, to_y, to_m)
    if len(pairs) > 24:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Range cannot exceed 24 months",
        )

    from sqlalchemy import tuple_

    rows = (
        db.query(
            TransactionAllocation.id.label("allocation_id"),
            Transaction.id.label("transaction_id"),
            Transaction.activity_date.label("activity_date"),
            Transaction.description.label("description"),
            TransactionAllocation.amount.label("amount"),
            TransactionAllocation.label.label("vendor_label"),
            TransactionAllocation.category_id.label("category_id"),
            ExpenseCategory.name.label("category_name"),
            ExpenseCategory.color.label("category_color"),
        )
        .join(Transaction, Transaction.id == TransactionAllocation.transaction_id)
        .join(BankStatement, BankStatement.id == Transaction.statement_id)
        .outerjoin(
            ExpenseCategory, ExpenseCategory.id == TransactionAllocation.category_id
        )
        .filter(
            BankStatement.building_id == building_id,
            TransactionAllocation.tenant_id.is_(None),
            TransactionAllocation.label.isnot(None),
            tuple_(
                TransactionAllocation.period_year,
                TransactionAllocation.period_month,
            ).in_(pairs),
        )
        .order_by(Transaction.activity_date.desc())
        .all()
    )

    return [
        ExpenseRow(
            transaction_id=r.transaction_id,
            allocation_id=r.allocation_id,
            date=r.activity_date.date() if isinstance(r.activity_date, datetime) else r.activity_date,
            amount=float(r.amount),
            description=r.description,
            vendor_label=r.vendor_label,
            category_id=r.category_id,
            category_name=r.category_name,
            category_color=r.category_color,
        )
        for r in rows
    ]


@router.patch("/transactions/{transaction_id}/category", response_model=ExpenseRow)
def set_transaction_category(
    transaction_id: UUID,
    payload: SetCategoryRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """
    Set (or unset) the category on a transaction's expense allocation.
    Returns the updated row in `ExpenseRow` shape.
    """
    alloc = (
        db.query(TransactionAllocation)
        .filter(
            TransactionAllocation.transaction_id == transaction_id,
            TransactionAllocation.tenant_id.is_(None),
            TransactionAllocation.label.isnot(None),
        )
        .first()
    )
    if not alloc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No expense allocation found for this transaction",
        )

    if payload.category_id is not None:
        cat = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id == payload.category_id)
            .first()
        )
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
            )
    alloc.category_id = payload.category_id
    db.commit()
    db.refresh(alloc)

    transaction = (
        db.query(Transaction).filter(Transaction.id == transaction_id).first()
    )
    cat = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == alloc.category_id)
        .first()
        if alloc.category_id
        else None
    )
    return ExpenseRow(
        transaction_id=transaction.id,
        allocation_id=alloc.id,
        date=transaction.activity_date.date()
        if isinstance(transaction.activity_date, datetime)
        else transaction.activity_date,
        amount=float(alloc.amount),
        description=transaction.description,
        vendor_label=alloc.label,
        category_id=alloc.category_id,
        category_name=cat.name if cat else None,
        category_color=cat.color if cat else None,
    )


@router.post(
    "/{building_id}/bulk-categorize", response_model=BulkCategorizeResponse
)
def bulk_categorize(
    building_id: UUID,
    payload: BulkCategorizeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """
    Bulk-set the same category on many expense allocations.
    Returns the number of allocations updated. Allocations not matching the
    `(building, expense)` filter are silently skipped.
    """
    _ensure_building(db, building_id)
    if not payload.transaction_ids:
        return BulkCategorizeResponse(updated=0)

    if payload.category_id is not None:
        cat = (
            db.query(ExpenseCategory)
            .filter(
                ExpenseCategory.id == payload.category_id,
                ExpenseCategory.building_id == building_id,
            )
            .first()
        )
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found for this building",
            )

    allocs = (
        db.query(TransactionAllocation)
        .join(Transaction, Transaction.id == TransactionAllocation.transaction_id)
        .join(BankStatement, BankStatement.id == Transaction.statement_id)
        .filter(
            BankStatement.building_id == building_id,
            Transaction.id.in_(payload.transaction_ids),
            TransactionAllocation.tenant_id.is_(None),
            TransactionAllocation.label.isnot(None),
        )
        .all()
    )

    updated = 0
    for a in allocs:
        a.category_id = payload.category_id
        updated += 1

    db.commit()
    return BulkCategorizeResponse(updated=updated)
