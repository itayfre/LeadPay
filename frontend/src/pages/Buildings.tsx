import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/layout/Layout';
import { buildingsAPI } from '../services/api';
import type { Building } from '../types';

export default function Buildings() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: buildings, isLoading, error } = useQuery({
    queryKey: ['buildings'],
    queryFn: buildingsAPI.list,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">{t('common.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{t('common.error')}: {(error as Error).message}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('nav.buildings')}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {buildings?.length || 0} בניינים
            </p>
          </div>
        </div>

        {/* Buildings Grid */}
        {buildings && buildings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buildings.map((building: Building) => (
              <BuildingCard
                key={building.id}
                building={building}
                onClick={() => navigate(`/building/${building.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-6xl mb-4">🏢</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              אין בניינים עדיין
            </h3>
            <p className="text-gray-500">
              השתמש ב-API כדי להוסיף בניינים חדשים
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

interface BuildingCardProps {
  building: Building;
  onClick: () => void;
}

function BuildingCard({ building, onClick }: BuildingCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {building.name}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            📍 {building.address}, {building.city}
          </p>
        </div>
        <div className="text-2xl">🏢</div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-500 mb-1">דיירים</p>
          <p className="text-lg font-semibold text-gray-900">
            {building.total_tenants || 0}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">תשלום חודשי</p>
          <p className="text-lg font-semibold text-gray-900">
            {building.expected_monthly_payment ? `₪${building.expected_monthly_payment}` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <button className="w-full bg-blue-50 text-blue-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors">
          צפה בסטטוס תשלומים →
        </button>
      </div>
    </div>
  );
}
