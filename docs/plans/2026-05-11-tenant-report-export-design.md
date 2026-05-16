# Tenant Report Export — Design Doc

**Date:** 2026-05-11
**Status:** Approved, ready for plan
**Builds on:** `2026-05-10-building-report-export-design.md`

## Goal

Add a per-tenant report export alongside the existing building report export.
From the building detail page, the user clicks the existing **📊 ייצוא דוח** button,
toggles to "דיירים" mode in the modal, picks one or more tenants, picks a period,
and downloads a personal payment statement (PDF or Word). For one tenant, a
single file is downloaded; for multiple, a ZIP of separate per-tenant files.

## UX

The existing `ExportReportDialog` adds a segmented toggle at the top:

```
[ 🏢 בניין ]   [ 👤 דיירים ]
```

**Building mode:** unchanged.

**Tenant mode:**
1. Searchable checkbox list of all tenants in the building (active highlighted,
   inactive greyed with "(לא פעיל)" suffix). "בחר הכל" / "נקה" link.
2. `PeriodRangePicker` (same component as building mode).
3. Preview:
   - 0 selected → buttons disabled, panel: "בחר לפחות דייר אחד".
   - 1 selected → fetch + render the single tenant payload (KPI cards, monthly
     table, transactions list).
   - 2+ selected → summary panel: "נבחרו N דיירים. בלחיצה על 'הורד' יישלח קובץ
     ZIP עם N דוחות". No preview fetch.
4. Footer download buttons:
   - 1 tenant → "הורד PDF" / "הורד Word" (single file).
   - 2+ tenants → "הורד ZIP (PDF)" / "הורד ZIP (Word)".

Tenant list source: `tenantsAPI.list(buildingId)` (already cached by React
Query).

## API contract

New endpoints (mounted on a tenants router):

| Method | Path | Returns |
|--------|------|---------|
| GET    | `/api/v1/tenants/{id}/report?from=YYYY-MM&to=YYYY-MM` | `TenantReportPayload` JSON |
| GET    | `/api/v1/tenants/{id}/report.pdf?from&to`             | `application/pdf` |
| GET    | `/api/v1/tenants/{id}/report.docx?from&to`            | DOCX bytes |
| POST   | `/api/v1/tenants/bulk-report?from&to&format=pdf\|docx`| `application/zip`, body `{tenant_ids: [...]}` |

Auth: `require_any_auth`. Period parsing reuses `_parse_report_period()` from
the building router. Bulk endpoint validates all `tenant_ids[]` belong to a
single building before rendering anything (mismatch → 400). Bulk capped at 50
tenants per request.

## Payload shape

```ts
interface TenantReportPayload {
  tenant: {
    id: string;
    name: string;
    apartment_number: number;
    floor: number;
    standing_order: {
      bank_name: string | null;
      bank_account: string | null;
    } | null;
    building: { name: string; address: string; city: string };
  };
  period: {
    from: string;          // "YYYY-MM"
    to:   string;
    label: string;         // e.g. "רבעון א 2026", "ינואר 2026"
  };
  summary: {
    period_expected: number;
    period_paid: number;
    period_debt: number;        // max(period_expected − period_paid, 0)
    lifetime_debt: number;      // total debt since move_in_date
    transaction_count: number;
  };
  months: Array<{
    month: number;
    year: number;
    period_label: string;
    expected: number;
    paid: number;
    difference: number;
    status: 'paid' | 'partial' | 'unpaid';
  }>;
  transactions: Array<{
    date: string;          // ISO
    amount: number;
    description: string;
    is_manual: boolean;
    period_month: number;
    period_year: number;
  }>;
}
```

`months[]` mirrors the existing `TenantPaymentHistoryMonth`. `lifetime_debt`
reuses the same calculation as `_lifetime_debtors()` in `report_data.py`.

## Rendering

