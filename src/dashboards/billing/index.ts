import { ReceiptIndianRupee } from 'lucide-react';

import type { DashboardModule } from '@/shared/types/dashboard';

export const billing: DashboardModule = {
  id: 'billing',
  label: 'B2B Billing',
  icon: ReceiptIndianRupee,
  description: 'B2B billing cost per product on every channel, incl. GST — live from Sheets.',
  load: () => import('./Page'),
};
