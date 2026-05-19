import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { statementsAPI } from '../../services/api';
import type { MatchSuggestion, TransactionRow } from '../../types';

interface Props {
  row: TransactionRow;
  onClose: () => void;
  onOpenSplit: () => void;
  onMatched?: () => void;
}

/**
 * Inline single-tenant match for an unmatched transaction. Loads the same
 * suggestion data the upload-review screen uses, lets the user pick a tenant
 * in one click, and optionally teaches the engine via `remember`.
 *
 * For multi-tenant splits or monthly periods, the user clicks "פיצול" which
 * hands control to the existing AllocationDrawer (handled by the parent).
 */
export default function QuickMatchPopover({ row, onClose, onOpenSplit, onMatched }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [remember, setRemember] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['reviewForm', row.id],
    queryFn: () => statementsAPI.getTransactionReviewForm(row.id),
  });

  const suggestions: MatchSuggestion[] = data?.tx?.suggestions ?? [];
  const allTenants: MatchSuggestion[] = data?.all_tenants ?? [];

  const suggestionIds = useMemo(() => new Set(suggestions.map(s => s.tenant_id)), [suggestions]);
  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTenants
      .filter(t => !suggestionIds.has(t.tenant_id))
      .filter(t => !q || t.tenant_name.toLowerCase().includes(q));
  }, [allTenants, suggestionIds, search]);

  const matchMutation = useMutation({
    mutationFn: (tenantId: string) => statementsAPI.manualMatch(row.id, tenantId, remember),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onMatched?.();
      onClose();
    },
  });

  const handlePick = (tenantId: string) => {
    if (matchMutation.isPending) return;
    matchMutation.mutate(tenantId);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">התאמת תנועה לדייר</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate" title={row.description}>
            {row.description} · ₪{(row.credit_amount ?? row.debit_amount ?? 0).toLocaleString()}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {suggestions.length > 0 && (
              <div className="px-5 pt-4">
                <div className="text-xs font-medium text-gray-500 mb-2">💡 הצעות המערכת</div>
                <div className="space-y-1">
                  {suggestions.map(s => (
                    <button
                      key={s.tenant_id}
                      onClick={() => handlePick(s.tenant_id)}
                      disabled={matchMutation.isPending}
                      className="w-full text-right px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 transition-colors flex items-center justify-between"
                    >
                      <span className="text-xs text-gray-500">{Math.round(s.score * 100)}%</span>
                      <span className="font-medium text-gray-900">{s.tenant_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-4">
              <div className="text-xs font-medium text-gray-500 mb-2">כל הדיירים</div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש דייר..."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredTenants.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-4">אין דיירים תואמים</div>
                ) : (
                  filteredTenants.map(t => (
                    <button
                      key={t.tenant_id}
                      onClick={() => handlePick(t.tenant_id)}
                      disabled={matchMutation.isPending}
                      className="w-full text-right px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      {t.tenant_name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {matchMutation.isError && (
              <div className="mx-5 mb-3 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                {(matchMutation.error as Error).message}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-xl">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="rounded border-gray-300"
            />
            למד את ההתאמה הזו
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenSplit}
              className="text-xs px-3 py-1.5 text-purple-700 hover:bg-purple-50 rounded font-medium"
            >
              ✂️ פיצול לכמה דיירים / חודשים
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
