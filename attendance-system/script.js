/* ===== CONFIG: paste your Apps Script Web App URL below ===== */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxI1iSY8vKqaXQ6WKQPE_cfGEG8pwH6wZZFVQGYdc_sEgohrqjSA9ayEgOqgYYEZToG/exec";   // e.g. https://script.google.com/macros/s/XXXX/exec
const DEBUG_MODE = false;       // true = show technical details on screen
const WEBSITE_SOURCE = "Attendance Website";
/* ============================================================ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function dbg(label, value) {
  if (!DEBUG_MODE || !$("debug")) return;
  $("debug").hidden = false;
  $("debug").textContent += `[${new Date().toLocaleTimeString()}] ${label}: ${value}\n`;
}

const MESSAGES = {
  NOURL: "Attendance server URL is not configured or is unavailable.",
  NETWORK: "Unable to connect to attendance server. Please check the Apps Script deployment.",
  SHEET: "Attendance server connected, but the Google Sheet could not be updated.",
  INVALID: "Invalid employee name or employee code.",
  DUPLICATE: "Attendance already recorded for this employee today.",
};
const friendly = (code, fallback) => MESSAGES[code] || fallback || MESSAGES.NETWORK;

/* Sends GET (no payload) or POST (JSON as text/plain, which avoids a CORS preflight). */
async function api(payload) {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("YOUR_")) throw { code: "NOURL" };
  dbg("API URL", GOOGLE_SCRIPT_URL);
  let res;
  try {
    res = await fetch(GOOGLE_SCRIPT_URL, payload
      ? { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }
      : { method: "GET" });
  } catch (e) { dbg("Request", "failed: " + e.message); throw { code: "NETWORK" }; }
  dbg("Response status", res.status);
  if (res.status === 404) throw { code: "NOURL" };
  let data;
  try { data = await res.json(); } catch (e) { throw { code: "NETWORK" }; }
  dbg("Apps Script response", JSON.stringify(data));
  return data;
}

/* ---- Attendance page ---- */
if ($("form")) {
  const sessionId = sessionStorage.sid || (sessionStorage.sid = "S" + Math.random().toString(36).slice(2, 10));

  // Display-only clock. The recorded time always comes from the server.
  const tick = () => {
    const d = new Date();
    $("date").textContent = d.toLocaleDateString("en-GB");
    $("clock").textContent = d.toLocaleTimeString("en-US");
  };
  tick(); setInterval(tick, 1000);

  const setStatus = (ok) => {
    $("dot").className = "dot " + (ok ? "on" : "off");
    $("conn").textContent = ok ? "Connected to attendance server" : "Not connected";
  };
  api().then((d) => { setStatus(!!d.success); dbg("Sheet connection", d.success ? "OK" : "failed"); }).catch(() => setStatus(false));

  const show = (text, ok) => { const m = $("msg"); m.hidden = false; m.className = "msg " + (ok ? "ok" : "err"); m.textContent = text; };

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("receipt").hidden = true;
    const name = $("name").value.trim(), code = $("code").value.trim().toUpperCase();
    if (!name || !code) return show(MESSAGES.INVALID, false);
    $("btn").disabled = true; $("btn").textContent = "Recording…";
    try {
      const r = await api({
        name, code, type: $("type").value, source: WEBSITE_SOURCE,
        pageUrl: location.href, origin: location.origin, userAgent: navigator.userAgent, sessionId,
      });
      if (r.success) {
        show("Attendance recorded successfully.", true);
        $("receipt").hidden = false;
        $("receipt").innerHTML = `<dt>Employee</dt><dd>${esc(r.employee)}</dd><dt>Code</dt><dd>${esc(r.code)}</dd><dt>Date</dt><dd>${esc(r.date)}</dd><dt>Time</dt><dd>${esc(r.time)}</dd><dt>Status</dt><dd>${esc(r.type)}</dd><dt>Reference</dt><dd>${esc(r.attendanceId)}</dd>`;
        $("form").reset();
      } else show(friendly(r.code, r.message), false);
    } catch (err) { show(friendly(err.code), false); }
    $("btn").disabled = false; $("btn").textContent = "Mark attendance";
  });
}
