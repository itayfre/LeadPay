import { useTranslation } from 'react-i18next';

export type BuildingTab = 'summary' | 'collection' | 'expenses';

interface Props {
  activeTab: BuildingTab;
  onChange: (tab: BuildingTab) => void;
}

export default function BuildingTabs({ activeTab, onChange }: Props) {
  const { t } = useTranslation();

  const tabs: Array<{ id: BuildingTab; label: string; icon: string }> = [
    { id: 'summary', label: t('building.tabs.summary'), icon: '📊' },
    { id: 'collection', label: t('building.tabs.collection'), icon: '💳' },
    { id: 'expenses', label: t('building.tabs.expenses'), icon: '📋' },
  ];

  return (
    <div
      className="bg-gray-100 rounded-xl p-1 flex gap-1"
      role="tablist"
      dir="rtl"
      aria-label={t('building.tabs.aria_label')}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5',
            'rounded-lg text-sm font-medium transition-all duration-150',
            activeTab === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60',
          ].join(' ')}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
