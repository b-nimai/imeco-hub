import {
  CalendarClock,
  LayoutDashboard,
  PackageX,
  Warehouse,
} from 'lucide-react';

import type { DashboardModule } from '@/shared/types/dashboard';

export const STOCK_PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projections', label: '3M Projection', icon: CalendarClock },
  { id: 'stockouts', label: 'Stock Loss (OOS)', icon: PackageX },
] as const;

export type StockTab = (typeof STOCK_PAGES)[number]['id'];

export const stock: DashboardModule = {
  id: 'stock',
  label: 'Warehouse Stock',
  icon: Warehouse,
  description:
    'Current stock across Dankuni & Chennai, daily stock curves, 3-month projections, and out-of-stock unit loss.',
  load: () => import('./Page'),
  pages: STOCK_PAGES,
};
