# Building Report Export — Design

**Date:** 2026-05-10
**Status:** Approved, ready for implementation plan
**Reference sample:** `דוח_נחל_דן_17_כרמיאל_רבעון_א_2026.pdf` (provided by user)

## Goal

Let the user export an income & expenses report for any building over an arbitrary period, with a live HTML preview and the choice of downloading as PDF or Word. Output mirrors the structure of the reference PDF: header, summary cards, per-tenant income table, per-month expense table, and an outstanding-debtors section.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Period selection | Custom date range with the same presets the building page already exposes: `החודש`, `3 חודשים`, `6 חודשים`, `12 חודשים`, `מותאם אישית` |
| 2 | Export entry point | New button `📄 ייצוא דוח` next to existing action buttons (`דיירים`, `העלה דף חשבון`) in the building detail header |
| 3 | Preview behavior | HTML preview rendered in-app (instant); backend generates real PDF/Word only on the download click |
| 4 | Branding | Hard-coded `LeadPay` brand (no per-user customization) |
| 5 | Long periods | ≤ 6 months → monthly columns; > 6 months → quarterly columns (Q1/Q2/Q3/Q4) |
| 6 | Debtors section | Two sub-sections: `חוב לתקופה זו` (period only) + `יתרת חוב כוללת` (lifetime carry-forward) |
| 7 | Expense "method" column | Replaced with `קטגוריה` (existing field) — no new column or migration |
| 8 | Implementation approach | Approach 1 — WeasyPrint (PDF) + python-docx (Word) + shared JSON payload feeding React preview |
| 9 | Word font | `David` — system-safe, formal-doc default per hebrew-document-generator skill |
| 10 | Railway deps | Add Pango/Cairo system libs to support WeasyPrint (heavier image, accepted) |

## UX flow

1. On the building detail page, header row gains **`📄 ייצוא דוח`** alongside existing buttons.
2. Click opens the `ExportReportDialog` modal.
3. Modal layout:
   - **Top**: period selector — preset chips + `מ:` / `עד:` month pickers (mirrors the chips already on the building page).
   - **Body**: scrollable HTML preview, A4-portrait width (~210mm), `dir="rtl"`, styled to look close to the final PDF.
   - **Footer**: `הורד PDF` · `הורד Word` · `ביטול`.
4. Changing the period re-fetches the JSON payload and re-renders the preview (no file generation yet).
5. Download buttons hit `…/report.pdf` or `…/report.docx`, which stream the file with filename `דוח_{building_name}_{period_label}.{ext}`.

## Backend API

All under `/api/v1/buildings/{building_id}` with the same auth as existing building routes. All three call one shared service.

