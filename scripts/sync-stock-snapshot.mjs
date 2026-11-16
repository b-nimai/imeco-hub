#!/usr/bin/env node
// Generates src/dashboards/stock/data/stockSnapshot.json from the two Google Sheets
// (either from pre-exported read-all files or by invoking `gsheets readonly read-all`).
//
// The output JSON has the exact same `StockRawPayload` shape that `scripts/stock-apps-script.gs`
// serves live over HTTP when deployed as a Google Apps Script Web App.

import fs from 'fs';
import path from 'path';

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, mat: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIso(year, month, day) {
  if (month < 1 || month > 12) return null;
  const maxD = daysInMonth(year, month);
  const clampedDay = Math.min(Math.max(1, day), maxD);
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function diffDays(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function resolveHeaderDates(headers, firstDateCol) {
  const rawCols = [];
  for (let c = firstDateCol; c < headers.length; c++) {
    const text = String(headers[c] ?? '').replace(/\s+/g, ' ').trim();
    rawCols.push({ col: c, text });
  }
  const parsed = rawCols.map(({ col, text }) => {
    if (!text) return { col, text, iso: null, candidates: null };
    const wordMatch = /\b(\d{1,2})[-\s/]+([A-Za-z]{3,9})[-\s/]+(\d{2,4})\b/.exec(text);
    if (wordMatch) {
      const d = Number(wordMatch[1]);
      const m = MONTHS[wordMatch[2].toLowerCase()];
      const y = wordMatch[3].length <= 2 ? 2000 + Number(wordMatch[3]) : Number(wordMatch[3]);
      if (m) return { col, text, iso: toIso(y, m, d), candidates: null };
    }
    const numMatch = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
    if (numMatch) {
      const a = Number(numMatch[1]);
      const b = Number(numMatch[2]);
      const y = numMatch[3].length <= 2 ? 2000 + Number(numMatch[3]) : Number(numMatch[3]);
      if (a > 12 && b <= 12) return { col, text, iso: toIso(y, b, a), candidates: null };
      if (b > 12 && a <= 12) return { col, text, iso: toIso(y, a, b), candidates: null };
      if (a <= 12 && b <= 12) {
        const ddmm = toIso(y, b, a);
        const mmdd = toIso(y, a, b);
        if (ddmm === mmdd) return { col, text, iso: ddmm, candidates: null };
        return { col, text, iso: null, candidates: [ddmm, mmdd] };
      }
    }
    return { col, text, iso: null, candidates: null };
  });

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item.iso || !item.candidates) continue;
    let prevIso = null, prevDist = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (parsed[j].iso) { prevIso = parsed[j].iso; prevDist = i - j; break; }
    }
    let nextIso = null, nextDist = 0;
    for (let j = i + 1; j < parsed.length; j++) {
      if (parsed[j].iso) { nextIso = parsed[j].iso; nextDist = j - i; break; }
    }
    const [ddmm, mmdd] = item.candidates;
    let scoreDDMM = 0, scoreMMDD = 0;
    if (prevIso) {
      scoreDDMM += Math.abs(diffDays(prevIso, ddmm) - prevDist);
      scoreMMDD += Math.abs(diffDays(prevIso, mmdd) - prevDist);
    }
    if (nextIso) {
      scoreDDMM += Math.abs(diffDays(ddmm, nextIso) - nextDist);
      scoreMMDD += Math.abs(diffDays(mmdd, nextIso) - nextDist);
    }
    item.iso = scoreMMDD < scoreDDMM ? mmdd : ddmm;
  }

  let lastSeen = null;
  for (const item of parsed) {
    if (item.iso) lastSeen = item.iso;
    else if (item.text) item.iso = lastSeen;
  }
  let nextSeen = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].iso) nextSeen = parsed[i].iso;
    else if (parsed[i].text && !parsed[i].iso) parsed[i].iso = nextSeen;
  }
  return parsed;
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseReadAll(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const tabs = {};
  const parts = raw.split(/^--- (.+?) ---$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const body = parts[i + 1].trim();
    tabs[title] = body ? JSON.parse(body) : [];
  }
  return tabs;
}

const dankuniPath = process.argv[2] || '/Users/nimaibarman/.gemini/antigravity/brain/adfdb85d-c684-4f4a-a7ab-b4ff25f84e05/scratch/dankuni_all.json';
const chennaiPath = process.argv[3] || '/Users/nimaibarman/.gemini/antigravity/brain/adfdb85d-c684-4f4a-a7ab-b4ff25f84e05/scratch/chennai_all.json';

