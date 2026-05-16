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
    ownership_type: '',
    phone: '',
    email: '',
    language: 'he',
    standing_order_start_date: '',
    standing_order_end_date: '',
    standing_order_amount: '',
    is_active: true,
    move_in_date: '2026-01-01',
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
        ownership_type: tenant.ownership_type || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        language: tenant.language || 'he',
        standing_order_start_date: tenant.standing_order_start_date || '',
        standing_order_end_date: tenant.standing_order_end_date || '',
        standing_order_amount: tenant.standing_order_amount != null ? String(tenant.standing_order_amount) : '',
        is_active: tenant.is_active !== false,
        move_in_date: tenant.move_in_date || '2026-01-01',
      });
    }
  }, [tenant, buildingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveBuildingId = buildingId || form.selected_building_id;

    if (!form.apartment_number || !form.name) {
      setError('נא למלא את כל השדות הנדרשים');
      return;
    }
    if (!effectiveBuildingId) {
      setError('נא לבחור בניין');
      return;
    }

    const soStart = form.standing_order_start_date || null;
    const soEnd = form.standing_order_end_date || null;
    const soAmountNum = form.standing_order_amount.trim() === '' ? null : Number(form.standing_order_amount);
    if (soStart) {
      if (soAmountNum === null || Number.isNaN(soAmountNum) || soAmountNum <= 0) {
        setError('נא להזין סכום הוראת קבע גדול מאפס');
        return;
      }
      if (soEnd && soEnd < soStart) {
        setError('תאריך סיום הוראת הקבע חייב להיות אחרי תאריך ההתחלה');
        return;
      }
    }

    setSaving(true);
    try {
      if (isEdit && tenant) {
        await tenantsAPI.update(tenant.id, {
          name: form.name,
          full_name: form.full_name || undefined,
          ownership_type: form.ownership_type ? form.ownership_type as Tenant['ownership_type'] : undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          language: form.language as 'he' | 'en',
          standing_order_start_date: soStart,
          standing_order_end_date: soEnd,
          standing_order_amount: soStart ? soAmountNum : null,
          is_active: form.is_active,
          move_in_date: form.move_in_date || undefined,
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
          ownership_type: form.ownership_type || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          language: form.language,
          standing_order_start_date: soStart,
          standing_order_end_date: soEnd,
          standing_order_amount: soStart ? soAmountNum : null,
          is_active: form.is_active,
          move_in_date: form.move_in_date || undefined,
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
              <label className={labelClass}>סוג בעלות</label>
              <select
                value={form.ownership_type}
                onChange={e => setForm(f => ({ ...f, ownership_type: e.target.value }))}
                className={inputClass}
              >
                <option value="">— לא מוגדר —</option>
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
              <label className={labelClass}>תאריך כניסה</label>
              <input type="date" value={form.move_in_date}
                onChange={e => setForm(f => ({ ...f, move_in_date: e.target.value }))}
                className={inputClass} dir="ltr" />
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
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded" />
                דייר פעיל
              </label>
            </div>

            {/* Standing order — sky-tinted block to match the rest of the standing-order UI */}
            <div className="col-span-2 rounded-lg border border-sky-100 bg-sky-50/60 p-4">
              <div className="text-sm font-semibold text-sky-800 mb-3">הוראת קבע</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>תאריך התחלה</label>
                  <input type="date" value={form.standing_order_start_date}
                    onChange={e => setForm(f => ({ ...f, standing_order_start_date: e.target.value }))}
                    className={inputClass} dir="ltr" />
                </div>
                <div>
                  <label className={labelClass}>תאריך סיום <span className="text-gray-400 font-normal">(ללא = רציף)</span></label>
                  <input type="date" value={form.standing_order_end_date}
                    onChange={e => setForm(f => ({ ...f, standing_order_end_date: e.target.value }))}
                    className={inputClass} dir="ltr" disabled={!form.standing_order_start_date} />
                </div>
                <div>
                  <label className={labelClass}>סכום חודשי <span className="text-gray-400 font-normal">(₪)</span></label>
                  <input type="number" min="0" step="1" value={form.standing_order_amount}
                    onChange={e => setForm(f => ({ ...f, standing_order_amount: e.target.value }))}
                    className={inputClass} dir="ltr"
                    placeholder="0"
                    required={!!form.standing_order_start_date} />
                </div>
              </div>
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
