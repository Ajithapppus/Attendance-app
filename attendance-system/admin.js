let DATA = { records: [], employees: [], today: "" };
let passcode = sessionStorage.getItem("pc") || "";

const showMsg = (el, text, ok) => { el.hidden = false; el.className = "msg " + (ok ? "ok" : "err"); el.innerHTML = text; };

async function load() {
  try {
    const r = await api({ action: "list", passcode });
    if (!r.success) { sessionStorage.removeItem("pc"); $("app").hidden = true; $("login").hidden = false;
      return showMsg($("loginMsg"), esc(r.message || "Could not load data."), false); }
    DATA = r; $("login").hidden = true; $("app").hidden = false; render();
  } catch (e) { $("login").hidden = false; showMsg($("loginMsg"), esc(friendly(e.code)), false); }
}

function stats() {
  const byCode = {};
  DATA.records.forEach((r) => { (byCode[r.code] = byCode[r.code] || []).push(r); });
  return Object.entries(byCode).map(([code, rows]) => {
    const todayRows = rows.filter((r) => r.date === DATA.today), last = rows[rows.length - 1];
    return { code, name: last.name, today: todayRows.length ? todayRows[todayRows.length - 1].type : "Not marked",
      days: new Set(rows.map((r) => r.date)).size, records: rows.length, last: `${last.date} ${last.time}` };
  });
}

function render() {
  const s = stats(), todayRecs = DATA.records.filter((r) => r.date === DATA.today);
  const cards = [["Total employees", DATA.employees.length], ["Present today", s.filter((x) => x.today !== "Not marked").length],
    ["Checked in", s.filter((x) => x.today === "Check In").length], ["Checked out", s.filter((x) => x.today === "Check Out").length],
    ["Total records", DATA.records.length], ["Today's records", todayRecs.length]];
  $("cards").innerHTML = cards.map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("work").tBodies[0].innerHTML = s.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.code)}</td><td>${esc(x.today)}</td><td>${x.days}</td><td>${x.records}</td><td>${esc(x.last)}</td></tr>`).join("") || `<tr><td colspan="6">No attendance yet.</td></tr>`;
  const cur = $("fEmp").value;
  $("fEmp").innerHTML = `<option value="">All employees</option>` + DATA.employees.map((e) => `<option value="${esc(e.code)}">${esc(e.name)} (${esc(e.code)})</option>`).join("");
  $("fEmp").value = cur;
  renderLog();
}

function filtered() {
  const q = $("q").value.toLowerCase(), emp = $("fEmp").value, type = $("fType").value;
  const [y, m, d] = $("fDate").value ? $("fDate").value.split("-") : [];
  const date = y ? `${d}/${m}/${y}` : "";
  return DATA.records.filter((r) => (!q || (r.name + r.code).toLowerCase().includes(q)) && (!emp || r.code === emp) && (!type || r.type === type) && (!date || r.date === date)).reverse();
}

function renderLog() {
  $("log").tBodies[0].innerHTML = filtered().map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.type)}</td><td>${esc(r.source)}</td><td>${esc(r.status)}</td></tr>`).join("") || `<tr><td colspan="7">No matching records.</td></tr>`;
}

function exportCsv() {
  const cell = (v) => { v = String(v ?? ""); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const rows = [["Employee Name", "Employee Code", "Date", "Time", "Attendance Type", "Website Source", "Status"]]
    .concat(filtered().map((r) => [r.name, r.code, r.date, r.time, r.type, r.source, r.status]));
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `attendance-${Date.now()}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

async function testConnection() {
  const el = $("testResult");
  try {
    const r = await api();
    if (r.success) showMsg(el, "✓ Google Sheet Connected", true);
    else showMsg(el, "✗ Google Sheet Connection Failed<br>The server replied, but not as expected. Check the Apps Script code.", false);
  } catch (e) {
    const tips = e.code === "NOURL" ? "Set GOOGLE_SCRIPT_URL in script.js to your Web App URL (ending in /exec)."
      : "Redeploy the Web App with access set to “Anyone”, then use the newest /exec URL. Check Apps Script → Executions for errors.";
    showMsg(el, `✗ Google Sheet Connection Failed<br>${esc(tips)}`, false);
  }
}

$("loginForm").addEventListener("submit", (e) => { e.preventDefault(); passcode = $("pass").value; sessionStorage.setItem("pc", passcode); load(); });
$("refresh").onclick = load; $("test").onclick = testConnection; $("export").onclick = exportCsv;
$("logout").onclick = () => { sessionStorage.removeItem("pc"); location.reload(); };
["q", "fEmp", "fDate", "fType"].forEach((id) => $(id).addEventListener("input", renderLog));
if (passcode) load();
