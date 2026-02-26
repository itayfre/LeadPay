import { useState, useEffect } from 'react';
import type { Building } from '../../types';

interface BuildingEditModalProps {
  isOpen: boolean;
  building: Building | null;  // null = create mode
  onSave: (data: Partial<Building>) => Promise<void>;
  onCancel: () => void;
}

export default function BuildingEditModal({
  isOpen,
  building,
  onSave,
  onCancel,
}: BuildingEditModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    bank_account_number: '',
    expected_monthly_payment: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (building) {
      setFormData({
        name: building.name || '',
        address: building.address || '',
        city: building.city || '',
        bank_account_number: building.bank_account_number || '',
        expected_monthly_payment: building.expected_monthly_payment?.toString() || '',
      });
    } else {
      setFormData({ name: '', address: '', city: '', bank_account_number: '', expected_monthly_payment: '' });
    }
    setError(null);
  }, [building, isOpen]);

  if (!isOpen) return null;

  const isCreate = !building;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data: Partial<Building> = {
        name: formData.name,
        address: formData.address,
        city: formData.city,
        bank_account_number: formData.bank_account_number || undefined,
      };
      if (formData.expected_monthly_payment) {
        data.expected_monthly_payment = parseFloat(formData.expected_monthly_payment);
      }
      await onSave(data);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🏢</div>
              <h3 className="text-2xl font-bold">{isCreate ? 'הוסף בניין חדש' : 'ערוך בניין'}</h3>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="building-name" className="block text-sm font-semibold text-gray-700 mb-2">שם הבניין *</label>
              <input id="building-name" type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder="למשל: בניין משעול תפן 12" />
            </div>
            <div>
              <label htmlFor="building-address" className="block text-sm font-semibold text-gray-700 mb-2">כתובת *</label>
              <input id="building-address" type="text" required value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder="משעול תפן 12" />
            </div>
            <div>
              <label htmlFor="building-city" className="block text-sm font-semibold text-gray-700 mb-2">עיר *</label>
              <input id="building-city" type="text" required value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder="תל אביב" />
            </div>
            <div>
              <label htmlFor="building-bank" className="block text-sm font-semibold text-gray-700 mb-2">מספר חשבון בנק</label>
              <input id="building-bank" type="text" value={formData.bank_account_number}
                onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder="123456789" />
            </div>
            <div>
              <label htmlFor="building-payment" className="block text-sm font-semibold text-gray-700 mb-2">תשלום חודשי ברירת מחדל (₪)</label>
              <input id="building-payment" type="number" step="0.01" value={formData.expected_monthly_payment}
                onChange={(e) => setFormData({ ...formData, expected_monthly_payment: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                placeholder="500.00" />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onCancel} disabled={saving}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
              ביטול
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50">
              {saving ? 'שומר...' : isCreate ? 'הוסף בניין' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
