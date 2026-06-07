/**
 * Profit Calculator — Google Sheets sync
 *
 * Setup:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this file, Save
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL into the calculator settings
 */

var HEADERS = [
  "Entry ID",
  "Coin name",
  "Invested amount",
  "Entry price",
  "Target price",
  "Profit/loss",
  "Percentage",
  "Total value at target",
  "Status",
  "Closing date",
  "Profit/loss at closing"
];

function doGet() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse({ ok: true, rows: [] });
    }
    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var rows = data.map(function (row) {
      return {
        entryId: String(row[0] || ""),
        coinName: String(row[1] || ""),
        invested: parseNum(row[2]),
        entryPrice: parseNum(row[3]),
        targetPrice: parseNum(row[4]),
        profitLoss: parseNum(row[5]),
        percentage: parseNum(row[6]),
        totalAtTarget: parseNum(row[7]),
        status: String(row[8] || "open"),
        closingDate: row[9] ? String(row[9]) : "",
        closingProfitLoss: parseNum(row[10])
      };
    }).filter(function (r) { return r.entryId; });
    return jsonResponse({ ok: true, rows: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}

function parseNum(val) {
  if (val === "" || val == null) return null;
  var n = Number(val);
  return isNaN(n) ? null : n;
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    setupHeaders(sheet);

    if (data.action === "delete") {
      deleteRow(sheet, data.entryId);
      return jsonResponse({ ok: true });
    }

    var row = buildRow(data);
    var rowIndex = findRowIndex(sheet, data.entryId);

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}

function setupHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  var first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (first[0] !== HEADERS[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function findRowIndex(sheet, entryId) {
  if (!entryId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(entryId)) {
      return i + 2;
    }
  }
  return -1;
}

function deleteRow(sheet, entryId) {
  var rowIndex = findRowIndex(sheet, entryId);
  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex);
  }
}

function buildRow(data) {
  return [
    data.entryId || "",
    data.coinName || "",
    data.invested != null ? data.invested : "",
    data.entryPrice != null ? data.entryPrice : "",
    data.targetPrice != null ? data.targetPrice : "",
    data.profitLoss != null ? data.profitLoss : "",
    data.percentage != null ? data.percentage : "",
    data.totalAtTarget != null ? data.totalAtTarget : "",
    data.status || "open",
    data.closingDate || "",
    data.closingProfitLoss != null ? data.closingProfitLoss : ""
  ];
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
