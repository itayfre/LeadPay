import { useTranslation } from 'react-i18next';

export type SizeFilter = '' | 'small' | 'medium' | 'large';
export type StatusFilter = '' | 'all_paid' | 'partial' | 'none_paid';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  city: string;
  onCityChange: (v: string) => void;
  cities: string[];
  size: SizeFilter;
  onSizeChange: (v: SizeFilter) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
}

export default function FilterBar({
  search, onSearchChange,
  city, onCityChange, cities,
  size, onSizeChange,
  status, onStatusChange,
}: Props) {
  const { t } = useTranslation();

  const sizeOptions: { v: SizeFilter; key: string }[] = [
    { v: '',       key: 'buildings.all' },
    { v: 'small',  key: 'buildings.small' },
    { v: 'medium', key: 'buildings.medium' },
    { v: 'large',  key: 'buildings.large' },
  ];

  const statusOptions: { v: StatusFilter; key: string }[] = [
    { v: '',          key: 'buildings.all' },
    { v: 'all_paid',  key: 'buildings.allPaid' },
    { v: 'partial',   key: 'buildings.partialPaid' },
    { v: 'none_paid', key: 'buildings.nonePaid' },
  ];

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap" dir="rtl">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder={t('buildings.searchPlaceholder')}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="h-9 w-72 ring-1 ring-ink-200 rounded-md bg-white px-3 text-[13px] placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <select
          value={city}
          onChange={e => onCityChange(e.target.value)}
          className="h-9 ring-1 ring-ink-200 rounded-md bg-white px-3 text-[13px] font-medium text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">{t('buildings.allCities')}</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="ring-1 ring-ink-200 rounded-md bg-white h-9 flex items-stretch text-[13px] font-medium overflow-hidden">
          {statusOptions.map((opt, i) => (
            <button
              key={opt.v}
              onClick={() => onStatusChange(opt.v)}
              className={`px-3 ${status === opt.v ? 'bg-ink-100 text-ink-900' : 'text-ink-500'} ${i > 0 ? 'border-r border-ink-200' : ''}`}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-500">{t('buildings.filterSize')}</span>
        <div className="ring-1 ring-ink-200 rounded-md bg-white h-9 flex items-stretch text-[13px] font-medium overflow-hidden">
          {sizeOptions.map((opt, i) => (
            <button
              key={opt.v}
              onClick={() => onSizeChange(opt.v)}
              className={`px-3 ${size === opt.v ? 'bg-ink-100 text-ink-900' : 'text-ink-500'} ${i > 0 ? 'border-r border-ink-200' : ''}`}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
