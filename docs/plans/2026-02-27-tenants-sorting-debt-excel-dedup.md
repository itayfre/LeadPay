# Tenants Sorting, Auto Debt, Excel Deduplication — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add column sorting and auto-calculated debt to the Tenants page, and deduplicate Excel imports by אסמכתא (reference_number).

**Architecture:** One new backend endpoint (`GET /{building_id}/tenant-debts`) batch-fetches all tenant debts in a single DB round-trip, reusing the existing `_calculate_tenant_debt_from_map` helper. Excel dedup checks `reference_number` before inserting each transaction. Frontend Tenants page replaces the lazy "חשב" button with a `useQuery` call, and adds sort state + clickable headers.

**Tech Stack:** FastAPI, SQLAlchemy — React 18, TypeScript, TanStack Query, Tailwind CSS v3

---

### Task 1: Backend — `GET /api/v1/payments/{building_id}/tenant-debts`

**Files:**
- Modify: `backend/app/routers/payments.py`

**Context:** The existing `_calculate_tenant_debt_from_map` helper and the batch historical-transaction pattern (in `get_payment_status`) are already in this file. This new endpoint reuses both. Returns `{ tenant_id: total_debt_float }` for all active tenants in one round-trip.

**Step 1: Read the current route list**

```bash
grep -n "@router\." "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend/app/routers/payments.py"
```

Confirm the line number of `@router.get("/{building_id}/status")` — place the new endpoint just before it.

**Step 2: Add the endpoint**

Insert this block BEFORE `@router.get("/{building_id}/status")`:

```python
@router.get("/{building_id}/tenant-debts")
def get_tenant_debts(
    building_id: str,
    db: Session = Depends(get_db)
):
    """
    Return cumulative all-time debt (from move_in_date to today) for every
    active tenant in a building. Single batch DB query — no N+1.
    Returns: { tenant_id: total_debt }
    """
    from datetime import date

    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # All active tenants with apartments
    tenants_query = (
        db.query(Tenant, Apartment)
        .join(Apartment, Tenant.apartment_id == Apartment.id)
        .filter(
            Apartment.building_id == building_id,
            Tenant.is_active == True
        )
        .all()
    )

    if not tenants_query:
        return {}

    tenant_ids = [t.id for t, _ in tenants_query]
    today = date.today()

    # Batch-fetch ALL historical payment transactions for this building's tenants
    all_txns = (
        db.query(Transaction, BankStatement)
        .outerjoin(BankStatement, Transaction.statement_id == BankStatement.id)
        .filter(
            Transaction.matched_tenant_id.in_(tenant_ids),
            Transaction.transaction_type == TransactionType.PAYMENT,
            Transaction.credit_amount != None,
        )
        .all()
    )

    # Group by tenant_id → {(year, month) → total_paid}
    historical = defaultdict(lambda: defaultdict(float))
    for txn, stmt in all_txns:
        if stmt is not None:
            key = (stmt.period_year, stmt.period_month)
        else:
            key = (txn.activity_date.year, txn.activity_date.month)
        historical[str(txn.matched_tenant_id)][key] += float(txn.credit_amount or 0)

    result = {}
    for tenant, apartment in tenants_query:
        result[str(tenant.id)] = _calculate_tenant_debt_from_map(
            tenant, apartment, building,
            dict(historical.get(str(tenant.id), {})),
            today.month, today.year
        )

    return result
```

**Step 3: Run tests**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

Expected: all pass.

**Step 4: Smoke test the server starts**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && timeout 5 uvicorn app.main:app --port 8010 2>&1 | tail -3 || true
```

Expected: `Application startup complete.`

**Step 5: Commit**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/payments.py && git commit -m "feat: add GET /payments/{building_id}/tenant-debts batch endpoint"
```

---

### Task 2: Backend — Excel deduplication by אסמכתא

**Files:**
- Modify: `backend/app/routers/statements.py`

**Context:** Each uploaded Excel row has a `reference_number` (from the אסמכתא column), stored in `Transaction.reference_number`. Currently there is no duplicate check — re-uploading the same statement inserts all rows again. Fix: before inserting, skip rows where `reference_number` is non-empty and a `Transaction` with that value already exists in the DB.

