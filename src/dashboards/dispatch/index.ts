import { Truck } from 'lucide-react';

import type { DashboardModule } from '@/shared/types/dashboard';

export const dispatch: DashboardModule = {
  id: 'dispatch',
  label: 'Marketplace Dispatch',
  icon: Truck,
  description: 'Units dispatched per product and channel, by month — from the Outbound Tracker.',
  load: () => import('./Page'),
};
