import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/layout/Layout';
import { buildingsAPI } from '../services/api';
import type { Building } from '../types';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import BuildingEditModal from '../components/modals/BuildingEditModal';

export default function Buildings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [buildingToDelete, setBuildingToDelete] = useState<Building | null>(null);
  const [buildingToEdit, setBuildingToEdit] = useState<Building | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: buildings, isLoading, error } = useQuery({
    queryKey: ['buildings'],
    queryFn: buildingsAPI.list,
  });

  const handleDelete = async () => {
    if (!buildingToDelete) return;

    try {
      await buildingsAPI.delete(buildingToDelete.id);
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
      setBuildingToDelete(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  const handleEdit = async (data: Partial<Building>) => {
    if (!buildingToEdit) return;

    try {
      await buildingsAPI.update(buildingToEdit.id, data);
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
      setBuildingToEdit(null);
    } catch (err) {
      throw err;
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600 mx-auto"></div>
            <p className="mt-6 text-lg text-gray-600 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-6 shadow-sm">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="mr-3">
              <p className="text-sm font-medium text-red-800">{t('common.error')}: {(error as Error).message}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{t('nav.buildings')}</h1>
              <p className="text-primary-100 text-lg">
                {buildings?.length || 0} {buildings?.length === 1 ? 'בניין' : 'בניינים'} במערכת
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">🏢</div>
            </div>
          </div>
        </div>

        {/* Buildings Grid */}
        {buildings && buildings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buildings.map((building: Building) => (
              <BuildingCard
                key={building.id}
                building={building}
                onClick={() => {
                  if ((building.total_tenants || 0) === 0) {
                    navigate(`/building/${building.id}/tenants`);
                  } else {
                    navigate(`/building/${building.id}`);
                  }
                }}
                onEdit={() => setBuildingToEdit(building)}
                onDelete={() => setBuildingToDelete(building)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-sm">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
              <span className="text-5xl">🏢</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              אין בניינים במערכת
            </h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              השתמש ב-API כדי להוסיף בניינים חדשים למערכת ולהתחיל לעקוב אחר תשלומים
            </p>
            <button className="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors shadow-md">
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              הוסף בניין ראשון
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!buildingToDelete}
        title="מחק בניין"
        message={`האם אתה בטוח שברצונך למחוק את "${buildingToDelete?.name}"? פעולה זו תמחק גם את כל הדיירים, דפי החשבון וההודעות הקשורים לבניין זה. פעולה זו לא ניתנת לביטול!`}
        confirmText="מחק לצמיתות"
        cancelText="ביטול"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setBuildingToDelete(null);
          setDeleteError(null);
        }}
      />

      {/* Edit Building Modal */}
      <BuildingEditModal
        isOpen={!!buildingToEdit}
        building={buildingToEdit}
        onSave={handleEdit}
        onCancel={() => setBuildingToEdit(null)}
      />

      {/* Delete Error */}
      {deleteError && (
        <div className="fixed bottom-4 right-4 bg-red-50 border-2 border-red-200 rounded-lg p-4 shadow-xl max-w-md">
          <p className="text-red-800 font-medium">{deleteError}</p>
        </div>
      )}
    </Layout>
  );
}

interface BuildingCardProps {
  building: Building;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function BuildingCard({ building, onClick, onEdit, onDelete }: BuildingCardProps) {
  const [showEditMenu, setShowEditMenu] = useState(false);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditMenu(!showEditMenu);
  };

  return (
    <div className="group bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-100 hover:border-primary-300 relative">
      {/* Edit Button */}
      <button
        onClick={handleMenuToggle}
        className="absolute top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {/* Edit Menu */}
      {showEditMenu && (
        <div className="absolute top-14 left-4 z-20 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[160px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setShowEditMenu(false);
            }}
            className="w-full px-4 py-2 text-right hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-sm">ערוך פרטים</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setShowEditMenu(false);
            }}
            className="w-full px-4 py-2 text-right hover:bg-red-50 text-red-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="text-sm">מחק בניין</span>
          </button>
        </div>
      )}

      {/* Card Content - Clickable */}
      <div onClick={onClick} className="cursor-pointer">
        {/* Card Header */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-6 border-b border-primary-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-primary-700 transition-colors">
                {building.name}
              </h3>
              <div className="flex items-center text-sm text-gray-600">
                <svg className="w-4 h-4 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{building.address}, {building.city}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <span className="text-3xl">🏢</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center mb-2">
                <svg className="w-5 h-5 text-blue-600 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">דיירים</p>
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {building.total_tenants || 0}
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center mb-2">
                <svg className="w-5 h-5 text-green-600 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">חודשי</p>
              </div>
              <p className="text-2xl font-bold text-green-900">
                {building.expected_monthly_payment ? `₪${building.expected_monthly_payment.toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="px-6 pb-6">
          <button className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center group-hover:scale-105">
            <span>צפה בסטטוס תשלומים</span>
            <svg className="w-5 h-5 mr-2 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
