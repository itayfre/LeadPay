# Tenant Report Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-tenant payment-statement export (PDF/Word, single file or ZIP for multi-tenant) accessible from the existing ExportReportDialog via a "בניין/דיירים" toggle.

**Architecture:** Mirrors the building-report pattern shipped in `docs/plans/2026-05-10-building-report-export.md` — payload-then-render with `tenant_report_data.py` building a JSON dict, Jinja+WeasyPrint for PDF, python-docx for Word, plus a `zipfile`-based bulk helper. Reuses period parsing, Heebo font, and the DOCX RTL helpers already in place.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy 2.0 / WeasyPrint / python-docx / Jinja2 · React 18 / TypeScript / React Query / Tailwind / shadcn-style modal.

**Design reference:** `docs/plans/2026-05-11-tenant-report-export-design.md`

**Worktree:** Create `.worktrees/feature-tenant-report` on branch `feature/tenant-report` before starting (use @superpowers:using-git-worktrees).

---

## Task 1: Pure-logic unit tests for tenant period math

**Files:**
- Create: `backend/tests/test_tenant_report_data.py`
- Touch: nothing yet (TDD red phase)

**Why:** Lock in the period math and summary calculations before wiring DB code. Mirrors the approach used in `tests/test_report_data.py`.

**Step 1: Write the failing tests**

```python
# backend/tests/test_tenant_report_data.py
import datetime as dt
import pytest

from app.services.tenant_report_data import (
    _period_label,
    _period_months,
    _compute_summary,
)


def test_period_label_full_quarter():
    assert _period_label(dt.date(2026, 1, 1), dt.date(2026, 3, 31)) == "רבעון א 2026"


def test_period_label_single_month():
    assert _period_label(dt.date(2026, 4, 1), dt.date(2026, 4, 30)) == "אפריל 2026"


def test_period_months_inclusive_range():
    months = _period_months(dt.date(2026, 1, 1), dt.date(2026, 3, 31))
    assert months == [(2026, 1), (2026, 2), (2026, 3)]


def test_period_months_excludes_pre_move_in():
    months = _period_months(
        dt.date(2026, 1, 1), dt.date(2026, 3, 31),
        move_in_date=dt.date(2026, 2, 15),
    )
    # February is included once move_in_date falls within the month.
    assert months == [(2026, 2), (2026, 3)]


def test_compute_summary_period_debt_clamped_at_zero():
    s = _compute_summary(period_expected=500, period_paid=800, lifetime_debt=0, tx_count=2)
    assert s["period_debt"] == 0
    assert s["period_paid"] == 800
    assert s["period_expected"] == 500
    assert s["transaction_count"] == 2


def test_compute_summary_lifetime_debt_passed_through():
    s = _compute_summary(period_expected=300, period_paid=0, lifetime_debt=1200, tx_count=0)
    assert s["period_debt"] == 300
    assert s["lifetime_debt"] == 1200
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && /opt/homebrew/bin/python3.11 -m pytest tests/test_tenant_report_data.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.tenant_report_data'`

**Step 3: Create skeleton with the three pure helpers**

```python
# backend/app/services/tenant_report_data.py
"""
Per-tenant report payload builder.
Mirrors report_data.py but scoped to a single tenant.
"""
import datetime as dt
from typing import Optional

HEB_MONTHS = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
]
HEB_QUARTERS = {1: "רבעון א", 2: "רבעון ב", 3: "רבעון ג", 4: "רבעון ד"}


def _period_label(from_d: dt.date, to_d: dt.date) -> str:
    if from_d.year == to_d.year and from_d.month == to_d.month:
        return f"{HEB_MONTHS[from_d.month - 1]} {from_d.year}"
    if (
        from_d.year == to_d.year
        and from_d.month % 3 == 1
        and to_d.month == from_d.month + 2
    ):
        q = (from_d.month - 1) // 3 + 1
        return f"{HEB_QUARTERS[q]} {from_d.year}"
    if from_d.year == to_d.year and from_d.month == 1 and to_d.month == 12:
        return str(from_d.year)
    return f"{from_d.strftime('%d.%m.%Y')} – {to_d.strftime('%d.%m.%Y')}"


def _period_months(
    from_d: dt.date,
    to_d: dt.date,
    move_in_date: Optional[dt.date] = None,
) -> list[tuple[int, int]]:
    start = from_d
    if move_in_date and move_in_date > from_d:
        start = move_in_date.replace(day=1)
    months: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (to_d.year, to_d.month):
        months.append((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1
    return months


def _compute_summary(
    *, period_expected: float, period_paid: float, lifetime_debt: float, tx_count: int
) -> dict:
    return {
        "period_expected": float(period_expected),
        "period_paid": float(period_paid),
        "period_debt": float(max(period_expected - period_paid, 0)),
        "lifetime_debt": float(lifetime_debt),
        "transaction_count": int(tx_count),
    }
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && /opt/homebrew/bin/python3.11 -m pytest tests/test_tenant_report_data.py -v
```
Expected: 6 passed

**Step 5: Commit**

```bash
git add backend/tests/test_tenant_report_data.py backend/app/services/tenant_report_data.py
git commit -m "test(tenant-report): pure-logic helpers for period math + summary"
```

---

## Task 2: `build_tenant_report_payload()` end-to-end

**Files:**
- Modify: `backend/app/services/tenant_report_data.py`
- (Test happens via the integration test in Task 5; no DB unit test here — pure logic is already covered)

