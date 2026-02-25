# Expected Payment Per Tenant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an editable "תשלום צפוי" (expected payment) column to the Tenants table that saves per-apartment overrides, falling back to the building default.

**Architecture:** The `apartments.expected_payment` column already exists in the DB and is already used by `payments.py` for the dashboard. We need to (1) expose it in the `list_tenants` API response, (2) add a `PATCH /api/v1/apartments/{id}` endpoint, (3) add `apartmentsAPI.patch` to the frontend API client, (4) add the column + inline edit UI to both `Tenants.tsx` and `AllTenants.tsx`.

**Tech Stack:** FastAPI, SQLAlchemy, React 18, TypeScript, TanStack Query, Tailwind CSS v3

---

### Task 1: Expose `expected_payment` in the tenant list API response

**Files:**
- Modify: `backend/app/routers/tenants.py` (lines 82–106, the list_tenants return dict)

**Step 1: Add `expected_payment` and `building_expected_payment` to the list response**

In `list_tenants`, the return dict for each row currently does NOT include apartment.expected_payment or building.expected_monthly_payment. Add both so the frontend can compute the effective value and know whether it's overridden.

Change lines 82–106 from:
```python
return [
    {
        "id": str(tenant.id),
        ...
        "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None,
    }
    for tenant, apartment, building in results
]
```

To (add two new keys inside the dict):
```python
return [
    {
        "id": str(tenant.id),
        "apartment_id": str(tenant.apartment_id),
        "building_id": str(tenant.building_id),
        "building_name": building.name,
        "apartment_number": apartment.number,
        "floor": apartment.floor,
        "expected_payment": float(apartment.expected_payment) if apartment.expected_payment is not None else None,
        "building_expected_payment": float(building.expected_monthly_payment) if building.expected_monthly_payment is not None else None,
        "name": tenant.name,
        "full_name": tenant.full_name,
        "phone": tenant.phone,
        "email": tenant.email,
        "language": tenant.language.value if hasattr(tenant.language, 'value') else tenant.language,
        "ownership_type": tenant.ownership_type.value if hasattr(tenant.ownership_type, 'value') else tenant.ownership_type,
        "is_committee_member": tenant.is_committee_member,
        "has_standing_order": tenant.has_standing_order,
        "bank_name": tenant.bank_name,
        "bank_account": tenant.bank_account,
        "notes": tenant.notes,
        "is_active": tenant.is_active,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None,
    }
    for tenant, apartment, building in results
]
```

**Step 2: Verify manually**
```bash
cd leadpay/backend && source venv/bin/activate
uvicorn app.main:app --reload
# In another terminal:
curl "http://localhost:8000/api/v1/tenants/?building_id=<any-id>" | python3 -m json.tool | grep -E "expected_payment|building_expected"
```
Expected: both keys appear in every tenant object.

**Step 3: Run backend tests**
```bash
cd leadpay/backend && source venv/bin/activate
python3 -m pytest tests/ -q
```
Expected: 25 passed

**Step 4: Commit**
```bash
git add backend/app/routers/tenants.py
git commit -m "feat: expose apartment expected_payment in tenant list response"
```

---

### Task 2: Add `PATCH /api/v1/apartments/{apartment_id}` endpoint

**Files:**
- Check if apartments router exists: `backend/app/routers/` (ls to see)
- If no apartments router: add endpoint to `backend/app/routers/tenants.py`
- Modify: `backend/app/main.py` only if creating a new router file

**Step 1: Check for existing apartments router**
```bash
ls "/Users/frenkel/Library/Mobile Documents/com~apple~CloudDocs/Projects/Lead App/leadpay/backend/app/routers/"
```

**Step 2: Add PATCH endpoint to tenants.py** (append after the last endpoint)

```python
@router.patch("/apartments/{apartment_id}", status_code=status.HTTP_200_OK)
def patch_apartment(
    apartment_id: UUID,
    data: dict,
    db: Session = Depends(get_db)
):
    """Patch an apartment's expected_payment override. Pass null to clear override."""
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail=f"Apartment {apartment_id} not found")

    if "expected_payment" in data:
        val = data["expected_payment"]
        apartment.expected_payment = float(val) if val is not None else None

    db.commit()
    db.refresh(apartment)
    return {
        "apartment_id": str(apartment.id),
        "expected_payment": float(apartment.expected_payment) if apartment.expected_payment is not None else None,
    }
```

**Step 3: Write a test for this endpoint**

