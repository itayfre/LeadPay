# Building Report Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-building income & expenses report export to the building detail page, with a live HTML preview and downloads in PDF and Word formats.

**Architecture:** One backend service builds a JSON payload from existing models. The payload feeds three renderers — a React component for the in-app preview, a Jinja+WeasyPrint pipeline for PDF, and a python-docx pipeline for Word. The frontend opens an `ExportReportDialog` from the building header; period changes re-fetch the JSON; downloads hit dedicated PDF/Word endpoints that re-use the same payload.

**Tech Stack:** FastAPI · SQLAlchemy 2.0 · Jinja2 · WeasyPrint (PDF) · python-docx (Word) · Heebo/David Hebrew fonts · React 18 · TypeScript · TanStack Query · Tailwind · shadcn/ui

**Reference design:** `docs/plans/2026-05-10-building-report-export-design.md`

**Reference sample:** `דוח_נחל_דן_17_כרמיאל_רבעון_א_2026.pdf` (provided by user)

---

## Conventions

- **Paths** are relative to `leadpay/` (the git repo root).
- **Tests** live under `backend/tests/` and run with `cd backend && pytest`.
- **Frontend** verification uses `cd frontend && npm run build` for type checks, then preview tools for manual UI checks.
- **Commits** are local only; do **not** push to GitHub without explicit user approval (CLAUDE.md rule).
- **RTL helpers** for Word come from the `hebrew-document-generator` skill — see Task 8.

---

## Phase A — Backend foundation

### Task 1: Add backend dependencies and system libs

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/Dockerfile` (or create one if absent — see Step 1)

**Step 1: Detect deploy image**

Run: `ls backend/Dockerfile backend/Procfile backend/nixpacks.toml 2>/dev/null`

If `Dockerfile` exists, modify it. If only `nixpacks.toml`, modify that. If neither, create `backend/Dockerfile` based on the existing Railway runtime (`python:3.11-slim`).

**Step 2: Add Python deps**

Append to `backend/requirements.txt` (pin to current latest stable):

```text
weasyprint==62.3
python-docx==1.1.2
Jinja2==3.1.4
```

**Step 3: Add system libs for WeasyPrint**

In the chosen image config, ensure these apt packages are installed before `pip install`:

```text
libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libfontconfig1 libcairo2
```

For a `Dockerfile`:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libfontconfig1 libcairo2 \
 && rm -rf /var/lib/apt/lists/*
```

For `nixpacks.toml`:

```toml
[phases.setup]
aptPkgs = ["libpango-1.0-0", "libpangoft2-1.0-0", "libharfbuzz0b", "libfontconfig1", "libcairo2"]
```

**Step 4: Local install + smoke test**

Run:
```bash
cd backend && pip install -r requirements.txt
python -c "import weasyprint, docx, jinja2; print('ok')"
```
Expected: `ok`. If WeasyPrint fails locally on macOS, document the brew command (`brew install pango cairo`) in `backend/README.md` but proceed — production runs in Linux.

**Step 5: Commit**

```bash
git add backend/requirements.txt backend/Dockerfile backend/nixpacks.toml backend/README.md 2>/dev/null
git commit -m "chore(deps): add weasyprint, python-docx, jinja2 for report export"
```

---

### Task 2: Bundle Heebo Hebrew font

**Files:**
- Create: `backend/app/static/fonts/Heebo-Regular.ttf`
- Create: `backend/app/static/fonts/Heebo-Bold.ttf`
- Create: `backend/app/static/fonts/LICENSE.txt` (OFL license text)

**Step 1: Download fonts**

Heebo is OFL-licensed (Google Fonts).

```bash
mkdir -p backend/app/static/fonts
curl -L -o backend/app/static/fonts/Heebo-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/heebo/Heebo%5Bwght%5D.ttf
```

The variable font covers Regular and Bold weights via CSS `font-weight`. If the variable file isn't accepted by WeasyPrint's chosen renderer, fall back to:

```bash
curl -L -o backend/app/static/fonts/Heebo-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/heebo/static/Heebo-Regular.ttf
curl -L -o backend/app/static/fonts/Heebo-Bold.ttf \
  https://github.com/google/fonts/raw/main/ofl/heebo/static/Heebo-Bold.ttf
```

**Step 2: Verify file sizes**

Run: `ls -la backend/app/static/fonts/`
Expected: each `.ttf` is ≥ 50 KB and contains Hebrew glyphs.

```bash
python -c "
from fontTools.ttLib import TTFont
f = TTFont('backend/app/static/fonts/Heebo-Regular.ttf')
cmap = f.getBestCmap()
assert any(0x0590 <= cp <= 0x05FF for cp in cmap), 'no Hebrew glyphs!'
print('ok')
"
```

(Install `fonttools` if needed.) Expected: `ok`.

**Step 3: Add OFL license**

Save the OFL license to `backend/app/static/fonts/LICENSE.txt` from https://openfontlicense.org/.

**Step 4: Commit**

```bash
git add backend/app/static/fonts/
git commit -m "chore(fonts): bundle Heebo Hebrew font for report PDF rendering"
```

---

### Task 3: Report data service — fixtures and tests first

**Files:**
- Create: `backend/tests/test_report_data.py`
- Create: `backend/tests/fixtures/report_factories.py` (only if no factory module exists; otherwise reuse)

**Step 1: Write failing tests**

Create `backend/tests/test_report_data.py` with these test cases (use the same fixtures pattern as `test_payments_extra.py`):

