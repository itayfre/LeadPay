from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from ..database import get_db
from ..models import (
    Building, Apartment, Tenant, Transaction,
    BankStatement, TransactionType
)

router = APIRouter(
    prefix="/api/v1/payments",
    tags=["payments"]
)


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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No bank statements found for this building"
            )

        month = latest_statement.period_month
        year = latest_statement.period_year

    # Get all active tenants with their apartments
    tenants_query = db.query(Tenant, Apartment).join(Apartment).filter(
        Apartment.building_id == building_id,
        Tenant.is_active == True
    ).all()

    # Get all transactions for this period
    transactions = db.query(Transaction).join(BankStatement).filter(
        BankStatement.building_id == building_id,
        BankStatement.period_month == month,
        BankStatement.period_year == year,
        Transaction.transaction_type == TransactionType.PAYMENT
    ).all()

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
            "language": tenant.language.value if tenant.language else "he"
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


@router.get("/tenant/{tenant_id}/history")
def get_tenant_payment_history(
    tenant_id: UUID,
    db: Session = Depends(get_db)
):
    """Get payment history for a specific tenant"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    # Get all transactions for this tenant
    transactions = db.query(Transaction, BankStatement).join(BankStatement).filter(
        Transaction.matched_tenant_id == tenant_id,
        Transaction.transaction_type == TransactionType.PAYMENT
    ).order_by(
        BankStatement.period_year.desc(),
        BankStatement.period_month.desc()
    ).all()

    payment_history = []
    for trans, statement in transactions:
        payment_history.append({
            "period": f"{statement.period_month:02d}/{statement.period_year}",
            "payment_date": trans.activity_date.isoformat(),
            "amount": float(trans.credit_amount) if trans.credit_amount else 0,
            "description": trans.description,
            "match_confidence": trans.match_confidence,
            "is_confirmed": trans.is_confirmed
        })

    return {
        "tenant_id": str(tenant_id),
        "tenant_name": tenant.name,
        "payment_count": len(payment_history),
        "total_paid": sum(p['amount'] for p in payment_history),
        "payments": payment_history
    }
