/**
 * IMECO Mission Control — Stock Sheets Proxy (Google Apps Script)
 *
 * Reads the private Dankuni & Chennai stock workbooks (Viewer access is enough), builds the
 * compact StockRawPayload JSON, and publishes it so the dashboard loads in about a second:
 *
 *   ┌ every 5 min (time trigger) ┐
 *   │ scheduledTick: sheets changed? budget ok? → build → CacheService + Supabase │
 *   └──────────────────────────────┘
 *   doGet (web app)            → serves the cached build instantly (builds only on a cache miss)
 *   doGet ?action=status       → build/budget state (JSON)
 *   doGet ?action=build        → force a rebuild now (rate-limited, 1/min)
 *   doGet ?engine=legacy       → build with the old SpreadsheetApp reader (for comparison)
 *
 * QUOTAS (free Gmail): time triggers may run ~90 min/day in total, 6 min per run. The script
 * tracks its own trigger runtime per day and paces rebuilds to stay inside DAILY_BUDGET_MIN
 * (default 75, set the DAILY_BUDGET_MIN script property to ~330 on a Google Workspace account).
 * Web-app requests (doGet) do not count toward that trigger budget.
 *
 * ONE-TIME SETUP (in the Apps Script editor):
 *   1. Services (+) → add "Google Sheets API" and "Drive API". (Fast reads + change detection;
 *      the script still works without them, just slower.)
 *   2. Project Settings → Script Properties → add:
 *        SUPABASE_URL         https://<project-ref>.supabase.co
 *        SUPABASE_KEY         the project's anon / publishable key (public, read-only by RLS)
 *        STOCK_INGEST_SECRET  value printed by the last query in scripts/stock-supabase.sql
 *   3. Select the `setup` function in the toolbar and click Run (installs the 5-min trigger and
 *      does the first build).
 *   4. Deploy → Manage deployments → Edit → Version: New version → Deploy (keeps the same URL).
 */

const DANKUNI_SPREADSHEET_ID = '1ep2kwz9Q_uxyEHBmwCSwwnbpZ3BBomMJMGysK1-ph2g';
const CHENNAI_SPREADSHEET_ID = '16iI2SEOnaBtw2GfPJrhU4i4gGee4XZuI2R3qJcrjCYU';

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
  var maxD = daysInMonth(year, month);
  var clampedDay = Math.min(Math.max(1, day), maxD);
  var mm = String(month).length < 2 ? '0' + month : String(month);
  var dd = String(clampedDay).length < 2 ? '0' + clampedDay : String(clampedDay);
  return year + '-' + mm + '-' + dd;
}