```python
import datetime as dt
from app.services.report_data import build_report_payload

def test_payload_contains_building_metadata(db, sample_building):
    payload = build_report_payload(db, sample_building.id, dt.date(2026,1,1), dt.date(2026,3,31))
    assert payload["building"]["name"] == sample_building.name
    assert payload["building"]["address"] == sample_building.address

def test_period_label_quarter(db, sample_building):
    p = build_report_payload(db, sample_building.id, dt.date(2026,1,1), dt.date(2026,3,31))
    assert p["period"]["label"] == "רבעון א 2026"
    assert p["period"]["granularity"] == "month"
    assert [c["label"] for c in p["period"]["columns"]] == ["ינואר","פברואר","מרץ"]

def test_period_label_full_year_uses_quarterly_granularity(db, sample_building):
    p = build_report_payload(db, sample_building.id, dt.date(2026,1,1), dt.date(2026,12,31))
    assert p["period"]["label"] == "2026"
    assert p["period"]["granularity"] == "quarter"
    assert [c["label"] for c in p["period"]["columns"]] == ["רבעון א","רבעון ב","רבעון ג","רבעון ד"]

def test_summary_balance_equals_income_minus_expenses(db, sample_building_with_data):
    p = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    assert p["summary"]["net_balance"] == p["summary"]["total_income"] - p["summary"]["total_expenses"]

def test_income_table_one_row_per_apartment(db, sample_building_with_data):
    p = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    apt_numbers = [r["apartment_number"] for r in p["income_by_tenant"]]
    assert apt_numbers == sorted(apt_numbers)
    assert len(apt_numbers) == 11

def test_debtors_period_only_includes_underpayers(db, sample_building_with_kristina_debt):
    p = build_report_payload(db, sample_building_with_kristina_debt.id, dt.date(2026,1,1), dt.date(2026,3,31))
    debtor_names = [d["tenant_name"] for d in p["debtors_period"]]
    assert "קריסטינה" in debtor_names

def test_debtors_lifetime_includes_carryforward(db, sample_building_with_old_debt):
    p = build_report_payload(db, sample_building_with_old_debt.id, dt.date(2026,1,1), dt.date(2026,3,31))
    assert any(d["debt"] > 0 for d in p["debtors_lifetime"])

def test_expenses_grouped_by_month_in_order(db, sample_building_with_expenses):
    p = build_report_payload(db, sample_building_with_expenses.id, dt.date(2026,1,1), dt.date(2026,3,31))
    months = [g["month_label"] for g in p["expenses_by_month"]]
    assert months == ["ינואר","פברואר","מרץ"]

def test_custom_unaligned_range_snaps_to_month_columns(db, sample_building):
    p = build_report_payload(db, sample_building.id, dt.date(2026,1,15), dt.date(2026,3,20))
    assert p["period"]["label"] == "15.01.2026 – 20.03.2026"
    assert [c["label"] for c in p["period"]["columns"]] == ["ינואר","פברואר","מרץ"]
```

Add fixtures (`sample_building`, `sample_building_with_data`, `sample_building_with_kristina_debt`, `sample_building_with_old_debt`, `sample_building_with_expenses`) to a new `backend/tests/conftest.py` section if they don't already exist. Reuse `db` fixture from existing tests.

**Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_report_data.py -v`
Expected: All tests FAIL with `ModuleNotFoundError: No module named 'app.services.report_data'`.

**Step 3: Implement `report_data.py`**

Create `backend/app/services/report_data.py`:

```python
from __future__ import annotations
import datetime as dt
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.apartment import Apartment
from app.models.building import Building
from app.models.tenant import Tenant
from app.models.transaction import Transaction, TransactionType
from app.models.transaction_allocation import TransactionAllocation


HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
                 "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
QUARTER_LABELS = ["רבעון א","רבעון ב","רבעון ג","רבעון ד"]
QUARTER_LABELS_WITH_YEAR = ["רבעון א {y}", "רבעון ב {y}", "רבעון ג {y}", "רבעון ד {y}"]


def build_report_payload(db: Session, building_id: UUID,
                         from_date: dt.date, to_date: dt.date) -> dict[str, Any]:
    building = db.get(Building, building_id)
    if not building:
        raise ValueError(f"building {building_id} not found")

    period = _build_period(from_date, to_date)
    apartments = (db.query(Apartment)
                    .filter(Apartment.building_id == building_id)
                    .order_by(Apartment.number).all())
    tenants_by_apt = _load_tenants(db, apartments)

    income_rows = _income_rows(db, building, apartments, tenants_by_apt, period, from_date, to_date)
    expenses_groups = _expenses_groups(db, building_id, from_date, to_date)
    debtors_period = _period_debtors(income_rows)
    debtors_lifetime = _lifetime_debtors(db, building_id, apartments, tenants_by_apt)

    total_income = sum(r["paid_total"] for r in income_rows)
    total_expenses = sum(g["subtotal"] for g in expenses_groups)

    return {
        "building": {
            "name": building.name,
            "address": building.address,
            "city": building.city,
            "expected_monthly_payment": _money(building.expected_monthly_payment),
        },
        "period": period,
        "summary": {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net_balance": total_income - total_expenses,
        },
        "income_by_tenant": income_rows,
        "income_totals_row": _totals_row(income_rows, period),
        "expenses_by_month": expenses_groups,
        "expenses_grand_total": total_expenses,
        "debtors_period": debtors_period,
        "debtors_lifetime": debtors_lifetime,
    }


# --- helpers ---

def _money(v) -> float | None:
    return float(v) if v is not None else None


def _build_period(from_d: dt.date, to_d: dt.date) -> dict[str, Any]:
    months_span = (to_d.year - from_d.year) * 12 + (to_d.month - from_d.month) + 1
    granularity = "quarter" if months_span > 6 else "month"

    if granularity == "month":
        columns = []
        y, m = from_d.year, from_d.month
        for _ in range(months_span):
            columns.append({"key": f"{y:04d}-{m:02d}", "label": HEBREW_MONTHS[m-1]})
            m += 1
            if m > 12: m, y = 1, y+1
    else:
        columns = []
        y = from_d.year
        first_q = (from_d.month - 1) // 3
        last_q  = (to_d.month - 1) // 3
        years = list(range(from_d.year, to_d.year + 1))
        if len(years) == 1:
            for q in range(first_q, last_q + 1):
                columns.append({"key": f"{y}-Q{q+1}", "label": QUARTER_LABELS[q]})
        else:
            for yr in years:
                for q in range(0, 4):
                    columns.append({"key": f"{yr}-Q{q+1}",
                                    "label": QUARTER_LABELS_WITH_YEAR[q].format(y=yr)})

    return {
        "from": from_d.strftime("%Y-%m"),
        "to": to_d.strftime("%Y-%m"),
        "label": _period_label(from_d, to_d),
        "columns": columns,
        "granularity": granularity,
    }


def _period_label(from_d: dt.date, to_d: dt.date) -> str:
    is_month_aligned = (from_d.day == 1 and to_d == _last_day_of_month(to_d))
    if is_month_aligned:
        if from_d.year == to_d.year and from_d.month == to_d.month:
            return f"{HEBREW_MONTHS[from_d.month-1]} {from_d.year}"
        if from_d == dt.date(from_d.year, 1, 1) and to_d == dt.date(from_d.year, 12, 31):
            return f"{from_d.year}"
        if (from_d.month - 1) % 3 == 0 and (to_d.month) % 3 == 0 and from_d.year == to_d.year:
            q = (from_d.month - 1) // 3
            return f"{QUARTER_LABELS[q]} {from_d.year}"
    return f"{from_d.strftime('%d.%m.%Y')} – {to_d.strftime('%d.%m.%Y')}"


def _last_day_of_month(d: dt.date) -> dt.date:
    next_month = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return next_month - dt.timedelta(days=1)


def _load_tenants(db: Session, apartments) -> dict[UUID, Tenant]:
    apt_ids = [a.id for a in apartments]
    if not apt_ids: return {}
    tenants = db.query(Tenant).filter(Tenant.apartment_id.in_(apt_ids)).all()
    return {t.apartment_id: t for t in tenants}


