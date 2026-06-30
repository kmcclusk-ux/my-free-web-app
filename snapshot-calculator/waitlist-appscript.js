const WAITLIST_SHEET_NAME = "Snapshot Calculator Waitlist";

function doPost(event) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateWaitlistSheet_(spreadsheet);
  const payload = parsePayload_(event);

  sheet.appendRow([
    new Date(),
    payload.email || "",
    payload.source || "",
    payload.pageUrl || "",
    payload.userAgent || "",
    payload.submittedAt || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateWaitlistSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(WAITLIST_SHEET_NAME) || spreadsheet.insertSheet(WAITLIST_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Received At", "Email", "Source", "Page URL", "User Agent", "Client Submitted At"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function parsePayload_(event) {
  try {
    return JSON.parse((event && event.postData && event.postData.contents) || "{}");
  } catch (error) {
    return {};
  }
}
