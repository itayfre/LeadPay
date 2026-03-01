# Excel Dedup Fallback (No Reference Number) — Design

**Date:** 2026-03-01

## Problem

The current Excel deduplication only works for rows that have an אסמכתא (`reference_number`). Rows without one — which can occur in some Israeli bank export formats — are inserted unconditionally on every upload. Re-uploading the same file or uploading overlapping statement periods (e.g. Jan 1–31 and Dec 15–Jan 15) will insert duplicate transactions for those rows.

## Solution

Extend the existing dedup block in `backend/app/routers/statements.py` with a fallback path: when `reference_number` is empty, check for an existing transaction in the same building that matches on `(activity_date, credit_amount, description)`.

This composite key is reliable because:
- `description` is the raw Hebrew bank text (e.g. `"העברה - גיא מן"`), which is byte-for-byte identical across re-exports of the same statement
- `activity_date` + `credit_amount` + `description` together are practically unique for any real payment

## Scope

- **One file changed:** `backend/app/routers/statements.py`
- **No migration** — uses existing columns, no new indexes or constraints required
- **No frontend changes** — `skipped_duplicates` in the response already covers both dedup paths
- **No new endpoints**

## Implementation

Replace the current dedup block:

```python
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

With the extended version:

```python
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

**Edge case:** If `credit_amount` is `None`, the SQL `= NULL` comparison will not match anything — so the fallback silently passes through and the row is inserted normally. This is acceptable; in practice the Excel parser filters out fees and transfers, so all processed rows have a `credit_amount`.

## Testing

- Test: row with no `reference_number` is skipped on re-upload (same date, amount, description)
- Test: row with no `reference_number` from a different building is NOT skipped
- Test: row with no `reference_number` but different amount is NOT skipped
- Existing 26 tests must continue to pass
