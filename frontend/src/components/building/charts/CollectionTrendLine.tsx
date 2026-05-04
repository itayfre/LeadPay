import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from 'recharts';
import type { BuildingSummaryStats } from '../../../types';

const HE_MONTHS = [
  'ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני',
  'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ',
];

function shortLabel(period: string): string {
  // period = "YYYY-MM"
  const parts = period.split('-');
  if (parts.length !== 2) return period;
  const mo = parseInt(parts[1], 10);
  return HE_MONTHS[mo - 1] + ' ' + parts[0].slice(2);
}

interface TooltipPayload {
  payload?: { period: string; rate: number; collected: number; expected: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-right" dir="rtl">
      <p className="text-xs font-semibold text-gray-800">
        {shortLabel(d.period)} — {d.rate.toFixed(1)}%
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        ₪{d.collected.toLocaleString('he-IL')} / ₪{d.expected.toLocaleString('he-IL')}
      </p>
    </div>
  );
}

interface Props {
  trend: BuildingSummaryStats['trend'];
}

export default function CollectionTrendLine({ trend }: Props) {
  const { t } = useTranslation();

  if (!trend || trend.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm" dir="rtl">
        {t('summary.chart.no_data')}
      </div>
    );
  }

  const chartData = trend.map((d) => ({ ...d, label: shortLabel(d.period) }));
  const maxRate = Math.max(...chartData.map((d) => d.rate), 100);
  const yMax = Math.ceil(maxRate / 10) * 10;

  // Find worst month
  const worst = chartData.reduce((min, d) => (d.rate < min.rate ? d : min), chartData[0]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22C55E" stopOpacity={0.08} />
            <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, yMax]}
          tickFormatter={(v: number) => v + '%'}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={36}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }} />

        <Area
          type="monotone"
          dataKey="rate"
          fill="url(#trendFill)"
          stroke="none"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#22C55E"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22C55E', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />

        {/* Annotate worst month */}
        {worst && worst.rate < 90 && (
          <ReferenceDot
            x={worst.label}
            y={worst.rate}
            r={5}
            fill="#EF4444"
            stroke="#fff"
            strokeWidth={2}
            label={{
              value: worst.rate.toFixed(0) + '%',
              position: 'top',
              fontSize: 10,
              fill: '#EF4444',
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
