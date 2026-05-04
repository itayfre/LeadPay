import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { BuildingSummaryStats } from '../../../types';

function getRateColor(rate: number): string {
  if (rate >= 95) return '#22C55E';
  if (rate >= 60) return '#F97316';
  return '#EF4444';
}

interface Props {
  worstPayers: BuildingSummaryStats['worst_payers'];
}

export default function WorstPayersList({ worstPayers }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { buildingId } = useParams<{ buildingId: string }>();

  if (!worstPayers || worstPayers.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm" dir="rtl">
        {t('summary.worst_payers.no_data')}
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {worstPayers.map((payer, idx) => {
        const color = getRateColor(payer.rate);
        const barWidth = Math.max(payer.rate, 2); // at least 2% so bar is visible

        return (
          <button
            key={payer.tenant_id}
            onClick={() => navigate(`/building/${buildingId}/tenants`)}
            className="w-full text-right group relative overflow-hidden rounded-lg border border-gray-100 hover:border-gray-300 transition-colors"
          >
            {/* Background fill bar */}
            <div
              className="absolute inset-y-0 right-0 transition-all duration-300"
              style={{
                width: barWidth + '%',
                background: color + '18', // ~10% opacity
              }}
            />

            {/* Content */}
            <div className="relative flex items-center gap-3 px-3 py-2.5">
              {/* Rank badge */}
              <span className="text-xs font-bold text-gray-400 w-4 shrink-0 text-center">
                {idx + 1}
              </span>

              {/* Dot indicator */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color }}
              />

              {/* Name + apartment */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate block">
                  {t('summary.worst_payers.apt')} {payer.apartment_number} — {payer.name}
                </span>
              </div>

              {/* Rate */}
              <span
                className="text-sm font-bold shrink-0 w-12 text-center tabular-nums"
                style={{ color }}
              >
                {payer.rate.toFixed(0)}%
              </span>

              {/* Debt */}
              <span className="text-sm text-red-500 font-medium shrink-0 w-20 text-left tabular-nums">
                ₪{Math.round(payer.debt).toLocaleString('he-IL')}
              </span>

              {/* Arrow */}
              <span className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">
                →
              </span>
            </div>
          </button>
        );
      })}

      <p className="text-xs text-gray-400 pt-1 text-center">
        {t('summary.worst_payers.hint')}
      </p>
    </div>
  );
}
