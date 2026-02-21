import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import TenantModal from '../components/modals/TenantModal';
import TenantImportModal from '../components/modals/TenantImportModal';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import { buildingsAPI, tenantsAPI } from '../services/api';
import type { Tenant } from '../types';

export default function Tenants() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: building } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsAPI.get(buildingId!),
    enabled: !!buildingId,
  });

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants', buildingId],
    queryFn: () => tenantsAPI.list(buildingId!),
    enabled: !!buildingId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
  };

  const handleDelete = async () => {
    if (!deleteTenant) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await tenantsAPI.delete(deleteTenant.id);
      setDeleteTenant(null);
      invalidate();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const OWNERSHIP_COLOR: Record<string, string> = {
    'בעלים': 'bg-blue-100 text-blue-800',
    'משכיר': 'bg-purple-100 text-purple-800',
    'שוכר': 'bg-green-100 text-green-800',
  };

  const sorted = [...(tenants || [])].sort((a, b) =>
    (a.apartment_number || 0) - (b.apartment_number || 0)
  );

  return (
    <Layout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <button
              onClick={() => navigate(`/building/${buildingId}`)}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1 text-sm"
            >
              ← חזרה לדשבורד
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{building?.name || 'טוען...'}</h2>
            <p className="text-sm text-gray-500">
              ניהול דיירים • {tenants?.length || 0} דיירים רשומים
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
            >
              📊 ייבוא מ-Excel
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              + הוסף דייר
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">אין דיירים עדיין</h3>
              <p className="text-gray-500 mb-6">הוסף דיירים ידנית או ייבא מ-Excel</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                >
                  📊 ייבוא מ-Excel
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  + הוסף דייר ראשון
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['דירה', 'שם', 'סוג בעלות', 'טלפון', 'בנק', 'שפה', 'ה.קבע', 'פעיל', 'פעולות'].map(col => (
                      <th key={col} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sorted.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {tenant.apartment_number || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                        {tenant.full_name && tenant.full_name !== tenant.name && (
                          <div className="text-xs text-gray-400">{tenant.full_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${OWNERSHIP_COLOR[tenant.ownership_type] || 'bg-gray-100 text-gray-700'}`}>
                          {tenant.ownership_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600" dir="ltr">
                        {tenant.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {tenant.bank_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded ${tenant.language === 'he' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {tenant.language === 'he' ? 'עב' : 'EN'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {tenant.has_standing_order ? '✅' : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {tenant.is_active ? (
                          <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 bg-gray-300 rounded-full"></span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditTenant(tenant)}
                            className="text-gray-400 hover:text-blue-600 transition-colors text-lg"
                            title="עריכה"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => { setDeleteTenant(tenant); setDeleteError(null); }}
                            className="text-gray-400 hover:text-red-600 transition-colors text-lg"
                            title="מחיקה"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editTenant) && (
        <TenantModal
          buildingId={buildingId!}
          tenant={editTenant}
          onClose={() => { setShowAddModal(false); setEditTenant(null); }}
          onSaved={invalidate}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <TenantImportModal
          buildingId={buildingId!}
          onClose={() => setShowImportModal(false)}
          onImported={invalidate}
        />
      )}

      {/* Delete Confirmation */}
      {deleteError && deleteTenant && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm shadow-lg">
          {deleteError}
        </div>
      )}
      <ConfirmDialog
        isOpen={!!deleteTenant}
        title="מחיקת דייר"
        message={deleteTenant ? `האם אתה בטוח שברצונך למחוק את הדייר "${deleteTenant.name}"? פעולה זו אינה ניתנת לביטול.` : ''}
        confirmText={deleting ? 'מוחק...' : 'מחק'}
        cancelText="ביטול"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTenant(null); setDeleteError(null); }}
      />
    </Layout>
  );
}
