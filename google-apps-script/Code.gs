/** Google Apps Script backend — paste into Extensions → Apps Script of your Google Sheet. */
const ATT = "Attendance", EMP = "Employees";
const HEADERS = ["Attendance ID", "Employee Name", "Employee Code", "Date", "Time", "Timestamp", "Attendance Type", "Website Source", "IP/Session Info", "Status"];

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); s.setFrozenRows(1); }
  return s;
}

/** Run once from the editor: creates both sheets and a sample employee. */
function setup() {
  sheet_(ATT, HEADERS).getRange("D:F").setNumberFormat("@");
  const e = sheet_(EMP, ["Employee Code", "Employee Name", "Active"]);
  if (e.getLastRow() < 2) e.appendRow(["EMP001", "Ajith", "Yes"]);
}

function doGet() { return json_({ success: true, message: "Attendance API is running" }); }

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || "{}");
    return json_(d.action === "list" ? list_(d) : mark_(d));
  } catch (err) {
    console.error(err);
    return json_({ success: false, code: "SHEET", message: "Unable to record attendance" });
  }
}

function mark_(d) {
  const name = String(d.name || "").trim(), code = String(d.code || "").trim().toUpperCase(), type = d.type;
  const bad = { success: false, code: "INVALID", message: "Invalid employee name or employee code." };
  if (!name || !code || name.length > 80 || code.length > 30 || ["Check In", "Check Out"].indexOf(type) < 0) return bad;

  const emp = sheet_(EMP, ["Employee Code", "Employee Name", "Active"]).getDataRange().getValues().slice(1).find((r) =>
    String(r[0]).trim().toUpperCase() === code && String(r[1]).trim().toLowerCase() === name.toLowerCase() && String(r[2]).toLowerCase() !== "no");
  if (!emp) return bad;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = sheet_(ATT, HEADERS), tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), now = new Date();
    const date = Utilities.formatDate(now, tz, "dd/MM/yyyy"), time = Utilities.formatDate(now, tz, "HH:mm:ss");
    const rows = s.getDataRange().getValues().slice(1);
    const today = rows.filter((r) => String(r[2]).toUpperCase() === code && String(r[3]) === date);
    const last = today[today.length - 1];
    // Set Script property ALLOW_MULTIPLE = true to let admins permit repeated entries.
    const multi = PropertiesService.getScriptProperties().getProperty("ALLOW_MULTIPLE") === "true";
    if (!multi) {
      if (last && last[6] === type) return { success: false, code: "DUPLICATE", message: "Employee has already " + (type === "Check In" ? "checked in" : "checked out") + " today." };
      if (!last && type === "Check Out") return { success: false, code: "NO_CHECKIN", message: "Please check in before checking out." };
    }
    const id = "ATT-" + String(rows.length + 1).padStart(5, "0");
    const info = [d.sessionId, d.origin, d.pageUrl, String(d.userAgent || "").slice(0, 120)].join(" | ").slice(0, 400);
    const row = [id, emp[1], code, date, time, date + " " + time, type, String(d.source || "Attendance Website").slice(0, 80), info, type === "Check In" ? "Present" : "Checked Out"];
    s.getRange(s.getLastRow() + 1, 1, 1, row.length).setNumberFormat("@").setValues([row]);
    return { success: true, message: "Attendance recorded successfully", attendanceId: id, employee: emp[1], code: code, date: date, time: time, type: type };
  } finally { lock.releaseLock(); }
}

/** Admin read. Passcode lives in Project Settings → Script properties as ADMIN_PASSCODE. */
function list_(d) {
  const pc = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSCODE");
  if (!pc) return { success: false, message: "Admin passcode is not set in Script properties." };
  if (String(d.passcode || "") !== pc) return { success: false, message: "Incorrect passcode." };
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const records = sheet_(ATT, HEADERS).getDataRange().getValues().slice(1).map((r) => ({ id: r[0], name: r[1], code: String(r[2]), date: String(r[3]), time: String(r[4]), type: r[6], source: r[7], status: r[9] }));
  const employees = sheet_(EMP, ["Employee Code", "Employee Name", "Active"]).getDataRange().getValues().slice(1).filter((r) => r[0] && String(r[2]).toLowerCase() !== "no").map((r) => ({ code: String(r[0]).toUpperCase(), name: r[1] }));
  return { success: true, records: records, employees: employees, today: Utilities.formatDate(new Date(), tz, "dd/MM/yyyy") };
}
