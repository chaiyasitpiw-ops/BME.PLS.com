let state = { users: [], docs: [], departments: [], workflow: [], settings: {}, currentUser: null };
let selectedDocId = "";
let token = "";
let createReadyToSend = false;
let trackFilter = "active";
let docSearch = "";
let pdfjsLibPromise = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bindNav();
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", loadState);
  $("mobileLinkCopy").addEventListener("click", copyMobileLink);
  $("createForm").addEventListener("submit", createDoc);
  $("createReviewBtn").addEventListener("click", renderCreateReview);
  $("createForm").addEventListener("input", resetCreateReview);
  $("createForm").addEventListener("change", resetCreateReview);
  $("workFile").addEventListener("change", fillTitleFromWorkFile);
  $("testSmtpBtn").addEventListener("click", testSmtp);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("docSearch")?.addEventListener("input", () => {
    docSearch = $("docSearch").value.trim().toLowerCase();
    renderDocs();
  });
  $("backupCreateBtn")?.addEventListener("click", createBackup);
  $("backupRefreshBtn")?.addEventListener("click", loadBackups);
  $("saveUsersBtn")?.addEventListener("click", () => $("settingsForm")?.requestSubmit());
  await loadLoginOptions();
  localStorage.removeItem("bmeToken");
  showLogin();
  setInterval(() => { if (token) loadState(false); }, 30000);
  setInterval(() => { if (token) loadMobileLink(false); }, 60000);
  setInterval(() => { if (token) loadServerStatus(); }, 60000);
});

