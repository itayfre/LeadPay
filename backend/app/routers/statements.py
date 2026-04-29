from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import io

from ..database import get_db
from ..models import (
    BankStatement, Transaction, Building, Tenant,
    Apartment, TransactionType, MatchMethod, NameMapping, MappingCreatedBy,
    TransactionAllocation
)
from ..models.user import User
from ..services.excel_parser import BankStatementParser
from ..services.matching_engine import NameMatchingEngine
from ..services import allocation_service
from ..dependencies.auth import require_worker_plus, require_viewer_plus
import logging
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

# File upload security constants
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {'.xlsx', '.xls'}


def _is_check_or_cash(description: str) -> bool:
    """Return True if transaction is a check or cash deposit.
    These cause false positive name matches and should be skipped for NameMapping."""
    desc = description or ''
    return 'שיק' in desc or 'הפקדת מזומן' in desc or 'כספומט' in desc

router = APIRouter(
    prefix="/api/v1/statements",
    tags=["bank statements"]
)


@router.post("/{building_id}/upload", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def upload_bank_statement(
    request: Request,
    building_id: UUID,
    file: UploadFile = File(...),
    auto_match: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
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

    # Validate file extension
    filename = file.filename or ''
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג קובץ לא נתמך. יש להעלות קבצי Excel בלבד (.xlsx, .xls)",
        )

    # Read file content
    try:
        contents = await file.read()
    except Exception as e:
        logger.error(f"File read error for building {building_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read file. Please check the format."
        )

    # Validate file size
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="הקובץ גדול מדי. הגודל המקסימלי הוא 10MB",
        )

    # Parse the Excel file (return_all=True so fees/transfers are saved for review UI)
    parser = BankStatementParser()
    try:
        transactions_data, metadata = parser.parse_excel(contents, file.filename, return_all=True)
    except Exception as e:
        logger.error(f"Excel parse error for building {building_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse Excel file. Please check the format."
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

    # Load NameMappings for this building to enable learned matching
    name_mappings = db.query(NameMapping).filter(
        NameMapping.building_id == building_id
    ).all()
    learned_map = {nm.bank_name.strip().lower(): nm.tenant_id for nm in name_mappings}

    # Create transaction records
    matched_count = 0
    unmatched_count = 0
    skipped_count = 0
    payment_transactions = []

    for trans_data in transactions_data:
        # Deduplication: skip if this transaction already exists in the DB
        ref_num = trans_data.get('reference_number', '')
        # Only use reference number as a dedup key if it's meaningful (> 4 chars).
        # Short/generic values like "1", "0", "null" appear on checks and cash deposits
        # and repeat across different transactions — using them would wrongly skip real entries.
        use_ref_num = ref_num and len(str(ref_num).strip()) > 4
        if use_ref_num:
            # Primary: deduplicate by reference number (אסמכתא)
            existing = db.query(Transaction).join(
                BankStatement, Transaction.statement_id == BankStatement.id
            ).filter(
                Transaction.reference_number == ref_num,
                BankStatement.building_id == building_id
            ).first()
        else:
            # Fallback: deduplicate by date + amount + description
            credit_val = trans_data.get('credit_amount')
            credit_filter = (
                Transaction.credit_amount.is_(None)
                if credit_val is None
                else Transaction.credit_amount == credit_val
            )
            existing = db.query(Transaction).join(
                BankStatement, Transaction.statement_id == BankStatement.id
            ).filter(
                Transaction.activity_date == trans_data['activity_date'],
                credit_filter,
                Transaction.description == trans_data['description'],
                BankStatement.building_id == building_id
            ).first()
        if existing:
            # Only skip truly confirmed transactions (matched + approved by user).
            # Unmatched/unconfirmed duplicates are skipped from re-insertion too,
            # but they will surface in the building-wide unmatched review.
            if existing.is_confirmed or existing.matched_tenant_id:
                skipped_count += 1
                continue
            # Unmatched duplicate: skip inserting but don't count as skipped
            # (it will appear in the building-wide unmatched review)
            continue

        payer_name = trans_data.get('payer_name') or ''

        # Create transaction
        transaction = Transaction(
            statement_id=bank_statement.id,
            activity_date=trans_data['activity_date'],
            reference_number=trans_data['reference_number'],
            description=trans_data['description'],
            payer_name=payer_name or None,
            credit_amount=trans_data['credit_amount'],
            debit_amount=trans_data['debit_amount'],
            balance=trans_data['balance'],
            transaction_type=TransactionType(trans_data['transaction_type'])
        )

        # Try to match if auto_match enabled and it's a payment
        if auto_match and trans_data['transaction_type'] == 'payment' and payer_name:
            description = trans_data.get('description', '')

            # 1. Learned match: check against previously confirmed NameMappings first
            if not _is_check_or_cash(description):
                learned_tid = learned_map.get(payer_name.strip().lower())
                if learned_tid:
                    transaction.matched_tenant_id = learned_tid
                    transaction.match_confidence = 1.0
                    transaction.match_method = MatchMethod.LEARNED
                    transaction.is_confirmed = True
                    matched_count += 1
                    db.add(transaction)
                    db.flush()  # need transaction.id before creating allocation
                    allocation_service.upsert_single_tenant_allocation(
                        db=db,
                        transaction=transaction,
                        tenant_id=learned_tid,
                        period_month=metadata.get('period_month'),
                        period_year=metadata.get('period_year'),
                    )
                    if trans_data['transaction_type'] == 'payment':
                        payment_transactions.append(trans_data)
                    continue  # skip fuzzy matching

            # 2. Fuzzy matching
            tenant_id, confidence, method = matcher.match_transaction_to_tenants(
                payer_name=payer_name,
                tenants=tenants_dict,
                actual_amount=trans_data['credit_amount']
            )

            if tenant_id:
                transaction.matched_tenant_id = UUID(tenant_id)
                transaction.match_confidence = confidence
                # Safe fallback: new engine methods (token_based, family_name) may not
                # be in the MatchMethod enum yet — map unknown methods to FUZZY
                try:
                    transaction.match_method = MatchMethod(method)
                except ValueError:
                    transaction.match_method = MatchMethod.FUZZY
                # Auto-confirm high confidence matches
                is_auto_confirmed = confidence >= 0.9
                transaction.is_confirmed = is_auto_confirmed
                matched_count += 1

                # Mirror the match into transaction_allocations (PR-2 invariant)
                db.add(transaction)
                db.flush()  # so transaction.id is populated
                allocation_service.upsert_single_tenant_allocation(
                    db=db,
                    transaction=transaction,
                    tenant_id=UUID(tenant_id),
                    period_month=metadata.get('period_month'),
                    period_year=metadata.get('period_year'),
                )

                # Save to NameMapping when auto-confirming a high-confidence fuzzy match
                if is_auto_confirmed and not _is_check_or_cash(description):
                    existing_mapping = db.query(NameMapping).filter(
                        NameMapping.building_id == building_id,
                        NameMapping.bank_name == payer_name,
                    ).first()
                    if not existing_mapping:
                        db.add(NameMapping(
                            building_id=building_id,
                            bank_name=payer_name,
                            tenant_id=UUID(tenant_id),
                            created_by=MappingCreatedBy.AUTO,
                        ))
                        # Also update learned_map so subsequent transactions in this upload benefit
                        learned_map[payer_name.strip().lower()] = UUID(tenant_id)
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
        "skipped_duplicates": skipped_count,
        "match_rate": f"{(matched_count / len(payment_transactions) * 100):.1f}%" if payment_transactions else "N/A"
    }


