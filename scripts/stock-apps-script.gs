/**
 * IMECO Mission Control — Stock Sheets Proxy (Google Apps Script)
 *
 * Reads the private Dankuni & Chennai stock workbooks using your Google account's
 * Viewer access and returns the compact StockRawPayload JSON to imeco-hub.
 *
 * SETUP (2 minutes, zero changes required from the sheet maintainer):
 *   1. Open https://script.google.com while signed in as the Google account that has
 *      Viewer access to both sheets (e.g. nimaibarman4978@gmail.com).
 *   2. Click "New project", name it "IMECO Stock Proxy", and paste this entire file
 *      into `Code.gs`.
 *   3. Click "Deploy" -> "New deployment":
 *        - Select type: "Web app"
 *        - Execute as: "Me"
 *        - Who has access: "Anyone"
 *   4. Authorize the script when prompted, then copy the "Web app URL"
 *      (looks like `https://script.google.com/macros/s/AKfycb.../exec`).
 *   5. Set `VITE_STOCK_APPS_SCRIPT_URL="<your Web app URL>"` in `imeco-hub/.env`
 *      and in your Vercel project environment variables.
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
  if (cell instanceof Date && !isNaN(cell.getTime())) {
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

function buildPayload() {
  var dankuniBook = SpreadsheetApp.openById(DANKUNI_SPREADSHEET_ID);
  var chennaiBook = SpreadsheetApp.openById(CHENNAI_SPREADSHEET_ID);

  var dankuni = {};
  dankuniBook.getSheets().forEach(function (s) {
    dankuni[s.getName()] = s.getDataRange().getValues();
  });

  var chennai = {};
  chennaiBook.getSheets().forEach(function (s) {
    chennai[s.getName()] = s.getDataRange().getValues();
  });

  var rollups = {};
  ['IMECO', 'DENCRUS'].forEach(function (tabName) {
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
  var pkgRows = dankuni['Packaging Count'] || [];
  for (var pr = 1; pr < pkgRows.length; pr++) {
    var prow = pkgRows[pr] || [];
    var psku = String(prow[0] == null ? '' : prow[0]).trim();
    if (!psku) continue;
    packaging[psku] = {
      boxName: String(prow[2] || prow[1] || '').trim(),
      count: num(prow[3]),
    };
  }

  var srRows = dankuni['Stock Received'] || [];
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

  var skipDankuni = {
    'IMECO': true, 'DENCRUS': true, 'Total Stock': true,
    'Stock Received': true, 'Packaging Count': true, 'SHAVECO': true, 'Block Stock': true,
  };
  var dankuniOutflows = {};
  Object.keys(dankuni).forEach(function (tab) {
    if (skipDankuni[tab]) return;
    var rows = dankuni[tab] || [];
    var dates = resolveHeaderDates(rows[1] || [], 3);
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
      var chTotal = Math.max(tabTotal, datedSum);
      if (chTotal > 0) entry.byChannel[tab] = (entry.byChannel[tab] || 0) + chTotal;
    }
  });

  var blkRows = dankuni['Block Stock'] || [];
  for (var br = 2; br < blkRows.length; br++) {
    var brow = blkRows[br] || [];
    var bsku = String(brow[0] == null ? '' : brow[0]).trim();
    var bTotal = num(brow[2]);
    if (bsku && bTotal > 0) {
      if (!dankuniOutflows[bsku]) dankuniOutflows[bsku] = { byDate: {}, byChannel: {} };
      dankuniOutflows[bsku].byChannel['Block Stock'] = bTotal;
    }
  }

  var chSrRows = chennai['STOCK RECEIVED'] || [];
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

  var skipChennai = { 'IMECO': true, 'CURRENT': true, 'STOCK RECEIVED': true };
  var chennaiOutflows = {};
  Object.keys(chennai).forEach(function (tab) {
    if (skipChennai[tab]) return;
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
  var tsRows = dankuni['Total Stock'] || [];
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
  };
}

function doGet() {
  var payload = buildPayload();
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
