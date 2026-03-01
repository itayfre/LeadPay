# Excel Dedup Fallback (No Reference Number) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an Excel row has no אסמכתא (reference_number is empty), fall back to deduplicating by `activity_date + credit_amount + description` scoped to the same building.

**Architecture:** One `else` branch added to the existing dedup block in `backend/app/routers/statements.py`. The `if ref_num:` path stays unchanged; the new `else:` path queries by composite (date, amount, description, building). Tests live in a new `backend/tests/test_statements.py` file following the pandas + BytesIO + TestClient pattern from `test_tenants.py`.

**Tech Stack:** FastAPI, SQLAlchemy — pytest, pandas, openpyxl

---

### Task 1: Write 3 failing tests

**Files:**
- Create: `backend/tests/test_statements.py`

**Context:**
- Excel parser column names (Hebrew → internal): `תאריך פעילות` → activity_date, `אסמכתא` → reference, `תאור פעולה` → description, `זכות` → credit (incoming), `חובה` → debit (outgoing), `יתרה` → balance
- Rows **without** the `אסמכתא` column produce `reference_number = ''` (falsy) — this is the path we're testing
- Parser filters out rows with `debit > 0` (transfers) — test rows must have `credit > 0`
- Dates can be `datetime` objects — the parser accepts them directly
- Building creation: `POST /api/v1/buildings/` with `{"name": "...", "address": "...", "city": "..."}`
- Statement upload: `POST /api/v1/statements/{building_id}/upload` with multipart `file` + form fields `period_month` / `period_year`
- Response contains `skipped_duplicates: int`

**Step 1: Create the test file with the helper and 3 tests**

Create `backend/tests/test_statements.py` with this exact content:

```python
"""Tests for Excel statement upload deduplication (fallback by date+amount+description)."""
import io
import uuid
from datetime import datetime

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_bank_excel(rows: list[dict]) -> io.BytesIO:
    """
    Build a minimal bank-statement Excel that the parser accepts.

    Each row dict has:
        date        datetime  — activity date
        description str       — Hebrew bank text (e.g. 'העברה - דני לוי')
        credit      float     — incoming amount (must be > 0 so parser marks as 'payment')
        balance     float     — account balance after transaction

    The אסמכתא (reference) column is intentionally omitted so the parser
    sets reference_number = '' for every row, exercising the fallback dedup path.
    """
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
    """Create a unique building and return its ID."""
    name = f"Test Building {uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/buildings/", json={
        "name": name, "address": "1 Test St", "city": "TLV"
    })
    assert r.status_code == 201, r.json()
    return r.json()["id"]


def _upload(building_id: str, buf: io.BytesIO) -> dict:
    buf.seek(0)
    r = client.post(
        f"/api/v1/statements/{building_id}/upload",
        files={"file": ("stmt.xlsx", buf,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"period_month": 1, "period_year": 2026},
    )
    assert r.status_code == 200, r.json()
    return r.json()


# ---------------------------------------------------------------------------
# Test 1: same file re-uploaded → rows without ref_num are skipped
# ---------------------------------------------------------------------------

def test_dedup_fallback_skips_on_reupload():
    """Rows with no reference_number are skipped on re-upload by date+amount+description."""
    building_id = _new_building()
    rows = [
        {"date": datetime(2026, 1, 15), "description": "העברה - דני לוי",
         "credit": 1500.0, "balance": 10000.0},
    ]
    excel = _make_bank_excel(rows)

    r1 = _upload(building_id, excel)
    assert r1["skipped_duplicates"] == 0, "First upload should insert, not skip"

    r2 = _upload(building_id, excel)
    assert r2["skipped_duplicates"] == 1, "Second upload should skip the duplicate row"


# ---------------------------------------------------------------------------
# Test 2: same row uploaded to a DIFFERENT building → NOT skipped
# ---------------------------------------------------------------------------

def test_dedup_fallback_different_building_not_skipped():
    """Same row (no ref_num) uploaded to a different building is NOT skipped."""
    building_a = _new_building()
    building_b = _new_building()

    rows = [
        {"date": datetime(2026, 1, 20), "description": "העברה - משה כהן",
         "credit": 2000.0, "balance": 5000.0},
    ]
    excel = _make_bank_excel(rows)

    _upload(building_a, excel)

    r = _upload(building_b, excel)
    assert r["skipped_duplicates"] == 0, \
        "Row in a different building should not be considered a duplicate"


# ---------------------------------------------------------------------------
# Test 3: same date + description but DIFFERENT amount → NOT skipped
# ---------------------------------------------------------------------------

def test_dedup_fallback_different_amount_not_skipped():
    """Row with same date+description but different credit_amount is NOT skipped."""
    building_id = _new_building()

    row_a = [{"date": datetime(2026, 1, 10), "description": "העברה - רות ברק",
              "credit": 1000.0, "balance": 8000.0}]
    row_b = [{"date": datetime(2026, 1, 10), "description": "העברה - רות ברק",
              "credit": 1200.0, "balance": 8000.0}]

    _upload(building_id, _make_bank_excel(row_a))

    r = _upload(building_id, _make_bank_excel(row_b))
    assert r["skipped_duplicates"] == 0, \
        "Row with a different amount should not be considered a duplicate"
```

