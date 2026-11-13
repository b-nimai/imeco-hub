import { formatAgo, freshness } from '@/dashboards/prices/data/format';
import { cn } from '@/shared/lib/utils';

/** How fresh the prices are, from when they were SCRAPED — a stale board must never look live. */
export function Freshness({
  checkedAt,
  syncing,
  error,
}: {
  checkedAt: number | null;
  syncing: boolean;
  error: string | null;
}) {
  const age = freshness(checkedAt);
  const tone = error || age === 'very-stale' ? 'bg-bad' : age === 'stale' ? 'bg-warn' : 'bg-good';
  const text = error
    ? 'Offline — cached'
    : syncing
      ? 'Syncing…'
      : checkedAt
        ? `Priced ${formatAgo(checkedAt)}${age === 'fresh' ? '' : ' — run app'}`
        : 'No prices yet';
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1 text-xs',
        age === 'fresh' && !error ? 'text-muted-foreground' : 'text-warn',
      )}
      title={error ?? 'Prices refresh hourly from the desktop app'}
    >
      <span className={cn('size-2 shrink-0 rounded-full', tone, age === 'fresh' && 'pulse-dot')} />
      <span className="truncate">{text}</span>
    </span>
  );
}