async function loadLoginOptions() {
  const response = await fetch("/api/login-options");
  const data = await response.json();
  $("loginUser").innerHTML = data.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} - ${roleName(user)}</option>`).join("");
}

async function login(event) {
  event.preventDefault();
  setBusy(true, "กำลังเข้าสู่ระบบ", "กำลังตรวจรหัสและโหลดรายการงาน...");
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: $("loginUser").value, password: $("loginPassword").value })
  });
  const data = await response.json();
  if (!response.ok) {
    setBusy(false);
    toast(data.error || "เข้าสู่ระบบไม่สำเร็จ");
    return;
  }
  token = data.token;
  $("loginPassword").value = "";
  selectedDocId = "";
  await loadState();
  showView("inbox");
  renderSignBox();
  setBusy(false);
  toast("เข้าสู่ระบบแล้ว");
}

async function logout() {
  const oldToken = token;
  token = "";
  localStorage.removeItem("bmeToken");
  state = { users: [], docs: [], departments: [], workflow: [], settings: {}, currentUser: null };
  showLogin();
  toast("ออกจากระบบแล้ว");
  fetch("/api/logout", { method: "POST", headers: { "Authorization": `Bearer ${oldToken}`, "Content-Type": "application/json" } }).catch(() => {});
}

async function loadState(showError = true) {
  if (!showError && isSigningActive()) return;
  const response = await fetch("/api/state", { headers: authHeaders() });
  if (response.status === 401) {
    token = "";
    localStorage.removeItem("bmeToken");
    showLogin();
    if (showError) toast("กรุณาเข้าสู่ระบบก่อน");
    return;
  }
  state = await response.json();
  if (selectedDocId && !state.docs.some((doc) => doc.id === selectedDocId && canCurrentUserSign(doc))) selectedDocId = "";
  showApp();
  render();
  loadMobileLink(false);
  loadServerStatus();
}

async function loadMobileLink(showToast = false) {
  try {
    const response = await fetch("/api/mobile-link");
    const data = await response.json();
    const url = data.url || "";
    $("mobileLinkText").textContent = url || "ยังไม่มีลิงก์มือถือ ให้เปิดไฟล์ OPEN_BME_FIXED_LINK.bat ใหม่";
    $("mobileLinkOpen").href = url || "#";
    $("mobileLinkOpen").classList.toggle("disabled", !url);
    if (showToast && url) toast("อัปเดตลิงก์มือถือแล้ว");
  } catch {
    $("mobileLinkText").textContent = "อ่านลิงก์มือถือไม่ได้";
  }
}

async function loadServerStatus() {
  try {
    const response = await fetch("/api/server-status", { cache: "no-store" });
    const data = await response.json();
    const hours = Math.floor((data.uptimeSeconds || 0) / 3600);
    const minutes = Math.floor(((data.uptimeSeconds || 0) % 3600) / 60);
    const warning = data.quickTunnel ? "ลิงก์ฟรีอาจเปลี่ยนถ้าเปิดใหม่" : "ลิงก์คงที่";
    $("serverStatusText").textContent = `Server online ${hours}ชม. ${minutes}นาที | ${warning}`;
  } catch {
    $("serverStatusText").textContent = "ตรวจสถานะ server ไม่ได้ ถ้าเปิดเอกสารไม่ได้ให้เปิด OPEN_PUBLIC_MOBILE_LINK.bat ใหม่";
  }
}

async function copyMobileLink() {
  const url = $("mobileLinkOpen").href;
  if (!url || url.endsWith("#")) {
    toast("ยังไม่มีลิงก์มือถือ");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("คัดลอกลิงก์มือถือแล้ว");
  } catch {
    toast(url);
  }
}

function authHeaders() {
  return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

function showLogin() {
  $("loginScreen").classList.remove("hidden");
  $("appShell").classList.add("hidden");
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
}

function bindNav() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });
}

function render() {
  renderCurrentUser();
  if (!isInsideActive("createForm")) renderDepartments();
  renderStats();
  renderKpi();
  renderStorage();
  renderUnitInsights();
  renderTrackFilters();
  renderDocs();
  renderAudit();
  if (!isInsideActive("settingsView")) renderSettings();
}

function renderCurrentUser() {
  const user = state.currentUser;
  $("userName").textContent = user?.name || "-";
  $("userRole").textContent = user ? `${roleName(user)} | ${user.department || "-"}` : "-";
  $("roleLine").textContent = user ? `${user.name} | ${roleName(user)} | ${user.department || "-"}` : "ไม่พบผู้ใช้";
  document.querySelector('[data-view="settings"]').classList.toggle("hidden", user?.role !== "admin");
  document.querySelector('[data-view="admin"]').classList.toggle("hidden", user?.role !== "admin");
  document.querySelector('[data-view="audit"]')?.classList.toggle("hidden", user?.role !== "admin");
  document.querySelector('[data-go="admin"]').classList.toggle("hidden", user?.role !== "admin");
  if (user?.role !== "admin" && !document.querySelector("#adminView").classList.contains("hidden")) showView("inbox");
  if (user?.role !== "admin" && !document.querySelector("#settingsView").classList.contains("hidden")) showView("inbox");
  if (user?.role !== "admin" && $("auditView") && !$("auditView").classList.contains("hidden")) showView("inbox");
}

function renderDepartments() {
  const selected = $("department").value;
  $("department").innerHTML = state.departments.map((item) => {
    const name = typeof item === "string" ? item : item.name;
    const label = typeof item === "string" ? item : item.label;
    return `<option value="${escapeAttr(name)}">${escapeHtml(label)}</option>`;
  }).join("");
  if (selected && [...$("department").options].some((option) => option.value === selected)) {
    $("department").value = selected;
  }
}

function fillTitleFromWorkFile() {
  const file = $("workFile")?.files?.[0];
  if (!file) return;
  const base = file.name.replace(/\.[^.]+$/, "");
  $("title").value = base;
  $("rrNo").value = base;
  if ($("autoTitleText")) $("autoTitleText").textContent = base;
  createReadyToSend = false;
  $("createReview")?.classList.add("hidden");
  $("createSubmitBtn")?.classList.add("hidden");
  toast(`ใช้ชื่อเอกสารจากไฟล์ Excel: ${base}`);
}

function renderStats() {
  const kpi = state.kpi || {};
  $("statTotal").textContent = kpi.total ?? state.docs.length;
  $("statMine").textContent = state.docs.filter(canCurrentUserSign).length;
  $("statProgress").textContent = kpi.active ?? state.docs.filter((doc) => doc.status === "in_progress").length;
  $("statDone").textContent = kpi.completed ?? state.docs.filter((doc) => doc.status === "completed").length;
}

function renderKpi() {
  const box = $("kpiPanel");
  if (!box) return;
  const kpi = state.kpi || {};
  const waits = kpi.waits || [];
  box.innerHTML = `
    <div class="kpi-card good"><span>Completed</span><strong>${escapeHtml(kpi.completed ?? 0)}</strong><small>งานที่จบกระบวนการ</small></div>
    <div class="kpi-card warn"><span>Overdue</span><strong>${escapeHtml(kpi.overdue ?? 0)}</strong><small>ค้างเกิน 3 วัน</small></div>
    <div class="kpi-card"><span>Avg Lead Time</span><strong>${escapeHtml(kpi.avgDays ?? 0)}d</strong><small>เฉลี่ยจากงาน completed</small></div>
    <div class="kpi-card"><span>Waiting Queue</span><strong>${escapeHtml((waits[0]?.count ?? 0))}</strong><small>${escapeHtml(waits[0]?.label || "ไม่มีคิวรอ")}</small></div>
  `;
}

function renderStorage() {
  if (!$("storageBox")) return;
  const storage = state.storage || {};
  const health = storage.health || {};
  $("storageBox").innerHTML = `
    <strong>Central computer storage</strong>
    <span>ไฟล์อัปโหลด: ${escapeHtml(storage.uploads || "-")}</span>
    <span>งาน Completed: ${escapeHtml(storage.completed || "-")}</span>
    <span class="${health.warn ? "danger-text" : "ok-text"}">Free: ${formatBytes(health.freeBytes)} | Used by system: ${formatBytes(health.usedBytes)} ${health.message ? " | " + escapeHtml(health.message) : ""}</span>
  `;
}

function renderUnitInsights() {
  const box = $("unitInsights");
  if (!box) return;
  const groups = new Map();
  for (const doc of state.docs) {
    const key = doc.department || "ไม่ระบุแผนก";
    if (!groups.has(key)) groups.set(key, { name: key, active: 0, waiting: 0, completed: 0, rejected: 0, total: 0 });
    const item = groups.get(key);
    item.total += 1;
    if (doc.status === "completed") item.completed += 1;
    else if (doc.status === "rejected") item.rejected += 1;
    else {
      item.active += 1;
      if (canCurrentUserSign(doc)) item.waiting += 1;
    }
  }
  const units = [...groups.values()].sort((a, b) => (b.active - a.active) || (b.waiting - a.waiting) || a.name.localeCompare(b.name, "th")).slice(0, 8);
  box.innerHTML = `
    <div class="section-title">
      <div>
        <h2>ภาพรวมตามหน่วย/แผนก</h2>
        <p>ดูแผนกที่มีงานค้างและงานที่ถึงคิวเซ็นได้เร็วขึ้น</p>
      </div>
      <span>${state.docs.length} งานทั้งหมด</span>
    </div>
    <div class="unit-grid">
      ${units.map((unit) => `
        <button class="unit-card" type="button" data-unit="${escapeAttr(unit.name)}">
          <strong>${escapeHtml(shortDepartment(unit.name))}</strong>
          <span>${escapeHtml(unit.name)}</span>
          <div class="unit-metrics">
            <b>${unit.active}</b><em>ค้าง</em>
            <b>${unit.waiting}</b><em>ถึงคิวฉัน</em>
            <b>${unit.completed}</b><em>ครบ</em>
          </div>
        </button>
      `).join("") || empty("ยังไม่มีข้อมูลหน่วย/แผนก")}
    </div>
  `;
  box.querySelectorAll("[data-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      trackFilter = "all";
      showView("track");
      renderTrackFilters();
      renderDocs();
      const first = [...document.querySelectorAll("#trackDocs .doc")].find((card) => {
        const doc = state.docs.find((item) => item.id === card.dataset.doc);
        return doc?.department === button.dataset.unit;
      });
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(`เปิดรายการของ ${button.dataset.unit}`);
    });
  });
}

function renderAudit() {
  const box = $("auditBox");
  if (!box) return;
  if (state.currentUser?.role !== "admin") {
    box.innerHTML = "";
    return;
  }
  const items = state.audit || [];
  box.innerHTML = `
    <h2>Audit Log</h2>
    <p class="muted">บันทึกย้อนหลังว่าใครทำอะไร เวลาไหน และมาจาก IP ใด</p>
    <div class="audit-list">
      ${items.slice(0, 40).map((item) => `
        <div class="audit-row">
          <strong>${escapeHtml(item.action || "-")}</strong>
          <span>${escapeHtml(item.userName || "-")} | ${formatDate(item.at)} | ${escapeHtml(item.ip || "-")} | ${escapeHtml(item.device || "-")}</span>
          <p>${escapeHtml(item.detail || "-")}</p>
        </div>
      `).join("") || empty("ยังไม่มี audit log")}
    </div>
  `;
}

function renderDocs() {
  const adminVisible = state.docs.filter((doc) => doc.status === "in_progress").slice(0, 10);
  $("adminDocs").innerHTML = adminVisible.map((doc) => docCard(doc, false)).join("") || empty("ไม่มีเอกสารที่กำลังดำเนินการ");
  const inbox = state.docs.filter(canCurrentUserSign);
  $("inboxDocs").innerHTML = inbox.length
    ? `${queueSummary(inbox)}${inbox.map((doc, index) => docCard(doc, true, false, index)).join("")}`
    : empty("ยังไม่มีเอกสารที่ถึงคิวคุณ");
  const trackDocs = filteredTrackDocs();
  $("trackDocs").innerHTML = trackDocs.map((doc) => docCard(doc, false, true)).join("") || empty("ไม่มีเอกสารในหมวดนี้");
  document.querySelectorAll("[data-sign]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDocId = button.dataset.sign;
      renderSignBox();
      showView("inbox");
      $("signBox").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("เปิดหน้าเซ็นแล้ว กำลังโหลด PDF รวมด้านล่าง");
      document.querySelectorAll(".doc").forEach((doc) => doc.classList.toggle("selected", doc.dataset.doc === selectedDocId));
    });
  });
  document.querySelectorAll("[data-delete-doc]").forEach((button) => {
    button.addEventListener("click", () => deleteDoc(button.dataset.deleteDoc));
  });
  document.querySelectorAll("[data-edit-doc]").forEach((button) => {
    button.addEventListener("click", () => editDoc(button.dataset.editDoc));
  });
  if (!isSigningActive()) renderSignBox();
}

function renderTrackFilters() {
  const box = $("trackFilters");
  if (!box) return;
  const filters = [
    ["active", "กำลังดำเนินการ", state.docs.filter((doc) => doc.status === "in_progress").length],
    ["mine", "ถึงคิวฉัน", state.docs.filter(canCurrentUserSign).length],
    ["completed", "Completed", state.docs.filter((doc) => doc.status === "completed").length],
    ["rejected", "ไม่อนุมัติ", state.docs.filter((doc) => doc.status === "rejected").length],
    ["all", "ทั้งหมด", state.docs.length]
  ];
  box.innerHTML = filters.map(([key, label, count]) => `<button class="filter-btn ${trackFilter === key ? "active" : ""}" type="button" data-track-filter="${key}">${label} <strong>${count}</strong></button>`).join("");
  document.querySelectorAll("[data-track-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      trackFilter = button.dataset.trackFilter;
      renderTrackFilters();
      renderDocs();
    });
  });
}

function filteredTrackDocs() {
  let docs;
  if (trackFilter === "mine") docs = state.docs.filter(canCurrentUserSign);
  else if (trackFilter === "completed") docs = state.docs.filter((doc) => doc.status === "completed");
  else if (trackFilter === "rejected") docs = state.docs.filter((doc) => doc.status === "rejected");
  else if (trackFilter === "all") docs = state.docs;
  else docs = state.docs.filter((doc) => doc.status === "in_progress");
  if (!docSearch) return docs;
  return docs.filter((doc) => [
    doc.title, doc.rrNo, doc.department, doc.departmentCode, doc.priority,
    doc.status, state.workflow[doc.currentStep]?.label, doc.note
  ].some((value) => String(value || "").toLowerCase().includes(docSearch)));
}

function renderSettings() {
  if (state.currentUser?.role !== "admin") return;
  $("publicBaseUrl").value = state.settings.publicBaseUrl || "";
  $("lowDiskWarnGb").value = state.settings.system?.lowDiskWarnGb || 5;
  $("dashboardDocLimit").value = state.settings.system?.dashboardDocLimit || 30;
  $("auditRetentionDays").value = state.settings.system?.auditRetentionDays || 90;
  $("generatedRetentionDays").value = state.settings.system?.generatedRetentionDays || 14;
  $("smtpHost").value = state.settings.smtp?.host || "";
  $("smtpPort").value = state.settings.smtp?.port || 465;
  $("smtpUser").value = state.settings.smtp?.user || "";
  $("smtpFrom").value = state.settings.smtp?.from || "";
  $("smtpPass").placeholder = state.settings.smtp?.hasPass ? "ตั้งค่าแล้ว ใส่ใหม่เฉพาะตอนเปลี่ยน" : "ใส่ SMTP password";
  $("userSettings").innerHTML = state.users.map((user) => `
    <div class="user-row" data-user-row="${user.id}">
      <div>
        <label>ชื่อ</label>
        <input data-user-name="${user.id}" value="${escapeAttr(user.name)}">
        <p class="hint">${escapeHtml(roleName(user))} | ${escapeHtml(user.department || "-")}${user.loginCodeHint ? " | PIN เริ่มต้น: " + escapeHtml(user.loginCodeHint) : ""}</p>
      </div>
      <div>
        <label>PIN/Password ใหม่</label>
        <input data-user-pass="${user.id}" type="password" placeholder="เว้นว่างถ้าไม่เปลี่ยน">
      </div>
      <div>
        <label>Email</label>
        <input data-user-email="${user.id}" value="${escapeAttr(user.email || "")}" placeholder="name@hospital.com">
      </div>
      <button class="btn blue" data-generate-pass="${user.id}" type="button">สุ่มรหัสใหม่</button>
      <button class="btn" data-test-notify="${user.id}" type="button">ทดสอบแจ้งเตือน</button>
    </div>
  `).join("");
  document.querySelectorAll("[data-test-notify]").forEach((button) => {
    button.addEventListener("click", () => testNotify(button.dataset.testNotify));
  });
  document.querySelectorAll("[data-generate-pass]").forEach((button) => {
    button.addEventListener("click", () => generatePassword(button.dataset.generatePass));
  });
}

function generatePassword(userId) {
  const input = document.querySelector(`[data-user-pass="${cssEscape(userId)}"]`);
  if (!input) return;
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  input.type = "text";
  input.value = pin;
  toast(`สร้างรหัสใหม่แล้ว: ${pin} กดบันทึกรหัส/ผู้ใช้ทั้งหมดเพื่อใช้จริง`);
}

function queueSummary(docs) {
  const urgent = docs.filter((doc) => /ด่วน/.test(doc.priority || "")).length;
  const dept = new Set(docs.map((doc) => shortDepartment(doc.department))).size;
  return `<div class="queue-summary">
    <div><strong>${docs.length}</strong><span>งานรอเซ็น</span></div>
    <div><strong>${urgent}</strong><span>งานด่วน</span></div>
    <div><strong>${dept}</strong><span>แผนก</span></div>
  </div>`;
}

function docCard(doc, withButton, withHistory = false, queueIndex = -1) {
  const progress = docProgress(doc);
  const stepLabel = state.workflow[doc.currentStep]?.label || "-";
  return `
    <article class="doc ${withButton ? "queue-doc" : ""} ${selectedDocId === doc.id ? "selected" : ""}" data-doc="${doc.id}">
      <div class="doc-top">
        <div>
          <div class="doc-title">${queueIndex >= 0 ? `<span class="queue-no">${queueIndex + 1}</span>` : ""}${escapeHtml(doc.title)}</div>
          <div class="meta">${escapeHtml(doc.department)} | ${escapeHtml(doc.priority)} | ${formatDate(doc.createdAt)}</div>
        </div>
        <span class="badge ${badgeClass(doc)}">${statusText(doc)}</span>
      </div>
      <div class="doc-progress">
        <div><span style="width:${progress}%"></span></div>
        <small>${progress}% | ขั้นตอน: ${escapeHtml(stepLabel)}</small>
      </div>
      <div class="doc-chips">
        <span>${escapeHtml(doc.rrNo || "ไม่มีเลข RR")}</span>
        <span>${escapeHtml(shortDepartment(doc.department))}</span>
        <span>${escapeHtml((doc.files || []).filter((file) => file.kind !== "repair-asset").length)} ไฟล์</span>
      </div>
      <p>${escapeHtml(doc.note || "ไม่มีหมายเหตุ")}</p>
      <div class="actions">
        ${withButton ? `<button class="btn primary" data-sign="${doc.id}">✍️ เปิดหน้าเซ็นเอกสาร</button>` : ""}
        ${!withButton && doc.status === "completed" ? `<a class="btn blue" href="${doc.downloadUrl}" target="_blank" rel="noopener">⬇️ ดาวน์โหลด PDF รวม</a>` : ""}
        ${!withButton && doc.status !== "completed" ? `<span class="btn disabled">🔒 ดาวน์โหลดได้เมื่อ Completed</span>` : ""}
        ${!withButton ? `<a class="btn" href="${doc.packagePdfUrl}" target="_blank" rel="noopener">📄 เปิด PDF รวม</a>` : ""}
        ${!withButton && canEditDoc(doc) ? `<button class="btn" data-edit-doc="${doc.id}" type="button">Edit</button>` : ""}
        ${!withButton && canDeleteDoc(doc) ? `<button class="btn red" data-delete-doc="${doc.id}" type="button">🗑️ ลบงานที่ส่งผิด</button>` : ""}
      </div>
      ${withButton ? "" : fileList(doc)}
      ${doc.completedFolder ? `<div class="saved-path"><strong>บันทึก Completed แล้วที่:</strong><span>${escapeHtml(doc.completedFolder)}</span></div>` : ""}
      <details class="doc-extra"><summary>สถานะลายเซ็นและขั้นตอน</summary>${signaturePanel(doc)}${steps(doc)}</details>
      ${withHistory ? history(doc) : ""}
    </article>
  `;
}

function docProgress(doc) {
  const total = Math.max(state.workflow.length, 1);
  if (doc.status === "completed") return 100;
  if (doc.status === "rejected") return Math.round(((doc.signatures || []).length / total) * 100);
  return Math.round((Math.min(doc.currentStep || 0, total - 1) / total) * 100);
}

function fileList(doc) {
  const files = (doc.files || []).filter((file) => file.kind !== "repair-asset");
  if (!files.length) return "";
  return `<div class="file-list">${files.map((file) => fileLink(file)).join("")}</div>`;
}

function fileLink(file) {
  const text = `${fileLabel(file.kind)}: ${shortName(file.originalName || file.url || file.fileName || "")}`;
  return `<a href="${file.url}" target="_blank" rel="noopener" title="${escapeAttr(file.originalName || "")}">${escapeHtml(text)}</a>`;
}

function signaturePanel(doc) {
  const slots = [
    ["ผู้นำเสนอ", "Supervisor BME", 0],
    ["ผู้ตรวจสอบ", "หัวหน้าเครื่องมือแพทย์ รพ.", 1],
    ["หัวหน้าแผนก", "Admin/BME บันทึกผลเซ็นจริง", 2],
    ["ประทับสุดท้าย", "หัวหน้าหน่วยเครื่องมือแพทย์ + ผู้จัดการส่วนสนับสนุนบริการ", 3]
  ];
  return `<div class="signature-summary">${slots.map(([title, role, step]) => {
    const sign = (doc.signatures || []).find((item) => item.step === step);
    return `<div>
      <strong>${title}</strong>
      <span>${role}</span>
      <em>${sign ? escapeHtml(sign.userName || "เซ็นแล้ว") : "รอลายเซ็น"}</em>
    </div>`;
  }).join("")}</div>`;
}

function steps(doc) {
  return `<div class="steps">${state.workflow.map((step, index) => {
    const signed = doc.signatures.some((sign) => sign.step === index);
    const current = doc.status === "in_progress" && doc.currentStep === index;
    const label = signed ? "เซ็นแล้ว" : current ? "กำลังรอ" : "รอคิว";
    const cls = signed ? "signed" : current ? "current" : "";
    return `
      <div class="step ${cls}">
        <div class="num">${signed ? "✓" : index + 1}</div>
        <div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.action)}</p></div>
        <span class="badge ${signed ? "done" : current ? "wait" : ""}">${label}</span>
      </div>
    `;
  }).join("")}</div>`;
}

function history(doc) {
  return `<div class="history">${doc.history.map((item) => `<div>${formatDate(item.at)} - ${escapeHtml(item.by)}: ${escapeHtml(item.text)}</div>`).join("")}</div>`;
}

function renderSignBox() {
  const doc = state.docs.find((item) => item.id === selectedDocId && canCurrentUserSign(item));
  if (!doc) {
    $("signBox").className = "empty";
    $("signBox").innerHTML = "เลือกเอกสารที่รอเซ็น";
    return;
  }
  const step = state.workflow[doc.currentStep];
  const manualDepartmentStep = step.role === "bme";
  const finalStampStep = step.role === "equipment_head" && doc.currentStep === state.workflow.length - 1;
  $("signBox").className = "";
  $("signBox").innerHTML = `
    ${workSummary(doc, step)}
    <div class="sign-files">
      <strong>เอกสารที่แนบมากับงานนี้</strong>
      ${fileList(doc)}
      <div class="actions">
        <a class="btn" href="${doc.packagePdfUrl}" target="_blank" rel="noopener">เปิด PDF รวมแท็บใหม่</a>
      </div>
    </div>
    <div class="preview-note" id="pdfLoadStatus">กำลังแสดง PDF รวมทุกหน้าในหน้านี้ มือถือไม่ต้องเปิดแท็บใหม่</div>
    <div class="pdf-pages" id="packagePagesBox" data-pdf-url="${escapeAttr(doc.packagePdfUrl)}" data-pages-url="${escapeAttr(doc.packagePagesUrl || "")}">
      <div class="pdf-loading inline">กำลังเตรียมหน้าเอกสาร...</div>
    </div>
    <details class="pdf-fallback">
      <summary>เปิด PDF แบบเดิมถ้าต้องการตรวจไฟล์ต้นฉบับ</summary>
      <div class="pdf"><iframe data-src="${doc.packagePdfUrl}" loading="lazy" title="PDF รวม 4 ไฟล์"></iframe></div>
    </details>
    <div class="gap-top">
      <h3>${escapeHtml(doc.title)}</h3>
      <p>${escapeHtml(doc.department)} | ขั้นตอน: ${escapeHtml(step.label)}</p>
      ${decisionFields(step)}
      <label>${manualDepartmentStep ? "ลายเซ็นหัวหน้าแผนกที่เซ็นจริง" : "ลายเซ็น"}</label>
      <canvas id="signature" class="signature"></canvas>
      <p class="hint">${manualDepartmentStep ? "ให้ BME เปิดหน้านี้ตอนหัวหน้าแผนกเซ็น หรือคัดลอกลายเซ็นที่เซ็นจริงลงระบบเพื่อบันทึกหลักฐาน" : "ใช้เมาส์ ปากกา หรือใช้นิ้วบนมือถือเซ็นได้"}</p>
      ${finalStampStep ? `<label>ลายเซ็นผู้จัดการส่วนสนับสนุนบริการ</label><canvas id="signature2" class="signature"></canvas>` : ""}
      <input id="approve" type="checkbox" class="hidden" checked>
      ${signatureIdentityFields(step, manualDepartmentStep, finalStampStep, doc)}
      <input id="comment" type="hidden" value="">
      <div class="actions">
        <button class="btn" id="clearSign">🧽 ล้างลายเซ็น</button>
        <button class="btn primary" id="sendSign">✅ เซ็นและส่งต่อ</button>
        <button class="btn red" id="rejectDoc">✖️ ไม่อนุมัติ</button>
      </div>
    </div>
  `;
  initCanvas();
  initCanvas("signature2");
  setTimeout(() => loadPackagePages(), 80);
  document.querySelector(".pdf-fallback")?.addEventListener("toggle", (event) => {
    if (event.target.open) loadPackageFrameFallback();
  });
  $("clearSign").addEventListener("click", () => {
    clearSignatureCanvas("signature");
    clearSignatureCanvas("signature2");
    document.body.classList.remove("signing-lock");
    toast("ล้างลายเซ็นแล้ว เซ็นใหม่ได้เลย");
  });
  $("sendSign").addEventListener("click", () => signDoc(doc.id));
  $("rejectDoc").addEventListener("click", () => rejectDoc(doc.id));
}

async function loadPackagePages() {
  const box = $("packagePagesBox");
  if (!box || box.dataset.loaded === "1") return;
  box.dataset.loaded = "1";
  const pdfUrl = box.dataset.pdfUrl;
  const status = $("pdfLoadStatus");
  try {
    if (box.dataset.pagesUrl) {
      await loadServerRenderedPages(box, box.dataset.pagesUrl, status);
      return;
    }
  } catch (error) {
    if (status) status.textContent = "โหลดภาพจากคอมกลางไม่ได้ กำลังเปิดด้วยตัวอ่าน PDF สำรอง...";
  }
  try {
    const pdfjs = await getPdfJs();
    const task = pdfjs.getDocument({ url: pdfUrl, httpHeaders: { Authorization: `Bearer ${token}` } });
    const pdf = await task.promise;
    box.innerHTML = "";
    if (status) status.textContent = `PDF รวมมี ${pdf.numPages} หน้า กำลังแสดงให้ครบทุกหน้าในหน้านี้`;
    const maxWidth = Math.max(280, Math.min(box.clientWidth || window.innerWidth - 36, 980));
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const wrap = document.createElement("div");
      wrap.className = "pdf-page";
      wrap.innerHTML = `<div class="pdf-page-label">หน้า ${pageNo}/${pdf.numPages}</div>`;
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page-canvas";
      canvas.dataset.pageNo = String(pageNo);
      wrap.appendChild(canvas);
      box.appendChild(wrap);
      pages.push(canvas);
    }
    await renderPdfPage(pdf, 1, pages[0], maxWidth);
    if (status) status.textContent = `แสดงหน้าแรกแล้ว เลื่อนลงเพื่อโหลดหน้าถัดไปอัตโนมัติ (${pdf.numPages} หน้า)`;
    lazyRenderPdfPages(pdf, pages.slice(1), maxWidth);
  } catch (error) {
    box.innerHTML = `<div class="pdf-error">เปิดแบบภาพไม่ได้ กรุณากดเปิด PDF แบบเดิมด้านล่าง</div>`;
    if (status) status.textContent = "มือถือบางรุ่นอาจบล็อกตัวอ่าน PDF ให้ใช้ปุ่มเปิด PDF แบบเดิมสำรอง";
    loadPackageFrameFallback();
  }
}

async function loadServerRenderedPages(box, pagesUrl, status) {
  if (status) status.textContent = "กำลังตรวจภาพเอกสารที่เตรียมไว้...";
  const fastUrl = `${pagesUrl}${pagesUrl.includes("?") ? "&" : "?"}cached=1`;
  const response = await fetch(fastUrl, { headers: authHeaders(), cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok || !Array.isArray(data.pages) || !data.pages.length) {
    throw new Error(data.error || "โหลดหน้าเอกสารไม่ได้");
  }
  box.innerHTML = "";
  data.pages.forEach((page) => {
    const wrap = document.createElement("div");
    wrap.className = "pdf-page";
    wrap.innerHTML = `<div class="pdf-page-label">หน้า ${page.page}/${data.pages.length}</div>`;
    const img = document.createElement("img");
    img.className = "pdf-page-image";
    img.loading = page.page === 1 ? "eager" : "lazy";
    img.decoding = "async";
    img.alt = `หน้า ${page.page}`;
    img.src = page.url;
    wrap.appendChild(img);
    box.appendChild(wrap);
  });
  if (status) status.textContent = `แสดงไฟล์รวมครบ ${data.pages.length} หน้าแล้ว`;
}

async function renderPdfPage(pdf, pageNo, canvas, maxWidth) {
  if (!canvas || canvas.dataset.rendered === "1") return;
  canvas.dataset.rendered = "1";
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(1, (maxWidth / base.width) * Math.min(window.devicePixelRatio || 1, 1.5)));
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / scale)}px`;
  canvas.style.maxWidth = "100%";
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
}