**Step 1: Add the builder**

Append to `backend/app/services/tenant_report_data.py`:

```python
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..models import Apartment, Tenant, Building
from ..models.transaction_allocation import TransactionAllocation, TransactionType
from ..models.transaction import Transaction


def _expected_for_apartment(apt: Apartment, building_default: float) -> float:
    return float(apt.expected_payment) if apt.expected_payment is not None else building_default


def _lifetime_debt(db: Session, tenant: Tenant, apt: Apartment, building: Building) -> float:
    """Total expected since move_in_date minus total paid ever."""
    today = dt.date.today()
    move_in = tenant.move_in_date or dt.date(2026, 1, 1)
    if move_in > today:
        return 0.0

    months_elapsed = (today.year - move_in.year) * 12 + (today.month - move_in.month) + 1
    expected_per_month = _expected_for_apartment(apt, float(building.expected_monthly_payment or 0))
    total_expected = months_elapsed * expected_per_month

    paid_rows = (
        db.query(TransactionAllocation.amount)
        .filter(
            TransactionAllocation.tenant_id == tenant.id,
            TransactionAllocation.transaction_type == TransactionType.PAYMENT,
        )
        .all()
    )
    total_paid = sum(float(a) for (a,) in paid_rows)
    return max(total_expected - total_paid, 0.0)


def build_tenant_report_payload(
    db: Session, tenant_id: UUID, from_date: dt.date, to_date: dt.date
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise ValueError(f"Tenant {tenant_id} not found")
    apt = db.query(Apartment).filter(Apartment.id == tenant.apartment_id).first()
    if not apt:
        raise ValueError(f"Apartment for tenant {tenant_id} not found")
    building = db.query(Building).filter(Building.id == tenant.building_id).first()
    if not building:
        raise ValueError(f"Building for tenant {tenant_id} not found")

    expected_per_month = _expected_for_apartment(apt, float(building.expected_monthly_payment or 0))
    months_yyyymm = _period_months(from_date, to_date, tenant.move_in_date)

    # Payments allocated to this tenant in the period.
    allocs = (
        db.query(TransactionAllocation)
        .filter(
            TransactionAllocation.tenant_id == tenant.id,
            TransactionAllocation.transaction_type == TransactionType.PAYMENT,
            TransactionAllocation.period_year.isnot(None),
            TransactionAllocation.period_month.isnot(None),
        )
        .all()
    )
    in_range = [
        a for a in allocs
        if (a.period_year, a.period_month) in set(months_yyyymm)
    ]
    period_paid = sum(float(a.amount) for a in in_range)
    period_expected = expected_per_month * len(months_yyyymm)

    # Per-month rows.
    paid_by_month: dict[tuple[int, int], float] = {}
    for a in in_range:
        key = (a.period_year, a.period_month)
        paid_by_month[key] = paid_by_month.get(key, 0.0) + float(a.amount)

    months_payload = []
    for (y, m) in months_yyyymm:
        paid = paid_by_month.get((y, m), 0.0)
        diff = paid - expected_per_month
        if paid <= 0:
            status = "unpaid"
        elif paid + 1 < expected_per_month:
            status = "partial"
        else:
            status = "paid"
        months_payload.append({
            "month": m,
            "year": y,
            "period_label": f"{HEB_MONTHS[m - 1]} {y}",
            "expected": expected_per_month,
            "paid": paid,
            "difference": diff,
            "status": status,
        })

    # Transaction-level rows, sorted by date desc.
    tx_ids = [a.transaction_id for a in in_range]
    transactions_payload = []
    if tx_ids:
        txs = (
            db.query(Transaction)
            .filter(Transaction.id.in_(tx_ids))
            .all()
        )
        tx_by_id = {t.id: t for t in txs}
        for a in in_range:
            t = tx_by_id.get(a.transaction_id)
            if t is None:
                continue
            transactions_payload.append({
                "date": (t.activity_date.isoformat() if t.activity_date else ""),
                "amount": float(a.amount),
                "description": t.description or "",
                "is_manual": bool(getattr(t, "is_manual", False)),
                "period_month": a.period_month,
                "period_year": a.period_year,
            })
        transactions_payload.sort(key=lambda r: r["date"], reverse=True)

    summary = _compute_summary(
        period_expected=period_expected,
        period_paid=period_paid,
        lifetime_debt=_lifetime_debt(db, tenant, apt, building),
        tx_count=len(transactions_payload),
    )

    return {
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.full_name or tenant.name,
            "apartment_number": apt.apartment_number,
            "floor": apt.floor,
            "standing_order": (
                {"bank_name": tenant.bank_name, "bank_account": tenant.bank_account}
                if tenant.has_standing_order else None
            ),
            "building": {
                "name": building.name,
                "address": building.address,
                "city": building.city,
            },
        },
        "period": {
            "from": from_date.strftime("%Y-%m"),
            "to": to_date.strftime("%Y-%m"),
            "label": _period_label(from_date, to_date),
        },
        "summary": summary,
        "months": months_payload,
        "transactions": transactions_payload,
    }
```

**Step 2: Verify the existing tests still pass**

```bash
cd backend && /opt/homebrew/bin/python3.11 -m pytest tests/test_tenant_report_data.py -v
```
Expected: 6 passed (same as Task 1; we only added new symbols).

**Step 3: Commit**

```bash
git add backend/app/services/tenant_report_data.py
git commit -m "feat(tenant-report): build_tenant_report_payload — months, transactions, debt"
```

