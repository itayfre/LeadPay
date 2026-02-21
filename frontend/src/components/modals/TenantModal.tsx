import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantsAPI, buildingsAPI } from '../../services/api';
import type { Tenant } from '../../types';

interface TenantModalProps {
  buildingId: string | null;  // null = global mode, must pick building
  tenant?: Tenant | null;
  onClose: () => void;
  onSaved: () => void;
}

const OWNERSHIP_TYPES = ['בעלים', 'משכיר', 'שוכר'] as const;

export default function TenantModal({ buildingId, tenant, onClose, onSaved }: TenantModalProps) {
  const isEdit = !!tenant;
  const isGlobalMode = !buildingId;

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: () => buildingsAPI.list(),
    enabled: isGlobalMode && !isEdit,
  });

  const [form, setForm] = useState({
    selected_building_id: buildingId || '',
    apartment_number: '',
    name: '',
    full_name: '',
    ownership_type: 'שוכר',
    phone: '',
    email: '',
    bank_name: '',
    bank_account: '',
    language: 'he',
    has_standing_order: false,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setForm({
        selected_building_id: tenant.building_id || buildingId || '',
        apartment_number: String(tenant.apartment_number || ''),
        name: tenant.name || '',
        full_name: tenant.full_name || '',
        ownership_type: tenant.ownership_type || 'שוכר',
        phone: tenant.phone || '',
        email: tenant.email || '',
        bank_name: tenant.bank_name || '',
        bank_account: tenant.bank_account || '',
        language: tenant.language || 'he',
        has_standing_order: tenant.has_standing_order || false,
        is_active: tenant.is_active !== false,
      });
    }
  }, [tenant, buildingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveBuildingId = buildingId || form.selected_building_id;

    if (!form.apartment_number || !form.name || !form.ownership_type) {
      setError('נא למלא את כל השדות הנדרשים');
      return;
    }
    if (!effectiveBuildingId) {
      setError('נא לבחור בניין');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && tenant) {
        await tenantsAPI.update(tenant.id, {
          name: form.name,
          full_name: form.full_name || undefined,
          ownership_type: form.ownership_type as Tenant['ownership_type'],
          phone: form.phone || undefined,
          email: form.email || undefined,
          bank_name: form.bank_name || undefined,
          bank_account: form.bank_account || undefined,
          language: form.language as 'he' | 'en',
          has_standing_order: form.has_standing_order,
          is_active: form.is_active,
        });
      } else {
        const { apartment_id } = await tenantsAPI.resolveApartment(
          effectiveBuildingId,
          parseInt(form.apartment_number)
        );
        await tenantsAPI.create({
          apartment_id,
          building_id: effectiveBuildingId,
          name: form.name,
          full_name: form.full_name || undefined,
          ownership_type: form.ownership_type,
          phone: form.phone || undefined,
          email: form.email || undefined,
          bank_name: form.bank_name || undefined,
          bank_account: form.bank_account || undefined,
          language: form.language,
          has_standing_order: form.has_standing_order,
          is_active: form.is_active,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-l from-blue-600 to-blue-800 p-6 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold">{isEdit ? 'עריכת דייר' : 'הוספת דייר'}</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6" dir="rtl">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Building picker — only in global mode when adding */}
            {isGlobalMode && !isEdit && (
              <div className="col-span-2">
                <label className={labelClass}>בניין *</label>
                <select
                  value={form.selected_building_id}
                  onChange={e => setForm(f => ({ ...f, selected_building_id: e.target.value }))}
                  required
                  className={inputClass}
                >
                  <option value="">— בחר בניין —</option>
                  {buildings?.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelClass}>מספר דירה *</label>
              <input
                type="number" min="1"
                value={form.apartment_number}
                onChange={e => setForm(f => ({ ...f, apartment_number: e.target.value }))}
                disabled={isEdit} required
                className={inputClass + (isEdit ? ' bg-gray-100 cursor-not-allowed' : '')}
                placeholder="5"
              />
            </div>

            <div>
              <label className={labelClass}>סוג בעלות *</label>
              <select
                value={form.ownership_type}
                onChange={e => setForm(f => ({ ...f, ownership_type: e.target.value }))}
                required className={inputClass}
              >
                {OWNERSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>שם תצוגה *</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required className={inputClass} placeholder="גיא מ" />
            </div>

            <div>
              <label className={labelClass}>שם מלא <span className="text-gray-400 font-normal">(לשיוך תשלומים)</span></label>
              <input type="text" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className={inputClass} placeholder="גיא מן" />
            </div>

            <div>
              <label className={labelClass}>טלפון</label>
              <input type="tel" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inputClass} placeholder="0501234567" dir="ltr" />
            </div>

            <div>
              <label className={labelClass}>אימייל</label>
              <input type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputClass} placeholder="email@example.com" dir="ltr" />
            </div>

            <div>
              <label className={labelClass}>שם בנק <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
              <input type="text" value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                className={inputClass} placeholder="הפועלים" />
            </div>

            <div>
              <label className={labelClass}>מספר חשבון בנק <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
              <input type="text" value={form.bank_account}
                onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))}
                className={inputClass} placeholder="12-345678" dir="ltr" />
            </div>

            <div>
              <label className={labelClass}>שפה</label>
              <div className="flex gap-2">
                {(['he', 'en'] as const).map(lang => (
                  <button key={lang} type="button"
                    onClick={() => setForm(f => ({ ...f, language: lang }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.language === lang
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {lang === 'he' ? 'עברית' : 'English'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.has_standing_order}
                  onChange={e => setForm(f => ({ ...f, has_standing_order: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded" />
                הוראת קבע
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded" />
                דייר פעיל
              </label>
            </div>
          </div>
        </form>

        <div className="border-t border-gray-200 p-4 flex justify-end gap-3 bg-gray-50">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">
            ביטול
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 transition-colors">
            {saving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'הוסף דייר'}
          </button>
        </div>
      </div>
    </div>
  );
}
