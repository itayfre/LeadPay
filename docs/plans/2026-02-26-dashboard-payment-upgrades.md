# Dashboard Payment Status Upgrades Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add language/debt columns, inline editing, manual payment entry, column sorting, payment history popup, WhatsApp emoji fix, and tenant move_in_date to the Dashboard and Tenants pages.

**Architecture:** Two DB migrations first (Tenant.move_in_date, Transaction.is_manual + nullable statement_id), then backend endpoints (extend /status, add /manual and /tenant/history), then frontend features built on top. All filtering/sorting is client-side. Debt is calculated on-the-fly in the backend.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest — React 18, TypeScript, TanStack Query, Tailwind CSS v3

---

### Task 1: Migration — Add `move_in_date` to Tenant

**Files:**
- Modify: `backend/app/models/tenant.py`
- Create: `backend/alembic/versions/<auto>_add_move_in_date_to_tenants.py`

**Step 1: Add the column to the model**

In `backend/app/models/tenant.py`, add this import at the top:
```python
from datetime import datetime, date
```
(replace existing `from datetime import datetime` if present)

Add the column after `is_active`:
```python
    move_in_date = Column(
        Date,
        nullable=False,
        server_default='2026-01-01',
        comment="Debt calculation start date"
    )
```

Also add `Date` to the SQLAlchemy import:
```python
from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Enum as SQLEnum
```

**Step 2: Generate migration**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && alembic revision --autogenerate -m "add_move_in_date_to_tenants" 2>&1 | tail -5
```
Expected: `Generating .../versions/XXXX_add_move_in_date_to_tenants.py`

**Step 3: Verify the generated migration**

Open the new migration file. Confirm `upgrade()` contains:
```python
op.add_column('tenants', sa.Column('move_in_date', sa.Date(), server_default='2026-01-01', nullable=False))
```
If it says `nullable=True`, manually change to `nullable=False` and add `server_default='2026-01-01'`.

**Step 4: Run migration**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && alembic upgrade head 2>&1 | tail -5
```
Expected: no errors

**Step 5: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```
Expected: all pass

**Step 6: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/models/tenant.py backend/alembic/versions/ && git commit -m "feat: add move_in_date to Tenant model (default 2026-01-01)"
```

---

### Task 2: Migration — `Transaction.is_manual` + nullable `statement_id`

**Files:**
- Modify: `backend/app/models/transaction.py`
- Create: `backend/alembic/versions/<auto>_add_manual_payment_support.py`

**Step 1: Update the Transaction model**

In `backend/app/models/transaction.py`, make two changes:

Change `statement_id` to nullable:
```python
    statement_id = Column(UUID(as_uuid=True), ForeignKey("bank_statements.id"), nullable=True)
```

Add `is_manual` after `is_confirmed`:
```python
    is_manual = Column(Boolean, default=False, nullable=False, server_default='false',
                       comment="True if entered manually (not from bank statement)")
```

**Step 2: Generate migration**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && alembic revision --autogenerate -m "add_manual_payment_support" 2>&1 | tail -5
```

**Step 3: Verify the migration**

Open the new file. It should contain:
```python
# in upgrade():
op.add_column('transactions', sa.Column('is_manual', sa.Boolean(), server_default='false', nullable=False))
op.alter_column('transactions', 'statement_id', existing_type=..., nullable=True)
```

**Step 4: Run migration**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && alembic upgrade head 2>&1 | tail -5
```

**Step 5: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 6: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/models/transaction.py backend/alembic/versions/ && git commit -m "feat: add is_manual flag and nullable statement_id to Transaction"
```

---

### Task 3: Tenant Schemas — Add `move_in_date`

**Files:**
- Modify: `backend/app/schemas/tenant.py`

**Step 1: Update schemas**

In `backend/app/schemas/tenant.py`, add `date` to imports:
```python
from datetime import datetime, date
```

Add to `TenantUpdate`:
```python
    move_in_date: Optional[date] = None
```

Add to `TenantResponse`:
```python
    move_in_date: date
```

**Step 2: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 3: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/schemas/tenant.py && git commit -m "feat: add move_in_date to TenantUpdate and TenantResponse schemas"
```

---

### Task 4: Fix WhatsApp URL Encoding

**Files:**
- Modify: `backend/app/services/whatsapp_service.py`

**Step 1: Read the file**
```bash
cat "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend/app/services/whatsapp_service.py"
```

**Step 2: Find `create_whatsapp_link`**

Locate the method that builds the `wa.me` URL. It probably looks like:
```python
def create_whatsapp_link(self, phone_number: str, message: str) -> str:
    clean_phone = phone_number.replace('+', '').replace(' ', '')
    return f"https://wa.me/{clean_phone}?text={message}"
```

**Step 3: Fix the encoding**

Add `from urllib.parse import quote` at the top of the file if not present.