---

## Task 3: PDF template + renderer

**Files:**
- Create: `backend/app/templates/tenant_report.html.j2`
- Modify: `backend/app/services/report_pdf.py`

**Step 1: Add the renderer**

Append to `backend/app/services/report_pdf.py`:

```python
def render_tenant_report_pdf(payload: dict) -> bytes:
    try:
        from weasyprint import HTML
    except OSError as exc:
        raise RuntimeError(
            "WeasyPrint system libraries (GLib/Pango/Cairo) are not available "
            "in this environment. PDF export is unavailable."
        ) from exc
    template = _env.get_template("tenant_report.html.j2")
    html_str = template.render(payload=payload, font_dir=str(_FONTS))
    return HTML(string=html_str, base_url=str(_BASE)).write_pdf()
```

**Step 2: Create the template**

```jinja2
{# backend/app/templates/tenant_report.html.j2 #}
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'Heebo'; src: url('file://{{ font_dir }}/Heebo-Regular.ttf'); font-weight: 400; }
  @font-face { font-family: 'Heebo'; src: url('file://{{ font_dir }}/Heebo-Bold.ttf'); font-weight: 700; }
  @page {
    size: A4 portrait;
    margin: 18mm 14mm 18mm 14mm;
    @top-left { content: "{{ payload.tenant.name }} · {{ payload.period.label }}"; font-family: 'Heebo'; font-size: 9pt; color: #888; }
    @bottom-right { content: "עמוד " counter(page) " · LeadPay"; font-family: 'Heebo'; font-size: 9pt; color: #888; }
  }
  body { font-family: 'Heebo', sans-serif; direction: rtl; font-size: 10pt; color: #222; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 13pt; margin: 18px 0 8px; color: #1a1a2e; }
  .meta { color: #666; font-size: 10pt; }
  .badge { display: inline-block; background: #e7f5ff; border: 1px solid #b9dffd; color: #0d6efd; padding: 3px 8px; border-radius: 6px; font-size: 9pt; margin-top: 6px; }
  .cards { display: flex; gap: 10mm; margin: 12mm 0 6mm; }
  .card { flex: 1; padding: 6mm; border-radius: 8px; text-align: center; }
  .card-debt-p { background: #fff3f3; border: 1px solid #ffd5d5; }
  .card-debt-l { background: #fff8e8; border: 1px solid #ffe4a8; }
  .card-paid   { background: #eef9f0; border: 1px solid #c1e7c8; }
  .card .lbl { font-size: 9pt; color: #555; margin-bottom: 4px; }
  .card .val { font-size: 16pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #d8d8d8; padding: 4px 6px; text-align: right; font-size: 9.5pt; }
  th { background: #f3f3f3; font-weight: 700; }
  tr.unpaid  td { background: #fff5f5; }
  tr.partial td { background: #fffbe6; }
  .empty { color: #888; font-style: italic; margin-top: 6px; }
</style>
</head>
<body>
  <h1>{{ payload.tenant.name }}</h1>
  <div class="meta">
    דירה {{ payload.tenant.apartment_number }}{% if payload.tenant.floor %} · קומה {{ payload.tenant.floor }}{% endif %}
    · {{ payload.tenant.building.name }}, {{ payload.tenant.building.address }}, {{ payload.tenant.building.city }}
  </div>
  <div class="meta"><strong>{{ payload.period.label }}</strong></div>
  {% if payload.tenant.standing_order %}
    <div class="badge">
      הוראת קבע פעילה{% if payload.tenant.standing_order.bank_name %} — {{ payload.tenant.standing_order.bank_name }}{% endif %}
      {%- if payload.tenant.standing_order.bank_account %}, חשבון {{ payload.tenant.standing_order.bank_account }}{% endif %}
    </div>
  {% endif %}

  <div class="cards">
    <div class="card card-debt-p"><div class="lbl">חוב לתקופה</div><div class="val">₪{{ "{:,.0f}".format(payload.summary.period_debt) }}</div></div>
    <div class="card card-debt-l"><div class="lbl">חוב כולל</div><div class="val">₪{{ "{:,.0f}".format(payload.summary.lifetime_debt) }}</div></div>
    <div class="card card-paid"><div class="lbl">סה״כ שולם בתקופה</div><div class="val">₪{{ "{:,.0f}".format(payload.summary.period_paid) }}</div></div>
  </div>

  <h2>פירוט חודשי</h2>
  <table>
    <thead><tr><th>חודש</th><th>צפוי</th><th>שולם</th><th>הפרש</th><th>סטטוס</th></tr></thead>
    <tbody>
      {% for r in payload.months %}
        <tr class="{{ r.status }}">
          <td>{{ r.period_label }}</td>
          <td>₪{{ "{:,.0f}".format(r.expected) }}</td>
          <td>₪{{ "{:,.0f}".format(r.paid) }}</td>
          <td>{% if r.difference < 0 %}-₪{{ "{:,.0f}".format(-r.difference) }}{% else %}₪{{ "{:,.0f}".format(r.difference) }}{% endif %}</td>
          <td>{% if r.status == 'paid' %}שולם{% elif r.status == 'partial' %}חלקי{% else %}לא שולם{% endif %}</td>
        </tr>
      {% endfor %}
    </tbody>
  </table>

  <h2>תנועות בתקופה</h2>
  {% if not payload.transactions %}
    <div class="empty">אין תנועות בתקופה זו</div>
  {% else %}
    <table>
      <thead><tr><th>תאריך</th><th>תיאור</th><th>סכום</th><th>ידני?</th></tr></thead>
      <tbody>
        {% for t in payload.transactions %}
          <tr>
            <td>{{ t.date }}</td>
            <td>{{ t.description }}</td>
            <td>₪{{ "{:,.0f}".format(t.amount) }}</td>
            <td>{% if t.is_manual %}✓{% endif %}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}
</body>
</html>
```

