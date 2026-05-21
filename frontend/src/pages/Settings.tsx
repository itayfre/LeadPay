import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Layout from '../components/layout/Layout';
import { settingsAPI } from '../services/api';
import type { RiskThresholds } from '../types';
import { DEFAULT_RISK_THRESHOLDS } from '../lib/buildingStatus';
import { useRiskThresholds } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const navigate = useNavigate();

  const settingsItems = [
    {
      icon: '💬',
      title: 'תבניות WhatsApp',
      description: 'ערוך את תבניות ההודעות שנשלחות לדיירים',
      color: 'from-purple-500 to-pink-600',
      path: '/whatsapp-templates',
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="bg-gradient-to-r from-gray-700 to-gray-900 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">הגדרות</h1>
              <p className="text-gray-300 text-lg">
                הגדרות מערכת ואישיות
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">⚙️</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsItems.map((item, index) => (
            <div
              key={index}
              onClick={() => item.path && navigate(item.path)}
              className={`bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden hover:shadow-xl transition-all ${
                item.path ? 'cursor-pointer hover:border-primary-300' : 'opacity-60'
              }`}
            >
              <div className={`bg-gradient-to-r ${item.color} p-6 text-white`}>
                <div className="flex items-center gap-4">
                  <div className="text-5xl">{item.icon}</div>
                  <div>
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="text-sm opacity-90">{item.description}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50">
                {item.path ? (
                  <button className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors">
                    פתח →
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full px-4 py-2 bg-gray-300 text-gray-500 font-medium rounded-lg cursor-not-allowed"
                  >
                    בקרוב
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <RiskThresholdsCard />
      </div>
    </Layout>
  );
}

function RiskThresholdsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const liveThresholds = useRiskThresholds();

  const isManager = user?.role === 'manager';

  const [partial, setPartial] = useState<number>(liveThresholds.partial);
  const [onTrack, setOnTrack] = useState<number>(liveThresholds.onTrack);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Keep local form in sync if the live config changes externally (first load,
  // another tab saved, etc.)
  useEffect(() => {
    setPartial(liveThresholds.partial);
    setOnTrack(liveThresholds.onTrack);
  }, [liveThresholds.partial, liveThresholds.onTrack]);

  // Hide the "saved" pill after a few seconds
  useEffect(() => {
    if (savedAt === null) return;
    const id = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  const validationError = (() => {
    if (!Number.isInteger(partial) || !Number.isInteger(onTrack)) return t('settings.thresholds.errors.integer');
    if (partial < 0 || partial > 100 || onTrack < 0 || onTrack > 100) return t('settings.thresholds.errors.range');
    if (partial >= onTrack) return t('settings.thresholds.errors.order');
    return null;
  })();

  const isDirty = partial !== liveThresholds.partial || onTrack !== liveThresholds.onTrack;

  const mutation = useMutation<RiskThresholds, Error, RiskThresholds>({
    mutationFn: (body) => settingsAPI.putRiskThresholds(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      setSavedAt(Date.now());
    },
  });

  const onSave = () => {
    if (validationError) return;
    mutation.mutate({ partial, onTrack });
  };

  const onReset = () => {
    setPartial(DEFAULT_RISK_THRESHOLDS.partial);
    setOnTrack(DEFAULT_RISK_THRESHOLDS.onTrack);
  };

  const saveDisabled = !!validationError || !isDirty || mutation.isPending || !isManager;

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden" dir="rtl">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="text-5xl">📊</div>
          <div>
            <h3 className="text-xl font-bold">{t('settings.thresholds.title')}</h3>
            <p className="text-sm opacity-90">{t('settings.thresholds.description')}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Partial threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.thresholds.partialLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Number.isFinite(partial) ? partial : 0}
              onChange={e => setPartial(parseInt(e.target.value, 10) || 0)}
              disabled={!isManager || mutation.isPending}
              className="w-24 h-10 rounded-md ring-1 ring-ink-200 px-3 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-100"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400 mr-3">{t('settings.thresholds.partialHint')}</span>
          </div>
        </div>

        {/* On-track threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.thresholds.onTrackLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Number.isFinite(onTrack) ? onTrack : 0}
              onChange={e => setOnTrack(parseInt(e.target.value, 10) || 0)}
              disabled={!isManager || mutation.isPending}
              className="w-24 h-10 rounded-md ring-1 ring-ink-200 px-3 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-100"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400 mr-3">{t('settings.thresholds.onTrackHint')}</span>
          </div>
        </div>

        {/* Inline error */}
        {validationError && isDirty && (
          <div className="text-[13px] text-danger-600 font-medium">{validationError}</div>
        )}

        {/* Server error */}
        {mutation.isError && (
          <div className="text-[13px] text-danger-600 font-medium">
            {mutation.error.message}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            onClick={onReset}
            disabled={!isManager || mutation.isPending}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('settings.thresholds.resetDefaults')}
          </button>

          <div className="flex items-center gap-3">
            {savedAt !== null && (
              <span className="text-[13px] font-medium text-accent-700">
                ✓ {t('settings.thresholds.saved')}
              </span>
            )}
            <button
              onClick={onSave}
              disabled={saveDisabled}
              title={!isManager ? t('settings.thresholds.errors.notManager') : undefined}
              className="h-10 px-4 rounded-md bg-primary-600 text-white text-[14px] font-medium hover:bg-primary-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? t('common.saving') : t('settings.thresholds.save')}
            </button>
          </div>
        </div>

        {!isManager && (
          <p className="text-[12px] text-gray-400 text-center pt-1">
            {t('settings.thresholds.errors.notManager')}
          </p>
        )}
      </div>
    </div>
  );
}
