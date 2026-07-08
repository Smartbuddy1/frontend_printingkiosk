const runtimeConfig = new URLSearchParams(window.location.search);
const frontendConfig = window.PRINTING_KIOSK_CONFIG || {};
const DEFAULT_BACKEND_URL = /^https?:$/.test(window.location.protocol) ? window.location.origin : "http://localhost:5080";
const BACKEND_URL = (runtimeConfig.get("backendUrl") || frontendConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
const ADMIN_SESSION_KEY = "printingKioskAdminSession";
const UNASSIGNED_KIOSK_ID = "UNASSIGNED-KIOSK";
const DEFAULT_KIOSK_CUSTOMER_SETTINGS = Object.freeze({
  bw: true,
  color: true,
  copies: true,
  paperSize: true,
  sides: true,
  orientation: true,
  pageRange: true
});
const KIOSK_CUSTOMER_SETTING_FIELDS = [
  ["bw", "B/W printing"],
  ["color", "Color printing"],
  ["copies", "Copies"],
  ["paperSize", "Paper size"],
  ["sides", "Single / both sides"],
  ["orientation", "Orientation"],
  ["pageRange", "Page range"]
];
const DEFAULT_SERVICE_PRINT_DEFAULTS = Object.freeze({
  colorMode: "bw",
  copies: 1,
  paperSize: "A4",
  sides: "single",
  orientation: "portrait",
  range: "all"
});

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
  transactionFilters: {
    search: "",
    status: "all",
    client: "all",
    kiosk: "all",
    from: "",
    to: ""
  },
  pagination: {},
  selectedClientId: "",
  selectedProjectId: "",
  navOpen: false,
  editor: null,
  pricingDraft: {},
  releaseDraft: {
    version: "",
    channel: "production",
    downloadUrl: "",
    sha256: "",
    signature: "",
    sizeBytes: "",
    rolloutPercentage: 10,
    targetKioskIds: "",
    mandatory: false,
    active: true,
    notes: ""
  }
};

const pageGroups = [
  {
    label: "Setup and Control",
    pages: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "kioskAdmins", label: "Clients", icon: "users" },
      { id: "projects", label: "Projects", icon: "hierarchy" },
      { id: "kiosks", label: "Kiosks", icon: "kiosks" },
      { id: "pricing", label: "Pricing", icon: "pricing" },
      { id: "revenue", label: "Revenue", icon: "payments" }
    ]
  }
];

