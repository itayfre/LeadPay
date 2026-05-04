import { useSearchParams } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Layout from '../components/layout/Layout';
import { buildingsAPI } from '../services/api';
import BuildingTabs, { type BuildingTab } from '../components/building/BuildingTabs';
import PeriodRangePicker from '../components/building/PeriodRangePicker';
import CollectionTab from '../components/building/CollectionTab';
import SummaryTab from '../components/building/SummaryTab';
import ExpensesTab from '../components/building/ExpensesTab';
import { useBuildingPeriodRange } from '../hooks/useBuildingPeriodRange';

const VALID_TABS: BuildingTab[] = ['summary', 'collection', 'expenses'];

export default function Dashboard() {
  const { t } = useTranslation();
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Tab state (URL-synced) ─────────────────────────────────────────────────
  const rawTab = searchParams.get('tab') as BuildingTab | null;
  const activeTab: BuildingTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'summary';

  const setTab = (tab: BuildingTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  // ── Period range (URL-synced) ──────────────────────────────────────────────
  const { range, setRange } = useBuildingPeriodRange();

  // ── Building header data ───────────────────────────────────────────────────
  const { data: building } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsAPI.get(buildingId!),
    enabled: !!buildingId,
  });

  if (!buildingId) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-red-600">{t('common.error')}: Missing building ID</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* ── Building header ─────────────────────────────────────────────── */}
        <div className="flex justify-between items-start" dir="rtl">
          <div>
            <button
              onClick={() => navigate('/buildings')}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1 text-sm"
            >
              ← {t('nav.buildings')}
            </button>
            <h2 className="text-2xl font-bold text-gray-900">
              {building?.name ?? t('common.loading')}
            </h2>
            {building && (
              <p className="text-sm text-gray-500">
                📍 {building.address}, {building.city}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => navigate(`/building/${buildingId}/tenants`)}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              👥 {t('nav.tenants')}
            </button>
            <button
              onClick={() => navigate(`/building/${buildingId}/upload`)}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              📄 {t('dashboard.uploadStatement')}
            </button>
          </div>
        </div>

        {/* ── Tabs + range picker row ──────────────────────────────────────── */}
        <BuildingTabs activeTab={activeTab} onChange={setTab} />
        <PeriodRangePicker range={range} onChange={setRange} />

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        {activeTab === 'summary' && (
          <SummaryTab
            buildingId={buildingId}
            range={range}
            onGoToExpenses={() => setTab('expenses')}
          />
        )}
        {activeTab === 'collection' && (
          <CollectionTab buildingId={buildingId} range={range} />
        )}
        {activeTab === 'expenses' && (
          <ExpensesTab buildingId={buildingId} range={range} />
        )}
      </div>
    </Layout>
  );
}