**Step 3: Smoke-render against a fixture**

```bash
cd backend && /opt/homebrew/bin/python3.11 -c "
from app.services.report_pdf import render_tenant_report_pdf
payload = {
  'tenant': {'id':'x','name':'גיא מן','apartment_number':5,'floor':2,'standing_order':None,
             'building':{'name':'נחל דן 17','address':'נחל דן 17','city':'כרמיאל'}},
  'period': {'from':'2026-01','to':'2026-03','label':'רבעון א 2026'},
  'summary': {'period_expected':1500,'period_paid':1000,'period_debt':500,'lifetime_debt':500,'transaction_count':1},
  'months': [{'month':1,'year':2026,'period_label':'ינואר 2026','expected':500,'paid':500,'difference':0,'status':'paid'},
             {'month':2,'year':2026,'period_label':'פברואר 2026','expected':500,'paid':500,'difference':0,'status':'paid'},
             {'month':3,'year':2026,'period_label':'מרץ 2026','expected':500,'paid':0,'difference':-500,'status':'unpaid'}],
  'transactions': [{'date':'2026-02-01','amount':500,'description':'העברה בנקאית','is_manual':False,'period_month':2,'period_year':2026}],
}
pdf = render_tenant_report_pdf(payload)
print('OK', len(pdf), 'bytes, magic:', pdf[:4])
"
```
Expected: `OK <NNNN> bytes, magic: b'%PDF'`

**Step 4: Commit**

```bash
git add backend/app/templates/tenant_report.html.j2 backend/app/services/report_pdf.py
git commit -m "feat(tenant-report): Jinja template + WeasyPrint renderer"
```

---

## Task 4: DOCX renderer

**Files:**
- Modify: `backend/app/services/report_docx.py`

**Step 1: Append the function**

```python
def render_tenant_report_docx(payload: dict) -> bytes:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = _FONT
    style.font.size = Pt(_BODY_PT)

    _add_para(doc, payload["tenant"]["name"], bold=True, size=_HEAD_PT)
    t = payload["tenant"]
    meta = f"דירה {t['apartment_number']}"
    if t.get("floor"):
        meta += f" · קומה {t['floor']}"
    meta += f" · {t['building']['name']}, {t['building']['address']}, {t['building']['city']}"
    _add_para(doc, meta)
    _add_para(doc, payload["period"]["label"], bold=True)
    if t.get("standing_order"):
        so = t["standing_order"]
        line = "הוראת קבע פעילה"
        if so.get("bank_name"):
            line += f" — {so['bank_name']}"
        if so.get("bank_account"):
            line += f", חשבון {so['bank_account']}"
        _add_para(doc, line)

    doc.add_paragraph()
    _add_para(doc, "סיכום", bold=True, size=_SUB_PT)
    s = payload["summary"]
    _add_table(
        doc,
        ["סה״כ שולם בתקופה", "חוב כולל", "חוב לתקופה"],
        [[_shekel(s["period_paid"]), _shekel(s["lifetime_debt"]), _shekel(s["period_debt"])]],
    )

    doc.add_paragraph()
    _add_para(doc, "פירוט חודשי", bold=True, size=_SUB_PT)
    rows = []
    for r in payload["months"]:
        status_he = {"paid": "שולם", "partial": "חלקי", "unpaid": "לא שולם"}.get(r["status"], "")
        diff = r["difference"]
        diff_s = ("-" + _shekel(-diff)) if diff < 0 else _shekel(diff)
        rows.append([r["period_label"], _shekel(r["expected"]), _shekel(r["paid"]), diff_s, status_he])
    _add_table(doc, ["חודש", "צפוי", "שולם", "הפרש", "סטטוס"], rows)

    doc.add_paragraph()
    _add_para(doc, "תנועות בתקופה", bold=True, size=_SUB_PT)
    if not payload["transactions"]:
        _add_para(doc, "אין תנועות בתקופה זו")
    else:
        tx_rows = [
            [tx["date"], tx["description"], _shekel(tx["amount"]), "✓" if tx["is_manual"] else ""]
            for tx in payload["transactions"]
        ]
        _add_table(doc, ["תאריך", "תיאור", "סכום", "ידני?"], tx_rows)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

**Step 2: Smoke test**

```bash
cd backend && /opt/homebrew/bin/python3.11 -c "
from app.services.report_docx import render_tenant_report_docx
payload = {  # same fixture as Task 3
  'tenant': {'id':'x','name':'גיא מן','apartment_number':5,'floor':2,'standing_order':None,
             'building':{'name':'נחל דן 17','address':'נחל דן 17','city':'כרמיאל'}},
  'period': {'from':'2026-01','to':'2026-03','label':'רבעון א 2026'},
  'summary': {'period_expected':1500,'period_paid':1000,'period_debt':500,'lifetime_debt':500,'transaction_count':1},
  'months': [{'month':1,'year':2026,'period_label':'ינואר 2026','expected':500,'paid':500,'difference':0,'status':'paid'}],
  'transactions': [],
}
b = render_tenant_report_docx(payload)
print('OK', len(b), 'bytes, magic:', b[:2])
"
```
Expected: `OK <NNNN> bytes, magic: b'PK'`

**Step 3: Commit**

```bash
git add backend/app/services/report_docx.py
git commit -m "feat(tenant-report): python-docx Word renderer with RTL"
```

---

## Task 5: Single-tenant API endpoints

**Files:**
- Modify: `backend/app/routers/tenants.py`

**Step 1: Add imports + endpoints**

Top of file — add imports:

```python
import urllib.parse
from fastapi.responses import Response
from ..services.tenant_report_data import build_tenant_report_payload
from ..services.report_pdf import render_tenant_report_pdf
from ..services.report_docx import render_tenant_report_docx
from ..routers.buildings import _parse_report_period  # reuse
```

At the bottom of `tenants.py`, append the three endpoints:

```python
# ─── Tenant report endpoints ──────────────────────────────────────────────────