def _income_rows(db, building, apartments, tenants_by_apt, period, from_d, to_d):
    """For each apartment, sum confirmed credit transactions per period column."""
    txs = (db.query(Transaction)
             .join(Apartment, Apartment.id == Transaction.matched_apartment_id, isouter=True)
             .filter(Apartment.building_id == building.id)
             .filter(Transaction.activity_date >= from_d)
             .filter(Transaction.activity_date <= to_d)
             .filter(Transaction.is_confirmed == True)
             .filter(Transaction.credit_amount.isnot(None))
             .all())

    rows = []
    for apt in apartments:
        tenant = tenants_by_apt.get(apt.id)
        cells = [{"key": c["key"], "amount": 0.0} for c in period["columns"]]
        for tx in txs:
            if tx.matched_apartment_id != apt.id: continue
            key = _column_key_for_date(tx.activity_date, period)
            cell = next((c for c in cells if c["key"] == key), None)
            if cell: cell["amount"] += float(tx.credit_amount)
        paid = sum(c["amount"] for c in cells)
        expected_per_month = float(apt.expected_payment or building.expected_monthly_payment or 0)
        months_span = sum(1 for c in period["columns"]) if period["granularity"] == "month" else len(period["columns"]) * 3
        expected = expected_per_month * months_span
        rows.append({
            "apartment_number": apt.number,
            "tenant_name": tenant.full_name if tenant else "—",
            "cells": cells,
            "paid_total": paid,
            "expected_total": expected,
            "balance": max(expected - paid, 0),
        })
    return rows


def _column_key_for_date(d: dt.datetime, period) -> str:
    if period["granularity"] == "month":
        return f"{d.year:04d}-{d.month:02d}"
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _totals_row(rows, period):
    cells = [{"key": c["key"], "amount": 0.0} for c in period["columns"]]
    paid = expected = balance = 0.0
    for r in rows:
        for src, dst in zip(r["cells"], cells):
            dst["amount"] += src["amount"]
        paid += r["paid_total"]; expected += r["expected_total"]; balance += r["balance"]
    return {"cells": cells, "paid_total": paid, "expected_total": expected, "balance": balance}


def _expenses_groups(db, building_id, from_d, to_d):
    """Group debit allocations by month within the period."""
    rows = (db.query(TransactionAllocation, Transaction)
              .join(Transaction, TransactionAllocation.transaction_id == Transaction.id)
              .filter(TransactionAllocation.building_id == building_id)
              .filter(Transaction.activity_date >= from_d)
              .filter(Transaction.activity_date <= to_d)
              .filter(Transaction.debit_amount.isnot(None))
              .order_by(Transaction.activity_date.asc())
              .all())
    groups: dict[str, dict] = {}
    for alloc, tx in rows:
        key = f"{tx.activity_date.year:04d}-{tx.activity_date.month:02d}"
        if key not in groups:
            groups[key] = {"month_label": HEBREW_MONTHS[tx.activity_date.month - 1],
                           "rows": [], "subtotal": 0.0}
        amount = float(alloc.amount or tx.debit_amount or 0)
        groups[key]["rows"].append({
            "description": tx.description or "—",
            "category": (alloc.category or "—"),
            "amount": amount,
        })
        groups[key]["subtotal"] += amount
    return list(groups.values())


def _period_debtors(income_rows):
    return [
        {"apartment_number": r["apartment_number"], "tenant_name": r["tenant_name"],
         "debt": r["balance"], "note": ""}
        for r in income_rows if r["balance"] > 0
    ]


def _lifetime_debtors(db, building_id, apartments, tenants_by_apt):
    """Sum of expected − paid across all time per tenant. Implementation placeholder:
    delegate to existing payment summary if it exposes per-tenant lifetime balance.
    Otherwise compute here using all confirmed credits vs. (months_active * expected)."""
    # See app/routers/payments.py for the existing balance helper. Reuse if available.
    # If not, this can stay as TODO until that helper exists; the report still works
    # without the lifetime sub-section (it is omitted when empty).
    return []
