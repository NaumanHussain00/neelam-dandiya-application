const CONFIG = { GOOGLE_SCRIPT_URL: "" };
const STORAGE_KEY = "neelam_dandiya_leads_v1", STATS_KEY = "neelam_dandiya_stats_v1";
let state = { lead: null, questions: [], index: 0, score: 0, locked: false, timerId: null, timeLeft: 30 };
let adminAuthToken = null;
let adminFetchedLeads = [];

const $ = id => document.getElementById(id);
const screens = ["home", "quiz", "result", "admin"];

function clearQuestionTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimerText() {
  if (!$("feedback")) return;
  $("feedback").textContent = `Time left: ${state.timeLeft}s`;
}

function handleQuestionTimeout() {
  if (state.locked) return;
  state.locked = true;
  const q = state.questions[state.index];
  const buttons = [...document.querySelectorAll(".answer")];
  buttons.forEach(b => b.classList.add("disabled"));
  const correctButton = buttons.find(b => b.textContent === q.answer);
  correctButton?.classList.add("correct");
  $("feedback").textContent = `Time's up! Correct answer: ${q.answer}`;
  updateLead({ score: state.score, result: "lost", status: "completed" });
  setTimeout(() => finish(false), 1000);
}

function startQuestionTimer() {
  clearQuestionTimer();
  state.timeLeft = 30;
  updateTimerText();
  state.timerId = setInterval(() => {
    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateTimerText();
      clearQuestionTimer();
      handleQuestionTimeout();
      return;
    }
    updateTimerText();
  }, 1000);
}

function show(id) {
  if (id !== "quiz") clearQuestionTimer();
  screens.forEach(s => $(s).classList.toggle("active", s === id));
  window.scrollTo(0, 0);
}

function getLeads() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveLeads(a) { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); }
function getStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{"played":0,"wins":0}'); } catch { return { played: 0, wins: 0 }; }
}
function saveStats(s) { localStorage.setItem(STATS_KEY, JSON.stringify(s)); }

function pickQuestions(bank, n) {
  const a = [...bank];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function phoneValid(p) { return /^[6-9]\d{9}$/.test(p); }
function nameValid(n) { return /^[A-Za-z\s]+$/.test(n); }

$("registrationForm").addEventListener("submit", e => {
  e.preventDefault();
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const course = $("course").value;
  const phone = $("phone").value.replace(/\D/g, "");
  const name = $("name").value.trim();

  if (!name || !nameValid(name)) {
    $("formError").textContent = "Please enter a valid name containing only letters and spaces.";
    return;
  }
  if (!role || !course || !phoneValid(phone)) {
    $("formError").textContent = "Please select your role, course and enter a valid 10-digit Indian mobile number.";
    return;
  }

  const lead = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + "",
    name, role, course, phone,
    registeredAt: new Date().toISOString(),
    status: "pending", score: 0, result: "started"
  };

  const leads = getLeads();
  leads.push(lead);
  saveLeads(leads);

  state = { lead, questions: pickQuestions(QUESTION_BANK.categories[course], 3), index: 0, score: 0, locked: false, timerId: null, timeLeft: 30 };
  renderQuestion();
  show("quiz");
});

function renderQuestion() {
  const q = state.questions[state.index];
  $("categoryPill").textContent = state.lead.course.toUpperCase();
  $("qNumber").textContent = `QUESTION ${state.index + 1}`;
  $("questionCount").textContent = `${state.index + 1} / 3`;
  $("progressBar").style.width = ((state.index + 1) / 3 * 100) + "%";
  $("questionText").textContent = q.question;
  $("feedback").textContent = "";

  const box = $("answers");
  box.innerHTML = "";
  q.options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "answer";
    b.type = "button";
    b.textContent = opt;
    b.onclick = () => answer(b, opt, q);
    box.appendChild(b);
  });

  startQuestionTimer();
}

function updateLead(patch) {
  const a = getLeads(), i = a.findIndex(x => x.id === state.lead.id);
  if (i >= 0) {
    a[i] = { ...a[i], ...patch };
    saveLeads(a);
    state.lead = a[i];
  }
}

function answer(btn, opt, q) {
  if (state.locked) return;
  clearQuestionTimer();
  state.locked = true;
  document.querySelectorAll(".answer").forEach(b => b.classList.add("disabled"));
  const ok = opt === q.answer;
  btn.classList.add(ok ? "correct" : "wrong");

  if (!ok) {
    const correctButton = [...document.querySelectorAll(".answer")].find(b => b.textContent === q.answer);
    correctButton?.classList.add("correct");
    $("feedback").textContent = `✕ Incorrect! Correct answer: ${q.answer}`;
    updateLead({ score: state.score, result: "lost", status: "completed" });
    setTimeout(() => finish(false), 1000);
    return;
  }

  state.score++;
  $("feedback").textContent = "✓ Correct!";

  if (state.index === 2) {
    updateLead({ score: 3, result: "won", status: "completed" });
    setTimeout(() => finish(true), 750);
  } else {
    state.index++;
    setTimeout(() => { state.locked = false; renderQuestion(); }, 850);
  }
}