| Endpoint | Returns | Used by |
|---|---|---|
| `GET /report?from=YYYY-MM&to=YYYY-MM` | JSON payload | Preview |
| `GET /report.pdf?from=…&to=…` | `application/pdf` stream | `הורד PDF` |
| `GET /report.docx?from=…&to=…` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` stream | `הורד Word` |

Shared service: `build_report_payload(db, building_id, from_date, to_date) -> ReportPayload`.

## JSON payload shape

```ts
{
  building: {
    name: string,
    address: string,
    city: string,
    expected_monthly_payment: number | null
  },
  period: {
    from: "2026-01",
    to: "2026-03",
    label: "רבעון א 2026",        // pretty label, see "Period labeling" below
    columns: [{ key: "2026-01", label: "ינואר" }, ...],
    granularity: "month" | "quarter"
  },
  summary: {
    total_income: number,
    total_expenses: number,
    net_balance: number          // income - expenses
  },
  income_by_tenant: [
    {
      apartment_number: number,
      tenant_name: string,
      cells: [{ key: "2026-01", amount: number }, ...],
      paid_total: number,
      expected_total: number,
      balance: number             // expected_total - paid_total, clamped to >= 0
    }
  ],
  income_totals_row: {
    cells: [{ key, amount }, ...],
    paid_total, expected_total, balance
  },
  expenses_by_month: [
    {
      month_label: "ינואר",
      rows: [{ description: string, category: string, amount: number }],
      subtotal: number
    }
  ],
  expenses_grand_total: number,
  debtors_period:   [{ apartment_number, tenant_name, debt, note }],
  debtors_lifetime: [{ apartment_number, tenant_name, debt, note }]
}
```

### Granularity rule

- `(to - from)` ≤ 6 months → `granularity = "month"`, one column per month.
- `(to - from)` > 6 months → `granularity = "quarter"`, columns are Q1/Q2/Q3/Q4 of overlapping years (`רבעון א 2026`, `רבעון ב 2026`, …).

### Period labeling

- 1 month: `ינואר 2026`
- Aligned quarter: `רבעון א 2026`
- Calendar year: `2026`
- Anything else: `01.01.2026 – 31.03.2026`

## Rendering

### PDF — WeasyPrint + Jinja2

- Template: `app/templates/report.html.j2`
- `<html lang="he" dir="rtl">`, A4 portrait
- Heebo font bundled in `app/static/fonts/`, loaded via `@font-face` (no system-font dependency)
- `@page` rules for header band (building name + period) and footer (`עמוד {page} | LeadPay`)
- Summary as 3-column flex; tables are semantic `<table>` so RTL behaves natively

### Word — python-docx

- Module: `app/services/report_docx.py`
- RTL helpers from the hebrew-document-generator skill:

  ```python
  def set_paragraph_rtl(p):
      pPr = p._p.get_or_add_pPr()
      pPr.append(pPr.makeelement(qn('w:bidi'), {}))
      p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

  def set_run_rtl(r):
      rPr = r._r.get_or_add_rPr()
      rPr.append(rPr.makeelement(qn('w:rtl'), {}))
  ```

- Default font: David, size 11pt body / 14pt headings
- Layout mirrors the PDF section-by-section but plainer: title, 1×3 summary table, then one table per section. No card styling, no colored cells.

### Frontend HTML preview

- Component: `components/reports/ReportPreview.tsx`
- Consumes the JSON payload directly, renders with Tailwind
- `dir="rtl"`, `font-family: 'Heebo'` (Google Fonts via existing setup)
- Fixed A4-portrait width container for "what you see is what you get" feel

## Report sections (mirrors the sample)

1. **Header** — `LeadPay` brand, centered title `דוח הכנסות והוצאות`, building name + address + period label.
2. **סיכום** — three cards: `מאזן נוכחי`, `סה״כ הוצאות`, `סה״כ הכנסות`.
3. **פירוט הכנסות לפי דייר** — subtitle `דמי ועד חודשי: ₪{expected_monthly_payment} לדירה`, then table:

   `דירה | שם דייר | <month/quarter columns…> | שולם | לתשלום | יתרה`

   Last row is bold totals.

4. **פירוט הוצאות** — rows per month: `חודש | תיאור | קטגוריה | סכום`, with a bold `סה״כ {month}` subtotal row, then a final bold `סה״כ הוצאות` grand-total row.

5. **חייבים – יתרת חוב פתוח** — two sub-tables:
   - `חוב לתקופה זו` — period-only debt (expected − paid for the selected range)
   - `יתרת חוב כוללת` — lifetime open balance from the system

   Each sub-table is omitted if it would be empty.

## Edge cases

| Case | Behavior |
|---|---|
| No expenses in period | Expense table shows single row `אין הוצאות בתקופה זו` |
| No tenant payments | Income table renders all zeros; debtors-period section lists everyone |
| Building with no `expected_monthly_payment` | Falls back to `apartment.expected_payment`; if both null, drops the `דמי ועד חודשי` subtitle and the `יתרה` column shows `—` |
| Custom range not month-aligned (e.g. 15/01 – 20/03) | Snap to month boundaries for columns; period label shows literal range |
| Wide period | Granularity rule (>6 months → quarters) keeps tables readable on A4 portrait |
| Long names | `font-size: 9pt` and `word-break: keep-all` to prevent reflow |
| Empty debtor sub-section | Omit that sub-section entirely |

## Files to create / modify

### Backend (`leadpay/backend/`)

**New**
- `app/services/report_data.py` — assembles JSON payload from existing models
- `app/services/report_pdf.py` — WeasyPrint renderer
- `app/services/report_docx.py` — python-docx renderer
- `app/templates/report.html.j2` — Jinja template (RTL, A4)
- `app/static/fonts/Heebo-Regular.ttf`, `Heebo-Bold.ttf`

**Modify**
- `app/routers/buildings.py` — add `/report`, `/report.pdf`, `/report.docx` endpoints
- `requirements.txt` — pin `weasyprint`, `python-docx`, `Jinja2` (if missing)
- `Procfile` / Railway image — install Pango + Cairo system libs

### Frontend (`leadpay/frontend/src/`)

**New**
- `components/reports/ExportReportDialog.tsx` — modal with selector + preview + download buttons
- `components/reports/ReportPreview.tsx` — RTL HTML rendering of the payload
- `components/reports/PeriodSelector.tsx` — extract from the existing building-page chip selector and reuse

**Modify**
- `pages/Buildings.tsx` (or the building detail subview) — add the export button
- `services/api.ts` — `getBuildingReport(id, from, to)`, `downloadBuildingReport(id, from, to, fmt)`
- `types/index.ts` — add `BuildingReportPayload` and friends

## Out of scope (explicitly)

- Per-user/per-company branding (always `LeadPay`)
- Email/share-link delivery — download only
- Saved/scheduled reports — generated on demand each time
- A new `payment_method` field on expenses — using existing `category` instead
- Hebrew calendar dates — Gregorian throughout