const collections = {
  projects: {
    title: "Project Management",
    subtitle: "Create projects, allocate each project to a client, then add kiosks under it.",
    key: "projectId",
    columns: ["name", "adminId", "status", "description", "createdAt"],
    fields: [
      { key: "name", label: "Project Name", required: true },
      { key: "adminId", label: "Allocated Client", type: "select-data", collection: "kioskAdmins", valueKey: "adminId", labelKey: "name" },
      { key: "status", label: "Status", type: "select", options: ["active", "inactive"] },
      { key: "description", label: "Description", type: "textarea" }
    ],
    defaults: () => ({
      projectId: `project-${Date.now().toString().slice(-5)}`,
      name: "New Project",
      adminId: state.snapshot?.data?.kioskAdmins?.[0]?.adminId || "",
      status: "active",
      description: ""
    })
  },
  kioskAdmins: {
    title: "Client Management",
    subtitle: "Create client logins first. Allocate each client from the Project form.",
    key: "adminId",
    columns: ["name", "email", "status", "projectIds", "lastLoginAt"],
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", required: true },
      { key: "password", label: "Password" },
      { key: "status", label: "Status", type: "select", options: ["active", "disabled"] }
    ],
    defaults: () => ({
      adminId: `admin-${Date.now().toString().slice(-5)}`,
      name: "New Client",
      email: "",
      password: "",
      status: "active",
      projectIds: []
    })
  },
  kiosks: {
    title: "Kiosk Management",
    subtitle: "Create kiosks under a project. Kiosk creation is available only to super admins.",
    key: "kioskId",
    columns: ["projectId", "kioskId", "name", "branch", "status", "lastOnline"],
    fields: [
      { key: "kioskId", label: "Kiosk ID", required: true },
      { key: "setupCode", label: "Mini PC Setup Code", required: true },
      { key: "name", label: "Name", required: true },
      { key: "projectId", label: "Project", required: true, type: "select-data", collection: "projects", valueKey: "projectId", labelKey: "name" },
      { key: "branch", label: "Branch", required: true }
    ],
    defaults: () => ({
      kioskId: `KIOSK-${Date.now().toString().slice(-5)}`,
      setupCode: generateSetupCode(),
      name: "New Kiosk",
      projectId: state.snapshot?.data?.projects?.[0]?.projectId || "",
      branch: "Unassigned Branch",
      customerSettings: { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS }
    })
  },
  services: {
    title: "Service CRUD",
    subtitle: "Customer services, kiosk assignment, rates, service images, and nested form templates.",
    key: "id",
    columns: ["id", "title", "mode", "enabled", "projectIds", "bw", "color", "templates"],
    fields: [],
    defaults: () => ({
      id: `service-${Date.now().toString().slice(-5)}`,
      icon: "SV",
      title: "New Service",
      titleHi: "",
      titleMr: "",
      description: "Customer service.",
      descriptionHi: "",
      descriptionMr: "",
      defaultPages: 1,
      mode: "upload",
      imageUrl: "",
      enabled: true,
      projectIds: serviceAssignableProjects()[0]?.projectId ? [serviceAssignableProjects()[0].projectId] : [],
      kioskIds: [],
      customerSettings: { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS },
      printDefaults: { ...DEFAULT_SERVICE_PRINT_DEFAULTS },
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
      { key: "service", label: "Service", required: true, type: "select-data", collection: "services", valueKey: "id", labelKey: "title" },
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

function uiIcon(name, size = 20) {
  return window.PrintKioskUI?.icon(name, size) || "";
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

function readStoredAdminSession() {
  try {
    const raw = window.sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAdminSession(payload = {}) {
  try {
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      role: payload.role || "",
      token: payload.token || "",
      admin: payload.admin || null
    }));
  } catch {}
}

function clearAdminSession() {
  try {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {}
}

function isSessionAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 401 || message.includes("admin login required") || message.includes("login required");
}

function expireAdminSession(message = "Session expired. Please sign in again.") {
  state.authed = false;
  state.authToken = "";
  state.snapshot = null;
  state.loading = false;
  state.notice = "";
  state.error = "";
  state.editor = null;
  state.navOpen = false;
  state.loginError = message;
  clearAdminSession();
  render();
}

function redirectToKioskAdmin() {
  window.location.href = `./admin.html${window.location.search || ""}`;
}

function hydrateAdminSession() {
  const stored = readStoredAdminSession();
  if (!stored?.token || !stored.role) return;

  if (stored.role === "kiosk-admin") {
    redirectToKioskAdmin();
    return;
  }

  if (stored.role === "super-admin") {
    state.authed = true;
    state.authToken = stored.token;
  }
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

function normalizeKioskCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function generateSetupCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);

  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizeKioskCustomerSettings(settings = {}) {
  const source = {
    ...DEFAULT_KIOSK_CUSTOMER_SETTINGS,
    ...(settings && typeof settings === "object" ? settings : {})
  };
  const normalized = Object.fromEntries(
    Object.keys(DEFAULT_KIOSK_CUSTOMER_SETTINGS).map((key) => [key, source[key] !== false])
  );

  if (!normalized.bw && !normalized.color) {
    normalized.bw = true;
  }

  return normalized;
}

function normalizeServicePrintDefaults(defaults = {}) {
  const source = { ...DEFAULT_SERVICE_PRINT_DEFAULTS, ...(defaults && typeof defaults === "object" ? defaults : {}) };
  return {
    colorMode: source.colorMode === "color" ? "color" : "bw",
    copies: Math.max(1, Math.min(99, Number(source.copies || 1))),
    paperSize: ["A4", "A3", "Letter", "Legal"].includes(source.paperSize) ? source.paperSize : "A4",
    sides: source.sides === "duplex" ? "duplex" : "single",
    orientation: source.orientation === "landscape" ? "landscape" : "portrait",
    range: String(source.range || "all").trim() || "all"
  };
}

function templateDocumentKind(value = "") {
  const source = String(value || "").toLowerCase();
  if (source === "pdf" || source.startsWith("data:application/pdf") || /\.pdf(?:$|[?#])/i.test(source)) return "pdf";
  return "image";
}

function uploadedTemplateTitle(file, fallback = "Template Document") {
  const name = String(file?.name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return name ? name.replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not inspect selected file."));
    reader.readAsText(file);
  });
}

async function detectTemplatePageCount(file) {
  if (!file) return 1;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return 1;

  try {
    const text = await readFileAsText(file);
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return Math.max(1, Math.min(200, matches?.length || 1));
  } catch {
    return 1;
  }
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function firstKioskId() {
  return state.snapshot?.data?.kiosks?.[0]?.kioskId || UNASSIGNED_KIOSK_ID;
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
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.status = response.status;

    if (state.authToken && isSessionAuthError(error)) {
      expireAdminSession();
      error.sessionExpired = true;
    }

    throw error;
  }

  return payload;
}

function isMissingAuthEndpoint(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("route not found") || message.includes("request failed: 404");
}

function postAdminLogin(path, email, password) {
  return fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function loginWithLegacyAdminEndpoints(email, password) {
  const attempts = await Promise.allSettled([
    postAdminLogin("/api/admin/login", email, password).then((payload) => ({
      ...payload,
      role: "kiosk-admin"
    })),
    postAdminLogin("/api/super-admin/login", email, password).then((payload) => ({
      ...payload,
      role: "super-admin"
    }))
  ]);
  const matches = attempts
    .filter((attempt) => attempt.status === "fulfilled")
    .map((attempt) => attempt.value);

  if (matches.length > 1) {
    throw new Error("These credentials match both admin roles. Use different super admin and client credentials.");
  }

  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error("Invalid admin credentials.");
}

async function loginWithAdminCredentials(email, password) {
  try {
    return await postAdminLogin("/api/auth/login", email, password);
  } catch (error) {
    if (!isMissingAuthEndpoint(error)) throw error;
    return loginWithLegacyAdminEndpoints(email, password);
  }
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
    if (!error.sessionExpired) {
      state.error = error.message || "Super admin backend is offline.";
    }
  } finally {
    state.loading = false;
    if (state.authed || !state.loginError) render();
  }
}

function data(collection) {
  return state.snapshot?.data?.[collection] || [];
}

function serviceAssignableProjects() {
  const assignedProjectIds = new Set(
    data("kioskAdmins")
      .flatMap((client) => Array.isArray(client.projectIds) ? client.projectIds : [])
      .filter(Boolean)
  );

  return data("projects").filter((project) => project.adminId || assignedProjectIds.has(project.projectId));
}

function serviceAssignableProjectIds() {
  return new Set(serviceAssignableProjects().map((project) => project.projectId));
}

function clientProjectIds(client = {}) {
  return new Set([
    ...(Array.isArray(client.projectIds) ? client.projectIds : []),
    ...data("projects")
      .filter((project) => project.adminId && project.adminId === client.adminId)
      .map((project) => project.projectId)
  ].filter(Boolean));
}

function projectsForClient(clientId, projects = data("projects")) {
  const client = data("kioskAdmins").find((item) => item.adminId === clientId);
  if (!client) return [];

  const assignedProjectIds = clientProjectIds(client);
  return projects.filter((project) => (
    project.adminId === clientId || assignedProjectIds.has(project.projectId)
  ));
}

function serviceClients() {
  const assignableProjects = serviceAssignableProjects();
  const assignableProjectIds = new Set(assignableProjects.map((project) => project.projectId));

  return data("kioskAdmins").filter((client) => (
    projectsForClient(client.adminId).some((project) => assignableProjectIds.has(project.projectId))
  ));
}

function selectedServiceClientId() {
  const clients = serviceClients();

  if (!state.selectedClientId || !clients.some((client) => client.adminId === state.selectedClientId)) {
    state.selectedClientId = clients[0]?.adminId || "";
  }

  return state.selectedClientId;
}

function serviceProjectsForSelectedClient() {
  const clientId = selectedServiceClientId();
  const assignableProjects = serviceAssignableProjects();
  return clientId ? projectsForClient(clientId, assignableProjects) : assignableProjects;
}

function paginated(items, key, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.pagination[key] || 1)), pageCount);
  state.pagination[key] = currentPage;
  const start = (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), currentPage, pageCount, total: items.length };
}

function renderPagination(key, page) {
  if (page.total <= 10) return "";
  return `
    <nav class="pagination" aria-label="Pagination">
      <span>${page.total} records</span>
      <button class="ghost-button small-button" data-pagination-key="${escapeHtml(key)}" data-pagination-page="${page.currentPage - 1}" ${page.currentPage === 1 ? "disabled" : ""}>Previous</button>
      <strong>Page ${page.currentPage} of ${page.pageCount}</strong>
      <button class="ghost-button small-button" data-pagination-key="${escapeHtml(key)}" data-pagination-page="${page.currentPage + 1}" ${page.currentPage === page.pageCount ? "disabled" : ""}>Next</button>
    </nav>
  `;
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
          <div class="brand-mark"><img src="./assets/printhub-mark.png" alt="Print Kiosk" /></div>
          <div>
            <div class="brand-title">Print Kiosk Admin Login</div>
            <div class="brand-subtitle">Printing Kiosk | One sign-in for client and super admin</div>
          </div>
        </div>
      </header>
      <main class="main admin-screen">
        <div class="login-view">
          <div class="login-panel">
            <h1>Print Kiosk Admin Login</h1>
            <p class="helper-text">Use your admin credentials. The system opens the right dashboard automatically.</p>
            ${state.loginError ? `<div class="empty-note">${escapeHtml(state.loginError)}</div>` : ""}
            <label>Email or mobile
              <input value="${escapeHtml(state.loginDraft.email)}" autocomplete="username" data-login-field="email" />
            </label>
            <label>Password
              <input type="password" value="${escapeHtml(state.loginDraft.password)}" autocomplete="current-password" data-login-field="password" />
            </label>
            <button class="primary-button" data-action="login">Sign in</button>
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
  const pendingRefunds = data("refunds").filter((refund) => /pending/i.test(refund.status || "")).length;
  const failedJobs = data("jobs").filter((job) => /failed/i.test(job.printStatus || "")).length;
  const alertCount = pendingRefunds + failedJobs;

  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-mark"><img src="./assets/printhub-mark.png" alt="Print Kiosk" /></div>
        <div>
          <div class="brand-title">Print Kiosk Super Admin</div>
          <div class="brand-subtitle">Printing Kiosk | Kiosks, projects, jobs, payments, refunds</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="notification-button" data-page="refunds" aria-label="Open operational alerts">
          ${uiIcon("bell", 22)}
          ${alertCount ? `<span>${Math.min(alertCount, 99)}</span>` : ""}
        </button>
        <button class="topbar-action" data-action="refresh">${uiIcon("refresh", 18)}<span>Refresh</span></button>
        <button class="topbar-action" data-action="export-json">${uiIcon("download", 18)}<span>Export</span></button>
        <button class="mobile-nav-toggle" data-action="toggle-nav" aria-controls="super-admin-navigation" aria-expanded="${state.navOpen}" aria-label="${state.navOpen ? "Close navigation" : "Open navigation"}">
          ${uiIcon(state.navOpen ? "close" : "menu", 22)}
        </button>
        <button class="topbar-logout" data-action="logout">${uiIcon("logout", 19)}<span>Logout</span></button>
      </div>
    </header>
  `;
}

function renderNav() {
  return `
    <button class="admin-nav-backdrop ${state.navOpen ? "is-open" : ""}" data-action="close-nav" aria-label="Close navigation"></button>
    <nav id="super-admin-navigation" class="admin-nav ${state.navOpen ? "is-open" : ""}" aria-label="Super Admin navigation">
      <div class="admin-nav-drawer-head">
        <strong>Navigation</strong>
        <button data-action="close-nav" aria-label="Close navigation">${uiIcon("close", 22)}</button>
      </div>
      ${pageGroups.map((group) => `
        <div class="admin-nav-group">
          <div class="admin-nav-label">${escapeHtml(group.label)}</div>
          ${group.pages.map((page) => `
            <button class="${state.page === page.id ? "active" : ""}" data-page="${page.id}">
              <span class="admin-nav-icon">${uiIcon(page.icon, 20)}</span>
              <span>${escapeHtml(page.label)}</span>
            </button>
          `).join("")}
        </div>
      `).join("")}
      <div class="admin-nav-help">
        <span class="admin-nav-help-icon">${uiIcon("support", 22)}</span>
        <div><strong>Control Center</strong><p>Review kiosks, pricing, and operational records.</p></div>
        <button data-page="kiosks">Open Kiosks</button>
      </div>
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
  if (state.page === "pricing") return renderPricing();
  if (state.page === "services") return renderDashboard();
  if (state.page === "revenue") return renderRevenue();
  if (collections[state.page] && state.page !== "services") return renderCollection(state.page);
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
    state.error ? `<div class="empty-note" style="margin-bottom: 16px;">${escapeHtml(state.error)}</div>` : "",
    !state.error && state.snapshot?.updatedAt ? `
      <div class="admin-live-status">
        <span class="live-indicator"></span>
        <strong>Live backend data.</strong>
        <span>Last updated: ${escapeHtml(formatDateTime(state.snapshot.updatedAt))}</span>
        <button data-action="refresh" aria-label="Refresh super admin data">${uiIcon("refresh", 18)}</button>
      </div>
    ` : ""
  ].filter(Boolean);

  return notices.join("");
}