const dankuni = parseReadAll(dankuniPath);
const chennai = parseReadAll(chennaiPath);

// 1. Parse Rollup tabs (IMECO, DENCRUS) in Dankuni
const rollups = {};
for (const tabName of ['IMECO', 'DENCRUS']) {
  const rows = dankuni[tabName] || [];
  const header = rows[0] || [];
  const totalSoldIdx = header.findIndex((h) => /total sold/i.test(h));
  const returnsIdx = header.findIndex((h) => /returns/i.test(h));
  const currentIdx = header.findIndex((h) => /current stock/i.test(h));
  const blockIdx = header.findIndex((h) => /block stock/i.test(h));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = String(row[0] ?? '').trim();
    if (!sku) continue;
    rollups[sku] = {
      totalStockReceived: num(row[2]),
      image: String(row[3] ?? '').trim(),
      blockStock: blockIdx >= 0 ? num(row[blockIdx]) : 0,
      totalSold: totalSoldIdx >= 0 ? num(row[totalSoldIdx]) : 0,
      returns: returnsIdx >= 0 ? num(row[returnsIdx]) : 0,
      currentStock: currentIdx >= 0 ? num(row[currentIdx]) : 0,
    };
  }
}

// 2. Parse Packaging Count in Dankuni
const packaging = {};
for (let r = 1; r < (dankuni['Packaging Count'] || []).length; r++) {
  const row = dankuni['Packaging Count'][r] || [];
  const sku = String(row[0] ?? '').trim();
  if (!sku) continue;
  packaging[sku] = {
    boxName: String(row[2] || row[1] || '').trim(),
    count: num(row[3]),
  };
}

// 3. Parse Dankuni Stock Received
const srRows = dankuni['Stock Received'] || [];
const srDates = resolveHeaderDates(srRows[1] || [], 4);
const dankuniInflows = {};
for (let r = 2; r < srRows.length; r++) {
  const row = srRows[r] || [];
  const sku = String(row[0] ?? '').trim();
  if (!sku) continue;
  const openStock = num(row[3]);
  const byDate = {};
  for (const { col, iso } of srDates) {
    if (!iso) continue;
    const v = num(row[col]);
    if (v !== 0) byDate[iso] = (byDate[iso] || 0) + v;
  }
  dankuniInflows[sku] = {
    totalReceived: num(row[2]),
    openStock,
    byDate,
  };
}

// 4. Parse Dankuni 29 dated channel tabs + Block Stock
const SKIP_DANKUNI = new Set([
  'IMECO',
  'DENCRUS',
  'Total Stock',
  'Stock Received',
  'Packaging Count',
  'SHAVECO',
  'Block Stock',
]);
const templateHeaders = (dankuni['Flipkart'] || [])[1] || [];
const dankuniOutflows = {};
for (const [tab, rows] of Object.entries(dankuni)) {
  if (SKIP_DANKUNI.has(tab)) continue;
  const rawHeaders = rows[1] || [];
  const maxCols = Math.max(rawHeaders.length, ...rows.slice(2).map((r) => (r ? r.length : 0)));
  const paddedHeaders = Array.from({ length: maxCols }, (_, c) =>
    String(rawHeaders[c] ?? '').trim() ? rawHeaders[c] : (templateHeaders[c] ?? ''),
  );
  const dates = resolveHeaderDates(paddedHeaders, 3);
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = String(row[0] ?? '').trim();
    if (!sku) continue;
    if (!dankuniOutflows[sku]) {
      dankuniOutflows[sku] = { byDate: {}, byChannel: {} };
    }
    const entry = dankuniOutflows[sku];
    const tabTotal = num(row[2]);
    let datedSum = 0;
    for (const { col, iso } of dates) {
      if (!iso) continue;
      const v = num(row[col]);
      if (v !== 0) {
        entry.byDate[iso] = (entry.byDate[iso] || 0) + v;
        datedSum += v;
      }
    }
    const chTotal = tabTotal > 0 ? tabTotal : datedSum;
    if (chTotal > 0) {
      entry.byChannel[tab] = (entry.byChannel[tab] || 0) + chTotal;
    }
  }
}