@router.get("/{statement_id}/review")
def get_statement_review(
    statement_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer_plus),
):
    """
    Get a grouped review of all transactions in a statement.
    Returns matched, unmatched (with engine suggestions), and irrelevant transactions.
    Used to power the post-upload review modal.
    """
    statement = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
    if not statement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank statement with id {statement_id} not found"
        )

    # Load transactions for this statement (matched + irrelevant)
    statement_transactions = db.query(Transaction).filter(
        Transaction.statement_id == statement_id
    ).order_by(Transaction.activity_date).all()

    # Load ALL unmatched payment transactions for the building (across all statements).
    # This ensures previously uploaded but unmatched transactions are always surfaced.
    all_unmatched_transactions = (
        db.query(Transaction)
        .join(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            BankStatement.building_id == statement.building_id,
            Transaction.matched_tenant_id == None,
            Transaction.transaction_type == TransactionType.PAYMENT,
        )
        .order_by(Transaction.activity_date)
        .all()
    )

    # Load active tenants for suggestion engine
    tenants = db.query(Tenant).join(Apartment).filter(
        Apartment.building_id == statement.building_id,
        Tenant.is_active == True
    ).all()
    tenants_dict = [
        {'id': str(t.id), 'name': t.name, 'full_name': t.full_name or t.name}
        for t in tenants
    ]

    # Tenant lookup by id for matched group
    tenant_map = {str(t.id): t.name for t in tenants}

    matcher = NameMatchingEngine(confidence_threshold=0.7)
    parser = BankStatementParser()

    matched = []
    unmatched = []
    irrelevant = []

    # Process current statement for matched + irrelevant
    for t in statement_transactions:
        # Prefer stored payer_name (correctly extracted during upload for all formats)
        # Fall back to on-the-fly extraction from description for older transactions
        payer_name = t.payer_name or parser._extract_payer_name(t.description) or ''
        base = {
            'id': str(t.id),
            'activity_date': t.activity_date.isoformat(),
            'description': t.description,
            'payer_name': payer_name,
            'credit_amount': float(t.credit_amount) if t.credit_amount else None,
            'debit_amount': float(t.debit_amount) if t.debit_amount else None,
            'transaction_type': t.transaction_type.value if t.transaction_type else 'other',
        }

        if t.transaction_type and t.transaction_type.value != 'payment':
            irrelevant.append(base)
        elif t.matched_tenant_id:
            # Surface allocations so PR-3's UI can render splits without a
            # second round-trip. In PR-2 each matched transaction has at most
            # one allocation (the PR-2 invariant), so this is usually a 1-item
            # list — but emitting it as a list keeps the response shape stable
            # for PR-3.
            allocations_payload = [
                {
                    'id': str(a.id),
                    'tenant_id': str(a.tenant_id) if a.tenant_id else None,
                    'tenant_name': tenant_map.get(str(a.tenant_id), '') if a.tenant_id else None,
                    'label': a.label,
                    'amount': float(a.amount) if a.amount is not None else None,
                    'period_month': a.period_month,
                    'period_year': a.period_year,
                    'category': a.category,
                }
                for a in (t.allocations or [])
            ]
            matched.append({
                **base,
                'tenant_id': str(t.matched_tenant_id),
                'tenant_name': tenant_map.get(str(t.matched_tenant_id), ''),
                'match_confidence': t.match_confidence,
                'match_method': t.match_method.value if t.match_method else None,
                'is_confirmed': t.is_confirmed,
                'allocations': allocations_payload,
            })
        # Unmatched from the current statement will be included via all_unmatched_transactions below

    # Build unmatched list from ALL building-wide unmatched payment transactions
    seen_ids = {t['id'] for t in matched}  # avoid double-counting if statement overlaps
    for t in all_unmatched_transactions:
        if str(t.id) in seen_ids:
            continue
        payer_name = t.payer_name or parser._extract_payer_name(t.description) or ''
        suggestions = []
        if payer_name and tenants_dict:
            raw_suggestions = matcher.suggest_matches(payer_name, tenants_dict, top_n=3)
            suggestions = [
                {'tenant_id': s[0], 'tenant_name': s[2], 'score': round(s[1], 2)}
                for s in raw_suggestions
            ]
        unmatched.append({
            'id': str(t.id),
            'activity_date': t.activity_date.isoformat(),
            'description': t.description,
            'payer_name': payer_name,
            'credit_amount': float(t.credit_amount) if t.credit_amount else None,
            'debit_amount': float(t.debit_amount) if t.debit_amount else None,
            'transaction_type': t.transaction_type.value if t.transaction_type else 'other',
            'suggestions': suggestions,
        })

    # All tenants list (for manual selection dropdown in UI)
    all_tenants = [
        {'tenant_id': str(t.id), 'tenant_name': t.name}
        for t in tenants
    ]

    return {
        'statement_id': str(statement_id),
        'period': f"{statement.period_month}/{statement.period_year}",
        'matched': matched,
        'unmatched': unmatched,
        'irrelevant': irrelevant,
        'all_tenants': all_tenants,
    }


