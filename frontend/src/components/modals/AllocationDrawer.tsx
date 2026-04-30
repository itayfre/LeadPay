import { useState, useEffect } from 'react';
import { statementsAPI } from '../../services/api';
import type { ReviewTransaction, MatchSuggestion, AllocationItem, AllocationMode } from '../../types';

interface Props {
  tx: ReviewTransaction;
  allTenants: MatchSuggestion[];
  onClose: () => void;
  onSaved: () => void;
}

function formatAmount(amount?: number | null) {
  if (amount == null) return '—';
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;
}

// ── Inline SVG icons (matches UploadReviewModal.tsx pattern) ──
function TrashSmIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

// ── Row types ──

interface SplitRow {
  tenant_id: string;
  amount: string;
  period_month: string;
  period_year: string;
}

interface MultiMonthRow {
  period_month: string;
  period_year: string;
  amount: string;
}

// ── Period helpers ──

function currentYearMonth(): { month: string; year: string } {
  const now = new Date();
  return { month: String(now.getMonth() + 1).padStart(2, '0'), year: String(now.getFullYear()) };
}

export default function AllocationDrawer({ tx, allTenants, onClose, onSaved }: Props) {
  const headline = tx.credit_amount ?? tx.debit_amount ?? 0;
  const { month: nowMonth, year: nowYear } = currentYearMonth();

  const [mode, setMode] = useState<AllocationMode>('split');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Split mode state ──
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { tenant_id: '', amount: String(headline), period_month: nowMonth, period_year: nowYear },
  ]);

  // ── Multi-month mode state ──
  const [mmTenantId, setMmTenantId] = useState('');
  const [mmRows, setMmRows] = useState<MultiMonthRow[]>([
    { period_month: nowMonth, period_year: nowYear, amount: String(headline) },
  ]);

  // ── Non-tenant mode state ──
  const [ntLabel, setNtLabel] = useState('');
  const [ntAmount, setNtAmount] = useState(String(headline));

  // Pre-fill from existing allocations if any
  useEffect(() => {
    const existing = tx.allocations;
    if (!existing || existing.length === 0) return;

    const tenantRows = existing.filter(a => a.tenant_id);
    const labelRows = existing.filter(a => !a.tenant_id && a.label);

    if (labelRows.length > 0 && tenantRows.length === 0) {
      setMode('non_tenant');
      setNtLabel(labelRows[0].label ?? '');
      setNtAmount(String(labelRows[0].amount));
    } else if (tenantRows.length > 0) {
      const tenantIds = new Set(tenantRows.map(r => r.tenant_id));
      if (tenantIds.size === 1) {
        const tid = [...tenantIds][0]!;
        const periods = new Set(tenantRows.map(r => `${r.period_year}-${r.period_month}`));
        if (periods.size > 1) {
          // Same tenant, multiple periods → multi-month
          setMode('multi_month');
          setMmTenantId(tid);
          setMmRows(tenantRows.map(r => ({
            period_month: String(r.period_month ?? nowMonth).padStart(2, '0'),
            period_year: String(r.period_year ?? nowYear),
            amount: String(r.amount),
          })));
          return;
        }
      }
      // Multiple tenants or single tenant single period → split
      setMode('split');
      setSplitRows(tenantRows.map(r => ({
        tenant_id: r.tenant_id ?? '',
        amount: String(r.amount),
        period_month: String(r.period_month ?? nowMonth).padStart(2, '0'),
        period_year: String(r.period_year ?? nowYear),
      })));
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sum helpers ──

  function splitSum(): number {
    return splitRows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
  }

  function mmSum(): number {
    return mmRows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
  }

  function ntSum(): number {
    return parseFloat(ntAmount) || 0;
  }

  function currentSum(): number {
    if (mode === 'split') return splitSum();
    if (mode === 'multi_month') return mmSum();
    return ntSum();
  }

  const sumOk = Math.abs(currentSum() - headline) <= 0.01;

  // ── Build payload ──

  function buildPayload(): AllocationItem[] {
    if (mode === 'split') {
      return splitRows.map(r => ({
        tenant_id: r.tenant_id || undefined,
        amount: parseFloat(r.amount),
        period_month: parseInt(r.period_month) || undefined,
        period_year: parseInt(r.period_year) || undefined,
      }));
    }
    if (mode === 'multi_month') {
      return mmRows.map(r => ({
        tenant_id: mmTenantId || undefined,
        amount: parseFloat(r.amount),
        period_month: parseInt(r.period_month) || undefined,
        period_year: parseInt(r.period_year) || undefined,
      }));
    }
    // non_tenant
    return [{
      label: ntLabel,
      amount: parseFloat(ntAmount),
    }];
  }

  const canSave =
    sumOk &&
    !busy &&
    (mode === 'split'
      ? splitRows.every(r => r.tenant_id && parseFloat(r.amount) > 0)
      : mode === 'multi_month'
      ? mmTenantId && mmRows.every(r => parseFloat(r.amount) > 0)
      : ntLabel.trim() && parseFloat(ntAmount) > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await statementsAPI.setAllocations(tx.id, { allocations: buildPayload() });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Split row helpers ──

  const addSplitRow = () =>
    setSplitRows(prev => [...prev, { tenant_id: '', amount: '', period_month: nowMonth, period_year: nowYear }]);

  const removeSplitRow = (i: number) =>
    setSplitRows(prev => prev.filter((_, idx) => idx !== i));

  const updateSplitRow = (i: number, field: keyof SplitRow, val: string) =>
    setSplitRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  // ── Multi-month row helpers ──

  const addMmRow = () =>
    setMmRows(prev => [...prev, { period_month: nowMonth, period_year: nowYear, amount: '' }]);

  const removeMmRow = (i: number) =>
    setMmRows(prev => prev.filter((_, idx) => idx !== i));

  const updateMmRow = (i: number, field: keyof MultiMonthRow, val: string) =>
    setMmRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  // ── Sum display ──

  const sumLabel = sumOk
    ? <span className="text-green-600 font-medium">✓ {formatAmount(currentSum())} / {formatAmount(headline)}</span>
    : <span className="text-red-600 font-medium">⚠ {formatAmount(currentSum())} / {formatAmount(headline)} (חסרים {formatAmount(parseFloat((headline - currentSum()).toFixed(2)))})</span>;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-[60]"
        onClick={onClose}
      />

      {/* Drawer panel — slides in from the right (start side in RTL) */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-600 to-indigo-800 px-5 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base">הגדרת הקצאה</h3>
            <p className="text-indigo-200 text-sm truncate mt-0.5">
              {tx.payer_name || tx.description} · {formatAmount(headline)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white text-xl leading-none hover:text-indigo-200 transition-colors mr-3 mt-0.5 flex-shrink-0"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {/* Mode selector */}
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">סוג הקצאה</p>
          <div className="flex gap-1 flex-wrap">
            {([
              ['split', 'פיצול לדיירים'],
              ['multi_month', 'ריבוי חודשים'],
              ['non_tenant', 'הכנסה אחרת'],
            ] as [AllocationMode, string][]).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  mode === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── Split mode ── */}
          {mode === 'split' && (
            <>
              <div className="grid grid-cols-[1fr_6rem_5rem_1.5rem] gap-2 text-xs text-gray-500 font-medium pb-1">
                <span>דייר</span>
                <span>סכום</span>
                <span>תקופה</span>
                <span />
              </div>
              {splitRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_5rem_1.5rem] gap-2 items-center">
                  <select
                    value={row.tenant_id}
                    onChange={e => updateSplitRow(i, 'tenant_id', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">בחר דייר</option>
                    {allTenants.map(t => (
                      <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={e => updateSplitRow(i, 'amount', e.target.value)}
                    placeholder="סכום"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex gap-0.5">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={row.period_month}
                      onChange={e => updateSplitRow(i, 'period_month', e.target.value)}
                      placeholder="MM"
                      className="border border-gray-300 rounded px-1 py-1.5 text-xs w-8 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      value={row.period_year}
                      onChange={e => updateSplitRow(i, 'period_year', e.target.value)}
                      placeholder="YYYY"
                      className="border border-gray-300 rounded px-1 py-1.5 text-xs w-12 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSplitRow(i)}
                    disabled={splitRows.length === 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-20 transition-colors"
                    title="הסר שורה"
                  >
                    <TrashSmIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplitRow}
                className="flex items-center gap-1 text-indigo-600 text-sm hover:text-indigo-800 transition-colors"
              >
                <PlusIcon /> הוסף שורה
              </button>
            </>
          )}

          {/* ── Multi-month mode ── */}
          {mode === 'multi_month' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">דייר</label>
                <select
                  value={mmTenantId}
                  onChange={e => setMmTenantId(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">בחר דייר</option>
                  {allTenants.map(t => (
                    <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[5rem_1fr_1.5rem] gap-2 text-xs text-gray-500 font-medium pb-1 mt-2">
                <span>חודש / שנה</span>
                <span>סכום</span>
                <span />
              </div>
              {mmRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[5rem_1fr_1.5rem] gap-2 items-center">
                  <div className="flex gap-0.5">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={row.period_month}
                      onChange={e => updateMmRow(i, 'period_month', e.target.value)}
                      placeholder="MM"
                      className="border border-gray-300 rounded px-1 py-1.5 text-xs w-8 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      value={row.period_year}
                      onChange={e => updateMmRow(i, 'period_year', e.target.value)}
                      placeholder="YYYY"
                      className="border border-gray-300 rounded px-1 py-1.5 text-xs w-12 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={e => updateMmRow(i, 'amount', e.target.value)}
                    placeholder="סכום"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeMmRow(i)}
                    disabled={mmRows.length === 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-20 transition-colors"
                    title="הסר שורה"
                  >
                    <TrashSmIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addMmRow}
                className="flex items-center gap-1 text-indigo-600 text-sm hover:text-indigo-800 transition-colors"
              >
                <PlusIcon /> הוסף חודש
              </button>
            </>
          )}

          {/* ── Non-tenant mode ── */}
          {mode === 'non_tenant' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">תיאור</label>
                <input
                  type="text"
                  value={ntLabel}
                  onChange={e => setNtLabel(e.target.value)}
                  placeholder="לדוגמה: החזר ביטוח"
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">סכום</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ntAmount}
                  onChange={e => setNtAmount(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-4 bg-gray-50">
          {/* Sum indicator */}
          <div className="text-sm mb-3">{sumLabel}</div>

          {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || busy}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:bg-indigo-300"
            >
              {busy ? 'שומר...' : 'שמור הקצאה ✓'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