function renderDashboard() {
  const summary = state.snapshot?.summary || {};
  const failedJobs = data("jobs").filter((job) => /failed/i.test(job.printStatus || ""));
  const pendingRefunds = data("refunds").filter((refund) => /pending/i.test(refund.status || ""));

  return `
    ${renderHeader("Super Admin Dashboard", "Master operational view across every kiosk and record.", `<button class="primary-button" data-page="kiosks">${uiIcon("kiosks", 18)} Open Kiosks</button>`)}
    ${renderNotice()}
    <div class="metrics-grid dashboard-metrics">
      ${[
        ["Kiosks", summary.kiosks || 0, `${summary.activeKiosks || 0} online`, "kiosks", "purple"],
        ["Projects", summary.projects || data("projects").length, `${summary.kioskAdmins || data("kioskAdmins").length} clients`, "hierarchy", "blue"],
        ["Jobs", summary.jobs || 0, `${summary.failedJobs || 0} failed`, "history", summary.failedJobs ? "red" : "cyan"],
        ["Payments", summary.payments || 0, money(summary.gross || 0), "payments", "green"],
        ["Refunds", summary.refunds || 0, `${pendingRefunds.length} pending`, "refunds", pendingRefunds.length ? "red" : "green"],
        ["Net Revenue", money(summary.net || 0), "After refunds", "pricing", "green"],
        ["Backend", state.error ? "Offline" : "Online", state.snapshot?.updatedAt ? formatDateTime(state.snapshot.updatedAt) : "", "system", state.error ? "red" : "blue"],
        ["Records", totalRecords(), "All collections", "activity", "amber"]
      ].map(([label, value, detail, icon, tone]) => `
        <div class="metric-card has-icon tone-${tone}">
          <span class="metric-icon">${uiIcon(icon, 25)}</span>
          <div class="metric-copy">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="module-grid dashboard-modules dashboard-modules-revenue">
      ${renderDashboardRevenuePanel(summary)}
      <div class="module-card dashboard-panel support-panel">
        <div class="module-card-title"><span>${uiIcon("support", 20)}</span><h2>Support Queue</h2></div>
        <div class="health-list">
          ${renderHealth("Failed jobs", `${failedJobs.length}`, failedJobs.length ? "warn" : "good")}
          ${renderHealth("Pending refunds", `${pendingRefunds.length}`, pendingRefunds.length ? "warn" : "good")}
          ${renderHealth("Kiosk records", `${summary.kiosks || 0}`, summary.kiosks ? "good" : "warn")}
        </div>
      </div>
    </div>
  `;
}

function dashboardRevenueRows(summary = {}) {
  const rows = [];
  const jobById = new Map(data("jobs").map((job) => [String(job.jobId || ""), job]));
  const paymentJobIds = new Set();

  data("payments").forEach((payment) => {
    const linkedJob = jobById.get(String(payment.jobId || ""));
    const amount = Number(payment.amount || 0) || Number(payment.amountInPaise || 0) / 100;
    const dateValue = payment.createdAt || payment.paidAt || linkedJob?.completedAt || linkedJob?.createdAt || linkedJob?.date;
    if (Number.isFinite(amount) && amount > 0) {
      if (payment.jobId) paymentJobIds.add(String(payment.jobId));
      rows.push({ date: revenueDateKey(dateValue), amount });
    }
  });

  data("jobs").forEach((job) => {
    if (paymentJobIds.has(String(job.jobId || ""))) return;
    const paid = /success|paid|captured/i.test(String(job.paymentStatus || job.payment || ""));
    const amount = Number(job.amount || 0);
    if (paid && Number.isFinite(amount) && amount > 0) {
      rows.push({ date: revenueDateKey(job.completedAt || job.createdAt || job.date), amount });
    }
  });

  if (!rows.length && Number(summary.gross || summary.net || 0) > 0) {
    rows.push({ date: revenueDateKey(new Date()), amount: Number(summary.gross || summary.net || 0) });
  }

  return rows;
}

function revenueDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildRevenueSeries(summary = {}, days = 14) {
  const totals = new Map();
  dashboardRevenueRows(summary).forEach((row) => {
    totals.set(row.date, (totals.get(row.date) || 0) + row.amount);
  });

  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      value: Math.round((totals.get(key) || 0) * 100) / 100
    };
  });
}

function renderDashboardRevenuePanel(summary = {}) {
  const series = buildRevenueSeries(summary, 14);
  const total = series.reduce((sum, item) => sum + item.value, 0);
  const peak = series.reduce((max, item) => Math.max(max, item.value), 0);
  const paidDays = series.filter((item) => item.value > 0).length;
  const average = series.length ? total / series.length : 0;

  return `
    <section class="module-card dashboard-revenue-panel">
      <div class="module-card-title revenue-title">
        <span>${uiIcon("payments", 20)}</span>
        <div>
          <h2>Client Revenue</h2>
          <p>Whole network revenue trend across all clients.</p>
        </div>
        <strong>${money(summary.net || summary.gross || total)}</strong>
      </div>
      ${renderRevenueLineChart(series)}
      <div class="revenue-summary">
        <span><strong>${money(total || summary.gross || 0)}</strong>14 day gross</span>
        <span><strong>${money(average)}</strong>daily average</span>
        <span><strong>${paidDays}</strong>active revenue day${paidDays === 1 ? "" : "s"}</span>
        <span><strong>${money(peak)}</strong>highest day</span>
      </div>
    </section>
  `;
}

function paymentAmount(payment = {}, job = {}) {
  const amount = Number(payment.amount);
  if (Number.isFinite(amount) && amount > 0) return amount;

  const amountInPaise = Number(payment.amountInPaise);
  if (Number.isFinite(amountInPaise) && amountInPaise > 0) return amountInPaise / 100;

  return Number(job.amount || 0) || 0;
}

function paymentDateValue(payment = {}, job = {}) {
  return payment.paidAt || payment.createdAt || payment.failedAt || job.completedAt || job.createdAt || job.date || "";
}

function transactionTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function transactionGatewayReference(payment = {}) {
  return payment.razorpayPaymentId || payment.gatewayTransactionId || payment.razorpayOrderId || payment.upiReferenceId || "";
}

function serviceTitle(serviceId) {
  return data("services").find((service) => service.id === serviceId)?.title || serviceId || "Print Document";
}

function transactionProjectForKiosk(kioskId = "") {
  const kiosk = data("kiosks").find((item) => String(item.kioskId || "").toUpperCase() === String(kioskId || "").toUpperCase());
  return data("projects").find((project) => project.projectId === kiosk?.projectId) || null;
}

function transactionClientForProject(project = {}) {
  return data("kioskAdmins").find((client) => (
    client.adminId === project?.adminId ||
    (client.projectIds || []).includes(project?.projectId)
  )) || null;
}

function superAdminTransactionRecords() {
  const jobs = data("jobs");
  const jobById = new Map(jobs.map((job) => [String(job.jobId || ""), job]));
  const paymentJobIds = new Set();

  const paymentRecords = data("payments").map((payment) => {
    const jobId = String(payment.jobId || "");
    const job = jobById.get(jobId) || {};
    if (jobId) paymentJobIds.add(jobId);

    const kioskId = job.kioskId || payment.kioskId || UNASSIGNED_KIOSK_ID;
    const project = transactionProjectForKiosk(kioskId);
    const client = transactionClientForProject(project);
    const dateValue = paymentDateValue(payment, job);

    return {
      paymentId: payment.paymentId || payment.razorpayPaymentId || "",
      jobId,
      dateValue,
      date: formatDateTime(dateValue),
      clientId: client?.adminId || "",
      client: client?.name || client?.email || "Unallocated",
      projectId: project?.projectId || "",
      project: project?.name || "Unassigned",
      kiosk: kioskId,
      service: serviceTitle(job.service),
      amount: paymentAmount(payment, job),
      method: payment.paymentMethod || payment.gateway || "Payment",
      gateway: payment.gateway || "",
      reference: transactionGatewayReference(payment),
      status: payment.status || job.paymentStatus || "Draft",
      print: job.printStatus || ""
    };
  });

  const jobRecords = jobs
    .filter((job) => {
      const jobId = String(job.jobId || "");
      return jobId && !paymentJobIds.has(jobId) && Number(job.amount || 0) > 0;
    })
    .map((job) => {
      const kioskId = job.kioskId || UNASSIGNED_KIOSK_ID;
      const project = transactionProjectForKiosk(kioskId);
      const client = transactionClientForProject(project);
      const dateValue = paymentDateValue({}, job);

      return {
        paymentId: "",
        jobId: String(job.jobId || ""),
        dateValue,
        date: formatDateTime(dateValue),
        clientId: client?.adminId || "",
        client: client?.name || client?.email || "Unallocated",
        projectId: project?.projectId || "",
        project: project?.name || "Unassigned",
        kiosk: kioskId,
        service: serviceTitle(job.service),
        amount: Number(job.amount || 0),
        method: "Job payment",
        gateway: "",
        reference: "",
        status: job.paymentStatus || "Draft",
        print: job.printStatus || ""
      };
    });

  return [...paymentRecords, ...jobRecords]
    .sort((left, right) => transactionTimestamp(right.dateValue) - transactionTimestamp(left.dateValue));
}

function transactionMatchesStatus(record, status) {
  if (status === "all") return true;
  const paymentText = String(record.status || "").toLowerCase();
  const combinedText = `${record.status || ""} ${record.print || ""}`.toLowerCase();
  if (status === "success") return /success|paid|captured|completed/.test(paymentText);
  if (status === "pending") return /pending|created|queue/.test(paymentText);
  if (status === "failed") return /failed|error|declined|cancel/.test(combinedText);
  if (status === "refund") return /refund/.test(combinedText);
  return true;
}

function transactionMatchesDateRange(record, from, to) {
  const timestamp = transactionTimestamp(record.dateValue);
  if (!timestamp) return !from && !to;

  if (from) {
    const fromTime = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(fromTime) && timestamp < fromTime) return false;
  }

  if (to) {
    const toTime = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTime) && timestamp > toTime) return false;
  }

  return true;
}

function filteredSuperAdminTransactions() {
  const filters = state.transactionFilters;
  const search = filters.search.trim().toLowerCase();

  return superAdminTransactionRecords()
    .filter((record) => filters.client === "all" || record.clientId === filters.client)
    .filter((record) => filters.kiosk === "all" || record.kiosk === filters.kiosk)
    .filter((record) => transactionMatchesStatus(record, filters.status))
    .filter((record) => transactionMatchesDateRange(record, filters.from, filters.to))
    .filter((record) => !search || JSON.stringify(record).toLowerCase().includes(search));
}

function uniqueTransactionOptions(records, key, labelKey) {
  const seen = new Map();
  records.forEach((record) => {
    const value = record[key];
    if (!value || seen.has(value)) return;
    seen.set(value, record[labelKey] || value);
  });
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
}

function renderTransactionFilters(records) {
  const filters = state.transactionFilters;
  const clients = uniqueTransactionOptions(records, "clientId", "client");
  const kiosks = uniqueTransactionOptions(records, "kiosk", "kiosk");

  return `
    <div class="filters transaction-filters">
      <input placeholder="Search payment, job, client, kiosk" value="${escapeHtml(filters.search)}" data-transaction-filter="search" />
      <select data-transaction-filter="status" aria-label="Transaction status">
        <option value="all" ${filters.status === "all" ? "selected" : ""}>All statuses</option>
        <option value="success" ${filters.status === "success" ? "selected" : ""}>Success</option>
        <option value="pending" ${filters.status === "pending" ? "selected" : ""}>Pending</option>
        <option value="failed" ${filters.status === "failed" ? "selected" : ""}>Failed</option>
        <option value="refund" ${filters.status === "refund" ? "selected" : ""}>Refund</option>
      </select>
      <select data-transaction-filter="client" aria-label="Client">
        <option value="all" ${filters.client === "all" ? "selected" : ""}>All clients</option>
        ${clients.map((client) => `<option value="${escapeHtml(client.value)}" ${filters.client === client.value ? "selected" : ""}>${escapeHtml(client.label)}</option>`).join("")}
      </select>
      <select data-transaction-filter="kiosk" aria-label="Kiosk">
        <option value="all" ${filters.kiosk === "all" ? "selected" : ""}>All kiosks</option>
        ${kiosks.map((kiosk) => `<option value="${escapeHtml(kiosk.value)}" ${filters.kiosk === kiosk.value ? "selected" : ""}>${escapeHtml(kiosk.label)}</option>`).join("")}
      </select>
      <input type="date" value="${escapeHtml(filters.from)}" data-transaction-filter="from" aria-label="From date" />
      <input type="date" value="${escapeHtml(filters.to)}" data-transaction-filter="to" aria-label="To date" />
    </div>
  `;
}

function renderTransactionLog() {
  const allRecords = superAdminTransactionRecords();
  const records = filteredSuperAdminTransactions();
  const page = paginated(records, "revenue-transactions");

  return `
    <section class="module-card transaction-log-card">
      <div class="module-card-title">
        <span>${uiIcon("payments", 20)}</span>
        <h2>Transaction Logs</h2>
        <strong>${escapeHtml(String(records.length))} record${records.length === 1 ? "" : "s"}</strong>
      </div>
      ${renderTransactionFilters(allRecords)}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${["Date", "Payment ID", "Job ID", "Client", "Project", "Kiosk", "Service", "Amount", "Status", "Gateway Ref"].map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${page.items.length ? page.items.map((record) => `
              <tr>
                <td>${escapeHtml(record.date)}</td>
                <td>${escapeHtml(record.paymentId || "-")}</td>
                <td>${escapeHtml(record.jobId || "-")}</td>
                <td>${escapeHtml(record.client)}</td>
                <td>${escapeHtml(record.project)}</td>
                <td>${escapeHtml(record.kiosk)}</td>
                <td>${escapeHtml(record.service)}</td>
                <td>${escapeHtml(money(record.amount))}</td>
                <td>${escapeHtml(record.status || "-")}</td>
                <td>${escapeHtml(record.reference || record.method || "-")}</td>
              </tr>
            `).join("") : `
              <tr><td colspan="10">No matching transaction records.</td></tr>
            `}
          </tbody>
        </table>
      </div>
      ${renderPagination("revenue-transactions", page)}
    </section>
  `;
}

function renderRevenue() {
  const summary = state.snapshot?.summary || {};
  const records = filteredSuperAdminTransactions();
  const filteredTotal = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const successCount = records.filter((record) => transactionMatchesStatus(record, "success")).length;
  const pendingCount = records.filter((record) => transactionMatchesStatus(record, "pending")).length;

  return `
    ${renderHeader("Revenue", "Transaction logs, filters, and payment reconciliation across every client.", `<button class="secondary-button" data-action="refresh">${uiIcon("refresh", 18)} Refresh</button>`)}
    ${renderNotice()}
    <div class="metrics-grid dashboard-metrics revenue-metrics">
      ${[
        ["Gross Revenue", money(summary.gross || 0), `${summary.payments || 0} payment record(s)`, "payments", "green"],
        ["Refunds", money((summary.gross || 0) - (summary.net || 0)), `${summary.refunds || 0} refund record(s)`, "refunds", summary.refunds ? "red" : "green"],
        ["Net Revenue", money(summary.net || 0), "After refunds", "pricing", "green"],
        ["Filtered Total", money(filteredTotal), `${records.length} matching transaction(s)`, "activity", "blue"],
        ["Successful", String(successCount), "Matching paid/captured records", "history", "cyan"],
        ["Pending", String(pendingCount), "Matching pending records", "alert", pendingCount ? "amber" : "green"]
      ].map(([label, value, detail, icon, tone]) => `
        <div class="metric-card has-icon tone-${tone}">
          <span class="metric-icon">${uiIcon(icon, 25)}</span>
          <div class="metric-copy">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="revenue-page-grid">
      ${renderDashboardRevenuePanel(summary)}
    </div>
    ${renderTransactionLog()}
  `;
}

function renderRevenueLineChart(series = []) {
  const width = 920;
  const height = 290;
  const padding = { top: 24, right: 36, bottom: 46, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.map((item) => item.value));
  const yMax = Math.max(10, Math.ceil(maxValue / 10) * 10);

  const points = series.map((item, index) => {
    const x = padding.left + (series.length <= 1 ? chartWidth : (index / (series.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - (item.value / yMax) * chartHeight;
    return { ...item, x, y };
  });

  const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(yMax * ratio);
    const y = padding.top + chartHeight - ratio * chartHeight;
    return { value, y };
  });

  return `
    <div class="revenue-chart-wrap dashboard-revenue-chart">
      <svg class="revenue-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Client revenue line graph">
        <defs>
          <linearGradient id="dashboardRevenueArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#176ee8" stop-opacity="0.24" />
            <stop offset="100%" stop-color="#0f8f63" stop-opacity="0.03" />
          </linearGradient>
          <filter id="dashboardRevenueShadow" x="-10%" y="-20%" width="120%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#176ee8" flood-opacity="0.22" />
          </filter>
        </defs>
        <g class="revenue-grid">
          ${yTicks.map((tick) => `
            <line x1="${padding.left}" x2="${padding.left + chartWidth}" y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}" />
            <text class="revenue-y-label" x="${padding.left - 14}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end">${money(tick.value).replace("Rs. ", "")}</text>
          `).join("")}
        </g>
        <path class="revenue-area" d="${areaPath}" fill="url(#dashboardRevenueArea)" />
        <path class="revenue-line" d="${linePath}" filter="url(#dashboardRevenueShadow)" />
        <g class="revenue-points">
          ${points.map((point) => `
            <g class="revenue-point" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
              <circle r="7"></circle>
              <circle class="revenue-point-inner" r="3.2"></circle>
              <title>${escapeHtml(point.label)}: ${escapeHtml(money(point.value))}</title>
            </g>
          `).join("")}
        </g>
        <g class="revenue-x-axis">
          ${points.map((point, index) => index % 2 === 0 || index === points.length - 1 ? `
            <text class="revenue-x-label" x="${point.x.toFixed(1)}" y="${height - 15}" text-anchor="middle">${escapeHtml(point.label)}</text>
          ` : "").join("")}
        </g>
      </svg>
    </div>
  `;
}

function totalRecords() {
  return ["projects", "kioskAdmins", "kiosks", "services", "jobs", "refunds"]
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
  const projectPage = paginated(data("projects"), "hierarchy-projects");

  return `
    ${renderHeader("Project and Kiosk Hierarchy", "Project to kiosk ownership, allocated client, services, and operational records.", `<button class="primary-button" data-collection-create="projects">Add Project</button><button class="secondary-button" data-collection-create="kiosks">Add Kiosk</button>`)}
    ${renderNotice()}
    <div class="super-tree">
      ${projectPage.items.length ? projectPage.items.map((project) => renderProjectNode(project, hierarchy)).join("") : `<div class="empty-note">No projects found. Create a project before adding kiosks.</div>`}
    </div>
    ${renderPagination("hierarchy-projects", projectPage)}
    ${renderEditorPanel()}
  `;
}

function renderProjectNode(project, hierarchy) {
  const kiosks = hierarchy.filter((kiosk) => kiosk.projectId === project.projectId);
  const admin = data("kioskAdmins").find((item) => item.adminId === project.adminId || (item.projectIds || []).includes(project.projectId));
  const kioskPage = paginated(kiosks, `project-${project.projectId}-kiosks`);

  return `
    <section class="project-hierarchy-node">
      <div class="hierarchy-node-head project-head">
        <div>
          <h2>${escapeHtml(project.name)} <span class="badge ${project.status === "active" ? "good" : "warn"}">${escapeHtml(project.status)}</span></h2>
          <p class="helper-text">${escapeHtml(project.projectId)} | Admin: ${escapeHtml(admin?.name || project.adminId || "Unallocated")} | ${kiosks.length} kiosk${kiosks.length === 1 ? "" : "s"}</p>
        </div>
        <button class="secondary-button" data-record-edit="projects" data-record-id="${escapeHtml(project.projectId)}">Edit Project</button>
      </div>
      <div class="super-tree project-kiosk-list">
        ${kioskPage.items.length ? kioskPage.items.map(renderKioskNode).join("") : `<div class="empty-note">No kiosks in this project.</div>`}
      </div>
      ${renderPagination(`project-${project.projectId}-kiosks`, kioskPage)}
    </section>
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
        ]), "No jobs for this kiosk.", `hierarchy-jobs-${kiosk.kioskId}`)}
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

function renderSmallTable(headers, rows, emptyMessage, paginationKey = "small-table") {
  const page = paginated(rows, paginationKey);
  const displayRows = page.items.length ? page.items : [[emptyMessage, ...Array(Math.max(0, headers.length - 1)).fill("")]];

  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${displayRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${renderPagination(paginationKey, page)}
  `;
}

function selectedServiceProjectId() {
  const projects = serviceProjectsForSelectedClient();

  if (!state.selectedProjectId || !projects.some((project) => project.projectId === state.selectedProjectId)) {
    state.selectedProjectId = projects[0]?.projectId || "";
  }

  return state.selectedProjectId;
}

function kiosksForProject(projectId) {
  return data("kiosks").filter((kiosk) => kiosk.projectId === projectId);
}

function serviceForProject(service, projectId) {
  const projectIds = service.projectIds || [];
  const kioskIds = service.kioskIds || [];
  if (projectIds.length) return projectIds.includes(projectId);
  if (kioskIds.length) {
    const projectKioskIds = new Set(kiosksForProject(projectId).map((kiosk) => kiosk.kioskId));
    return kioskIds.some((kioskId) => projectKioskIds.has(kioskId));
  }
  return true;
}

function serviceProjectLabel(projectId) {
  return data("projects").find((project) => project.projectId === projectId)?.name || projectId;
}

function clientProjectServiceCount(projects) {
  const projectIds = projects.map((project) => project.projectId);
  return data("services").filter((service) => projectIds.some((projectId) => serviceForProject(service, projectId))).length;
}

function serviceScopeTone(service) {
  if (service.enabled === false) return "bad";
  return "good";
}

function renderServiceIcon(service) {
  return `<span class="kiosk-service-icon">${escapeHtml(service.icon || service.title?.slice(0, 2) || "SV")}</span>`;
}

function renderKioskServices() {
  const clients = serviceClients();
  const clientPage = paginated(clients, "service-client-picker");
  const clientId = selectedServiceClientId();
  const selectedClient = clients.find((client) => client.adminId === clientId);
  const projects = serviceProjectsForSelectedClient();
  const projectPage = paginated(projects, "service-project-picker");
  const projectId = selectedServiceProjectId();
  const selectedProject = projects.find((project) => project.projectId === projectId);
  const projectKiosks = kiosksForProject(projectId);
  const clientKiosks = projects.flatMap((project) => kiosksForProject(project.projectId));
  const search = state.search.trim().toLowerCase();
  const services = data("services")
    .filter((service) => serviceForProject(service, projectId))
    .filter((service) => !search || JSON.stringify(service).toLowerCase().includes(search));
  const servicePage = paginated(services, `project-services-${projectId}`);

  return `
    ${renderHeader(
      "Client Services",
      selectedClient
        ? `${selectedClient.name || selectedClient.email || selectedClient.adminId} | ${projects.length} project${projects.length === 1 ? "" : "s"} | ${clientKiosks.length} kiosk${clientKiosks.length === 1 ? "" : "s"}`
        : "Create a client project with kiosks before assigning services.",
      `<button class="secondary-button" data-action="refresh">Refresh</button>`
    )}
    ${renderNotice()}
    ${!clients.length ? `
      <div class="empty-note">No clients with assigned projects found. Create a client and allocate a project before adding services.</div>
    ` : `
      <div class="kiosk-service-layout">
        <aside class="kiosk-picker project-picker">
          <div class="kiosk-picker-title">Clients</div>
          ${clientPage.items.map((client) => {
            const clientProjects = projectsForClient(client.adminId, serviceAssignableProjects());
            const kioskCount = clientProjects.reduce((total, project) => total + kiosksForProject(project.projectId).length, 0);
            const serviceCount = clientProjectServiceCount(clientProjects);
            return `
            <button class="${client.adminId === clientId ? "active" : ""}" data-client-select="${escapeHtml(client.adminId)}">
              <strong>${escapeHtml(client.name || client.email || client.adminId)}</strong>
              <span>${clientProjects.length} project${clientProjects.length === 1 ? "" : "s"} | ${kioskCount} kiosk${kioskCount === 1 ? "" : "s"} | ${serviceCount} service${serviceCount === 1 ? "" : "s"}</span>
            </button>
          `}).join("")}
          ${renderPagination("service-client-picker", clientPage)}
          <div class="kiosk-picker-title">Projects</div>
          ${projectPage.items.map((project) => {
            const kioskCount = kiosksForProject(project.projectId).length;
            return `
            <button class="${project.projectId === projectId ? "active" : ""}" data-project-select="${escapeHtml(project.projectId)}">
              <strong>${escapeHtml(project.name || project.projectId)}</strong>
              <span>${kioskCount} kiosk${kioskCount === 1 ? "" : "s"}</span>
            </button>
          `}).join("")}
          ${renderPagination("service-project-picker", projectPage)}
        </aside>
        <section class="kiosk-service-main">
          <div class="project-kiosk-summary">
            <strong>Selected client</strong>
            <span>${escapeHtml(selectedClient?.name || selectedClient?.email || clientId)}</span>
            <strong>Projects</strong>
            <span>${projects.map((project) => escapeHtml(project.name || project.projectId)).join(", ")}</span>
          </div>
          <div class="filters">
            <input placeholder="Search services for ${escapeHtml(selectedClient?.name || selectedClient?.email || "client")} / ${escapeHtml(selectedProject?.name || projectId)}" value="${escapeHtml(state.search)}" data-action-input="search" />
          </div>
          <div class="project-kiosk-summary">
            <strong>Kiosks receiving these services</strong>
            <span>${projectKiosks.length ? projectKiosks.map((kiosk) => escapeHtml(kiosk.kioskId)).join(", ") : "No kiosks assigned yet"}</span>
          </div>
          <div class="kiosk-service-grid">
            ${servicePage.items.length ? servicePage.items.map((service) => renderKioskServiceCard(service, projectId)).join("") : `
              <div class="empty-note">No services are assigned to this project.</div>
            `}
          </div>
          ${renderPagination(`project-services-${projectId}`, servicePage)}
          ${renderEditorPanel()}
        </section>
      </div>
    `}
  `;
}

function renderKioskServiceCard(service, projectId) {
  const rates = service.pricing || pricingFor(service.id);
  const templates = service.templates || [];
  const kioskCount = kiosksForProject(projectId).length;

  return `
    <article class="module-card kiosk-service-card">
      <div class="kiosk-service-head">
        ${renderServiceIcon(service)}
        <div>
          <h2>${escapeHtml(service.title)}</h2>
          <p class="helper-text">${escapeHtml(service.mode || "upload")}</p>
        </div>
        <span class="badge ${serviceScopeTone(service)}">${escapeHtml(serviceProjectLabel(projectId))}</span>
      </div>
      <p class="helper-text">${escapeHtml(service.description || "Customer service.")}</p>
      <p class="helper-text">${kioskCount ? `Applied to all ${kioskCount} kiosk${kioskCount === 1 ? "" : "s"} in this project.` : "No kiosks are assigned to this project yet."}</p>
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
  const pageKey = `collection-${collection}`;
  const page = paginated(rows, pageKey);

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(collectionColumnLabel(column))}</th>`).join("")}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${page.items.length ? page.items.map((row) => `
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
    ${renderPagination(pageKey, page)}
  `;
}

function labelize(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function collectionColumnLabel(column) {
  if (column === "adminId") return "Client";
  if (column === "projectId") return "Project";
  if (column === "projectIds") return "Projects";
  return labelize(column);
}

function projectName(projectId) {
  return data("projects").find((project) => project.projectId === projectId)?.name || "Unassigned";
}

function kioskAdminName(adminId) {
  return data("kioskAdmins").find((admin) => admin.adminId === adminId)?.name || "Unallocated";
}

function assignedProjectIdsForAdmin(admin = {}) {
  const directIds = Array.isArray(admin.projectIds) ? admin.projectIds : [];
  const projectIds = data("projects")
    .filter((project) => project.adminId && project.adminId === admin.adminId)
    .map((project) => project.projectId);

  return [...new Set([...directIds, ...projectIds].filter(Boolean))];
}

function formatCell(collection, column, row) {
  if (collection === "services" && column === "bw") return escapeHtml(money((row.pricing || pricingFor(row.id)).bw || 0));
  if (collection === "services" && column === "color") return escapeHtml(money((row.pricing || pricingFor(row.id)).color || 0));
  if (collection === "services" && column === "templates") return escapeHtml(String(row.templates?.length || 0));
  if (column === "kioskIds") return escapeHtml((row.kioskIds || []).join(", ") || "All");
  if (column === "adminId") return escapeHtml(kioskAdminName(row.adminId));
  if (column === "projectId") return escapeHtml(projectName(row.projectId));
  if (collection === "kioskAdmins" && column === "projectIds") {
    return escapeHtml(assignedProjectIdsForAdmin(row).map(projectName).join(", ") || "None");
  }
  if (column === "projectIds") return escapeHtml((row.projectIds || []).map(projectName).join(", ") || "None");
  if (column === "amount") return escapeHtml(money(row[column] || 0));
  if (/At$|Date|Online/i.test(column)) return escapeHtml(formatDateTime(row[column]));
  if (Array.isArray(row[column])) return escapeHtml(row[column].join(", "));
  if (typeof row[column] === "boolean") return escapeHtml(row[column] ? "Yes" : "No");
  return escapeHtml(row[column] ?? "");
}

function renderEditorPanel() {
  if (!state.editor) return "";

  const { collection } = state.editor;
  const content = collection === "services" ? renderServiceEditor() : renderGenericEditor(collection);
  const title = state.editor.mode === "create" ? `Create ${collection.slice(0, -1) || collection}` : `Edit ${collection.slice(0, -1) || collection}`;

  return `
    <div class="editor-modal-shell editor-modal-${escapeHtml(collection)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <button class="editor-modal-backdrop" data-editor-cancel aria-label="Close editor"></button>
      <div class="editor-modal-content editor-modal-content-${escapeHtml(collection)}">
        ${content}
      </div>
    </div>
  `;
}

function renderGenericEditor(collection) {
  const meta = collections[collection];
  const draft = state.editor.draft;
  const helper = collection === "projects"
    ? "Allocate this project to a client before adding kiosks."
    : collection === "kioskAdmins"
      ? "Create login details first, then allocate this admin to a project."
      : `Kiosk ID: ${draft.kioskId || "new"}`;

  return `
    <div class="module-card editor-panel">
      <div class="editor-head">
        <div>
          <h2>${state.editor.mode === "create" ? "Create" : "Edit"} ${escapeHtml(collection.slice(0, -1) || collection)}</h2>
          <p class="helper-text">${escapeHtml(helper)}</p>
        </div>
        <button class="ghost-button" data-editor-cancel>Close</button>
      </div>
      <div class="settings-grid service-editor-grid">
        ${meta.fields.map((field) => renderField(field, draft, state.editor.mode === "edit" && field.key === meta.key)).join("")}
      </div>
      ${collection === "kiosks" ? renderKioskCustomerSettingsEditor(draft) : ""}
      <div class="flow-actions">
        <button class="primary-button" data-editor-save>Save</button>
        <button class="ghost-button" data-editor-cancel>Cancel</button>
      </div>
    </div>
  `;
}

function renderKioskCustomerSettingsEditor(draft) {
  const settings = normalizeKioskCustomerSettings(draft.customerSettings);

  return `
    <section class="kiosk-settings-panel">
      <div class="section-heading">
        <h2>Kiosk Customer Print Options</h2>
        <span>Unchecked options stay hidden from customers on this kiosk</span>
      </div>
      <div class="kiosk-settings-checks">
        ${KIOSK_CUSTOMER_SETTING_FIELDS.map(([key, label]) => `
          <label class="kiosk-setting-check">
            <input type="checkbox" data-kiosk-customer-setting="${escapeHtml(key)}" ${settings[key] ? "checked" : ""} />
            <span>${escapeHtml(label)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderField(field, draft, disabled = false) {
  const value = draft[field.key] ?? "";

  if (field.type === "select-data") {
    const options = data(field.collection);
    return `
      <label class="setting-field">${escapeHtml(field.label)}
        <select data-editor-field="${escapeHtml(field.key)}" ${disabled ? "disabled" : ""}>
          ${field.allowEmpty ? `<option value="">Unallocated</option>` : ""}
          ${options.map((option) => {
            const optionValue = option[field.valueKey];
            const optionLabel = option[field.labelKey] || optionValue;
            return `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
          }).join("")}
        </select>
      </label>
    `;
  }

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
    <div class="module-card editor-panel service-editor-popup">
      <div class="editor-head">
        <div>
          <h2>${editing ? "Edit Service" : "Create Service"}</h2>
          <p class="helper-text">Configure this service for the selected project.</p>
        </div>
        <button class="ghost-button" data-editor-cancel>Close</button>
      </div>
      <div class="service-editor-scroll">
        <section class="service-editor-section">
          <div class="section-heading">
            <h2>Service Details</h2>
            <span>Only the basic customer-facing information</span>
          </div>
          <div class="settings-grid service-editor-grid compact-service-editor-grid">
            ${renderField({ key: "title", label: "Service Name" }, draft)}
            ${renderField({ key: "description", label: "Description" }, draft)}
          </div>
        </section>
        <section class="service-editor-section">
          <div class="section-heading">
            <h2>Pricing and Mode</h2>
            <span>Default settings for this service</span>
          </div>
          <div class="settings-grid service-editor-grid">
            ${renderField({ key: "defaultPages", label: "Default Pages", type: "number" }, draft)}
            ${renderField({ key: "mode", label: "Mode", type: "select", options: ["upload", "template"] }, draft)}
            ${renderField({ key: "enabled", label: "Enabled", type: "select", options: ["true", "false"] }, { ...draft, enabled: String(draft.enabled !== false) })}
            ${renderField({ key: "bw", label: "B/W Rate", type: "number" }, { bw: rates.bw || 0 })}
            ${renderField({ key: "color", label: "Color Rate", type: "number" }, { color: rates.color || 0 })}
          </div>
        </section>
        ${renderServiceProjectSelector(draft)}
        ${draft.mode === "template" ? `<div class="template-editor-section compact-template-section">
          <div class="template-editor-header">
            <div>
              <h3>Forms under ${escapeHtml(draft.title || "this service")}</h3>
              <p class="helper-text">Each form can be an image or PDF shown directly on the kiosk.</p>
            </div>
            <button class="secondary-button" data-draft-template-add>Add Document</button>
          </div>
          <div class="template-editor-list compact-template-list">
            ${(draft.templates || []).length ? draft.templates.map(renderDraftTemplate).join("") : `<div class="empty-note">No template documents yet. Add a document, then upload an image or PDF.</div>`}
          </div>
        </div>` : `<div class="template-editor-section">
          <div class="template-editor-header">
            <h3>Upload Service</h3>
            <p class="helper-text">This service will show QR upload to customers. Change mode to Form templates if it should contain forms.</p>
          </div>
        </div>`}
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-editor-save>Save Service</button>
        <button class="ghost-button" data-editor-cancel>Cancel</button>
      </div>
    </div>
  `;
}

function renderServiceProjectSelector(draft) {
  const projects = serviceAssignableProjects();
  const selected = new Set(Array.isArray(draft.projectIds) ? draft.projectIds : []);

  return `
    <section class="kiosk-settings-panel">
      <div class="section-heading">
        <h2>Project Assignment</h2>
        <span>Select projects where this service is available</span>
      </div>
      <div class="kiosk-settings-checks">
        ${projects.length ? projects.map((project) => `
          <label class="kiosk-setting-check">
            <input type="checkbox" data-service-project-id="${escapeHtml(project.projectId)}" ${selected.has(project.projectId) ? "checked" : ""} />
            <span>${escapeHtml(project.name || project.projectId)}</span>
          </label>
        `).join("") : `<div class="empty-note">Create and allocate a project before assigning services.</div>`}
      </div>
    </section>
  `;
}

function renderEditorImagePreview(imageUrl = "", fallback = "TM") {
  const label = String(fallback || "TM").trim().toUpperCase().slice(0, 2) || "TM";

  if (templateDocumentKind(imageUrl) === "pdf") {
    return `<span class="admin-image-preview">PDF</span>`;
  }

  if (imageUrl) {
    return `<span class="admin-image-preview service-image"><img alt="" src="${escapeHtml(imageUrl)}" draggable="false" data-no-visual-search /></span>`;
  }

  return `<span class="admin-image-preview">${escapeHtml(label)}</span>`;
}

function renderDraftTemplate(template, index) {
  return `
    <div class="template-editor-card compact-template-card">
      <div class="template-editor-top compact-template-top">
        <span class="template-row-index">${index + 1}</span>
        ${renderEditorImagePreview(template.imageUrl, template.title || `T${index + 1}`)}
        <div class="template-row-copy">
          <h4>${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
          <p class="helper-text">${escapeHtml(templateDocumentKind(template.documentType || template.imageUrl).toUpperCase())} | ${Number(template.pages || 1)} page${Number(template.pages || 1) === 1 ? "" : "s"} | ${escapeHtml(template.imageUrl ? "Ready for kiosk" : "Upload needed")}</p>
        </div>
        <button class="danger-button small-button" data-draft-template-delete="${index}">Remove</button>
      </div>
      <label class="template-upload-row compact-template-upload">
        <span>Replace file</span>
        <input type="file" accept="image/*,application/pdf,.pdf" data-template-image-upload data-template-index="${index}" />
      </label>
    </div>
  `;
}

function renderPricing() {
  const services = data("services");
  const page = paginated(services, "pricing-services");

  return `
    ${renderHeader("Pricing Control", "Master B/W and color pricing by service.", `<button class="primary-button" data-pricing-save-all>Save All</button>`)}
    ${renderNotice()}
    <div class="settings-grid pricing-settings-grid">
      ${page.items.map((service) => {
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
    ${renderPagination("pricing-services", page)}
  `;
}

function updateStatusClass(status) {
  const value = String(status || "current").toLowerCase();
  if (["failed", "rollback"].includes(value)) return "danger";
  if (["available", "downloading", "deferred", "installing"].includes(value)) return "warning";
  return "good";
}

function renderUpdates() {
  const releases = data("releases").slice().sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")));
  const kiosks = data("kiosks");
  const activeReleases = releases.filter((release) => release.active).length;
  const pendingKiosks = kiosks.filter((kiosk) => ["available", "downloading", "deferred", "installing"].includes(kiosk.updateStatus)).length;
  const failedKiosks = kiosks.filter((kiosk) => ["failed", "rollback"].includes(kiosk.updateStatus)).length;
  const draft = state.releaseDraft;

  return `
    ${renderHeader("Kiosk Update Management", "Signed releases, staged rollout, and device update status.", `<button class="secondary-button" data-action="refresh">${uiIcon("refresh", 18)} Refresh</button>`)}
    ${renderNotice()}
    <div class="metrics-grid update-metrics">
      ${[
        ["Published Releases", releases.length, `${activeReleases} active`, "download", "blue"],
        ["Pending Kiosks", pendingKiosks, "Waiting or installing", "activity", "purple"],
        ["Update Failures", failedKiosks, "Includes rollbacks", "alert", "orange"]
      ].map(([label, value, detail, icon, tone]) => `
        <article class="metric-card ${tone}">
          <span class="metric-icon">${uiIcon(icon, 22)}</span>
          <div><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>
        </article>
      `).join("")}
    </div>

    <section class="module-card update-publisher">
      <div class="editor-head">
        <div><h2>Publish Signed Release</h2><p class="helper-text">Production artifacts must use HTTPS and a matching RSA signature.</p></div>
        <button class="ghost-button" data-release-reset>Reset</button>
      </div>
      <div class="settings-grid update-release-grid">
        <label class="setting-field">Version<input value="${escapeHtml(draft.version)}" data-release-field="version" placeholder="1.2.0" /></label>
        <label class="setting-field">Channel<select data-release-field="channel"><option value="production" ${draft.channel === "production" ? "selected" : ""}>Production</option><option value="staging" ${draft.channel === "staging" ? "selected" : ""}>Staging</option></select></label>
        <label class="setting-field update-url-field">Artifact URL<input value="${escapeHtml(draft.downloadUrl)}" data-release-field="downloadUrl" placeholder="https://.../SmartPrintingKiosk-win-x64.zip" /></label>
        <label class="setting-field">Size in bytes<input type="number" min="1000000" value="${escapeHtml(draft.sizeBytes)}" data-release-field="sizeBytes" /></label>
        <label class="setting-field">Rollout percentage<input type="number" min="0" max="100" value="${escapeHtml(draft.rolloutPercentage)}" data-release-field="rolloutPercentage" /></label>
        <label class="setting-field update-target-field">Target kiosk IDs<input value="${escapeHtml(draft.targetKioskIds)}" data-release-field="targetKioskIds" placeholder="KIOSK-001, KIOSK-002" /></label>
        <label class="setting-field update-hash-field">SHA-256<input value="${escapeHtml(draft.sha256)}" data-release-field="sha256" /></label>
        <label class="setting-field update-signature-field">RSA signature<textarea data-release-field="signature">${escapeHtml(draft.signature)}</textarea></label>
        <label class="setting-field update-notes-field">Release notes<textarea data-release-field="notes">${escapeHtml(draft.notes)}</textarea></label>
      </div>
      <div class="update-toggle-row">
        <label><input type="checkbox" data-release-field="mandatory" ${draft.mandatory ? "checked" : ""} /> Mandatory</label>
        <label><input type="checkbox" data-release-field="active" ${draft.active ? "checked" : ""} /> Active</label>
      </div>
      <div class="flow-actions"><button class="primary-button" data-release-publish>${uiIcon("download", 18)} Publish Release</button></div>
    </section>

    <section class="update-section">
      <div class="section-heading"><h2>Release History</h2><span>${releases.length} releases</span></div>
      <div class="table-wrap">
        <table><thead><tr><th>Version</th><th>Channel</th><th>Rollout</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${releases.length ? releases.map((release) => `
          <tr>
            <td><strong>${escapeHtml(release.version)}</strong><br/><span class="table-subtext">${escapeHtml(release.releaseId)}</span></td>
            <td>${escapeHtml(release.channel)}</td>
            <td>${escapeHtml(release.targetKioskIds?.length ? release.targetKioskIds.join(", ") : `${release.rolloutPercentage}%`)}</td>
            <td>${escapeHtml(formatDateTime(release.publishedAt))}</td>
            <td><span class="status-pill ${release.active ? "" : "warning"}">${release.active ? "Active" : "Paused"}</span></td>
            <td><div class="table-actions"><button class="secondary-button small-button" data-release-toggle="${escapeHtml(release.releaseId)}" data-release-active="${release.active}">${release.active ? "Pause" : "Resume"}</button><button class="danger-button small-button" data-release-delete="${escapeHtml(release.releaseId)}">Delete</button></div></td>
          </tr>`).join("") : `<tr><td colspan="6">No kiosk releases published.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <section class="update-section">
      <div class="section-heading"><h2>Kiosk Update Status</h2><span>${kiosks.length} kiosks</span></div>
      <div class="table-wrap">
        <table><thead><tr><th>Kiosk</th><th>Installed</th><th>Channel</th><th>Update Status</th><th>Target</th><th>Last Check</th></tr></thead>
        <tbody>${kiosks.length ? kiosks.map((kiosk) => `
          <tr>
            <td><strong>${escapeHtml(kiosk.kioskId)}</strong><br/><span class="table-subtext">${escapeHtml(kiosk.branch || kiosk.name)}</span></td>
            <td>${escapeHtml(kiosk.appVersion || "Unknown")}</td>
            <td>${escapeHtml(kiosk.updateChannel || "production")}</td>
            <td><span class="status-pill ${updateStatusClass(kiosk.updateStatus)}">${escapeHtml(kiosk.updateStatus || "current")}</span>${kiosk.updateMessage ? `<div class="update-error">${escapeHtml(kiosk.updateMessage)}</div>` : ""}</td>
            <td>${escapeHtml(kiosk.updateTargetVersion || "-")}</td>
            <td>${escapeHtml(formatDateTime(kiosk.updateLastCheckAt))}</td>
          </tr>`).join("") : `<tr><td colspan="6">No kiosks found.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
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
    state.loginError = "Enter admin email and password.";
    render();
    return;
  }

  try {
    const payload = await loginWithAdminCredentials(email, password);

    storeAdminSession(payload);
    state.loginDraft.password = "";

    if (payload.role === "kiosk-admin") {
      redirectToKioskAdmin();
      return;
    }

    state.authed = true;
    state.authToken = payload.token || "";
    state.loginError = "";
    await loadSnapshot();
  } catch (error) {
    state.authed = false;
    state.authToken = "";
    state.loginError = error.message || "Admin login failed.";
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
    clearAdminSession();
    render();
    return;
  }

  if (button.dataset.action === "toggle-nav") {
    state.navOpen = !state.navOpen;
    render();
    return;
  }

  if (button.dataset.action === "close-nav") {
    state.navOpen = false;
    render();
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

  if (button.dataset.paginationKey && button.dataset.paginationPage) {
    state.pagination[button.dataset.paginationKey] = Math.max(1, Number(button.dataset.paginationPage) || 1);
    render();
    return;
  }

  if (button.dataset.page) {
    state.page = button.dataset.page;
    state.navOpen = false;
    state.editor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if (button.dataset.projectSelect) {
    state.selectedProjectId = button.dataset.projectSelect;
    state.editor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if (button.dataset.clientSelect) {
    state.selectedClientId = button.dataset.clientSelect;
    state.selectedProjectId = "";
    state.editor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if ("projectServiceCreate" in button.dataset) {
    beginCreateServiceForProject();
    return;
  }

  if (button.dataset.kioskServiceEdit) {
    beginEdit("services", button.dataset.kioskServiceEdit);
    return;
  }

  if (button.dataset.projectServiceDelete) {
    await deleteProjectService(button.dataset.projectServiceDelete);
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
    return;
  }

  if ("releaseReset" in button.dataset) {
    resetReleaseDraft();
    render();
    return;
  }

  if ("releasePublish" in button.dataset) {
    await publishRelease();
    return;
  }

  if (button.dataset.releaseToggle) {
    await setReleaseActive(button.dataset.releaseToggle, button.dataset.releaseActive !== "true");
    return;
  }

  if (button.dataset.releaseDelete) {
    await deleteRelease(button.dataset.releaseDelete);
  }
}

async function handleInput(event) {
  const target = event.target;

  if (target.dataset.loginField) {
    state.loginDraft[target.dataset.loginField] = target.value;
    state.loginError = "";
    return;
  }

  if (target.dataset.actionInput === "search") {
    state.search = target.value;
    state.pagination = {};
    render();
    return;
  }

  if (target.dataset.transactionFilter) {
    state.transactionFilters[target.dataset.transactionFilter] = target.value;
    state.pagination["revenue-transactions"] = 1;
    render();
    return;
  }

  if (target.dataset.templateImageUpload !== undefined && target.files?.length) {
    await uploadSuperAdminTemplateImage(target.files[0], Number(target.dataset.templateIndex || 0));
    target.value = "";
    return;
  }

  if (target.dataset.editorField) {
    updateDraftField(target.dataset.editorField, target.value);
    return;
  }

  if (target.dataset.kioskCustomerSetting) {
    updateKioskCustomerSetting(target.dataset.kioskCustomerSetting, target.checked);
    return;
  }

  if (target.dataset.serviceProjectId) {
    updateServiceProjectSelection(target.dataset.serviceProjectId, target.checked);
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
    return;
  }

  if (target.dataset.releaseField) {
    const field = target.dataset.releaseField;
    if (["mandatory", "active"].includes(field)) {
      state.releaseDraft[field] = target.checked;
    } else {
      state.releaseDraft[field] = target.value;
    }
  }
}

function resetReleaseDraft() {
  state.releaseDraft = {
    version: "",
    channel: "production",
    downloadUrl: "",
    sha256: "",
    signature: "",
    sizeBytes: "",
    rolloutPercentage: 10,
    targetKioskIds: "",
    mandatory: false,
    active: true,
    notes: ""
  };
}

async function publishRelease() {
  const draft = state.releaseDraft;
  const release = {
    ...draft,
    sizeBytes: Number(draft.sizeBytes || 0),
    rolloutPercentage: Math.max(0, Math.min(100, Number(draft.rolloutPercentage || 0))),
    targetKioskIds: String(draft.targetKioskIds || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)
  };

  state.notice = "Publishing signed release...";
  state.error = "";
  render();
  try {
    await fetchJson("/api/super-admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(release)
    });
    resetReleaseDraft();
    state.notice = `Release ${release.version} published.`;
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Release publish failed.";
    render();
  }
}

async function setReleaseActive(releaseId, active) {
  state.notice = active ? "Resuming release..." : "Pausing release...";
  render();
  try {
    await fetchJson(`/api/super-admin/releases/${encodeURIComponent(releaseId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active })
    });
    state.notice = active ? "Release resumed." : "Release paused.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Release status change failed.";
    render();
  }
}

async function deleteRelease(releaseId) {
  if (!window.confirm(`Delete release ${releaseId}?`)) return;
  state.notice = "Deleting release...";
  render();
  try {
    await fetchJson(`/api/super-admin/releases/${encodeURIComponent(releaseId)}`, { method: "DELETE" });
    state.notice = "Release deleted.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.error = error.message || "Release delete failed.";
    render();
  }
}

function beginCreate(collection) {
  if (collection === "services") {
    state.error = "Service management is available in kiosk admin.";
    state.page = "dashboard";
    state.editor = null;
    render();
    return;
  }

  if (collection === "projects" && !data("kioskAdmins").length) {
    state.error = "Create a client before creating a project.";
    state.page = "kioskAdmins";
    render();
    return;
  }

  if (collection === "kiosks" && !data("projects").length) {
    state.error = "Create and allocate a project before creating a kiosk.";
    state.page = "projects";
    render();
    return;
  }

  state.page = collection;
  state.editor = {
    mode: "create",
    collection,
    draft: clone(collections[collection].defaults())
  };
  state.notice = "";
  render();
}

function beginCreateServiceForProject() {
  state.error = "Service management is available in kiosk admin.";
  state.page = "dashboard";
  state.editor = null;
  render();
  return;

  const projectId = selectedServiceProjectId();
  const draft = clone(collections.services.defaults());

  draft.projectIds = projectId ? [projectId] : [];
  draft.kioskIds = [];

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
  if (collection === "services") {
    state.error = "Service management is available in kiosk admin.";
    state.page = "dashboard";
    state.editor = null;
    render();
    return;
  }

  const meta = collections[collection];
  const record = data(collection).find((item) => String(item[meta.key]) === String(id));
  if (!record) return;

  const draft = clone(record);
  if (collection === "services") {
    draft.pricing = clone(record.pricing || pricingFor(record.id));
    draft.templates = clone(record.templates || []);
    draft.projectIds = Array.isArray(record.projectIds) ? clone(record.projectIds) : [];
    draft.kioskIds = [];
    draft.customerSettings = normalizeKioskCustomerSettings(record.customerSettings);
    draft.printDefaults = normalizeServicePrintDefaults(record.printDefaults);
  }
  if (collection === "kiosks") {
    draft.customerSettings = normalizeKioskCustomerSettings(record.customerSettings);
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

async function deleteProjectService(serviceId) {
  state.error = "Service management is available in kiosk admin.";
  state.page = "dashboard";
  state.editor = null;
  render();
  return;

  const projectId = selectedServiceProjectId();
  const project = data("projects").find((item) => item.projectId === projectId);
  const service = data("services").find((item) => item.id === serviceId);

  if (!service || !projectId) return;

  const projectIds = serviceAssignableProjects().map((item) => item.projectId);
  const assignedProjectIds = Array.isArray(service.projectIds) ? service.projectIds : [];
  const nextProjectIds = assignedProjectIds.length
    ? assignedProjectIds.filter((id) => id !== projectId)
    : projectIds.filter((id) => id !== projectId);
  const shouldDeleteRecord = nextProjectIds.length === 0;
  const kioskCount = kiosksForProject(projectId).length;
  const message = shouldDeleteRecord
    ? `Delete service ${service.title || service.id}? This is its only assigned project.`
    : `Remove service ${service.title || service.id} from ${project?.name || projectId}? All ${kioskCount} kiosk${kioskCount === 1 ? "" : "s"} in this project will stop receiving it.`;

  if (!window.confirm(message)) return;

  state.notice = shouldDeleteRecord ? "Deleting service..." : "Removing service from project...";
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
          projectIds: nextProjectIds,
          kioskIds: []
        })
      });
      state.notice = `Service removed from ${project?.name || projectId}.`;
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
    } else if (field === "projectIds") {
      draft.projectIds = String(value || "").split(",").map((item) => slug(item, "")).filter(Boolean);
    } else if (field === "bw" || field === "color") {
      draft.pricing = {
        ...(draft.pricing || {}),
        [field]: numeric(value, 0)
      };
    } else if (field === "defaultPages") {
      draft.defaultPages = Math.max(1, Number(value) || 1);
    } else if (field === "mode") {
      draft.mode = value === "template" ? "template" : "upload";
      if (draft.mode === "template" && !draft.templates?.length) {
        draft.templates = [{
          id: "blank-form",
          title: "Sample Form",
          description: "Blank printable template.",
          pages: 1,
          fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
          imageUrl: ""
        }];
      }
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
  } else if (field === "projectIds") {
    draft[field] = String(value || "").split(",").map((item) => slug(item, "")).filter(Boolean);
  } else if (state.editor.collection === "kiosks" && (field === "kioskId" || field === "setupCode")) {
    draft[field] = normalizeKioskCode(value);
  } else {
    draft[field] = fieldConfig.type === "number" ? numeric(value, 0) : value;
  }
}

