import { billing } from '@/dashboards/billing';
import { dispatch } from '@/dashboards/dispatch';
import { prices } from '@/dashboards/prices';
import { sales } from '@/dashboards/sales';
import { stock } from '@/dashboards/stock';
import type { DashboardModule } from '@/shared/types/dashboard';

/**
 * Every dashboard in the hub, in sidebar order.
 *
 * Adding one: create `src/dashboards/<id>/index.ts` exporting a `DashboardModule`, then add it
 * here. Routes (`/<id>`, `/tv/<id>`), the sidebar entry, the home card and code splitting all
 * follow from this list.
 */
export const dashboards: readonly DashboardModule[] = [sales, prices, billing, dispatch, stock];