for (let r = 2; r < (dankuni['Block Stock'] || []).length; r++) {
  const row = dankuni['Block Stock'][r] || [];
  const sku = String(row[0] ?? '').trim();
  const blockTotal = num(row[2]);
  if (sku && blockTotal > 0) {
    if (!dankuniOutflows[sku]) {
      dankuniOutflows[sku] = { byDate: {}, byChannel: {} };
    }
    dankuniOutflows[sku].byChannel['Block Stock'] = blockTotal;
  }
}

// 5. Parse Chennai STOCK RECEIVED and 7 channel tabs
const chSrRows = chennai['STOCK RECEIVED'] || [];
const chSrDates = resolveHeaderDates(chSrRows[1] || [], 3);
const chennaiInflows = {};
const chennaiNames = {};
for (let r = 2; r < chSrRows.length; r++) {
  const row = chSrRows[r] || [];
  const sku = String(row[0] ?? '').trim();
  if (!sku || sku === 'Packaging') continue;
  chennaiNames[sku] = String(row[1] ?? '').trim();
  const byDate = {};
  for (const { col, iso } of chSrDates) {
    if (!iso) continue;
    const v = num(row[col]);
    if (v !== 0) byDate[iso] = (byDate[iso] || 0) + v;
  }
  chennaiInflows[sku] = {
    totalReceived: num(row[2]),
    byDate,
  };
}

const SKIP_CHENNAI = new Set(['IMECO', 'CURRENT', 'STOCK RECEIVED']);
const chennaiOutflows = {};
for (const [tab, rows] of Object.entries(chennai)) {
  if (SKIP_CHENNAI.has(tab)) continue;
  const dates = resolveHeaderDates(rows[1] || [], 3);
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const sku = String(row[0] ?? '').trim();
    if (!sku || sku === 'Packaging') continue;
    if (!chennaiOutflows[sku]) {
      chennaiOutflows[sku] = { byDate: {}, byChannel: {} };
    }
    const entry = chennaiOutflows[sku];
    const tabTotal = num(row[2]);
    let datedSum = 0;
    for (const { col, iso } of dates) {
      if (!iso) continue;
      const v = num(row[col]);
      if (v !== 0) {
        entry.byDate[iso] = (entry.byDate[iso] || 0) + v;
        datedSum += v;
      }
    }
    const chTotal = Math.max(tabTotal, datedSum);
    if (chTotal > 0) {
      entry.byChannel[tab] = (entry.byChannel[tab] || 0) + chTotal;
    }
  }
}

// 6. Parse Total Stock catalogue
const catalog = [];
const tsRows = dankuni['Total Stock'] || [];
const seenSkus = new Set();
for (let r = 2; r < tsRows.length; r++) {
  const row = tsRows[r] || [];
  const rawSku = String(row[0] ?? '').trim();
  const status = String(row[1] ?? '').trim() || 'Active';
  const category = String(row[2] ?? '').trim() || 'Uncategorized';
  const brand = String(row[3] ?? '').trim() || 'Imeco';
  const name = String(row[4] ?? '').trim();
  if (!rawSku || rawSku === 'SKU' || rawSku === 'Packaging' || !name) continue;

  const isDuplicateRecovered = seenSkus.has(rawSku);
  const id = isDuplicateRecovered ? `${rawSku}-REC` : rawSku;
  seenSkus.add(rawSku);

  catalog.push({
    id,
    sku: rawSku,
    status,
    category,
    brand,
    name,
    dankuniNewLogoStock: num(row[5]),
    chennaiStock: num(row[6]),
    oldLogoStock: num(row[7]),
    stockLevelAdj: num(row[8]),
    upcomingStock: num(row[9]),
    packagingCount: num(row[10]) || packaging[rawSku]?.count || 0,
    packagingBoxName: packaging[rawSku]?.boxName || '',
    material: String(row[11] ?? '').trim(),
  });
}

const payload = {
  generatedAt: '2026-11-16T11:59:00+05:30',
  catalog,
  rollups,
  dankuniInflows,
  dankuniOutflows,
  chennaiInflows,
  chennaiOutflows,
};

const outDir = path.resolve(import.meta.dirname, '../src/dashboards/stock/data');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'stockSnapshot.json');
fs.writeFileSync(outFile, JSON.stringify(payload));
console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB, ${catalog.length} products)`);
