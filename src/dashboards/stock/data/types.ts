export type ProductStatus = 'Bestseller' | 'Active' | 'Recovered' | 'Discontinued';
export type WarehouseScope = 'all' | 'dankuni' | 'chennai';
export type VelocityWindow = 30 | 60 | 90;
export type StockHealth = 'out_of_stock' | 'critical' | 'warning' | 'healthy';

export interface CatalogItemRaw {
  id: string;
  sku: string;
  status: string;
  category: string;
  brand: string;
  name: string;
  dankuniNewLogoStock: number;
  chennaiStock: number;
  oldLogoStock: number;
  stockLevelAdj: number;
  upcomingStock: number;
  packagingCount: number;
  packagingBoxName: string;
  material: string;
}

export interface RollupItemRaw {
  totalStockReceived: number;
  image: string;
  blockStock: number;
  totalSold: number;
  returns: number;
  currentStock: number;
}

export interface InflowItemRaw {
  totalReceived: number;
  openStock?: number;
  byDate: Record<string, number>;
}

export interface OutflowItemRaw {
  byDate: Record<string, number>;
  byChannel: Record<string, number>;
}

export interface StockRawPayload {
  generatedAt: string;
  catalog: CatalogItemRaw[];
  rollups: Record<string, RollupItemRaw>;
  dankuniInflows: Record<string, InflowItemRaw>;
  dankuniOutflows: Record<string, OutflowItemRaw>;
  chennaiInflows: Record<string, InflowItemRaw>;
  chennaiOutflows: Record<string, OutflowItemRaw>;
  /** Chennai workbook CURRENT tab (SKU -> Current Stock). Optional: older Apps Script deployments omit it. */
  chennaiCurrent?: Record<string, number>;
  /** Diagnostic: tab names seen in each workbook. */
  meta?: { dankuniTabs?: string[]; chennaiTabs?: string[] };
}

export interface DailyStockPoint {
  date: string;
  inflow: number;
  outflow: number;
  stock: number;
}

export interface ProjectionPoint {
  date: string;
  dayOffset: number;
  projectedStock: number;
  cumulativeLostUnits: number;
}

export interface ChannelBreakdown {
  channel: string;
  units: number;
  share: number;
}

export interface ProductStockAnalytics {
  id: string;
  sku: string;
  name: string;
  shortName: string;
  status: ProductStatus;
  category: string;
  brand: string;
  material: string;
  packagingCount: number;
  packagingBoxName: string;

  // Warehouse stock breakdown
  dankuniStock: number;
  chennaiStock: number;
  /** Cross-check of Chennai stock between Dankuni Total Stock Col G and Chennai CURRENT tab. */
  chennaiCheck: ChennaiCheck;
  /** Chennai stock as written in Dankuni workbook → Total Stock → Col G. */
  chennaiStockSheetG: number;
  /** Chennai stock as written in Chennai workbook → CURRENT tab (null if tab/SKU unavailable). */
  chennaiStockCurrentTab: number | null;
  oldLogoStock: number;
  upcomingStock: number;
  currentStock: number; // Selected warehouse scope's current available stock

  // Cumulative flows in selected scope
  openStock: number;
  totalReceived: number;
  totalSold: number;
  returns: number;
  blockStock: number;
  lastSaleDate: string | null;
  lastRestockDate: string | null;

  // Daily series & sparkline
  dailySeries: DailyStockPoint[];
  sparkline30d: number[];
  sparklineDates30d: string[];

  // Velocity & 3-Month (90-Day) Projection
  dailyVelocity: number; // Units/day during in-stock days in lookback window
  preOosVelocity: number; // True velocity when product was in stock (for OOS loss calculation)
  inStockDaysInWindow: number;
  daysOfCover: number | null; // null if velocity == 0 and currentStock > 0
  projectedRunoutDate: string | null;
  demand30d: number;
  demand60d: number;
  demand90d: number;
  stockAt30d: number;
  stockAt60d: number;
  stockAt90d: number;
  reorderNeeded90d: number;
  packagingShortfall90d: number;
  projectedSeries: ProjectionPoint[];

  // Out-of-Stock (Unavailable) & Stock Loss Analysis
  isOutOfStock: boolean;
  oosSinceDate: string | null;
  currentOosDays: number;
  totalHistoricalOosDays: number;
  lostUnitsCurrentOos: number;
  lostUnitsHistoricalTotal: number;
  projectedOosDays90d: number;
  projectedStockLoss90d: number;

  // Channel mix & Health classification
  channels: ChannelBreakdown[];
  health: StockHealth;
}

/**
 * - `verified`: Col G and CURRENT tab agree.
 * - `mismatch`: both present but differ — the CURRENT tab value is shown.
 * - `current-only` / `sheetg-only`: only one source has the SKU, so it can't be cross-checked.
 * - `none`: no Chennai stock in either source.
 */
export type ChennaiCheck = 'verified' | 'mismatch' | 'current-only' | 'sheetg-only' | 'none';

export interface ChennaiMismatch {
  sku: string;
  name: string;
  sheetG: number;
  currentTab: number;
}

export interface ChennaiVerification {
  /** False when the Apps Script deployment doesn't send the CURRENT tab yet (Col G is used alone). */
  currentTabAvailable: boolean;
  verifiedCount: number;
  mismatches: ChennaiMismatch[];
  /** SKUs only in Col G (CURRENT tab has no row for them). */
  sheetGOnly: { sku: string; name: string; stock: number }[];
  /** SKUs in the CURRENT tab that have no row in Dankuni Total Stock — they can't be shown. */
  missingFromCatalog: { sku: string; stock: number }[];
}

export interface StockDashboardSummary {
  asOfDate: string;
  warehouse: WarehouseScope;
  velocityWindow: VelocityWindow;
  products: ProductStockAnalytics[];
  chennaiVerification: ChennaiVerification;
  categories: string[];
  brands: string[];
  totals: {
    skuCount: number;
    inStockSkuCount: number;
    outOfStockSkuCount: number;
    criticalSkuCount: number;
    warningSkuCount: number;
    healthySkuCount: number;
    totalCurrentStock: number;
    totalDankuniStock: number;
    totalChennaiStock: number;
    totalOldLogoStock: number;
    totalSoldUnits: number;
    totalDailyVelocity: number;
    totalDemand90d: number;
    totalReorderNeeded90d: number;
    totalLostUnitsCurrentOos: number;
    totalLostUnitsHistorical: number;
    totalProjectedStockLoss90d: number;
  };
}
