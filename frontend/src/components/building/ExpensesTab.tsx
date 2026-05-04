import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { expensesAPI } from '../../services/api';
import type { Expense, ExpenseCategory } from '../../types';
import type { DateRange } from '../../hooks/useBuildingPeriodRange';
import { toYYYYMM } from '../../hooks/useBuildingPeriodRange';
import CategoryManagerModal from './CategoryManagerModal';
import BulkCategorize from './BulkCategorize';

interface Props {
  buildingId: string;
  range: DateRange;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── CategoryChip ─────────────────────────────────────────────────────────────

function CategoryChip({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
        active
          ? 'border-transparent text-white shadow-sm'
          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
      style={active ? { backgroundColor: color ?? '#6B7280' } : undefined}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : color }}
        />
      )}
      {label}
      <span
        className={`px-1 py-0.5 rounded text-[10px] font-semibold ${
          active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ─── InlineCategorySelect ─────────────────────────────────────────────────────

function InlineCategorySelect({
  expense,
  categories,
  onSave,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  onSave: (transactionId: string, categoryId: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? null : e.target.value;
    setSaving(true);
    try { await onSave(expense.transaction_id, val); }
    finally { setSaving(false); }
  };

  const borderColor = expense.category_color ?? '#E5E7EB';

  return (
    <div className="relative">
      <select
        value={expense.category_id ?? ''}
        onChange={handleChange}
        disabled={saving}
        className="text-xs pr-2 pl-6 py-1 rounded-full border font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 cursor-pointer appearance-none bg-white"
        style={{ borderColor }}
      >
        <option value="">ללא קטגוריה</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>
      {/* Color swatch */}
      {expense.category_color && (
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
          style={{ backgroundColor: expense.category_color }}
        />
      )}
      {saving && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3">
          <span className="animate-spin block w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
        </span>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ExpensesTab({ buildingId, range }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all' | 'uncategorized'>('all');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showBulkCategorize, setShowBulkCategorize] = useState(false);

  const from = toYYYYMM(range.from);
  const to = toYYYYMM(range.to);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: expenses, isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', buildingId, from, to],
    queryFn: () => expensesAPI.list(buildingId, from, to),
    enabled: !!buildingId,
  });

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: ['expenseCategories', buildingId],
    queryFn: () => expensesAPI.listCategories(buildingId),
    enabled: !!buildingId,
    staleTime: 60_000,
  });

  // ── Mutation: set category ─────────────────────────────────────────────────
  const setCategoryMutation = useMutation({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string | null }) =>
      expensesAPI.setCategory(transactionId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', buildingId, from, to] });
      queryClient.invalidateQueries({ queryKey: ['summaryStats', buildingId] });
    },
  });

  const handleSetCategory = async (transactionId: string, categoryId: string | null) => {
    await setCategoryMutation.mutateAsync({ transactionId, categoryId });
  };

  // ── Filter + stats ─────────────────────────────────────────────────────────
  const catList = categories ?? [];

  const categoryCount = useMemo(() => {
    const counts = new Map<string | null, number>();
    (expenses ?? []).forEach((e) => {
      const key = e.category_id ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [expenses]);

  const filtered = useMemo(() => {
    if (!expenses) return [];
    if (selectedCategoryId === 'all') return expenses;
    if (selectedCategoryId === 'uncategorized') return expenses.filter((e) => !e.category_id);
    return expenses.filter((e) => e.category_id === selectedCategoryId);
  }, [expenses, selectedCategoryId]);

  const totalFiltered = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
  const totalAll = useMemo(() => (expenses ?? []).reduce((s, e) => s + e.amount, 0), [expenses]);

  const uncategorizedCount = categoryCount.get(null) ?? 0;

  if (expensesLoading) {
    return (
      <div className="space-y-4 animate-pulse" dir="rtl">
        <div className="h-10 bg-gray-100 rounded-lg" />
        <div className="h-64 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  const noExpenses = (expenses ?? []).length === 0;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header row */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {t('building.expenses.title')}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {(expenses ?? []).length} {t('building.expenses.items')} • ₪{totalAll.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {uncategorizedCount > 0 && (
            <button
              onClick={() => setShowBulkCategorize(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors font-medium"
            >
              🏷️ {t('building.expenses.bulk_categorize')} ({uncategorizedCount})
            </button>
          )}
          <button
            onClick={() => setShowCategoryManager(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors font-medium"
          >
            ⚙️ {t('building.expenses.manage_categories')}
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      {!noExpenses && (
        <div className="flex flex-wrap gap-2 items-center">
          <CategoryChip
            label={t('building.expenses.all')}
            count={expenses?.length ?? 0}
            active={selectedCategoryId === 'all'}
            onClick={() => setSelectedCategoryId('all')}
          />
          {catList.map((cat) => {
            const cnt = categoryCount.get(cat.id) ?? 0;
            if (cnt === 0) return null;
            return (
              <CategoryChip
                key={cat.id}
                label={cat.name}
                color={cat.color}
                count={cnt}
                active={selectedCategoryId === cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
              />
            );
          })}
          {uncategorizedCount > 0 && (
            <CategoryChip
              label={t('building.expenses.uncategorized')}
              color="#9CA3AF"
              count={uncategorizedCount}
              active={selectedCategoryId === 'uncategorized'}
              onClick={() => setSelectedCategoryId('uncategorized')}
            />
          )}
        </div>
      )}

      {/* Expense table or empty state */}
      {noExpenses ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h4 className="text-base font-semibold text-gray-700 mb-1">{t('building.expenses.empty_title')}</h4>
          <p className="text-sm text-gray-400">{t('building.expenses.empty_body')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          {t('building.expenses.no_match')}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('building.expenses.col_date')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('building.expenses.col_description')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('building.expenses.col_vendor')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('building.expenses.col_category')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('building.expenses.col_amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((expense) => (
                  <tr key={expense.allocation_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-xs truncate" title={expense.description}>
                      {expense.description}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {expense.vendor_label ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <InlineCategorySelect
                        expense={expense}
                        categories={catList}
                        onSave={handleSetCategory}
                      />
                    </td>
                    <td className="px-4 py-3 text-left font-medium text-gray-900 whitespace-nowrap">
                      ₪{expense.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    {selectedCategoryId !== 'all'
                      ? t('building.expenses.subtotal')
                      : t('building.expenses.total')}
                  </td>
                  <td className="px-4 py-3 text-left font-bold text-gray-900">
                    ₪{totalFiltered.toLocaleString()}
                    {selectedCategoryId !== 'all' && (
                      <span className="text-xs text-gray-400 mr-2">
                        / ₪{totalAll.toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* CategoryManagerModal */}
      {showCategoryManager && (
        <CategoryManagerModal
          buildingId={buildingId}
          onClose={() => setShowCategoryManager(false)}
        />
      )}

      {/* BulkCategorize */}
      {showBulkCategorize && (
        <BulkCategorize
          buildingId={buildingId}
          expenses={(expenses ?? []).filter((e) => !e.category_id)}
          categories={catList}
          onClose={() => setShowBulkCategorize(false)}
          onDone={() => {
            setShowBulkCategorize(false);
            queryClient.invalidateQueries({ queryKey: ['expenses', buildingId, from, to] });
          }}
        />
      )}
    </div>
  );
}
