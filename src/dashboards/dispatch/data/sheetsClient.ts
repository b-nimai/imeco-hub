// Dispatch's view of the shared Sheets client: binds the spreadsheet id, the hourly TTL and
// this dashboard's localStorage key, so useDispatchData stays unaware of the shared plumbing.

import * as sheets from '@/shared/data/sheetsClient';

export type { CachedPayload, RangeMap } from '@/shared/data/sheetsClient';

// Matches the hourly poll in useDispatchData. Anything older is revalidated on boot.
export const TTL_MS = 60 * 60 * 1000;
// v2: range keys changed from `2:25` to open-ended rows; v1 payloads can't be parsed.
const LS_KEY = 'hub:dispatch:v2';

function target(spreadsheetId: string | undefined) {
  return { spreadsheetId, envName: 'VITE_DISPATCH_SPREADSHEET_ID', ttlMs: TTL_MS };
}

export function batchGetValues(spreadsheetId: string | undefined, ranges: string[]) {
  return sheets.batchGetValues(target(spreadsheetId), ranges);
}

export function getSheetTitles(spreadsheetId: string | undefined) {
  return sheets.getSheetTitles(target(spreadsheetId));
}

export const readCachedPayload = () => sheets.readCachedPayload(LS_KEY);
export const writeCachedPayload = (ranges: sheets.RangeMap) =>
  sheets.writeCachedPayload(LS_KEY, ranges);
export const clearSheetsCache = () => sheets.clearSheetsCache(LS_KEY);

export function isStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt >= TTL_MS;
}
