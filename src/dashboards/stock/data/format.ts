import type { ProductStatus, StockHealth } from './types';

const inFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shortDayFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDayFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

export function fmtUnits(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return inFormatter.format(Math.round(n));
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 100_000) return `${(n / 100_000).toFixed(2)}L`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return inFormatter.format(Math.round(n));
}

export function fmtVelocity(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '0 / day';
  if (v >= 10) return `${inFormatter.format(Math.round(v))} / day`;
  return `${decFormatter.format(v)} / day`;
}

export function fmtShortDate(iso: string | null | undefined, includeYear = false): string {
  if (!iso) return '—';
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return includeYear ? fullDayFormatter.format(ms) : shortDayFormatter.format(ms);
}

export const HEALTH_META: Record<
  StockHealth,
  { label: string; shortLabel: string; badgeClass: string; dotColor: string; textClass: string }
> = {
  out_of_stock: {
    label: 'Out of Stock',
    shortLabel: 'OOS',
    badgeClass: 'border-rose-500/35 bg-rose-500/12 text-rose-400',
    dotColor: '#f43f5e',
    textClass: 'text-rose-400',
  },
  critical: {
    label: 'Critical (< 30d)',
    shortLabel: '< 30d',
    badgeClass: 'border-amber-500/35 bg-amber-500/12 text-amber-400',
    dotColor: '#f59e0b',
    textClass: 'text-amber-400',
  },
  warning: {
    label: 'Reorder (30–90d)',
    shortLabel: '30–90d',
    badgeClass: 'border-sky-500/35 bg-sky-500/12 text-sky-400',
    dotColor: '#38bdf8',
    textClass: 'text-sky-400',
  },
  healthy: {
    label: 'Healthy (90d+)',
    shortLabel: '90d+',
    badgeClass: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400',
    dotColor: '#10b981',
    textClass: 'text-emerald-400',
  },
};

export const STATUS_BADGE: Record<ProductStatus, string> = {
  Bestseller: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Active: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300',
  Recovered: 'border-purple-500/35 bg-purple-500/12 text-purple-300',
  Discontinued: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};