**PDF (`backend/app/templates/tenant_report.html.j2`)** — new Jinja template:
- Same `@page`/font/RTL setup as `report.html.j2` (Heebo, A4, page numbers,
  LeadPay footer).
- Header: tenant name (large), apartment number, building info, period label.
  Small badge under header if `standing_order` set: *"הוראת קבע פעילה — בנק
  לאומי, חשבון ...4521"*.
- 3-column summary card row: חוב לתקופה / חוב כולל / סה״כ שולם בתקופה.
- Monthly breakdown table: חודש · צפוי · שולם · הפרש · סטטוס (color-coded).
- Transactions table: תאריך · תיאור · סכום · ידני? (✓ if `is_manual`).
- Empty state: "אין תנועות בתקופה זו" when no transactions.

**DOCX (`render_tenant_report_docx` in `report_docx.py`)** — new function:
- Reuses `_set_paragraph_rtl`, `_set_run_rtl`, `_shekel`, David font.
- Same section structure as the PDF; `Light Grid Accent 1` table style with
  `Table Grid` fallback.

**Bulk ZIP (`build_bulk_report_zip` helper)**:
- `zipfile.ZipFile(BytesIO, "w", ZIP_DEFLATED)` from stdlib — no new deps.
- For each tenant id, builds the payload then renders.
- Files inside the zip: `דוח_<tenant_name>_<period_label>.<ext>`.
- ZIP filename: `דוחות_<building_name>_<period_label>.zip`, `filename*=UTF-8''`
  encoding as used by the existing building export.

## Edge cases

- **Mid-period move-in:** expected only counts months from `move_in_date`
  forward (same logic as `_lifetime_debtors()`).
- **Empty transaction set:** transactions table shows the empty-state message;
  monthly table and summary still render.
- **Period validation:** `from > to` or bad format → 422 via shared parser.
- **Bulk filename collisions:** if two selected tenants share a name, append
  apartment number — `דוח_<name>_דירה<N>.<ext>`.
- **Per-tenant render failure inside bulk loop:** include a small `.txt` in the
  ZIP with the tenant name and the error message; continue with the rest.
- **Inactive tenants:** shown in the picker, greyed out — exportable so the
  user can document historical debt.
- **Cross-building tenant_ids in bulk request:** 400 before rendering.

## File layout

New / modified files:

```
backend/
  app/
    routers/
      tenants.py                 # add 4 endpoints
    services/
      tenant_report_data.py      # new — build_tenant_report_payload, build_bulk_report_zip
      report_pdf.py              # add render_tenant_report_pdf
      report_docx.py             # add render_tenant_report_docx
    templates/
      tenant_report.html.j2      # new
  tests/
    test_tenant_report_data.py   # new — period math, lifetime debt, payload shape

frontend/
  src/
    types/index.ts               # add TenantReportPayload, TenantSummary types
    services/api.ts              # add reportsAPI.getTenantPayload, downloadTenant, downloadTenantBulk
    components/
      modals/
        ExportReportDialog.tsx   # add toggle + tenant mode panel
        TenantReportPanel.tsx    # new — picker + preview + download
        TenantReportPreview.tsx  # new — single-tenant preview rendering
```

## Out of scope (YAGNI)

- Single combined PDF for multi-tenant (ZIP-of-separate-files only).
- Lifetime debt breakdown (which months are unpaid) — only the total figure
  is shown.
- Email-send-to-tenant from the modal — separate feature.
- Scheduled / recurring exports.

## Testing

- Unit tests for `tenant_report_data.py`: lifetime_debt calculation across
  move-in dates, empty-period handling, mid-period move-in, summary math.
- Integration: hit each endpoint against a fixture building and verify
  status / Content-Type / `%PDF`/`PK` magic bytes.
- Frontend `npm run build` clean (TypeScript strict).
- E2E smoke: open dialog, switch to tenant mode, pick 2 tenants, download
  ZIP, verify both files open in the OS.