@router.get("/{statement_id}/transactions")
def get_statement_transactions(
    statement_id: UUID,
    include_matched: bool = True,
    include_unmatched: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer_plus),
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
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
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

    # Keep transaction_allocations in sync — replace any existing rows with a
    # single allocation pointing at this tenant for the full amount.
    allocation_service.upsert_single_tenant_allocation(
        db=db,
        transaction=transaction,
        tenant_id=tenant_id,
    )

    # If remember is True, create a name mapping for future use
    if remember:
        # Use stored payer_name (correctly extracted at upload time for all formats)
        # Fall back to on-the-fly extraction for older transactions without stored payer_name
        parser = BankStatementParser()
        payer_name = transaction.payer_name or parser._extract_payer_name(transaction.description)

        if payer_name and not _is_check_or_cash(transaction.description):
            # Get building_id from statement
            statement = db.query(BankStatement).filter(
                BankStatement.id == transaction.statement_id
            ).first()

            if statement:
                # Check if mapping already exists for this payer (regardless of tenant)
                # Update if tenant changed, otherwise skip
                existing_mapping = db.query(NameMapping).filter(
                    NameMapping.building_id == statement.building_id,
                    NameMapping.bank_name == payer_name,
                ).first()

                if not existing_mapping:
                    name_mapping = NameMapping(
                        building_id=statement.building_id,
                        bank_name=payer_name,
                        tenant_id=tenant_id,
                        created_by=MappingCreatedBy.MANUAL
                    )
                    db.add(name_mapping)
                elif existing_mapping.tenant_id != tenant_id:
                    # Update to new tenant if the mapping changed
                    existing_mapping.tenant_id = tenant_id
                    existing_mapping.created_by = MappingCreatedBy.MANUAL

    db.commit()
    db.refresh(transaction)

    return {
        "message": "Transaction matched successfully",
        "transaction_id": str(transaction.id),
        "tenant_id": str(tenant_id),
        "remember": remember
    }


