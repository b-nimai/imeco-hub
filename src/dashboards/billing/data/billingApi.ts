// Reads the billing sheet and reshapes it into everything the dashboard renders.
//
// The sheet is a product x channel matrix:
//
//   | Item Image | Product Name | Brand | RK | Clicktech | Blinkit | Swiggy Instamart | Firstclub |
//
// Nothing here is hard-coded to those channel names. The header row is what defines the
// schema: the image column, the product-name column and the brand column are located by
// name, and EVERY remaining non-empty header becomes a channel. Adding a marketplace
// column to the sheet therefore shows up as a new grid column with no code change.
//
// Brand is deliberately NOT a channel: it carries no billing figure, it labels which house
// brand the product belongs to (Imeco / Good Habbit). It leaves the grid as a column and
// comes back as a per-product tag the header filters on instead.

import { fetchSheetValues, getSheetTitles } from '@/shared/data/sheetsClient';

const SPREADSHEET_ID = import.meta.env.VITE_BILLING_SPREADSHEET_ID as string | undefined;
const CONFIGURED_SHEET = import.meta.env.VITE_BILLING_SHEET_NAME as string | undefined;
const RANGE = 'A1:Z1000';

/** Kept well under the hourly poll so a scheduled refresh always gets fresh data. */
const TARGET = {
  spreadsheetId: SPREADSHEET_ID,
  envName: 'VITE_BILLING_SPREADSHEET_ID',
  ttlMs: 150 * 1000,
};

export interface BillingProduct {
  name: string;
  brand: string;
  image: string | null;
  imageFull: string | null;
  values: Record<string, number>;
}

export interface BillingData {
  sheetName: string;
  /** Sheet header order, left to right. */
  channels: string[];
  /** Brand values in first-seen sheet order. */
  brands: string[];
  products: BillingProduct[];
  productCount: number;
  channelCount: number;
  updatedAt: Date;
}

function toNumber(cell: unknown): number {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 0;
  if (cell === null || cell === undefined) return 0;
  // Tolerate a sheet that stores amounts as text ("₹1,200", "1 200", "(500)" for negative).
  const raw = String(cell).trim();
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()]/g, '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

// The image cell may hold a bare URL, an =IMAGE("url") formula, or a Google Drive share
// link. Drive share links don't render in an <img>, so they're rewritten to the thumbnail
// endpoint, which does. Two sizes: w200 for the grid tile, w1200 for the modal.
function toImageUrls(cell: unknown): { thumb: string | null; full: string | null } {
  const none = { thumb: null, full: null };
  if (!cell) return none;
  const raw = String(cell).trim();
  if (!raw) return none;
  const formula = raw.match(/=\s*IMAGE\(\s*["']([^"']+)["']/i);
  const url = formula ? formula[1] : raw;
  if (!/^https?:\/\//i.test(url)) return none;
  const drive = url.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/,
  );
  if (drive) {
    const id = drive[1];
    return {
      thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w200`,
      full: `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    };
  }
  return { thumb: url, full: url };
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).trim();
}

// Locate the image / product-name / brand columns from the header, falling back to the
// sheet's conventional A=image, B=name layout when the headers are named something
// unexpected. A missing brand column is fine — brandCol stays -1.
function resolveLayout(header: unknown[]) {
  const labels = header.map((h) => cellText(h));
  const imageCol = labels.findIndex((h) => /image|photo|picture|thumbnail/i.test(h));
  let nameCol = labels.findIndex(
    (h, i) => i !== imageCol && /name|product|item|sku|description/i.test(h),
  );
  const brandCol = labels.findIndex(
    (h, i) => i !== imageCol && i !== nameCol && /^brands?$/i.test(h),
  );
  if (nameCol === -1)
    nameCol = labels.findIndex((h, i) => i !== imageCol && i !== brandCol && h !== '');
  if (nameCol === -1) nameCol = imageCol === 0 ? 1 : 0;

  const channels: { name: string; col: number }[] = [];
  labels.forEach((label, i) => {
    if (i === imageCol || i === nameCol || i === brandCol || !label) return;
    channels.push({ name: label, col: i });
  });
  return { imageCol, nameCol, brandCol, channels };
}

async function resolveSheetName(): Promise<string> {
  if (CONFIGURED_SHEET) return CONFIGURED_SHEET;
  const tabs = await getSheetTitles(TARGET);
  if (!tabs.length) throw new Error('Spreadsheet has no sheets');
  return tabs[0];
}

export async function fetchBillingData(): Promise<BillingData> {
  const sheetName = await resolveSheetName();

  // Two reads of the same grid: raw values for the numbers, formulas for the image column.
  // An =IMAGE() cell comes back as an empty string under every render option except FORMULA.
  const [values, formulas] = await Promise.all([
    fetchSheetValues(TARGET, sheetName, RANGE, 'UNFORMATTED_VALUE'),
    fetchSheetValues(TARGET, sheetName, RANGE, 'FORMULA'),
  ]);

  if (!values.length) throw new Error(`Sheet "${sheetName}" is empty`);

  const { imageCol, nameCol, brandCol, channels } = resolveLayout(values[0] ?? []);
  if (!channels.length) throw new Error('No channel columns found in the header row');

  const products: BillingProduct[] = [];
  const brandOrder: string[] = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const formulaRow = formulas[r] ?? [];
    const name = cellText(row[nameCol]);
    const perChannel: Record<string, number> = {};
    let total = 0;
    for (const ch of channels) {
      const v = toNumber(row[ch.col]);
      perChannel[ch.name] = v;
      total += v;
    }
    // Drop rows that are entirely blank; keep a named row even at zero, since a product
    // billing nothing this period is itself worth seeing.
    if (!name && total === 0) continue;
    const brand = brandCol >= 0 ? cellText(row[brandCol]) : '';
    if (brand && !brandOrder.includes(brand)) brandOrder.push(brand);
    const images =
      imageCol >= 0
        ? toImageUrls(formulaRow[imageCol] ?? row[imageCol])
        : { thumb: null, full: null };
    products.push({
      name: name || `Row ${r + 1}`,
      brand,
      image: images.thumb,
      imageFull: images.full,
      values: perChannel,
    });
  }

  return {
    sheetName,
    channels: channels.map((c) => c.name),
    brands: brandOrder,
    products,
    productCount: products.length,
    channelCount: channels.length,
    updatedAt: new Date(),
  };
}