Replace the link construction with:
```python
def create_whatsapp_link(self, phone_number: str, message: str) -> str:
    clean_phone = phone_number.replace('+', '').replace(' ', '')
    encoded_message = quote(message, safe='')
    return f"https://wa.me/{clean_phone}?text={encoded_message}"
```

The `safe=''` ensures ALL characters including emojis (🏠💰📅) are percent-encoded so WhatsApp renders them correctly.

**Step 4: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 5: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/services/whatsapp_service.py && git commit -m "fix: URL-encode WhatsApp message so emojis render correctly"
```

---

### Task 5: Backend — Extend Payment Status Response

**Files:**
- Modify: `backend/app/routers/payments.py` — `get_payment_status()` function

**Step 1: Read the full function** (lines 113–248)

**Step 2: Add debt helper function**

Add this function BEFORE `get_payment_status` in `payments.py`:

```python
def _calculate_tenant_debt(
    tenant: Tenant,
    apartment: Apartment,
    building: Building,
    db: Session,
    up_to_month: int,
    up_to_year: int
) -> float:
    """
    Calculate cumulative debt from tenant.move_in_date to (up_to_month, up_to_year) inclusive.
    Debt per month = max(0, expected - paid).
    """
    from datetime import date
    move_in = tenant.move_in_date  # always set (default 2026-01-01)
    expected_monthly = float(apartment.expected_payment or building.expected_monthly_payment or 0)
    if expected_monthly == 0:
        return 0.0

    # Build list of months [move_in .. up_to]
    months = []
    y, m = move_in.year, move_in.month
    while (y, m) <= (up_to_year, up_to_month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    if not months:
        return 0.0

    # Get all paid amounts by (year, month) for this tenant using outerjoin
    # (handles both bank-statement transactions and is_manual=True transactions)
    from sqlalchemy import extract, and_, or_
    rows = (
        db.query(
            func.coalesce(
                BankStatement.period_year,
                func.cast(func.extract('year', Transaction.activity_date), db.bind.dialect.Integer if hasattr(db.bind, 'dialect') else type(None))
            ).label('yr'),
            func.coalesce(
                BankStatement.period_month,
                func.cast(func.extract('month', Transaction.activity_date), type(None))
            ).label('mo'),
            func.sum(Transaction.credit_amount).label('paid')
        )
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.matched_tenant_id == tenant.id,
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.credit_amount != None,
        )
        .group_by('yr', 'mo')
        .all()
    )
    paid_map = {(int(r.yr), int(r.mo)): float(r.paid or 0) for r in rows if r.yr and r.mo}

    total_debt = sum(
        max(0.0, expected_monthly - paid_map.get((y, m), 0.0))
        for y, m in months
    )
    return round(total_debt, 2)
```

**Note:** The coalesce/cast approach above is complex. Use this simpler version instead that avoids SQLAlchemy type casting issues:

```python
def _calculate_tenant_debt(
    tenant,
    apartment,
    building,
    db: Session,
    up_to_month: int,
    up_to_year: int
) -> float:
    """Cumulative debt from move_in_date to up_to_month/year inclusive."""
    from datetime import date
    move_in = tenant.move_in_date
    expected_monthly = float(apartment.expected_payment or building.expected_monthly_payment or 0)
    if expected_monthly == 0:
        return 0.0

    # All months from move_in to up_to
    months = []
    y, m = move_in.year, move_in.month
    while (y, m) <= (up_to_year, up_to_month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    if not months:
        return 0.0

    # Get all matched payments for this tenant (bank-statement + manual)
    all_transactions = (
        db.query(Transaction, BankStatement)
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.matched_tenant_id == tenant.id,
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.credit_amount != None,
        )
        .all()
    )

    # Build paid_map: (year, month) -> total paid
    paid_map: dict = {}
    for txn, stmt in all_transactions:
        if stmt is not None:
            key = (stmt.period_year, stmt.period_month)
        else:
            # manual transaction: derive month from activity_date
            key = (txn.activity_date.year, txn.activity_date.month)
        paid_map[key] = paid_map.get(key, 0.0) + float(txn.credit_amount or 0)

    total_debt = sum(
        max(0.0, expected_monthly - paid_map.get((y, m), 0.0))
        for y, m in months
    )
    return round(total_debt, 2)
```

**Step 3: Update the transaction query in `get_payment_status`**

Find the current query (around line 169):
```python
    transactions = db.query(Transaction).join(BankStatement).filter(
        BankStatement.building_id == building_id,
        BankStatement.period_month == month,
        BankStatement.period_year == year,
        Transaction.transaction_type == TransactionType.PAYMENT
    ).all()