In `backend/tests/test_tenants.py`, add at the end:

```python
def test_patch_apartment_expected_payment(client, building_id):
    """Can set and clear apartment expected_payment."""
    # First create an apartment via resolve
    resp = client.post(
        f"/api/v1/tenants/{building_id}/apartments/resolve",
        json={"apt_number": 99, "floor": 1}
    )
    assert resp.status_code == 200
    apt_id = resp.json()["apartment_id"]

    # Set expected_payment
    resp = client.patch(f"/api/v1/tenants/apartments/{apt_id}", json={"expected_payment": 750.0})
    assert resp.status_code == 200
    assert resp.json()["expected_payment"] == 750.0

    # Clear expected_payment (set to null)
    resp = client.patch(f"/api/v1/tenants/apartments/{apt_id}", json={"expected_payment": None})
    assert resp.status_code == 200
    assert resp.json()["expected_payment"] is None
```

**Step 4: Run tests to confirm new test passes**
```bash
cd leadpay/backend && source venv/bin/activate
python3 -m pytest tests/test_tenants.py -v -k "patch_apartment"
```
Expected: PASSED

**Step 5: Run full test suite**
```bash
python3 -m pytest tests/ -q
```
Expected: 26 passed

**Step 6: Commit**
```bash
git add backend/app/routers/tenants.py backend/tests/test_tenants.py
git commit -m "feat: add PATCH /apartments/{id} endpoint for expected_payment override"
```

---

### Task 3: Update frontend types and API client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

**Step 1: Add fields to Tenant interface in `types/index.ts`**

Add two new optional fields after `floor?`:
```typescript
export interface Tenant {
  // ... existing fields ...
  apartment_number?: number;
  floor?: number;
  expected_payment?: number | null;           // per-apartment override (null = not set)
  building_expected_payment?: number | null;  // building default (for display fallback)
}
```

**Step 2: Add `apartmentsAPI.patch` to `services/api.ts`**

Add a new export after the `tenantsAPI` block:
```typescript
// Apartments API
export const apartmentsAPI = {
  patch: (apartmentId: string, data: { expected_payment: number | null }) =>
    fetchAPI<{ apartment_id: string; expected_payment: number | null }>(
      `/api/v1/tenants/apartments/${apartmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),
};
```

**Step 3: Verify TypeScript compiles**
```bash
cd leadpay/frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

**Step 4: Commit**
```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat: add expected_payment fields to Tenant type and apartmentsAPI.patch"
```

---

### Task 4: Add inline-editable expected payment column to `Tenants.tsx`

**Files:**
- Modify: `frontend/src/pages/Tenants.tsx`

**Behavior:**
- New column header: `תשלום צפוי`
- Cell shows the effective amount: `apartment.expected_payment ?? building.expected_monthly_payment`
- If `expected_payment` is set (override): show `₪750` in normal black text + small ✏️ icon
- If inherited from building: show `₪500*` in grey text + small ✏️ icon (`*` means "from building default")
- If neither is set: show `—`
- Clicking the ✏️ (or the value) opens an inline input in that cell
- Input is a number field pre-filled with current value (or empty if null)
- Buttons: ✓ save, ✗ cancel, and a "🔄 איפוס" (reset to building default) link if override exists
- On save: call `apartmentsAPI.patch(tenant.apartment_id, { expected_payment: value })` then invalidate tenants query
- On reset: call `apartmentsAPI.patch(tenant.apartment_id, { expected_payment: null })` then invalidate

**Step 1: Add state for which row is being edited**

Add to component state:
```tsx
const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
const [editingPaymentValue, setEditingPaymentValue] = useState<string>('');
const [savingPayment, setSavingPayment] = useState(false);
```

**Step 2: Add save handler**
```tsx
const handleSavePayment = async (tenant: Tenant) => {
  setSavingPayment(true);
  try {
    const val = editingPaymentValue === '' ? null : parseFloat(editingPaymentValue);
    await apartmentsAPI.patch(tenant.apartment_id, { expected_payment: val });
    invalidate();
    setEditingPaymentId(null);
  } catch (err) {
    console.error(err);
  } finally {
    setSavingPayment(false);
  }
};

const handleResetPayment = async (tenant: Tenant) => {
  setSavingPayment(true);
  try {
    await apartmentsAPI.patch(tenant.apartment_id, { expected_payment: null });
    invalidate();
    setEditingPaymentId(null);
  } catch (err) {
    console.error(err);
  } finally {
    setSavingPayment(false);
  }
};
```