@router.get("/{tenant_id}/report")
def get_tenant_report(
    tenant_id: UUID,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_auth),
):
    f, t = _parse_report_period(from_, to)
    try:
        return build_tenant_report_payload(db, tenant_id, f, t)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{tenant_id}/report.pdf")
def get_tenant_report_pdf(
    tenant_id: UUID,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_auth),
):
    f, t = _parse_report_period(from_, to)
    try:
        payload = build_tenant_report_payload(db, tenant_id, f, t)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    pdf = render_tenant_report_pdf(payload)
    fname = urllib.parse.quote(f"דוח_{payload['tenant']['name']}_{payload['period']['label']}.pdf")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )


@router.get("/{tenant_id}/report.docx")
def get_tenant_report_docx(
    tenant_id: UUID,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_auth),
):
    f, t = _parse_report_period(from_, to)
    try:
        payload = build_tenant_report_payload(db, tenant_id, f, t)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    doc = render_tenant_report_docx(payload)
    fname = urllib.parse.quote(f"דוח_{payload['tenant']['name']}_{payload['period']['label']}.docx")
    return Response(
        content=doc,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )
```

Check that `Query`, `UUID`, `HTTPException`, `status`, `User`, `Depends`, `Session`, `require_any_auth`, `get_db` are already imported at the top of `tenants.py`. If any is missing, add it.

**Step 2: Smoke-test against running backend**

```bash
# Start backend in another terminal: cd backend && uvicorn app.main:app --reload
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<your@email>","password":"<your-pass>"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

TID=<some tenant uuid in dev DB>
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/tenants/$TID/report?from=2026-01&to=2026-03"
# Expected: 200 application/json
```

Then download:
```bash
curl -s -o /tmp/tenant.pdf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/tenants/$TID/report.pdf?from=2026-01&to=2026-03"
file /tmp/tenant.pdf   # → PDF document
```

**Step 3: Commit**

```bash
git add backend/app/routers/tenants.py
git commit -m "feat(tenant-report): /tenants/{id}/report, .pdf, .docx endpoints"
```

---

## Task 6: Bulk ZIP helper

**Files:**
- Modify: `backend/app/services/tenant_report_data.py`

**Step 1: Append the helper**

```python
import io
import zipfile
from typing import Literal


def build_bulk_report_zip(
    db: Session,
    tenant_ids: list[UUID],
    from_date: dt.date,
    to_date: dt.date,
    fmt: Literal["pdf", "docx"],
) -> tuple[bytes, str]:
    """
    Render reports for every tenant id and pack into a ZIP.
    Returns (zip_bytes, zip_filename).

    On per-tenant render failure: include a .txt with the error and continue.
    """
    # Lazy imports — same lazy strategy as report_pdf.
    from .report_pdf import render_tenant_report_pdf
    from .report_docx import render_tenant_report_docx
    renderer = render_tenant_report_pdf if fmt == "pdf" else render_tenant_report_docx
    ext = "pdf" if fmt == "pdf" else "docx"

    buf = io.BytesIO()
    building_name = "דוחות"
    period_label = ""

    # Detect filename collisions up front.
    name_counts: dict[str, int] = {}
    for tid in tenant_ids:
        t = db.query(Tenant).filter(Tenant.id == tid).first()
        if t:
            n = t.full_name or t.name
            name_counts[n] = name_counts.get(n, 0) + 1
    collisions = {n for n, c in name_counts.items() if c > 1}

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for tid in tenant_ids:
            try:
                payload = build_tenant_report_payload(db, tid, from_date, to_date)
            except ValueError as e:
                zf.writestr(f"שגיאה_{tid}.txt", str(e))
                continue
            try:
                content = renderer(payload)
            except Exception as e:  # noqa: BLE001 — log + continue, never abort the batch
                zf.writestr(
                    f"שגיאה_{payload['tenant']['name']}.txt",
                    f"רינדור הדוח נכשל: {e}",
                )
                continue

            name = payload["tenant"]["name"]
            if name in collisions:
                inner = f"דוח_{name}_דירה{payload['tenant']['apartment_number']}.{ext}"
            else:
                inner = f"דוח_{name}.{ext}"
            zf.writestr(inner, content)
            building_name = payload["tenant"]["building"]["name"]
            period_label = payload["period"]["label"]

    zip_filename = f"דוחות_{building_name}_{period_label}.zip" if period_label else "דוחות.zip"
    return buf.getvalue(), zip_filename