**Step 1: Read the upload handler to find the exact insertion loop**

```bash
grep -n "reference_number\|db.add(transaction\|for trans_data" "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend/app/routers/statements.py"
```

**Step 2: Add dedup logic inside the transaction loop**

Find the `for trans_data in transactions_data:` loop (around line 96). Right after the line `transaction = Transaction(...)` block and BEFORE `db.add(transaction)`, add:

```python
        # Deduplication: skip if this reference_number already exists in the DB
        ref_num = trans_data.get('reference_number', '')
        if ref_num:
            existing = db.query(Transaction).filter(
                Transaction.reference_number == ref_num
            ).first()
            if existing:
                skipped_count += 1
                continue
```

Also add `skipped_count = 0` near the top of the function, where `matched_count = 0` and `unmatched_count = 0` are initialized (around line 92).

**Step 3: Return skipped_count in the response**

Find the `return { ... }` at the end of the function. Add:

```python
        "skipped_duplicates": skipped_count,
```

**Step 4: Run tests**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend" && source venv/bin/activate && python3 -m pytest tests/ -q 2>&1 | tail -5
```

**Step 5: Commit**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add backend/app/routers/statements.py && git commit -m "feat: skip duplicate transactions by reference_number (אסמכתא) on Excel upload"
```

---

### Task 3: Frontend — Add `getTenantDebts` to API client

**Files:**
- Modify: `frontend/src/services/api.ts`

**Context:** The Tenants page will call this new endpoint on mount to auto-populate all debt values.

**Step 1: Add to `paymentsAPI`**

Open `frontend/src/services/api.ts`. Find `paymentsAPI` and add:

```typescript
  getTenantDebts: (buildingId: string) =>
    fetchAPI<Record<string, number>>(`/api/v1/payments/${buildingId}/tenant-debts`),
```

**Step 2: Build check**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -5
```

Expected: no errors.

**Step 3: Commit**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/services/api.ts && git commit -m "feat: add getTenantDebts to paymentsAPI client"
```

---

### Task 4: Frontend — Tenants.tsx: column sorting + auto debt

**Files:**
- Modify: `frontend/src/pages/Tenants.tsx`

**Context:** This task replaces the lazy "חשב" button with auto-loaded debt (via `useQuery` on mount), and adds full column sorting via clickable headers with ▲▼ indicators. Pattern is identical to Dashboard.tsx.

**Step 1: Read the full current file**

```bash
cat "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend/src/pages/Tenants.tsx"
```

**Step 2: Replace lazy debt state + handler with `useQuery`**

**Remove** these from the component:
- `const [tenantDebts, setTenantDebts] = useState<Record<string, number | 'loading'>>({});`
- The entire `handleLoadDebt` function (lines ~108–120)

**Add** this query after the existing `tenants` query:

```typescript
const { data: tenantDebts } = useQuery({
  queryKey: ['tenantDebts', buildingId],
  queryFn: () => paymentsAPI.getTenantDebts(buildingId!),
  enabled: !!buildingId,
});
```

**Step 3: Add sort state**

After the `tenantDebts` query, add:

```typescript
const [sortColumn, setSortColumn] = useState<string>('apartment_number');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

const handleSort = (col: string) => {
  if (sortColumn === col) {
    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
  } else {
    setSortColumn(col);
    setSortDirection('asc');
  }
};

const SortIcon = ({ col }: { col: string }) => (
  <span className={`ml-1 text-xs ${sortColumn === col ? 'text-blue-600' : 'text-gray-300'}`}>
    {sortColumn === col ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
  </span>
);
```

**Step 4: Replace `sorted` with `sortedTenants`**

**Remove** the existing `const sorted = ...` line.

**Add** this derived value (uses `tenantDebts` for debt sort):

