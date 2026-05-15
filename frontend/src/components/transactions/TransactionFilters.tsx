import { useQuery } from '@tanstack/react-query';
import { buildingsAPI } from '../../services/api';
import type {
  TransactionsListParams,
  TransactionMatchStatus,
  TransactionDirection,
  TransactionSource,
} from '../../types';

interface Props {
  filters: TransactionsListParams;
  onChange: (next: TransactionsListParams) => void;
  onReset: () => void;
}

const MATCH_STATUS_OPTIONS: { value: TransactionMatchStatus; label: string }[] = [
  { value: 'confirmed', label: '✅ אושר' },
  { value: 'auto', label: '🤖 התאמה אוטומטית' },
  { value: 'unmatched', label: '⚪ לא מותאם' },
  { value: 'ignored', label: '🚫 מתעלם' },
];

const TYPE_OPTIONS = [
  { value: 'payment', label: 'תשלום' },
  { value: 'fee', label: 'עמלה' },
  { value: 'transfer', label: 'העברה' },
  { value: 'other', label: 'אחר' },
];

export default function TransactionFilters({ filters, onChange, onReset }: Props) {
  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: () => buildingsAPI.list(),
  });

  const toggleArray = <T extends string>(arr: T[] | undefined, value: T): T[] | undefined => {
    const set = new Set(arr ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const next = Array.from(set);
    return next.length === 0 ? undefined : next;
  };

  const update = (patch: Partial<TransactionsListParams>) => {
    onChange({ ...filters, ...patch, page: 1 });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3" dir="rtl">
      {/* Row 1: Search + date range + reset */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">חיפוש חופשי</label>
          <input
            type="text"
            value={filters.q ?? ''}
            onChange={e => update({ q: e.target.value || undefined })}
            placeholder="תיאור, משלם, או אסמכתא..."
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">מתאריך</label>
          <input
            type="date"
            value={filters.date_from ?? ''}
            onChange={e => update({ date_from: e.target.value || undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">עד תאריך</label>
          <input
            type="date"
            value={filters.date_to ?? ''}
            onChange={e => update({ date_to: e.target.value || undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">סכום מ-</label>
          <input
            type="number"
            value={filters.amount_min ?? ''}
            onChange={e => update({ amount_min: e.target.value ? parseFloat(e.target.value) : undefined })}
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">עד</label>
          <input
            type="number"
            value={filters.amount_max ?? ''}
            onChange={e => update({ amount_max: e.target.value ? parseFloat(e.target.value) : undefined })}
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          🔄 איפוס
        </button>
      </div>

      {/* Row 2: Selects + chip groups */}
      <div className="flex flex-wrap gap-3 items-start">
        {/* Building multi-select */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">בניין</label>
          <select
            multiple
            value={filters.building_id ?? []}
            onChange={e =>
              update({
                building_id: Array.from(e.target.selectedOptions).map(o => o.value),
              })
            }
            className="min-w-[160px] max-w-[200px] border border-gray-300 rounded-lg px-2 py-1 text-sm h-20"
          >
            {(buildings ?? []).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">כיוון</label>
          <select
            value={filters.direction ?? ''}
            onChange={e => update({ direction: (e.target.value || undefined) as TransactionDirection | undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">הכל</option>
            <option value="credit">זכות בלבד</option>
            <option value="debit">חובה בלבד</option>
          </select>
        </div>

        {/* Source */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">מקור</label>
          <select
            value={filters.source ?? ''}
            onChange={e => update({ source: (e.target.value || undefined) as TransactionSource | undefined })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">הכל</option>
            <option value="bank">בנק</option>
            <option value="manual">ידני</option>
          </select>
        </div>

        {/* Match status chip toggles */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">סטטוס התאמה</label>
          <div className="flex flex-wrap gap-1.5">
            {MATCH_STATUS_OPTIONS.map(opt => {
              const active = (filters.match_status ?? []).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ match_status: toggleArray(filters.match_status, opt.value) })}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type chip toggles */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">סוג</label>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map(opt => {
              const active = (filters.type ?? []).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ type: toggleArray(filters.type, opt.value) })}
                  className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