function lazyRenderPdfPages(pdf, canvases, maxWidth) {
  if (!canvases.length) return;
  const renderOne = (canvas) => renderPdfPage(pdf, Number(canvas.dataset.pageNo), canvas, maxWidth)
    .catch(() => { canvas.dataset.rendered = "0"; });
  if (!("IntersectionObserver" in window)) {
    canvases.reduce((chain, canvas) => chain.then(() => renderOne(canvas)), Promise.resolve());
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      renderOne(entry.target);
    });
  }, { rootMargin: "900px 0px" });
  canvases.forEach((canvas) => observer.observe(canvas));
}

async function getPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("/vendor/pdfjs/pdf.min.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsLibPromise;
}

function loadPackageFrameFallback() {
  const fallback = document.querySelector(".pdf-fallback iframe");
  if (fallback && !fallback.src) fallback.src = fallback.dataset.src;
}

function workSummary(doc, step) {
  const files = (doc.files || []).filter((file) => file.kind !== "repair-asset");
  return `<section class="work-summary">
    <div>
      <strong>${escapeHtml(doc.rrNo || "ไม่มีเลข RR")}</strong>
      <span>${escapeHtml(doc.title || "-")}</span>
    </div>
    <div><b>หน่วย/แผนก</b><span>${escapeHtml(doc.department || "-")}</span></div>
    <div><b>ขั้นตอน</b><span>${escapeHtml(step.label || "-")}</span></div>
    <div><b>ไฟล์แนบ</b><span>${files.length} ไฟล์</span></div>
  </section>`;
}

