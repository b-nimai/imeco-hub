import { AlertTriangle, CircleCheck, CircleHelp } from 'lucide-react';

import { type CheckSource, chennaiCheckTitle } from '@/dashboards/stock/data/chennaiCheck';
import { cn } from '@/shared/lib/utils';

/** Small icon showing whether Chennai stock was verified across both sheets. */
export function ChennaiCheckBadge({
  product,
  className,
}: {
  product: CheckSource;
  className?: string;
}) {
  const title = chennaiCheckTitle(product);
  switch (product.chennaiCheck) {
    case 'verified':
      return (
        <CircleCheck className={cn('inline size-3 text-emerald-400', className)} aria-label={title}>
          <title>{title}</title>
        </CircleCheck>
      );
    case 'mismatch':
    case 'current-only':
      return (
        <AlertTriangle className={cn('inline size-3 text-amber-400', className)} aria-label={title}>
          <title>{title}</title>
        </AlertTriangle>
      );
    case 'sheetg-only':
      return (
        <CircleHelp
          className={cn('inline size-3 text-muted-foreground', className)}
          aria-label={title}
        >
          <title>{title}</title>
        </CircleHelp>
      );
    default:
      return null;
  }
}
