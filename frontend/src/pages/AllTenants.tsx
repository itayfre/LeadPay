import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import TenantModal from '../components/modals/TenantModal';
import TenantImportModal from '../components/modals/TenantImportModal';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import { buildingsAPI, tenantsAPI, apartmentsAPI } from '../services/api';
import type { Tenant } from '../types';

const OWNERSHIP_COLOR: Record<string, string> = {
  'בעלים': 'bg-blue-100 text-blue-800',
  'משכיר': 'bg-purple-100 text-purple-800',
  'שוכר': 'bg-green-100 text-green-800',
};

const SortIcon = ({
  col,
  sortColumn,
  sortDirection,
}: {
  col: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}) => (
  <span className={`mr-1 text-xs ${sortColumn === col ? 'text-blue-600' : 'text-gray-300'}`}>
    {sortColumn === col ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
  </span>
);

export default function AllTenants() {
  const queryClient = useQueryClient();

  const [filterBuildingId, setFilterBuildingId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentValue, setEditingPaymentValue] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Sort state
  const [sortColumn, setSortColumn] = useState('building_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter state
  const [filterActive, setFilterActive] = useState<'' | 'active' | 'inactive'>('');
  const [filterPayment, setFilterPayment] = useState<'' | 'set' | 'unset'>('');

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: () => buildingsAPI.list(),
  });

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants', filterBuildingId || 'all'],
    queryFn: () => tenantsAPI.list(filterBuildingId || undefined),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
    queryClient.invalidateQueries({ queryKey: ['buildings'] });
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
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

  const handleSavePayment = async (tenant: Tenant) => {
    setSavingPayment(true);
    try {
      const val = editingPaymentValue === '' ? null : parseFloat(editingPaymentValue);
      await apartmentsAPI.patch(tenant.apartment_id, { expected_payment: val });
      invalidate();
      setEditingPaymentId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleResetPayment = async (tenant: Tenant) => {
    setSavingPayment(true);
    try {
      await apartmentsAPI.patch(tenant.apartment_id, { expected_payment: null });
      invalidate();
      setEditingPaymentId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPayment(false);
    }
  };

  // Filter
  const filtered = (tenants || []).filter(t => {
    if (filterActive === 'active' && !t.is_active) return false;
    if (filterActive === 'inactive' && t.is_active) return false;
    if (filterPayment === 'set' && t.expected_payment == null) return false;
    if (filterPayment === 'unset' && t.expected_payment != null) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !(t.full_name || '').toLowerCase().includes(q) &&
        !(t.phone || '').includes(q) &&
        !String(t.apartment_number || '').includes(q)
      ) return false;
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'building_name':
        return dir * (a.building_name || '').localeCompare(b.building_name || '', 'he');
      case 'apartment_number':
        return dir * ((a.apartment_number || 0) - (b.apartment_number || 0));
      case 'name':
        return dir * a.name.localeCompare(b.name, 'he');
      case 'ownership_type':
        return dir * (a.ownership_type || '').localeCompare(b.ownership_type || '', 'he');
      case 'is_active':
        return dir * (Number(b.is_active) - Number(a.is_active));
      case 'expected_payment':
        return dir * ((a.expected_payment ?? a.building_expected_payment ?? 0) - (b.expected_payment ?? b.building_expected_payment ?? 0));
      case 'move_in_date':
        return dir * (a.move_in_date || '').localeCompare(b.move_in_date || '');
      default:
        return 0;
    }
  });

  const thClass = "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors";
  const thStaticClass = "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider";

  return (
    <Layout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">כל הדיירים</h2>
            <p className="text-sm text-gray-500">
              {isLoading ? 'טוען...' : `${sorted.length} דיירים${filterBuildingId ? ' בבניין הנבחר' : ' בכל הבניינים'}`}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
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

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="חיפוש לפי שם, טלפון, דירה..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={filterBuildingId}
            onChange={e => setFilterBuildingId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">כל הבניינים</option>
            {buildings?.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value as '' | 'active' | 'inactive')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">כל הסטטוסים</option>
            <option value="active">פעילים בלבד</option>
            <option value="inactive">לא פעילים</option>
          </select>
          <select
            value={filterPayment}
            onChange={e => setFilterPayment(e.target.value as '' | 'set' | 'unset')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">כל התשלומים</option>
            <option value="set">תשלום מותאם אישית</option>
            <option value="unset">תשלום ברירת מחדל</option>
          </select>
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
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {search ? 'לא נמצאו דיירים' : 'אין דיירים עדיין'}
              </h3>
              <p className="text-gray-500 mb-6">
                {search ? 'נסה חיפוש אחר' : 'הוסף דיירים ידנית או ייבא מ-Excel'}
              </p>
              {!search && (
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
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th onClick={() => handleSort('building_name')} className={thClass}>
                      בניין<SortIcon col="building_name" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th onClick={() => handleSort('apartment_number')} className={thClass}>
                      דירה<SortIcon col="apartment_number" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th onClick={() => handleSort('name')} className={thClass}>
                      שם<SortIcon col="name" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th onClick={() => handleSort('ownership_type')} className={thClass}>
                      סוג בעלות<SortIcon col="ownership_type" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className={thStaticClass}>טלפון</th>
                    <th className={thStaticClass}>בנק</th>
                    <th className={thStaticClass}>שפה</th>
                    <th className={thStaticClass}>ה.קבע</th>
                    <th onClick={() => handleSort('is_active')} className={thClass}>
                      פעיל<SortIcon col="is_active" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th onClick={() => handleSort('move_in_date')} className={thClass}>
                      תאריך כניסה<SortIcon col="move_in_date" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th onClick={() => handleSort('expected_payment')} className={thClass}>
                      תשלום צפוי<SortIcon col="expected_payment" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className={thStaticClass}>פעולות</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sorted.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {tenant.building_name || '—'}
                      </td>
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
                        {tenant.ownership_type ? (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${OWNERSHIP_COLOR[tenant.ownership_type] || 'bg-gray-100 text-gray-700'}`}>
                            {tenant.ownership_type}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
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
                      <td className="px-4 py-3 text-sm text-gray-500" dir="ltr">
                        {tenant.move_in_date
                          ? new Date(tenant.move_in_date).toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {editingPaymentId === tenant.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editingPaymentValue}
                              onChange={e => setEditingPaymentValue(e.target.value)}
                              placeholder="סכום"
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSavePayment(tenant);
                                if (e.key === 'Escape') setEditingPaymentId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSavePayment(tenant)}
                              disabled={savingPayment}
                              className="text-green-600 hover:text-green-800 font-bold"
                              title="שמור"
                            >✓</button>
                            <button
                              onClick={() => setEditingPaymentId(null)}
                              className="text-gray-400 hover:text-gray-600"
                              title="ביטול"
                            >✗</button>
                            {tenant.expected_payment != null && (
                              <button
                                onClick={() => handleResetPayment(tenant)}
                                className="text-xs text-blue-500 hover:text-blue-700"
                                title="חזור לברירת מחדל של הבניין"
                              >🔄</button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPaymentId(tenant.id);
                              setEditingPaymentValue(
                                tenant.expected_payment != null
                                  ? String(tenant.expected_payment)
                                  : ''
                              );
                            }}
                            className="flex items-center gap-1 group"
                            title="לחץ לעריכה"
                          >
                            {tenant.expected_payment != null ? (
                              <span className="text-gray-900">₪{tenant.expected_payment.toLocaleString()}</span>
                            ) : tenant.building_expected_payment != null ? (
                              <span className="text-gray-400">₪{tenant.building_expected_payment.toLocaleString()}*</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                            <span className="text-gray-300 group-hover:text-blue-500 text-xs">✏️</span>
                          </button>
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

      {/* Add/Edit Modal — null buildingId = global mode */}
      {(showAddModal || editTenant) && (
        <TenantModal
          buildingId={null}
          tenant={editTenant}
          onClose={() => { setShowAddModal(false); setEditTenant(null); }}
          onSaved={invalidate}
        />
      )}

      {/* Import Modal — null buildingId = global mode */}
      {showImportModal && (
        <TenantImportModal
          buildingId={null}
          onClose={() => setShowImportModal(false)}
          onImported={invalidate}
        />
      )}

      {deleteError && (
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
