// Sales' view of the shared Sheets client (src/shared/data/sheetsClient.ts).
//
// Keeps the original mission-control signatures — listSheets(id), fetchSheetValues(sheet, id,
// range) — so sheetsApi.js and growthApi.js are untouched. Three hooks read the SAME workbook on
// overlapping schedules; the shared client's 150s promise cache folds those into one request.

import * as sheets from '@/shared/data/sheetsClient';

// Kept well under the hooks' refresh so a scheduled poll always lands after expiry.
const TTL_MS = 150 * 1000;

const target = (spreadsheetId) => ({
  spreadsheetId,
  envName: 'VITE_SALES_SPREADSHEET_ID',
  ttlMs: TTL_MS,
});

export function clearSheetsCache() {
  sheets.clearSheetsCache();
}

export function listSheets(spreadsheetId) {
  return sheets.getSheetTitles(target(spreadsheetId));
}

// FORMATTED_VALUE matches the original client, which sent no valueRenderOption: the parsers
// expect display strings such as "₹1,20,000" and "12%".
export function fetchSheetValues(sheetName, spreadsheetId, range = 'A1:Z65') {
  return sheets.fetchSheetValues(target(spreadsheetId), sheetName, range, 'FORMATTED_VALUE');
}
