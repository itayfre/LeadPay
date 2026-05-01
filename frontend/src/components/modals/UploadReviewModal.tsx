import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { statementsAPI } from '../../services/api';
import type { StatementReview, ReviewTransaction, MatchSuggestion, ExpenseRow } from '../../types';
import ConfirmDialog from './ConfirmDialog';
import AllocationDrawer from './AllocationDrawer';

interface Props {
  statementId: string;
  buildingId: string;
  onClose: () => void;
}

type Tab = 'unmatched' | 'matched' | 'irrelevant' | 'expenses';

const CATEGORY_LABELS: Record<string, string> = {
  routine_maintenance: 'אחזקה שוטפת',
  technical_maintenance: 'אחזקה טכנית',
  administrative: 'הוצאות הנהלה',
  extraordinary: 'תיקונים מיוחדים',
};

const CATEGORY_OPTIONS = [
  { value: 'routine_maintenance', label: 'אחזקה שוטפת' },
  { value: 'technical_maintenance', label: 'אחזקה טכנית' },
  { value: 'administrative', label: 'הוצאות הנהלה' },
  { value: 'extraordinary', label: 'תיקונים מיוחדים' },
];

const METHOD_LABELS: Record<string, string> = {
  exact: 'התאמה מדויקת',
  reversed_name: 'שם הפוך',
  fuzzy: 'דמיון טקסט',
  token_based: 'מילים',
  family_name: 'שם משפחה',
  manual: 'ידני',
  amount: 'סכום',
  learned: '🔖 לומד',
};

const TYPE_LABELS: Record<string, string> = {
  fee: 'עמלה',
  transfer: 'חיוב',
  other: 'אחר',
  payment: 'תשלום',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('he-IL');
  } catch {
    return iso;
  }
}

function formatAmount(amount?: number | null) {
  if (amount == null) return '—';
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;
}

// ── Inline SVG icons (matches ConfirmDialog.tsx pattern, avoids adding lucide-react dep) ──
function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
      />
    </svg>
  );
}

function GearIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ChevronDownIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Generic round icon button used for all per-row actions
interface IconActionProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: 'approve' | 'reject' | 'delete' | 'settings';
  children: React.ReactNode;
}