```

**Step 4: Run tests until green**

Run: `cd backend && pytest tests/test_report_data.py -v`
Expected: All tests PASS. Iterate on the implementation until they do.

**Step 5: Commit**

```bash
git add backend/app/services/report_data.py backend/tests/test_report_data.py backend/tests/conftest.py
git commit -m "feat(reports): add report_data service that builds the JSON payload"
```

---

### Task 4: Jinja PDF template

**Files:**
- Create: `backend/app/templates/report.html.j2`

**Step 1: Write the template**

Create the template with `<html lang="he" dir="rtl">`, A4 portrait `@page`, embedded `@font-face` for Heebo, and the five sections from the design doc.

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: 'Heebo';
      src: url('file://{{ font_dir }}/Heebo-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Heebo';
      src: url('file://{{ font_dir }}/Heebo-Bold.ttf') format('truetype');
      font-weight: 700;
    }
    @page {
      size: A4 portrait;
      margin: 18mm 15mm 22mm 15mm;
      @top-right { content: "{{ payload.building.name }} | {{ payload.period.label }}"; font-family: Heebo; font-size: 9pt; color: #555; }
      @bottom-right { content: "עמוד " counter(page) " | LeadPay"; font-family: Heebo; font-size: 9pt; color: #555; }
    }
    body { font-family: 'Heebo', sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 18pt; text-align: center; margin: 0 0 4mm 0; }
    h2 { font-size: 13pt; margin: 8mm 0 3mm 0; border-bottom: 1px solid #ddd; padding-bottom: 1mm; }
    .building-meta { text-align: center; color: #555; margin-bottom: 6mm; }
    .summary { display: flex; gap: 4mm; margin-bottom: 6mm; }
    .summary .card { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 4mm; text-align: center; }
    .summary .card .label { color: #666; font-size: 9pt; }
    .summary .card .value { font-size: 14pt; font-weight: 700; margin-top: 2mm; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { border: 1px solid #ddd; padding: 1.5mm 2mm; text-align: start; word-break: keep-all; }
    th { background: #f5f5f5; font-weight: 700; }
    tr.totals td { font-weight: 700; background: #fafafa; }
    .empty { color: #888; font-style: italic; padding: 3mm; text-align: center; }
    .number { font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <h1>דוח הכנסות והוצאות</h1>
  <div class="building-meta">
    {{ payload.building.name }} · {{ payload.building.address }}, {{ payload.building.city }}<br>
    {{ payload.period.label }}
  </div>

  <h2>סיכום</h2>
  <div class="summary">
    <div class="card"><div class="label">מאזן נוכחי</div><div class="value">₪{{ "{:,.0f}".format(payload.summary.net_balance) }}</div></div>
    <div class="card"><div class="label">סה״כ הוצאות</div><div class="value">₪{{ "{:,.0f}".format(payload.summary.total_expenses) }}</div></div>
    <div class="card"><div class="label">סה״כ הכנסות</div><div class="value">₪{{ "{:,.0f}".format(payload.summary.total_income) }}</div></div>
  </div>

  <h2>פירוט הכנסות לפי דייר</h2>
  {% if payload.building.expected_monthly_payment %}
  <p>דמי ועד חודשי: ₪{{ "{:,.0f}".format(payload.building.expected_monthly_payment) }} לדירה</p>
  {% endif %}
  <table>
    <thead>
      <tr>
        <th>דירה</th><th>שם דייר</th>
        {% for c in payload.period.columns %}<th>{{ c.label }}</th>{% endfor %}
        <th>שולם</th><th>לתשלום</th><th>יתרה</th>
      </tr>
    </thead>
    <tbody>
      {% for r in payload.income_by_tenant %}
      <tr>
        <td>{{ r.apartment_number }}</td>
        <td>{{ r.tenant_name }}</td>
        {% for c in r.cells %}<td class="number">₪{{ "{:,.0f}".format(c.amount) }}</td>{% endfor %}
        <td class="number">₪{{ "{:,.0f}".format(r.paid_total) }}</td>
        <td class="number">₪{{ "{:,.0f}".format(r.expected_total) }}</td>
        <td class="number">{% if r.balance > 0 %}₪{{ "{:,.0f}".format(r.balance) }}{% else %}—{% endif %}</td>
      </tr>
      {% endfor %}
      <tr class="totals">
        <td colspan="2">סה״כ</td>
        {% for c in payload.income_totals_row.cells %}<td class="number">₪{{ "{:,.0f}".format(c.amount) }}</td>{% endfor %}
        <td class="number">₪{{ "{:,.0f}".format(payload.income_totals_row.paid_total) }}</td>
        <td class="number">₪{{ "{:,.0f}".format(payload.income_totals_row.expected_total) }}</td>
        <td class="number">{% if payload.income_totals_row.balance > 0 %}₪{{ "{:,.0f}".format(payload.income_totals_row.balance) }}{% else %}—{% endif %}</td>
      </tr>
    </tbody>
  </table>

  <h2>פירוט הוצאות</h2>
  {% if payload.expenses_by_month %}
  <table>
    <thead><tr><th>חודש</th><th>תיאור</th><th>קטגוריה</th><th>סכום</th></tr></thead>
    <tbody>
      {% for g in payload.expenses_by_month %}
        {% for row in g.rows %}
        <tr>
          <td>{{ g.month_label if loop.first else "" }}</td>
          <td>{{ row.description }}</td>
          <td>{{ row.category }}</td>
          <td class="number">₪{{ "{:,.2f}".format(row.amount) }}</td>
        </tr>
        {% endfor %}
        <tr class="totals"><td colspan="3">סה״כ {{ g.month_label }}</td><td class="number">₪{{ "{:,.2f}".format(g.subtotal) }}</td></tr>
      {% endfor %}
      <tr class="totals"><td colspan="3">סה״כ הוצאות</td><td class="number">₪{{ "{:,.2f}".format(payload.expenses_grand_total) }}</td></tr>
    </tbody>
  </table>
  {% else %}
  <div class="empty">אין הוצאות בתקופה זו</div>
  {% endif %}

  {% if payload.debtors_period or payload.debtors_lifetime %}
  <h2>חייבים – יתרת חוב פתוח</h2>
  {% if payload.debtors_period %}
  <h3>חוב לתקופה זו</h3>
  <table>
    <thead><tr><th>דירה</th><th>שם דייר</th><th>חוב</th><th>הערה</th></tr></thead>
    <tbody>
    {% for d in payload.debtors_period %}
      <tr><td>{{ d.apartment_number }}</td><td>{{ d.tenant_name }}</td><td class="number">₪{{ "{:,.0f}".format(d.debt) }}</td><td>{{ d.note }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  {% endif %}
  {% if payload.debtors_lifetime %}
  <h3>יתרת חוב כוללת</h3>
  <table>
    <thead><tr><th>דירה</th><th>שם דייר</th><th>חוב</th><th>הערה</th></tr></thead>
    <tbody>
    {% for d in payload.debtors_lifetime %}
      <tr><td>{{ d.apartment_number }}</td><td>{{ d.tenant_name }}</td><td class="number">₪{{ "{:,.0f}".format(d.debt) }}</td><td>{{ d.note }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  {% endif %}
  {% endif %}
</body>
</html>
```

**Step 2: Commit**

```bash
git add backend/app/templates/report.html.j2
git commit -m "feat(reports): add Jinja template for report PDF"
```

---

### Task 5: PDF renderer (WeasyPrint)

**Files:**
- Create: `backend/tests/test_report_pdf.py`
- Create: `backend/app/services/report_pdf.py`

**Step 1: Write failing test**

```python
from app.services.report_pdf import render_report_pdf
from app.services.report_data import build_report_payload
import datetime as dt

def test_pdf_is_returned_as_bytes(db, sample_building_with_data):
    payload = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    pdf = render_report_pdf(payload)
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"

def test_pdf_contains_building_name(db, sample_building_with_data):
    payload = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    pdf = render_report_pdf(payload)
    # Quick smoke: building name embedded somewhere in the binary (UTF-16 safe-ish via Hebrew bytes).
    # Use pypdf to extract text properly:
    from pypdf import PdfReader; import io
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert sample_building_with_data.name in text
```

**Step 2: Run test — should fail with ImportError**

Run: `cd backend && pytest tests/test_report_pdf.py -v`
Expected: FAIL — module missing.

**Step 3: Implement the renderer**

```python
# backend/app/services/report_pdf.py
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_BASE = Path(__file__).resolve().parent.parent
_TEMPLATES = _BASE / "templates"
_FONTS = _BASE / "static" / "fonts"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_report_pdf(payload: dict) -> bytes:
    template = _env.get_template("report.html.j2")
    html_str = template.render(payload=payload, font_dir=str(_FONTS))
    return HTML(string=html_str, base_url=str(_BASE)).write_pdf()
```

**Step 4: Run tests until green**

Run: `cd backend && pytest tests/test_report_pdf.py -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/app/services/report_pdf.py backend/tests/test_report_pdf.py
git commit -m "feat(reports): add WeasyPrint PDF renderer"
```

---

### Task 6: Word renderer (python-docx)

**Files:**
- Create: `backend/tests/test_report_docx.py`
- Create: `backend/app/services/report_docx.py`

**Step 1: Write failing test**