function updateServiceProjectSelection(projectId, checked) {
  if (!state.editor || state.editor.collection !== "services") return;
  const id = slug(projectId, "");
  const selected = new Set(Array.isArray(state.editor.draft.projectIds) ? state.editor.draft.projectIds : []);
  if (checked) selected.add(id);
  else selected.delete(id);
  state.editor.draft.projectIds = [...selected].filter(Boolean);
}

function updateKioskCustomerSetting(key, checked) {
  if (!state.editor || state.editor.collection !== "kiosks") return;

  const draft = state.editor.draft;
  draft.customerSettings = {
    ...normalizeKioskCustomerSettings(draft.customerSettings),
    [key]: Boolean(checked)
  };

  if (!draft.customerSettings.bw && !draft.customerSettings.color) {
    draft.customerSettings.bw = true;
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
  } else if (field === "imageUrl") {
    template.imageUrl = String(value || "").trim();
    template.documentType = templateDocumentKind(value);
  } else if (field === "documentType") {
    template.documentType = templateDocumentKind(value);
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
    description: "Uploaded template document.",
    pages: 1,
    fields: [],
    imageUrl: "",
    documentType: "image"
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

function validateEditorImageFile(file) {
  if (!file) return "Choose an image or PDF file.";
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImage && !isPdf) {
    return "Choose a PNG, JPG, GIF, WebP, or PDF file.";
  }
  if (file.size > 8 * 1024 * 1024) {
    return "Template document must be 8 MB or smaller.";
  }
  return "";
}

async function uploadSuperAdminTemplateImage(file, templateIndex) {
  if (!state.editor || state.editor.collection !== "services") return;

  const validationError = validateEditorImageFile(file);
  if (validationError) {
    state.error = validationError;
    render();
    return;
  }

  state.notice = "Uploading template document...";
  state.error = "";
  render();

  try {
    const documentType = templateDocumentKind(file.type === "application/pdf" || /\.pdf$/i.test(file.name || "") ? "file.pdf" : file.name);
    const pages = await detectTemplatePageCount(file);
    const title = uploadedTemplateTitle(file, `Template ${templateIndex + 1}`);
    const formData = new FormData();
    formData.append("templateImage", file, file.name);
    const payload = await fetchJson("/api/super-admin/service-image", {
      method: "POST",
      body: formData
    });

    updateDraftTemplate(templateIndex, "imageUrl", payload.imageUrl || "");
    updateDraftTemplate(templateIndex, "documentType", payload.documentType || documentType);
    updateDraftTemplate(templateIndex, "pages", pages);
    updateDraftTemplate(templateIndex, "title", title);
    updateDraftTemplate(templateIndex, "description", `${documentType.toUpperCase()} template document.`);
    state.notice = "Template document uploaded. Save Service to publish it.";
  } catch (error) {
    state.error = error.message || "Template document upload failed.";
  }

  render();
}

function editorPayload() {
  syncEditorDraftFromDom();
  const draft = clone(state.editor.draft);

  if (state.editor.collection === "services") {
    draft.icon = String(draft.icon || "SV").trim().toUpperCase().slice(0, 3);
    draft.id = slug(draft.id || draft.title, "service");
    ["title", "titleHi", "titleMr", "description", "descriptionHi", "descriptionMr"].forEach((field) => {
      draft[field] = String(draft[field] || "").trim();
    });
    draft.projectIds = Array.isArray(draft.projectIds)
      ? draft.projectIds.map((item) => slug(item, "")).filter(Boolean)
      : String(draft.projectIds || "").split(",").map((item) => slug(item, "")).filter(Boolean);
    const assignableProjectIds = serviceAssignableProjectIds();
    draft.projectIds = draft.projectIds.filter((projectId) => assignableProjectIds.has(projectId));
    draft.kioskIds = [];
    draft.customerSettings = normalizeKioskCustomerSettings(draft.customerSettings);
    draft.printDefaults = normalizeServicePrintDefaults(draft.printDefaults);
    draft.pricing = {
      bw: numeric(draft.pricing?.bw, 0),
      color: numeric(draft.pricing?.color, 0)
    };
    draft.templates = (draft.templates || []).map((template, index) => ({
      id: slug(template.id || template.title, `template-${index + 1}`),
      title: String(template.title || `Template ${index + 1}`).trim(),
      description: String(template.description || "Uploaded template document.").trim(),
      pages: Math.max(1, Number(template.pages || 1)),
      fields: Array.isArray(template.fields) ? template.fields : String(template.fields || "").split(",").map((item) => item.trim()).filter(Boolean),
      imageUrl: String(template.imageUrl || "").trim(),
      documentType: templateDocumentKind(template.documentType || template.imageUrl || "")
    })).filter((template) => template.title);
  }

  if (state.editor.collection === "kioskAdmins") {
    draft.adminId = slug(draft.adminId || draft.email || draft.name, "kiosk-admin");
    draft.email = String(draft.email || "").trim().toLowerCase();
    draft.status = draft.status === "disabled" ? "disabled" : "active";
    draft.projectIds = Array.isArray(draft.projectIds)
      ? draft.projectIds.map((item) => slug(item, "")).filter(Boolean)
      : String(draft.projectIds || "").split(",").map((item) => slug(item, "")).filter(Boolean);
    draft.kioskIds = Array.isArray(draft.kioskIds)
      ? draft.kioskIds.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
      : String(draft.kioskIds || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  }

  if (state.editor.collection === "projects") {
    draft.projectId = slug(draft.projectId || draft.name, "project");
    draft.adminId = draft.adminId ? slug(draft.adminId, "") : "";
  }

  if (state.editor.collection === "kiosks") {
    draft.kioskId = normalizeKioskCode(draft.kioskId || `KIOSK-${Date.now().toString().slice(-5)}`);
    draft.setupCode = normalizeKioskCode(draft.setupCode || generateSetupCode());
    draft.customerSettings = normalizeKioskCustomerSettings(draft.customerSettings);
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
  document.querySelectorAll("[data-service-project-id]").forEach((input) => {
    updateServiceProjectSelection(input.dataset.serviceProjectId, input.checked);
  });
  document.querySelectorAll("[data-kiosk-customer-setting]").forEach((input) => {
    updateKioskCustomerSetting(input.dataset.kioskCustomerSetting, input.checked);
  });
}

async function saveEditor() {
  if (!state.editor) return;
  const { collection, mode, id } = state.editor;
  if (collection === "services") {
    state.error = "Service management is available in kiosk admin.";
    state.editor = null;
    state.page = "dashboard";
    render();
    return;
  }
  const payload = editorPayload();
  if (collection === "services" && !payload.projectIds.length) {
    state.error = "Select at least one assigned project for this service.";
    render();
    return;
  }
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
  if (collection === "services") {
    state.error = "Service management is available in kiosk admin.";
    state.page = "dashboard";
    state.editor = null;
    render();
    return;
  }

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
    if (error.sessionExpired) return;
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
    if (error.sessionExpired) return;
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

hydrateAdminSession();
render();
if (state.authed) {
  loadSnapshot();
}
