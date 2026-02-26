# Dashboard Payment Status Upgrades — Design Doc

**Date:** 2026-02-26
**Status:** Approved

---

## Goal

Upgrade the building payment status page (Dashboard.tsx) with 8 improvements: editable language + expected payment columns, manual payment entry, column sorting, payment history popup, WhatsApp emoji fix, move_in_date on tenants, and auto-calculated cumulative debt column.

---

## Data Model Changes

### 1. `Tenant.move_in_date`
- New `Date` column, `nullable=False`, server default `2026-01-01`
- Alembic migration: ADD COLUMN with server_default `'2026-01-01'`, then backfill existing rows
- Used as the debt calculation start date
- Editable on Tenants page via `PUT /api/v1/tenants/{tenant_id}`

### 2. `Transaction.is_manual` + nullable `statement_id`
- Add `is_manual: bool = False` (nullable=False, server_default=false)
- Make `statement_id` nullable (currently NOT NULL)
- Alembic migration: alter column + add column
- Manual transactions: `is_manual=True`, `statement_id=None`, `transaction_type=PAYMENT`

---

## Backend Changes

### Modified: `GET /api/v1/payments/{building_id}/status`
Add to each tenant row in response:
- `apartment_id: str` — needed for expected payment PATCH
- `move_in_date: str` — ISO date string
- `total_debt: float` — sum of max(0, expected − paid) for all months from move_in_date to current month

### New: `POST /api/v1/payments/manual`
```
Body: {
  building_id: str,
  tenant_id: str,
  apartment_id: str,
  amount: float,
  month: int,
  year: int,
  note: str | null
}
Creates Transaction(
  is_manual=True,
  statement_id=None,
  credit_amount=amount,
  matched_tenant_id=tenant_id,
  transaction_type=TransactionType.PAYMENT,
  description=f"תשלום ידני{' - ' + note if note else ''}",
  transaction_date=date(year, month, 1)
)
Invalidates payment status for that building/period.
Returns: { transaction_id, tenant_id, amount, month, year, is_manual: true }
```

### New: `GET /api/v1/payments/tenant/{tenant_id}/history`
```
Query params: none (returns all history from move_in_date to current month)
Returns: {
  tenant_id: str,
  tenant_name: str,
  move_in_date: str,
  months: [
    {
      month: int,
      year: int,
      period: str,          // "01/2026"
      expected: float,
      paid: float,
      difference: float,    // paid - expected (negative = debt)
      status: "paid" | "partial" | "unpaid",
      transactions: [
        {
          id: str,
          date: str,
          amount: float,
          description: str,
          is_manual: bool
        }
      ]
    }
  ]
}
```
Route must be placed BEFORE `/{building_id}/...` wildcard routes.

---

## Frontend Changes

### Dashboard.tsx — Table Columns

**New columns:**

| Column | Position | Behavior |
|--------|----------|----------|
| שפה (Language) | After tenant name | Badge `עב`/`EN`. Click toggles he↔en, calls `PUT /tenants/{id}` immediately. Optimistic update. |
| חוב כולל (Total Debt) | After paid amount | Red if > 0, gray if 0. Shows `₪{debt.toLocaleString()}`. |

**Modified columns:**

| Column | Change |
|--------|--------|
| סכום צפוי (Expected) | Click → inline number input. Save: `PATCH /apartments/{apartment_id}`. Cancel on Escape. |
| סכום ששולם (Paid) | Click → "סמן כשולם" modal. Modal: amount field (pre-filled with expected), optional note, confirm/cancel. `POST /payments/manual`. |

**Column sorting:**
- All column headers are clickable
- State: `{ column: string, direction: 'asc' | 'desc' }`
- Default: apartment number ascending
- Header shows `▲` / `▼` icon next to active sort column
- Client-side sort (no new API calls)

**Payment history popup:**
- Trigger: click on apartment number cell OR tenant name cell
- Modal: full-width, max-w-5xl
- Layout: two panels side by side
  - Left panel: month-by-month table (period | expected | paid | diff | status) — scrollable
  - Right panel: transactions for selected month (date | amount | description | manual badge)
  - Clicking a month row on left updates right panel
  - Selected month highlighted
- Data: `GET /api/v1/payments/tenant/{tenant_id}/history`
- Loading/empty states handled

### Tenants.tsx — Table Changes

**New `move_in_date` column:**
- Shows date as `DD/MM/YYYY`
- Inline editable: click → date input → confirm/cancel
- Saves via `PUT /api/v1/tenants/{tenant_id}`
- Never empty (defaults to `01/01/2026`)

**New `חוב כולל` column:**
- Auto-calculated, same source as Dashboard debt
- Display only (not editable)

### WhatsApp Fix

**Location:** Find where the `wa.me` link is constructed (likely in Dashboard.tsx or messages service).

**Fix:** Ensure message text is encoded with `encodeURIComponent()`:
```typescript
// Before (broken):
`https://wa.me/${phone}?text=${message}`

// After (correct):
`https://wa.me/${phone}?text=${encodeURIComponent(message)}`
```

---

## Types (frontend/src/types/index.ts)

```typescript
// Extend PaymentStatus:
export interface PaymentStatus {
  // ... existing fields ...
  apartment_id: string;         // NEW — for PATCH expected payment
  move_in_date: string;         // NEW — ISO date
  total_debt: number;           // NEW — cumulative debt
}

// New: TenantPaymentHistoryMonth
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

export interface TenantTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  is_manual: boolean;
}

export interface TenantPaymentHistory {
  tenant_id: string;
  tenant_name: string;
  move_in_date: string;
  months: TenantPaymentHistoryMonth[];
}
```

---

## API Client (frontend/src/services/api.ts)

```typescript
// paymentsAPI additions:
postManualPayment: (data: { building_id, tenant_id, apartment_id, amount, month, year, note? }) =>
  fetchAPI('/api/v1/payments/manual', { method: 'POST', body: JSON.stringify(data) }),

getTenantHistory: (tenantId: string) =>
  fetchAPI<TenantPaymentHistory>(`/api/v1/payments/tenant/${tenantId}/history`),
```

---

## Alembic Migrations

Two migrations (one per model change):
1. `add_move_in_date_to_tenants` — ADD COLUMN date NOT NULL DEFAULT '2026-01-01'
2. `add_manual_payment_support` — ADD COLUMN is_manual bool NOT NULL DEFAULT false; ALTER COLUMN statement_id DROP NOT NULL

---

## Implementation Order

1. Alembic migrations (both)
2. Backend: extend payment status response (apartment_id, move_in_date, total_debt)
3. Backend: POST /payments/manual
4. Backend: GET /payments/tenant/{id}/history
5. Frontend: types + api.ts additions
6. Frontend: WhatsApp encoding fix (quick)
7. Frontend: Dashboard — language column (editable)
8. Frontend: Dashboard — expected payment inline edit
9. Frontend: Dashboard — manual payment modal
10. Frontend: Dashboard — column sorting
11. Frontend: Dashboard — payment history popup
12. Frontend: Tenants — move_in_date column (editable)
13. Frontend: Tenants — debt column (display)
