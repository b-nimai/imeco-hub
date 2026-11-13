import {
  Boxes,
  ChartLine,
  IndianRupee,
  LayoutDashboard,
  Search,
  Star,
  Swords,
  Tag,
} from 'lucide-react';

import type { DashboardModule } from '@/shared/types/dashboard';

/** Sub-pages, in sidebar order. The first is the default (`/prices`). */
export const PRICE_PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'prices', label: 'Prices', icon: IndianRupee },
  { id: 'trends', label: 'Trends', icon: ChartLine },
  { id: 'availability', label: 'Stock', icon: Boxes },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'competitors', label: 'Competitors', icon: Swords },
  { id: 'search', label: 'Search', icon: Search },
] as const;

export type PriceTab = (typeof PRICE_PAGES)[number]['id'];

export const prices: DashboardModule = {
  id: 'prices',
  label: 'Price Tracker',
  icon: Tag,
  description:
    'Live marketplace prices, stock, ratings, competitors and search rank — scraped hourly.',
  load: () => import('./Page'),
  pages: PRICE_PAGES,
};