function quickPreview(doc) {
  const files = doc.files || [];
  const preferred = files.find((file) => file.kind === "repair-html") || files.find((file) => file.mime === "application/pdf" || String(file.mime || "").startsWith("image/"));
  if (!preferred) return `<div class="quick-preview empty-small">ไฟล์ Excel/Word ให้กด PDF รวมเมื่อต้องอ่านรายละเอียด</div>`;
  if (String(preferred.mime || "").startsWith("text/html") || /(\.html?|\.mhtml?|\.mht)$/i.test(preferred.originalName || "")) {
    return `<div class="quick-preview"><iframe src="${doc.repairPreviewUrl || preferred.url}" title="N Smart HTML"></iframe></div>`;
  }
  if (preferred.mime === "application/pdf" || String(preferred.mime || "").startsWith("image/")) {
    return `<div class="quick-preview"><iframe src="${preferred.url}" title="Preview"></iframe></div>`;
  }
  return "";
}

function signatureIdentityFields(step, manualDepartmentStep, finalStampStep, doc = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (manualDepartmentStep) {
    const headPosition = departmentHeadPosition(doc.department);
    return `<input id="typedName" type="hidden" value="">
    <div class="field">
      <label for="position">ตำแหน่งผู้เซ็น</label>
      <select id="position">
        <option>${escapeHtml(headPosition)}</option>
        <option>พยาบาล</option>
        <option>ผู้ช่วยพยาบาล</option>
      </select>
    </div>
    <div class="field">
      <label for="signedDate">วันที่</label>
      <input id="signedDate" type="date" value="${today}">
    </div>
    <input id="typedName2" type="hidden" value="">
    <input id="position2" type="hidden" value="">`;
  }
  if (finalStampStep) {
    return `<input id="typedName" type="hidden" value="นายพงศ์ชยิน วงศ์โชติวรกุล">
      <input id="position" type="hidden" value="หัวหน้าหน่วยเครื่องมือแพทย์">
      <input id="typedName2" type="hidden" value="นางสาวศรินทิพย์ ตันติสุนทรสกุล">
      <input id="position2" type="hidden" value="ผู้จัดการส่วนสนับสนุนบริการ">
      <input id="signedDate" type="hidden" value="${today}">`;
  }
  return `<input id="typedName" type="hidden" value="">
    <input id="position" type="hidden" value="">
    <input id="typedName2" type="hidden" value="">
    <input id="position2" type="hidden" value="">
    <input id="signedDate" type="hidden" value="${today}">`;
}

