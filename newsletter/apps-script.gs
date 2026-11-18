// bubblewrap newsletter signups → this Google Sheet.
//
// The site is static, so this Apps Script is the only "backend": the footer form
// POSTs { email, website, page } here and each new email becomes a row.
// Chosen over Substack (no public endpoint, so readers had to confirm on Substack's
// page), Formspark (a third party holding the list) and Supabase (a database for
// one column). The list is a sheet you own and can export as CSV.
//
// Setup: see "Newsletter" in the README. Paste this whole file into the sheet's
// Extensions > Apps Script, then Deploy > New deployment > Web app,
// Execute as: Me, Who has access: Anyone.

const SHEET_NAME = "signups";
const HEADERS = ["signed up", "email", "page"];
// Same shape check the browser's type="email" uses, roughly; real validity is the inbox's call.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  const p = (e && e.parameter) || {};
  // Honeypot: people never see the "website" field, so anything in it is a bot.
  if (p.website) return reply("ok");

  const email = String(p.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return reply("invalid email");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // two signups at once shouldn't both pass the duplicate check
  try {
    const sheet = getSheet();
    const last = sheet.getLastRow();
    const existing = last > 1 ? sheet.getRange(2, 2, last - 1, 1).getValues().flat() : [];
    if (existing.indexOf(email) === -1) {
      sheet.appendRow([new Date(), email, String(p.page || "").slice(0, 200)]);
    }
  } finally {
    lock.releaseLock();
  }
  return reply("ok");
}

// Opening the web app URL in a browser shows this, so you can tell the deploy worked.
function doGet() {
  return reply("bubblewrap signups are open");
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