```python
from app.services.report_docx import render_report_docx
from app.services.report_data import build_report_payload
import datetime as dt, io
from docx import Document

def test_docx_is_returned_as_bytes(db, sample_building_with_data):
    payload = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    doc = render_report_docx(payload)
    assert isinstance(doc, bytes)
    assert doc[:2] == b"PK"  # zip magic (.docx is a zip)

def test_docx_contains_building_name(db, sample_building_with_data):
    payload = build_report_payload(db, sample_building_with_data.id, dt.date(2026,1,1), dt.date(2026,3,31))
    doc = render_report_docx(payload)
    d = Document(io.BytesIO(doc))
    text = "\n".join(p.text for p in d.paragraphs) + "\n".join(c.text for t in d.tables for r in t.rows for c in r.cells)
    assert sample_building_with_data.name in text
```

**Step 2: Run test — should fail**

Run: `cd backend && pytest tests/test_report_docx.py -v`
Expected: FAIL.

**Step 3: Implement the renderer**

```python
# backend/app/services/report_docx.py
import io
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn


def _set_paragraph_rtl(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = pPr.makeelement(qn('w:bidi'), {})
    pPr.append(bidi)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT


def _set_run_rtl(run, font_name="David", size=11):
    rPr = run._r.get_or_add_rPr()
    rtl = rPr.makeelement(qn('w:rtl'), {})
    rPr.append(rtl)
    run.font.name = font_name
    run.font.size = Pt(size)
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = rPr.makeelement(qn('w:rFonts'), {})
        rPr.append(rFonts)
    rFonts.set(qn('w:cs'), font_name)
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)


def _add_para(doc, text, bold=False, size=11):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = bold
    _set_run_rtl(r, size=size)
    _set_paragraph_rtl(p)
    return p


def _add_table(doc, headers, rows, totals_row=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        para = hdr[i].paragraphs[0]
        run = para.add_run(h)
        run.bold = True
        _set_run_rtl(run)
        _set_paragraph_rtl(para)
    for row in rows:
        cells = table.add_row().cells
        for i, val in enumerate(row):
            para = cells[i].paragraphs[0]
            run = para.add_run(str(val))
            _set_run_rtl(run)
            _set_paragraph_rtl(para)
    if totals_row:
        cells = table.add_row().cells
        for i, val in enumerate(totals_row):
            para = cells[i].paragraphs[0]
            run = para.add_run(str(val))
            run.bold = True
            _set_run_rtl(run)
            _set_paragraph_rtl(para)
    return table


def _shekel(n):
    return f"₪{n:,.0f}" if n else "—"


def render_report_docx(payload: dict) -> bytes:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "David"
    style.font.size = Pt(11)

    _add_para(doc, "דוח הכנסות והוצאות", bold=True, size=18)
    b = payload["building"]
    _add_para(doc, f"{b['name']} · {b['address']}, {b['city']}")
    _add_para(doc, payload["period"]["label"])

    _add_para(doc, "סיכום", bold=True, size=14)
    _add_table(doc,
        ["מאזן נוכחי", "סה״כ הוצאות", "סה״כ הכנסות"],
        [[_shekel(payload["summary"]["net_balance"]),
          _shekel(payload["summary"]["total_expenses"]),
          _shekel(payload["summary"]["total_income"])]])

    _add_para(doc, "פירוט הכנסות לפי דייר", bold=True, size=14)
    if b.get("expected_monthly_payment"):
        _add_para(doc, f"דמי ועד חודשי: {_shekel(b['expected_monthly_payment'])} לדירה")

    headers = ["דירה", "שם דייר"] + [c["label"] for c in payload["period"]["columns"]] + ["שולם", "לתשלום", "יתרה"]
    rows = []
    for r in payload["income_by_tenant"]:
        row = [r["apartment_number"], r["tenant_name"]] \
            + [_shekel(c["amount"]) for c in r["cells"]] \
            + [_shekel(r["paid_total"]), _shekel(r["expected_total"]),
               _shekel(r["balance"]) if r["balance"] > 0 else "—"]
        rows.append(row)
    tot = payload["income_totals_row"]
    totals = ["סה״כ", ""] + [_shekel(c["amount"]) for c in tot["cells"]] \
           + [_shekel(tot["paid_total"]), _shekel(tot["expected_total"]),
              _shekel(tot["balance"]) if tot["balance"] > 0 else "—"]
    _add_table(doc, headers, rows, totals_row=totals)

    _add_para(doc, "פירוט הוצאות", bold=True, size=14)
    if not payload["expenses_by_month"]:
        _add_para(doc, "אין הוצאות בתקופה זו")
    else:
        exp_rows = []
        for g in payload["expenses_by_month"]:
            for i, r in enumerate(g["rows"]):
                exp_rows.append([g["month_label"] if i == 0 else "",
                                 r["description"], r["category"], _shekel(r["amount"])])
            exp_rows.append([f"סה״כ {g['month_label']}", "", "", _shekel(g["subtotal"])])
        exp_rows.append(["סה״כ הוצאות", "", "", _shekel(payload["expenses_grand_total"])])
        _add_table(doc, ["חודש", "תיאור", "קטגוריה", "סכום"], exp_rows)

    if payload["debtors_period"] or payload["debtors_lifetime"]:
        _add_para(doc, "חייבים – יתרת חוב פתוח", bold=True, size=14)
        for label, debtors in [("חוב לתקופה זו", payload["debtors_period"]),
                                ("יתרת חוב כוללת", payload["debtors_lifetime"])]:
            if not debtors: continue
            _add_para(doc, label, bold=True)
            _add_table(doc, ["דירה", "שם דייר", "חוב", "הערה"],
                       [[d["apartment_number"], d["tenant_name"], _shekel(d["debt"]), d["note"]] for d in debtors])

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

**Step 4: Run tests until green**

Run: `cd backend && pytest tests/test_report_docx.py -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/app/services/report_docx.py backend/tests/test_report_docx.py
git commit -m "feat(reports): add python-docx Word renderer with RTL support"
```

---

### Task 7: Wire up router endpoints

**Files:**
- Modify: `backend/app/routers/buildings.py`
- Create: `backend/tests/test_report_endpoints.py`

**Step 1: Write failing tests**

```python
import datetime as dt

def test_get_report_returns_payload(client, auth_headers, sample_building_with_data):
    r = client.get(f"/api/v1/buildings/{sample_building_with_data.id}/report?from=2026-01&to=2026-03",
                   headers=auth_headers)
    assert r.status_code == 200
    payload = r.json()
    assert payload["building"]["name"] == sample_building_with_data.name
    assert payload["period"]["granularity"] == "month"