```typescript
const sortedTenants = [...(tenants || [])].sort((a, b) => {
  const dir = sortDirection === 'asc' ? 1 : -1;
  switch (sortColumn) {
    case 'apartment_number':
      return ((a.apartment_number || 0) - (b.apartment_number || 0)) * dir;
    case 'name':
      return a.name.localeCompare(b.name, 'he') * dir;
    case 'ownership_type':
      return a.ownership_type.localeCompare(b.ownership_type, 'he') * dir;
    case 'language':
      return a.language.localeCompare(b.language) * dir;
    case 'has_standing_order':
      return ((a.has_standing_order ? 1 : 0) - (b.has_standing_order ? 1 : 0)) * dir;
    case 'is_active':
      return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir;
    case 'expected_payment': {
      const aV = a.expected_payment ?? a.building_expected_payment ?? 0;
      const bV = b.expected_payment ?? b.building_expected_payment ?? 0;
      return (aV - bV) * dir;
    }
    case 'total_debt': {
      const aD = tenantDebts?.[a.id] ?? 0;
      const bD = tenantDebts?.[b.id] ?? 0;
      return (aD - bD) * dir;
    }
    case 'move_in_date':
      return (a.move_in_date || '').localeCompare(b.move_in_date || '') * dir;
    default:
      return 0;
  }
});
```

**Step 5: Replace the column headers**

Find the `<thead>` section. It currently uses `.map(col => <th>...)`. Replace the entire `<tr>` inside `<thead>` with individual clickable headers:

```tsx
<tr>
  <th onClick={() => handleSort('apartment_number')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    דירה<SortIcon col="apartment_number" />
  </th>
  <th onClick={() => handleSort('name')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    שם<SortIcon col="name" />
  </th>
  <th onClick={() => handleSort('ownership_type')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    סוג בעלות<SortIcon col="ownership_type" />
  </th>
  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
    טלפון
  </th>
  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
    בנק
  </th>
  <th onClick={() => handleSort('language')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    שפה<SortIcon col="language" />
  </th>
  <th onClick={() => handleSort('has_standing_order')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    ה.קבע<SortIcon col="has_standing_order" />
  </th>
  <th onClick={() => handleSort('is_active')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    פעיל<SortIcon col="is_active" />
  </th>
  <th onClick={() => handleSort('expected_payment')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    תשלום צפוי<SortIcon col="expected_payment" />
  </th>
  <th onClick={() => handleSort('total_debt')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    חוב כולל<SortIcon col="total_debt" />
  </th>
  <th onClick={() => handleSort('move_in_date')}
    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
    תאריך כניסה<SortIcon col="move_in_date" />
  </th>
  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
    פעולות
  </th>
</tr>
```

**Step 6: Replace the row map and debt cell**

Find `{sorted.map(tenant => (` and replace with `{sortedTenants.map(tenant => (`.

Find the "Task 16: חוב כולל" `<td>` (the one with `tenantDebts[tenant.id] === 'loading'`). Replace the entire cell with:

```tsx
{/* חוב כולל (auto-loaded) */}
<td className="px-4 py-3 text-sm">
  {tenantDebts === undefined ? (
    <span className="text-gray-300 text-xs">טוען...</span>
  ) : (
    <span className={(tenantDebts[tenant.id] ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-green-500'}>
      ₪{Math.round(tenantDebts[tenant.id] ?? 0).toLocaleString()}
    </span>
  )}
</td>
```

Also find `{sorted.length === 0 ?` (in the empty-state check) and replace with `{(tenants?.length ?? 0) === 0 ?`.

**Step 7: Build check**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/frontend" && npm run build 2>&1 | tail -15
```

Fix any TypeScript errors before committing.

**Step 8: Commit and push**

```bash
cd "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay" && git add frontend/src/pages/Tenants.tsx && git commit -m "feat: column sorting and auto-loaded debt on Tenants page" && git push origin master
```

---

### Review Checklist

- [ ] `GET /payments/{building_id}/tenant-debts` returns `{ tenant_id: float }` for all active tenants
- [ ] Excel re-upload skips rows with matching `reference_number`, reports `skipped_duplicates` in response
- [ ] Tenants page debt column auto-loads on mount (no "חשב" button)
- [ ] All 9 sortable columns work with ▲▼ indicator
- [ ] Non-sortable columns (טלפון, בנק, פעולות) have no sort on click
- [ ] Default sort: apartment number ascending
- [ ] `npm run build` passes with 0 TypeScript errors
- [ ] 26 backend tests pass