function decisionFields(step) {
  if (step.role === "supervisor") {
    return decisionChecks("ผลพิจารณา Supervisor CES (PLS)", [
      "ควรดำเนินการ",
      "ไม่ควรดำเนินการ",
      "โดยแผนกจัดซื้อของ ร.พ.",
      "อื่นๆ"
    ]);
  }
  if (step.role === "equipment_head") {
    return decisionChecks("ผลพิจารณาหัวหน้าหน่วยเครื่องมือแพทย์", [
      "อนุมัติให้ดำเนินการ",
      "ไม่อนุมัติให้ดำเนินการ",
      "อื่นๆ"
    ]);
  }
  return decisionChecks("ผลหัวหน้าแผนกที่เซ็นเอกสารจริง", [
    "เห็นชอบให้ดำเนินการ",
    "ไม่เห็นชอบให้ดำเนินการ",
    "อื่นๆ"
  ]);
}

function decisionChecks(label, options) {
  return `<div class="field decision-field"><label>${escapeHtml(label)}</label>
    ${options.map((option, index) => `
      <label class="checkline">
        <input type="radio" name="decisionChoice" value="${escapeAttr(option)}" ${index === 0 ? "checked" : ""}>
        <span>${escapeHtml(option)}</span>
      </label>
    `).join("")}
    <input id="otherText" placeholder="ระบุเมื่อเลือก อื่นๆ">
  </div>`;
}

function selectedDecision() {
  return document.querySelector('input[name="decisionChoice"]:checked')?.value || "";
}

function defaultSignerName(step) {
  return "";
}

function defaultPosition(step) {
  return "";
}

async function createDoc(event) {
  event.preventDefault();
  if (!createReadyToSend) {
    toast("กรุณากดตรวจสอบไฟล์ก่อนส่ง แล้วค่อยกดส่งจริง");
    return;
  }
  const button = $("createSubmitBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "กำลังอ่านไฟล์...";
  }
  setBusy(true, "กำลังเตรียมเอกสาร", "กำลังอ่านไฟล์ทั้งหมดและรวมข้อมูลสำหรับส่งเข้าคอมกลาง");
  const files = await collectPackageFiles();
  if (!files.length) {
    setBusy(false);
    if (button) {
      button.disabled = false;
      button.textContent = "ส่งจริงและแจ้งเตือน";
    }
    toast("กรุณาแนบไฟล์ 3 ส่วนหลักก่อนส่ง");
    return;
  }
  setBusy(true, "กำลังส่งเข้าระบบ", "กำลังบันทึกลงคอมกลางและเตรียม PDF เบื้องหลัง");
  if (button) button.textContent = "กำลังส่งเข้าคอมกลาง...";
  const payload = {
    rrNo: $("workFile").files[0]?.name.replace(/\.[^.]+$/, "") || $("rrNo").value,
    title: $("workFile").files[0]?.name.replace(/\.[^.]+$/, "") || $("title").value,
    department: $("department").value,
    priority: $("priority").value,
    note: $("note").value,
    files
  };
  const response = await api("/api/docs", payload);
  if (response.ok) {
    $("createForm").reset();
    resetCreateReview();
    toast("บันทึกลงคอมกลางและส่งแจ้งเตือนแล้ว");
    showView("track");
    await loadState();
  }
  setBusy(false);
  if (button) {
    button.disabled = false;
    button.textContent = "ส่งจริงและแจ้งเตือน";
  }
}