```

Replace with (outerjoin to include manual transactions):
```python
    # Get transactions: both from bank statements AND manual (is_manual=True)
    tenant_ids_in_building = [t.id for t, _ in tenants_query]
    from sqlalchemy import or_, and_
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
```

**Step 4: Update the `tenant_statuses.append(...)` dict**

Add these three fields to the dict:
```python
            "apartment_id": str(apartment.id),
            "move_in_date": tenant.move_in_date.isoformat(),
            "total_debt": _calculate_tenant_debt(tenant, apartment, building, db, month, year),
```

**Step 5: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 6: Smoke test** (with backend already running on port 8000, or use port 8001)
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && uvicorn app.main:app --port 8001 --log-level error &
sleep 3
# Replace BUILDING_ID with a real one from your DB
curl -s "http://localhost:8001/api/v1/payments/<BUILDING_ID>/status" | python3 -c "
import json, sys
d = json.load(sys.stdin)
t = d['tenants'][0] if d.get('tenants') else None
if t:
    print('apartment_id:', 'apartment_id' in t)
    print('move_in_date:', 'move_in_date' in t)
    print('total_debt:', 'total_debt' in t)
else:
    print('no tenants')
"
kill %1 2>/dev/null || true
```

**Step 7: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/payments.py && git commit -m "feat: add apartment_id, move_in_date, total_debt to payment status response"
```

---

### Task 6: Backend — `POST /api/v1/payments/manual`

**Files:**
- Modify: `backend/app/routers/payments.py`

**Step 1: Write failing test**

Add to `backend/tests/test_payments.py` (create if missing):
```python
def test_manual_payment_creates_transaction(client, building_id, tenant_id):
    """POST /payments/manual creates an is_manual transaction."""
    now = datetime.now()
    resp = client.post("/api/v1/payments/manual", json={
        "building_id": str(building_id),
        "tenant_id": str(tenant_id),
        "amount": 500.0,
        "month": now.month,
        "year": now.year,
        "note": "cash payment"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_manual"] is True
    assert float(data["amount"]) == 500.0
```

**Step 2: Run test — expect failure**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -v -k "manual_payment" 2>&1 | tail -10
```

**Step 3: Implement the endpoint**

Add this endpoint to `payments.py` BEFORE `@router.get("/{building_id}/status")`:

```python
@router.post("/manual")
def create_manual_payment(
    building_id: str,
    tenant_id: str,
    amount: float,
    month: int,
    year: int,
    note: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Record a manual payment for a tenant (cash, bank transfer outside normal matching).
    Creates a Transaction with is_manual=True and no bank statement parent.
    """
    from datetime import date
    from pydantic import BaseModel

    # Validate tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant {tenant_id} not found")

    # Validate amount
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Build description
    description = f"תשלום ידני"
    if note:
        description += f" - {note}"

    # Create transaction (no statement_id — is_manual=True)
    txn = Transaction(
        statement_id=None,
        activity_date=date(year, month, 1),
        description=description,
        credit_amount=amount,
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
        "month": month,
        "year": year,
        "description": description,
        "is_manual": True,
    }
```

Note: The endpoint uses individual query params, not a body model. To use a JSON body instead, replace the function signature with a Pydantic model approach:

```python
from pydantic import BaseModel

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
    # use payload.tenant_id, payload.amount, etc.
```

Use the Pydantic model approach (cleaner for the frontend).

**Step 4: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 5: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/payments.py backend/tests/ && git commit -m "feat: add POST /payments/manual endpoint for manual payment entry"
```

---

### Task 7: Backend — `GET /api/v1/payments/tenant/{tenant_id}/history`

**Files:**
- Modify: `backend/app/routers/payments.py`

**Context:** This endpoint returns month-by-month payment history for a single tenant, from their move_in_date to current month. Each month entry includes: period info, expected/paid/diff/status, and the raw transactions for that month. No existing endpoint does this.

**Step 1: Write failing test**
```python
def test_tenant_history_returns_months(client, tenant_id):
    """GET /payments/tenant/{id}/history returns month-by-month data."""
    resp = client.get(f"/api/v1/payments/tenant/{tenant_id}/history")
    assert resp.status_code == 200
    data = resp.json()
    assert "tenant_id" in data
    assert "months" in data
    assert isinstance(data["months"], list)
    # Each month has required fields
    for month in data["months"]:
        assert "month" in month
        assert "year" in month
        assert "expected" in month
        assert "paid" in month
        assert "status" in month
        assert "transactions" in month
```

**Step 2: Run test — expect failure**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -v -k "tenant_history" 2>&1 | tail -10
```

**Step 3: Implement the endpoint**

Add to `payments.py` BEFORE `@router.get("/{building_id}/status")` (critical: must be before any `/{...}` wildcard):

```python
@router.get("/tenant/{tenant_id}/history")
def get_tenant_payment_history(
    tenant_id: UUID,
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
    building = db.query(Building).filter(Building.id == apartment.building_id).first()

    expected_monthly = float(apartment.expected_payment or building.expected_monthly_payment or 0)
    move_in = tenant.move_in_date
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

    # Get ALL transactions for this tenant (bank + manual)
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
            key = (txn.activity_date.year, txn.activity_date.month)
        if key not in txns_by_month:
            txns_by_month[key] = []
        txns_by_month[key].append({
            "id": str(txn.id),
            "date": txn.activity_date.date().isoformat() if hasattr(txn.activity_date, 'date') else str(txn.activity_date)[:10],
            "amount": float(txn.credit_amount or 0),
            "description": txn.description,
            "is_manual": txn.is_manual,
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
```

**Step 4: Run tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 5: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/payments.py backend/tests/ && git commit -m "feat: add GET /payments/tenant/{id}/history endpoint"
```

---

### Task 8: Frontend — Update Types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Extend `PaymentStatus` interface**

Find the `PaymentStatus` interface and add three new fields:
```typescript
export interface PaymentStatus {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  floor: number;
  expected_amount: number;
  paid_amount: number;
  difference: number;
  status: 'paid' | 'unpaid';
  is_overpaid: boolean;
  is_underpaid: boolean;
  phone?: string;
  language: 'he' | 'en';
  // NEW:
  apartment_id: string;
  move_in_date: string;   // ISO date "2026-01-01"
  total_debt: number;
}
```

**Step 2: Add new interfaces after `PaymentStatusResponse`**

```typescript
export interface TenantTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  is_manual: boolean;
}

export interface TenantPaymentHistoryMonth {
  month: number;
  year: number;
  period: string;
  expected: number;
  paid: number;
  difference: number;
  status: 'paid' | 'partial' | 'unpaid';
  transactions: TenantTransaction[];
}

export interface TenantPaymentHistory {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  move_in_date: string;
  months: TenantPaymentHistoryMonth[];
}

export interface ManualPaymentRequest {
  building_id: string;
  tenant_id: string;
  amount: number;
  month: number;
  year: number;
  note?: string;
}
```

**Step 3: Add `move_in_date` to `Tenant` interface**

Find `Tenant` interface and add:
```typescript
  move_in_date?: string;   // ISO date, default "2026-01-01"
```

**Step 4: Build check**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
```

**Step 5: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/types/index.ts && git commit -m "feat: add PaymentStatus new fields and TenantPaymentHistory types"
```

---

### Task 9: Frontend — Update API Client

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: Add new imports**

At the top of `api.ts`, add `TenantPaymentHistory` and `ManualPaymentRequest` to the import:
```typescript
import type { Building, BuildingPaymentSummary, Tenant, PaymentStatusResponse, WhatsAppMessage, BankStatement, Transaction, TenantPaymentHistory, ManualPaymentRequest } from '../types';
```

**Step 2: Add to `paymentsAPI`**

```typescript
  postManualPayment: (data: ManualPaymentRequest) =>
    fetchAPI<{ transaction_id: string; amount: number; is_manual: boolean }>(
      '/api/v1/payments/manual',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getTenantHistory: (tenantId: string) =>
    fetchAPI<TenantPaymentHistory>(`/api/v1/payments/tenant/${tenantId}/history`),
```

**Step 3: Add `move_in_date` to `tenantsAPI.update`**

The `tenantsAPI.update` already accepts `Partial<Tenant>`, so `move_in_date` will pass through automatically. No change needed.

**Step 4: Build check**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
```

**Step 5: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/services/api.ts && git commit -m "feat: add postManualPayment and getTenantHistory to API client"
```

---

### Task 10: Frontend — Dashboard: Language Column (Editable)

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Context:** Add a language column after the tenant name column. Clicking the badge (עב/EN) toggles between `he` and `en` and immediately PATCHes the tenant via `tenantsAPI.update`.

**Step 1: Add imports and state to Dashboard**

At the top of `Dashboard.tsx`, add:
```typescript
import { useQueryClient } from '@tanstack/react-query';
import { tenantsAPI } from '../services/api';
```

Inside `Dashboard()`, add:
```typescript
const queryClient = useQueryClient();
const [togglingLanguage, setTogglingLanguage] = useState<string | null>(null);
```

**Step 2: Add `handleToggleLanguage` handler**

```typescript
const handleToggleLanguage = async (payment: PaymentStatus) => {
  if (togglingLanguage === payment.tenant_id) return;
  setTogglingLanguage(payment.tenant_id);
  const newLang = payment.language === 'he' ? 'en' : 'he';
  try {
    await tenantsAPI.update(payment.tenant_id, { language: newLang as any });
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId, selectedMonth, selectedYear] });
  } catch (err) {
    console.error('Failed to update language:', err);
  } finally {
    setTogglingLanguage(null);
  }
};
```

**Step 3: Add column header**

In the `<thead>` section, after the tenant name `<th>`, add:
```tsx
<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
  שפה