function finish(win) {
  const s = getStats();
  s.played++;
  if (win) s.wins++;
  saveStats(s);

  $("resultIcon").textContent = win ? "🏆" : "💫";
  $("resultEyebrow").textContent = win ? "CONGRATULATIONS" : "KEEP TRYING";
  $("resultTitle").textContent = win ? "YOU WON!" : "YOU HAVE LOST";
  $("resultMessage").textContent = win
    ? "Amazing! You answered all 3 questions correctly. Please show this screen to the Neelam event team to claim your prize."
    : "You have lost, try next time. You can play again and test your career knowledge.";

  $("resultActions").innerHTML = "";
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = win ? "PLAY AGAIN" : "TRY AGAIN";
  b.onclick = () => { $("registrationForm").reset(); show("home"); };
  $("resultActions").appendChild(b);

  if (win && CONFIG.GOOGLE_SCRIPT_URL) syncPending();
  show("result");
}

$("quitBtn").onclick = () => { if (confirm("Exit this challenge?")) show("home"); };
$("phone").oninput = e => e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
$("name").oninput = e => e.target.value = e.target.value.replace(/[^A-Za-z\s]/g, "");

/* Admin Panel Auth & Data handling */
$("adminNavBtn")?.addEventListener("click", () => {
  show("admin");
  if (!adminAuthToken) {
    $("adminAuthCard").style.display = "block";
    $("adminPanelCard").style.display = "none";
  } else {
    fetchAdminData();
  }
});

$("adminLoginBtn")?.addEventListener("click", async () => {
  const pwd = $("adminPassword").value.trim();
  $("adminError").textContent = "";
  if (!pwd) {
    $("adminError").textContent = "Please enter admin password.";
    return;
  }
  if (pwd !== "9630") {
    $("adminError").textContent = "Incorrect password!";
    return;
  }
  adminAuthToken = pwd;
  $("adminPassword").value = "";
  $("adminAuthCard").style.display = "none";
  $("adminPanelCard").style.display = "block";
  fetchAdminData();
});

$("adminLogoutBtn")?.addEventListener("click", () => {
  adminAuthToken = null;
  show("home");
});

async function fetchAdminData() {
  if (adminAuthToken !== "9630") return;
  try {
    const res = await fetch("/api/admin/leads", {
      headers: { "x-admin-password": adminAuthToken }
    });
    if (res.ok) {
      const data = await res.json();
      adminFetchedLeads = data.leads || [];
      renderAdminTable(adminFetchedLeads);
      return;
    }
  } catch (e) {
    // Fallback to local storage if running without Express backend server
  }
  adminFetchedLeads = getLeads();
  renderAdminTable(adminFetchedLeads);
}

function renderAdminTable(leads) {
  const body = $("adminLeadsBody");
  if (!leads.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;">No records found in database.</td></tr>';
    $("totalDbCount").textContent = "0";
    $("totalWinsCount").textContent = "0";
    return;
  }

  $("totalDbCount").textContent = leads.length;
  $("totalWinsCount").textContent = leads.filter(x => x.result === "won").length;

  body.innerHTML = leads.map(x => `
    <tr>
      <td><b>${escapeHtml(x.name || 'N/A')}</b></td>
      <td>${escapeHtml(x.phone || '')}</td>
      <td>${escapeHtml(x.role || '')}</td>
      <td>${escapeHtml(x.course || '')}</td>
      <td>${x.score ?? 0}/3</td>
      <td><span class="badge ${x.result}">${escapeHtml(x.result || '')}</span></td>
      <td>${new Date(x.registered_at || x.registeredAt).toLocaleDateString()}</td>
    </tr>
  `).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function csvEscape(v) {
  return '"' + String(v ?? "").replaceAll('"', '""') + '"';
}

$("exportDbCsvBtn")?.addEventListener("click", () => {
  if (!adminFetchedLeads.length) {
    alert("No database records available to export.");
    return;
  }
  const rows = [
    ["ID", "Name", "Role", "Course", "Phone", "Registered At", "Score", "Result", "Status"],
    ...adminFetchedLeads.map(x => [
      x.id, x.name, x.role, x.course, x.phone,
      x.registered_at || x.registeredAt, x.score, x.result, x.status
    ])
  ];
  const blob = new Blob([rows.map(r => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `neelam_quiz_leads_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

async function syncPending() {
  if (!CONFIG.GOOGLE_SCRIPT_URL || !navigator.onLine) return;
  const a = getLeads();
  let changed = false;
  for (const lead of a.filter(x => x.status !== "synced")) {
    try {
      const r = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(lead)
      });
      if (r.ok) { lead.status = "synced"; changed = true; }
    } catch { break; }
  }
  if (changed) saveLeads(a);
}

window.addEventListener("online", syncPending);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncPending();
});