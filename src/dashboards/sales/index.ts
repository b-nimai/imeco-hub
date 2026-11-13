import { TrendingUp, Rocket, Target } from 'lucide-react';

import type { DashboardModule } from '@/shared/types/dashboard';

export const sales: DashboardModule = {
  id: 'sales',
  label: 'Sales Mission Control',
  icon: Rocket,
  description:
    'Month-to-date revenue vs target, daily pace, channel mix, FY overview and channel growth.',
  load: () => import('./Page.jsx'),
  pages: [
    { id: 'mission', label: 'Mission', icon: Target },
    { id: 'growth', label: 'Channel Growth', icon: TrendingUp },
  ],
};
