# Buildings Page Upgrade — Design Document

**Date:** 2026-02-26
**Status:** Approved

---

## Goal

Upgrade the Buildings page with: add building button, address search, city/payment status/size filters, computed expected payment sum per building, global period selector, and payment status (paid count + collection bar) on each building card.

---

## Features

### 1. Add Building
- `BuildingEditModal` becomes dual-mode: `building=null` → create mode ("הוסף בניין"), `building!=null` → edit mode ("ערוך בניין")
- Create mode calls `buildingsAPI.create()` instead of `buildingsAPI.update()`
- "+ הוסף בניין" button added to the header banner
- Empty state "הוסף בניין ראשון" button wired up (currently broken)

### 2. Search + Filters Bar
Appears between header and grid. All filtering is **client-side** — no extra API calls.

- **Text search**: filters by building name or address (case-insensitive substring)
- **City dropdown**: derived from loaded buildings list — `[...new Set(buildings.map(b => b.city))]`
- **Payment status chips**: `הכל | שילמו הכל | חלקי | לא שילמו`
  - "שילמו הכל" = `collection_rate == 100%`
  - "חלקי" = `0% < collection_rate < 100%`
  - "לא שילמו" = `collection_rate == 0%` (and has tenants)
  - Disabled/greyed if bulk-summary not yet loaded
- **Size chips**: `הכל | קטן (1–5) | בינוני (6–15) | גדול (16+)` based on `total_tenants`

### 3. Expected Payment = Computed Sum of Active Tenants

`_building_with_live_count()` in `backend/app/routers/buildings.py` gains a second sub-query:

```sql
SELECT COALESCE(SUM(
  CASE WHEN a.expected_payment IS NOT NULL THEN a.expected_payment
       ELSE b.expected_monthly_payment
  END
), 0)
FROM tenants t
JOIN apartments a ON t.apartment_id = a.id
WHERE a.building_id = :building_id AND t.is_active = true
```

Returned as `total_expected_monthly` (new field). The existing `expected_monthly_payment` (the per-tenant default) stays unchanged. The card shows `total_expected_monthly` instead.

### 4. Period Selector + Payment Status on Cards

**Period selector**: month/year dropdowns added to the header banner (same UI as Dashboard). Default = current month/year.

**New backend endpoint**: `GET /api/v1/payments/bulk-summary?month=X&year=Y`
Returns an array (one entry per building that has data):
```json
[
  {
    "building_id": "...",
    "paid": 8,
    "unpaid": 3,
    "total_tenants": 11,
    "collection_rate": 72.7,
    "total_collected": 5500.0
  }
]
```
Implemented as a single efficient query using `GROUP BY building_id` — no N+1.

**Card payment status section** (new bottom area above the CTA button):
- `✅ 8 שילמו  ❌ 3 לא שילמו`
- Colored progress bar: green fill = collection%, width proportional
- Shows "אין נתונים לתקופה זו" if building has no data for the selected period

---

## Architecture

### Backend changes
| File | Change |
|------|--------|
| `backend/app/routers/buildings.py` | Add `total_expected_monthly` to `_building_with_live_count()` |
| `backend/app/routers/payments.py` | Add `GET /bulk-summary` endpoint |

### Frontend changes
| File | Change |
|------|--------|
| `frontend/src/components/modals/BuildingEditModal.tsx` | Dual-mode: create + edit |
| `frontend/src/services/api.ts` | Add `buildingsAPI.create()`, `paymentsAPI.getBulkSummary()` |
| `frontend/src/types/index.ts` | Add `total_expected_monthly` to `Building`; add `BuildingPaymentSummary` interface |
| `frontend/src/pages/Buildings.tsx` | Period selector, search/filter bar, wire up add button, pass summary to cards |
| `frontend/src/pages/Buildings.tsx` (BuildingCard) | Add payment status section to card |

---

## Data Flow

```
Buildings page mounts
  → GET /api/v1/buildings            (buildings list with total_expected_monthly)
  → GET /api/v1/payments/bulk-summary?month=2&year=2026

User changes month/year
  → only bulk-summary refetches (buildings list stays cached)

User types in search / clicks filter chip
  → client-side filter only, no API call

User clicks "+ הוסף בניין"
  → BuildingEditModal opens in create mode
  → on save: POST /api/v1/buildings → invalidate buildings query

User clicks "ערוך" on card
  → BuildingEditModal opens in edit mode (existing behavior)
```

---

## Types

```typescript
// Add to Building interface:
total_expected_monthly?: number;  // computed sum of active tenant expected payments

// New interface:
export interface BuildingPaymentSummary {
  building_id: string;
  paid: number;
  unpaid: number;
  total_tenants: number;
  collection_rate: number;       // 0-100
  total_collected: number;
}
```
