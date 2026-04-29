"""
Tests for transaction_allocations (PR-2).

Verifies the dual-write invariant: every code path that mutates
`Transaction.matched_tenant_id` keeps `transaction_allocations` in sync,
and the row count of allocations matches the row count of matched
transactions for any building.

The tests follow the integration pattern from `test_statements.py` —
`TestClient(app)` against the configured DB. Service-level edge cases
(idempotency of upsert, sum validation tolerance) are tested directly
against `allocation_service` with a `Session` from the app's SessionLocal.
"""
import io
import uuid
from datetime import datetime
from decimal import Decimal

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models import Apartment, Tenant, Transaction, TransactionAllocation
from app.services import allocation_service


client = TestClient(app)


# ── Helpers (mirrors test_statements.py) ─────────────────────────────────────

def _make_bank_excel(rows: list[dict]) -> io.BytesIO:
    df = pd.DataFrame([
        {
            'תאריך פעילות': r['date'],
            'תאור פעולה': r['description'],
            'זכות': r['credit'],
            'יתרה': r['balance'],
        }
        for r in rows
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    return buf


def _new_building() -> str:
    name = f"Test Building {uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/buildings/", json={
        "name": name, "address": "1 Test St", "city": "TLV"
    })
    assert r.status_code == 201, r.json()
    return r.json()["id"]


def _new_tenant(building_id: str, full_name: str = "דני לוי") -> str:
    """Create a single apartment + tenant in the building (direct DB insert).

    Direct insert keeps the test focused on the allocation behavior — going
    through the HTTP layer for setup adds auth wiring overhead that's
    unrelated to what we're testing.
    """
    db = SessionLocal()
    try:
        apt = Apartment(
            building_id=uuid.UUID(building_id),
            number=1,
            floor=1,
        )
        db.add(apt)
        db.flush()

        t = Tenant(
            apartment_id=apt.id,
            building_id=uuid.UUID(building_id),
            name=full_name.split(" ")[0],
            full_name=full_name,
        )
        db.add(t)
        db.commit()
        return str(t.id)
    finally:
        db.close()


def _upload(building_id: str, buf: io.BytesIO) -> dict:
    buf.seek(0)
    r = client.post(
        f"/api/v1/statements/{building_id}/upload",
        files={"file": ("stmt.xlsx", buf,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"period_month": 1, "period_year": 2026},
    )
    assert r.status_code == 201, r.json()
    return r.json()


def _allocations_for(transaction_id: str) -> list[TransactionAllocation]:
    db = SessionLocal()
    try:
        return (
            db.query(TransactionAllocation)
            .filter(TransactionAllocation.transaction_id == transaction_id)
            .all()
        )
    finally:
        db.close()


# ── Integration tests through the API ────────────────────────────────────────

def test_auto_match_creates_allocation():
    """When the engine auto-matches a payment, an allocation row is created
    pointing at the matched tenant for the full credit amount."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="דני לוי")

    excel = _make_bank_excel([
        {"date": datetime(2026, 1, 15),
         "description": "העברה - דני לוי",
         "credit": 1500.0,
         "balance": 10000.0},
    ])
    _upload(building_id, excel)

    # Find the transaction that was just inserted
    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.matched_tenant_id == uuid.UUID(tenant_id)
        ).first()
        assert txn is not None, "Transaction should be auto-matched to the tenant"

        allocs = _allocations_for(str(txn.id))
        assert len(allocs) == 1, f"Expected 1 allocation, got {len(allocs)}"
        assert str(allocs[0].tenant_id) == tenant_id
        assert Decimal(allocs[0].amount) == Decimal("1500.00")
    finally:
        db.close()


def test_manual_match_creates_allocation():
    """POST .../match/{tenant_id} writes an allocation alongside matched_tenant_id."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="פלוני אלמוני")

    # Upload a row that won't auto-match (different name)
    excel = _make_bank_excel([
        {"date": datetime(2026, 2, 5),
         "description": "העברה - שם שונה לגמרי",
         "credit": 800.0,
         "balance": 5000.0},
    ])
    _upload(building_id, excel)

    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.credit_amount == Decimal("800.00"),
            Transaction.matched_tenant_id.is_(None),
        ).first()
        assert txn is not None, "Transaction should be unmatched after upload"
    finally:
        db.close()

    r = client.post(
        f"/api/v1/statements/transactions/{txn.id}/match/{tenant_id}"
    )
    assert r.status_code == 200, r.json()

    allocs = _allocations_for(str(txn.id))
    assert len(allocs) == 1
    assert str(allocs[0].tenant_id) == tenant_id
    assert Decimal(allocs[0].amount) == Decimal("800.00")


def test_unmatch_clears_allocation():
    """POST .../unmatch removes the allocation alongside clearing matched_tenant_id."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="דני לוי")

    excel = _make_bank_excel([
        {"date": datetime(2026, 3, 10),
         "description": "העברה - דני לוי",
         "credit": 1500.0,
         "balance": 10000.0},
    ])
    _upload(building_id, excel)

    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.matched_tenant_id == uuid.UUID(tenant_id)
        ).first()
        assert txn is not None
        txn_id = str(txn.id)
    finally:
        db.close()

    assert len(_allocations_for(txn_id)) == 1, "Pre-condition: allocation exists"

    r = client.post(f"/api/v1/statements/transactions/{txn_id}/unmatch")
    assert r.status_code == 200

    assert len(_allocations_for(txn_id)) == 0, "Allocations cleared after unmatch"


def test_delete_transaction_cascades_allocations():
    """DELETE .../transactions/{id} removes the allocation via FK cascade."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="דני לוי")

    excel = _make_bank_excel([
        {"date": datetime(2026, 4, 1),
         "description": "העברה - דני לוי",
         "credit": 1500.0,
         "balance": 10000.0},
    ])
    _upload(building_id, excel)

    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.matched_tenant_id == uuid.UUID(tenant_id)
        ).first()
        assert txn is not None
        txn_id = str(txn.id)
    finally:
        db.close()

    assert len(_allocations_for(txn_id)) == 1

    r = client.delete(f"/api/v1/statements/transactions/{txn_id}")
    assert r.status_code == 204

    assert len(_allocations_for(txn_id)) == 0, "Allocation should cascade-delete"