```

**Step 2: Verify earlier tests still pass**

```bash
cd backend && /opt/homebrew/bin/python3.11 -m pytest tests/test_tenant_report_data.py -v
```
Expected: 6 passed

**Step 3: Commit**

```bash
git add backend/app/services/tenant_report_data.py
git commit -m "feat(tenant-report): bulk ZIP helper with collision-safe filenames"
```

---

## Task 7: Bulk endpoint

**Files:**
- Modify: `backend/app/routers/tenants.py`

**Step 1: Add the Pydantic body + endpoint**

Near the top, with other schemas:

```python
from pydantic import BaseModel, Field

class BulkReportRequest(BaseModel):
    tenant_ids: list[UUID] = Field(..., min_length=1, max_length=50)
```

At the bottom of the file:

```python
@router.post("/bulk-report")
def post_bulk_tenant_report(
    body: BulkReportRequest,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    fmt: Literal["pdf", "docx"] = Query("pdf", alias="format"),
    db: Session = Depends(get_db),
    _: User = Depends(require_any_auth),
):
    from ..services.tenant_report_data import build_bulk_report_zip

    f, t = _parse_report_period(from_, to)

    # All tenants must belong to a single building (anti-leak guard).
    tenants = db.query(Tenant).filter(Tenant.id.in_(body.tenant_ids)).all()
    if len(tenants) != len(body.tenant_ids):
        raise HTTPException(status_code=400, detail="Some tenant_ids are invalid")
    building_ids = {t.building_id for t in tenants}
    if len(building_ids) != 1:
        raise HTTPException(
            status_code=400,
            detail="All tenant_ids must belong to the same building",
        )

    zip_bytes, zip_filename = build_bulk_report_zip(db, body.tenant_ids, f, t, fmt)
    fname = urllib.parse.quote(zip_filename)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
    )
```

Add `from typing import Literal` if not already imported.

**Step 2: Smoke-test**

```bash
curl -s -o /tmp/bulk.zip -w "%{http_code}\n" \
  -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"tenant_ids\":[\"$TID1\",\"$TID2\"]}" \
  "http://localhost:8000/api/v1/tenants/bulk-report?from=2026-01&to=2026-03&format=pdf"
unzip -l /tmp/bulk.zip   # should list 2 PDFs
```
Expected: HTTP 200, zip contains one entry per tenant.

**Step 3: Commit**

```bash
git add backend/app/routers/tenants.py
git commit -m "feat(tenant-report): POST /tenants/bulk-report — ZIP of per-tenant files"
```

---

## Task 8: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Append**

```ts
// --- Tenant report export types ---

export interface TenantReportMonth {
  month: number;
  year: number;
  period_label: string;
  expected: number;
  paid: number;
  difference: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export interface TenantReportTransaction {
  date: string;
  amount: number;
  description: string;
  is_manual: boolean;
  period_month: number;
  period_year: number;
}

export interface TenantReportPayload {
  tenant: {
    id: string;
    name: string;
    apartment_number: number;
    floor: number;
    standing_order: { bank_name: string | null; bank_account: string | null } | null;
    building: { name: string; address: string; city: string };
  };
  period: { from: string; to: string; label: string };
  summary: {
    period_expected: number;
    period_paid: number;
    period_debt: number;
    lifetime_debt: number;
    transaction_count: number;
  };
  months: TenantReportMonth[];
  transactions: TenantReportTransaction[];
}
```

**Step 2: Verify build passes**

```bash
cd frontend && npm run build
```
Expected: `built in <N>s`, no TypeScript errors.

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(tenant-report): add TenantReportPayload type"
```

---

## Task 9: API client methods

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: Edit the `reportsAPI` block**

Update the import list to include `TenantReportPayload`, then extend the existing `reportsAPI` object:

```ts
import type {
  // …existing…
  TenantReportPayload,
} from '../types';

// inside reportsAPI:
getTenantPayload: (tenantId: string, from: string, to: string) =>
  fetchAPI<TenantReportPayload>(`/api/v1/tenants/${tenantId}/report?from=${from}&to=${to}`),

async downloadTenant(
  tenantId: string,
  from: string,
  to: string,
  format: ReportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const token = localStorage.getItem(TOKEN_KEYS.ACCESS);
  const url = `${API_BASE_URL}/api/v1/tenants/${tenantId}/report.${format}?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Tenant report download failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = m ? decodeURIComponent(m[1]) : `tenant-report.${format}`;
  return { blob, filename };
},

async downloadTenantBulk(
  tenantIds: string[],
  from: string,
  to: string,
  format: ReportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const token = localStorage.getItem(TOKEN_KEYS.ACCESS);
  const url = `${API_BASE_URL}/api/v1/tenants/bulk-report?from=${from}&to=${to}&format=${format}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tenant_ids: tenantIds }),
  });
  if (!res.ok) throw new Error(`Bulk report download failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = m ? decodeURIComponent(m[1]) : `reports.zip`;
  return { blob, filename };
},
```

**Step 2: Verify build passes**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(tenant-report): reportsAPI.getTenantPayload + download(Bulk)"
```

---

## Task 10: `TenantReportPreview` component (single-tenant preview)

**Files:**
- Create: `frontend/src/components/modals/TenantReportPreview.tsx`

**Step 1: Create the component**