function renderCreateReview() {
  const required = [
    ["ไฟล์ Excel ใบงาน/รายละเอียด", $("workFile").files[0]],
    ["ไฟล์หน้า N Smart งานซ่อม", $("repairFile").files[0]],
    ["ใบเสนอราคา", $("quoteFile").files[0]]
  ];
  const missing = [];
  fillTitleFromWorkFile();
  if (!$("title").value.trim()) missing.push("ไฟล์ Excel สำหรับตั้งชื่อเอกสาร");
  if (!$("department").value) missing.push("แผนก");
  required.forEach(([label, file]) => { if (!file) missing.push(label); });
  if (missing.length) {
    toast(`ยังขาด: ${missing.join(", ")}`);
    return false;
  }
  const photos = [...$("photoFiles").files];
  const repairAssets = [...($("repairAssets")?.files || [])];
  $("createReview").classList.remove("hidden");
  $("createReview").innerHTML = `
    <strong>ตรวจสอบก่อนส่งจริง</strong>
    <div>RR: ${escapeHtml($("rrNo").value || "-")}</div>
    <div>ชื่อเอกสาร: ${escapeHtml($("title").value)}</div>
    <div>แผนก: ${escapeHtml($("department").value)} | ความเร่งด่วน: ${escapeHtml($("priority").value)}</div>
    <div>1. ใบงาน: ${escapeHtml($("workFile").files[0].name)}</div>
    <div>2. หน้า N Smart งานซ่อม: ${escapeHtml($("repairFile").files[0].name)}</div>
    <div>2.1 ไฟล์ประกอบ N Smart: ${repairAssets.length ? escapeHtml(`${repairAssets.length} ไฟล์`) : "-"}</div>
    <div>3. ใบเสนอราคา: ${escapeHtml($("quoteFile").files[0].name)}</div>
    <div>4. รูป/Word/ไฟล์ประกอบ: ${photos.length ? escapeHtml(photos.map((file) => file.name).join(" / ")) : "-"}</div>
    <div class="hint">ระบบจะสร้าง PDF รวม 4 กลุ่มนี้ให้เห็นตอนนำไปอธิบาย/เซ็น และยังเก็บไฟล์จริงทั้งหมดใน ZIP</div>
    <p>ถ้าข้อมูลถูกต้อง กดปุ่มด้านล่างอีกครั้งเพื่อส่งเข้าระบบ</p>
  `;
  createReadyToSend = true;
  $("createSubmitBtn").classList.remove("hidden");
  return true;
}

function resetCreateReview() {
  createReadyToSend = false;
  if (!$("workFile")?.files?.[0] && $("autoTitleText")) $("autoTitleText").textContent = "เลือกไฟล์ Excel แล้วระบบจะตั้งชื่อใบงานให้เอง";
  if ($("createReview")) {
    $("createReview").classList.add("hidden");
    $("createReview").innerHTML = "";
  }
  if ($("createSubmitBtn")) $("createSubmitBtn").classList.add("hidden");
}

async function collectPackageFiles() {
  const required = [
    ["work", $("workFile").files[0]],
    ["repair-html", $("repairFile").files[0]],
    ["quote", $("quoteFile").files[0]]
  ];
  if (required.some(([, file]) => !file)) return [];
  const all = [...required];
  for (const file of ($("repairAssets")?.files || [])) all.push(["repair-asset", file]);
  for (const file of $("photoFiles").files) all.push(["damage-photo", file]);
  const result = [];
  for (const [kind, file] of all) {
    if (file.url) result.push({ kind, name: file.name, url: file.url });
    else result.push({ kind, name: file.name, dataUrl: await fileToDataUrl(file) });
  }
  return result;
}

async function signDoc(id) {
  const approve = $("approve");
  if (approve && !approve.checked) {
    toast("กรุณาติ๊กอนุมัติก่อนส่งต่อ");
    return;
  }
  const button = $("sendSign");
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "กำลังบันทึกลายเซ็น...";
  }
  setBusy(true, "กำลังบันทึกลายเซ็น", "กำลังส่งลายเซ็นและสร้าง PDF สำหรับขั้นถัดไป");
  const response = await api(`/api/docs/${id}/sign`, {
    approved: true,
    comment: $("comment").value,
    signatureData: $("signature") ? $("signature").toDataURL("image/png") : "",
    signatureData2: $("signature2") ? $("signature2").toDataURL("image/png") : "",
    decision: selectedDecision(),
    otherText: $("otherText")?.value || "",
    typedName: $("typedName")?.value || "",
    position: $("position")?.value || "",
    signedDate: $("signedDate")?.value || "",
    typedName2: $("typedName2")?.value || "",
    position2: $("position2")?.value || ""
  });
  if (response.ok) {
    selectedDocId = "";
    toast("เซ็นและส่งต่อเรียบร้อย");
    updateDocInState(response.doc);
    const nextDoc = state.docs.find((doc) => doc.id !== id && canCurrentUserSign(doc));
    const remaining = state.docs.filter((doc) => doc.id !== id && canCurrentUserSign(doc)).length;
    if (nextDoc) selectedDocId = nextDoc.id;
    render();
    if (nextDoc) {
      renderSignBox();
      setTimeout(() => $("signBox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    if (remaining) toast(`เซ็นแล้ว ยังมีงานรอเซ็นอีก ${remaining} งาน`);
    setTimeout(() => loadState(false), 250);
  }
  setBusy(false);
  if (button) {
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = "เซ็นและส่งต่อ";
  }
}

async function deleteDoc(id) {
  if (!confirm("ยืนยันลบงานนี้? Admin/BME สามารถลบได้ทั้งงานที่ส่งผิดและงานที่เซ็นเสร็จแล้ว")) return;
  const button = document.querySelector(`[data-delete-doc="${cssEscape(id)}"]`);
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "กำลังลบ...";
  }
  setBusy(true, "กำลังลบงาน", "กำลังเอางานออกจากรายการ แล้วลบไฟล์เบื้องหลัง");
  const response = await fetchWithTimeout(`/api/docs/${id}`, { method: "DELETE", headers: authHeaders() }, 15000);
  if (!response.ok) {
    toast(response.error || "ลบงานไม่สำเร็จ");
    setBusy(false);
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.textContent = "🗑️ ลบงาน";
    }
    return;
  }
  if (selectedDocId === id) selectedDocId = "";
  state.docs = state.docs.filter((doc) => doc.id !== id);
  toast("ลบงานออกจากระบบแล้ว");
  render();
  setBusy(false);
  setTimeout(() => loadState(false), 300);
}

function canEditDoc(doc) {
  const role = state.currentUser?.role;
  return ["admin", "bme"].includes(role);
}