function diffDays(isoA, isoB) {
  var a = Date.parse(isoA + 'T00:00:00Z');
  var b = Date.parse(isoB + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function formatCellHeader(cell) {
  // Date cells are written as MM-DD-YYYY on purpose: the Dankuni sheet stores some dates with day
  // and month swapped, and resolveHeaderDates() fixes those using neighbouring columns. Do NOT
  // switch to an unambiguous format here — it bypasses that correction and misplaces sales.
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    var d = cell.getDate();
    var m = cell.getMonth() + 1;
    var y = cell.getFullYear();
    return (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d) + '-' + y;
  }
  return String(cell == null ? '' : cell).replace(/\s+/g, ' ').trim();
}

function resolveHeaderDates(headers, firstDateCol) {
  var rawCols = [];
  for (var c = firstDateCol; c < headers.length; c++) {
    rawCols.push({ col: c, text: formatCellHeader(headers[c]) });
  }
  var parsed = rawCols.map(function (item) {
    var col = item.col;
    var text = item.text;
    if (!text) return { col: col, text: text, iso: null, candidates: null };
    var wordMatch = /\b(\d{1,2})[-\s/]+([A-Za-z]{3,9})[-\s/]+(\d{2,4})\b/.exec(text);
    if (wordMatch) {
      var d = Number(wordMatch[1]);
      var m = MONTHS[wordMatch[2].toLowerCase()];
      var y = wordMatch[3].length <= 2 ? 2000 + Number(wordMatch[3]) : Number(wordMatch[3]);
      if (m) return { col: col, text: text, iso: toIso(y, m, d), candidates: null };
    }
    var numMatch = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
    if (numMatch) {
      var a = Number(numMatch[1]);
      var b = Number(numMatch[2]);
      var yr = numMatch[3].length <= 2 ? 2000 + Number(numMatch[3]) : Number(numMatch[3]);
      if (a > 12 && b <= 12) return { col: col, text: text, iso: toIso(yr, b, a), candidates: null };
      if (b > 12 && a <= 12) return { col: col, text: text, iso: toIso(yr, a, b), candidates: null };
      if (a <= 12 && b <= 12) {
        var ddmm = toIso(yr, b, a);
        var mmdd = toIso(yr, a, b);
        if (ddmm === mmdd) return { col: col, text: text, iso: ddmm, candidates: null };
        return { col: col, text: text, iso: null, candidates: [ddmm, mmdd] };
      }
    }
    return { col: col, text: text, iso: null, candidates: null };
  });

  for (var i = 0; i < parsed.length; i++) {
    var cur = parsed[i];
    if (cur.iso || !cur.candidates) continue;
    var prevIso = null, prevDist = 0;
    for (var j = i - 1; j >= 0; j--) {
      if (parsed[j].iso) { prevIso = parsed[j].iso; prevDist = i - j; break; }
    }
    var nextIso = null, nextDist = 0;
    for (var k = i + 1; k < parsed.length; k++) {
      if (parsed[k].iso) { nextIso = parsed[k].iso; nextDist = k - i; break; }
    }
    var ddmm = cur.candidates[0];
    var mmdd = cur.candidates[1];
    var scoreDDMM = 0, scoreMMDD = 0;
    if (prevIso) {
      scoreDDMM += Math.abs(diffDays(prevIso, ddmm) - prevDist);
      scoreMMDD += Math.abs(diffDays(prevIso, mmdd) - prevDist);
    }
    if (nextIso) {
      scoreDDMM += Math.abs(diffDays(ddmm, nextIso) - nextDist);
      scoreMMDD += Math.abs(diffDays(mmdd, nextIso) - nextDist);
    }
    cur.iso = scoreMMDD < scoreDDMM ? mmdd : ddmm;
  }

  var lastSeen = null;
  for (var p = 0; p < parsed.length; p++) {
    if (parsed[p].iso) lastSeen = parsed[p].iso;
    else if (parsed[p].text) parsed[p].iso = lastSeen;
  }
  var nextSeen = null;
  for (var q = parsed.length - 1; q >= 0; q--) {
    if (parsed[q].iso) nextSeen = parsed[q].iso;
    else if (parsed[q].text && !parsed[q].iso) parsed[q].iso = nextSeen;
  }
  return parsed;
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
}

// ── Tab detection ───────────────────────────────────────────────────────────────────────────
// Tabs are recognised by their layout, not a hardcoded list of names, so new brands, renamed
// sales channels and extra scratch tabs are handled automatically. Only the structural input
// tabs are looked up by name (case/space-insensitive).

function normTab(name) {
  return String(name).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Find a tab by name ignoring case and extra spaces; returns its name or null. */
function findTab(book, wanted) {
  var w = normTab(wanted);
  var names = Object.keys(book);
  for (var i = 0; i < names.length; i++) {
    if (normTab(names[i]) === w) return names[i];
  }
  return null;
}

function rowHas(row, re) {
  return (row || []).some(function (c) { return re.test(String(c == null ? '' : c)); });
}

/** Brand totals tab (e.g. IMECO, DENCRUS): row 1 headers include "Total Sold" and "Current Stock". */
function isBrandTotalsTab(rows) {
  var h = rows[0] || [];
  return rowHas(h, /total sold/i) && rowHas(h, /current stock/i);
}

var DATE_HEADER_RE = /\b\d{1,2}[-\s\/.]+(?:[A-Za-z]{3,9}|\d{1,2})[-\s\/.]+\d{2,4}\b/;

/** Sales tab: the header row (row 2) has at least one real date column from `firstCol` on. */
function isSalesTab(rows, firstCol) {
  var h = rows[1] || [];
  for (var c = firstCol; c < h.length; c++) {
    if (DATE_HEADER_RE.test(formatCellHeader(h[c]))) return true;
  }
  return false;
}

// ── Readers ─────────────────────────────────────────────────────────────────────────────────
// Fast: one Sheets API batchGet per workbook (instead of one SpreadsheetApp call per tab), and the
// API trims trailing empty rows/columns. Legacy: the original SpreadsheetApp reader, kept as an
// automatic fallback and for side-by-side comparison (?engine=legacy).

/** Sheets serial day number → local-midnight Date (same calendar day getValues() would give). */
function serialToDate(n) {
  var u = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

/**
 * With SERIAL_NUMBER rendering, date cells come back as numbers. Header rows (1 and 2) are where
 * dates matter, so serials in a plausible range (2020–2035) are turned back into Dates there.
 * Data cells stay numeric exactly as getValues() returns them.
 */
function reviveHeaderDates(rows) {
  for (var r = 0; r < Math.min(2, rows.length); r++) {
    var row = rows[r] || [];
    for (var c = 0; c < row.length; c++) {
      var v = row[c];
      if (typeof v === 'number' && v >= 43831 && v <= 49674) row[c] = serialToDate(v);
    }
  }
  return rows;
}

function readBookFast(spreadsheetId) {
  var meta = Sheets.Spreadsheets.get(spreadsheetId, { fields: 'sheets.properties.title' });
  var titles = (meta.sheets || []).map(function (s) { return s.properties.title; });
  var ranges = titles.map(function (t) { return "'" + t.replace(/'/g, "''") + "'"; });
  var res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: ranges,
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  var book = {};
  (res.valueRanges || []).forEach(function (vr, i) {
    book[titles[i]] = reviveHeaderDates(vr.values || []);
  });
  return book;
}

function readBookLegacy(spreadsheetId) {
  var book = {};
  SpreadsheetApp.openById(spreadsheetId).getSheets().forEach(function (s) {
    book[s.getName()] = s.getDataRange().getValues();
  });
  return book;
}

function fastReaderAvailable() {
  return typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values;
}

/** Read both workbooks and build the payload. engine: 'fast' (default) | 'legacy'. */
function buildPayload(engine) {
  var useFast = engine !== 'legacy' && fastReaderAvailable();
  var t0 = Date.now();
  var dankuni, chennai, used = useFast ? 'fast' : 'legacy';
  try {
    dankuni = useFast ? readBookFast(DANKUNI_SPREADSHEET_ID) : readBookLegacy(DANKUNI_SPREADSHEET_ID);
  } catch (err) {
    if (!useFast) throw err;
    used = 'legacy (fast failed: ' + String(err).slice(0, 120) + ')';
    dankuni = readBookLegacy(DANKUNI_SPREADSHEET_ID);
    useFast = false;
  }
  var t1 = Date.now();
  chennai = useFast ? readBookFast(CHENNAI_SPREADSHEET_ID) : readBookLegacy(CHENNAI_SPREADSHEET_ID);
  var t2 = Date.now();
  var payload = buildPayloadFromBooks(dankuni, chennai);
  var t3 = Date.now();
  payload.meta.engine = used;
  payload.meta.timings = { readDankuniMs: t1 - t0, readChennaiMs: t2 - t1, parseMs: t3 - t2, totalMs: t3 - t0 };
  return payload;
}

function buildPayloadFromBooks(dankuni, chennai) {
  // Structural input tabs (looked up by name, tolerant of case/spacing).
  var DK_TOTAL = findTab(dankuni, 'Total Stock');
  var DK_RECEIVED = findTab(dankuni, 'Stock Received');
  var DK_PACKAGING = findTab(dankuni, 'Packaging Count');
  var DK_BLOCK = findTab(dankuni, 'Block Stock');
  var CH_CURRENT = findTab(chennai, 'CURRENT');
  var CH_RECEIVED = findTab(chennai, 'STOCK RECEIVED');

  // Classify every remaining tab by layout. Recorded in meta.tabRoles for verification.
  var dkRoles = {};
  Object.keys(dankuni).forEach(function (tab) {
    if (tab === DK_TOTAL) dkRoles[tab] = 'total-stock';
    else if (tab === DK_RECEIVED) dkRoles[tab] = 'stock-received';
    else if (tab === DK_PACKAGING) dkRoles[tab] = 'packaging';
    else if (tab === DK_BLOCK) dkRoles[tab] = 'block-stock';
    else if (isBrandTotalsTab(dankuni[tab])) dkRoles[tab] = 'brand-totals';
    else if (isSalesTab(dankuni[tab], 3)) dkRoles[tab] = 'sales';
    else dkRoles[tab] = 'ignored';
  });
  var chRoles = {};
  Object.keys(chennai).forEach(function (tab) {
    if (tab === CH_CURRENT) chRoles[tab] = 'current';
    else if (tab === CH_RECEIVED) chRoles[tab] = 'stock-received';
    else if (isBrandTotalsTab(chennai[tab])) chRoles[tab] = 'brand-totals';
    else if (isSalesTab(chennai[tab], 3)) chRoles[tab] = 'sales';
    else chRoles[tab] = 'ignored';
  });

  var rollups = {};
  Object.keys(dkRoles).filter(function (t) { return dkRoles[t] === 'brand-totals'; }).forEach(function (tabName) {
    var rows = dankuni[tabName] || [];
    var header = rows[0] || [];
    var totalSoldIdx = header.findIndex(function (h) { return /total sold/i.test(String(h)); });
    var returnsIdx = header.findIndex(function (h) { return /returns/i.test(String(h)); });
    var currentIdx = header.findIndex(function (h) { return /current stock/i.test(String(h)); });
    var blockIdx = header.findIndex(function (h) { return /block stock/i.test(String(h)); });
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var sku = String(row[0] == null ? '' : row[0]).trim();
      if (!sku) continue;
      rollups[sku] = {
        totalStockReceived: num(row[2]),
        image: String(row[3] == null ? '' : row[3]).trim(),
        blockStock: blockIdx >= 0 ? num(row[blockIdx]) : 0,
        totalSold: totalSoldIdx >= 0 ? num(row[totalSoldIdx]) : 0,
        returns: returnsIdx >= 0 ? num(row[returnsIdx]) : 0,
        currentStock: currentIdx >= 0 ? num(row[currentIdx]) : 0,
      };
    }
  });

  var packaging = {};
  var pkgRows = (DK_PACKAGING && dankuni[DK_PACKAGING]) || [];
  for (var pr = 1; pr < pkgRows.length; pr++) {
    var prow = pkgRows[pr] || [];
    var psku = String(prow[0] == null ? '' : prow[0]).trim();
    if (!psku) continue;
    packaging[psku] = {
      boxName: String(prow[2] || prow[1] || '').trim(),
      count: num(prow[3]),
    };
  }

  var srRows = (DK_RECEIVED && dankuni[DK_RECEIVED]) || [];
  var srDates = resolveHeaderDates(srRows[1] || [], 4);
  var dankuniInflows = {};
  for (var sr = 2; sr < srRows.length; sr++) {
    var srow = srRows[sr] || [];
    var ssku = String(srow[0] == null ? '' : srow[0]).trim();
    if (!ssku) continue;
    var openStock = num(srow[3]);
    var byDate = {};
    srDates.forEach(function (d) {
      if (!d.iso) return;
      var v = num(srow[d.col]);
      if (v !== 0) byDate[d.iso] = (byDate[d.iso] || 0) + v;
    });
    dankuniInflows[ssku] = {
      totalReceived: num(srow[2]),
      openStock: openStock,
      byDate: byDate,
    };
  }

  // Template for padding short header rows. Flipkart's header row is the reference date layout
  // the other sales tabs follow (keep it — other tabs lay dates out differently). Falls back to the
  // widest sales header only if a Flipkart tab no longer exists.
  var DK_TEMPLATE = findTab(dankuni, 'Flipkart');
  var templateHeaders = DK_TEMPLATE ? (dankuni[DK_TEMPLATE] || [])[1] || [] : [];
  if (!DK_TEMPLATE) {
    Object.keys(dkRoles).forEach(function (t) {
      if (dkRoles[t] !== 'sales') return;
      var h = (dankuni[t] || [])[1] || [];
      if (h.length > templateHeaders.length) templateHeaders = h;
    });
  }
  var dankuniOutflows = {};
  Object.keys(dankuni).forEach(function (tab) {
    if (dkRoles[tab] !== 'sales') return;
    var rows = dankuni[tab] || [];
    var rawHeaders = rows[1] || [];
    var maxCols = rawHeaders.length;
    for (var mr = 2; mr < rows.length; mr++) {
      if (rows[mr] && rows[mr].length > maxCols) maxCols = rows[mr].length;
    }
    var paddedHeaders = [];
    for (var hc = 0; hc < maxCols; hc++) {
      var cellVal = rawHeaders[hc];
      paddedHeaders.push(cellVal !== undefined && cellVal !== '' ? cellVal : (templateHeaders[hc] || ''));
    }
    var dates = resolveHeaderDates(paddedHeaders, 3);
    for (var r = 2; r < rows.length; r++) {
      var row = rows[r] || [];
      var sku = String(row[0] == null ? '' : row[0]).trim();
      if (!sku) continue;
      if (!dankuniOutflows[sku]) dankuniOutflows[sku] = { byDate: {}, byChannel: {} };
      var entry = dankuniOutflows[sku];
      var tabTotal = num(row[2]);
      var datedSum = 0;
      dates.forEach(function (d) {
        if (!d.iso) return;
        var v = num(row[d.col]);
        if (v !== 0) {
          entry.byDate[d.iso] = (entry.byDate[d.iso] || 0) + v;
          datedSum += v;
        }
      });
      var chTotal = tabTotal > 0 ? tabTotal : datedSum;
      if (chTotal > 0) entry.byChannel[tab] = (entry.byChannel[tab] || 0) + chTotal;
    }
  });

  var blkRows = (DK_BLOCK && dankuni[DK_BLOCK]) || [];
  for (var br = 2; br < blkRows.length; br++) {
    var brow = blkRows[br] || [];
    var bsku = String(brow[0] == null ? '' : brow[0]).trim();
    var bTotal = num(brow[2]);
    if (bsku && bTotal > 0) {
      if (!dankuniOutflows[bsku]) dankuniOutflows[bsku] = { byDate: {}, byChannel: {} };
      dankuniOutflows[bsku].byChannel['Block Stock'] = bTotal;
    }
  }

  var chSrRows = (CH_RECEIVED && chennai[CH_RECEIVED]) || [];
  var chSrDates = resolveHeaderDates(chSrRows[1] || [], 3);
  var chennaiInflows = {};
  for (var cr = 2; cr < chSrRows.length; cr++) {
    var crow = chSrRows[cr] || [];
    var csku = String(crow[0] == null ? '' : crow[0]).trim();
    if (!csku || csku === 'Packaging') continue;
    var cByDate = {};
    chSrDates.forEach(function (d) {
      if (!d.iso) return;
      var v = num(crow[d.col]);
      if (v !== 0) cByDate[d.iso] = (cByDate[d.iso] || 0) + v;
    });
    chennaiInflows[csku] = { totalReceived: num(crow[2]), byDate: cByDate };
  }

  // Chennai CURRENT tab: SKU | Products Name | Current Stock — the Chennai team's own stock count.
  var chennaiCurrent = {};
  var curRows = (CH_CURRENT && chennai[CH_CURRENT]) || [];
  var curHeader = curRows[0] || [];
  var curIdx = curHeader.findIndex(function (h) { return /current stock/i.test(String(h)); });
  if (curIdx < 0) curIdx = 2;
  for (var cu = 1; cu < curRows.length; cu++) {
    var curow = curRows[cu] || [];
    var cusku = String(curow[0] == null ? '' : curow[0]).trim();
    if (!cusku || /^sku$/i.test(cusku) || /^packaging/i.test(cusku)) continue;
    chennaiCurrent[cusku] = num(curow[curIdx]);
  }

  var chennaiOutflows = {};
  Object.keys(chennai).forEach(function (tab) {
    if (chRoles[tab] !== 'sales') return;
    var rows = chennai[tab] || [];
    var dates = resolveHeaderDates(rows[1] || [], 3);
    for (var r = 2; r < rows.length; r++) {
      var row = rows[r] || [];
      var sku = String(row[0] == null ? '' : row[0]).trim();
      if (!sku || sku === 'Packaging') continue;
      if (!chennaiOutflows[sku]) chennaiOutflows[sku] = { byDate: {}, byChannel: {} };
      var entry = chennaiOutflows[sku];
      var tabTotal = num(row[2]);
      var datedSum = 0;
      dates.forEach(function (d) {
        if (!d.iso) return;
        var v = num(row[d.col]);
        if (v !== 0) {
          entry.byDate[d.iso] = (entry.byDate[d.iso] || 0) + v;
          datedSum += v;
        }
      });
      var chTotal = Math.max(tabTotal, datedSum);
      if (chTotal > 0) entry.byChannel[tab] = (entry.byChannel[tab] || 0) + chTotal;
    }
  });

  var catalog = [];
  var tsRows = (DK_TOTAL && dankuni[DK_TOTAL]) || [];
  var seenSkus = {};
  for (var tr = 2; tr < tsRows.length; tr++) {
    var trow = tsRows[tr] || [];
    var rawSku = String(trow[0] == null ? '' : trow[0]).trim();
    var status = String(trow[1] == null ? '' : trow[1]).trim() || 'Active';
    var category = String(trow[2] == null ? '' : trow[2]).trim() || 'Uncategorized';
    var brand = String(trow[3] == null ? '' : trow[3]).trim() || 'Imeco';
    var name = String(trow[4] == null ? '' : trow[4]).trim();
    if (!rawSku || rawSku === 'SKU' || rawSku === 'Packaging' || !name) continue;
    var id = seenSkus[rawSku] ? rawSku + '-REC' : rawSku;
    seenSkus[rawSku] = true;
    catalog.push({
      id: id,
      sku: rawSku,
      status: status,
      category: category,
      brand: brand,
      name: name,
      dankuniNewLogoStock: num(trow[5]),
      chennaiStock: num(trow[6]),
      oldLogoStock: num(trow[7]),
      stockLevelAdj: num(trow[8]),
      upcomingStock: num(trow[9]),
      packagingCount: num(trow[10]) || (packaging[rawSku] ? packaging[rawSku].count : 0),
      packagingBoxName: packaging[rawSku] ? packaging[rawSku].boxName : '',
      material: String(trow[11] == null ? '' : trow[11]).trim(),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    catalog: catalog,
    rollups: rollups,
    dankuniInflows: dankuniInflows,
    dankuniOutflows: dankuniOutflows,
    chennaiInflows: chennaiInflows,
    chennaiOutflows: chennaiOutflows,
    chennaiCurrent: chennaiCurrent,
    meta: {
      dankuniTabs: Object.keys(dankuni),
      chennaiTabs: Object.keys(chennai),
      tabRoles: { dankuni: dkRoles, chennai: chRoles },
      missingTabs: [
        !DK_TOTAL && 'Dankuni: Total Stock',
        !DK_RECEIVED && 'Dankuni: Stock Received',
        !CH_CURRENT && 'Chennai: CURRENT',
        !CH_RECEIVED && 'Chennai: STOCK RECEIVED',
      ].filter(Boolean),
    },
  };
}


// ════════════════════════════════════════════════════════════════════════════════════════════
// Background build pipeline
// ════════════════════════════════════════════════════════════════════════════════════════════

var TICK_MINUTES = 5; // trigger cadence (Apps Script allows 1, 5, 10, 15 or 30)
var MIN_BUILD_GAP_SEC = 5 * 60; // never rebuild more often than this from the trigger
var MAX_DATA_AGE_SEC = 2 * 60 * 60; // rebuild at least this often even if nothing changed
var FORCE_BUILD_COOLDOWN_SEC = 60; // ?action=build rate limit
var CHECK_COST_SEC = 3; // reserve per tick for the change check + Supabase heartbeat
var DEFAULT_BUILD_SEC = 90; // assumed build time until the first build is measured
var CACHE_TTL_SEC = 6 * 60 * 60; // CacheService maximum
var CACHE_CHUNK = 90000; // CacheService values must be < 100 KB
var QUOTA_TZ = 'America/Los_Angeles'; // Apps Script daily quotas roll over on Pacific time

function prop(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v == null || v === '' ? fallback : v;
}

function dailyBudgetSec() {
  return Number(prop('DAILY_BUDGET_MIN', '75')) * 60;
}

// ── persisted state (one JSON script property) ──────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(prop('STOCK_STATE', '{}'));
  } catch (e) {
    return {};
  }
}

function saveState(state) {
  PropertiesService.getScriptProperties().setProperty('STOCK_STATE', JSON.stringify(state));
}

function quotaDay(date) {
  return Utilities.formatDate(date || new Date(), QUOTA_TZ, 'yyyy-MM-dd');
}

/** Seconds until the quota day rolls over (midnight Pacific). */
function secondsLeftInQuotaDay() {
  var now = new Date();
  var h = Number(Utilities.formatDate(now, QUOTA_TZ, 'H'));
  var m = Number(Utilities.formatDate(now, QUOTA_TZ, 'm'));
  var sec = Number(Utilities.formatDate(now, QUOTA_TZ, 's'));
  return Math.max(60, 86400 - (h * 3600 + m * 60 + sec));
}

/** Add this trigger run's seconds to today's usage. */
function recordTriggerRuntime(state, seconds) {
  var day = quotaDay();
  if (state.usageDay !== day) {
    state.usageDay = day;
    state.usedSec = 0;
    state.buildsToday = 0;
  }
  state.usedSec = Math.round(((state.usedSec || 0) + seconds) * 10) / 10;
}

// ── change detection ────────────────────────────────────────────────────────────────────────

/** Latest modified time (ms) across both workbooks, or null if the Drive API isn't enabled. */
function sourceModifiedMs() {
  if (typeof Drive === 'undefined' || !Drive.Files) return null;
  var latest = 0;
  [DANKUNI_SPREADSHEET_ID, CHENNAI_SPREADSHEET_ID].forEach(function (id) {
    var f;
    try {
      f = Drive.Files.get(id, { fields: 'modifiedTime', supportsAllDrives: true }); // Drive v3
    } catch (e) {
      f = Drive.Files.get(id, { supportsAllDrives: true }); // Drive v2
    }
    var t = Date.parse(f.modifiedTime || f.modifiedDate || '');
    if (t > latest) latest = t;
  });
  return latest || null;
}

// ── storage: CacheService (instant doGet) ───────────────────────────────────────────────────

function cachePut(payload) {
  var blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(payload), 'application/json'));
  var b64 = Utilities.base64Encode(blob.getBytes());
  var cache = CacheService.getScriptCache();
  var parts = {};
  var n = Math.ceil(b64.length / CACHE_CHUNK);
  for (var i = 0; i < n; i++) parts['stock:p:' + i] = b64.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK);
  parts['stock:p:n'] = String(n);
  cache.putAll(parts, CACHE_TTL_SEC);
}

function cacheGet() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('stock:p:n'));
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push('stock:p:' + i);
  var got = cache.getAll(keys);
  var b64 = '';
  for (var k = 0; k < n; k++) {
    if (got[keys[k]] == null) return null;
    b64 += got[keys[k]];
  }
  var bytes = Utilities.base64Decode(b64);
  var json = Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString();
  return JSON.parse(json);
}