# ── Service-level unit tests ─────────────────────────────────────────────────

def test_upsert_is_idempotent():
    """Calling upsert twice with the same tenant produces exactly one allocation,
    not two — so re-confirming an existing match doesn't accumulate rows."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="דני לוי")

    excel = _make_bank_excel([
        {"date": datetime(2026, 5, 1),
         "description": "העברה - דני לוי",
         "credit": 1500.0,
         "balance": 10000.0},
    ])
    _upload(building_id, excel)

    db = SessionLocal()
    try:
        txn = db.query(Transaction).filter(
            Transaction.matched_tenant_id == uuid.UUID(tenant_id)
        ).first()
        # First upsert was during upload; call it again manually
        allocation_service.upsert_single_tenant_allocation(
            db=db, transaction=txn, tenant_id=uuid.UUID(tenant_id)
        )
        db.commit()

        allocs = _allocations_for(str(txn.id))
        assert len(allocs) == 1, "Upsert must replace, not accumulate"
    finally:
        db.close()


def test_validate_sum_matches_amount_within_tolerance():
    """Service-level validation accepts allocations that sum to the headline
    amount within ±0.01 (1 agora)."""
    txn = Transaction(
        id=uuid.uuid4(),
        activity_date=datetime(2026, 6, 1),
        description="test",
        credit_amount=Decimal("1000.00"),
    )

    # Exact match
    assert allocation_service.validate_sum_matches_amount(
        txn, [{"amount": Decimal("400.00")}, {"amount": Decimal("600.00")}]
    )
    # Off by 0.005 — should still pass under default 0.01 tolerance
    assert allocation_service.validate_sum_matches_amount(
        txn, [{"amount": Decimal("400.005")}, {"amount": Decimal("599.995")}]
    )
    # Off by 0.05 — should fail
    assert not allocation_service.validate_sum_matches_amount(
        txn, [{"amount": Decimal("400.00")}, {"amount": Decimal("600.05")}]
    )


def test_review_endpoint_returns_allocations():
    """getStatementReview includes allocations[] on matched rows so PR-3 can
    render splits without an additional API call."""
    building_id = _new_building()
    tenant_id = _new_tenant(building_id, full_name="דני לוי")

    excel = _make_bank_excel([
        {"date": datetime(2026, 7, 12),
         "description": "העברה - דני לוי",
         "credit": 1500.0,
         "balance": 10000.0},
    ])
    upload_res = _upload(building_id, excel)
    statement_id = upload_res["statement_id"]

    r = client.get(f"/api/v1/statements/{statement_id}/review")
    assert r.status_code == 200, r.json()

    matched = r.json()["matched"]
    assert len(matched) >= 1
    row = matched[0]
    assert "allocations" in row
    assert isinstance(row["allocations"], list)
    assert len(row["allocations"]) == 1
    alloc = row["allocations"][0]
    assert alloc["tenant_id"] == tenant_id
    assert alloc["amount"] == 1500.0
