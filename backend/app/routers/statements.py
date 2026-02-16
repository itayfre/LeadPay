from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import io

from ..database import get_db
from ..models import (
    BankStatement, Transaction, Building, Tenant,
    Apartment, TransactionType, MatchMethod
)
from ..services.excel_parser import BankStatementParser
from ..services.matching_engine import NameMatchingEngine

router = APIRouter(
    prefix="/api/v1/statements",
    tags=["bank statements"]
)


@router.post("/{building_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_bank_statement(
    building_id: UUID,
    file: UploadFile = File(...),
    auto_match: bool = True,
    db: Session = Depends(get_db)
):
    """
    Upload and parse a bank statement Excel file for a building.
    Optionally auto-match transactions to tenants.
    """
    # Verify building exists
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # Read file content
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}"
        )

    # Parse the Excel file
    parser = BankStatementParser()
    try:
        transactions_data, metadata = parser.parse_excel(contents, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse Excel file: {str(e)}"
        )

    # Create bank statement record
    bank_statement = BankStatement(
        building_id=building_id,
        period_month=metadata.get('period_month'),
        period_year=metadata.get('period_year'),
        original_filename=file.filename,
        raw_data={'metadata': metadata, 'row_count': len(transactions_data)}
    )
    db.add(bank_statement)
    db.flush()

    # Get all tenants for this building for matching
    tenants = []
    if auto_match:
        tenants = db.query(Tenant).join(Apartment).filter(
            Apartment.building_id == building_id,
            Tenant.is_active == True
        ).all()

        # Convert to dict format for matcher
        tenants_dict = [
            {
                'id': str(t.id),
                'name': t.name,
                'full_name': t.full_name or t.name,
                'apartment_id': str(t.apartment_id)
            }
            for t in tenants
        ]

    # Initialize matching engine
    matcher = NameMatchingEngine(confidence_threshold=0.7)

    # Create transaction records
    matched_count = 0
    unmatched_count = 0
    payment_transactions = []

    for trans_data in transactions_data:
        # Create transaction
        transaction = Transaction(
            statement_id=bank_statement.id,
            activity_date=trans_data['activity_date'],
            reference_number=trans_data['reference_number'],
            description=trans_data['description'],
            credit_amount=trans_data['credit_amount'],
            debit_amount=trans_data['debit_amount'],
            balance=trans_data['balance'],
            transaction_type=TransactionType(trans_data['transaction_type'])
        )

        # Try to match if auto_match enabled and it's a payment
        if auto_match and trans_data['transaction_type'] == 'payment' and trans_data.get('payer_name'):
            tenant_id, confidence, method = matcher.match_transaction_to_tenants(
                payer_name=trans_data['payer_name'],
                tenants=tenants_dict,
                actual_amount=trans_data['credit_amount']
            )

            if tenant_id:
                transaction.matched_tenant_id = UUID(tenant_id)
                transaction.match_confidence = confidence
                transaction.match_method = MatchMethod(method)
                # Auto-confirm high confidence matches
                transaction.is_confirmed = confidence >= 0.9
                matched_count += 1
            else:
                unmatched_count += 1

        db.add(transaction)

        if trans_data['transaction_type'] == 'payment':
            payment_transactions.append(trans_data)

    # Commit all changes
    try:
        db.commit()
        db.refresh(bank_statement)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save transactions: {str(e)}"
        )

    return {
        "message": "Bank statement uploaded and processed successfully",
        "statement_id": str(bank_statement.id),
        "period": f"{metadata.get('period_month')}/{metadata.get('period_year')}",
        "total_transactions": len(transactions_data),
        "payment_transactions": len(payment_transactions),
        "matched": matched_count,
        "unmatched": unmatched_count,
        "match_rate": f"{(matched_count / len(payment_transactions) * 100):.1f}%" if payment_transactions else "N/A"
    }


@router.get("/{statement_id}/transactions")
def get_statement_transactions(
    statement_id: UUID,
    include_matched: bool = True,
    include_unmatched: bool = True,
    db: Session = Depends(get_db)
):
    """Get all transactions for a specific bank statement"""
    statement = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
    if not statement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank statement with id {statement_id} not found"
        )

    query = db.query(Transaction).filter(Transaction.statement_id == statement_id)

    # Apply filters
    if not include_matched:
        query = query.filter(Transaction.matched_tenant_id == None)
    if not include_unmatched:
        query = query.filter(Transaction.matched_tenant_id != None)

    transactions = query.all()

    return {
        "statement_id": str(statement_id),
        "building_id": str(statement.building_id),
        "period": f"{statement.period_month}/{statement.period_year}",
        "transaction_count": len(transactions),
        "transactions": [
            {
                "id": str(t.id),
                "activity_date": t.activity_date.isoformat(),
                "description": t.description,
                "credit_amount": float(t.credit_amount) if t.credit_amount else None,
                "debit_amount": float(t.debit_amount) if t.debit_amount else None,
                "matched_tenant_id": str(t.matched_tenant_id) if t.matched_tenant_id else None,
                "match_confidence": t.match_confidence,
                "match_method": t.match_method.value if t.match_method else None,
                "is_confirmed": t.is_confirmed
            }
            for t in transactions
        ]
    }


@router.post("/transactions/{transaction_id}/match/{tenant_id}")
def manually_match_transaction(
    transaction_id: UUID,
    tenant_id: UUID,
    remember: bool = True,
    db: Session = Depends(get_db)
):
    """Manually match a transaction to a tenant"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {transaction_id} not found"
        )

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    # Update transaction
    transaction.matched_tenant_id = tenant_id
    transaction.match_method = MatchMethod.MANUAL
    transaction.match_confidence = 1.0
    transaction.is_confirmed = True

    # If remember is True, create a name mapping for future use
    if remember:
        from ..models import NameMapping, MappingCreatedBy
        # Extract payer name from description
        parser = BankStatementParser()
        payer_name = parser._extract_payer_name(transaction.description)

        if payer_name:
            # Get building_id from statement
            statement = db.query(BankStatement).filter(
                BankStatement.id == transaction.statement_id
            ).first()

            # Check if mapping already exists
            existing_mapping = db.query(NameMapping).filter(
                NameMapping.building_id == statement.building_id,
                NameMapping.bank_name == payer_name,
                NameMapping.tenant_id == tenant_id
            ).first()

            if not existing_mapping:
                name_mapping = NameMapping(
                    building_id=statement.building_id,
                    bank_name=payer_name,
                    tenant_id=tenant_id,
                    created_by=MappingCreatedBy.MANUAL
                )
                db.add(name_mapping)

    db.commit()
    db.refresh(transaction)

    return {
        "message": "Transaction matched successfully",
        "transaction_id": str(transaction.id),
        "tenant_id": str(tenant_id),
        "remember": remember
    }


@router.get("/{building_id}/statements")
def list_building_statements(
    building_id: UUID,
    db: Session = Depends(get_db)
):
    """List all bank statements for a building"""
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    statements = db.query(BankStatement).filter(
        BankStatement.building_id == building_id
    ).order_by(BankStatement.period_year.desc(), BankStatement.period_month.desc()).all()

    return {
        "building_id": str(building_id),
        "statement_count": len(statements),
        "statements": [
            {
                "id": str(s.id),
                "filename": s.original_filename,
                "period": f"{s.period_month}/{s.period_year}",
                "upload_date": s.upload_date.isoformat(),
                "transaction_count": len(s.transactions)
            }
            for s in statements
        ]
    }