@router.post("/transactions/{transaction_id}/unmatch")
def unmatch_transaction(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """Remove a match from a transaction, sending it back to the unmatched pool."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {transaction_id} not found"
        )

    transaction.matched_tenant_id = None
    transaction.match_confidence = None
    transaction.match_method = None
    transaction.is_confirmed = False
    # Drop any allocations attached to this transaction
    allocation_service.clear_for_transaction(db, transaction.id)

    db.commit()
    return {"ok": True, "transaction_id": str(transaction_id)}


@router.post("/transactions/{transaction_id}/ignore")
def ignore_transaction(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """
    Mark a transaction as irrelevant (e.g., a fee or a non-tenant deposit).
    Clears any existing match and flips transaction_type to OTHER so it falls
    into the 'irrelevant' bucket of the review UI.
    """
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {transaction_id} not found"
        )

    transaction.matched_tenant_id = None
    transaction.match_confidence = None
    transaction.match_method = None
    transaction.is_confirmed = False
    transaction.transaction_type = TransactionType.OTHER
    # Drop allocations — an "ignored" transaction allocates to nothing
    allocation_service.clear_for_transaction(db, transaction.id)

    db.commit()
    return {"ok": True, "transaction_id": str(transaction_id)}


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_worker_plus),
):
    """
    Hard-delete a transaction from the building.
    Used by the review UI when the user wants to remove an entry entirely
    (e.g., the bank exported a duplicate or a clearly-erroneous row).
    Returns 204 No Content — frontend must not parse a JSON body.
    """
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {transaction_id} not found"
        )

    db.delete(transaction)
    db.commit()
    return None


@router.get("/{building_id}/statements")
def list_building_statements(
    building_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer_plus),
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