// ── storage: Supabase (dashboard reads from here) ───────────────────────────────────────────

function supabaseConfigured() {
  return Boolean(prop('SUPABASE_URL', '') && prop('SUPABASE_KEY', '') && prop('STOCK_INGEST_SECRET', ''));
}

function supabaseRpc(fn, body) {
  var url = prop('SUPABASE_URL', '').replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
  var key = prop('SUPABASE_KEY', '');
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase ' + fn + ' ' + code + ': ' + res.getContentText().slice(0, 200));
}

function publishToSupabase(payload, sourceMs) {
  if (!supabaseConfigured()) return 'skipped (not configured)';
  supabaseRpc('ingest_stock_snapshot', {
    p_secret: prop('STOCK_INGEST_SECRET', ''),
    p_payload: payload,
    p_built_at: payload.generatedAt,
    p_source_updated_at: sourceMs ? new Date(sourceMs).toISOString() : null,
    p_build_ms: payload.meta && payload.meta.timings ? payload.meta.timings.totalMs : null,
    p_engine: payload.meta ? String(payload.meta.engine || '') : null,
  });
  return 'ok';
}

/** Cheap heartbeat so the dashboard knows the sheets were checked even when nothing changed. */
function heartbeatSupabase(status) {
  if (!supabaseConfigured()) return;
  try {
    supabaseRpc('touch_stock_snapshot', {
      p_secret: prop('STOCK_INGEST_SECRET', ''),
      p_checked_at: new Date().toISOString(),
      p_status: status,
    });
  } catch (e) {
    // A missed heartbeat is harmless; the next tick retries.
  }
}