function IconAction({ title, onClick, disabled, loading, variant, children }: IconActionProps) {
  const variantClass = {
    approve: 'text-gray-400 hover:text-green-600 hover:bg-green-50',
    reject: 'text-gray-400 hover:text-yellow-600 hover:bg-yellow-50',
    delete: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
    settings: 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50',
  }[variant];

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${variantClass}`}
    >
      {loading ? <span className="text-xs">…</span> : children}
    </button>
  );
}

export default function UploadReviewModal({ statementId, buildingId, onClose }: Props) {
  const queryClient = useQueryClient();

  const [review, setReview] = useState<StatementReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('unmatched');

  // Map transactionId → selected tenantId (manual matches not yet committed)
  const [pendingMatches, setPendingMatches] = useState<Record<string, string>>({});

  // Per-row spinners — `null` when no row action is in flight
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Confirm dialog state for delete
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Allocation drawer state — which transaction is open
  const [drawerTx, setDrawerTx] = useState<ReviewTransaction | null>(null);

  // Expense edit popover state
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseEditForm, setExpenseEditForm] = useState<{
    vendor_label: string;
    category: string;
    remember: boolean;
  }>({ vendor_label: '', category: 'routine_maintenance', remember: false });

  const refreshReview = async () => {
    const updated = await statementsAPI.getReview(statementId);
    setReview(updated);
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
    return updated;
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    statementsAPI.getReview(statementId)
      .then(data => {
        setReview(data);
        if (data.unmatched.length === 0 && data.matched.length > 0) {
          setActiveTab('matched');
        }
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [statementId]);

  const handleSelectTenant = (transactionId: string, tenantId: string) => {
    setPendingMatches(prev => {
      if (!tenantId) {
        const next = { ...prev };
        delete next[transactionId];
        return next;
      }
      return { ...prev, [transactionId]: tenantId };
    });
  };

  const pendingCount = Object.keys(pendingMatches).length;

  // ── Per-row handlers ──

  const handleApproveRow = async (txId: string) => {
    const tenantId = pendingMatches[txId];
    if (!tenantId) return;
    setBusyRow(txId);
    setConfirmError(null);
    try {
      await statementsAPI.manualMatch(txId, tenantId);
      setPendingMatches(prev => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
      await refreshReview();
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBusyRow(null);
    }
  };

  const handleRejectRow = async (txId: string, source: Tab) => {
    setBusyRow(txId);
    setConfirmError(null);
    try {
      // matched → unmatch (sends back to unmatched tab)
      // unmatched → mark irrelevant (so it stops appearing as a payment)
      if (source === 'matched') {
        await statementsAPI.unmatchTransaction(txId);
      } else {
        await statementsAPI.ignoreTransaction(txId);
      }
      const updated = await refreshReview();
      // If the user is on a tab that just emptied, jump them to a populated one
      if (source === 'matched' && updated.unmatched.length > 0) {
        setActiveTab('unmatched');
      }
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBusyRow(null);
    }
  };

  const handleDeleteRow = async (txId: string) => {
    setBusyRow(txId);
    setConfirmError(null);
    try {
      await statementsAPI.deleteTransaction(txId);
      // Drop any local pending state for this row
      setPendingMatches(prev => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
      await refreshReview();
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBusyRow(null);
      setPendingDeleteId(null);
    }
  };

  // Bulk: confirm every row the engine auto-matched but hasn't been user-confirmed yet
  const unconfirmedMatched = review?.matched.filter(t => !t.is_confirmed) ?? [];

  const handleApproveAllSuggestions = async () => {
    if (unconfirmedMatched.length === 0) return;
    setBulkBusy(true);
    setConfirmError(null);
    try {
      // Re-issuing manualMatch with the already-matched tenant flips is_confirmed=true
      // and refreshes the NameMapping — same code path as a manual approval.
      await Promise.all(
        unconfirmedMatched
          .filter(t => t.tenant_id)
          .map(t => statementsAPI.manualMatch(t.id, t.tenant_id as string))
      );
      await refreshReview();
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk: commit every pending manual match in one go (replaces old "אשר התאמות ידניות")
  const handleCommitPending = async () => {
    if (pendingCount === 0) return;
    setBulkBusy(true);
    setConfirmError(null);
    try {
      await Promise.all(
        Object.entries(pendingMatches).map(([txId, tenantId]) =>
          statementsAPI.manualMatch(txId, tenantId)
        )
      );
      setPendingMatches({});
      const updated = await refreshReview();
      if (updated.unmatched.length === 0 && updated.matched.length > 0) {
        setActiveTab('matched');
      }
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const openExpenseEdit = (row: ExpenseRow) => {
    setEditingExpenseId(row.id);
    setExpenseEditForm({
      vendor_label: row.vendor_label ?? '',
      category: row.category ?? 'routine_maintenance',
      remember: false,
    });
  };

  const handleSaveExpense = async (txId: string) => {
    setBusyRow(txId);
    setConfirmError(null);
    try {
      await statementsAPI.categorizeTransaction(txId, expenseEditForm);
      setEditingExpenseId(null);
      await refreshReview();
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBusyRow(null);
    }
  };

  const handleUncategorize = async (txId: string) => {
    setBusyRow(txId);
    setConfirmError(null);
    try {
      await statementsAPI.uncategorizeTransaction(txId);
      await refreshReview();
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setBusyRow(null);
    }
  };

  const tabs: { id: Tab; label: string; count: number }[] = review
    ? [
        { id: 'unmatched', label: 'לא הותאמו', count: review.unmatched.length },
        { id: 'matched', label: 'הותאמו אוטומטית', count: review.matched.length },
        { id: 'irrelevant', label: 'לא רלוונטי', count: review.irrelevant.length },
        { id: 'expenses', label: 'הוצאות מזוהות', count: review.expenses?.length ?? 0 },
      ]
    : [];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          dir="rtl"
        >
          {/* Header */}
          <div className="bg-gradient-to-l from-blue-600 to-blue-800 rounded-t-xl px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">סקירת הדוח</h2>
              {review && (
                <p className="text-blue-200 text-sm mt-0.5">
                  תקופה: {review.period}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white text-2xl leading-none hover:text-blue-200 transition-colors"
              aria-label="סגור"
            >
              ×
            </button>
          </div>

          {/* Loading / Error */}
          {loading && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-3">⏳</div>
                <p>טוען נתונים...</p>
              </div>
            </div>
          )}
          {error && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center text-red-600">
                <div className="text-4xl mb-3">❌</div>
                <p>{error}</p>
              </div>
            </div>
          )}

          {review && !loading && (
            <>
              {/* Tabs */}
              <div className="border-b border-gray-200 px-6 flex gap-1 pt-2">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'bg-white border border-b-white border-gray-200 text-blue-700 -mb-px'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        tab.id === 'unmatched' && tab.count > 0
                          ? 'bg-red-100 text-red-700'
                          : tab.id === 'matched'
                          ? 'bg-green-100 text-green-700'
                          : tab.id === 'expenses' && tab.count > 0
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* ── UNMATCHED TAB ── */}
                {activeTab === 'unmatched' && (() => {
                  // Rows explicitly marked as NOT from this statement are legacy orphans.
                  // Rows with undefined (older backend) default to current to avoid breaking existing data.
                  const current = review.unmatched.filter(t => t.is_from_current_statement !== false);
                  const legacy  = review.unmatched.filter(t => t.is_from_current_statement === false);

                  if (review.unmatched.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-400">
                        <div className="text-4xl mb-2">✅</div>
                        <p>כל העסקאות הותאמו!</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {/* Info banner — only when legacy rows exist */}
                      {legacy.length > 0 && (
                        <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-md px-3 py-2">
                          <span className="flex-shrink-0 mt-0.5 select-none">ℹ︎</span>
                          <span>
                            {legacy.length === 1
                              ? 'תשלום אחד שלא שובץ בהעלאות קודמות מופיע בהמשך, מתחת לתשלומים מהקובץ הנוכחי.'
                              : `${legacy.length} תשלומים שלא שובצו בהעלאות קודמות מופיעים בהמשך, מתחת לתשלומים מהקובץ הנוכחי.`}
                          </span>
                        </div>
                      )}

                      {/* Section 1: from the current uploaded statement */}
                      <div>
                        <div className="mb-3">
                          <h3 className="text-sm font-semibold text-gray-900">
                            מהקובץ שהעלית עכשיו
                            <span className="text-gray-400 font-normal mr-2">{current.length} תשלומים</span>
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            הקובץ שהעלית עתה: דף בנק {review.period}.
                          </p>
                        </div>
                        {current.length === 0 ? (
                          <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 text-sm text-teal-700">
                            <span className="text-teal-500 font-semibold">✓</span>
                            כל התשלומים מהדף הזה שובצו לדיירים. אפשר לאשר את ההעלאה.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {current.map((tx: ReviewTransaction) => (
                              <UnmatchedRow
                                key={tx.id}
                                tx={tx}
                                allTenants={review.all_tenants}
                                selected={pendingMatches[tx.id] || ''}
                                onSelect={tenantId => handleSelectTenant(tx.id, tenantId)}
                                busy={busyRow === tx.id}
                                onApprove={() => handleApproveRow(tx.id)}
                                onReject={() => handleRejectRow(tx.id, 'unmatched')}
                                onDelete={() => setPendingDeleteId(tx.id)}
                                onOpenDrawer={() => setDrawerTx(tx)}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section 2: orphans from previous uploads */}
                      {legacy.length > 0 && (
                        <LegacyUnmatchedSection
                          rows={legacy}
                          allTenants={review.all_tenants}
                          pendingMatches={pendingMatches}
                          busyRow={busyRow}
                          onSelect={handleSelectTenant}
                          onApprove={handleApproveRow}
                          onReject={(txId) => handleRejectRow(txId, 'unmatched')}
                          onDelete={setPendingDeleteId}
                          onOpenDrawer={setDrawerTx}
                          defaultCollapsed={legacy.length > 3}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* ── MATCHED TAB ── */}
                {activeTab === 'matched' && (
                  <div>
                    {review.matched.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <div className="text-4xl mb-2">🔍</div>
                        <p>לא נמצאו התאמות אוטומטיות</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 border-b text-right">
                            <th className="pb-2 font-medium">שם המשלם</th>
                            <th className="pb-2 font-medium">תאריך</th>
                            <th className="pb-2 font-medium">סכום</th>
                            <th className="pb-2 font-medium">דייר מותאם</th>
                            <th className="pb-2 font-medium">ביטחון</th>
                            <th className="pb-2 font-medium">שיטה</th>
                            <th className="pb-2 font-medium text-left">פעולות</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {review.matched.map((tx: ReviewTransaction) => (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="py-2.5 pr-0 font-medium text-gray-800">
                                {tx.payer_name || '—'}
                              </td>
                              <td className="py-2.5 text-gray-500">{formatDate(tx.activity_date)}</td>
                              <td className="py-2.5 text-green-700 font-medium">
                                {formatAmount(tx.credit_amount)}
                              </td>
                              <td className="py-2.5 text-gray-800">{tx.tenant_name || '—'}</td>
                              <td className="py-2.5">
                                <ConfidenceBadge confidence={tx.match_confidence} />
                              </td>
                              <td className="py-2.5 text-gray-400 text-xs">
                                {tx.match_method ? (METHOD_LABELS[tx.match_method] || tx.match_method) : '—'}
                              </td>
                              <td className="py-2.5 text-left">
                                <div className="flex items-center gap-1 justify-end">
                                  <IconAction
                                    title="הגדרת הקצאה"
                                    variant="settings"
                                    onClick={() => setDrawerTx(tx)}
                                    disabled={busyRow === tx.id}
                                  >
                                    <GearIcon />
                                  </IconAction>
                                  <IconAction
                                    title="בטל התאמה (חזרה ל'לא הותאמו')"
                                    variant="reject"
                                    onClick={() => handleRejectRow(tx.id, 'matched')}
                                    loading={busyRow === tx.id}
                                  >
                                    <XIcon />
                                  </IconAction>
                                  <IconAction
                                    title="מחק עסקה"
                                    variant="delete"
                                    onClick={() => setPendingDeleteId(tx.id)}
                                    disabled={busyRow === tx.id}
                                  >
                                    <TrashIcon />
                                  </IconAction>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── IRRELEVANT TAB ── */}
                {activeTab === 'irrelevant' && (
                  <div>
                    {review.irrelevant.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <div className="text-4xl mb-2">✨</div>
                        <p>לא נמצאו עסקאות לא רלוונטיות</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 border-b text-right">
                            <th className="pb-2 font-medium">תיאור</th>
                            <th className="pb-2 font-medium">תאריך</th>
                            <th className="pb-2 font-medium">סכום</th>
                            <th className="pb-2 font-medium">סוג</th>
                            <th className="pb-2 font-medium text-left">פעולות</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {review.irrelevant.map((tx: ReviewTransaction) => (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="py-2.5 text-gray-700 max-w-xs truncate">
                                {tx.description}
                              </td>
                              <td className="py-2.5 text-gray-500">{formatDate(tx.activity_date)}</td>
                              <td className="py-2.5 text-red-600 font-medium">
                                {tx.debit_amount ? `-${formatAmount(tx.debit_amount)}` : formatAmount(tx.credit_amount)}
                              </td>
                              <td className="py-2.5">
                                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                                  {TYPE_LABELS[tx.transaction_type] || tx.transaction_type}
                                </span>
                              </td>
                              <td className="py-2.5 text-left">
                                <div className="flex items-center gap-1 justify-end">
                                  <IconAction
                                    title="מחק עסקה"
                                    variant="delete"
                                    onClick={() => setPendingDeleteId(tx.id)}
                                    disabled={busyRow === tx.id}
                                  >
                                    <TrashIcon />
                                  </IconAction>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {/* ── EXPENSES TAB ── */}
                {activeTab === 'expenses' && (
                  <div>
                    {(review.expenses?.length ?? 0) === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <div className="text-4xl mb-2">💸</div>
                        <p>לא זוהו הוצאות בדוח זה</p>
                      </div>
                    ) : (() => {
                      const uncategorized = (review.expenses ?? []).filter(e => !e.category);
                      const categorized = (review.expenses ?? []).filter(e => !!e.category);
                      return (
                        <div className="space-y-4">
                          {/* Uncategorized rows */}
                          {uncategorized.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 border border-yellow-200 px-2 py-0.5 rounded-full">
                                  ⚠ ללא קטגוריה ({uncategorized.length})
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-gray-500 border-b text-right">
                                    <th className="pb-2 font-medium">תאריך</th>
                                    <th className="pb-2 font-medium">תיאור</th>
                                    <th className="pb-2 font-medium">סכום</th>
                                    <th className="pb-2 font-medium text-left">פעולה</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-yellow-100">
                                  {uncategorized.map((row: ExpenseRow) => (
                                    <React.Fragment key={row.id}>
                                    <tr className="bg-yellow-50 hover:bg-yellow-100">
                                      <td className="py-2.5 text-gray-500">{formatDate(row.activity_date)}</td>
                                      <td className="py-2.5 text-gray-700 max-w-xs truncate" title={row.description}>
                                        {row.description}
                                      </td>
                                      <td className="py-2.5 text-red-600 font-medium">
                                        -{formatAmount(row.debit_amount)}
                                      </td>
                                      <td className="py-2.5 text-left">
                                        <IconAction
                                          title="קטגר הוצאה"
                                          variant="settings"
                                          onClick={() => openExpenseEdit(row)}
                                          disabled={busyRow === row.id}
                                        >
                                          <GearIcon />
                                        </IconAction>
                                      </td>
                                    </tr>
                                    {editingExpenseId === row.id && (
                                      <tr key={`${row.id}-edit`} className="bg-yellow-50">
                                        <td colSpan={4} className="pb-3 px-2">
                                          <div className="bg-white border border-gray-200 rounded-lg shadow-md p-4">
                                            <p className="text-sm font-semibold text-gray-700 mb-3">✏ קטגור הוצאה</p>
                                            <div className="space-y-2">
                                              <div>
                                                <label className="text-xs text-gray-500 block mb-1">שם ספק</label>
                                                <input
                                                  type="text"
                                                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                  value={expenseEditForm.vendor_label}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, vendor_label: e.target.value }))}
                                                  placeholder="לדוגמה: חברת החשמל"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-xs text-gray-500 block mb-1">קטגוריה</label>
                                                <select
                                                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                  value={expenseEditForm.category}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, category: e.target.value }))}
                                                >
                                                  {CATEGORY_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={expenseEditForm.remember}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, remember: e.target.checked }))}
                                                  className="rounded"
                                                />
                                                זכור עבור הבא
                                              </label>
                                            </div>
                                            <div className="flex gap-2 mt-3 justify-end">
                                              <button
                                                onClick={() => setEditingExpenseId(null)}
                                                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
                                              >
                                                ביטול
                                              </button>
                                              <button
                                                onClick={() => handleSaveExpense(row.id)}
                                                disabled={busyRow === row.id || !expenseEditForm.vendor_label}
                                                className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                                              >
                                                {busyRow === row.id ? '...' : 'שמור'}
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Categorized rows */}
                          {categorized.length > 0 && (
                            <div>
                              {uncategorized.length > 0 && (
                                <div className="border-t border-gray-200 mt-4 mb-3" />
                              )}
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-gray-500 border-b text-right">
                                    <th className="pb-2 font-medium">תאריך</th>
                                    <th className="pb-2 font-medium">תיאור</th>
                                    <th className="pb-2 font-medium">ספק</th>
                                    <th className="pb-2 font-medium">קטגוריה</th>
                                    <th className="pb-2 font-medium">סכום</th>
                                    <th className="pb-2 font-medium text-left">פעולות</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {categorized.map((row: ExpenseRow) => (
                                    <tr key={row.id} className="hover:bg-gray-50 relative">
                                      <td className="py-2.5 text-gray-500">{formatDate(row.activity_date)}</td>
                                      <td className="py-2.5 text-gray-700 max-w-[180px] truncate" title={row.description}>
                                        {row.description}
                                      </td>
                                      <td className="py-2.5 text-gray-800 font-medium">
                                        {row.vendor_label ?? '—'}
                                      </td>
                                      <td className="py-2.5">
                                        <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                          {CATEGORY_LABELS[row.category ?? ''] ?? row.category}
                                        </span>
                                      </td>
                                      <td className="py-2.5 text-red-600 font-medium">
                                        -{formatAmount(row.debit_amount)}
                                      </td>
                                      <td className="py-2.5 text-left">
                                        <div className="flex items-center gap-1 justify-end">
                                          <IconAction
                                            title="ערוך קטגוריה"
                                            variant="settings"
                                            onClick={() => openExpenseEdit(row)}
                                            disabled={busyRow === row.id}
                                          >
                                            <GearIcon />
                                          </IconAction>
                                          <IconAction
                                            title="הסר קטגוריה"
                                            variant="delete"
                                            onClick={() => handleUncategorize(row.id)}
                                            loading={busyRow === row.id}
                                          >
                                            <TrashIcon />
                                          </IconAction>
                                        </div>
                                      </td>

                                      {/* Inline edit popover */}
                                      {editingExpenseId === row.id && (
                                        <td colSpan={6} className="p-0">
                                          <div className="absolute left-0 right-0 z-20 bg-white border border-gray-200 rounded-lg shadow-xl p-4 mt-1 mx-2">
                                            <p className="text-sm font-semibold text-gray-700 mb-3">✏ עריכת ספק</p>
                                            <div className="space-y-2">
                                              <div>
                                                <label className="text-xs text-gray-500 block mb-1">שם ספק</label>
                                                <input
                                                  type="text"
                                                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                  value={expenseEditForm.vendor_label}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, vendor_label: e.target.value }))}
                                                />
                                              </div>
                                              <div>
                                                <label className="text-xs text-gray-500 block mb-1">קטגוריה</label>
                                                <select
                                                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                  value={expenseEditForm.category}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, category: e.target.value }))}
                                                >
                                                  {CATEGORY_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={expenseEditForm.remember}
                                                  onChange={e => setExpenseEditForm(f => ({ ...f, remember: e.target.checked }))}
                                                  className="rounded"
                                                />
                                                זכור עבור הבא
                                              </label>
                                            </div>
                                            <div className="flex gap-2 mt-3 justify-end">
                                              <button
                                                onClick={() => setEditingExpenseId(null)}
                                                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
                                              >
                                                ביטול
                                              </button>
                                              <button
                                                onClick={() => handleSaveExpense(row.id)}
                                                disabled={busyRow === row.id || !expenseEditForm.vendor_label}
                                                className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                                              >
                                                {busyRow === row.id ? '...' : 'שמור'}
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Footer — non-blocking. "סיום" always enabled. */}
              <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-xl gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  {confirmError && (
                    <p className="text-red-600 text-sm">{confirmError}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {pendingCount > 0 && (
                    <button
                      onClick={handleCommitPending}
                      disabled={bulkBusy}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-blue-300"
                    >
                      {bulkBusy ? 'שומר...' : `אשר התאמות נבחרות (${pendingCount})`}
                    </button>
                  )}
                  {unconfirmedMatched.length > 0 && (
                    <button
                      onClick={handleApproveAllSuggestions}
                      disabled={bulkBusy}
                      title="סמן את כל ההתאמות האוטומטיות כמאושרות"
                      className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      אשר את כל ההצעות
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-5 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                  >
                    סיום
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        title="מחיקת עסקה"
        message="האם למחוק את העסקה לצמיתות? לא ניתן לבטל פעולה זו."
        confirmText="מחק"
        cancelText="ביטול"
        type="danger"
        onConfirm={() => pendingDeleteId && handleDeleteRow(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />

      {/* Allocation drawer */}
      {drawerTx && review && (
        <AllocationDrawer
          tx={drawerTx}
          allTenants={review.all_tenants}
          onClose={() => setDrawerTx(null)}
          onSaved={async () => {
            setDrawerTx(null);
            await refreshReview();
          }}
        />
      )}
    </>
  );
}

// ── Sub-components ──

interface UnmatchedRowProps {
  tx: ReviewTransaction;
  allTenants: MatchSuggestion[];
  selected: string;
  onSelect: (tenantId: string) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onOpenDrawer: () => void;
  meta?: React.ReactNode;
}

function UnmatchedRow({
  tx, allTenants, selected, onSelect, busy, onApprove, onReject, onDelete, onOpenDrawer, meta,
}: UnmatchedRowProps) {
  const suggestions = tx.suggestions || [];
  const suggestionIds = new Set(suggestions.map(s => s.tenant_id));
  const otherTenants = allTenants
    .filter(t => !suggestionIds.has(t.tenant_id))
    .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name, 'he'));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 shadow-sm">
      {/* Transaction details */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">
          {tx.payer_name || tx.description || '—'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(tx.activity_date)} · {formatAmount(tx.credit_amount)}
        </p>
        {meta && <div className="mt-1.5">{meta}</div>}
      </div>

      {/* Arrow */}
      <span className="text-gray-400 text-lg flex-shrink-0">←</span>

      {/* Tenant selector */}
      <div className="flex-1 min-w-0">
        <select
          value={selected}
          onChange={e => onSelect(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          dir="rtl"
        >
          <option value="">-- בחר דייר --</option>

          {/* Top suggestions first */}
          {suggestions.length > 0 && (
            <>
              <option disabled>── הצעות המערכת ──</option>
              {suggestions.map(s => (
                <option key={s.tenant_id} value={s.tenant_id}>
                  ★ {s.tenant_name} ({Math.round(s.score * 100)}%)
                </option>
              ))}
            </>
          )}

          {/* All other tenants */}
          {otherTenants.length > 0 && (
            <>
              <option disabled>── כל הדיירים ──</option>
              {otherTenants.map(t => (
                <option key={t.tenant_id} value={t.tenant_id}>
                  {t.tenant_name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Per-row actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconAction
          title={selected ? 'אשר התאמה' : 'בחר דייר תחילה'}
          variant="approve"
          onClick={onApprove}
          disabled={!selected}
          loading={busy}
        >
          <CheckIcon />
        </IconAction>
        <IconAction
          title="הגדרת הקצאה"
          variant="settings"
          onClick={onOpenDrawer}
          disabled={busy}
        >
          <GearIcon />
        </IconAction>
        <IconAction
          title="לא רלוונטי (העבר ל'לא רלוונטי')"
          variant="reject"
          onClick={onReject}
          loading={busy}
        >
          <XIcon />
        </IconAction>
        <IconAction
          title="מחק עסקה"
          variant="delete"
          onClick={onDelete}
          disabled={busy}
        >
          <TrashIcon />
        </IconAction>
      </div>
    </div>
  );
}

interface LegacyUnmatchedSectionProps {
  rows: ReviewTransaction[];
  allTenants: MatchSuggestion[];
  pendingMatches: Record<string, string>;
  busyRow: string | null;
  onSelect: (txId: string, tenantId: string) => void;
  onApprove: (txId: string) => void;
  onReject: (txId: string) => void;
  onDelete: (txId: string) => void;
  onOpenDrawer: (tx: ReviewTransaction) => void;
  defaultCollapsed: boolean;
}

function LegacyUnmatchedSection({
  rows, allTenants, pendingMatches, busyRow,
  onSelect, onApprove, onReject, onDelete, onOpenDrawer,
  defaultCollapsed,
}: LegacyUnmatchedSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-gray-100/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">תשלומים מהעלאות קודמות</span>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            {rows.length}
          </span>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 mb-3 pt-2 border-t border-gray-200">
            תשלומים מדפי בנק שהעלית בעבר ועדיין לא שובצו לדייר. אינם חלק מהדף הנוכחי, אך מומלץ לטפל בהם.
          </p>
          <div className="space-y-2 border-r-2 border-amber-300 pr-3">
            {rows.map((tx: ReviewTransaction) => (
              <UnmatchedRow
                key={tx.id}
                tx={tx}
                allTenants={allTenants}
                selected={pendingMatches[tx.id] || ''}
                onSelect={tenantId => onSelect(tx.id, tenantId)}
                busy={busyRow === tx.id}
                onApprove={() => onApprove(tx.id)}
                onReject={() => onReject(tx.id)}
                onDelete={() => onDelete(tx.id)}
                onOpenDrawer={() => onOpenDrawer(tx)}
                meta={
                  tx.source_period_label ? (
                    <span className="inline-block text-[11px] font-medium tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      מדף {tx.source_period_label}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ConfidenceBadgeProps {
  confidence?: number | null;
}

function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence == null) return <span className="text-gray-400">—</span>;
  const pct = Math.round(confidence * 100);
  const colorClass =
    pct >= 90
      ? 'bg-green-100 text-green-700'
      : pct >= 70
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
      {pct}%
    </span>
  );
}
