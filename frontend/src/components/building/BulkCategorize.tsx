import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { expensesAPI } from '../../services/api';
import type { Expense, ExpenseCategory } from '../../types';

interface Props {
  buildingId: string;
  expenses: Expense[];           // pre-filtered to uncategorized only
  categories: ExpenseCategory[];
  onClose: () => void;
  onDone: () => void;
}

export default function BulkCategorize({ buildingId, expenses, categories, onClose, onDone }: Props) {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedCategoryId, setPickedCategoryId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === expenses.length && expenses.length > 0;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(expenses.map((e) => e.transaction_id)));
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleApply = async () => {
    if (selected.size === 0 || !pickedCategoryId) return;
    setSaving(true);
    setError(null);
    try {
      await expensesAPI.bulkCategorize(
        buildingId,
        Array.from(selected),
        pickedCategoryId,
      );
      onDone();
    } catch {
      setError(t('building.expenses.bulk_error'));
    } finally {
      setSaving(false);
    }
  };

  const pickedCategory = categories.find((c) => c.id === pickedCategoryId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {t('building.expenses.bulk_categorize_title')}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {expenses.length} {t('building.expenses.uncategorized_items')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">✕</button>
        </div>

        {/* Category picker */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-3">
            {t('building.expenses.select_category_to_assign')}
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setPickedCategoryId(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  pickedCategoryId === cat.id
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
                style={pickedCategoryId === cat.id ? { backgroundColor: cat.color } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: pickedCategoryId === cat.id ? 'rgba(255,255,255,0.7)' : cat.color }}
                />
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Expense list */}
        <div className="flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t('building.expenses.col_date')}</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t('building.expenses.col_description')}</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">{t('building.expenses.col_vendor')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{t('building.expenses.col_amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((expense) => (
                <tr
                  key={expense.allocation_id}
                  onClick={() => toggle(expense.transaction_id)}
                  className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                    selected.has(expense.transaction_id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(expense.transaction_id)}
                      onChange={() => toggle(expense.transaction_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(expense.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate" title={expense.description}>
                    {expense.description}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                    {expense.vendor_label ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-left font-medium text-gray-900 whitespace-nowrap">
                    ₪{expense.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            {selected.size > 0 ? (
              <span>
                {selected.size} {t('building.expenses.selected')}
                {pickedCategory && (
                  <span>
                    {' '}&rarr;{' '}
                    <span
                      className="font-medium px-1.5 py-0.5 rounded text-white text-xs"
                      style={{ backgroundColor: pickedCategory.color }}
                    >
                      {pickedCategory.name}
                    </span>
                  </span>
                )}
              </span>
            ) : (
              <span className="text-gray-400">{t('building.expenses.select_items')}</span>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleApply}
              disabled={selected.size === 0 || !pickedCategoryId || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium text-sm"
            >
              {saving ? t('common.saving') : t('building.expenses.apply_category')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