// ── build + publish (shared by trigger, forced build and cache miss) ────────────────────────

function buildAndPublish(state, engine, sourceMs) {
  var t0 = Date.now();
  var payload = buildPayload(engine);
  var buildSec = (Date.now() - t0) / 1000;
  try {
    cachePut(payload);
  } catch (e) {
    state.lastCacheError = String(e).slice(0, 200);
  }
  try {
    state.lastPublish = publishToSupabase(payload, sourceMs);
    state.lastPublishError = null;
  } catch (e) {
    state.lastPublishError = String(e).slice(0, 300);
  }
  state.lastBuildAt = Date.now();
  state.lastBuildSec = Math.round(buildSec * 10) / 10;
  state.avgBuildSec = state.avgBuildSec
    ? Math.round((state.avgBuildSec * 0.7 + buildSec * 0.3) * 10) / 10
    : state.lastBuildSec;
  state.builtSourceMs = sourceMs || state.builtSourceMs || null;
  state.lastEngine = payload.meta.engine;
  state.lastTimings = payload.meta.timings;
  return payload;
}

// ── time trigger ────────────────────────────────────────────────────────────────────────────

/**
 * Runs every TICK_MINUTES. Rebuilds only when a workbook changed (or the data is older than
 * MAX_DATA_AGE_SEC), and only if the remaining daily trigger budget can afford it — the gap
 * between builds widens automatically as the budget runs down, so the quota is never hit.
 */