</th>
```

**Step 4: Add column cell**

In the `<tbody>` rows, after the tenant name `<td>`, add:
```tsx
<td className="px-6 py-4 whitespace-nowrap">
  <button
    onClick={() => handleToggleLanguage(payment)}
    disabled={togglingLanguage === payment.tenant_id}
    className={`inline-flex px-2 py-0.5 text-xs rounded font-medium transition-colors cursor-pointer
      ${payment.language === 'he'
        ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } disabled:opacity-50`}
    title="לחץ לשינוי שפה"
  >
    {togglingLanguage === payment.tenant_id ? '...' : payment.language === 'he' ? 'עב' : 'EN'}
  </button>
</td>
```

**Step 5: Build check**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
```

**Step 6: Commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Dashboard.tsx && git commit -m "feat: add editable language column to Dashboard payment table"
```

---

### Task 11: Frontend — Dashboard: Expected Payment Inline Edit

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Context:** The expected amount cell becomes editable on click. Save via `PATCH /apartments/{apartment_id}`. Same pattern as Tenants page.

**Step 1: Add state**

```typescript
import { apartmentsAPI } from '../services/api';
// ... inside Dashboard():
const [editingExpectedId, setEditingExpectedId] = useState<string | null>(null);
const [editingExpectedValue, setEditingExpectedValue] = useState<string>('');
const [savingExpected, setSavingExpected] = useState(false);
```

**Step 2: Add save handler**

```typescript
const handleSaveExpected = async (payment: PaymentStatus) => {
  setSavingExpected(true);
  try {
    const val = editingExpectedValue === '' ? null : parseFloat(editingExpectedValue);
    await apartmentsAPI.patch(payment.apartment_id, { expected_payment: val });
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId, selectedMonth, selectedYear] });
    setEditingExpectedId(null);
  } catch (err) {
    console.error(err);
  } finally {
    setSavingExpected(false);
  }
};
```

**Step 3: Replace the expected amount cell**

Find:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  ₪{payment.expected_amount.toLocaleString()}
</td>
```