```tsx
import type { TenantReportPayload } from '../../types';

const shekel = (n: number | null | undefined) =>
  n == null ? '—' : `₪${Math.round(n).toLocaleString('he-IL')}`;

const STATUS_HE: Record<'paid' | 'partial' | 'unpaid', { label: string; cls: string }> = {
  paid:    { label: 'שולם',    cls: 'bg-green-50 text-green-700' },
  partial: { label: 'חלקי',    cls: 'bg-yellow-50 text-yellow-800' },
  unpaid:  { label: 'לא שולם', cls: 'bg-red-50 text-red-700' },
};

export default function TenantReportPreview({ payload }: { payload: TenantReportPayload }) {
  const t = payload.tenant;
  return (
    <div className="space-y-6 text-sm">
      <div className="text-center pb-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
        <p className="text-gray-500 text-xs mt-1">
          דירה {t.apartment_number}{t.floor ? ` · קומה ${t.floor}` : ''} · {t.building.name}, {t.building.address}, {t.building.city}
        </p>
        <p className="text-gray-600 font-medium mt-1">{payload.period.label}</p>
        {t.standing_order && (
          <p className="inline-block mt-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md">
            הוראת קבע פעילה
            {t.standing_order.bank_name ? ` — ${t.standing_order.bank_name}` : ''}
            {t.standing_order.bank_account ? `, חשבון ${t.standing_order.bank_account}` : ''}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
          <p className="text-xs text-red-700 font-semibold mb-1">חוב לתקופה</p>
          <p className="text-xl font-bold text-red-900">{shekel(payload.summary.period_debt)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
          <p className="text-xs text-orange-700 font-semibold mb-1">חוב כולל</p>
          <p className="text-xl font-bold text-orange-900">{shekel(payload.summary.lifetime_debt)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
          <p className="text-xs text-green-700 font-semibold mb-1">סה״כ שולם בתקופה</p>
          <p className="text-xl font-bold text-green-900">{shekel(payload.summary.period_paid)}</p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">פירוט חודשי</h4>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 px-3 py-2 text-right">חודש</th>
              <th className="border border-gray-200 px-3 py-2 text-right">צפוי</th>
              <th className="border border-gray-200 px-3 py-2 text-right">שולם</th>
              <th className="border border-gray-200 px-3 py-2 text-right">הפרש</th>
              <th className="border border-gray-200 px-3 py-2 text-right">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {payload.months.map(r => (
              <tr key={`${r.year}-${r.month}`} className={STATUS_HE[r.status].cls}>
                <td className="border border-gray-200 px-3 py-1.5">{r.period_label}</td>
                <td className="border border-gray-200 px-3 py-1.5">{shekel(r.expected)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{shekel(r.paid)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{r.difference < 0 ? `-${shekel(-r.difference)}` : shekel(r.difference)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{STATUS_HE[r.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">תנועות בתקופה</h4>
        {payload.transactions.length === 0 ? (
          <p className="text-xs text-gray-500 italic">אין תנועות בתקופה זו</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-3 py-2 text-right">תאריך</th>
                <th className="border border-gray-200 px-3 py-2 text-right">תיאור</th>
                <th className="border border-gray-200 px-3 py-2 text-right">סכום</th>
                <th className="border border-gray-200 px-3 py-2 text-right">ידני?</th>
              </tr>
            </thead>
            <tbody>
              {payload.transactions.map((tx, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-200 px-3 py-1.5">{tx.date}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{tx.description}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{shekel(tx.amount)}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{tx.is_manual ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build check**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/modals/TenantReportPreview.tsx
git commit -m "feat(tenant-report): single-tenant preview component"
```

---

## Task 11: `TenantReportPanel` — picker + download

**Files:**
- Create: `frontend/src/components/modals/TenantReportPanel.tsx`

**Step 1: Create the component**

