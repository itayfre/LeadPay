from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from collections import defaultdict

from ..database import get_db
from ..models import (
    Building, Apartment, Tenant, Transaction,
    BankStatement, TransactionType, MatchMethod
)

router = APIRouter(
    prefix="/api/v1/payments",
    tags=["payments"]
)



@router.get("/bulk-summary")
def get_bulk_payment_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Return payment summary for ALL buildings for a given month/year.
    Uses grouped queries — no N+1 problem.
    Falls back to current month/year if not specified.
    """
    from datetime import datetime as dt
    if month is None or year is None:
        now = dt.now()
        month = now.month
        year = now.year

    # Get all buildings
    buildings = db.query(Building).all()
    if not buildings:
        return []

    building_ids = [b.id for b in buildings]

    # Get active tenant counts per building (one query)
    tenant_counts = {
        str(building_id): count
        for building_id, count in db.query(Apartment.building_id, func.count(Tenant.id))
        .join(Tenant, Tenant.apartment_id == Apartment.id)
        .filter(
            Apartment.building_id.in_(building_ids),
            Tenant.is_active == True
        )
        .group_by(Apartment.building_id)
        .all()
    }

    # Get paid tenant IDs and amounts per building for the period (one query)
    paid_rows = (
        db.query(
            Building.id.label("building_id"),
            Transaction.matched_tenant_id,
            func.sum(Transaction.credit_amount).label("total_paid")
        )
        .join(BankStatement, BankStatement.building_id == Building.id)
        .join(Transaction, Transaction.statement_id == BankStatement.id)
        .join(Tenant, Tenant.id == Transaction.matched_tenant_id)
        .filter(
            BankStatement.period_month == month,
            BankStatement.period_year == year,
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.matched_tenant_id != None,
            Transaction.credit_amount != None,
            Tenant.is_active == True,
        )
        .group_by(Building.id, Transaction.matched_tenant_id)
        .all()
    )

    # Aggregate per building
    paid_by_building: dict = {}
    collected_by_building: dict = {}
    for row in paid_rows:
        bid = str(row.building_id)
        if bid not in paid_by_building:
            paid_by_building[bid] = set()
            collected_by_building[bid] = 0.0
        paid_by_building[bid].add(str(row.matched_tenant_id))
        collected_by_building[bid] += float(row.total_paid or 0)

    # Build result
    result = []
    for building in buildings:
        bid = str(building.id)
        total = tenant_counts.get(bid, 0)
        paid_set = paid_by_building.get(bid, set())
        paid = len(paid_set)
        unpaid = max(0, total - paid)
        collected = collected_by_building.get(bid, 0.0)
        collection_rate = round(paid / total * 100, 1) if total > 0 else 0.0

        result.append({
            "building_id": bid,
            "paid": paid,
            "unpaid": unpaid,
            "total_tenants": total,
            "collection_rate": collection_rate,
            "total_collected": collected,
        })

    return result


def _calculate_tenant_debt_from_map(
    tenant, apartment, building, paid_map: dict, up_to_month: int, up_to_year: int
) -> float:
    """
    Cumulative debt from move_in_date to up_to_month/year inclusive.
    paid_map: {(year, month): total_paid_float} — pre-fetched, no DB calls here.
    """
    if not tenant.move_in_date:
        return 0.0
    move_in = tenant.move_in_date
    expected_monthly = float(apartment.expected_payment or building.expected_monthly_payment or 0)
    if expected_monthly == 0:
        return 0.0

    months = []
    y, m = move_in.year, move_in.month
    while (y, m) <= (up_to_year, up_to_month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    total_debt = sum(
        max(0.0, expected_monthly - paid_map.get((y, m), 0.0))
        for y, m in months
    )
    return round(total_debt, 2)



class ManualPaymentRequest(BaseModel):
    building_id: str
    tenant_id: str
    amount: float
    month: int
    year: int
    note: Optional[str] = None


@router.post("/manual")
def create_manual_payment(
    payload: ManualPaymentRequest,
    db: Session = Depends(get_db)
):
    """
    Record a manual payment for a tenant (cash, bank transfer outside normal matching).
    Creates a Transaction with is_manual=True and statement_id=None.
    """

    # Validate tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant {payload.tenant_id} not found")

    # Validate tenant belongs to the specified building
    apartment_check = db.query(Apartment).filter(
        Apartment.id == tenant.apartment_id,
        Apartment.building_id == payload.building_id
    ).first()
    if not apartment_check:
        raise HTTPException(
            status_code=404,
            detail="Tenant does not belong to the specified building"
        )

    # Validate amount
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Build description
    description = "תשלום ידני"
    if payload.note:
        description += f" - {payload.note}"

    # Create transaction (no statement_id — is_manual=True)
    txn = Transaction(
        statement_id=None,
        activity_date=datetime(payload.year, payload.month, 1),
        description=description,
        credit_amount=payload.amount,
        debit_amount=None,
        balance=None,
        transaction_type=TransactionType.PAYMENT,
        matched_tenant_id=tenant.id,
        match_confidence=1.0,
        match_method=MatchMethod.MANUAL,
        is_confirmed=True,
        is_manual=True,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return {
        "transaction_id": str(txn.id),
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "amount": float(txn.credit_amount),
        "month": payload.month,
        "year": payload.year,
        "description": description,
        "is_manual": True,
    }



@router.get("/tenant/{tenant_id}/history")
def get_tenant_payment_history(
    tenant_id: str,
    db: Session = Depends(get_db)
):
    """
    Return month-by-month payment history for a tenant from move_in_date to current month.
    Each month includes summary + individual transactions (bank-statement and manual).
    """
    from datetime import date

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant {tenant_id} not found")

    apartment = db.query(Apartment).filter(Apartment.id == tenant.apartment_id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="Apartment not found for tenant")
    building = db.query(Building).filter(Building.id == apartment.building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found for apartment")

    expected_monthly = float(apartment.expected_payment or building.expected_monthly_payment or 0)
    move_in = tenant.move_in_date or date(2026, 1, 1)
    today = date.today()

    # Generate list of all months from move_in to today
    months_list = []
    y, m = move_in.year, move_in.month
    while (y, m) <= (today.year, today.month):
        months_list.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    # Get ALL transactions for this tenant (bank + manual) using outerjoin
    all_transactions = (
        db.query(Transaction, BankStatement)
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.matched_tenant_id == tenant.id,
            Transaction.transaction_type == TransactionType.PAYMENT,
        )
        .order_by(Transaction.activity_date.asc())
        .all()
    )

    # Group transactions by (year, month)
    txns_by_month: dict = {}
    for txn, stmt in all_transactions:
        if stmt is not None:
            key = (stmt.period_year, stmt.period_month)
        else:
            # manual transaction: derive period from activity_date
            act_date = txn.activity_date
            if hasattr(act_date, "date"):
                act_date = act_date.date()
            key = (act_date.year, act_date.month)
        if key not in txns_by_month:
            txns_by_month[key] = []
        act = txn.activity_date
        date_str = act.date().isoformat() if hasattr(act, "date") else str(act)[:10]
        txns_by_month[key].append({
            "id": str(txn.id),
            "date": date_str,
            "amount": float(txn.credit_amount or 0),
            "description": txn.description,
            "is_manual": bool(txn.is_manual),
        })

    # Build month-by-month summary
    result_months = []
    for (y, m) in months_list:
        month_txns = txns_by_month.get((y, m), [])
        paid = sum(t["amount"] for t in month_txns)
        diff = paid - expected_monthly
        if expected_monthly == 0:
            st = "paid"
        elif paid >= expected_monthly - 0.5:
            st = "paid"
        elif paid > 0:
            st = "partial"
        else:
            st = "unpaid"

        result_months.append({
            "month": m,
            "year": y,
            "period": f"{m:02d}/{y}",
            "expected": expected_monthly,
            "paid": round(paid, 2),
            "difference": round(diff, 2),
            "status": st,
            "transactions": month_txns,
        })

    return {
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "apartment_number": apartment.number,
        "move_in_date": move_in.isoformat(),
        "months": result_months,
    }

@router.get("/{building_id}/status")
def get_payment_status(
    building_id: UUID,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get payment status for all tenants in a building for a specific period.
    If month/year not specified, uses the latest bank statement period.
    """
    # Verify building exists
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # If no period specified, get the latest statement period
    if not month or not year:
        latest_statement = db.query(BankStatement).filter(
            BankStatement.building_id == building_id
        ).order_by(
            BankStatement.period_year.desc(),
            BankStatement.period_month.desc()
        ).first()

        if not latest_statement:
            # No bank statements yet - return empty payment data with current period
            now = datetime.now()
            return {
                "building_id": str(building_id),
                "building_name": building.name,
                "period": f"{now.month:02d}/{now.year}",
                "summary": {
                    "total_tenants": 0,
                    "paid": 0,
                    "unpaid": 0,
                    "total_expected": 0,
                    "total_collected": 0,
                    "collection_rate": "N/A",
                    "amount_rate": "N/A"
                },
                "tenants": []
            }

        month = latest_statement.period_month
        year = latest_statement.period_year

    # Get all active tenants with their apartments
    tenants_query = db.query(Tenant, Apartment).join(Apartment).filter(
        Apartment.building_id == building_id,
        Tenant.is_active == True
    ).all()

    # Get tenant IDs for this building to scope manual transactions
    tenant_ids_in_building = [t.id for t, _ in tenants_query]

    # Pre-fetch ALL historical transactions for debt calculation (single batch query)
    all_historical_txns = (
        db.query(Transaction, BankStatement)
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.matched_tenant_id.in_(tenant_ids_in_building),
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.credit_amount != None,
        )
        .all()
    )
    # Group by (tenant_id -> {(year, month) -> total_paid})
    historical_paid_by_tenant: dict = defaultdict(lambda: defaultdict(float))
    for txn, stmt in all_historical_txns:
        if stmt is not None:
            period_key = (stmt.period_year, stmt.period_month)
        else:
            period_key = (txn.activity_date.year, txn.activity_date.month)
        historical_paid_by_tenant[str(txn.matched_tenant_id)][period_key] += float(txn.credit_amount or 0)

    # Get all transactions for this period (including manual transactions)
    transactions = (
        db.query(Transaction)
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.matched_tenant_id.in_(tenant_ids_in_building),
            or_(
                and_(
                    BankStatement.period_month == month,
                    BankStatement.period_year == year,
                    BankStatement.building_id == building_id,
                ),
                and_(
                    Transaction.is_manual == True,
                    func.extract('month', Transaction.activity_date) == month,
                    func.extract('year', Transaction.activity_date) == year,
                )
            )
        )
        .all()
    )

    # Create a map of tenant_id -> total paid
    payments_by_tenant = {}
    for trans in transactions:
        if trans.matched_tenant_id and trans.credit_amount:
            tenant_id = str(trans.matched_tenant_id)
            if tenant_id not in payments_by_tenant:
                payments_by_tenant[tenant_id] = 0
            payments_by_tenant[tenant_id] += float(trans.credit_amount)

    # Build status for each tenant
    tenant_statuses = []
    total_expected = 0
    total_collected = 0
    paid_count = 0
    unpaid_count = 0

    for tenant, apartment in tenants_query:
        tenant_id = str(tenant.id)

        # Get expected payment amount
        expected = apartment.expected_payment or building.expected_monthly_payment
        if expected:
            expected = float(expected)
        else:
            expected = 0

        # Get actual payment
        paid = payments_by_tenant.get(tenant_id, 0)

        # Calculate status
        is_paid = paid >= expected if expected > 0 else paid > 0
        difference = paid - expected

        if is_paid:
            paid_count += 1
        else:
            unpaid_count += 1

        total_expected += expected
        total_collected += paid

        tenant_statuses.append({
            "tenant_id": tenant_id,
            "tenant_name": tenant.name,
            "apartment_number": apartment.number,
            "floor": apartment.floor,
            "expected_amount": expected,
            "paid_amount": paid,
            "difference": difference,
            "status": "paid" if is_paid else "unpaid",
            "is_overpaid": difference > 1.0,
            "is_underpaid": difference < -1.0,
            "phone": tenant.phone,
            "language": tenant.language.value if tenant.language else "he",
            "apartment_id": str(apartment.id),
            "move_in_date": tenant.move_in_date.isoformat() if tenant.move_in_date else None,
            "total_debt": _calculate_tenant_debt_from_map(
                tenant, apartment, building,
                dict(historical_paid_by_tenant.get(str(tenant.id), {})),
                month, year
            ),
        })

    # Sort by apartment number
    tenant_statuses.sort(key=lambda x: x['apartment_number'])

    return {
        "building_id": str(building_id),
        "building_name": building.name,
        "period": f"{month:02d}/{year}",
        "summary": {
            "total_tenants": len(tenant_statuses),
            "paid": paid_count,
            "unpaid": unpaid_count,
            "total_expected": total_expected,
            "total_collected": total_collected,
            "collection_rate": f"{(paid_count / len(tenant_statuses) * 100):.1f}%" if tenant_statuses else "N/A",
            "amount_rate": f"{(total_collected / total_expected * 100):.1f}%" if total_expected > 0 else "N/A"
        },
        "tenants": tenant_statuses
    }


