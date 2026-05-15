import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import TransactionFilters from '../components/transactions/TransactionFilters';
import TransactionEditDialog from '../components/transactions/TransactionEditDialog';
import AddTransactionModal from '../components/transactions/AddTransactionModal';
import { transactionsAPI, statementsAPI } from '../services/api';
import type { TransactionRow, TransactionsListParams } from '../types';

type ViewMode = 'compact' | 'detailed' | 'full';

const VIEW_STORAGE_KEY = 'transactions.view';

function loadInitialView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === 'compact' || v === 'detailed' || v === 'full') return v;
  } catch {}
  return 'compact';
}

const SortIcon = ({
  col,
  active,
  desc,
}: {
  col: string;
  active: string;
  desc: boolean;
}) => (
  <span className={`mr-1 text-xs ${active === col ? 'text-blue-600' : 'text-gray-300'}`}>
    {active === col ? (desc ? '▼' : '▲') : '⇅'}
  </span>
);

function formatAmount(row: TransactionRow): { value: string; color: string } {
  if (row.credit_amount != null && row.credit_amount !== 0) {
    return { value: `₪${row.credit_amount.toLocaleString()}`, color: 'text-green-700' };
  }
  if (row.debit_amount != null && row.debit_amount !== 0) {
    return { value: `−₪${row.debit_amount.toLocaleString()}`, color: 'text-red-600' };
  }
  return { value: '—', color: 'text-gray-400' };
}