def test_get_report_pdf_returns_pdf(client, auth_headers, sample_building_with_data):
    r = client.get(f"/api/v1/buildings/{sample_building_with_data.id}/report.pdf?from=2026-01&to=2026-03",
                   headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    assert "filename" in r.headers["content-disposition"]

def test_get_report_docx_returns_docx(client, auth_headers, sample_building_with_data):
    r = client.get(f"/api/v1/buildings/{sample_building_with_data.id}/report.docx?from=2026-01&to=2026-03",
                   headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert r.content[:2] == b"PK"

def test_unauthenticated_request_is_rejected(client, sample_building_with_data):
    r = client.get(f"/api/v1/buildings/{sample_building_with_data.id}/report?from=2026-01&to=2026-03")
    assert r.status_code in (401, 403)
```

**Step 2: Run tests — should fail (404 for the new paths)**

Run: `cd backend && pytest tests/test_report_endpoints.py -v`
Expected: FAIL.

**Step 3: Add the endpoints**

Open `backend/app/routers/buildings.py` and add (matching existing imports / dep style):

```python
import datetime as dt
import urllib.parse
from fastapi import HTTPException
from fastapi.responses import Response

from app.services.report_data import build_report_payload
from app.services.report_pdf import render_report_pdf
from app.services.report_docx import render_report_docx


def _parse_period(from_: str, to: str) -> tuple[dt.date, dt.date]:
    try:
        f = dt.datetime.strptime(from_, "%Y-%m").date()
        t = dt.datetime.strptime(to, "%Y-%m").date()
    except ValueError:
        raise HTTPException(400, "from/to must be YYYY-MM")
    # Snap to month boundaries
    last_day = (t.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
    return f.replace(day=1), last_day


@router.get("/{building_id}/report")
def get_building_report(building_id: UUID, from_: str = Query(alias="from"), to: str = Query(...),
                       db: Session = Depends(get_db),
                       _user: User = Depends(get_current_user)):
    f, t = _parse_period(from_, to)
    return build_report_payload(db, building_id, f, t)


@router.get("/{building_id}/report.pdf")
def get_building_report_pdf(building_id: UUID, from_: str = Query(alias="from"), to: str = Query(...),
                            db: Session = Depends(get_db),
                            _user: User = Depends(get_current_user)):
    f, t = _parse_period(from_, to)
    payload = build_report_payload(db, building_id, f, t)
    pdf = render_report_pdf(payload)
    fname = urllib.parse.quote(f"דוח_{payload['building']['name']}_{payload['period']['label']}.pdf")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"})


@router.get("/{building_id}/report.docx")
def get_building_report_docx(building_id: UUID, from_: str = Query(alias="from"), to: str = Query(...),
                             db: Session = Depends(get_db),
                             _user: User = Depends(get_current_user)):
    f, t = _parse_period(from_, to)
    payload = build_report_payload(db, building_id, f, t)
    doc = render_report_docx(payload)
    fname = urllib.parse.quote(f"דוח_{payload['building']['name']}_{payload['period']['label']}.docx")
    return Response(content=doc,
                    media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"})
```

Adjust imports (`UUID`, `Query`, `Depends`, `get_db`, `get_current_user`, `User`, `router`) to match what's already in `buildings.py`.

**Step 4: Run tests until green**

Run: `cd backend && pytest tests/test_report_endpoints.py -v`
Expected: PASS.

**Step 5: Run the full backend suite to catch regressions**

Run: `cd backend && pytest -q`
Expected: All previously passing tests still pass.

**Step 6: Commit**

```bash
git add backend/app/routers/buildings.py backend/tests/test_report_endpoints.py
git commit -m "feat(reports): expose /report, /report.pdf, /report.docx endpoints"
```

---

## Phase B — Frontend

### Task 8: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add types**

```typescript
export type ReportPeriodColumn = { key: string; label: string };

export type BuildingReportPayload = {
  building: { name: string; address: string; city: string; expected_monthly_payment: number | null };
  period:   { from: string; to: string; label: string; columns: ReportPeriodColumn[]; granularity: "month" | "quarter" };
  summary:  { total_income: number; total_expenses: number; net_balance: number };
  income_by_tenant: Array<{
    apartment_number: number; tenant_name: string;
    cells: Array<{ key: string; amount: number }>;
    paid_total: number; expected_total: number; balance: number;
  }>;
  income_totals_row: {
    cells: Array<{ key: string; amount: number }>;
    paid_total: number; expected_total: number; balance: number;
  };
  expenses_by_month: Array<{
    month_label: string;
    rows: Array<{ description: string; category: string; amount: number }>;
    subtotal: number;
  }>;
  expenses_grand_total: number;
  debtors_period:   Array<{ apartment_number: number; tenant_name: string; debt: number; note: string }>;
  debtors_lifetime: Array<{ apartment_number: number; tenant_name: string; debt: number; note: string }>;
};

export type ReportFormat = "pdf" | "docx";
```

**Step 2: Type-check**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(reports): add BuildingReportPayload types"
```

---

### Task 9: Frontend API client

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: Add functions**

```typescript
export async function getBuildingReport(buildingId: string, from: string, to: string): Promise<BuildingReportPayload> {
  return fetchAPI(`/buildings/${buildingId}/report?from=${from}&to=${to}`);
}

export async function downloadBuildingReport(
  buildingId: string, from: string, to: string, format: ReportFormat
): Promise<{ blob: Blob; filename: string }> {
  const url = `${API_URL}/api/v1/buildings/${buildingId}/report.${format}?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const filename = m ? decodeURIComponent(m[1]) : `report.${format}`;
  return { blob, filename };
}
```

Use whatever helpers (`fetchAPI`, `authHeaders`, `API_URL`) already exist in this file — read it before editing.

**Step 2: Type-check**

Run: `cd frontend && npm run build`
Expected: Succeeds.

**Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(reports): add API client functions for report fetch and download"
```

---

### Task 10: Extract `PeriodSelector` component

**Files:**
- Find the existing chip selector on the building detail page (likely in `pages/Buildings.tsx` or a child component) — search for the chip labels first:

  ```bash
  grep -rn "החודש\|6 חודשים\|מותאם אישית" frontend/src/
  ```
- Create: `frontend/src/components/reports/PeriodSelector.tsx`
- Modify: the file currently rendering those chips, to import the shared component

**Step 1: Identify and read the existing implementation**

Read the file containing the chip group. Note its props, state, and date utilities.

**Step 2: Extract into `PeriodSelector.tsx`**

```tsx
import { useState } from "react";

export type PeriodValue = { from: string; to: string };  // YYYY-MM

type Props = {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
};

const PRESETS = [
  { key: "1m",  label: "החודש",        months: 1 },
  { key: "3m",  label: "3 חודשים",     months: 3 },
  { key: "6m",  label: "6 חודשים",     months: 6 },
  { key: "12m", label: "12 חודשים",    months: 12 },
  { key: "custom", label: "מותאם אישית", months: 0 },
] as const;

function isoMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function shiftMonths(d: Date, n: number) { const nd = new Date(d); nd.setMonth(nd.getMonth()+n); return nd; }

export function PeriodSelector({ value, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false);

  const handlePreset = (months: number, key: string) => {
    if (key === "custom") { setCustomOpen(true); return; }
    setCustomOpen(false);
    const today = new Date();
    const to = isoMonth(today);
    const from = isoMonth(shiftMonths(today, -(months - 1)));
    onChange({ from, to });
  };

  return (
    <div dir="rtl" className="flex flex-wrap gap-2 items-center">
      {PRESETS.map(p => (
        <button key={p.key}
          onClick={() => handlePreset(p.months, p.key)}
          className="px-3 py-1 rounded-full border text-sm hover:bg-gray-50">
          {p.label}
        </button>
      ))}
      {customOpen && (
        <div className="flex gap-2 items-center">
          <span>מ:</span>
          <input type="month" value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="border rounded px-2 py-1" />
          <span>עד:</span>
          <input type="month" value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="border rounded px-2 py-1" />
        </div>
      )}
    </div>
  );
}
```

**Step 3: Replace inline usage on the building page with this component**

Update the existing site to import and use `PeriodSelector`.

**Step 4: Type-check + manual verify**

Run: `cd frontend && npm run build`
Expected: Succeeds.

Then start the dev server and use `preview_*` tools to confirm the existing building page period selector still works exactly as before.

**Step 5: Commit**

```bash
git add frontend/src/components/reports/PeriodSelector.tsx <other-modified-files>
git commit -m "refactor(reports): extract shared PeriodSelector component"
```

---

### Task 11: `ReportPreview` component

**Files:**
- Create: `frontend/src/components/reports/ReportPreview.tsx`

**Step 1: Implement**

```tsx
import type { BuildingReportPayload } from "@/types";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

export function ReportPreview({ payload }: { payload: BuildingReportPayload }) {
  return (
    <div dir="rtl" className="mx-auto bg-white text-gray-900 shadow"
         style={{ width: "210mm", minHeight: "297mm", padding: "18mm 15mm", fontFamily: "Heebo, sans-serif", fontSize: 10 }}>
      <h1 className="text-2xl font-bold text-center mb-1">דוח הכנסות והוצאות</h1>
      <p className="text-center text-gray-500 mb-6">
        {payload.building.name} · {payload.building.address}, {payload.building.city}<br />
        {payload.period.label}
      </p>

      <h2 className="text-lg font-bold border-b mb-2 pb-1">סיכום</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card label="מאזן נוכחי"   value={fmt(payload.summary.net_balance)} />
        <Card label="סה״כ הוצאות"  value={fmt(payload.summary.total_expenses)} />
        <Card label="סה״כ הכנסות"  value={fmt(payload.summary.total_income)} />
      </div>

      <h2 className="text-lg font-bold border-b mb-2 pb-1">פירוט הכנסות לפי דייר</h2>
      {payload.building.expected_monthly_payment !== null && (
        <p className="mb-2">דמי ועד חודשי: {fmt(payload.building.expected_monthly_payment)} לדירה</p>
      )}
      <IncomeTable payload={payload} />

      <h2 className="text-lg font-bold border-b mt-6 mb-2 pb-1">פירוט הוצאות</h2>
      {payload.expenses_by_month.length === 0
        ? <div className="text-gray-500 italic text-center py-3">אין הוצאות בתקופה זו</div>
        : <ExpensesTable payload={payload} />}

      {(payload.debtors_period.length > 0 || payload.debtors_lifetime.length > 0) && (
        <>
          <h2 className="text-lg font-bold border-b mt-6 mb-2 pb-1">חייבים – יתרת חוב פתוח</h2>
          {payload.debtors_period.length > 0 && (
            <DebtorsTable title="חוב לתקופה זו" rows={payload.debtors_period} />
          )}
          {payload.debtors_lifetime.length > 0 && (
            <DebtorsTable title="יתרת חוב כוללת" rows={payload.debtors_lifetime} />
          )}
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-3 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

function IncomeTable({ payload }: { payload: BuildingReportPayload }) {
  const cols = payload.period.columns;
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="bg-gray-50">
        <tr>
          <Th>דירה</Th><Th>שם דייר</Th>
          {cols.map(c => <Th key={c.key}>{c.label}</Th>)}
          <Th>שולם</Th><Th>לתשלום</Th><Th>יתרה</Th>
        </tr>
      </thead>
      <tbody>
        {payload.income_by_tenant.map(r => (
          <tr key={r.apartment_number}>
            <Td>{r.apartment_number}</Td>
            <Td>{r.tenant_name}</Td>
            {r.cells.map(c => <Td key={c.key} className="tabular-nums">{fmt(c.amount)}</Td>)}
            <Td className="tabular-nums">{fmt(r.paid_total)}</Td>
            <Td className="tabular-nums">{fmt(r.expected_total)}</Td>
            <Td className="tabular-nums">{r.balance > 0 ? fmt(r.balance) : "—"}</Td>
          </tr>
        ))}
        <tr className="font-bold bg-gray-50">
          <Td colSpan={2}>סה״כ</Td>
          {payload.income_totals_row.cells.map(c => <Td key={c.key} className="tabular-nums">{fmt(c.amount)}</Td>)}
          <Td className="tabular-nums">{fmt(payload.income_totals_row.paid_total)}</Td>
          <Td className="tabular-nums">{fmt(payload.income_totals_row.expected_total)}</Td>
          <Td className="tabular-nums">{payload.income_totals_row.balance > 0 ? fmt(payload.income_totals_row.balance) : "—"}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function ExpensesTable({ payload }: { payload: BuildingReportPayload }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="bg-gray-50">
        <tr><Th>חודש</Th><Th>תיאור</Th><Th>קטגוריה</Th><Th>סכום</Th></tr>
      </thead>
      <tbody>
        {payload.expenses_by_month.map(g => (
          <>
            {g.rows.map((r, i) => (
              <tr key={`${g.month_label}-${i}`}>
                <Td>{i === 0 ? g.month_label : ""}</Td>
                <Td>{r.description}</Td>
                <Td>{r.category}</Td>
                <Td className="tabular-nums">{fmt(r.amount)}</Td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <Td colSpan={3}>סה״כ {g.month_label}</Td>
              <Td className="tabular-nums">{fmt(g.subtotal)}</Td>
            </tr>
          </>
        ))}
        <tr className="font-bold bg-gray-100">
          <Td colSpan={3}>סה״כ הוצאות</Td>
          <Td className="tabular-nums">{fmt(payload.expenses_grand_total)}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function DebtorsTable({ title, rows }: { title: string; rows: BuildingReportPayload["debtors_period"] }) {
  return (
    <>
      <h3 className="font-bold mt-3 mb-1">{title}</h3>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gray-50"><tr><Th>דירה</Th><Th>שם דייר</Th><Th>חוב</Th><Th>הערה</Th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.apartment_number}>
              <Td>{d.apartment_number}</Td>
              <Td>{d.tenant_name}</Td>
              <Td className="tabular-nums">{fmt(d.debt)}</Td>
              <Td>{d.note}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="border p-1 text-start font-bold">{children}</th>; }
function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={`border p-1 text-start ${className ?? ""}`} colSpan={colSpan}>{children}</td>;
}
```

**Step 2: Type-check**

Run: `cd frontend && npm run build`
Expected: Succeeds.

**Step 3: Commit**

```bash
git add frontend/src/components/reports/ReportPreview.tsx
git commit -m "feat(reports): add ReportPreview component (RTL HTML)"
```

---

### Task 12: `ExportReportDialog` modal

**Files:**
- Create: `frontend/src/components/reports/ExportReportDialog.tsx`

**Step 1: Read current Dialog/Modal patterns**

Run:
```bash
grep -rn "shadcn" frontend/src/components/ui/dialog* 2>/dev/null
ls frontend/src/components/ui/
```

Use the existing `Dialog` primitive (shadcn/ui) and `Button`.

**Step 2: Implement**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PeriodSelector, type PeriodValue } from "./PeriodSelector";
import { ReportPreview } from "./ReportPreview";
import { getBuildingReport, downloadBuildingReport } from "@/services/api";
import type { ReportFormat } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
};

function defaultPeriod(): PeriodValue {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const fromDate = new Date(now); fromDate.setMonth(fromDate.getMonth() - 2);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth()+1).padStart(2,"0")}`;
  return { from, to };
}

export function ExportReportDialog({ open, onOpenChange, buildingId }: Props) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);

  const { data: payload, isLoading, error } = useQuery({
    queryKey: ["building-report", buildingId, period.from, period.to],
    queryFn: () => getBuildingReport(buildingId, period.from, period.to),
    enabled: open,
  });

  const handleDownload = async (format: ReportFormat) => {
    setDownloading(format);
    try {
      const { blob, filename } = await downloadBuildingReport(buildingId, period.from, period.to, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>ייצוא דוח</DialogTitle></DialogHeader>

        <div className="px-1 py-2 border-b">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          {isLoading && <div className="text-center text-gray-500 py-12">טוען תצוגה מקדימה...</div>}
          {error && <div className="text-center text-red-600 py-12">שגיאה בטעינת הדוח</div>}
          {payload && <ReportPreview payload={payload} />}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={() => handleDownload("docx")} disabled={!payload || downloading !== null}>
            {downloading === "docx" ? "מוריד..." : "הורד Word"}
          </Button>
          <Button onClick={() => handleDownload("pdf")} disabled={!payload || downloading !== null}>
            {downloading === "pdf" ? "מוריד..." : "הורד PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Type-check**

Run: `cd frontend && npm run build`
Expected: Succeeds.

**Step 4: Commit**

```bash
git add frontend/src/components/reports/ExportReportDialog.tsx
git commit -m "feat(reports): add ExportReportDialog with preview and download"
```

---

### Task 13: Wire the export button into the building detail page

**Files:**
- Modify: building detail page (find with `grep -rn "העלה דף חשבון\|דיירים" frontend/src/pages frontend/src/components`)

**Step 1: Locate the action button row**

Run the grep above. Open the file rendering those buttons.

**Step 2: Add the new button**

Import and render alongside existing buttons:

```tsx
import { ExportReportDialog } from "@/components/reports/ExportReportDialog";
const [exportOpen, setExportOpen] = useState(false);

