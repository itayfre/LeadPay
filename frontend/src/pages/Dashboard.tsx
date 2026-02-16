import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/layout/Layout';
import { paymentsAPI, buildingsAPI, messagesAPI } from '../services/api';
import type { PaymentStatusResponse, WhatsAppMessage } from '../types';

export default function Dashboard() {
  const { t } = useTranslation();
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>([]);

  // Get current month and year
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Fetch building details
  const { data: building } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => buildingsAPI.get(buildingId!),
    enabled: !!buildingId,
  });

  // Fetch payment status
  const { data: paymentStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['paymentStatus', buildingId, selectedMonth, selectedYear],
    queryFn: () => paymentsAPI.getStatus(buildingId!, selectedMonth, selectedYear),
    enabled: !!buildingId,
  });

  const handleGenerateReminders = async () => {
    if (!buildingId) return;

    try {
      const response = await messagesAPI.generateReminders(buildingId, true);
      setWhatsappMessages(response.messages);
      setShowWhatsAppModal(true);
    } catch (err) {
      console.error('Failed to generate reminders:', err);
    }
  };

  if (!buildingId) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-red-600">{t('common.error')}: Missing building ID</p>
        </div>
      </Layout>
    );
  }

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

  const stats = paymentStatus?.summary_statistics || {
    total_tenants: 0,
    paid_count: 0,
    unpaid_count: 0,
    total_expected: 0,
    total_collected: 0,
    collection_rate: 0,
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <button
              onClick={() => navigate('/buildings')}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
            >
              ← {t('nav.buildings')}
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{building?.name}</h2>
            <p className="text-sm text-gray-500">
              📍 {building?.address}, {building?.city}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/building/${buildingId}/upload`)}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              📄 {t('dashboard.uploadStatement')}
            </button>
            <button
              onClick={handleGenerateReminders}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              💬 {t('dashboard.sendReminders')}
            </button>
          </div>
        </div>

        {/* Period Selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <label className="font-medium text-gray-700">{t('dashboard.period')}:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <option key={month} value={month}>
                {new Date(2024, month - 1).toLocaleString('he-IL', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {[2024, 2025, 2026].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t('dashboard.paid')}
            value={stats.paid_count}
            total={stats.total_tenants}
            color="green"
            icon="✅"
          />
          <StatCard
            title={t('dashboard.unpaid')}
            value={stats.unpaid_count}
            total={stats.total_tenants}
            color="red"
            icon="❌"
          />
          <StatCard
            title={t('dashboard.totalExpected')}
            value={`₪${stats.total_expected.toLocaleString()}`}
            color="blue"
            icon="💰"
          />
          <StatCard
            title={t('dashboard.collectionRate')}
            value={`${Math.round(stats.collection_rate * 100)}%`}
            color="purple"
            icon="📊"
          />
        </div>

        {/* Payment Status Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.apartment')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.tenant')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.expected')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.paid')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('payment.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentStatus?.tenant_payments && paymentStatus.tenant_payments.length > 0 ? (
                  paymentStatus.tenant_payments.map((payment) => (
                    <tr key={payment.tenant_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {payment.apartment_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.tenant_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₪{payment.expected_amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₪{payment.paid_amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            payment.is_paid
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {payment.is_paid ? '✅ ' + t('dashboard.paid') : '❌ ' + t('dashboard.unpaid')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {!payment.is_paid && payment.phone_number && (
                          <button
                            onClick={async () => {
                              const response = await messagesAPI.generateReminders(buildingId, true);
                              const tenantMessage = response.messages.find(
                                (m) => m.tenant_id === payment.tenant_id
                              );
                              if (tenantMessage) {
                                window.open(tenantMessage.whatsapp_link, '_blank');
                              }
                            }}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            📱 {t('payment.sendWhatsApp')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      אין נתוני תשלומים לתקופה זו
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <WhatsAppModal
          messages={whatsappMessages}
          onClose={() => setShowWhatsAppModal(false)}
        />
      )}
    </Layout>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  total?: number;
  color: 'green' | 'red' | 'blue' | 'purple';
  icon: string;
}

function StatCard({ title, value, total, color, icon }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
  };

  return (
    <div className={`rounded-lg border-2 p-6 ${colorClasses[color]}`}>
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

interface WhatsAppModalProps {
  messages: WhatsAppMessage[];
  onClose: () => void;
}

function WhatsAppModal({ messages, onClose }: WhatsAppModalProps) {
  const { t } = useTranslation();
  const [sentMessages, setSentMessages] = useState<Set<string>>(new Set());

  const handleSendMessage = async (message: WhatsAppMessage) => {
    window.open(message.whatsapp_link, '_blank');
    setSentMessages((prev) => new Set(prev).add(message.id));

    try {
      await messagesAPI.markSent(message.id);
    } catch (err) {
      console.error('Failed to mark message as sent:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900">{t('whatsapp.title')}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {t('whatsapp.ready')}: {messages.length} הודעות
          </p>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-gray-900">{message.tenant_name}</p>
                  <p className="text-sm text-gray-500">{message.phone_number}</p>
                </div>
                <button
                  onClick={() => handleSendMessage(message)}
                  disabled={sentMessages.has(message.id)}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    sentMessages.has(message.id)
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {sentMessages.has(message.id) ? `✓ ${t('whatsapp.sent')}` : `📱 ${t('whatsapp.click')}`}
                </button>
              </div>
              <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap" dir="auto">
                {message.message_text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