**Step 3: Add the import for apartmentsAPI**
```tsx
import { buildingsAPI, tenantsAPI, apartmentsAPI } from '../services/api';
```

**Step 4: Add column header** in the `th` row — add `'תשלום צפוי'` to the columns array before `'פעולות'`:
```tsx
{['דירה', 'שם', 'סוג בעלות', 'טלפון', 'בנק', 'שפה', 'ה.קבע', 'פעיל', 'תשלום צפוי', 'פעולות'].map(...)}
```

**Step 5: Add the cell in each `<tr>` (add before the actions `<td>`)**

```tsx
<td className="px-4 py-3 text-sm">
  {editingPaymentId === tenant.id ? (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={editingPaymentValue}
        onChange={e => setEditingPaymentValue(e.target.value)}
        placeholder="סכום"
        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') handleSavePayment(tenant);
          if (e.key === 'Escape') setEditingPaymentId(null);
        }}
      />
      <button
        onClick={() => handleSavePayment(tenant)}
        disabled={savingPayment}
        className="text-green-600 hover:text-green-800 font-bold"
        title="שמור"
      >✓</button>
      <button
        onClick={() => setEditingPaymentId(null)}
        className="text-gray-400 hover:text-gray-600"
        title="ביטול"
      >✗</button>
      {tenant.expected_payment != null && (
        <button
          onClick={() => handleResetPayment(tenant)}
          className="text-xs text-blue-500 hover:text-blue-700"
          title="חזור לברירת מחדל של הבניין"
        >🔄</button>
      )}
    </div>
  ) : (
    <button
      onClick={() => {
        setEditingPaymentId(tenant.id);
        setEditingPaymentValue(
          tenant.expected_payment != null
            ? String(tenant.expected_payment)
            : ''
        );
      }}
      className="flex items-center gap-1 group"
      title="לחץ לעריכה"
    >
      {tenant.expected_payment != null ? (
        <span className="text-gray-900">₪{tenant.expected_payment.toLocaleString()}</span>
      ) : tenant.building_expected_payment != null ? (
        <span className="text-gray-400">₪{tenant.building_expected_payment.toLocaleString()}*</span>
      ) : (
        <span className="text-gray-300">—</span>
      )}
      <span className="text-gray-300 group-hover:text-blue-500 text-xs">✏️</span>
    </button>
  )}
</td>
```

**Step 6: Verify TypeScript compiles**
```bash
cd leadpay/frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

**Step 7: Commit**
```bash
git add frontend/src/pages/Tenants.tsx
git commit -m "feat: add inline-editable expected payment column to Tenants page"
```

---

### Task 5: Add the same column to `AllTenants.tsx`

**Files:**
- Modify: `frontend/src/pages/AllTenants.tsx`

Apply the same changes as Task 4:
- Import `apartmentsAPI`
- Add three state vars: `editingPaymentId`, `editingPaymentValue`, `savingPayment`
- Add `handleSavePayment` and `handleResetPayment` handlers (identical to Task 4)
- Add `'תשלום צפוי'` to the column header array (before `'פעולות'`)
- Add the same `<td>` cell (identical to Task 4)

**Step 1: Make all changes**

Same pattern as Task 4 — copy the state, handlers, header entry, and cell `<td>` verbatim.

**Step 2: Verify TypeScript compiles**
```bash
cd leadpay/frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

**Step 3: Run full backend tests**
```bash
cd leadpay/backend && source venv/bin/activate && python3 -m pytest tests/ -q
```
Expected: 26 passed

**Step 4: Commit and push**
```bash
git add frontend/src/pages/AllTenants.tsx
git commit -m "feat: add inline-editable expected payment column to AllTenants page"
git push origin master
```

---

### Task 6: Smoke test

**Manual verification steps:**

1. Open http://localhost:5173 → navigate to a building → click "דיירים"
2. Verify new column "תשלום צפוי" appears
3. Tenants with no apartment override should show grey `₪500*` (building default) or `—`
4. Click the value → input opens pre-filled or empty
5. Type `750` → press Enter → verify it saves and shows `₪750` in black
6. Click again → press 🔄 reset → verify it reverts to grey `₪500*`
7. Open http://localhost:5173/tenants (AllTenants global page) → verify same column works there
8. Open Dashboard → verify payment status still uses the correct expected amount (should now use 750 for that tenant)