async function editDoc(id) {
  const doc = state.docs.find((item) => item.id === id);
  if (!doc || !canEditDoc(doc)) return;
  const title = prompt("ชื่อเอกสาร", doc.title || "");
  if (title === null) return;
  const department = prompt("แผนก (ต้องสะกดตรงกับรายการแผนก)", doc.department || "");
  if (department === null) return;
  const priority = prompt("ความเร่งด่วน", doc.priority || "ปกติ");
  if (priority === null) return;
  const note = prompt("หมายเหตุ", doc.note || "");
  if (note === null) return;
  const status = state.currentUser?.role === "admin" ? prompt("สถานะ: in_progress / completed / rejected", doc.status || "in_progress") : doc.status;
  if (status === null) return;
  const currentStep = state.currentUser?.role === "admin" ? prompt(`ขั้นตอน 0-${Math.max(state.workflow.length - 1, 0)}`, String(doc.currentStep || 0)) : doc.currentStep;
  if (currentStep === null) return;
  const button = document.querySelector(`[data-edit-doc="${cssEscape(id)}"]`);
  button?.classList.add("loading");
  const result = await fetchWithTimeout(`/api/docs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ title, department, priority, note, status, currentStep: Number(currentStep) })
  }, 12000);
  button?.classList.remove("loading");
  if (result.ok && result.doc) {
    state.docs = state.docs.map((item) => item.id === id ? result.doc : item);
    render();
    toast("บันทึกการแก้ไขแล้ว");
  } else {
    toast(result.error || "แก้ไขไม่สำเร็จ");
  }
}

async function rejectDoc(id) {
  const button = $("rejectDoc");
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "กำลังบันทึก...";
  }
  setBusy(true, "กำลังบันทึกผล", "กำลังส่งผลไม่อนุมัติเข้าคอมกลาง");
  const response = await api(`/api/docs/${id}/reject`, {
    comment: $("comment").value,
    signatureData: $("signature") ? $("signature").toDataURL("image/png") : "",
    signatureData2: $("signature2") ? $("signature2").toDataURL("image/png") : "",
    decision: selectedDecision() || "ไม่อนุมัติ",
    otherText: $("otherText")?.value || "",
    typedName: $("typedName")?.value || "",
    position: $("position")?.value || "",
    signedDate: $("signedDate")?.value || "",
    typedName2: $("typedName2")?.value || "",
    position2: $("position2")?.value || ""
  });
  if (response.ok) {
    selectedDocId = "";
    toast("บันทึกไม่อนุมัติแล้ว");
    updateDocInState(response.doc);
    render();
    setTimeout(() => loadState(false), 250);
  }
  setBusy(false);
  if (button) {
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = "ไม่อนุมัติ";
  }
}

function updateDocInState(doc) {
  if (!doc?.id) return;
  const index = state.docs.findIndex((item) => item.id === doc.id);
  if (index >= 0) state.docs[index] = doc;
  else state.docs.unshift(doc);
}

async function saveSettings(event) {
  event.preventDefault();
  const users = state.users.map((user) => ({
    id: user.id,
    name: getUserField(user.id, "name"),
    password: getUserField(user.id, "pass"),
    email: getUserField(user.id, "email")
  }));
  const response = await api("/api/settings", {
    publicBaseUrl: $("publicBaseUrl")?.value || state.settings.publicBaseUrl || "",
    smtp: {
      host: $("smtpHost").value,
      port: Number($("smtpPort").value || 465),
      secure: true,
      user: $("smtpUser").value,
      pass: $("smtpPass").value,
      from: $("smtpFrom").value
    },
    system: {
      lowDiskWarnGb: Number($("lowDiskWarnGb")?.value || 5),
      dashboardDocLimit: Number($("dashboardDocLimit")?.value || 30),
      auditRetentionDays: Number($("auditRetentionDays")?.value || 90),
      generatedRetentionDays: Number($("generatedRetentionDays")?.value || 14)
    },
    users
  });
  if (response.ok) {
    $("smtpPass").value = "";
    toast("บันทึก Settings แล้ว");
    await loadState();
  }
}

async function testNotify(userId) {
  const response = await api("/api/test-notify", { userId });
  if ($("smtpResult")) {
    $("smtpResult").className = `smtp-result ${response.ok ? "ok" : "fail"}`;
    $("smtpResult").textContent = response.ok ? "ส่งอีเมลทดสอบถึงผู้รับแล้ว" : (response.error || "ส่งอีเมลไม่สำเร็จ");
  }
  toast(response.ok ? "ส่งทดสอบแล้ว ตรวจผลในช่องทางที่ตั้งไว้" : response.error || "ส่งทดสอบไม่สำเร็จ");
}

async function testSmtp() {
  const response = await api("/api/test-smtp", {});
  if ($("smtpResult")) {
    $("smtpResult").className = `smtp-result ${response.ok ? "ok" : "fail"}`;
    $("smtpResult").textContent = response.ok ? "SMTP ส่งอีเมลทดสอบสำเร็จแล้ว" : (response.error || "SMTP ส่งไม่สำเร็จ");
  }
  toast(response.ok ? "SMTP ส่งอีเมลทดสอบสำเร็จ" : response.error || "SMTP ส่งไม่สำเร็จ");
}

async function createBackup() {
  const button = $("backupCreateBtn");
  button?.classList.add("loading");
  const result = await api("/api/backup/create", {});
  button?.classList.remove("loading");
  if (result.ok) {
    renderBackupList(result.backups || []);
    toast("สร้าง backup แล้ว");
  } else {
    toast(result.error || "สร้าง backup ไม่สำเร็จ");
  }
}

async function loadBackups() {
  const result = await fetchWithTimeout("/api/backups", { headers: authHeaders() }, 10000);
  if (result.ok) renderBackupList(result.backups || []);
  else toast(result.error || "อ่านรายการ backup ไม่สำเร็จ");
}

function renderBackupList(backups) {
  const box = $("backupList");
  if (!box) return;
  box.innerHTML = (backups || []).map((item) => `
    <div class="backup-row">
      <div>
        <strong>${escapeHtml(item.file || "-")}</strong>
        <span>${formatDate(item.at)} | ${formatBytes(item.bytes)}</span>
      </div>
      <button class="btn red" type="button" data-restore-backup="${escapeAttr(item.file || "")}">Restore</button>
    </div>
  `).join("") || empty("ยังไม่มี backup");
  box.querySelectorAll("[data-restore-backup]").forEach((button) => {
    button.addEventListener("click", () => restoreBackup(button.dataset.restoreBackup));
  });
}

async function restoreBackup(file) {
  if (!confirm(`Restore backup ${file}? ระบบจะสร้าง backup ปัจจุบันให้อัตโนมัติก่อนย้อนกลับ`)) return;
  setBusy(true, "Restoring backup", "กำลังย้อนข้อมูลจาก backup...");
  const result = await api("/api/backup/restore", { file });
  setBusy(false);
  if (result.ok) {
    state = result.state || state;
    render();
    toast("Restore สำเร็จ");
  } else {
    toast(result.error || "Restore ไม่สำเร็จ");
  }
}

async function api(url, payload) {
  return postJsonWithTimeout(url, payload, 20000);
}

async function postJsonWithTimeout(url, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let data;
  try {
    response = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload), signal: controller.signal });
    data = await response.json();
  } catch (error) {
    const message = error.name === "AbortError"
      ? "เน็ตหรือคอมกลางตอบช้าเกิน 20 วินาที ระบบอาจบันทึกแล้ว ให้กดรีเฟรชตรวจสถานะก่อนกดซ้ำ"
      : "ติดต่อคอมกลางไม่ได้ กรุณาตรวจ Wi-Fi/เน็ตมือถือ แล้วกดรีเฟรช";
    toast(message);
    return { ok: false, error: message, timeout: error.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) {
    token = "";
    showLogin();
  }
  if (!response.ok) toast(data.error || "ทำรายการไม่สำเร็จ");
  return { ...data, ok: response.ok && data.ok !== false };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) {
      token = "";
      showLogin();
    }
    return { ...data, ok: response.ok && data.ok !== false, status: response.status };
  } catch (error) {
    const message = error.name === "AbortError"
      ? "เน็ตหรือคอมกลางตอบช้าเกินกำหนด ให้กดรีเฟรชตรวจสถานะก่อนกดซ้ำ"
      : "ติดต่อคอมกลางไม่ได้ กรุณาตรวจสัญญาณเน็ต";
    return { ok: false, error: message, timeout: error.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
}

function showView(view) {
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  ["admin", "inbox", "track", "audit", "settings"].forEach((name) => {
    if (!$(`${name}View`)) return;
    $(`${name}View`).classList.toggle("hidden", name !== view);
  });
  if (view === "settings" && state.currentUser?.role === "admin") loadBackups();
}

function initCanvas(id = "signature") {
  const canvas = $(id);
  if (!canvas) return;
  canvas.replaceWith(canvas.cloneNode(true));
  const freshCanvas = $(id);
  if (!freshCanvas) return;
  freshCanvas.style.touchAction = "none";
  freshCanvas.style.userSelect = "none";
  const ctx = freshCanvas.getContext("2d", { willReadFrequently: false });
  let cssWidth = 0;
  let cssHeight = 0;
  let drawing = false;
  let lastPoint = null;
  const sizeCanvas = (keep = true) => {
    const rect = freshCanvas.getBoundingClientRect();
    const nextWidth = Math.max(Math.round(rect.width), 280);
    const nextHeight = Math.max(Math.round(rect.height), 160);
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    if (freshCanvas.width === Math.round(nextWidth * ratio) && freshCanvas.height === Math.round(nextHeight * ratio)) return;
    const old = keep && freshCanvas.width && freshCanvas.height ? freshCanvas.toDataURL("image/png") : "";
    freshCanvas.width = Math.round(nextWidth * ratio);
    freshCanvas.height = Math.round(nextHeight * ratio);
    cssWidth = nextWidth;
    cssHeight = nextHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (old) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, cssWidth, cssHeight);
      image.src = old;
    }
  };
  sizeCanvas(false);
  new ResizeObserver(() => sizeCanvas(true)).observe(freshCanvas);
  const point = (event) => {
    const box = freshCanvas.getBoundingClientRect();
    const source = event;
    return {
      x: Math.min(Math.max(source.clientX - box.left, 0), box.width) * (cssWidth / box.width),
      y: Math.min(Math.max(source.clientY - box.top, 0), box.height) * (cssHeight / box.height)
    };
  };
  const start = (event) => {
    event.preventDefault();
    document.body.classList.add("signing-lock");
    sizeCanvas(true);
    drawing = true;
    freshCanvas.setPointerCapture?.(event.pointerId);
    const p = point(event);
    lastPoint = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    for (const item of events) {
      const p = point(item);
      if (lastPoint) {
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, (lastPoint.x + p.x) / 2, (lastPoint.y + p.y) / 2);
      } else {
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      lastPoint = p;
    }
  };
  const end = (event) => {
    drawing = false;
    lastPoint = null;
    document.body.classList.remove("signing-lock");
    freshCanvas.releasePointerCapture?.(event.pointerId);
  };
  freshCanvas.addEventListener("pointerdown", start, { passive: false });
  freshCanvas.addEventListener("pointermove", move, { passive: false });
  freshCanvas.addEventListener("pointerup", end, { passive: false });
  freshCanvas.addEventListener("pointercancel", end, { passive: false });
  freshCanvas.addEventListener("lostpointercapture", end, { passive: false });
  freshCanvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    document.body.classList.add("signing-lock");
  }, { passive: false });
  freshCanvas.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
  freshCanvas.addEventListener("touchend", () => document.body.classList.remove("signing-lock"), { passive: false });
}

function clearSignatureCanvas(id = "signature") {
  const canvas = $(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function canCurrentUserSign(doc) {
  const user = state.currentUser;
  const step = state.workflow[doc.currentStep];
  if (!user || !step || doc.status !== "in_progress") return false;
  if (step.role === "bme") return user.role === "admin" || user.role === "bme";
  return user.role === step.role;
}

function canDeleteDoc(doc) {
  const role = state.currentUser?.role;
  return ["admin", "bme"].includes(role);
}

function statusText(doc) {
  if (doc.status === "completed") return "ครบแล้ว";
  if (doc.status === "rejected") return "ไม่อนุมัติ";
  return `รอ ${state.workflow[doc.currentStep]?.label || "-"}`;
}

function badgeClass(doc) {
  if (doc.status === "completed") return "done";
  if (doc.status === "rejected") return "reject";
  return "wait";
}

function roleName(user) {
  const map = { admin: "Admin BME", bme: "BME", supervisor: "Supervisor BME", equipment_head: "หัวหน้าเครื่องมือแพทย์" };
  return map[user.role] || user.role;
}

function fileLabel(kind) {
  const map = {
    work: "ใบงาน/Excel",
    "repair-html": "หน้า N Smart งานซ่อม",
    cover: "ใบปะหน้า",
    "repair-link": "ลิงก์งานซ่อม N Smart",
    quote: "ใบเสนอราคา",
    "damage-photo": "รูปอาการเสีย",
    main: "ไฟล์หลัก"
  };
  return map[kind] || "ไฟล์แนบ";
}

function shortName(value) {
  const text = String(value || "");
  if (text.length <= 70) return text;
  try {
    const url = new URL(text);
    const req = url.searchParams.get("req_no");
    const job = url.searchParams.get("jobno") || url.searchParams.get("s_jobnumber");
    return `N Smart ${req ? "REQ " + req : ""}${job ? " / JOB " + job : ""}`.trim() || `${url.hostname}${url.pathname.slice(-28)}`;
  } catch {
    return `${text.slice(0, 34)}...${text.slice(-24)}`;
  }
}

function shortDepartment(value) {
  const text = String(value || "-");
  const match = text.match(/\(([^)]+)\)/);
  if (match) return match[1];
  return text.replace(/^WARD\s+/i, "W").slice(0, 16);
}

function departmentHeadPosition(department) {
  const code = shortDepartment(department).toUpperCase();
  const map = {
    OTH: "หัวหน้าศูนย์กระดูกและข้อ",
    "BME-PLS": "หัวหน้าหน่วยวิศวกรรมเครื่องมือแพทย์",
    DEN: "หัวหน้าแผนกทันตกรรม",
    EMR: "หัวหน้าแผนกฉุกเฉิน",
    EENT: "หัวหน้าแผนกตา หู คอ จมูก",
    OPR: "หัวหน้าแผนกห้องผ่าตัด",
    "OUT CLINIC": "หัวหน้าแผนกคลินิกผู้ป่วยนอก",
    OME: "หัวหน้าแผนกผู้ป่วยนอกอายุรกรรม",
    OPE: "หัวหน้าแผนกคลินิกกุมารเวช",
    PHA: "หัวหน้าแผนกเภสัชกรรม",
    PHY: "หัวหน้าแผนกกายภาพบำบัด",
    CUC: "หัวหน้าแผนก Premium Walk In",
    XRY: "หัวหน้าแผนกรังสีวิทยา",
    TRU: "หัวหน้าหน่วยขนส่งผู้ป่วย",
    W10: "หัวหน้าแผนกผู้ป่วยใน Ward 10",
    W11: "หัวหน้าแผนกผู้ป่วยใน Ward 11",
    W12: "หัวหน้าแผนกผู้ป่วยใน Ward 12",
    W6: "หัวหน้าแผนกผู้ป่วยใน Ward 6",
    W7: "หัวหน้าแผนกผู้ป่วยใน Ward 7",
    W8: "หัวหน้าแผนกผู้ป่วยใน Ward 8",
    W9: "หัวหน้าแผนกผู้ป่วยใน Ward 9",
    WS3: "หัวหน้าแผนกผู้ป่วยใน Ward S3",
    WS4: "หัวหน้าแผนกผู้ป่วยใน Ward S4",
    WS5: "หัวหน้าแผนกผู้ป่วยใน Ward S5",
    GIC: "หัวหน้าคลินิกทางเดินอาหารและตับ",
    OGP: "หัวหน้าแผนกอายุรกรรมทั่วไปและสังคม",
    OSU: "หัวหน้าแผนกศัลยกรรมทั่วไป",
    CAR: "หัวหน้าคลินิกหัวใจ",
    HEM: "หัวหน้าแผนกไตเทียม",
    ICU: "หัวหน้าแผนกผู้ป่วยวิกฤต",
    INV: "หัวหน้าแผนกคลังพัสดุ",
    LBR: "หัวหน้าแผนกห้องคลอด",
    MS: "หัวหน้าแผนกคลังยา",
    CUM: "หัวหน้าหน่วยตรวจสุขภาพเคลื่อนที่องค์กร",
    NSR: "หัวหน้าแผนกเนอสเซอรี่",
    NUT: "หัวหน้าแผนกโภชนาการ",
    OBG: "หัวหน้าแผนกสูตินรีเวช"
  };
  if (map[code]) return map[code];
  const text = String(department || "");
  if (/OUT CLINIC/i.test(text)) return map["OUT CLINIC"];
  return `หัวหน้าแผนก ${text || "-"}`;
}

function canInline(mime) {
  return mime === "application/pdf" || String(mime || "").startsWith("image/");
}

function previewPane(doc) {
  if (canInline(doc.fileMime)) return `<iframe src="${doc.fileUrl}" title="Preview"></iframe>`;
  if (isOfficeFile(doc.fileMime)) {
    const base = state.settings?.publicBaseUrl || "";
    if (base && /^https?:\/\//.test(base)) {
      const cleanUrl = doc.fileUrl.split("?")[0];
      const absolute = `${base.replace(/\/$/, "")}${cleanUrl}`;
      const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absolute)}`;
      return `<iframe src="${viewer}" title="Office preview"></iframe>`;
    }
  }
  return `<div class="empty">ไฟล์นี้ preview ใน browser ไม่ได้ ให้กดชื่อไฟล์ด้านล่างเพื่อเปิด/ดาวน์โหลด</div>`;
}

function isOfficeFile(mime) {
  return [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
  ].includes(String(mime || ""));
}

function getUserField(id, name) {
  return document.querySelector(`[data-user-${name}="${cssEscape(id)}"]`)?.value || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3800);
}

function setBusy(show, title = "กำลังดำเนินการ", text = "กรุณารอสักครู่") {
  const overlay = $("busyOverlay");
  if (!overlay) return;
  $("busyTitle").textContent = title;
  $("busyText").textContent = text;
  overlay.classList.toggle("hidden", !show);
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#096;");
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function isInsideActive(id) {
  const root = $(id);
  return Boolean(root && document.activeElement && root.contains(document.activeElement));
}

function isSigningActive() {
  return Boolean(selectedDocId && $("signBox") && !$("signBox").classList.contains("empty"));
}