@router.get("/{building_id}/unpaid")
def get_unpaid_tenants(
    building_id: UUID,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get list of tenants who haven't paid for a specific period"""
    # Get full payment status
    status_data = get_payment_status(building_id, month, year, db)

    # Filter for unpaid only
    unpaid_tenants = [
        t for t in status_data['tenants']
        if t['status'] == 'unpaid'
    ]

    return {
        "building_id": str(building_id),
        "building_name": status_data['building_name'],
        "period": status_data['period'],
        "unpaid_count": len(unpaid_tenants),
        "unpaid_tenants": unpaid_tenants
    }


@router.get("/{building_id}/history")
def get_payment_history(
    building_id: UUID,
    months: int = 6,
    db: Session = Depends(get_db)
):
    """Get payment history for the last N months"""
    # Verify building exists
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # Get all statements for this building
    statements = db.query(BankStatement).filter(
        BankStatement.building_id == building_id
    ).order_by(
        BankStatement.period_year.desc(),
        BankStatement.period_month.desc()
    ).limit(months).all()

    history = []
    for statement in statements:
        # Get payment count for this statement
        payment_count = db.query(Transaction).filter(
            Transaction.statement_id == statement.id,
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.matched_tenant_id != None
        ).count()

        # Get total amount
        total_amount = db.query(func.sum(Transaction.credit_amount)).filter(
            Transaction.statement_id == statement.id,
            Transaction.transaction_type == TransactionType.PAYMENT
        ).scalar() or 0

        history.append({
            "period": f"{statement.period_month:02d}/{statement.period_year}",
            "statement_id": str(statement.id),
            "upload_date": statement.upload_date.isoformat(),
            "payments_received": payment_count,
            "total_amount": float(total_amount)
        })

    return {
        "building_id": str(building_id),
        "building_name": building.name,
        "history": history
    }
