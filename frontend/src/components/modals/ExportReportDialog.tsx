import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import PeriodRangePicker from '../building/PeriodRangePicker';
import { reportsAPI } from '../../services/api';
import { toYYYYMM } from '../../hooks/useBuildingPeriodRange';
import type { DateRange, MonthYear } from '../../hooks/useBuildingPeriodRange';
import type { ReportFormat } from '../../types';

interface Props {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
}

function addMonths(m: MonthYear, delta: number): MonthYear {
  const total = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function defaultRange(): DateRange {
  const now = new Date();
  const to: MonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };
  return { from: addMonths(to, -2), to };
}

const shekel = (n: number | null | undefined) =>
  n == null ? '—' : `₪${Math.round(n).toLocaleString('he-IL')}`;

export default function ExportReportDialog({ buildingId, isOpen, onClose }: Props) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);

  const fromStr = toYYYYMM(range.from);
  const toStr = toYYYYMM(range.to);

  const { data: payload, isLoading, isError } = useQuery({
    queryKey: ['report-preview', buildingId, fromStr, toStr],
    queryFn: () => reportsAPI.getPayload(buildingId, fromStr, toStr),
    enabled: isOpen,
  });

  const handleDownload = useCallback(async (format: ReportFormat) => {
    setDownloading(format);
    try {
      const { blob, filename } = await reportsAPI.download(buildingId, fromStr, toStr, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Report download failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [buildingId, fromStr, toStr]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">📄 ייצוא דוח</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="סגור"
          >
            &times;
          </button>
        </div>

        {/* Period picker */}
        <div className="px-6 py-4 border-b border-gray-100">
          <PeriodRangePicker range={range} onChange={setRange} />
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-600" />
            </div>
          )}

          {isError && (
            <div className="text-center text-red-500 py-10">שגיאה בטעינת הדוח</div>
          )}

          {payload && (
            <div className="space-y-6 text-sm">
              {/* Report title */}
              <div className="text-center pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">{payload.building.name}</h3>
                <p className="text-gray-500 text-xs mt-1">
                  {payload.building.address}, {payload.building.city}
                </p>
                <p className="text-gray-600 font-medium mt-1">{payload.period.label}</p>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                  <p className="text-xs text-green-700 font-semibold mb-1">סה״כ הכנסות</p>
                  <p className="text-xl font-bold text-green-900">{shekel(payload.summary.total_income)}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
                  <p className="text-xs text-red-700 font-semibold mb-1">סה״כ הוצאות</p>
                  <p className="text-xl font-bold text-red-900">{shekel(payload.summary.total_expenses)}</p>
                </div>
                <div className={`rounded-xl p-4 border text-center ${
                  payload.summary.net_balance >= 0
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-orange-50 border-orange-200'
                }`}>
                  <p className={`text-xs font-semibold mb-1 ${
                    payload.summary.net_balance >= 0 ? 'text-blue-700' : 'text-orange-700'
                  }`}>מאזן</p>
                  <p className={`text-xl font-bold ${
                    payload.summary.net_balance >= 0 ? 'text-blue-900' : 'text-orange-900'
                  }`}>{shekel(payload.summary.net_balance)}</p>
                </div>
              </div>

              {/* Income table */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">הכנסות לפי דייר</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-200 px-3 py-2 text-right font-semibold">דירה</th>
                        <th className="border border-gray-200 px-3 py-2 text-right font-semibold">שם דייר</th>
                        {payload.period.columns.map(col => (
                          <th key={col.key} className="border border-gray-200 px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                        <th className="border border-gray-200 px-3 py-2 text-right font-semibold">שולם</th>
                        <th className="border border-gray-200 px-3 py-2 text-right font-semibold">לתשלום</th>
                        <th className="border border-gray-200 px-3 py-2 text-right font-semibold">יתרה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.income_by_tenant.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-200 px-3 py-1.5">{row.apartment_number}</td>
                          <td className="border border-gray-200 px-3 py-1.5">{row.tenant_name}</td>
                          {row.cells.map(cell => (
                            <td key={cell.key} className="border border-gray-200 px-3 py-1.5">
                              {cell.amount ? shekel(cell.amount) : '—'}
                            </td>
                          ))}
                          <td className="border border-gray-200 px-3 py-1.5">{shekel(row.paid_total)}</td>
                          <td className="border border-gray-200 px-3 py-1.5">{shekel(row.expected_total)}</td>
                          <td className={`border border-gray-200 px-3 py-1.5 font-medium ${
                            row.balance > 0 ? 'text-red-600' : 'text-gray-400'
                          }`}>
                            {row.balance > 0 ? shekel(row.balance) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-semibold">
                        <td className="border border-gray-200 px-3 py-2" colSpan={2}>סה״כ</td>
                        {payload.income_totals_row.cells.map(cell => (
                          <td key={cell.key} className="border border-gray-200 px-3 py-2">
                            {cell.amount ? shekel(cell.amount) : '—'}
                          </td>
                        ))}
                        <td className="border border-gray-200 px-3 py-2">
                          {shekel(payload.income_totals_row.paid_total)}
                        </td>
                        <td className="border border-gray-200 px-3 py-2">
                          {shekel(payload.income_totals_row.expected_total)}
                        </td>
                        <td className="border border-gray-200 px-3 py-2">
                          {payload.income_totals_row.balance > 0
                            ? shekel(payload.income_totals_row.balance)
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expenses */}
              {payload.expenses_by_month.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">
                    הוצאות — {shekel(payload.expenses_grand_total)}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-200 px-3 py-2 text-right font-semibold">חודש</th>
                          <th className="border border-gray-200 px-3 py-2 text-right font-semibold">תיאור</th>
                          <th className="border border-gray-200 px-3 py-2 text-right font-semibold">קטגוריה</th>
                          <th className="border border-gray-200 px-3 py-2 text-right font-semibold">סכום</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.expenses_by_month.flatMap((g, gi) =>
                          g.rows.map((row, ri) => (
                            <tr key={`${gi}-${ri}`} className={(gi + ri) % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="border border-gray-200 px-3 py-1.5 whitespace-nowrap">
                                {ri === 0 ? g.month_label : ''}
                              </td>
                              <td className="border border-gray-200 px-3 py-1.5">{row.description}</td>
                              <td className="border border-gray-200 px-3 py-1.5">{row.category || '—'}</td>
                              <td className="border border-gray-200 px-3 py-1.5">{shekel(row.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Debtors */}
              {(payload.debtors_period.length > 0 || payload.debtors_lifetime.length > 0) && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">חייבים – יתרת חוב פתוח</h4>
                  {payload.debtors_period.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-600 mb-1.5">חוב לתקופה זו</p>
                      <div className="flex flex-wrap gap-2">
                        {payload.debtors_period.map((d, i) => (
                          <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs flex gap-2">
                            <span className="font-medium">{d.tenant_name}</span>
                            <span className="text-red-700">{shekel(d.debt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {payload.debtors_lifetime.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">יתרת חוב כוללת</p>
                      <div className="flex flex-wrap gap-2">
                        {payload.debtors_lifetime.map((d, i) => (
                          <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 text-xs flex gap-2">
                            <span className="font-medium">{d.tenant_name}</span>
                            <span className="text-orange-700">{shekel(d.debt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 font-medium"
          >
            ביטול
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => handleDownload('docx')}
              disabled={!payload || downloading !== null}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              {downloading === 'docx' ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : '📝'}
              הורד Word
            </button>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={!payload || downloading !== null}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              {downloading === 'pdf' ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : '📄'}
              הורד PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
