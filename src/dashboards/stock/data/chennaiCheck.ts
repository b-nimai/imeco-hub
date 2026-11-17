import { fmtUnits } from '@/dashboards/stock/data/format';
import type { ProductStockAnalytics } from '@/dashboards/stock/data/types';

export type CheckSource = Pick<
  ProductStockAnalytics,
  'chennaiCheck' | 'chennaiStockSheetG' | 'chennaiStockCurrentTab'
>;

/** Explains how a product's Chennai stock compares across the two sheets. */
export function chennaiCheckTitle(p: CheckSource): string {
  const g = fmtUnits(p.chennaiStockSheetG);
  const cur = p.chennaiStockCurrentTab === null ? '—' : fmtUnits(p.chennaiStockCurrentTab);
  switch (p.chennaiCheck) {
    case 'verified':
      return `Verified: Dankuni Total Stock Col G and the Chennai CURRENT tab both say ${g}`;
    case 'mismatch':
    case 'current-only':
      return `Mismatch: Chennai CURRENT tab = ${cur}, Dankuni Total Stock Col G = ${g}. Showing the CURRENT tab value. Fix whichever sheet is wrong.`;
    case 'sheetg-only':
      return `Not cross-checked: only Dankuni Total Stock Col G has this SKU (${g}). The Chennai CURRENT tab has no row for it, or the Apps Script hasn't been redeployed yet.`;
    default:
      return 'No Chennai stock in either sheet';
  }
}
