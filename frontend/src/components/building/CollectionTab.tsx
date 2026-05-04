import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { paymentsAPI, tenantsAPI, messagesAPI, apartmentsAPI } from '../../services/api';
import type { PaymentStatus, WhatsAppMessage, TenantPaymentHistory } from '../../types';
import type { DateRange, MonthYear } from '../../hooks/useBuildingPeriodRange';
import { expandRange } from '../../hooks/useBuildingPeriodRange';

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface AggregatedTenant {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  phone?: string;
  language: 'he' | 'en';
  apartment_id: string;
  total_expected: number;
  total_paid: number;
  total_debt: number;
  status: 'paid' | 'partial' | 'unpaid';
  months: Array<PaymentStatus & { period_label: string }>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildingId: string;
  range: DateRange;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function periodLabel({ month, year }: MonthYear): string {
  return HE_MONTHS[month - 1] + ' ' + year;
}

type SortCol =
  | 'apartment_number' | 'tenant_name' | 'total_expected'
  | 'total_paid' | 'total_debt' | 'status';

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  total?: number;
  color: 'green' | 'red' | 'blue' | 'purple' | 'orange';
  icon: string;
}

function StatCard({ title, value, total, color, icon }: StatCardProps) {
  const cls: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  };
  return (
    <div className={`rounded-lg border-2 p-6 ${cls[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-1">
            {value}
            {total !== undefined && <span className="text-lg opacity-70">/{total}</span>}
          </p>
        </div>
        <div className="text-4xl opacity-50">{icon}</div>
      </div>
    </div>
  );
}

// ─── WhatsAppModal ────────────────────────────────────────────────────────────

function WhatsAppModal({
  messages,
  onClose,
}: {
  messages: WhatsAppMessage[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sent, setSent] = useState<Set<string>>(new Set());

  const handleSend = async (msg: WhatsAppMessage) => {
    window.open(msg.whatsapp_link, '_blank');
    const id = msg.message_id || msg.tenant_id;
    setSent((prev) => new Set(prev).add(id));
    if (msg.message_id) {
      try { await messagesAPI.markSent(msg.message_id); } catch { /* ignore */ }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('whatsapp.title')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('whatsapp.ready')}: {messages.length}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-6 space-y-4">
          {messages.map((msg) => {
            const id = msg.message_id || msg.tenant_id;
            return (
              <div key={id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{msg.tenant_name}</p>
                    <p className="text-sm text-gray-500">{msg.phone}</p>
                  </div>
                  <button
                    onClick={() => handleSend(msg)}
                    disabled={sent.has(id)}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      sent.has(id)
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {sent.has(id) ? `✓ ${t('whatsapp.sent')}` : `📱 ${t('whatsapp.click')}`}
                  </button>
                </div>
                <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap" dir="auto">
                  {msg.message_preview}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── PaymentHistoryModal ──────────────────────────────────────────────────────

function PaymentHistoryModal({
  tenantHistory,
  isLoading,
  selectedMonthData,
  onSelectMonth,
  onClose,
}: {
  tenantHistory: TenantPaymentHistory | undefined;
  isLoading: boolean;
  selectedMonthData: { month: number; year: number } | null;
  onSelectMonth: (m: { month: number; year: number }) => void;
  onClose: () => void;
}) {
  const activeMonth = selectedMonthData
    ? tenantHistory?.months.find(
        (m) => m.month === selectedMonthData.month && m.year === selectedMonthData.year
      )
    : tenantHistory?.months[tenantHistory.months.length - 1];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              היסטוריית תשלומים — {tenantHistory?.tenant_name}
            </h3>
            <p className="text-sm text-gray-500">
              דירה {tenantHistory?.apartment_number} • מאז {tenantHistory?.move_in_date ?? '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : !tenantHistory ? (
          <div className="flex-1 flex items-center justify-center p-12 text-gray-400">אין נתונים</div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Month list */}
            <div className="w-1/2 overflow-y-auto border-l border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['תקופה', 'צפוי', 'שולם', 'הפרש', 'סטטוס'].map((h) => (
                      <th key={h} className="px-4 py-2 text-right text-xs text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...tenantHistory.months].reverse().map((m) => {
                    const isActive =
                      activeMonth?.month === m.month && activeMonth?.year === m.year;
                    return (
                      <tr
                        key={`${m.year}-${m.month}`}
                        onClick={() => onSelectMonth({ month: m.month, year: m.year })}
                        className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                          isActive ? 'bg-blue-50 font-medium' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-gray-700">{m.period}</td>
                        <td className="px-4 py-2 text-gray-600">₪{m.expected.toLocaleString()}</td>
                        <td className="px-4 py-2 text-gray-900">₪{m.paid.toLocaleString()}</td>
                        <td className={`px-4 py-2 ${m.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {m.difference >= 0 ? '+' : ''}₪{m.difference.toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full ${
                              m.status === 'paid'
                                ? 'bg-green-100 text-green-700'
                                : m.status === 'partial'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {m.status === 'paid' ? '✓ שולם' : m.status === 'partial' ? '⚠ חלקי' : '✗ לא שולם'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Transaction detail */}
            <div className="w-1/2 overflow-y-auto p-6">
              {activeMonth ? (
                <>
                  <h4 className="font-semibold text-gray-900 mb-4">
                    {activeMonth.period} — ₪{activeMonth.paid.toLocaleString()} / ₪{activeMonth.expected.toLocaleString()}
                  </h4>
                  {activeMonth.transactions.length === 0 ? (
                    <p className="text-sm text-gray-400">אין עסקאות לחודש זה</p>
                  ) : (
                    <div className="space-y-2">
                      {activeMonth.transactions.map((tx) => (
                        <div key={tx.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                          <div>
                            <p className="text-gray-700">{tx.description}</p>
                            <p className="text-xs text-gray-400">{tx.date}</p>
                          </div>
                          <span className={`font-medium ${tx.is_manual ? 'text-blue-600' : 'text-green-600'}`}>
                            ₪{tx.amount.toLocaleString()}
                            {tx.is_manual && <span className="text-xs text-gray-400 mr-1"> (ידני)</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">בחר חודש לצפייה בפרטים</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CollectionTab({ buildingId, range }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [togglingLanguage, setTogglingLanguage] = useState<string | null>(null);
  const [editingExpectedId, setEditingExpectedId] = useState<string | null>(null);
  const [editingExpectedValue, setEditingExpectedValue] = useState<string>('');
  const [savingExpected, setSavingExpected] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>([]);
  const [manualPaymentFor, setManualPaymentFor] = useState<AggregatedTenant | null>(null);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualNote, setManualNote] = useState<string>('');
  const [savingManual, setSavingManual] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState<AggregatedTenant | null>(null);
  const [historyTenantId, setHistoryTenantId] = useState<string | null>(null);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<{ month: number; year: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortCol>('apartment_number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // ── Derived range info ─────────────────────────────────────────────────────
  const monthList = useMemo(() => expandRange(range.from, range.to), [range]);
  const isSingle = monthList.length === 1;

  // For manual payment modal, use the last month in the range
  const paymentMonth = range.to;

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: allMonthsData, isLoading } = useQuery({
    queryKey: ['paymentStatus', buildingId, range.from, range.to],
    queryFn: () =>
      Promise.all(monthList.map((m) => paymentsAPI.getStatus(buildingId, m.month, m.year))),
    enabled: !!buildingId,
  });

  const { data: tenantHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['tenantHistory', historyTenantId],
    queryFn: () => paymentsAPI.getTenantHistory(historyTenantId!),
    enabled: !!historyTenantId,
  });

  // ── Aggregate across months ────────────────────────────────────────────────
  const aggregated = useMemo((): AggregatedTenant[] => {
    if (!allMonthsData || allMonthsData.length === 0) return [];

    const byId = new Map<string, AggregatedTenant>();

    allMonthsData.forEach((monthData, idx) => {
      const m = monthList[idx];
      const label = periodLabel(m);
      (monthData.tenants || []).forEach((p) => {
        if (!byId.has(p.tenant_id)) {
          byId.set(p.tenant_id, {
            tenant_id: p.tenant_id,
            tenant_name: p.tenant_name,
            apartment_number: p.apartment_number,
            phone: p.phone,
            language: p.language,
            apartment_id: p.apartment_id,
            total_expected: 0,
            total_paid: 0,
            total_debt: 0,
            status: 'unpaid',
            months: [],
          });
        }
        const agg = byId.get(p.tenant_id)!;
        agg.total_expected += p.expected_amount;
        agg.total_paid += p.paid_amount;
        agg.total_debt = p.total_debt; // always overwrite with latest
        agg.months.push({ ...p, period_label: label });
      });
    });

    return Array.from(byId.values()).map((agg) => ({
      ...agg,
      status:
        agg.total_paid >= agg.total_expected && agg.total_expected > 0
          ? 'paid'
          : agg.total_paid > 0
          ? 'partial'
          : 'unpaid',
    }));
  }, [allMonthsData, monthList]);

  // Summary totals
  const summary = useMemo(() => {
    const firstMonthSummary = allMonthsData?.[0]?.summary;
    if (isSingle && firstMonthSummary) return firstMonthSummary;
    const total_tenants = aggregated.length;
    const paid = aggregated.filter((a) => a.status === 'paid').length;
    const partial = aggregated.filter((a) => a.status === 'partial').length;
    const unpaid = aggregated.filter((a) => a.status === 'unpaid').length;
    const total_expected = aggregated.reduce((s, a) => s + a.total_expected, 0);
    const total_collected = aggregated.reduce((s, a) => s + a.total_paid, 0);
    const rate = total_expected > 0 ? (total_collected / total_expected) * 100 : 0;
    return {
      total_tenants,
      paid,
      partial,
      unpaid,
      total_expected,
      total_collected,
      collection_rate: rate.toFixed(1) + '%',
      amount_rate: rate.toFixed(1) + '%',
    };
  }, [allMonthsData, aggregated, isSingle]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...aggregated].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortColumn) {
        case 'apartment_number': return (a.apartment_number - b.apartment_number) * dir;
        case 'tenant_name': return a.tenant_name.localeCompare(b.tenant_name, 'he') * dir;
        case 'total_expected': return (a.total_expected - b.total_expected) * dir;
        case 'total_paid': return (a.total_paid - b.total_paid) * dir;
        case 'total_debt': return (a.total_debt - b.total_debt) * dir;
        case 'status': {
          const order = { paid: 0, partial: 1, unpaid: 2 };
          return (order[a.status] - order[b.status]) * dir;
        }
        default: return 0;
      }
    });
  }, [aggregated, sortColumn, sortDirection]);

  const handleSort = (col: SortCol) => {
    if (sortColumn === col) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortColumn(col); setSortDirection('asc'); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => (
    <span className={`ml-1 text-xs ${sortColumn === col ? 'text-blue-600' : 'text-gray-300'}`}>
      {sortColumn === col ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId, range.from, range.to] });
  };

  const handleToggleLanguage = async (tenant: AggregatedTenant) => {
    if (togglingLanguage === tenant.tenant_id) return;
    setTogglingLanguage(tenant.tenant_id);
    const newLang: 'he' | 'en' = tenant.language === 'he' ? 'en' : 'he';
    try {
      await tenantsAPI.update(tenant.tenant_id, { language: newLang });
      invalidate();
    } catch { /* ignore */ }
    finally { setTogglingLanguage(null); }
  };

  const handleSaveExpected = async (tenant: AggregatedTenant) => {
    setSavingExpected(true);
    try {
      const val = editingExpectedValue === '' ? null : parseFloat(editingExpectedValue);
      await apartmentsAPI.patch(tenant.apartment_id, { expected_payment: val });
      invalidate();
      setEditingExpectedId(null);
    } catch { /* ignore */ }
    finally { setSavingExpected(false); }
  };

  const handleGenerateReminders = async () => {
    try {
      const res = await messagesAPI.generateReminders(buildingId, true);
      setWhatsappMessages(res.messages);
      setShowWhatsAppModal(true);
    } catch { /* ignore */ }
  };

  const handleStatusPillClick = (tenant: AggregatedTenant) => {
    if (tenant.status === 'paid') {
      setRevertConfirm(tenant);
    } else {
      // unpaid → pre-fill with expected; partial → pre-fill with remaining balance
      const remaining = tenant.total_expected - tenant.total_paid;
      const prefill = remaining > 0 ? remaining : (isSingle ? (tenant.months[0]?.expected_amount ?? 0) : 0);
      setManualPaymentFor(tenant);
      setManualAmount(String(prefill));
      setManualNote('');
    }
  };

  const handleRevert = async () => {
    if (!revertConfirm) return;
    setSavingManual(true);
    try {
      await paymentsAPI.postManualPayment({
        building_id: buildingId,
        tenant_id: revertConfirm.tenant_id,
        amount: -revertConfirm.total_paid,
        month: paymentMonth.month,
        year: paymentMonth.year,
        note: 'ביטול תשלום',
      });
      invalidate();
      setRevertConfirm(null);
    } catch { /* ignore */ }
    finally { setSavingManual(false); }
  };

  const handleManualPayment = async () => {
    if (!manualPaymentFor) return;
    setSavingManual(true);
    try {
      await paymentsAPI.postManualPayment({
        building_id: buildingId,
        tenant_id: manualPaymentFor.tenant_id,
        amount: parseFloat(manualAmount),
        month: paymentMonth.month,
        year: paymentMonth.year,
        note: manualNote || undefined,
      });
      invalidate();
      setManualPaymentFor(null);
      setManualAmount('');
      setManualNote('');
    } catch { /* ignore */ }
    finally { setSavingManual(false); }
  };

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const collectionRateNum = parseFloat(summary.collection_rate) || 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if ((summary.total_tenants || 0) === 0) {
    return (
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-8 text-center" dir="rtl">
        <div className="text-5xl mb-3">👥</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('dashboard.noTenants')}</h3>
        <p className="text-gray-600 mb-5">{t('dashboard.noTenantsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Send reminders button */}
      <div className="flex justify-end">
        <button
          onClick={handleGenerateReminders}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
        >
          💬 {t('dashboard.sendReminders')}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title={t('dashboard.paid')} value={summary.paid} total={summary.total_tenants} color="green" icon="✅" />
        {(summary.partial ?? 0) > 0 && (
          <StatCard title={t('dashboard.partial')} value={summary.partial ?? 0} total={summary.total_tenants} color="orange" icon="⚠️" />
        )}
        <StatCard title={t('dashboard.unpaid')} value={summary.unpaid} total={summary.total_tenants} color="red" icon="❌" />
        <StatCard title={t('dashboard.totalExpected')} value={'₪' + summary.total_expected.toLocaleString()} color="blue" icon="💰" />
        <StatCard title={t('dashboard.collectionRate')} value={Math.round(collectionRateNum) + '%'} color="purple" icon="📊" />
      </div>

      {/* Payment table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {!isSingle && <th className="w-8 px-2 py-3" />}
                <th onClick={() => handleSort('apartment_number')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  {t('payment.apartment')}<SortIcon col="apartment_number" />
                </th>
                <th onClick={() => handleSort('tenant_name')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  {t('payment.tenant')}<SortIcon col="tenant_name" />
                </th>
                <th onClick={() => handleSort('total_expected')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  {t('payment.expected')}<SortIcon col="total_expected" />
                </th>
                <th onClick={() => handleSort('total_paid')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  {t('payment.paid')}<SortIcon col="total_paid" />
                </th>
                <th onClick={() => handleSort('total_debt')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  חוב כולל<SortIcon col="total_debt" />
                </th>
                <th onClick={() => handleSort('status')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                  {t('payment.status')}<SortIcon col="status" />
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">שפה</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payment.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">אין נתוני תשלומים לתקופה זו</td>
                </tr>
              ) : (
                sorted.map((tenant) => {
                  const isExpanded = expandedRows.has(tenant.tenant_id);
                  return (
                    <>
                      <tr key={tenant.tenant_id} className="hover:bg-gray-50">
                        {/* Expand chevron (multi-month only) */}
                        {!isSingle && (
                          <td className="px-2 py-4 text-center">
                            <button
                              onClick={() => toggleRow(tenant.tenant_id)}
                              className="text-gray-400 hover:text-gray-600 text-xs transition-transform duration-150"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                            >
                              ▶
                            </button>
                          </td>
                        )}
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                          onClick={() => { setHistoryTenantId(tenant.tenant_id); setSelectedHistoryMonth(null); }}
                        >
                          {tenant.apartment_number}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:text-blue-600"
                          onClick={() => { setHistoryTenantId(tenant.tenant_id); setSelectedHistoryMonth(null); }}
                        >
                          {tenant.tenant_name}
                        </td>
                        {/* Expected – editable only for single month */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {isSingle && editingExpectedId === tenant.tenant_id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editingExpectedValue}
                                onChange={(e) => setEditingExpectedValue(e.target.value)}
                                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveExpected(tenant);
                                  if (e.key === 'Escape') setEditingExpectedId(null);
                                }}
                              />
                              <button onClick={() => handleSaveExpected(tenant)} disabled={savingExpected} className="text-green-600 text-xs font-bold px-1">✓</button>
                              <button onClick={() => setEditingExpectedId(null)} className="text-gray-400 text-xs px-1">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={isSingle ? () => { setEditingExpectedId(tenant.tenant_id); const first = tenant.months[0]; setEditingExpectedValue(String(first?.expected_amount ?? '')); } : undefined}
                              className={isSingle ? 'hover:text-blue-600 hover:underline cursor-pointer font-medium' : 'cursor-default font-medium'}
                            >
                              ₪{tenant.total_expected.toLocaleString()}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => {
                              setManualPaymentFor(tenant);
                              setManualAmount(String(isSingle ? (tenant.months[0]?.expected_amount ?? 0) : 0));
                              setManualNote('');
                            }}
                            className="text-gray-900 hover:text-green-600 hover:underline cursor-pointer"
                          >
                            ₪{tenant.total_paid.toLocaleString()}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <span className={tenant.total_debt > 0 ? 'text-red-600' : 'text-gray-400'}>
                            {tenant.total_debt > 0 ? '₪' + Math.round(tenant.total_debt).toLocaleString() : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleStatusPillClick(tenant)}
                            title={tenant.status === 'paid' ? 'לחץ לביטול תשלום' : 'לחץ לרישום תשלום'}
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer transition-opacity hover:opacity-75 ${
                              tenant.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : tenant.status === 'partial'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {tenant.status === 'paid' ? '✅ ' + t('dashboard.paid') : tenant.status === 'partial' ? '⚠️ ' + t('dashboard.partial') : '❌ ' + t('dashboard.unpaid')}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleLanguage(tenant)}
                            disabled={togglingLanguage === tenant.tenant_id}
                            className={`inline-flex px-2 py-0.5 text-xs rounded font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                              tenant.language === 'he' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {togglingLanguage === tenant.tenant_id ? '...' : tenant.language === 'he' ? 'עב' : 'EN'}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {tenant.status !== 'paid' && tenant.phone && (
                            <button
                              onClick={async () => {
                                let msgs = whatsappMessages;
                                if (msgs.length === 0) {
                                  const res = await messagesAPI.generateReminders(buildingId, true);
                                  msgs = res.messages;
                                  setWhatsappMessages(msgs);
                                }
                                const found = msgs.find((m) => m.tenant_id === tenant.tenant_id);
                                if (found) window.open(found.whatsapp_link, '_blank');
                              }}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              📱 {t('payment.sendWhatsApp')}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Per-month expansion rows */}
                      {!isSingle && isExpanded && tenant.months.map((m) => (
                        <tr key={tenant.tenant_id + '-' + m.period_label} className="bg-gray-50/70 text-xs">
                          <td />
                          <td className="px-6 py-2 text-gray-400">{m.period_label}</td>
                          <td className="px-6 py-2 text-gray-500">{m.tenant_name}</td>
                          <td className="px-6 py-2 text-gray-600">₪{m.expected_amount.toLocaleString()}</td>
                          <td className="px-6 py-2 text-gray-600">₪{m.paid_amount.toLocaleString()}</td>
                          <td className="px-6 py-2 text-gray-500">{m.total_debt > 0 ? '₪' + Math.round(m.total_debt).toLocaleString() : '—'}</td>
                          <td className="px-6 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded-full ${
                              m.status === 'paid' ? 'bg-green-50 text-green-700' : m.status === 'partial' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {m.status === 'paid' ? 'שולם' : m.status === 'partial' ? 'חלקי' : 'לא שולם'}
                            </span>
                          </td>
                          <td /><td />
                        </tr>
                      ))}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Payment Modal */}
      {manualPaymentFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              {manualPaymentFor.status === 'partial' ? 'ערוך תשלום' : 'סמן כשולם'} — {manualPaymentFor.tenant_name}
            </h3>
            <p className="text-sm text-gray-500">
              דירה {manualPaymentFor.apartment_number} • {String(paymentMonth.month).padStart(2, '0')}/{paymentMonth.year}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
              <input
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערה (אופציונלי)</label>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="תשלום במזומן"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setManualPaymentFor(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">ביטול</button>
              <button
                onClick={handleManualPayment}
                disabled={!manualAmount || isNaN(parseFloat(manualAmount)) || parseFloat(manualAmount) <= 0 || savingManual}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
              >
                {savingManual ? 'שומר...' : '✓ אשר תשלום'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Payment Confirm Modal */}
      {revertConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">ביטול תשלום</h3>
            <p className="text-sm text-gray-600">
              האם לבטל את התשלום של <strong>{revertConfirm.tenant_name}</strong>?
              <br />
              סכום לביטול: ₪{revertConfirm.total_paid.toLocaleString()}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRevertConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleRevert}
                disabled={savingManual}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
              >
                {savingManual ? 'מבטל...' : '✕ בטל תשלום'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhatsAppModal && (
        <WhatsAppModal messages={whatsappMessages} onClose={() => setShowWhatsAppModal(false)} />
      )}

      {historyTenantId && (
        <PaymentHistoryModal
          tenantHistory={tenantHistory}
          isLoading={historyLoading}
          selectedMonthData={selectedHistoryMonth}
          onSelectMonth={setSelectedHistoryMonth}
          onClose={() => { setHistoryTenantId(null); setSelectedHistoryMonth(null); }}
        />
      )}
    </div>
  );
}