Replace with:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm">
  {editingExpectedId === payment.tenant_id ? (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={editingExpectedValue}
        onChange={e => setEditingExpectedValue(e.target.value)}
        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') handleSaveExpected(payment);
          if (e.key === 'Escape') setEditingExpectedId(null);
        }}
      />
      <button onClick={() => handleSaveExpected(payment)} disabled={savingExpected}
        className="text-green-600 hover:text-green-800 text-xs font-bold px-1">✓</button>
      <button onClick={() => setEditingExpectedId(null)}
        className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
    </div>
  ) : (
    <button
      onClick={() => {
        setEditingExpectedId(payment.tenant_id);
        setEditingExpectedValue(payment.expected_amount.toString());
      }}
      className="text-gray-900 hover:text-blue-600 hover:underline cursor-pointer font-medium"
      title="לחץ לעריכה"
    >
      ₪{payment.expected_amount.toLocaleString()}
    </button>
  )}
</td>
```

**Step 4: Build check + commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Dashboard.tsx && git commit -m "feat: inline editable expected payment in Dashboard"
```

---

### Task 12: Frontend — Dashboard: Manual Payment Modal

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Context:** Clicking the paid amount cell opens a modal where the user enters an amount and optional note. On confirm, calls `POST /payments/manual` and refreshes.

**Step 1: Add state**

```typescript
const [manualPaymentFor, setManualPaymentFor] = useState<PaymentStatus | null>(null);
const [manualAmount, setManualAmount] = useState<string>('');
const [manualNote, setManualNote] = useState<string>('');
const [savingManual, setSavingManual] = useState(false);
```

**Step 2: Add handler**

```typescript
const handleManualPayment = async () => {
  if (!manualPaymentFor || !buildingId) return;
  setSavingManual(true);
  try {
    await paymentsAPI.postManualPayment({
      building_id: buildingId,
      tenant_id: manualPaymentFor.tenant_id,
      amount: parseFloat(manualAmount),
      month: selectedMonth,
      year: selectedYear,
      note: manualNote || undefined,
    });
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId, selectedMonth, selectedYear] });
    setManualPaymentFor(null);
    setManualAmount('');
    setManualNote('');
  } catch (err) {
    console.error(err);
  } finally {
    setSavingManual(false);
  }
};
```

**Step 3: Make paid amount cell clickable**

Find the paid amount `<td>`:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  ₪{payment.paid_amount.toLocaleString()}
</td>
```

Replace with:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm">
  <button
    onClick={() => {
      setManualPaymentFor(payment);
      setManualAmount(payment.expected_amount.toString());
      setManualNote('');
    }}
    className="text-gray-900 hover:text-green-600 hover:underline cursor-pointer"
    title="לחץ להזנת תשלום ידני"
  >
    ₪{payment.paid_amount.toLocaleString()}
  </button>
</td>
```

**Step 4: Add the manual payment modal to JSX**

Add this before the closing `</Layout>`:

```tsx
{/* Manual Payment Modal */}
{manualPaymentFor && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
      <h3 className="text-lg font-bold text-gray-900">סמן כשולם — {manualPaymentFor.tenant_name}</h3>
      <p className="text-sm text-gray-500">דירה {manualPaymentFor.apartment_number} • {selectedMonth:02}/{selectedYear}</p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
        <input
          type="number"
          value={manualAmount}
          onChange={e => setManualAmount(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          placeholder="500"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">הערה (אופציונלי)</label>
        <input
          type="text"
          value={manualNote}
          onChange={e => setManualNote(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          placeholder="תשלום במזומן"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setManualPaymentFor(null)}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          ביטול
        </button>
        <button
          onClick={handleManualPayment}
          disabled={!manualAmount || savingManual}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
        >
          {savingManual ? 'שומר...' : '✓ אשר תשלום'}
        </button>
      </div>
    </div>
  </div>
)}
```

Note: Fix the template string for the period label — use JS:
```tsx
<p className="text-sm text-gray-500">דירה {manualPaymentFor.apartment_number} • {String(selectedMonth).padStart(2,'0')}/{selectedYear}</p>
```

**Step 5: Build check + commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Dashboard.tsx && git commit -m "feat: manual payment modal in Dashboard (POST /payments/manual)"
```

---

### Task 13: Frontend — Dashboard: Column Sorting

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Add sort state**

```typescript
const [sortColumn, setSortColumn] = useState<string>('apartment_number');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
```

**Step 2: Add sort toggle handler**

```typescript
const handleSort = (column: string) => {
  if (sortColumn === column) {
    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
  } else {
    setSortColumn(column);
    setSortDirection('asc');
  }
};
```

**Step 3: Add sorted tenants derived value**

After `const summary = ...`, add:
```typescript
const sortedTenants = [...(paymentStatus?.tenants || [])].sort((a, b) => {
  const dir = sortDirection === 'asc' ? 1 : -1;
  const aVal = (a as any)[sortColumn];
  const bVal = (b as any)[sortColumn];
  if (typeof aVal === 'number') return (aVal - bVal) * dir;
  return String(aVal || '').localeCompare(String(bVal || ''), 'he') * dir;
});
```

**Step 4: Add sort icon helper**

```typescript
const SortIcon = ({ column }: { column: string }) => (
  <span className={`ml-1 text-xs ${sortColumn === column ? 'text-blue-600' : 'text-gray-300'}`}>
    {sortColumn === column ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
  </span>
);
```

**Step 5: Make all `<th>` elements clickable**

Replace the header cells with clickable versions. For each column, wrap the text in a `<button>`:
```tsx
<th onClick={() => handleSort('apartment_number')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  {t('payment.apartment')}<SortIcon column="apartment_number" />
</th>
<th onClick={() => handleSort('tenant_name')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  {t('payment.tenant')}<SortIcon column="tenant_name" />
</th>
<th onClick={() => handleSort('expected_amount')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  {t('payment.expected')}<SortIcon column="expected_amount" />
</th>
<th onClick={() => handleSort('paid_amount')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  {t('payment.paid')}<SortIcon column="paid_amount" />
</th>
<th onClick={() => handleSort('total_debt')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  חוב כולל<SortIcon column="total_debt" />
</th>
<th onClick={() => handleSort('status')}
  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
  {t('payment.status')}<SortIcon column="status" />
</th>
<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
  שפה
</th>
<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
  {t('payment.actions')}
</th>
```

**Step 6: Replace `paymentStatus.tenants.map(` with `sortedTenants.map(`**

Find:
```tsx
{paymentStatus?.tenants && paymentStatus.tenants.length > 0 ? (
  paymentStatus.tenants.map((payment) => (
```

Replace with:
```tsx
{sortedTenants.length > 0 ? (
  sortedTenants.map((payment) => (
```

**Step 7: Add debt column cell**

After the paid amount cell, add:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
  <span className={payment.total_debt > 0 ? 'text-red-600' : 'text-gray-400'}>
    {payment.total_debt > 0 ? `₪${Math.round(payment.total_debt).toLocaleString()}` : '—'}
  </span>
</td>
```

**Step 8: Build check + commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Dashboard.tsx && git commit -m "feat: column sorting and debt column in Dashboard"
```

---

### Task 14: Frontend — Dashboard: Payment History Popup

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Context:** Clicking the apartment number cell or tenant name cell opens a modal with two panels side-by-side: left = month-by-month table, right = transactions for the selected month.

**Step 1: Add state and query**

```typescript
const [historyTenantId, setHistoryTenantId] = useState<string | null>(null);
const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<number | null>(null);

const { data: tenantHistory, isLoading: historyLoading } = useQuery({
  queryKey: ['tenantHistory', historyTenantId],
  queryFn: () => paymentsAPI.getTenantHistory(historyTenantId!),
  enabled: !!historyTenantId,
});
```

**Step 2: Make apartment_number and tenant_name cells clickable**

Replace the apartment_number cell:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 cursor-pointer hover:underline"
  onClick={() => { setHistoryTenantId(payment.tenant_id); setSelectedHistoryMonth(null); }}>
  {payment.apartment_number}
</td>
```

Replace the tenant_name cell:
```tsx
<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:text-blue-600"
  onClick={() => { setHistoryTenantId(payment.tenant_id); setSelectedHistoryMonth(null); }}>
  {payment.tenant_name}
</td>
```

**Step 3: Add the history modal component (inside Dashboard.tsx)**

Add this component at the bottom of `Dashboard.tsx` (outside the main component):

```tsx
interface PaymentHistoryModalProps {
  tenantHistory: import('../types').TenantPaymentHistory | undefined;
  isLoading: boolean;
  selectedMonth: number | null;
  onSelectMonth: (m: number) => void;
  onClose: () => void;
}

function PaymentHistoryModal({ tenantHistory, isLoading, selectedMonth, onSelectMonth, onClose }: PaymentHistoryModalProps) {
  const selectedMonthData = tenantHistory?.months.find(m => m.month === selectedMonth) ?? tenantHistory?.months[tenantHistory.months.length - 1];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              היסטוריית תשלומים — {tenantHistory?.tenant_name}
            </h3>
            <p className="text-sm text-gray-500">דירה {tenantHistory?.apartment_number} • מאז {tenantHistory?.move_in_date}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : !tenantHistory ? (
          <div className="flex-1 flex items-center justify-center p-12 text-gray-400">אין נתונים</div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Month-by-month table */}
            <div className="w-1/2 overflow-y-auto border-r border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">תקופה</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">צפוי</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">שולם</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">הפרש</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...tenantHistory.months].reverse().map(m => (
                    <tr
                      key={`${m.year}-${m.month}`}
                      onClick={() => onSelectMonth(m.month)}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                        selectedMonthData?.month === m.month && selectedMonthData?.year === m.year
                          ? 'bg-blue-50 font-medium' : ''
                      }`}
                    >
                      <td className="px-4 py-2 text-gray-700">{m.period}</td>
                      <td className="px-4 py-2 text-gray-600">₪{m.expected.toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-900">₪{m.paid.toLocaleString()}</td>
                      <td className={`px-4 py-2 ${m.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {m.difference >= 0 ? '+' : ''}₪{m.difference.toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          m.status === 'paid' ? 'bg-green-100 text-green-700' :
                          m.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {m.status === 'paid' ? '✅ שולם' : m.status === 'partial' ? '⚠️ חלקי' : '❌ לא שולם'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right: Transactions for selected month */}
            <div className="w-1/2 overflow-y-auto p-4">
              {selectedMonthData ? (
                <>
                  <h4 className="font-semibold text-gray-700 mb-3">עסקאות — {selectedMonthData.period}</h4>
                  {selectedMonthData.transactions.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">אין עסקאות לתקופה זו</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedMonthData.transactions.map(txn => (
                        <div key={txn.id} className="border border-gray-200 rounded-lg p-3 space-y-1">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-green-700">₪{txn.amount.toLocaleString()}</span>
                            <span className="text-xs text-gray-400">{txn.date}</span>
                          </div>
                          <p className="text-sm text-gray-600 truncate">{txn.description}</p>
                          {txn.is_manual && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">ידני</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">בחר חודש מהרשימה</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Add modal to Dashboard JSX**

Before closing `</Layout>`, add:
```tsx
{/* Payment History Modal */}
{historyTenantId && (
  <PaymentHistoryModal
    tenantHistory={tenantHistory}
    isLoading={historyLoading}
    selectedMonth={selectedHistoryMonth}
    onSelectMonth={setSelectedHistoryMonth}
    onClose={() => { setHistoryTenantId(null); setSelectedHistoryMonth(null); }}
  />
)}
```

**Step 5: Build check + commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Dashboard.tsx && git commit -m "feat: payment history popup modal in Dashboard"
```

---

### Task 15: Frontend — Tenants: move_in_date Column (Editable)

**Files:**
- Modify: `frontend/src/pages/Tenants.tsx`

**Step 1: Add state for editing move_in_date**

In `Tenants.tsx`, inside the component:
```typescript
const [editingMoveInId, setEditingMoveInId] = useState<string | null>(null);
const [editingMoveInValue, setEditingMoveInValue] = useState<string>('');
const [savingMoveIn, setSavingMoveIn] = useState(false);
```

**Step 2: Add save handler**

```typescript
const handleSaveMoveIn = async (tenant: Tenant) => {
  setSavingMoveIn(true);
  try {
    await tenantsAPI.update(tenant.id, { move_in_date: editingMoveInValue });
    invalidate();
    setEditingMoveInId(null);
  } catch (err) {
    console.error(err);
  } finally {
    setSavingMoveIn(false);
  }
};
```

**Step 3: Add column header**

In the columns array (current: `['דירה', 'שם', 'סוג בעלות', 'טלפון', 'בנק', 'שפה', 'ה.קבע', 'פעיל', 'תשלום צפוי', 'פעולות']`), add `'תאריך כניסה'` before `'פעולות'`:

```typescript
{['דירה', 'שם', 'סוג בעלות', 'טלפון', 'בנק', 'שפה', 'ה.קבע', 'פעיל', 'תשלום צפוי', 'תאריך כניסה', 'פעולות'].map(col => (
```

**Step 4: Add cell in the row (before the פעולות cell)**

Find the existing 'פעולות' action buttons `<td>` and add a new `<td>` BEFORE it:

```tsx
{/* תאריך כניסה (move_in_date) */}
<td className="px-4 py-3 text-sm">
  {editingMoveInId === tenant.id ? (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={editingMoveInValue}
        onChange={e => setEditingMoveInValue(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') handleSaveMoveIn(tenant);
          if (e.key === 'Escape') setEditingMoveInId(null);
        }}
      />
      <button onClick={() => handleSaveMoveIn(tenant)} disabled={savingMoveIn}
        className="text-green-600 hover:text-green-800 text-xs font-bold px-1">✓</button>
      <button onClick={() => setEditingMoveInId(null)}
        className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
    </div>
  ) : (
    <button
      onClick={() => {
        setEditingMoveInId(tenant.id);
        setEditingMoveInValue(tenant.move_in_date || '2026-01-01');
      }}
      className="text-gray-600 hover:text-blue-600 hover:underline cursor-pointer text-sm"
      title="לחץ לעריכת תאריך כניסה"
    >
      {tenant.move_in_date
        ? new Date(tenant.move_in_date).toLocaleDateString('he-IL')
        : '01/01/2026'}
    </button>
  )}
</td>
```

**Step 5: Build check + commit**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Tenants.tsx && git commit -m "feat: editable move_in_date column in Tenants page"
```

---

### Task 16: Frontend — Tenants: Debt Column (Display)

**Files:**
- Modify: `frontend/src/pages/Tenants.tsx`

**Context:** The debt is not yet available in the `tenantsAPI.list()` response (which returns Tenant objects, not payment status). Options:
- Option A: Add debt to the list_tenants endpoint response (backend change)
- Option B: Fetch bulk payment history per tenant on page load (expensive)
- Option C: Call `GET /payments/tenant/{id}/history` for each tenant and compute debt client-side

**Use Option C** (call history per tenant), but lazily — only compute when user expands a row. For the initial table view, show a "חשב" button that loads debt on demand.

**Step 1: Add state**

```typescript
const [tenantDebts, setTenantDebts] = useState<Record<string, number | 'loading'>>({});
```

**Step 2: Add load-debt handler**

```typescript
const handleLoadDebt = async (tenantId: string) => {
  setTenantDebts(prev => ({ ...prev, [tenantId]: 'loading' }));
  try {
    const history = await paymentsAPI.getTenantHistory(tenantId);
    const debt = history.months.reduce((sum, m) => sum + Math.max(0, m.expected - m.paid), 0);
    setTenantDebts(prev => ({ ...prev, [tenantId]: Math.round(debt) }));
  } catch {
    setTenantDebts(prev => ({ ...prev, [tenantId]: 0 }));
  }
};
```

**Step 3: Add import**

```typescript
import { buildingsAPI, tenantsAPI, apartmentsAPI, paymentsAPI } from '../services/api';
```

**Step 4: Add column header**

Add `'חוב כולל'` to the column list before `'תאריך כניסה'`:
```typescript
{['דירה', 'שם', 'סוג בעלות', 'טלפון', 'בנק', 'שפה', 'ה.קבע', 'פעיל', 'תשלום צפוי', 'חוב כולל', 'תאריך כניסה', 'פעולות'].map(col => (
```

**Step 5: Add debt cell (before move_in_date cell)**

```tsx
{/* חוב כולל */}
<td className="px-4 py-3 text-sm">
  {tenantDebts[tenant.id] === 'loading' ? (
    <span className="text-gray-400 text-xs">טוען...</span>
  ) : typeof tenantDebts[tenant.id] === 'number' ? (
    <span className={tenantDebts[tenant.id] as number > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
      ₪{(tenantDebts[tenant.id] as number).toLocaleString()}
    </span>
  ) : (
    <button
      onClick={() => handleLoadDebt(tenant.id)}
      className="text-xs text-blue-500 hover:text-blue-700 underline"
    >
      חשב
    </button>
  )}
</td>
```

**Step 6: Run all backend tests**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 7: Final frontend build**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
```

**Step 8: Final commit + push**
```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Tenants.tsx && git commit -m "feat: on-demand debt column in Tenants page" && git push origin master
```