<Button variant="outline" onClick={() => setExportOpen(true)}>
  📄 ייצוא דוח
</Button>

<ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} buildingId={building.id} />
```

Match button styling to neighbouring buttons.

**Step 3: Type-check + dev server**

Run: `cd frontend && npm run build`
Expected: Succeeds.

Then:
```bash
cd frontend && npm run dev
```

Open the app, navigate to a building, click `ייצוא דוח`, change the period, verify preview updates, click both download buttons, verify files open correctly in Preview.app and Word/Pages.

**Step 4: Commit**

```bash
git add frontend/src/pages/Buildings.tsx <or whichever file>
git commit -m "feat(reports): add ייצוא דוח button to building detail header"
```

---

## Phase C — Verification

### Task 14: End-to-end smoke test on a real building

**Step 1: Run backend + frontend together**

```bash
cd backend && uvicorn app.main:app --reload &
cd frontend && npm run dev
```

**Step 2: Manual test matrix**

| Period preset | Expected behavior |
|---|---|
| `החודש` (1 month) | Single month column, label `<month> 2026` |
| `3 חודשים` | 3 month columns |
| `6 חודשים` | 6 month columns, still month granularity |
| `12 חודשים` | 4 quarter columns, label `2026` (if calendar year) or literal range otherwise |
| Custom 15/01 → 20/03 | 3 month columns, label `15.01.2026 – 20.03.2026` |

For each: verify HTML preview, then download PDF and Word and visually compare to the reference sample. Confirm Hebrew RTL ordering, currency formatting, and that empty sections are omitted.

**Step 3: Hebrew/RTL spot checks in the PDF**

- Building name and Hebrew tenant names render correctly (no question marks, no reversed-character bugs).
- Numbers `₪3,210` appear with the shekel symbol on the leading side (right side, since RTL).
- Page footer reads `עמוד 1 | LeadPay`.

**Step 4: Word-format spot check**

Open the .docx in Word/Pages. Confirm:
- Tables flow right-to-left.
- David font renders Hebrew correctly.
- No layout overflow on A4.

**Step 5: Final commit (if any cleanup)**

```bash
git status
# if there are any small fixes from manual verification:
git add . && git commit -m "fix(reports): <specific fix>"
```

**Step 6: DO NOT push**

Per CLAUDE.md: "Keep commits local — push to GitHub only with explicit approval." Stop here. The user will trigger the deploy.

---

## Out of scope (for follow-up plans)

- Per-user/per-company branding
- Email/share-link delivery
- Saved or scheduled reports
- A real `payment_method` field on expenses
- Hebrew calendar dates

## Risk register

| Risk | Mitigation |
|---|---|
| WeasyPrint deps fail on Railway | Task 1 Step 3 adds the apt packages; Task 14 verifies the deploy renders a real PDF |
| Heebo variable font incompatible with WeasyPrint | Task 2 Step 1 documents the static-font fallback |
| Lifetime debtors helper missing | `report_data._lifetime_debtors` returns `[]` until a backend balance helper exists; sub-section is omitted when empty so the report still renders |
| Custom unaligned date range edge cases | Tested explicitly in Task 3 |
| RTL bugs in .docx | python-docx tests load the file and assert content; manual verification in Task 14 catches visual issues |
