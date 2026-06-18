const runtimeConfig = new URLSearchParams(window.location.search);
const frontendConfig = window.PRINTING_KIOSK_CONFIG || {};
const DEFAULT_BACKEND_URL = /^https?:$/.test(window.location.protocol) ? window.location.origin : "http://localhost:5080";
const BACKEND_URL = (runtimeConfig.get("backendUrl") || frontendConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");

const state = {
  authed: false,
  authToken: "",
  page: "dashboard",
  snapshot: null,
  loading: false,
  notice: "",
  error: "",
  loginError: "",
  loginDraft: {
    email: "",
    password: ""
  },
  search: "",
  selectedKioskId: "",
  editor: null,
  pricingDraft: {}
};

const pageGroups = [
  {
    label: "Command",
    pages: [
      { id: "dashboard", label: "Dashboard" },
      { id: "hierarchy", label: "Hierarchy" },
      { id: "pricing", label: "Pricing" }
    ]
  },
  {
    label: "Control",
    pages: [
      { id: "kioskAdmins", label: "Kiosk Admins" },
      { id: "kiosks", label: "Kiosks" },
      { id: "services", label: "Services" },
      { id: "payments", label: "Payments" },
      { id: "refunds", label: "Refunds" }
    ]
  }
];

const collections = {
  kioskAdmins: {
    title: "Kiosk Admin CRUD",
    subtitle: "Create kiosk admin logins and assign kiosk IDs they can manage.",
    key: "adminId",
    columns: ["adminId", "name", "email", "status", "kioskIds", "lastLoginAt"],
    fields: [
      { key: "adminId", label: "Admin ID", required: true },
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", required: true },
      { key: "password", label: "Password" },
      { key: "status", label: "Status", type: "select", options: ["active", "disabled"] },
      { key: "kioskIds", label: "Extra Kiosk IDs" }
    ],
    defaults: () => ({
      adminId: `admin-${Date.now().toString().slice(-5)}`,
      name: "New Kiosk Admin",
      email: "",
      password: "",
      status: "active",
      kioskIds: []
    })
  },
  kiosks: {
    title: "Kiosk CRUD",
    subtitle: "Kiosk identity, branch, devices, app version, and operational status.",
    key: "kioskId",
    columns: ["kioskId", "name", "branch", "adminId", "status", "printer", "scanner", "appVersion", "lastOnline"],
    fields: [
      { key: "kioskId", label: "Kiosk ID", required: true },
      { key: "name", label: "Name", required: true },
      { key: "branch", label: "Branch", required: true },
      { key: "adminId", label: "Kiosk Admin ID", required: true },
      { key: "status", label: "Status", type: "select", options: ["online", "offline", "maintenance"] },
      { key: "printer", label: "Printer" },
      { key: "scanner", label: "Scanner" },
      { key: "appVersion", label: "App Version" },
      { key: "lastOnline", label: "Last Online" }
    ],
    defaults: () => ({
      kioskId: `KIOSK-${Date.now().toString().slice(-5)}`,
      name: "New Kiosk",
      branch: "Unassigned Branch",
      adminId: state.snapshot?.data?.kioskAdmins?.[0]?.adminId || "default-admin",
      status: "offline",
      printer: "unknown",
      scanner: "unknown",
      appVersion: "1.0.0",
      lastOnline: new Date().toISOString()
    })
  },
  services: {
    title: "Service CRUD",
    subtitle: "Customer services, kiosk assignment, rates, service images, and nested form templates.",
    key: "id",
    columns: ["id", "title", "mode", "enabled", "kioskIds", "bw", "color", "templates"],
    fields: [],
    defaults: () => ({
      id: `service-${Date.now().toString().slice(-5)}`,
      icon: "SV",
      title: "New Service",
      description: "Customer service.",
      defaultPages: 1,
      mode: "upload",
      imageUrl: "",
      enabled: true,
      kioskIds: [],
      pricing: { bw: 2, color: 10 },
      templates: []
    })
  },
  jobs: {
    title: "Job CRUD",
    subtitle: "Print jobs across all kiosks, services, payment states, and print states.",
    key: "jobId",
    columns: ["jobId", "kioskId", "service", "fileName", "pageCount", "copies", "amount", "paymentStatus", "printStatus"],
    fields: [
      { key: "jobId", label: "Job ID", required: true },
      { key: "kioskId", label: "Kiosk ID", required: true },
      { key: "service", label: "Service ID", required: true },
      { key: "fileName", label: "File Name", required: true },
      { key: "fileType", label: "File Type" },
      { key: "pageCount", label: "Pages", type: "number" },
      { key: "copies", label: "Copies", type: "number" },
      { key: "colorMode", label: "Color Mode", type: "select", options: ["bw", "color"] },
      { key: "paperSize", label: "Paper Size", type: "select", options: ["A4", "A3", "Letter"] },
      { key: "amount", label: "Amount", type: "number" },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "printStatus", label: "Print Status" }
    ],
    defaults: () => ({
      jobId: `JOB-${Date.now()}`,
      kioskId: firstKioskId(),
      service: firstServiceId(),
      fileName: "admin-created-job.pdf",
      fileType: "PDF",
      pageCount: 1,
      copies: 1,
      colorMode: "bw",
      paperSize: "A4",
      amount: 0,
      paymentStatus: "Draft",
      printStatus: "Draft",
      createdAt: new Date().toISOString(),
      completedAt: null
    })
  },
  payments: {
    title: "Payment CRUD",
    subtitle: "Payment records, gateway references, reconciliation status, and job links.",
    key: "paymentId",
    columns: ["paymentId", "jobId", "gateway", "amount", "currency", "paymentMethod", "status", "createdAt"],
    fields: [
      { key: "paymentId", label: "Payment ID", required: true },
      { key: "jobId", label: "Job ID" },
      { key: "gateway", label: "Gateway" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "amountInPaise", label: "Amount In Paise", type: "number" },
      { key: "currency", label: "Currency" },
      { key: "paymentMethod", label: "Payment Method" },
      { key: "razorpayOrderId", label: "Gateway Order ID" },
      { key: "razorpayPaymentId", label: "Gateway Payment ID" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created At" }
    ],
    defaults: () => ({
      paymentId: `PAY-${Date.now()}`,
      gateway: "manual",
      jobId: "",
      amount: 0,
      amountInPaise: 0,
      currency: "INR",
      paymentMethod: "Manual",
      status: "Pending",
      createdAt: new Date().toISOString()
    })
  },
  refunds: {
    title: "Refund CRUD",
    subtitle: "Refund requests, reasons, linked payment/job, amount, and approval status.",
    key: "refundId",
    columns: ["refundId", "jobId", "paymentId", "amount", "reason", "status", "requestedAt"],
    fields: [
      { key: "refundId", label: "Refund ID", required: true },
      { key: "jobId", label: "Job ID" },
      { key: "paymentId", label: "Payment ID" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "reason", label: "Reason", type: "textarea" },
      { key: "status", label: "Status", type: "select", options: ["Refund Pending", "Approved", "Rejected", "Paid"] },
      { key: "requestedAt", label: "Requested At" }
    ],
    defaults: () => ({
      refundId: `REF-${Date.now()}`,
      jobId: "",
      paymentId: "",
      amount: 0,
      reason: "Admin refund",
      status: "Refund Pending",
      requestedAt: new Date().toISOString()
    })
  }
};

function qs(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function slug(value, fallback = "record") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function firstKioskId() {
  return state.snapshot?.data?.kiosks?.[0]?.kioskId || "KIOSK-BANK-01";
}

function firstServiceId() {
  return state.snapshot?.data?.services?.[0]?.id || "print";
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: state.authToken
      ? { ...(options.headers || {}), Authorization: `Bearer ${state.authToken}` }
      : options.headers
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

async function loadSnapshot({ quiet = false } = {}) {
  if (!quiet) {
    state.loading = true;
    state.error = "";
    render();
  }

  try {
    const snapshot = await fetchJson("/api/super-admin/snapshot");
    state.snapshot = snapshot;
    state.pricingDraft = clone(snapshot.data?.pricing || {});
    state.error = "";
  } catch (error) {
    state.error = error.message || "Super admin backend is offline.";
  } finally {
    state.loading = false;
    render();
  }
}

function data(collection) {
  return state.snapshot?.data?.[collection] || [];
}

function pricingFor(serviceId) {
  return state.pricingDraft?.[serviceId] || state.snapshot?.data?.pricing?.[serviceId] || { bw: 0, color: 0 };
}

function render() {
  const app = qs("#app");
  app.innerHTML = state.authed ? renderShell() : renderLogin();
  bindEvents();
}

function renderLogin() {
  return `
    <div class="app-shell admin-shell">
      <header class="topbar admin-topbar">
        <div class="brand">
          <div class="brand-mark">SA</div>
          <div>
            <div class="brand-title">Super Admin Console</div>
            <div class="brand-subtitle">Platform hierarchy and master data control</div>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" data-action="open-kiosk-admin">Kiosk Admin</button>
        </div>
      </header>
      <main class="main admin-screen">
        <div class="login-view">
          <div class="login-panel">
            <h1>Super Admin Login</h1>
            ${state.loginError ? `<div class="empty-note">${escapeHtml(state.loginError)}</div>` : ""}
            <label>Email or mobile
              <input value="${escapeHtml(state.loginDraft.email)}" autocomplete="username" data-login-field="email" />
            </label>
            <label>Password
              <input type="password" value="${escapeHtml(state.loginDraft.password)}" autocomplete="current-password" data-login-field="password" />
            </label>
            <button class="primary-button" data-action="login">Open Super Admin</button>
          </div>
        </div>
      </main>
    </div>
  `;
}

function renderShell() {
  return `
    <div class="app-shell admin-shell">
      ${renderTopbar()}
      <main class="main admin-screen">
        <div class="admin-layout super-admin-layout">
          ${renderNav()}
          <section class="admin-main">
            ${renderCurrentPage()}
          </section>
        </div>
      </main>
    </div>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-mark">SA</div>
        <div>
          <div class="brand-title">Super Admin Console</div>
          <div class="brand-subtitle">Hierarchy, kiosks, services, jobs, payments, refunds</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="open-kiosk-admin">Kiosk Admin</button>
        <button class="ghost-button" data-action="refresh">Refresh</button>
        <button class="secondary-button" data-action="export-json">Export JSON</button>
        <button class="danger-button" data-action="logout">Logout</button>
      </div>
    </header>
  `;
}

function renderNav() {
  return `
    <nav class="admin-nav">
      ${pageGroups.map((group) => `
        <div class="admin-nav-group">
          <div class="admin-nav-label">${escapeHtml(group.label)}</div>
          ${group.pages.map((page) => `
            <button class="${state.page === page.id ? "active" : ""}" data-page="${page.id}">${escapeHtml(page.label)}</button>
          `).join("")}
        </div>
      `).join("")}
    </nav>
  `;
}

function renderCurrentPage() {
  if (state.loading && !state.snapshot) {
    return `<div class="empty-note">Loading super admin data...</div>`;
  }

  if (state.error && !state.snapshot) {
    return `
      ${renderHeader("Super Admin", "Backend connection required.", `<button class="primary-button" data-action="refresh">Retry</button>`)}
      <div class="empty-note">${escapeHtml(state.error)}</div>
    `;
  }

  if (state.page === "dashboard") return renderDashboard();
  if (state.page === "hierarchy") return renderHierarchy();
  if (state.page === "pricing") return renderPricing();
  if (state.page === "services") return renderKioskServices();
  if (collections[state.page]) return renderCollection(state.page);
  return renderDashboard();
}

function renderHeader(title, subtitle, action = "") {
  return `
    <div class="admin-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="flow-actions">${action}</div>
    </div>
  `;
}

function renderNotice() {
  const notices = [
    state.notice ? `<div class="save-note">${escapeHtml(state.notice)}</div>` : "",
    state.error ? `<div class="empty-note" style="margin-bottom: 16px;">${escapeHtml(state.error)}</div>` : ""
  ].filter(Boolean);

  return notices.join("");
}

function renderDashboard() {
  const summary = state.snapshot?.summary || {};
  const failedJobs = data("jobs").filter((job) => /failed/i.test(job.printStatus || ""));
  const recentJobs = data("jobs").slice(-5).reverse();
  const pendingRefunds = data("refunds").filter((refund) => /pending/i.test(refund.status || ""));

  return `
    ${renderHeader("Super Admin Dashboard", "Master operational view across every kiosk and record.", `<button class="primary-button" data-page="hierarchy">Open Hierarchy</button>`)}
    ${renderNotice()}
    <div class="metrics-grid">
      ${[
        ["Kiosks", summary.kiosks || 0, `${summary.activeKiosks || 0} online`],
        ["Services", summary.services || 0, `${summary.templates || 0} templates`],
        ["Jobs", summary.jobs || 0, `${summary.failedJobs || 0} failed`],
        ["Payments", summary.payments || 0, money(summary.gross || 0)],
        ["Refunds", summary.refunds || 0, `${pendingRefunds.length} pending`],
        ["Net Revenue", money(summary.net || 0), "After refunds"],
        ["Backend", state.error ? "Offline" : "Online", state.snapshot?.updatedAt ? formatDateTime(state.snapshot.updatedAt) : ""],
        ["Records", totalRecords(), "All collections"]
      ].map(([label, value, detail]) => `
        <div class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
      `).join("")}
    </div>
    <div class="module-grid">
      <div class="module-card">
        <h2>Recent Jobs</h2>
        <div class="info-list">
          ${(recentJobs.length ? recentJobs : [{ jobId: "No jobs", fileName: "", printStatus: "" }]).map((job) => `
            <div class="info-row">
              <span>${escapeHtml(job.jobId)} ${escapeHtml(job.fileName || "")}</span>
              <strong>${escapeHtml(job.printStatus || "")}</strong>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="module-card">
        <h2>Support Queue</h2>
        <div class="health-list">
          ${renderHealth("Failed jobs", `${failedJobs.length}`, failedJobs.length ? "warn" : "good")}
          ${renderHealth("Pending refunds", `${pendingRefunds.length}`, pendingRefunds.length ? "warn" : "good")}
          ${renderHealth("Kiosk records", `${summary.kiosks || 0}`, summary.kiosks ? "good" : "warn")}
        </div>
      </div>
    </div>
  `;
}

function totalRecords() {
  return ["kiosks", "services", "jobs", "payments", "refunds"]
    .reduce((sum, key) => sum + data(key).length, 0);
}

function renderHealth(label, value, tone) {
  return `
    <div class="health-row">
      <span>${escapeHtml(label)}</span>
      <strong class="badge ${tone}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderHierarchy() {
  const hierarchy = state.snapshot?.hierarchy || [];

  return `
    ${renderHeader("Kiosk Hierarchy", "Kiosk to service to template, job, payment, and refund ownership.", `<button class="primary-button" data-collection-create="kiosks">Add Kiosk</button>`)}
    ${renderNotice()}
    <div class="super-tree">
      ${hierarchy.length ? hierarchy.map(renderKioskNode).join("") : `<div class="empty-note">No kiosks found.</div>`}
    </div>
    ${renderEditorPanel()}
  `;
}

function renderKioskNode(kiosk) {
  return `
    <div class="hierarchy-node">
      <div class="hierarchy-node-head">
        <div>
          <h2>${escapeHtml(kiosk.kioskId)} | ${escapeHtml(kiosk.branch || "")}</h2>
          <p class="helper-text">${escapeHtml(kiosk.name || "")} | ${escapeHtml(kiosk.status || "")} | ${escapeHtml(kiosk.printer || "unknown printer")}</p>
        </div>
        <div class="flow-actions">
          <button class="secondary-button" data-record-edit="kiosks" data-record-id="${escapeHtml(kiosk.kioskId)}">Edit Kiosk</button>
        </div>
      </div>
      <div class="hierarchy-stats">
        ${renderMiniStat("Services", kiosk.services?.length || 0)}
        ${renderMiniStat("Jobs", kiosk.totals?.jobs || 0)}
        ${renderMiniStat("Revenue", money(kiosk.totals?.revenue || 0))}
        ${renderMiniStat("Failures", kiosk.totals?.failedJobs || 0)}
      </div>
      <div class="hierarchy-children">
        ${(kiosk.services || []).map((service) => renderServiceNode(kiosk, service)).join("")}
      </div>
      <div class="hierarchy-records">
        <h3>Jobs</h3>
        ${renderSmallTable(["Job", "File", "Payment", "Print"], (kiosk.jobs || []).map((job) => [
          job.jobId,
          job.fileName,
          job.paymentStatus,
          job.printStatus
        ]), "No jobs for this kiosk.")}
      </div>
    </div>
  `;
}

function renderServiceNode(kiosk, service) {
  const rates = service.pricing || pricingFor(service.id);

  return `
    <div class="hierarchy-service">
      <div class="hierarchy-service-head">
        <div>
          <strong>${escapeHtml(service.title)}</strong>
          <span>${escapeHtml(service.id)} | ${escapeHtml(service.mode)} | ${service.enabled === false ? "disabled" : "enabled"}</span>
        </div>
        <button class="ghost-button" data-record-edit="services" data-record-id="${escapeHtml(service.id)}">Edit</button>
      </div>
      <div class="hierarchy-stats compact">
        ${renderMiniStat("B/W", money(rates.bw || 0))}
        ${renderMiniStat("Color", money(rates.color || 0))}
        ${renderMiniStat("Templates", service.templates?.length || 0)}
        ${renderMiniStat("Jobs", service.jobCount || 0)}
      </div>
      ${(service.templates || []).length ? `
        <div class="template-chip-row">
          ${service.templates.map((template) => `<span class="template-chip">${escapeHtml(template.title)}</span>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderMiniStat(label, value) {
  return `
    <div class="mini-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderSmallTable(headers, rows, emptyMessage) {
  const displayRows = rows.length ? rows : [[emptyMessage, "", "", ""]];

  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${displayRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function selectedKioskId() {
  const kiosks = data("kiosks");

  if (!state.selectedKioskId || !kiosks.some((kiosk) => kiosk.kioskId === state.selectedKioskId)) {
    state.selectedKioskId = kiosks[0]?.kioskId || "";
  }

  return state.selectedKioskId;
}

function serviceForKiosk(service, kioskId) {
  const kioskIds = service.kioskIds || [];
  return !kioskId || !kioskIds.length || kioskIds.includes(kioskId);
}

function serviceScopeLabel(service, kioskId) {
  const kioskIds = service.kioskIds || [];
  if (!kioskIds.length) return "All kiosks";
  if (kioskIds.length === 1 && kioskIds[0] === kioskId) return "This kiosk";
  return `${kioskIds.length} kiosks`;
}

function serviceScopeTone(service) {
  if (service.enabled === false) return "bad";
  return (service.kioskIds || []).length ? "warn" : "good";
}

function renderServiceIcon(service) {
  if (service.imageUrl) {
    return `<span class="kiosk-service-icon image"><img alt="" src="${escapeHtml(service.imageUrl)}" /></span>`;
  }

  return `<span class="kiosk-service-icon">${escapeHtml(service.icon || service.title?.slice(0, 2) || "SV")}</span>`;
}

function renderKioskServices() {
  const kiosks = data("kiosks");
  const kioskId = selectedKioskId();
  const selectedKiosk = kiosks.find((kiosk) => kiosk.kioskId === kioskId);
  const search = state.search.trim().toLowerCase();
  const services = data("services")
    .filter((service) => serviceForKiosk(service, kioskId))
    .filter((service) => !search || JSON.stringify(service).toLowerCase().includes(search));

  return `
    ${renderHeader(
      "Kiosk Wise Services",
      selectedKiosk
        ? `${selectedKiosk.kioskId} | ${selectedKiosk.branch || selectedKiosk.name || "Selected kiosk"}`
        : "Create a kiosk first, then assign services.",
      `<button class="primary-button" data-kiosk-service-create ${kioskId ? "" : "disabled"}>Add Service</button><button class="secondary-button" data-action="refresh">Refresh</button>`
    )}
    ${renderNotice()}
    ${!kiosks.length ? `
      <div class="empty-note">No kiosks found. Open Kiosks and create a kiosk before adding kiosk-wise services.</div>
    ` : `
      <div class="kiosk-service-layout">
        <aside class="kiosk-picker">
          <div class="kiosk-picker-title">Kiosks</div>
          ${kiosks.map((kiosk) => `
            <button class="${kiosk.kioskId === kioskId ? "active" : ""}" data-kiosk-select="${escapeHtml(kiosk.kioskId)}">
              <strong>${escapeHtml(kiosk.kioskId)}</strong>
              <span>${escapeHtml(kiosk.branch || kiosk.name || kiosk.status || "")}</span>
            </button>
          `).join("")}
        </aside>
        <section class="kiosk-service-main">
          <div class="filters">
            <input placeholder="Search services for ${escapeHtml(kioskId)}" value="${escapeHtml(state.search)}" data-action-input="search" />
          </div>
          <div class="kiosk-service-grid">
            ${services.length ? services.map((service) => renderKioskServiceCard(service, kioskId)).join("") : `
              <div class="empty-note">No services match this kiosk and search.</div>
            `}
          </div>
          ${renderEditorPanel()}
        </section>
      </div>
    `}
  `;
}

function renderKioskServiceCard(service, kioskId) {
  const rates = service.pricing || pricingFor(service.id);
  const templates = service.templates || [];

  return `
    <article class="module-card kiosk-service-card">
      <div class="kiosk-service-head">
        ${renderServiceIcon(service)}
        <div>
          <h2>${escapeHtml(service.title)}</h2>
          <p class="helper-text">${escapeHtml(service.id)} | ${escapeHtml(service.mode || "upload")}</p>
        </div>
        <span class="badge ${serviceScopeTone(service)}">${escapeHtml(serviceScopeLabel(service, kioskId))}</span>
      </div>
      <p class="helper-text">${escapeHtml(service.description || "Customer service.")}</p>
      <div class="kiosk-service-stats">
        ${renderMiniStat("B/W", money(rates.bw || 0))}
        ${renderMiniStat("Color", money(rates.color || 0))}
        ${renderMiniStat("Forms", templates.length)}
        ${renderMiniStat("Status", service.enabled === false ? "Off" : "On")}
      </div>
      ${templates.length ? `
        <div class="template-chip-row">
          ${templates.map((template) => `<span class="template-chip">${escapeHtml(template.title)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="table-actions">
        <button class="secondary-button small-button" data-kiosk-service-edit="${escapeHtml(service.id)}">Edit</button>
        <button class="danger-button small-button" data-kiosk-service-delete="${escapeHtml(service.id)}">Delete from Kiosk</button>
      </div>
    </article>
  `;
}

function renderCollection(collection) {
  const meta = collections[collection];
  const rows = filteredRows(collection);

  return `
    ${renderHeader(meta.title, meta.subtitle, `<button class="primary-button" data-collection-create="${collection}">Create</button>`)}
    ${renderNotice()}
    <div class="filters">
      <input placeholder="Search ${escapeHtml(collection)}" value="${escapeHtml(state.search)}" data-action-input="search" />
      <button class="secondary-button" data-action="refresh">Refresh</button>
    </div>
    ${renderCollectionTable(collection, rows)}
    ${renderEditorPanel()}
  `;
}

function filteredRows(collection) {
  const rows = data(collection);
  const search = state.search.trim().toLowerCase();

  if (!search) return rows;

  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search));
}

function renderCollectionTable(collection, rows) {
  const meta = collections[collection];
  const columns = meta.columns;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(labelize(column))}</th>`).join("")}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              ${columns.map((column) => `<td>${formatCell(collection, column, row)}</td>`).join("")}
              <td>
                <div class="table-actions">
                  <button class="secondary-button small-button" data-record-edit="${collection}" data-record-id="${escapeHtml(row[meta.key])}">Edit</button>
                  <button class="danger-button small-button" data-record-delete="${collection}" data-record-id="${escapeHtml(row[meta.key])}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("") : `
            <tr><td colspan="${columns.length + 1}">No ${escapeHtml(collection)} records found.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function labelize(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCell(collection, column, row) {
  if (collection === "services" && column === "bw") return escapeHtml(money((row.pricing || pricingFor(row.id)).bw || 0));
  if (collection === "services" && column === "color") return escapeHtml(money((row.pricing || pricingFor(row.id)).color || 0));
  if (collection === "services" && column === "templates") return escapeHtml(String(row.templates?.length || 0));
  if (column === "kioskIds") return escapeHtml((row.kioskIds || []).join(", ") || "All");
  if (column === "amount") return escapeHtml(money(row[column] || 0));
  if (/At$|Date|Online/i.test(column)) return escapeHtml(formatDateTime(row[column]));
  if (Array.isArray(row[column])) return escapeHtml(row[column].join(", "));
  if (typeof row[column] === "boolean") return escapeHtml(row[column] ? "Yes" : "No");
  return escapeHtml(row[column] ?? "");
}

function renderEditorPanel() {
  if (!state.editor) return "";

  const { collection } = state.editor;
  if (collection === "services") return renderServiceEditor();
  return renderGenericEditor(collection);
}

function renderGenericEditor(collection) {
  const meta = collections[collection];
  const draft = state.editor.draft;

  return `
    <div class="module-card editor-panel">
      <div class="editor-head">
        <div>
          <h2>${state.editor.mode === "create" ? "Create" : "Edit"} ${escapeHtml(collection.slice(0, -1) || collection)}</h2>
          <p class="helper-text">${escapeHtml(meta.key)}: ${escapeHtml(draft[meta.key] || "new")}</p>
        </div>
        <button class="ghost-button" data-editor-cancel>Close</button>
      </div>
      <div class="settings-grid service-editor-grid">
        ${meta.fields.map((field) => renderField(field, draft, state.editor.mode === "edit" && field.key === meta.key)).join("")}
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-editor-save>Save</button>
        <button class="ghost-button" data-editor-cancel>Cancel</button>
      </div>
    </div>
  `;
}

function renderField(field, draft, disabled = false) {
  const value = draft[field.key] ?? "";

  if (field.type === "select") {
    return `
      <label class="setting-field">${escapeHtml(field.label)}
        <select data-editor-field="${escapeHtml(field.key)}" ${disabled ? "disabled" : ""}>
          ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "textarea") {
    return `
      <label class="setting-field">${escapeHtml(field.label)}
        <textarea data-editor-field="${escapeHtml(field.key)}" ${disabled ? "disabled" : ""}>${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  return `
    <label class="setting-field">${escapeHtml(field.label)}
      <input type="${field.type === "number" ? "number" : field.key === "password" ? "password" : "text"}" value="${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}" data-editor-field="${escapeHtml(field.key)}" ${disabled ? "disabled" : ""} />
    </label>
  `;
}

function renderServiceEditor() {
  const draft = state.editor.draft;
  const editing = state.editor.mode === "edit";
  const rates = draft.pricing || { bw: 0, color: 0 };

  return `
    <div class="module-card editor-panel">
      <div class="editor-head">
        <div>
          <h2>${editing ? "Edit Service" : "Create Service"}</h2>
          <p class="helper-text">${escapeHtml(draft.id || "new-service")} | ${escapeHtml(draft.mode || "upload")}</p>
        </div>
        <button class="ghost-button" data-editor-cancel>Close</button>
      </div>
      <div class="settings-grid service-editor-grid">
        ${renderField({ key: "id", label: "Service ID" }, draft, editing)}
        ${renderField({ key: "icon", label: "Icon" }, draft)}
        ${renderField({ key: "title", label: "Service Name" }, draft)}
        ${renderField({ key: "description", label: "Description" }, draft)}
        ${renderField({ key: "defaultPages", label: "Default Pages", type: "number" }, draft)}
        ${renderField({ key: "mode", label: "Mode", type: "select", options: ["upload", "template"] }, draft)}
        ${renderField({ key: "enabled", label: "Enabled", type: "select", options: ["true", "false"] }, { ...draft, enabled: String(draft.enabled !== false) })}
        ${renderField({ key: "kioskIds", label: "Assigned Kiosk IDs" }, { ...draft, kioskIds: (draft.kioskIds || []).join(", ") })}
        ${renderField({ key: "imageUrl", label: "Service Image URL" }, draft)}
        ${renderField({ key: "bw", label: "B/W Rate", type: "number" }, { bw: rates.bw || 0 })}
        ${renderField({ key: "color", label: "Color Rate", type: "number" }, { color: rates.color || 0 })}
      </div>
      <div class="template-editor-section">
        <div class="template-editor-header">
          <h3>Templates</h3>
          <button class="secondary-button" data-draft-template-add>Add Template</button>
        </div>
        <div class="template-editor-list">
          ${(draft.templates || []).length ? draft.templates.map(renderDraftTemplate).join("") : `<div class="empty-note">No templates in this service.</div>`}
        </div>
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-editor-save>Save Service</button>
        <button class="ghost-button" data-editor-cancel>Cancel</button>
      </div>
    </div>
  `;
}

function renderDraftTemplate(template, index) {
  return `
    <div class="template-editor-card">
      <div class="template-editor-top">
        <div>
          <h4>${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
          <p class="helper-text">${escapeHtml(template.id || "")}</p>
        </div>
        <button class="danger-button" data-draft-template-delete="${index}">Remove</button>
      </div>
      <div class="settings-grid service-editor-grid">
        <label class="setting-field">Template ID
          <input value="${escapeHtml(template.id || "")}" data-template-index="${index}" data-template-field="id" />
        </label>
        <label class="setting-field">Name
          <input value="${escapeHtml(template.title || "")}" data-template-index="${index}" data-template-field="title" />
        </label>
        <label class="setting-field">Pages
          <input type="number" min="1" value="${Number(template.pages || 1)}" data-template-index="${index}" data-template-field="pages" />
        </label>
        <label class="setting-field">Description
          <input value="${escapeHtml(template.description || "")}" data-template-index="${index}" data-template-field="description" />
        </label>
        <label class="setting-field">Fields
          <input value="${escapeHtml((template.fields || []).join(", "))}" data-template-index="${index}" data-template-field="fields" />
        </label>
        <label class="setting-field">Image URL
          <input value="${escapeHtml(template.imageUrl || "")}" data-template-index="${index}" data-template-field="imageUrl" />
        </label>
      </div>
    </div>
  `;
}

function renderPricing() {
  const services = data("services");

  return `
    ${renderHeader("Pricing Control", "Master B/W and color pricing by service.", `<button class="primary-button" data-pricing-save-all>Save All</button>`)}
    ${renderNotice()}
    <div class="settings-grid pricing-settings-grid">
      ${services.map((service) => {
        const rates = pricingFor(service.id);

        return `
          <div class="setting-field service-pricing-card">
            <div>
              <h2>${escapeHtml(service.title)}</h2>
              <p class="helper-text">${escapeHtml(service.id)}</p>
            </div>
            <label>B/W per page</label>
            <input type="number" min="0" value="${rates.bw || 0}" data-pricing-service="${escapeHtml(service.id)}" data-pricing-key="bw" />
            <label>Color per page</label>
            <input type="number" min="0" value="${rates.color || 0}" data-pricing-service="${escapeHtml(service.id)}" data-pricing-key="color" />
            <button class="secondary-button" data-pricing-save="${escapeHtml(service.id)}">Save ${escapeHtml(service.id)}</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function bindEvents() {
  const app = qs("#app");
  app.onclick = handleClick;
  app.oninput = handleInput;
  app.onchange = handleInput;
}

async function superAdminLogin() {
  const email = state.loginDraft.email.trim();
  const password = state.loginDraft.password;

  if (!email || !password) {
    state.loginError = "Enter super admin email and password.";
    render();
    return;
  }

  try {
    const payload = await fetchJson("/api/super-admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    state.authed = true;
    state.authToken = payload.token || "";
    state.loginError = "";
    state.loginDraft.password = "";
    await loadSnapshot();
  } catch (error) {
    state.authed = false;
    state.authToken = "";
    state.loginError = error.message || "Super admin login failed.";
    render();
  }
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;

  if (button.dataset.action === "login") {
    await superAdminLogin();
    return;
  }

  if (button.dataset.action === "logout") {
    state.authed = false;
    state.authToken = "";
    state.editor = null;
    state.notice = "";
    render();
    return;
  }

  if (button.dataset.action === "open-kiosk-admin") {
    window.location.href = `./admin.html${window.location.search || ""}`;
    return;
  }

  if (button.dataset.action === "refresh") {
    await loadSnapshot();
    return;
  }

  if (button.dataset.action === "export-json") {
    exportSnapshot();
    return;
  }

  if (button.dataset.page) {
    state.page = button.dataset.page;
    state.editor = null;
    state.search = "";
    render();
    return;
  }

  if (button.dataset.kioskSelect) {
    state.selectedKioskId = button.dataset.kioskSelect;
    state.editor = null;
    state.search = "";
    render();
    return;
  }

  if ("kioskServiceCreate" in button.dataset) {
    beginCreateServiceForKiosk();
    return;
  }

  if (button.dataset.kioskServiceEdit) {
    beginEdit("services", button.dataset.kioskServiceEdit);
    return;
  }

  if (button.dataset.kioskServiceDelete) {
    await deleteKioskService(button.dataset.kioskServiceDelete);
    return;
  }

  if (button.dataset.collectionCreate) {
    beginCreate(button.dataset.collectionCreate);
    return;
  }

  if (button.dataset.recordEdit && button.dataset.recordId) {
    beginEdit(button.dataset.recordEdit, button.dataset.recordId);
    return;
  }

  if (button.dataset.recordDelete && button.dataset.recordId) {
    await deleteRecord(button.dataset.recordDelete, button.dataset.recordId);
    return;
  }

  if ("editorCancel" in button.dataset) {
    state.editor = null;
    render();
    return;
  }

  if ("editorSave" in button.dataset) {
    await saveEditor();
    return;
  }

  if ("draftTemplateAdd" in button.dataset) {
    addDraftTemplate();
    return;
  }

  if (button.dataset.draftTemplateDelete) {
    deleteDraftTemplate(Number(button.dataset.draftTemplateDelete));
    return;
  }

  if (button.dataset.pricingSave) {
    await savePricing(button.dataset.pricingSave);
    return;
  }

  if ("pricingSaveAll" in button.dataset) {
    await saveAllPricing();
  }
}

function handleInput(event) {
  const target = event.target;

  if (target.dataset.loginField) {
    state.loginDraft[target.dataset.loginField] = target.value;
    state.loginError = "";
    return;
  }

  if (target.dataset.actionInput === "search") {
    state.search = target.value;
    render();
    return;
  }

  if (target.dataset.editorField) {
    updateDraftField(target.dataset.editorField, target.value);
    return;
  }

  if (target.dataset.templateField) {
    updateDraftTemplate(Number(target.dataset.templateIndex || 0), target.dataset.templateField, target.value);
    return;
  }

  if (target.dataset.pricingService && target.dataset.pricingKey) {
    const serviceId = target.dataset.pricingService;
    state.pricingDraft = {
      ...state.pricingDraft,
      [serviceId]: {
        ...(state.pricingDraft[serviceId] || {}),
        [target.dataset.pricingKey]: numeric(target.value, 0)
      }
    };
  }
}

function beginCreate(collection) {
  state.page = collection;
  state.editor = {
    mode: "create",
    collection,
    draft: clone(collections[collection].defaults())
  };
  state.notice = "";
  render();
}

function beginCreateServiceForKiosk() {
  const kioskId = selectedKioskId();
  const draft = clone(collections.services.defaults());

  draft.kioskIds = kioskId ? [kioskId] : [];

  state.page = "services";
  state.editor = {
    mode: "create",
    collection: "services",
    draft
  };
  state.notice = "";
  render();
}

function beginEdit(collection, id) {
  const meta = collections[collection];
  const record = data(collection).find((item) => String(item[meta.key]) === String(id));
  if (!record) return;

  const draft = clone(record);
  if (collection === "services") {
    draft.pricing = clone(record.pricing || pricingFor(record.id));
    draft.templates = clone(record.templates || []);
  }

  state.page = collection === "kiosks" || collection === "services" ? "hierarchy" : collection;
  if (collections[collection]) state.page = collection;
  state.editor = {
    mode: "edit",
    collection,
    id,
    draft
  };
  state.notice = "";
  render();
}

async function deleteKioskService(serviceId) {
  const kioskId = selectedKioskId();
  const service = data("services").find((item) => item.id === serviceId);

  if (!service || !kioskId) return;

  const kioskIds = data("kiosks").map((kiosk) => kiosk.kioskId).filter(Boolean);
  const assignedIds = Array.isArray(service.kioskIds) ? service.kioskIds : [];
  const nextKioskIds = assignedIds.length
    ? assignedIds.filter((id) => id !== kioskId)
    : kioskIds.filter((id) => id !== kioskId);
  const shouldDeleteRecord = nextKioskIds.length === 0;
  const message = shouldDeleteRecord
    ? `Delete service ${service.title || service.id}? It will be removed because no kiosk remains assigned.`
    : `Remove service ${service.title || service.id} from ${kioskId}? It will remain available for ${nextKioskIds.length} other kiosk${nextKioskIds.length === 1 ? "" : "s"}.`;

  if (!window.confirm(message)) return;

  state.notice = shouldDeleteRecord ? "Deleting service..." : "Removing service from kiosk...";
  render();

  try {
    if (shouldDeleteRecord) {
      await fetchJson(`/api/super-admin/services/${encodeURIComponent(serviceId)}`, {
        method: "DELETE"
      });
      state.notice = "Service deleted.";
    } else {
      await fetchJson(`/api/super-admin/services/${encodeURIComponent(serviceId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...service,
          kioskIds: nextKioskIds
        })
      });
      state.notice = `Service removed from ${kioskId}.`;
    }

    state.editor = null;
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Service delete failed.";
    render();
  }
}

function updateDraftField(field, value) {
  if (!state.editor) return;
  const draft = state.editor.draft;

  if (state.editor.collection === "services") {
    if (field === "enabled") {
      draft.enabled = value === true || value === "true";
    } else if (field === "kioskIds") {
      draft.kioskIds = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (field === "bw" || field === "color") {
      draft.pricing = {
        ...(draft.pricing || {}),
        [field]: numeric(value, 0)
      };
    } else if (field === "defaultPages") {
      draft.defaultPages = Math.max(1, Number(value) || 1);
    } else {
      draft[field] = value;
      if (field === "title" && !draft.id) draft.id = slug(value, "service");
    }
    return;
  }

  const meta = collections[state.editor.collection];
  const fieldConfig = meta.fields.find((item) => item.key === field) || {};
  if (field === "kioskIds") {
    draft[field] = String(value || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  } else {
    draft[field] = fieldConfig.type === "number" ? numeric(value, 0) : value;
  }
}

function updateDraftTemplate(index, field, value) {
  if (!state.editor || state.editor.collection !== "services") return;
  const templates = state.editor.draft.templates || [];
  const template = templates[index];
  if (!template) return;

  if (field === "fields") {
    template.fields = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  } else if (field === "pages") {
    template.pages = Math.max(1, Number(value) || 1);
  } else {
    template[field] = value;
    if (field === "title" && !template.id) template.id = slug(value, `template-${index + 1}`);
  }
}

function addDraftTemplate() {
  if (!state.editor || state.editor.collection !== "services") return;
  const templates = state.editor.draft.templates || [];
  const title = `Template ${templates.length + 1}`;
  templates.push({
    id: slug(title, `template-${templates.length + 1}`),
    title,
    description: "Blank printable template.",
    pages: 1,
    fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
    imageUrl: ""
  });
  state.editor.draft.templates = templates;
  state.editor.draft.mode = "template";
  render();
}

function deleteDraftTemplate(index) {
  if (!state.editor || state.editor.collection !== "services") return;
  state.editor.draft.templates = (state.editor.draft.templates || []).filter((_, itemIndex) => itemIndex !== index);
  render();
}

function editorPayload() {
  syncEditorDraftFromDom();
  const draft = clone(state.editor.draft);

  if (state.editor.collection === "services") {
    draft.icon = String(draft.icon || "SV").trim().toUpperCase().slice(0, 3);
    draft.id = slug(draft.id || draft.title, "service");
    draft.kioskIds = Array.isArray(draft.kioskIds) ? draft.kioskIds : String(draft.kioskIds || "").split(",").map((item) => item.trim()).filter(Boolean);
    draft.pricing = {
      bw: numeric(draft.pricing?.bw, 0),
      color: numeric(draft.pricing?.color, 0)
    };
    draft.templates = (draft.templates || []).map((template, index) => ({
      id: slug(template.id || template.title, `template-${index + 1}`),
      title: String(template.title || `Template ${index + 1}`).trim(),
      description: String(template.description || "Blank printable template.").trim(),
      pages: Math.max(1, Number(template.pages || 1)),
      fields: Array.isArray(template.fields) ? template.fields : String(template.fields || "").split(",").map((item) => item.trim()).filter(Boolean),
      imageUrl: String(template.imageUrl || "").trim()
    })).filter((template) => template.title);
  }

  if (state.editor.collection === "kioskAdmins") {
    draft.adminId = slug(draft.adminId || draft.email || draft.name, "kiosk-admin");
    draft.email = String(draft.email || "").trim().toLowerCase();
    draft.status = draft.status === "disabled" ? "disabled" : "active";
    draft.kioskIds = Array.isArray(draft.kioskIds)
      ? draft.kioskIds.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
      : String(draft.kioskIds || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  }

  return draft;
}

function syncEditorDraftFromDom() {
  if (!state.editor) return;

  document.querySelectorAll("[data-editor-field]").forEach((input) => {
    updateDraftField(input.dataset.editorField, input.value);
  });
  document.querySelectorAll("[data-template-field][data-template-index]").forEach((input) => {
    updateDraftTemplate(Number(input.dataset.templateIndex || 0), input.dataset.templateField, input.value);
  });
}

async function saveEditor() {
  if (!state.editor) return;
  const { collection, mode, id } = state.editor;
  const payload = editorPayload();
  const method = mode === "create" ? "POST" : "PUT";
  const path = mode === "create"
    ? `/api/super-admin/${collection}`
    : `/api/super-admin/${collection}/${encodeURIComponent(id)}`;

  state.notice = "Saving...";
  render();

  try {
    await fetchJson(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    state.notice = `${collections[collection].title.replace(" CRUD", "")} saved.`;
    state.editor = null;
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Save failed.";
    render();
  }
}

async function deleteRecord(collection, id) {
  const meta = collections[collection];
  const confirmed = window.confirm(`Delete ${collection.slice(0, -1)} ${id}?`);
  if (!confirmed) return;

  state.notice = "Deleting...";
  render();

  try {
    await fetchJson(`/api/super-admin/${collection}/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    state.notice = `${meta.title.replace(" CRUD", "")} deleted.`;
    state.editor = null;
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Delete failed.";
    render();
  }
}

async function savePricing(serviceId) {
  const rates = pricingFor(serviceId);
  state.notice = "Saving pricing...";
  render();

  try {
    await fetchJson(`/api/super-admin/pricing/${encodeURIComponent(serviceId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rates)
    });
    state.notice = "Pricing saved.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Pricing save failed.";
    render();
  }
}

async function saveAllPricing() {
  state.notice = "Saving all pricing...";
  render();

  try {
    await fetchJson("/api/super-admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.pricingDraft)
    });
    state.notice = "All pricing saved.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Pricing save failed.";
    render();
  }
}

function exportSnapshot() {
  if (!state.snapshot) return;
  const blob = new Blob([JSON.stringify(state.snapshot, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `printing-kiosk-super-admin-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

render();
