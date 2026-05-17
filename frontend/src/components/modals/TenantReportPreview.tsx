import type { TenantReportPayload } from '../../types';

const shekel = (n: number | null | undefined) =>
  n == null ? '—' : `₪${Math.round(n).toLocaleString('he-IL')}`;

const STATUS_HE: Record<'paid' | 'partial' | 'unpaid', { label: string; cls: string }> = {
  paid:    { label: 'שולם',    cls: 'bg-green-50 text-green-700' },
  partial: { label: 'חלקי',    cls: 'bg-yellow-50 text-yellow-800' },
  unpaid:  { label: 'לא שולם', cls: 'bg-red-50 text-red-700' },
};

function formatDate(iso: string): string {
  // Backend returns "2026-02-01T00:00:00" — show just the date.
  if (!iso) return '';
  return iso.includes('T') ? iso.split('T')[0] : iso;
}

export default function TenantReportPreview({ payload }: { payload: TenantReportPayload }) {
  const t = payload.tenant;
  return (
    <div className="space-y-6 text-sm">
      <div className="text-center pb-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
        <p className="text-gray-500 text-xs mt-1">
          דירה {t.apartment_number}{t.floor ? ` · קומה ${t.floor}` : ''} · {t.building.name}, {t.building.address}, {t.building.city}
        </p>
        <p className="text-gray-600 font-medium mt-1">{payload.period.label}</p>
        {t.standing_order && (
          <p className="inline-block mt-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md">
            הוראת קבע פעילה
            {t.standing_order.amount ? ` — ${shekel(t.standing_order.amount)} לחודש` : ''}
            {t.standing_order.end_date ? ` (עד ${formatDate(t.standing_order.end_date)})` : ''}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
          <p className="text-xs text-red-700 font-semibold mb-1">חוב לתקופה</p>
          <p className="text-xl font-bold text-red-900">{shekel(payload.summary.period_debt)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
          <p className="text-xs text-orange-700 font-semibold mb-1">חוב כולל</p>
          <p className="text-xl font-bold text-orange-900">{shekel(payload.summary.lifetime_debt)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
          <p className="text-xs text-green-700 font-semibold mb-1">סה״כ שולם בתקופה</p>
          <p className="text-xl font-bold text-green-900">{shekel(payload.summary.period_paid)}</p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">פירוט חודשי</h4>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 px-3 py-2 text-right">חודש</th>
              <th className="border border-gray-200 px-3 py-2 text-right">צפוי</th>
              <th className="border border-gray-200 px-3 py-2 text-right">שולם</th>
              <th className="border border-gray-200 px-3 py-2 text-right">הפרש</th>
              <th className="border border-gray-200 px-3 py-2 text-right">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {payload.months.map(r => (
              <tr key={`${r.year}-${r.month}`} className={STATUS_HE[r.status].cls}>
                <td className="border border-gray-200 px-3 py-1.5">{r.period_label}</td>
                <td className="border border-gray-200 px-3 py-1.5">{shekel(r.expected)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{shekel(r.paid)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{r.difference < 0 ? `-${shekel(-r.difference)}` : shekel(r.difference)}</td>
                <td className="border border-gray-200 px-3 py-1.5">{STATUS_HE[r.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">תנועות בתקופה</h4>
        {payload.transactions.length === 0 ? (
          <p className="text-xs text-gray-500 italic">אין תנועות בתקופה זו</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-3 py-2 text-right">תאריך</th>
                <th className="border border-gray-200 px-3 py-2 text-right">תיאור</th>
                <th className="border border-gray-200 px-3 py-2 text-right">סכום</th>
                <th className="border border-gray-200 px-3 py-2 text-right">ידני?</th>
              </tr>
            </thead>
            <tbody>
              {payload.transactions.map((tx, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-200 px-3 py-1.5">{formatDate(tx.date)}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{tx.description}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{shekel(tx.amount)}</td>
                  <td className="border border-gray-200 px-3 py-1.5">{tx.is_manual ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