```tsx
import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import PeriodRangePicker from '../building/PeriodRangePicker';
import TenantReportPreview from './TenantReportPreview';
import { reportsAPI, tenantsAPI } from '../../services/api';
import { toYYYYMM } from '../../hooks/useBuildingPeriodRange';
import type { DateRange, MonthYear } from '../../hooks/useBuildingPeriodRange';
import type { ReportFormat, Tenant } from '../../types';

function addMonths(m: MonthYear, delta: number): MonthYear {
  const total = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}
function defaultRange(): DateRange {
  const now = new Date();
  const to: MonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };
  return { from: addMonths(to, -2), to };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  buildingId: string;
}

export default function TenantReportPanel({ buildingId }: Props) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants', buildingId],
    queryFn: () => tenantsAPI.list(buildingId),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t: Tenant) =>
      t.name.toLowerCase().includes(q) ||
      (t.full_name?.toLowerCase().includes(q) ?? false) ||
      String(t.apartment_number ?? '').includes(q)
    );
  }, [tenants, search]);

  const fromStr = toYYYYMM(range.from);
  const toStr = toYYYYMM(range.to);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const singleId = selectedIds.length === 1 ? selectedIds[0] : null;

  const { data: previewPayload, isLoading: previewLoading } = useQuery({
    queryKey: ['tenant-report-preview', singleId, fromStr, toStr],
    queryFn: () => reportsAPI.getTenantPayload(singleId!, fromStr, toStr),
    enabled: !!singleId,
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(t => t.id)));
  const clearAll = () => setSelected(new Set());

  const handleDownload = useCallback(async (format: ReportFormat) => {
    setDownloading(format);
    try {
      if (selectedIds.length === 1) {
        const { blob, filename } = await reportsAPI.downloadTenant(selectedIds[0], fromStr, toStr, format);
        triggerDownload(blob, filename);
      } else {
        const { blob, filename } = await reportsAPI.downloadTenantBulk(selectedIds, fromStr, toStr, format);
        triggerDownload(blob, filename);
      }
    } catch (err) {
      console.error('Tenant report download failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [selectedIds, fromStr, toStr]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-100">
        <PeriodRangePicker range={range} onChange={setRange} />
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Tenant list (left, RTL = right) */}
        <div className="w-72 border-l border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש דייר / דירה"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <div className="flex justify-between text-xs">
              <button onClick={selectAll} className="text-blue-600 hover:underline">בחר הכל</button>
              <span className="text-gray-500">{selected.size} נבחרו</span>
              <button onClick={clearAll} className="text-gray-500 hover:underline">נקה</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tenantsLoading && <p className="p-4 text-sm text-gray-500">טוען…</p>}
            {filtered.map((t: Tenant) => (
              <label
                key={t.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${t.is_active ? '' : 'opacity-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="cursor-pointer"
                />
                <span className="text-gray-500 w-8">{t.apartment_number ?? '—'}</span>
                <span className="flex-1">{t.name}</span>
                {!t.is_active && <span className="text-xs text-gray-400">(לא פעיל)</span>}
              </label>
            ))}
          </div>
        </div>

        {/* Preview / summary */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {selected.size === 0 && (
            <p className="text-center text-gray-400 mt-12">בחר לפחות דייר אחד מהרשימה</p>
          )}
          {selected.size === 1 && previewLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-600" />
            </div>
          )}
          {selected.size === 1 && previewPayload && (
            <TenantReportPreview payload={previewPayload} />
          )}
          {selected.size >= 2 && (
            <div className="text-center mt-12">
              <p className="text-lg font-medium text-gray-700">נבחרו {selected.size} דיירים</p>
              <p className="text-sm text-gray-500 mt-2">בלחיצה על "הורד" יישלח קובץ ZIP עם {selected.size} דוחות נפרדים.</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
        <button
          onClick={() => handleDownload('docx')}
          disabled={selected.size === 0 || downloading !== null}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          {downloading === 'docx' ? '…' : '📝'}
          {selected.size > 1 ? 'הורד ZIP (Word)' : 'הורד Word'}
        </button>
        <button
          onClick={() => handleDownload('pdf')}
          disabled={selected.size === 0 || downloading !== null}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          {downloading === 'pdf' ? '…' : '📄'}
          {selected.size > 1 ? 'הורד ZIP (PDF)' : 'הורד PDF'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Build check**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/modals/TenantReportPanel.tsx
git commit -m "feat(tenant-report): TenantReportPanel — picker + preview + downloads"
```

---

## Task 12: Wire toggle into `ExportReportDialog`

**Files:**
- Modify: `frontend/src/components/modals/ExportReportDialog.tsx`

**Step 1: Refactor the dialog to host a mode toggle**

Add `import TenantReportPanel from './TenantReportPanel';` and a `useState<'building' | 'tenant'>` for mode.

Replace the current dialog body so the structure is:

```tsx
{/* Header + toggle */}
<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
  <div className="flex items-center gap-4">
    <h2 className="text-xl font-bold text-gray-900">📄 ייצוא דוח</h2>
    <div className="flex rounded-lg bg-gray-100 p-1 text-xs">
      <button
        onClick={() => setMode('building')}
        className={`px-3 py-1.5 rounded-md font-medium ${mode === 'building' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
      >🏢 בניין</button>
      <button
        onClick={() => setMode('tenant')}
        className={`px-3 py-1.5 rounded-md font-medium ${mode === 'tenant' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
      >👤 דיירים</button>
    </div>
  </div>
  <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="סגור">&times;</button>
</div>

{/* Body: either existing building flow or new tenant panel */}
{mode === 'building'
  ? (/* …existing building period picker + preview + footer… */)
  : <TenantReportPanel buildingId={buildingId} />
}
```

The tenant panel owns its own period picker, preview, and footer buttons, so when `mode === 'tenant'` the existing building footer must not render. Easiest refactor: extract the current building body into a small `BuildingReportPanel` component inside the same file (no public export), and render one or the other based on `mode`.

**Step 2: Build check**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/modals/ExportReportDialog.tsx
git commit -m "feat(tenant-report): toggle בניין/דיירים inside ExportReportDialog"
```

---

## Task 13: End-to-end smoke test

**Steps:**

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Open a building detail page in the browser.
4. Click **📊 ייצוא דוח** → toggle to **דיירים**.
5. Pick a 3-month period; pick one tenant → verify preview renders (KPI cards, monthly table, transactions).
6. Click "הורד PDF" → file downloads, opens cleanly in Preview.app, Hebrew shows correctly.
7. Pick a second tenant → preview switches to multi-summary, footer changes to "הורד ZIP (PDF)".
8. Click "הורד ZIP (PDF)" → ZIP downloads, opens to show two PDFs, each named `דוח_<name>.pdf`.
9. Switch toggle back to **בניין** → original building flow still works unchanged.

If everything passes, finish the feature with @superpowers:finishing-a-development-branch.

---

## Notes & checklist

- `npm run build` must pass after every frontend task (TypeScript strict).
- `pytest tests/test_tenant_report_data.py` should remain green at every task.
- All new list endpoints use trailing slashes (none here — these are item endpoints, no slash needed).
- The bulk endpoint must validate building scope BEFORE rendering anything.
- Follow @superpowers:test-driven-development for tasks 1 and 2.
- Follow @superpowers:verification-before-completion before marking the feature done.
