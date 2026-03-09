import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { statementsAPI } from '../../services/api';
import type { StatementReview, ReviewTransaction, MatchSuggestion } from '../../types';

interface Props {
  statementId: string;
  buildingId: string;
  onClose: () => void;
}

type Tab = 'unmatched' | 'matched' | 'irrelevant';

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

export default function UploadReviewModal({ statementId, buildingId, onClose }: Props) {
  const queryClient = useQueryClient();

  const [review, setReview] = useState<StatementReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('unmatched');

  // Map transactionId → selected tenantId
  const [pendingMatches, setPendingMatches] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Reject (unmatch) state
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    statementsAPI.getReview(statementId)
      .then(data => {
        setReview(data);
        // Default to unmatched tab; if no unmatched items, switch to matched
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

  const handleConfirm = async () => {
    if (pendingCount === 0) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await Promise.all(
        Object.entries(pendingMatches).map(([txId, tenantId]) =>
          statementsAPI.manualMatch(txId, tenantId)
        )
      );
      // Refresh review data and dashboard
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
      // Reload review to move confirmed items to matched tab
      const updated = await statementsAPI.getReview(statementId);
      setReview(updated);
      setPendingMatches({});
      if (updated.unmatched.length === 0) {
        setActiveTab('matched');
      }
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async (txId: string) => {
    setRejectingId(txId);
    try {
      await statementsAPI.unmatchTransaction(txId);
      const updated = await statementsAPI.getReview(statementId);
      setReview(updated);
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
      if (updated.unmatched.length > 0) setActiveTab('unmatched');
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setRejectingId(null);
    }
  };

  const tabs: { id: Tab; label: string; count: number }[] = review
    ? [
        { id: 'unmatched', label: 'לא הותאמו', count: review.unmatched.length },
        { id: 'matched', label: 'הותאמו אוטומטית', count: review.matched.length },
        { id: 'irrelevant', label: 'לא רלוונטי', count: review.irrelevant.length },
      ]
    : [];

  return (
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
              {activeTab === 'unmatched' && (
                <div className="space-y-3">
                  {review.unmatched.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <div className="text-4xl mb-2">✅</div>
                      <p>כל העסקאות הותאמו!</p>
                    </div>
                  ) : (
                    review.unmatched.map((tx: ReviewTransaction) => (
                      <UnmatchedRow
                        key={tx.id}
                        tx={tx}
                        allTenants={review.all_tenants}
                        selected={pendingMatches[tx.id] || ''}
                        onSelect={tenantId => handleSelectTenant(tx.id, tenantId)}
                      />
                    ))
                  )}
                </div>
              )}

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
                          <th className="pb-2 font-medium"></th>
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
                              <button
                                onClick={() => handleReject(tx.id)}
                                disabled={rejectingId === tx.id}
                                title="בטל התאמה"
                                className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none disabled:opacity-40"
                              >
                                {rejectingId === tx.id ? '…' : '✕'}
                              </button>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <div>
                {confirmError && (
                  <p className="text-red-600 text-sm">{confirmError}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  סגור
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={pendingCount === 0 || confirming}
                  className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    pendingCount === 0 || confirming
                      ? 'bg-blue-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirming
                    ? 'שומר...'
                    : pendingCount > 0
                    ? `אשר התאמות ידניות (${pendingCount})`
                    : 'אשר התאמות ידניות'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

interface UnmatchedRowProps {
  tx: ReviewTransaction;
  allTenants: MatchSuggestion[];
  selected: string;
  onSelect: (tenantId: string) => void;
}

function UnmatchedRow({ tx, allTenants, selected, onSelect }: UnmatchedRowProps) {
  const suggestions = tx.suggestions || [];
  const suggestionIds = new Set(suggestions.map(s => s.tenant_id));
  // All tenants not already in top suggestions
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
