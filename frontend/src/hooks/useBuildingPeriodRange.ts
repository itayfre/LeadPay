import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

export interface MonthYear {
  month: number; // 1-12
  year: number;
}

export interface DateRange {
  from: MonthYear;
  to: MonthYear;
}

function parseYYYYMM(s: string | null): MonthYear | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function toYYYYMM({ year, month }: MonthYear): string {
  return year + '-' + String(month).padStart(2, '0');
}

function monthDiff(from: MonthYear, to: MonthYear): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

export function expandRange(from: MonthYear, to: MonthYear): MonthYear[] {
  const diff = monthDiff(from, to);
  if (diff < 0) return [];
  const result: MonthYear[] = [];
  let cur = { ...from };
  for (let i = 0; i <= Math.min(diff, 23); i++) {
    result.push({ ...cur });
    if (cur.month === 12) {
      cur = { month: 1, year: cur.year + 1 };
    } else {
      cur = { month: cur.month + 1, year: cur.year };
    }
  }
  return result;
}

export function useBuildingPeriodRange() {
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const currentMonth: MonthYear = { month: now.getMonth() + 1, year: now.getFullYear() };

  const range = useMemo((): DateRange => {
    const fromParam = parseYYYYMM(searchParams.get('from'));
    const toParam = parseYYYYMM(searchParams.get('to'));

    if (fromParam && toParam) {
      const diff = monthDiff(fromParam, toParam);
      if (diff >= 0 && diff <= 23) {
        return { from: fromParam, to: toParam };
      }
    }

    try {
      const saved = localStorage.getItem('lp:lastBuildingFilter');
      if (saved) {
        const p = JSON.parse(saved) as { month?: number; year?: number };
        if (p.month && p.year) {
          const mv: MonthYear = { month: p.month, year: p.year };
          return { from: mv, to: mv };
        }
      }
    } catch {
      // ignore parse errors
    }

    return { from: currentMonth, to: currentMonth };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setRange = useCallback(
    (newRange: DateRange) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('from', toYYYYMM(newRange.from));
          next.set('to', toYYYYMM(newRange.to));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const isSingleMonth =
    range.from.year === range.to.year && range.from.month === range.to.month;

  const months = useMemo(() => expandRange(range.from, range.to), [range]);

  return { range, setRange, isSingleMonth, months };
}