function scheduledTick() {
  var started = Date.now();
  var state = loadState();
  recordTriggerRuntime(state, 0); // roll the day over if needed
  var decision = 'skip';
  try {
    var sourceMs = null;
    try {
      sourceMs = sourceModifiedMs();
    } catch (e) {
      state.lastChangeCheckError = String(e).slice(0, 200);
    }
    var now = Date.now();
    var ageSec = state.lastBuildAt ? (now - state.lastBuildAt) / 1000 : Infinity;
    var changed = sourceMs === null ? ageSec >= 15 * 60 : sourceMs > (state.builtSourceMs || 0);
    var due = changed || ageSec >= MAX_DATA_AGE_SEC;

    if (!due) {
      decision = 'skip: no sheet changes';
    } else {
      var avg = state.avgBuildSec || DEFAULT_BUILD_SEC;
      var secsLeft = secondsLeftInQuotaDay();
      var checksReserve = (secsLeft / (TICK_MINUTES * 60)) * CHECK_COST_SEC;
      var spendable = dailyBudgetSec() - (state.usedSec || 0) - checksReserve;
      if (spendable < avg * 1.2) {
        decision = 'skip: daily trigger budget nearly used';
      } else {
        var affordable = Math.max(1, Math.floor(spendable / avg));
        var requiredGap = Math.max(MIN_BUILD_GAP_SEC, secsLeft / affordable);
        if (ageSec < requiredGap) {
          decision = 'skip: pacing (next build in ~' + Math.ceil((requiredGap - ageSec) / 60) + ' min)';
        } else {
          var lock = LockService.getScriptLock();
          if (!lock.tryLock(0)) {
            decision = 'skip: another build is running';
          } else {
            try {
              buildAndPublish(state, 'fast', sourceMs);
              state.buildsToday = (state.buildsToday || 0) + 1;
              decision = 'built';
            } finally {
              lock.releaseLock();
            }
          }
        }
      }
    }
    if (decision !== 'built') heartbeatSupabase(decision);
  } catch (err) {
    decision = 'error: ' + String(err).slice(0, 200);
    state.lastError = decision;
  } finally {
    state.lastTickAt = Date.now();
    state.lastDecision = decision;
    recordTriggerRuntime(state, (Date.now() - started) / 1000);
    saveState(state);
  }
}

