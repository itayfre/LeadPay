export const RISK_THRESHOLDS = { partial: 30, onTrack: 70 } as const;

export type BuildingStatus = 'onTrack' | 'partial' | 'atRisk' | 'needsSetup';

export function buildingStatus(
  hasMonthlyRate: boolean,
  collectionRate: number | undefined,
): BuildingStatus {
  if (!hasMonthlyRate) return 'needsSetup';
  const rate = collectionRate ?? 0;
  if (rate >= RISK_THRESHOLDS.onTrack) return 'onTrack';
  if (rate >= RISK_THRESHOLDS.partial) return 'partial';
  return 'atRisk';
}

export interface StatusVisual {
  dotClass: string;
  textClass: string;
  bgClass: string;
  barClass: string;
  sparkColor: string;
}

export const STATUS_VISUALS: Record<BuildingStatus, StatusVisual> = {
  onTrack:    { dotClass: 'bg-accent-500', textClass: 'text-accent-700', bgClass: 'bg-accent-50',  barClass: 'bg-accent-500', sparkColor: '#10B981' },
  partial:    { dotClass: 'bg-warn-500',   textClass: 'text-warn-600',   bgClass: 'bg-warn-50',    barClass: 'bg-warn-500',   sparkColor: '#F59E0B' },
  atRisk:     { dotClass: 'bg-danger-500', textClass: 'text-danger-600', bgClass: 'bg-danger-50',  barClass: 'bg-danger-500', sparkColor: '#EF4444' },
  needsSetup: { dotClass: 'bg-ink-400',    textClass: 'text-ink-700',    bgClass: 'bg-ink-100',    barClass: 'bg-ink-300',    sparkColor: '#8C95A1' },
};