function MatchStatusBadge({ row }: { row: TransactionRow }) {
  if (row.is_confirmed) {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">✅ אושר</span>;
  }
  if (row.matched_tenant_id) {
    const conf = row.match_confidence ? Math.round(row.match_confidence * 100) : null;
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800"
        title={row.match_method ? `שיטה: ${row.match_method}` : ''}
      >
        🤖 אוטומטי{conf != null ? ` ${conf}%` : ''}
      </span>
    );
  }
  if (row.transaction_type === 'other') {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">🚫 מתעלם</span>;
  }
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">⚪ לא מותאם</span>;
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-gray-400">—</span>;
  const styles: Record<string, string> = {
    payment: 'bg-blue-50 text-blue-700',
    fee: 'bg-orange-50 text-orange-700',
    transfer: 'bg-purple-50 text-purple-700',
    other: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    payment: 'תשלום',
    fee: 'עמלה',
    transfer: 'העברה',
    other: 'אחר',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs ${styles[type] ?? 'bg-gray-100 text-gray-600'}`}>{labels[type] ?? type}</span>;
}

export default function Transactions() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<TransactionsListParams>({
    page: 1,
    page_size: 50,
    sort: '-activity_date',
  });
  const [view, setView] = useState<ViewMode>(loadInitialView);
  const [editRow, setEditRow] = useState<TransactionRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<TransactionRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch {}
  }, [view]);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsAPI.list(filters),
  });

  const handleSort = (col: string) => {
    const current = filters.sort ?? '-activity_date';
    const desc = current.startsWith('-');
    const key = desc ? current.slice(1) : current;
    let next: string;
    if (key === col) next = desc ? col : `-${col}`;
    else next = `-${col}`;
    setFilters(f => ({ ...f, sort: next, page: 1 }));
  };

  const activeSort = (filters.sort ?? '-activity_date').replace(/^-/, '');
  const sortDesc = (filters.sort ?? '-activity_date').startsWith('-');

  const unmatchMutation = useMutation({
    mutationFn: (txId: string) => statementsAPI.unmatchTransaction(txId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const handleDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await statementsAPI.deleteTransaction(deleteRow.id);
      setDeleteRow(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const total = data?.total ?? 0;
  const pageSize = filters.page_size ?? 50;
  const page = filters.page ?? 1;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const showDetailedCols = view === 'detailed' || view === 'full';
  const showFullCols = view === 'full';

  return (
    <Layout>
      <div className="space-y-4" dir="rtl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">תנועות</h2>
            <p className="text-sm text-gray-500">{total.toLocaleString()} תנועות בסך הכל</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
              {(['compact', 'detailed', 'full'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {v === 'compact' ? 'מצומצם' : v === 'detailed' ? 'מפורט' : 'מלא'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              + הוסף תנועה
            </button>
          </div>
        </div>

        <TransactionFilters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({ page: 1, page_size: 50, sort: '-activity_date' })}
        />

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (data?.items.length ?? 0) === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">לא נמצאו תנועות</h3>
              <p className="text-gray-500">נסה לשנות את הסינון או להעלות דף חשבון.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      onClick={() => handleSort('activity_date')}
                      className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    >
                      תאריך<SortIcon col="activity_date" active={activeSort} desc={sortDesc} />
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">בניין</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">תיאור</th>
                    {showDetailedCols && (
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">משלם</th>
                    )}
                    <th
                      onClick={() => handleSort('amount')}
                      className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    >
                      סכום<SortIcon col="amount" active={activeSort} desc={sortDesc} />
                    </th>
                    {showDetailedCols && (
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סוג</th>
                    )}
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">דייר</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סטטוס</th>
                    {showDetailedCols && (
                      <>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">הקצאות</th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">מקור</th>
                      </>
                    )}
                    {showFullCols && (
                      <>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">אסמכתא</th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">יתרה</th>
                      </>
                    )}
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פעולות</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {data!.items.map(row => {
                    const amt = formatAmount(row);
                    const rowHighlight =
                      !row.matched_tenant_id && row.transaction_type !== 'other'
                        ? 'bg-red-50/30'
                        : row.matched_tenant_id && !row.is_confirmed
                          ? 'bg-yellow-50/30'
                          : '';
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${rowHighlight}`}>
                        <td className="px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                          {new Date(row.activity_date).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-700">{row.building_name ?? '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-900 max-w-xs truncate" title={row.description}>
                          {row.description}
                        </td>
                        {showDetailedCols && (
                          <td className="px-3 py-2.5 text-sm text-gray-600">{row.payer_name ?? '—'}</td>
                        )}
                        <td className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap ${amt.color}`}>{amt.value}</td>
                        {showDetailedCols && (
                          <td className="px-3 py-2.5"><TypeBadge type={row.transaction_type} /></td>
                        )}
                        <td className="px-3 py-2.5 text-sm text-gray-700">{row.matched_tenant_name ?? '—'}</td>
                        <td className="px-3 py-2.5"><MatchStatusBadge row={row} /></td>
                        {showDetailedCols && (
                          <>
                            <td className="px-3 py-2.5 text-sm">
                              {row.allocations_summary.count === 0 ? (
                                <span className="text-gray-300">—</span>
                              ) : row.allocations_summary.count === 1 ? (
                                <span className="text-gray-700 text-xs">{row.allocations_summary.top_label ?? '—'}</span>
                              ) : (
                                <span className="text-xs text-gray-700">{row.allocations_summary.top_label} +{row.allocations_summary.count - 1}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.is_manual ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700">ידני</span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-600">בנק</span>
                              )}
                            </td>
                          </>
                        )}
                        {showFullCols && (
                          <>
                            <td className="px-3 py-2.5 text-xs text-gray-500" dir="ltr">{row.reference_number ?? '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">
                              {row.balance != null ? `₪${row.balance.toLocaleString()}` : '—'}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setEditRow(row)}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="עריכה"
                            >
                              ✏️
                            </button>
                            {row.matched_tenant_id && (
                              <button
                                onClick={() => unmatchMutation.mutate(row.id)}
                                disabled={unmatchMutation.isPending}
                                className="text-gray-400 hover:text-orange-600 transition-colors"
                                title="בטל התאמה"
                              >
                                🔓
                              </button>
                            )}
                            <button
                              onClick={() => { setDeleteRow(row); setDeleteError(null); }}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              title="מחיקה"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination footer */}
          {!isLoading && (data?.items.length ?? 0) > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center text-sm text-gray-600">
              <div>
                מציג {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} מתוך {total.toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={e => setFilters(f => ({ ...f, page_size: parseInt(e.target.value), page: 1 }))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / עמוד</option>)}
                </select>
                <button
                  onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                  disabled={page <= 1}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  ‹ הקודם
                </button>
                <span className="px-2">{page} / {lastPage}</span>
                <button
                  onClick={() => setFilters(f => ({ ...f, page: Math.min(lastPage, (f.page ?? 1) + 1) }))}
                  disabled={page >= lastPage}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  הבא ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editRow && (
        <TransactionEditDialog row={editRow} onClose={() => setEditRow(null)} />
      )}

      {showAdd && (
        <AddTransactionModal onClose={() => setShowAdd(false)} />
      )}

      {deleteError && deleteRow && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm shadow-lg">
          {deleteError}
        </div>
      )}
      <ConfirmDialog
        isOpen={!!deleteRow}
        title="מחיקת תנועה"
        message={
          deleteRow
            ? `האם למחוק את התנועה "${deleteRow.description}"? פעולה זו אינה ניתנת לביטול.`
            : ''
        }
        confirmText={deleting ? 'מוחק...' : 'מחק'}
        cancelText="ביטול"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteRow(null); setDeleteError(null); }}
      />
    </Layout>
  );
}