**Step 2: Run the 3 new tests to confirm they fail**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/test_statements.py -v 2>&1 | tail -20
```

Expected: `test_dedup_fallback_skips_on_reupload` FAILS (skipped_duplicates is 0 on the second upload because the else branch doesn't exist yet). The other two tests may pass or fail — that's fine.

---

### Task 2: Implement the fallback dedup and make all tests pass

**Files:**
- Modify: `backend/app/routers/statements.py` (the dedup block, lines ~99–113)

**Context:**
The current dedup block looks like this (line numbers approximate):

```python
        # Deduplication: skip if this reference_number already exists in the DB
        ref_num = trans_data.get('reference_number', '')
        if ref_num:
            existing = db.query(Transaction).join(
                BankStatement, Transaction.statement_id == BankStatement.id
            ).filter(
                Transaction.reference_number == ref_num,
                BankStatement.building_id == building_id
            ).first()
            if existing:
                skipped_count += 1
                continue
```

The `if existing:` block is currently INSIDE the `if ref_num:` block. We need to restructure so that `if existing:` covers BOTH branches.

**Step 1: Replace the dedup block**

Use the Edit tool to replace the entire current dedup block (from `ref_num = ...` through the inner `continue`) with:

```python
        # Deduplication: skip if this transaction already exists in the DB
        ref_num = trans_data.get('reference_number', '')
        if ref_num:
            # Primary: deduplicate by reference number (אסמכתא)
            existing = db.query(Transaction).join(
                BankStatement, Transaction.statement_id == BankStatement.id
            ).filter(
                Transaction.reference_number == ref_num,
                BankStatement.building_id == building_id
            ).first()
        else:
            # Fallback: deduplicate by date + amount + description
            existing = db.query(Transaction).join(
                BankStatement, Transaction.statement_id == BankStatement.id
            ).filter(
                Transaction.activity_date == trans_data['activity_date'],
                Transaction.credit_amount == trans_data.get('credit_amount'),
                Transaction.description == trans_data['description'],
                BankStatement.building_id == building_id
            ).first()
        if existing:
            skipped_count += 1
            continue
```

**Step 2: Run the 3 new tests to confirm they all pass**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/test_statements.py -v 2>&1 | tail -15
```

Expected: all 3 PASS.

**Step 3: Run the full test suite to confirm no regressions**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 29 passed (26 original + 3 new).

**Step 4: Commit**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/statements.py backend/tests/test_statements.py && git commit -m "feat: fallback dedup by date+amount+description for transactions without אסמכתא"
```

**Step 5: Push**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git push origin master
```

---

### Review Checklist

- [ ] `test_dedup_fallback_skips_on_reupload` passes — same file re-uploaded skips the row
- [ ] `test_dedup_fallback_different_building_not_skipped` passes — different building not affected
- [ ] `test_dedup_fallback_different_amount_not_skipped` passes — different amount is not skipped
- [ ] 29 total tests pass (0 regressions)
- [ ] The `if ref_num:` primary path still works unchanged
- [ ] The `else:` fallback only runs when `ref_num` is empty