/** Run once from the editor: (re)installs the 5-minute trigger and does the first build. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledTick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledTick').timeBased().everyMinutes(TICK_MINUTES).create();
  var state = loadState();
  var sourceMs = null;
  try {
    sourceMs = sourceModifiedMs();
  } catch (e) {
    state.lastChangeCheckError = String(e).slice(0, 200);
  }
  buildAndPublish(state, 'fast', sourceMs);
  saveState(state);
  Logger.log(JSON.stringify(statusReport(state), null, 2));
}

/** Run from the editor to stop background builds. */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledTick') ScriptApp.deleteTrigger(t);
  });
}

// ── web app ─────────────────────────────────────────────────────────────────────────────────

function statusReport(state) {
  return {
    now: new Date().toISOString(),
    lastBuildAt: state.lastBuildAt ? new Date(state.lastBuildAt).toISOString() : null,
    lastBuildSec: state.lastBuildSec || null,
    avgBuildSec: state.avgBuildSec || null,
    lastEngine: state.lastEngine || null,
    lastTimings: state.lastTimings || null,
    lastTickAt: state.lastTickAt ? new Date(state.lastTickAt).toISOString() : null,
    lastDecision: state.lastDecision || null,
    sheetsModifiedAt: state.builtSourceMs ? new Date(state.builtSourceMs).toISOString() : null,
    budget: {
      quotaDay: state.usageDay || null,
      usedMin: Math.round(((state.usedSec || 0) / 60) * 10) / 10,
      budgetMin: dailyBudgetSec() / 60,
      buildsToday: state.buildsToday || 0,
    },
    fastReader: Boolean(fastReaderAvailable()),
    changeDetection: typeof Drive !== 'undefined',
    supabase: supabaseConfigured(),
    lastPublish: state.lastPublish || null,
    lastPublishError: state.lastPublishError || null,
    lastCacheError: state.lastCacheError || null,
    lastChangeCheckError: state.lastChangeCheckError || null,
    lastError: state.lastError || null,
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var state = loadState();

  if (params.action === 'status') return json(statusReport(state));

  // Side-by-side comparison build; not cached or published.
  if (params.engine === 'legacy' || params.engine === 'fast') return json(buildPayload(params.engine));

  var force = params.action === 'build';
  if (!force) {
    try {
      var cached = cacheGet();
      if (cached) return json(cached);
    } catch (err) {
      state.lastCacheError = String(err).slice(0, 200);
    }
  }

  // Forced build (rate-limited) or cache miss: build now, then serve and publish it.
  if (force && state.lastBuildAt && (Date.now() - state.lastBuildAt) / 1000 < FORCE_BUILD_COOLDOWN_SEC) {
    var recent = cacheGet();
    if (recent) return json(recent);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(5 * 60 * 1000); // if a build is already running, wait for it and reuse it
  try {
    state = loadState();
    if (!force && state.lastBuildAt && Date.now() - state.lastBuildAt < 60 * 1000) {
      var fresh = cacheGet();
      if (fresh) return json(fresh);
    }
    var sourceMs = null;
    try {
      sourceMs = sourceModifiedMs();
    } catch (err) {
      state.lastChangeCheckError = String(err).slice(0, 200);
    }
    var payload = buildAndPublish(state, 'fast', sourceMs);
    saveState(state);
    return json(payload);
  } finally {
    lock.releaseLock();
  }
}
