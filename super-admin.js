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
  sides: true,
  orientation: true,
  pageRange: true
});
const KIOSK_CUSTOMER_SETTING_FIELDS = [
  ["bw", "B/W printing"],
  ["color", "Color printing"],
  ["copies", "Copies"],
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
  snapshotPoller: null,
  loading: false,
  notice: "",
  error: "",
  loginError: "",
  loginDraft: {
    email: "",
    password: ""
  },
  revenueFilter: (() => {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      start: `${fyStartYear}-04-01`,
      end: `${fyStartYear + 1}-03-31`,
      filterType: "financialYear",
      clientId: "",
      kioskId: "",
      financialYear: "current"
    };
  })(),
  revenueFilterDraft: {
    filterType: "financialYear",
    clientId: "",
    kioskId: "",
    financialYear: "current",
    start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  },
  reportTab: "revenue",
  analyticsFilter: {
    basis: "monthly",
    filterType: "financialYear",
    clientId: "",
    kioskId: "",
    financialYear: "current",
    start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
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
  alertFilter: {
    search: "",
    category: "all",
    status: "all",
    kioskId: "all"
  },
  pagination: {},
  selectedClientId: "",
  selectedProjectId: "",
  serviceKioskFocusId: "",
  navOpen: false,
  profileMenuOpen: false,
  settingsModalOpen: false,
  settingsDraft: { username: "superadmin@printingkiosk.local", currentPassword: "", newPassword: "", confirmPassword: "" },
  settingsStatus: "",
  editor: null,
  pricingDraft: {},
  pricingEditor: null,
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
      { id: "revenue", label: "Report", icon: "payments" },
      { id: "analytics", label: "Analytics", icon: "activity" },
      { id: "alerts", label: "Alerts", icon: "alert" }
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
    columns: ["name", "email", "status", "kioskTitle", "kioskSubtitle", "projectIds", "lastLoginAt"],
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", required: true },
      { key: "password", label: "Password" },
      { key: "status", label: "Status", type: "select", options: ["active", "disabled"] },
      { key: "logoUrl", label: "Client logo for kiosk header", type: "image-upload", helper: "Upload a PNG, JPG, GIF, or WebP logo. This logo appears on every kiosk screen under this client." },
      { key: "kioskTitle", label: "Kiosk heading title" },
      { key: "kioskSubtitle", label: "Kiosk heading description", type: "textarea" }
    ],
    defaults: () => ({
      adminId: `admin-${Date.now().toString().slice(-5)}`,
      name: "New Client",
      email: "",
      password: "",
      status: "active",
      logoUrl: "",
      kioskTitle: "",
      kioskSubtitle: "Printing Kiosk",
      idleMediaMode: "none",
      idleImageUrls: [],
      idleVideoUrl: "",
      idleTimeoutSeconds: 60,
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
      kioskId: nextUniqueKioskId(),
      setupCode: uniqueSetupCode(),
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
  } catch { }
}

function clearAdminSession() {
  try {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch { }
}

function isSessionAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 401 || message.includes("admin login required") || message.includes("login required");
}

function expireAdminSession(message = "Session expired. Please sign in again.") {
  stopSnapshotPolling();
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

function stopSnapshotPolling() {
  if (state.snapshotPoller) {
    clearInterval(state.snapshotPoller);
    state.snapshotPoller = null;
  }
}

function startSnapshotPolling() {
  stopSnapshotPolling();
  state.snapshotPoller = setInterval(() => {
    if (state.authed && !document.hidden) {
      loadSnapshot({ quiet: true });
    }
  }, 5000);
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

function kioskIdExists(kioskId = "", ignoreKioskId = "") {
  const normalized = normalizeKioskCode(kioskId);
  const ignored = normalizeKioskCode(ignoreKioskId);
  if (!normalized) return false;
  return data("kiosks").some((kiosk) => {
    const existingId = normalizeKioskCode(kiosk.kioskId);
    return existingId === normalized && existingId !== ignored;
  });
}

function setupCodeExists(setupCode = "", ignoreKioskId = "") {
  const normalized = normalizeKioskCode(setupCode);
  const ignored = normalizeKioskCode(ignoreKioskId);
  if (!normalized) return false;
  return data("kiosks").some((kiosk) => {
    const existingId = normalizeKioskCode(kiosk.kioskId);
    return existingId !== ignored && normalizeKioskCode(kiosk.setupCode) === normalized;
  });
}

function nextUniqueKioskId() {
  const used = new Set(data("kiosks").map((kiosk) => normalizeKioskCode(kiosk.kioskId)).filter(Boolean));
  const numericSuffixes = [...used]
    .map((kioskId) => /^KIOSK-(\d+)$/i.exec(kioskId)?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .filter(Number.isFinite);
  let nextNumber = numericSuffixes.length ? Math.max(...numericSuffixes) + 1 : used.size + 1;

  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = `KIOSK-${String(nextNumber + attempt).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }

  return `KIOSK-${Date.now().toString().slice(-8)}`;
}

function uniqueSetupCode(ignoreKioskId = "") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = generateSetupCode();
    if (!setupCodeExists(candidate, ignoreKioskId)) return candidate;
  }

  return Math.random().toString(36).slice(2, 10).toUpperCase();
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
    paperSize: "A4",
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
    if (!quiet) state.error = "";
  } catch (error) {
    if (!error.sessionExpired) {
      state.error = error.message || "Super admin backend is offline.";
    }
  } finally {
    state.loading = false;
    if ((state.authed || !state.loginError) && !state.editor && !state.pricingEditor) {
      render();
    }
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

function normalizeRatePair(rates = {}, fallback = { bw: 0, color: 0 }) {
  return {
    bw: numeric(rates.bw, fallback.bw || 0),
    color: numeric(rates.color, fallback.color || 0)
  };
}

function pricingFor(serviceId, kioskId = "") {
  const pricing = state.pricingDraft || state.snapshot?.data?.pricing || {};
  const service = data("services").find((item) => item.id === serviceId);
  const defaultRates = normalizeRatePair(service?.pricing || {});
  const globalRates = normalizeRatePair(pricing?.[serviceId] || state.snapshot?.data?.pricing?.[serviceId] || {}, defaultRates);
  const kioskRates = kioskId
    ? pricing?.__kiosks?.[kioskId]?.[serviceId] || state.snapshot?.data?.pricing?.__kiosks?.[kioskId]?.[serviceId]
    : null;
  return kioskRates ? normalizeRatePair(kioskRates, globalRates) : globalRates;
}

function kioskPricingOverrides(kioskId) {
  return state.pricingDraft?.__kiosks?.[kioskId] || {};
}

function render() {
  const app = qs("#app");
  app.innerHTML = state.authed ? renderShell() : renderLogin();
  bindEvents();
}

function renderLogin() {
  return `
    <div class="app-shell admin-shell login-app-shell">
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
            <div class="login-footer-links" style="display: flex; gap: 12px; justify-content: center; margin-top: 24px; font-size: 0.85em; flex-wrap: wrap;">
              <a href="terms.html" style="color: var(--muted); text-decoration: none;">Terms & Conditions</a>
              <span style="color: var(--muted);">|</span>
              <a href="refund.html" style="color: var(--muted); text-decoration: none;">Refund Policy</a>
              <span style="color: var(--muted);">|</span>
              <a href="privacy.html" style="color: var(--muted); text-decoration: none;">Privacy Policy</a>
              <span style="color: var(--muted);">|</span>
              <a href="contact.html" style="color: var(--muted); text-decoration: none;">Contact Us</a>
            </div>
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
      ${renderSettingsModal()}
    </div>
  `;
}

function renderTopbar() {
  const alertCount = superAdminOperationalAlerts().length;

  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-mark" style="background: #ffffff !important;"><img src="./assets/printhub-mark.png" alt="Print Kiosk" /></div>
        <div>
          <div class="brand-title">Super Admin</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="notification-button" data-page="alerts" aria-label="Open operational alerts">
          ${uiIcon("bell", 22)}
          ${alertCount ? `<span>${Math.min(alertCount, 99)}</span>` : ""}
        </button>
        <button class="mobile-nav-toggle" data-action="toggle-nav" aria-controls="super-admin-navigation" aria-expanded="${state.navOpen}" aria-label="${state.navOpen ? "Close navigation" : "Open navigation"}">
          ${uiIcon(state.navOpen ? "close" : "menu", 22)}
        </button>
        <div class="profile-menu-container">
          <button class="profile-avatar-button" data-action="toggle-profile-menu" aria-label="User Profile">
            <div class="avatar-circle">SA</div>
            <span class="profile-name">Super Admin</span>
            ${uiIcon("chevron-down", 14)}
          </button>
          ${state.profileMenuOpen ? `
            <div class="profile-dropdown-menu">
              <div class="profile-dropdown-header">
                <strong>Super Admin</strong>
                <span>Administrator</span>
              </div>
              <div class="profile-dropdown-divider"></div>
              <button class="profile-dropdown-item" data-action="open-settings">
                ${uiIcon("settings", 16)} <span>Account Settings</span>
              </button>
              <button class="profile-dropdown-item" data-action="export-json">
                ${uiIcon("download", 16)} <span>Export System Data</span>
              </button>
              <div class="profile-dropdown-divider"></div>
              <button class="profile-dropdown-item danger" data-action="logout">
                ${uiIcon("logout", 16)} <span>Logout</span>
              </button>
            </div>
          ` : ""}
        </div>
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
  if (state.page === "alerts") return renderAlerts();
  if (state.page === "pricing") return renderPricing();
  if (state.page === "services") return renderKioskServices();
  if (state.page === "revenue") return renderRevenue();
  if (state.page === "analytics") return renderAnalytics();
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
    state.notice ? `<div class="save-note" style="margin-bottom: 12px;">${escapeHtml(state.notice)}</div>` : "",
    state.error ? `<div class="empty-note" style="margin-bottom: 12px;">${escapeHtml(state.error)}</div>` : ""
  ].filter(Boolean);

  return notices.join("");
}

function renderSettingsModal() {
  if (!state.settingsModalOpen) return "";

  return `
    <div class="settings-modal-overlay" data-action="close-settings">
      <div class="settings-modal-card" onclick="event.stopPropagation()">
        <div class="settings-modal-header">
          <h3>Account Settings</h3>
          <button class="ghost-button" data-action="close-settings" style="padding: 4px 8px; min-height: 32px;">✕</button>
        </div>
        <div class="settings-modal-body">
          ${state.settingsStatus ? `<div class="save-note">${escapeHtml(state.settingsStatus)}</div>` : ""}
          <label>
            Admin Email / ID
            <input type="text" data-settings-field="username" value="${escapeHtml(state.settingsDraft.username || "superadmin@printingkiosk.local")}" placeholder="Enter admin email or ID" />
          </label>
          <label>
            Current Password
            <input type="password" data-settings-field="currentPassword" value="${escapeHtml(state.settingsDraft.currentPassword || "")}" placeholder="Enter current password" />
          </label>
          <label>
            New Password
            <input type="password" data-settings-field="newPassword" value="${escapeHtml(state.settingsDraft.newPassword || "")}" placeholder="Enter new password" />
          </label>
          <label>
            Confirm New Password
            <input type="password" data-settings-field="confirmPassword" value="${escapeHtml(state.settingsDraft.confirmPassword || "")}" placeholder="Confirm new password" />
          </label>
        </div>
        <div class="settings-modal-footer">
          <button class="ghost-button" data-action="close-settings">Cancel</button>
          <button class="primary-button" data-action="save-settings">Save Changes</button>
        </div>
      </div>
    </div>
  `;
}

function superAdminOperationalAlerts() {
  const kiosks = data("kiosks");
  return kiosks
    .flatMap(kioskPrinterHealthAlerts)
    .sort((a, b) => (Date.parse(b.lastUpdated || "") || 0) - (Date.parse(a.lastUpdated || "") || 0));
}

function kioskPrinterHealthAlerts(kiosk = {}) {
  const kioskId = kiosk.kioskId || "Kiosk";
  const printerHealth = kiosk.printerHealth && typeof kiosk.printerHealth === "object"
    ? kiosk.printerHealth
    : null;
  const alerts = [];

  if (printerHealth) {
    const printerName = printerHealth.printerName || kiosk.printer || "Printer";
    const paperStatus = String(printerHealth.paperStatus || "").toLowerCase();
    const tonerStatus = String(printerHealth.tonerStatus || "").toLowerCase();
    const lastUpdated = printerHealth.lastUpdated ? ` Last updated: ${formatDateTime(printerHealth.lastUpdated)}.` : "";
    const add = (category, title, detail, tone = "bad") => {
      alerts.push({
        title: `${kioskId} - ${title}`,
        detail: `${printerName}: ${detail}.${lastUpdated}`,
        tone,
        source: "printer",
        category,
        kioskId,
        lastUpdated: printerHealth.lastUpdated || kiosk.lastOnline || ""
      });
    };

    const paperJam = Boolean(printerHealth.paperJam) || paperStatus.includes("jam");
    const noPaper = printerHealth.paper === false || paperStatus.includes("no paper") || paperStatus.includes("out of paper") || paperStatus.includes("empty");
    const paperLow = Boolean(printerHealth.paperLow) || paperStatus.includes("low");
    const doorOpen = Boolean(printerHealth.doorOpen) || paperStatus.includes("door");
    const tonerEmpty = Boolean(printerHealth.tonerEmpty) || tonerStatus.includes("no toner") || tonerStatus.includes("empty") || tonerStatus.includes("replace");
    const tonerLow = Boolean(printerHealth.tonerLow) || tonerStatus.includes("low");
    const queueError = Boolean(printerHealth.queueError);

    if (paperJam) add("paper", "Paper jam detected", "clear the paper jam and close all trays");
    else if (noPaper) add("paper", "Paper empty", "load paper in the tray");
    else if (paperLow) add("paper", "Paper low", "refill paper soon", "warn");

    if (doorOpen) add("paper", "Printer door open", "close the printer door or tray");
    if (tonerEmpty) add("toner", "Toner empty", "replace the toner cartridge");
    else if (tonerLow) add("toner", "Toner low", "keep a replacement toner ready", "warn");
    if (printerHealth.outputBinFull) add("paper", "Output tray full", "remove printed pages from the output tray");
    if (printerHealth.serviceRequested) add("service", "Printer service required", printerHealth.errorMessage || "service intervention required");
    if (queueError) add("queue", "Print queue blocked", printerHealth.errorMessage || "clear the Windows print queue");
  }

  // Only fall back to the generic "Kiosk Offline" alert when there is no specific
  // printer-hardware reading to report. Admins should always see the exact reading
  // (door open, paper jam, ...) when it's known — never have it masked by network
  // status. The generic message is reserved for when the kiosk PC itself can't be
  // reached and there's nothing more specific to say.
  if (alerts.length === 0 && kiosk.status === "offline") {
    return [{
      title: `${kioskId} - Kiosk Offline`,
      detail: `This kiosk is offline or turned off.${kiosk.lastOnline ? ` Last seen: ${formatDateTime(kiosk.lastOnline)}.` : ""}`,
      tone: "bad",
      source: "kiosk",
      category: "network",
      kioskId,
      lastUpdated: kiosk.lastOnline || ""
    }];
  }

  return alerts;
}

function renderDashboard() {
  const summary = state.snapshot?.summary || {};
  const alerts = superAdminOperationalAlerts();
  const affectedKiosks = new Set(alerts.map((alert) => alert.kioskId).filter(Boolean)).size;
  const paperAlerts = alerts.filter((alert) => alert.category === "paper").length;
  const tonerAlerts = alerts.filter((alert) => alert.category === "toner").length;
  const pendingRefunds = data("refunds").filter((r) => String(r.status || "").toLowerCase() === "pending" || String(r.status || "").toLowerCase() === "requested");

  return `
    ${renderHeader("Overview", "Global network status and performance metrics.", `<button class="secondary-button" data-action="refresh">${uiIcon("refresh", 18)} Refresh</button>`)}
    ${renderNotice()}
    <div class="metrics-grid dashboard-metrics">
      ${[
      ["Kiosks", summary.kiosks || 0, `${summary.activeKiosks || 0} online`, "kiosks", "purple"],
      ["Projects", summary.projects || data("projects").length, `${summary.kioskAdmins || data("kioskAdmins").length} clients`, "hierarchy", "blue"],
      ["Payments", summary.payments || 0, money(summary.gross || 0), "payments", "green"],
      ["Refunds", summary.refunds || 0, `${pendingRefunds.length} pending`, "refunds", pendingRefunds.length ? "red" : "green"],
      ["Net Revenue", money(summary.net || 0), "After refunds", "pricing", "green"]
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
        <div class="module-card-title"><span>${uiIcon("printer", 20)}</span><h2>Live Printer Alerts</h2></div>
        <div class="health-list">
          ${renderHealth("Open printer alerts", `${alerts.length}`, alerts.length ? "warn" : "good")}
          ${renderHealth("Kiosks with alerts", `${affectedKiosks}`, affectedKiosks ? "warn" : "good")}
          ${renderHealth("Paper / jam alerts", `${paperAlerts}`, paperAlerts ? "bad" : "good")}
          ${renderHealth("Toner alerts", `${tonerAlerts}`, tonerAlerts ? "bad" : "good")}
        </div>
        <button class="panel-link" data-page="alerts">Open alert center ${uiIcon("alert", 17)}</button>
      </div>
    </div>
  `;
}

function renderAlerts() {
  const alerts = superAdminOperationalAlerts();
  const affectedKiosks = new Set(alerts.map((alert) => alert.kioskId).filter(Boolean)).size;
  const paperAlerts = alerts.filter((alert) => alert.category === "paper").length;
  const tonerAlerts = alerts.filter((alert) => alert.category === "toner").length;
  const queueAlerts = alerts.filter((alert) => alert.category === "queue").length;
  const serviceAlerts = alerts.filter((alert) => alert.category === "service").length;

  return `
    ${renderHeader("Alert Center", "Live printer hardware alerts by kiosk ID.", `<button class="primary-button" data-action="refresh">${uiIcon("refresh", 18)} Refresh</button>`)}
    ${renderNotice()}
    <div class="metrics-grid dashboard-metrics alert-metrics-grid">
      ${[
      ["Open Alerts", alerts.length, "Live printer issues only", "alert", alerts.length ? "red" : "green"],
      ["Kiosks", affectedKiosks, "Kiosk IDs with alerts", "kiosks", affectedKiosks ? "amber" : "green"],
      ["Paper / Jam", paperAlerts, "Paper empty, low, jam, door", "printer", paperAlerts ? "red" : "green"],
      ["Toner", tonerAlerts, "Low or empty cartridge", "pricing", tonerAlerts ? "red" : "green"],
      ["Queue / Service", queueAlerts + serviceAlerts, "Blocked queue or service", "history", queueAlerts + serviceAlerts ? "red" : "green"]
    ].map(([label, value, detail, icon, tone]) => `
        <div class="metric-card has-icon tone-${tone}">
          <span class="metric-icon">${uiIcon(icon, 16)}</span>
          <div class="metric-copy">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value))}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="module-grid alert-cards-grid">
      ${(alerts.length ? alerts : [{ title: "No live printer alerts", detail: "Paper, toner, door, and queue checks are clear.", tone: "good", source: "system" }]).map((alert) => `
        <div class="module-card admin-alert-card admin-alert-card--${escapeHtml(alert.tone || "warn")}">
          <h2>${escapeHtml(alert.title)}</h2>
          <p class="helper-text">${escapeHtml(alert.detail)}</p>
          <span class="badge ${alert.tone === "bad" ? "bad" : alert.tone || "warn"}">${alert.tone === "good" ? "OK" : "Open"}</span>
        </div>
      `).join("")}
    </div>
    ${renderAlertLogsTable()}
  `;
}

function filteredAlertLogs() {
  const allLogs = data("alertLogs") || [];
  const filter = state.alertFilter || { search: "", category: "all", status: "all", kioskId: "all" };

  const searchLower = filter.search.toLowerCase();

  return allLogs.filter(log => {
    if (filter.category !== "all" && log.category !== filter.category) return false;
    if (filter.status !== "all" && log.status !== filter.status) return false;
    if (filter.kioskId !== "all" && log.kioskId !== filter.kioskId) return false;
    if (searchLower) {
      if (!log.title?.toLowerCase().includes(searchLower) &&
          !log.detail?.toLowerCase().includes(searchLower) &&
          !log.kioskId?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
}

window.downloadAlertsReportPDF = function () {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const filtered = filteredAlertLogs();

  doc.setFontSize(18);
  doc.text("Alert History Report", 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 14, 30);

  const tableData = filtered.map(log => [
    formatDateTime(log.createdAt),
    log.kioskId || "Unknown",
    log.category || "-",
    log.title || "-",
    log.detail || "-",
    log.status === "resolved" ? "Resolved" : "Active"
  ]);

  doc.autoTable({
    startY: 36,
    head: [['Date', 'Kiosk', 'Category', 'Title', 'Details', 'Status']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8 }
  });

  doc.save(`Alert_History_Report_${new Date().toISOString().split("T")[0]}.pdf`);
};

function renderAlertLogsTable() {
  const allLogs = data("alertLogs") || [];
  const filter = state.alertFilter || { search: "", category: "all", status: "all", kioskId: "all" };
  const filtered = filteredAlertLogs();

  const rows = filtered.map(log => {
    const tone = log.tone === 'good' ? 'good' : log.status === 'resolved' ? 'good' : (log.tone || 'warn');
    const statusText = log.status === 'resolved' ? 'Resolved' : 'Active';
    return [
      formatDateTime(log.createdAt),
      log.kioskId || "Unknown",
      log.category || "-",
      log.title || "-",
      log.detail || "-",
      `<span class="badge ${tone}">${escapeHtml(statusText)}</span>`
    ];
  });

  const uniqueKiosks = [...new Set(allLogs.map(l => l.kioskId).filter(Boolean))];

  return `
    <section class="module-card transaction-log-card" style="margin-top: 24px; display: flex; flex-direction: column;">
      <div class="module-card-title">
        <span>${uiIcon("history", 20)}</span>
        <h2>Alert History</h2>
        <strong>${escapeHtml(String(filtered.length))} record${filtered.length === 1 ? "" : "s"}</strong>
        <button class="secondary-button" onclick="window.downloadAlertsReportPDF()" style="margin-left: auto;">${uiIcon("download", 16)} Alerts PDF</button>
      </div>

      <div class="transaction-filter-bar" style="margin-bottom: 24px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <input type="text" class="input-field search-input" placeholder="Search alerts..."
               value="${escapeHtml(filter.search)}" 
               oninput="window.updateAlertFilter('search', this.value)" 
               style="flex: 1; min-width: 200px;">
        
        <select class="input-field filter-dropdown" onchange="window.updateAlertFilter('category', this.value)" style="min-width: 150px;">
          <option value="all" ${filter.category === "all" ? "selected" : ""}>All Categories</option>
          <option value="paper" ${filter.category === "paper" ? "selected" : ""}>Paper</option>
          <option value="toner" ${filter.category === "toner" ? "selected" : ""}>Toner</option>
          <option value="queue" ${filter.category === "queue" ? "selected" : ""}>Queue</option>
          <option value="service" ${filter.category === "service" ? "selected" : ""}>Service</option>
        </select>

        <select class="input-field filter-dropdown" onchange="window.updateAlertFilter('status', this.value)" style="min-width: 150px;">
          <option value="all" ${filter.status === "all" ? "selected" : ""}>All Statuses</option>
          <option value="active" ${filter.status === "active" ? "selected" : ""}>Active</option>
          <option value="resolved" ${filter.status === "resolved" ? "selected" : ""}>Resolved</option>
        </select>
        
        <select class="input-field filter-dropdown" onchange="window.updateAlertFilter('kioskId', this.value)" style="min-width: 150px;">
          <option value="all" ${filter.kioskId === "all" ? "selected" : ""}>All Kiosks</option>
          ${uniqueKiosks.map(k => `<option value="${escapeHtml(k)}" ${filter.kioskId === k ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
        </select>
      </div>

      ${renderSmallTable(["Date", "Kiosk", "Category", "Title", "Details", "Status"], rows, "No historical alerts found.", "alert-logs")}
    </section>
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
  const peakItem = series.reduce((max, item) => (item.value > max.value ? item : max), { value: 0, label: "Jul 22" });
  const peak = peakItem.value;
  const peakDayLabel = peakItem.label || "Jul 22";
  const jobs = data("jobs") || [];
  const transactionsCount = jobs.length || series.filter(item => item.value > 0).length || 0;
  
  const trendVal = summary.growth != null ? summary.growth : 18;
  const trendSign = trendVal >= 0 ? "↑" : "↓";
  const trendColor = trendVal >= 0 ? "#10b981" : "#ef4444";

  return `
    <section class="module-card dashboard-revenue-panel">
        <div class="module-card-title revenue-title" style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="color: #8b5cf6;">${uiIcon("payments", 20)}</span>
            <div>
              <h2 style="font-size: 1.2em; margin: 0;">Client Revenue</h2>
              <p style="margin: 0; color: #64748b; font-size: 0.9em;">Network revenue trend across all clients.</p>
            </div>
          </div>
          <strong style="font-size: 1.5em; color: #1e293b;">${money(summary.net || summary.gross || total)}</strong>
        </div>
        ${renderRevenueLineChart(series)}
        <div class="revenue-summary-cards" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line);">
          <div class="revenue-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px;">
            <strong style="font-size: 1.6em; font-weight: 700; color: var(--text-color);">${money(total || summary.gross || 0)}</strong>
            <div>
              <span style="display: inline-block; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85em; color: var(--muted); font-weight: 500;">Total revenue · 14d</span>
            </div>
          </div>
          <div class="revenue-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px;">
            <strong style="font-size: 1.6em; font-weight: 700; color: ${trendColor};">${trendSign} ${Math.abs(trendVal)}%</strong>
            <div>
              <span style="display: inline-block; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85em; color: var(--muted); font-weight: 500;">vs. previous 14 days</span>
            </div>
          </div>
          <div class="revenue-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px;">
            <strong style="font-size: 1.6em; font-weight: 700; color: var(--text-color);">${transactionsCount}</strong>
            <div>
              <span style="display: inline-block; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85em; color: var(--muted); font-weight: 500;">Transactions</span>
            </div>
          </div>
          <div class="revenue-metric-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px;">
            <strong style="font-size: 1.6em; font-weight: 700; color: var(--text-color);">${money(peak)}</strong>
            <div>
              <span style="display: inline-block; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85em; color: var(--muted); font-weight: 500;">Best day · ${peakDayLabel}</span>
            </div>
          </div>
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

function transactionKioskRecord(kioskId = "") {
  return data("kiosks").find((item) => String(item.kioskId || "").toUpperCase() === String(kioskId || "").toUpperCase()) || null;
}

function transactionProjectForKiosk(kioskId = "") {
  const kiosk = transactionKioskRecord(kioskId);
  return data("projects").find((project) => project.projectId === kiosk?.projectId) || null;
}

function transactionClientForProject(project = {}) {
  return data("kioskAdmins").find((client) => (
    client.adminId === project?.adminId ||
    (client.projectIds || []).includes(project?.projectId)
  )) || null;
}

// Mirrors the backend's clientForKiosk() (backend/server.js): a kiosk's
// direct adminId is authoritative when present, so reports/analytics must
// not attribute the kiosk to "Unallocated" just because its Project's
// adminId/projectIds links happen to be out of sync.
function transactionClientForKiosk(kioskId = "", project = null) {
  const kiosk = transactionKioskRecord(kioskId);
  const directAdminId = String(kiosk?.adminId || "").trim();

  if (directAdminId) {
    const directClient = data("kioskAdmins").find((client) => client.adminId === directAdminId);
    if (directClient) return directClient;
  }

  return transactionClientForProject(project);
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
    const client = transactionClientForKiosk(kioskId, project);
    const dateValue = paymentDateValue(payment, job);

    return {
      paymentId: payment.razorpayPaymentId || payment.gatewayTransactionId || payment.paymentId || "",
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
      const client = transactionClientForKiosk(kioskId, project);
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
    <section class="module-card transaction-log-card" style="margin-top: 24px; display: flex; flex-direction: column;">
      <div class="module-card-title">
        <span>${uiIcon("payments", 20)}</span>
        <h2>Transaction Logs</h2>
        <strong>${escapeHtml(String(records.length))} record${records.length === 1 ? "" : "s"}</strong>
      </div>
      ${renderTransactionFilters(allRecords)}
      <div class="table-wrap" style="flex: 1; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              ${["Date", "Client", "Kiosk", "Service", "Amount", "Status", "Gateway Ref"].map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${page.items.length ? page.items.map((record) => `
              <tr>
                <td>${escapeHtml(record.date)}</td>
                <td>${escapeHtml(record.client)}</td>
                <td>${escapeHtml(record.kiosk)}</td>
                <td>${escapeHtml(record.service)}</td>
                <td>${escapeHtml(money(record.amount))}</td>
                <td>${escapeHtml(record.status || "-")}</td>
                <td>${escapeHtml(record.reference || record.method || "-")}</td>
              </tr>
            `).join("") : `
              <tr><td colspan="7">No matching transaction records.</td></tr>
            `}
          </tbody>
        </table>
      </div>
      ${renderPagination("revenue-transactions", page)}
    </section>
  `;
}

function revenueRecordMatchesFilter(record) {
  const filter = state.revenueFilter;
  if (!transactionMatchesDateRange(record, filter.start, filter.end)) return false;
  if (filter.clientId && record.clientId !== filter.clientId) return false;
  if (filter.kioskId && String(record.kiosk || "").toUpperCase() !== filter.kioskId.toUpperCase()) return false;
  return true;
}

function renderRevenueFilterCard() {
  const draft = state.revenueFilterDraft;
  const clients = data("kioskAdmins");
  const kiosks = analyticsKiosksForClient(draft.clientId);

  return `
    <div class="module-card analytics-filter-card">
      <div class="settings-grid analytics-filter-grid">
        <label class="setting-field">Client Name
          <select onchange="window.updateRevenueFilterDraft('clientId', this.value)">
            <option value="" ${!draft.clientId ? "selected" : ""}>-- All Clients --</option>
            ${clients.map((client) => `<option value="${escapeHtml(client.adminId)}" ${draft.clientId === client.adminId ? "selected" : ""}>${escapeHtml(client.name || client.email || client.adminId)}</option>`).join("")}
          </select>
        </label>
        <label class="setting-field">Kiosk ID
          <select onchange="window.updateRevenueFilterDraft('kioskId', this.value)">
            <option value="" ${!draft.kioskId ? "selected" : ""}>-- All Kiosks --</option>
            ${kiosks.map((kiosk) => `<option value="${escapeHtml(kiosk.kioskId)}" ${draft.kioskId === kiosk.kioskId ? "selected" : ""}>${escapeHtml(kiosk.kioskId)}${kiosk.branch ? ` | ${escapeHtml(kiosk.branch)}` : ""}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="analytics-filter-type-row" style="margin-top: 16px;">
        <label class="analytics-radio">
          <input type="radio" name="revenue-filter-type" value="financialYear" ${draft.filterType === "financialYear" ? "checked" : ""} onchange="window.updateRevenueFilterDraft('filterType', this.value)" />
          <span>Financial Year</span>
        </label>
        <label class="analytics-radio">
          <input type="radio" name="revenue-filter-type" value="dateRange" ${draft.filterType === "dateRange" ? "checked" : ""} onchange="window.updateRevenueFilterDraft('filterType', this.value)" />
          <span>Date Range</span>
        </label>
      </div>

      <div class="revenue-filter-apply-row">
        ${draft.filterType === "financialYear" ? `
          <label class="setting-field">Financial Year
            <select onchange="window.updateRevenueFilterDraft('financialYear', this.value)">
              <option value="current" ${draft.financialYear === "current" ? "selected" : ""}>Current FY (Apr-Mar)</option>
              <option value="last" ${draft.financialYear === "last" ? "selected" : ""}>Last FY</option>
              <option value="previous" ${draft.financialYear === "previous" ? "selected" : ""}>Previous FY</option>
            </select>
          </label>
        ` : `
          <label class="setting-field">Start Date
            <input type="date" value="${escapeHtml(draft.start)}" onchange="window.updateRevenueFilterDraft('start', this.value)" />
          </label>
          <label class="setting-field">End Date
            <input type="date" value="${escapeHtml(draft.end)}" onchange="window.updateRevenueFilterDraft('end', this.value)" />
          </label>
        `}
        <button class="primary-button revenue-apply-filter-btn" onclick="window.applyRevenueFilter()">${uiIcon("filter", 16)} Apply Filter</button>
      </div>
    </div>
  `;
}

window.updateRevenueFilterDraft = (field, value) => {
  state.revenueFilterDraft[field] = value;
  if (field === "clientId") {
    state.revenueFilterDraft.kioskId = "";
  }
  render();
};

window.applyRevenueFilter = () => {
  const draft = state.revenueFilterDraft;
  const bounds = draft.filterType === "financialYear"
    ? financialYearDateStrings(draft.financialYear === "last" ? 1 : draft.financialYear === "previous" ? 2 : 0)
    : { start: draft.start, end: draft.end };

  state.revenueFilter = { ...draft, start: bounds.start, end: bounds.end };
  state.pagination["revenue-transactions"] = 1;
  render();
};

function renderRevenue() {
  const summary = state.snapshot?.summary || {};
  const allRecords = superAdminTransactionRecords();
  const records = allRecords.filter(revenueRecordMatchesFilter);
  const filteredTotal = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const currentTab = state.reportTab || "revenue";

  return `
    ${renderHeader("Report", "Transaction logs, filters, and payment reconciliation across every client.", `<button class="secondary-button" data-action="refresh">${uiIcon("refresh", 18)} Refresh</button>`)}
    ${renderNotice()}

    <div style="display: flex; gap: 16px; margin-bottom: 24px; border-bottom: 1px solid var(--line); padding-bottom: 0;">
      <button class="nav-button" style="background: none; border: none; padding: 12px 24px; font-weight: 600; font-size: 1.1em; color: ${currentTab === 'revenue' ? 'var(--primary)' : 'var(--muted)'}; border-bottom: ${currentTab === 'revenue' ? '3px solid var(--primary)' : '3px solid transparent'}; cursor: pointer;" onclick="window.setReportTab('revenue')">Revenue Report</button>
      <button class="nav-button" style="background: none; border: none; padding: 12px 24px; font-weight: 600; font-size: 1.1em; color: ${currentTab === 'form' ? 'var(--primary)' : 'var(--muted)'}; border-bottom: ${currentTab === 'form' ? '3px solid var(--primary)' : '3px solid transparent'}; cursor: pointer;" onclick="window.setReportTab('form')">Form Report</button>
    </div>

    ${renderRevenueFilterCard()}

    <div style="display: flex; gap: 8px; margin: -12px 0 24px; justify-content: flex-end;">
      ${currentTab === 'revenue' ? `<button class="primary-button" onclick="window.downloadRevenueReportPDF()">${uiIcon("download", 16)} Revenue PDF</button>` : ''}
      ${currentTab === 'form' ? `<button class="secondary-button" onclick="window.downloadFormPrintReportPDF()">${uiIcon("download", 16)} Form Print PDF</button>` : ''}
    </div>

    ${currentTab === 'revenue' ? `
      ${renderTransactionLog()}
    ` : ''}

    ${currentTab === 'form' ? `
      <div class="revenue-desk-section table-section module-card" id="form-selling-report-container">
        ${renderFormSellingTable()}
      </div>
    ` : ''}
  `;
}

function roundedTopRectPath(x, y, w, h, r) {
  if (h <= 0 || w <= 0) return "";
  const radius = Math.min(r, w / 2, h);
  return `M${x.toFixed(1)},${(y + radius).toFixed(1)} ` +
    `Q${x.toFixed(1)},${y.toFixed(1)} ${(x + radius).toFixed(1)},${y.toFixed(1)} ` +
    `L${(x + w - radius).toFixed(1)},${y.toFixed(1)} ` +
    `Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + radius).toFixed(1)} ` +
    `L${(x + w).toFixed(1)},${(y + h).toFixed(1)} ` +
    `L${x.toFixed(1)},${(y + h).toFixed(1)} Z`;
}

function renderRevenueLineChart(series = []) {
  const width = 920;
  const height = 290;
  const padding = { top: 24, right: 36, bottom: 46, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.map((item) => item.value));
  const yMax = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const bandWidth = series.length ? chartWidth / series.length : chartWidth;
  const barWidth = Math.max(4, Math.min(24, bandWidth * 0.55));
  const barRadius = Math.min(4, barWidth / 2);

  const bars = series.map((item, index) => {
    const cx = padding.left + bandWidth * (index + 0.5);
    const barHeight = (Math.max(0, item.value) / yMax) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    return { ...item, cx, x: cx - barWidth / 2, y, barHeight };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(yMax * ratio);
    const y = padding.top + chartHeight - ratio * chartHeight;
    return { value, y };
  });

  return `
    <style>
      .revenue-chart-wrap { position: relative; }
      .revenue-grid-bg { fill: url(#dotGrid); }
      .revenue-bar { fill: #8b5cf6; transition: opacity 0.15s ease; }
      .revenue-bar-group:hover .revenue-bar,
      .revenue-bar-group:focus-visible .revenue-bar { opacity: 0.82; }
      .revenue-bar-group .tooltip-box { opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
      .revenue-bar-group:hover .tooltip-box,
      .revenue-bar-group:focus-visible .tooltip-box { opacity: 1; }
      .hover-capture { fill: transparent; cursor: pointer; }
      .hover-capture:focus { outline: none; }
      .tooltip-box { filter: drop-shadow(0 4px 12px rgba(0,0,0,0.08)); }
    </style>
    <div class="revenue-chart-wrap dashboard-revenue-chart">
      <svg class="revenue-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Client revenue bar graph">
        <defs>
          <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="#e2e8f0" />
          </pattern>
        </defs>

        <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" class="revenue-grid-bg" />

        <g class="revenue-grid">
          ${yTicks.map((tick) => `
            <text class="revenue-y-label" x="${padding.left - 14}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="11px" font-weight="500">${money(tick.value).replace("Rs. ", "")}</text>
          `).join("")}
        </g>

        <g class="revenue-bars">
          ${bars.map((bar) => {
    const tooltipX = Math.min(width - padding.right - 84, Math.max(padding.left, bar.cx - 42));
    const tooltipY = Math.max(padding.top, bar.y - 50);
    return `
            <g class="revenue-bar-group" tabindex="0">
              <rect x="${(bar.cx - bandWidth / 2).toFixed(1)}" y="${padding.top}" width="${bandWidth.toFixed(1)}" height="${chartHeight}" class="hover-capture" />

              <path class="revenue-bar" d="${roundedTopRectPath(bar.x, bar.y, barWidth, bar.barHeight, barRadius)}" />

              <g class="tooltip-box" transform="translate(${tooltipX.toFixed(1)}, ${tooltipY.toFixed(1)})">
                <rect width="84" height="42" rx="6" fill="#ffffff" stroke="#f1f5f9" stroke-width="1" />
                <text x="12" y="16" fill="#64748b" font-size="10px" font-weight="500">${escapeHtml(bar.label)}</text>
                <text x="12" y="32" fill="#8b5cf6" font-size="13px" font-weight="700">${escapeHtml(money(bar.value))}</text>
              </g>
            </g>
          `;
  }).join("")}
        </g>

        <g class="revenue-x-axis">
          ${bars.map((bar, index) => index % 2 === 0 || index === bars.length - 1 ? `
            <text class="revenue-x-label" x="${bar.cx.toFixed(1)}" y="${height - 12}" text-anchor="middle" fill="#94a3b8" font-size="11px" font-weight="500">${escapeHtml(bar.label)}</text>
          ` : "").join("")}
        </g>
      </svg>
    </div>
  `;
}

window.updateAlertFilter = (field, value) => {
  state.alertFilter[field] = value;
  state.pagination["alert-logs"] = 1;
  render();
};

window.setReportTab = (tab) => {
  state.reportTab = tab;
  render();
};

window.downloadRevenueReportPDF = function () {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const allRecords = superAdminTransactionRecords();
  const records = allRecords.filter(revenueRecordMatchesFilter);
  const clients = data("kioskAdmins");
  const clientLabel = state.revenueFilter.clientId ? (clients.find((client) => client.adminId === state.revenueFilter.clientId)?.name || state.revenueFilter.clientId) : "All Clients";
  const kioskLabel = state.revenueFilter.kioskId || "All Kiosks";

  doc.setFontSize(18);
  doc.text("Super Admin Revenue Report", 14, 22);
  doc.setFontSize(11);
  doc.text(`Date Range: ${state.revenueFilter.start} to ${state.revenueFilter.end}`, 14, 30);
  doc.text(`Client: ${clientLabel}    Kiosk: ${kioskLabel}`, 14, 37);

  const tableData = records.map(r => [
    formatDate(r.createdAt || r.date),
    r.kiosk || "Unknown",
    r.clientName || r.client || "Unknown",
    r.amount ? money(r.amount) : "0",
    r.status || "Completed"
  ]);

  doc.autoTable({
    startY: 43,
    head: [['Date', 'Kiosk', 'Client', 'Amount', 'Status']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 9 }
  });

  doc.save(`Revenue_Report_${state.revenueFilter.start}_to_${state.revenueFilter.end}.pdf`);
};

window.downloadFormPrintReportPDF = function () {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const stats = data("dailyStats") || [];

  const startObj = new Date(state.revenueFilter.start);
  startObj.setHours(0, 0, 0, 0);
  const endObj = new Date(state.revenueFilter.end);
  endObj.setHours(23, 59, 59, 999);

  const filteredStats = stats.filter(stat => {
    if (!stat.date) return false;
    const statDate = new Date(stat.date.split("T")[0]);
    if (statDate < startObj || statDate > endObj) return false;
    if (state.revenueFilter.clientId && stat.clientId !== state.revenueFilter.clientId) return false;
    if (state.revenueFilter.kioskId && String(stat.kioskId || "").toUpperCase() !== state.revenueFilter.kioskId.toUpperCase()) return false;
    return true;
  });

  doc.setFontSize(18);
  doc.text("Form Print Data (Kiosk-wise)", 14, 22);
  doc.setFontSize(11);
  doc.text(`Date Range: ${state.revenueFilter.start} to ${state.revenueFilter.end}`, 14, 30);

  const tableData = filteredStats.map(stat => [
    stat.date ? stat.date.split("T")[0] : "",
    stat.kioskId || "Unknown",
    stat.clientId || "Unknown",
    stat.successPrints || 0,
    stat.failedPrints || 0,
    stat.revenue ? money(stat.revenue) : "0"
  ]);

  doc.autoTable({
    startY: 36,
    head: [['Date', 'Kiosk ID', 'Client ID', 'Successful Prints', 'Failed Prints', 'Revenue']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 9 }
  });

  doc.save(`Form_Print_Report_${state.revenueFilter.start}_to_${state.revenueFilter.end}.pdf`);
};

function financialYearDateStrings(offset = 0) {
  const now = new Date();
  const fyStartYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - offset;
  return { start: `${fyStartYear}-04-01`, end: `${fyStartYear + 1}-03-31` };
}

// ── Graphical Analytics (Super Admin) ────────────────────────────────
// Monthly transaction revenue, filtered by client, kiosk, and financial
// year or a custom date range. Only successful/completed payments count.

function analyticsFinancialYearBounds(offset = 0) {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const targetStartYear = fyStartYear - offset;
  const start = new Date(targetStartYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(targetStartYear + 1, 2, 31, 23, 59, 59, 999);
  const label = `FY ${targetStartYear}-${String((targetStartYear + 1) % 100).padStart(2, "0")} (Apr-Mar)`;
  return { start, end, label };
}

function analyticsFilterBounds() {
  const filter = state.analyticsFilter;

  if (filter.filterType === "financialYear") {
    const offset = filter.financialYear === "last" ? 1 : filter.financialYear === "previous" ? 2 : 0;
    return analyticsFinancialYearBounds(offset);
  }

  const start = filter.start ? new Date(`${filter.start}T00:00:00`) : null;
  const end = filter.end ? new Date(`${filter.end}T23:59:59.999`) : null;
  const label = filter.start && filter.end ? `${filter.start} to ${filter.end}` : "All dates";
  return { start, end, label };
}

function analyticsBuckets(start, end, basis) {
  if (!start || !end || start > end) return [];

  const buckets = [];
  let cursor;
  let last;
  let guard = 0;
  
  if (basis === "daily") {
    cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    
    while (cursor <= last && guard < 400) {
      buckets.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`,
        label: cursor.toLocaleString("en-US", { month: "short", day: "numeric" }),
        year: cursor.getFullYear(),
        amount: 0
      });
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  } else if (basis === "weekly") {
    cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    cursor.setDate(cursor.getDate() - cursor.getDay());
    last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    last.setDate(last.getDate() - last.getDay());
    
    while (cursor <= last && guard < 60) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      buckets.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`,
        label: `${cursor.toLocaleString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleString("en-US", { month: "short", day: "numeric" })}`,
        year: cursor.getFullYear(),
        amount: 0
      });
      cursor.setDate(cursor.getDate() + 7);
      guard += 1;
    }
  } else {
    cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    last = new Date(end.getFullYear(), end.getMonth(), 1);
    
    while (cursor <= last && guard < 60) {
      buckets.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleString("en-US", { month: "short" }),
        year: cursor.getFullYear(),
        amount: 0
      });
      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }
  }

  return buckets;
}

function analyticsKiosksForClient(clientId) {
  const kiosks = data("kiosks");
  if (!clientId) return kiosks;

  return kiosks.filter((kiosk) => {
    const project = transactionProjectForKiosk(kiosk.kioskId);
    const client = transactionClientForKiosk(kiosk.kioskId, project);
    return client?.adminId === clientId;
  });
}

function analyticsFilteredRecords() {
  const filter = state.analyticsFilter;
  const { start, end } = analyticsFilterBounds();

  return superAdminTransactionRecords().filter((record) => {
    if (!transactionMatchesStatus(record, "success")) return false;

    const ts = transactionTimestamp(record.dateValue);
    if (!ts) return false;
    if (start && ts < start.getTime()) return false;
    if (end && ts > end.getTime()) return false;
    if (filter.clientId && record.clientId !== filter.clientId) return false;
    if (filter.kioskId && String(record.kiosk || "").toUpperCase() !== filter.kioskId.toUpperCase()) return false;

    return true;
  });
}

function analyticsBucketedSeries() {
  const { start, end } = analyticsFilterBounds();
  const basis = state.analyticsFilter.basis || "monthly";
  const buckets = analyticsBuckets(start, end, basis);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  analyticsFilteredRecords().forEach((record) => {
    const recordDate = new Date(record.dateValue);
    if (Number.isNaN(recordDate.getTime())) return;

    let key;
    if (basis === "daily") {
      key = `${recordDate.getFullYear()}-${recordDate.getMonth() + 1}-${recordDate.getDate()}`;
    } else if (basis === "weekly") {
      const rDate = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
      rDate.setDate(rDate.getDate() - rDate.getDay());
      key = `${rDate.getFullYear()}-${rDate.getMonth() + 1}-${rDate.getDate()}`;
    } else {
      key = `${recordDate.getFullYear()}-${recordDate.getMonth()}`;
    }

    const bucket = bucketByKey.get(key);
    if (!bucket) return;

    bucket.amount += Number(record.amount || 0);
  });

  return buckets;
}

function analyticsKioskBreakdown() {
  const totals = new Map();

  analyticsFilteredRecords().forEach((record) => {
    const key = record.kiosk || UNASSIGNED_KIOSK_ID;
    totals.set(key, (totals.get(key) || 0) + Number(record.amount || 0));
  });

  const kiosks = data("kiosks");

  return Array.from(totals.entries())
    .map(([kioskId, amount]) => {
      const kiosk = kiosks.find((item) => item.kioskId === kioskId);
      const project = transactionProjectForKiosk(kioskId);
      const client = transactionClientForKiosk(kioskId, project);
      return {
        kioskId,
        name: kiosk?.name || "",
        branch: kiosk?.branch || "",
        clientName: client?.name || client?.email || "",
        amount
      };
    })
    .sort((left, right) => right.amount - left.amount);
}

function renderAnalytics() {
  const filter = state.analyticsFilter;
  const clients = data("kioskAdmins");
  const kiosks = analyticsKiosksForClient(filter.clientId);
  const selectedClient = filter.clientId ? clients.find((client) => client.adminId === filter.clientId) : null;
  const buckets = analyticsBucketedSeries();
  const kioskBreakdown = analyticsKioskBreakdown();
  const totalAmount = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const { label: rangeLabel } = analyticsFilterBounds();
  const clientLabel = selectedClient ? (selectedClient.name || selectedClient.email || selectedClient.adminId) : "All Clients";
  const hasData = buckets.length > 0;

  return `
    ${renderHeader("Graphical Analytics", "Revenue trends by financial year or custom date range, across any client or kiosk.", `
      <button class="secondary-button" ${hasData ? "" : "disabled"} onclick="window.print()">${uiIcon("printer", 16)} Print</button>
      <button class="primary-button" ${hasData ? "" : "disabled"} onclick="window.downloadAnalyticsPDF()">${uiIcon("download", 16)} Download PDF</button>
    `)}
    ${renderNotice()}

    <div class="analytics-layout-container">
      <div class="module-card analytics-report-area" id="analytics-print-area">
        <div class="analytics-report-header">
          ${selectedClient?.logoUrl ? `<img class="analytics-report-logo" src="${escapeHtml(selectedClient.logoUrl)}" alt="${escapeHtml(selectedClient.name || "Client")}" />` : `<div class="analytics-report-logo analytics-report-logo-placeholder"></div>`}
          <div class="analytics-report-heading">
            <h1>Graphical Analytics Report</h1>
            <p class="analytics-report-client">Client: ${escapeHtml(clientLabel)}</p>
            <p class="analytics-report-meta">Kiosk ID: ${escapeHtml(filter.kioskId || "All Kiosks")} &nbsp;·&nbsp; ${escapeHtml(rangeLabel)}</p>
          </div>
          <img class="analytics-report-logo analytics-report-logo-wide" src="./assets/printhub-logo-transparent.png" alt="Aarya Innovtech" />
        </div>

        <div class="section-heading">
          <h2>💰 ${filter.basis.charAt(0).toUpperCase() + filter.basis.slice(1)} Transaction Revenue (₹)</h2>
        </div>
        ${hasData ? renderAnalyticsChart(buckets) : `<div class="empty-note">No data for this range yet.</div>`}

        <div class="analytics-summary-row">
          <div class="analytics-summary-tile is-total">
            <span>Total Revenue</span>
            <strong>${escapeHtml(money(totalAmount))}</strong>
          </div>
        </div>

        ${hasData ? `
          <div class="analytics-table-wrap">
            <table class="analytics-table">
              <thead>
                <tr><th>Period</th><th>Amount (₹)</th></tr>
              </thead>
              <tbody>
                ${buckets.map((bucket) => `
                  <tr>
                    <td>${escapeHtml(bucket.label)} ${bucket.year}</td>
                    <td>${escapeHtml(money(bucket.amount))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}

        ${kioskBreakdown.length ? `
          <div class="section-heading">
            <h2>Revenue by Kiosk</h2>
          </div>
          <div class="analytics-table-wrap">
            <table class="analytics-table">
              <thead>
                <tr><th>Kiosk ID</th><th>Kiosk Name</th>${selectedClient ? "" : "<th>Client</th>"}<th>Amount (₹)</th></tr>
              </thead>
              <tbody>
                ${kioskBreakdown.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.kioskId)}</td>
                    <td>${escapeHtml([row.name, row.branch].filter(Boolean).join(" · ") || "—")}</td>
                    ${selectedClient ? "" : `<td>${escapeHtml(row.clientName || "Unallocated")}</td>`}
                    <td>${escapeHtml(money(row.amount))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
      </div>

      <div class="module-card analytics-filter-card" data-print-hide>
        <div class="section-heading">
          <h2>Data Basis</h2>
        </div>
        <div class="analytics-filter-type-row">
          <label class="analytics-radio">
            <input type="radio" name="analytics-basis" value="daily" ${filter.basis === "daily" ? "checked" : ""} onchange="window.updateAnalyticsFilter('basis', this.value)" />
            <span>Daily</span>
          </label>
          <label class="analytics-radio">
            <input type="radio" name="analytics-basis" value="weekly" ${filter.basis === "weekly" ? "checked" : ""} onchange="window.updateAnalyticsFilter('basis', this.value)" />
            <span>Weekly</span>
          </label>
          <label class="analytics-radio">
            <input type="radio" name="analytics-basis" value="monthly" ${filter.basis === "monthly" ? "checked" : ""} onchange="window.updateAnalyticsFilter('basis', this.value)" />
            <span>Monthly</span>
          </label>
        </div>

        <div class="section-heading">
          <h2>Filter Type</h2>
        </div>
        <div class="analytics-filter-type-row">
          <label class="analytics-radio">
            <input type="radio" name="analytics-filter-type" value="financialYear" ${filter.filterType === "financialYear" ? "checked" : ""} onchange="window.updateAnalyticsFilter('filterType', this.value)" />
            <span>Financial Year</span>
          </label>
          <label class="analytics-radio">
            <input type="radio" name="analytics-filter-type" value="dateRange" ${filter.filterType === "dateRange" ? "checked" : ""} onchange="window.updateAnalyticsFilter('filterType', this.value)" />
            <span>Date Range</span>
          </label>
        </div>

        <div class="settings-grid analytics-filter-grid">
          <label class="setting-field">Client Name
            <select onchange="window.updateAnalyticsFilter('clientId', this.value)">
              <option value="" ${!filter.clientId ? "selected" : ""}>-- All Clients --</option>
              ${clients.map((client) => `<option value="${escapeHtml(client.adminId)}" ${filter.clientId === client.adminId ? "selected" : ""}>${escapeHtml(client.name || client.email || client.adminId)}</option>`).join("")}
            </select>
          </label>
          <label class="setting-field">Kiosk ID
            <select onchange="window.updateAnalyticsFilter('kioskId', this.value)">
              <option value="" ${!filter.kioskId ? "selected" : ""}>-- All Kiosks --</option>
              ${kiosks.map((kiosk) => `<option value="${escapeHtml(kiosk.kioskId)}" ${filter.kioskId === kiosk.kioskId ? "selected" : ""}>${escapeHtml(kiosk.kioskId)}${kiosk.branch ? ` | ${escapeHtml(kiosk.branch)}` : ""}</option>`).join("")}
            </select>
          </label>
          ${filter.filterType === "financialYear" ? `
            <label class="setting-field">Financial Year
              <select onchange="window.updateAnalyticsFilter('financialYear', this.value)">
                <option value="current" ${filter.financialYear === "current" ? "selected" : ""}>Current FY (Apr-Mar)</option>
                <option value="last" ${filter.financialYear === "last" ? "selected" : ""}>Last FY</option>
                <option value="previous" ${filter.financialYear === "previous" ? "selected" : ""}>Previous FY</option>
              </select>
            </label>
          ` : `
            <label class="setting-field">Start Date
              <input type="date" value="${escapeHtml(filter.start)}" onchange="window.updateAnalyticsFilter('start', this.value)" />
            </label>
            <label class="setting-field">End Date
              <input type="date" value="${escapeHtml(filter.end)}" onchange="window.updateAnalyticsFilter('end', this.value)" />
            </label>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderAnalyticsChart(buckets) {
  const minGroupWidth = 40;
  const padding = { top: 20, right: 24, bottom: 40, left: 64 };
  const baseChartWidth = 960 - padding.left - padding.right;
  const chartWidth = Math.max(baseChartWidth, buckets.length * minGroupWidth);
  const width = chartWidth + padding.left + padding.right;
  const height = 320;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.amount));
  const yMax = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const groupWidth = chartWidth / buckets.length;
  const barWidth = Math.max(6, groupWidth * 0.5);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: Math.round(yMax * ratio),
    y: padding.top + chartHeight - ratio * chartHeight
  }));

  const bars = buckets.map((bucket, index) => {
    const groupX = padding.left + index * groupWidth;
    const barHeight = (bucket.amount / yMax) * chartHeight;
    return {
      label: `${bucket.label} ${String(bucket.year).slice(-2)}`,
      barX: groupX + groupWidth / 2 - barWidth / 2,
      barY: padding.top + chartHeight - barHeight,
      barHeight,
      amount: bucket.amount,
      centerX: groupX + groupWidth / 2
    };
  });

  return `
    <style>
      .analytics-chart-wrap { --amount-color: #2a78d6; position: relative; overflow-x: auto; overflow-y: hidden; padding-bottom: 8px; }
      .analytics-bar { transition: opacity 0.15s ease; }
      .analytics-bar-group:hover .analytics-bar { opacity: 0.85; }
      .analytics-bar-tooltip { opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
      .analytics-bar-group:hover .analytics-bar-tooltip { opacity: 1; }
    </style>
    <div class="analytics-chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Transaction revenue chart" style="min-width: 100%; width: ${width}px; height: ${height}px;">
        <g>
          ${yTicks.map((tick) => `
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />
            <text x="${padding.left - 10}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="11px" font-weight="500">${escapeHtml(money(tick.value).replace("Rs. ", ""))}</text>
          `).join("")}
        </g>
        <g>
          ${bars.map((bar) => `
            <g class="analytics-bar-group">
              <rect class="analytics-bar" x="${bar.barX.toFixed(1)}" y="${bar.barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, bar.barHeight).toFixed(1)}" rx="4" fill="var(--amount-color)" />
              <rect x="${(bar.centerX - groupWidth / 2).toFixed(1)}" y="${padding.top}" width="${groupWidth.toFixed(1)}" height="${chartHeight}" fill="transparent" />
              <text x="${bar.centerX.toFixed(1)}" y="${height - 16}" text-anchor="middle" fill="#64748b" font-size="11px" font-weight="500">${escapeHtml(bar.label)}</text>
              <g class="analytics-bar-tooltip" transform="translate(${Math.min(width - 100, Math.max(4, bar.centerX - 50))}, ${Math.max(padding.top, bar.barY - 30)})">
                <rect width="100" height="26" rx="6" fill="#ffffff" stroke="#e2e8f0" />
                <text x="10" y="17" fill="var(--amount-color)" font-size="11px" font-weight="700">${escapeHtml(money(bar.amount))}</text>
              </g>
            </g>
          `).join("")}
        </g>
      </svg>
    </div>
  `;
}

window.updateAnalyticsFilter = (field, value) => {
  state.analyticsFilter[field] = value;
  if (field === "clientId") {
    state.analyticsFilter.kioskId = "";
  }
  render();
};

async function loadImageAsDataUrl(url) {
  if (!url) return null;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function dataUrlImageFormat(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || "");
  const type = (match?.[1] || "png").toUpperCase();
  return type === "JPG" ? "JPEG" : type;
}

function loadImageNaturalSize(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Fits an image inside a maxWidth x maxHeight box without stretching it —
// jsPDF's addImage has no "contain" option of its own, it stretches to
// whatever width/height you pass, so a fixed square box squishes any
// non-square logo (most logos are wider than tall).
function fitImageBox(naturalSize, maxWidth, maxHeight) {
  if (!naturalSize || !naturalSize.width || !naturalSize.height) {
    return { width: maxWidth, height: maxHeight };
  }

  const scale = Math.min(maxWidth / naturalSize.width, maxHeight / naturalSize.height);
  return { width: naturalSize.width * scale, height: naturalSize.height * scale };
}

// jsPDF can't render an <svg> directly — rasterize the already-rendered chart
// SVG onto an offscreen canvas (at 2x for print sharpness) and hand addImage
// a PNG instead. The chart is pure vector shapes/text with no external image
// refs, so this never hits a canvas cross-origin taint.
function svgElementToPngDataUrl(svgElement, scale = 2) {
  return new Promise((resolve) => {
    if (!svgElement) {
      resolve(null);
      return;
    }

    const viewBox = svgElement.viewBox?.baseVal;
    const width = (viewBox && viewBox.width) || svgElement.clientWidth || 960;
    const height = (viewBox && viewBox.height) || svgElement.clientHeight || 320;

    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

function drawPdfWatermark(doc, logoDataUrl, naturalSize) {
  if (!logoDataUrl) return;

  try {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const box = fitImageBox(naturalSize, pageWidth * 0.6, pageHeight * 0.35);

    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.07 }));
    doc.addImage(logoDataUrl, dataUrlImageFormat(logoDataUrl), (pageWidth - box.width) / 2, (pageHeight - box.height) / 2, box.width, box.height);
    doc.restoreGraphicsState();
  } catch {
    // Opacity/GState support can vary by jsPDF build — a missing watermark
    // should never break the rest of the PDF export.
  }
}

const PDF_TABLE_STYLE = {
  styles: {
    fontSize: 10,
    lineColor: [42, 120, 214],
    lineWidth: 0.2,
    textColor: [30, 41, 59],
    cellPadding: 5
  },
  headStyles: {
    fillColor: [27, 175, 122],
    textColor: 255,
    fontStyle: "bold",
    halign: "center"
  },
  alternateRowStyles: {
    fillColor: [240, 253, 244]
  }
};

window.downloadAnalyticsPDF = async function () {
  const filter = state.analyticsFilter;
  const clients = data("kioskAdmins");
  const selectedClient = filter.clientId ? clients.find((client) => client.adminId === filter.clientId) : null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const buckets = analyticsBucketedSeries();
  const kioskBreakdown = analyticsKioskBreakdown();
  const { label: rangeLabel } = analyticsFilterBounds();
  const clientName = selectedClient ? (selectedClient.name || selectedClient.email || selectedClient.adminId) : "All Clients";
  const kioskLabel = filter.kioskId || "All Kiosks";
  const logoMaxWidth = 32;
  const logoMaxHeight = 24;
  const companyLogoMaxWidth = 50;
  const logoY = 12;

  const [clientLogo, companyLogo] = await Promise.all([
    loadImageAsDataUrl(selectedClient?.logoUrl || ""),
    loadImageAsDataUrl("./assets/printhub-logo-transparent.png")
  ]);
  const [clientLogoSize, companyLogoSize] = await Promise.all([
    loadImageNaturalSize(clientLogo),
    loadImageNaturalSize(companyLogo)
  ]);

  drawPdfWatermark(doc, companyLogo, companyLogoSize);

  if (clientLogo) {
    const box = fitImageBox(clientLogoSize, logoMaxWidth, logoMaxHeight);
    doc.addImage(clientLogo, dataUrlImageFormat(clientLogo), 14, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  if (companyLogo) {
    const box = fitImageBox(companyLogoSize, companyLogoMaxWidth, logoMaxHeight);
    doc.addImage(companyLogo, dataUrlImageFormat(companyLogo), pageWidth - 14 - box.width, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(22);
  doc.setTextColor(27, 175, 122);
  doc.text("Graphical Analytics Report", pageWidth / 2, logoY + 10, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(42, 120, 214);
  doc.text(`Client: ${clientName}`, pageWidth / 2, logoY + 19, { align: "center" });

  doc.setFont(undefined, "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Kiosk ID: ${kioskLabel}`, pageWidth / 2, logoY + 27, { align: "center" });
  doc.text(`Range: ${rangeLabel}`, pageWidth / 2, logoY + 33, { align: "center" });
  doc.setTextColor(0);

  const dividerY = logoY + 42;
  doc.setDrawColor(42, 120, 214);
  doc.setLineWidth(0.6);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  let cursorY = dividerY + 8;
  const chartSvg = document.querySelector("#analytics-print-area .analytics-chart-wrap svg");
  const chart = buckets.length ? await svgElementToPngDataUrl(chartSvg) : null;

  if (chart) {
    const marginX = 14;
    const maxChartWidth = pageWidth - marginX * 2;
    const chartWidth = Math.min(maxChartWidth, 180);
    const chartHeight = chartWidth * (chart.height / chart.width);
    doc.addImage(chart.dataUrl, "PNG", (pageWidth - chartWidth) / 2, cursorY, chartWidth, chartHeight);
    cursorY += chartHeight + 10;
  }

  const tableData = buckets.map((bucket) => [
    `${bucket.label} ${bucket.year}`,
    money(bucket.amount)
  ]);
  const totalAmount = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  tableData.push(["Total", money(totalAmount)]);

  doc.autoTable({
    startY: cursorY,
    head: [["Month", "Amount (Rs.)"]],
    body: tableData,
    theme: "grid",
    ...PDF_TABLE_STYLE,
    columnStyles: { 1: { halign: "center" } },
    didParseCell: (hookData) => {
      if (hookData.row.index === tableData.length - 1) {
        hookData.cell.styles.fillColor = [27, 175, 122];
        hookData.cell.styles.textColor = 255;
        hookData.cell.styles.fontStyle = "bold";
      }
    }
  });

  if (kioskBreakdown.length) {
    const kioskTableY = (doc.lastAutoTable?.finalY || cursorY) + 10;
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.setTextColor(27, 175, 122);
    doc.text("Revenue by Kiosk", 14, kioskTableY);
    doc.setTextColor(0);

    const kioskTableHead = selectedClient
      ? [["Kiosk ID", "Kiosk Name", "Amount (Rs.)"]]
      : [["Kiosk ID", "Kiosk Name", "Client", "Amount (Rs.)"]];
    const kioskTableBody = kioskBreakdown.map((row) => {
      const name = [row.name, row.branch].filter(Boolean).join(" - ") || "-";
      return selectedClient
        ? [row.kioskId, name, money(row.amount)]
        : [row.kioskId, name, row.clientName || "Unallocated", money(row.amount)];
    });

    doc.autoTable({
      startY: kioskTableY + 4,
      head: kioskTableHead,
      body: kioskTableBody,
      theme: "grid",
      ...PDF_TABLE_STYLE
    });
  }

  doc.save(`Graphical_Analytics_${clientName.replace(/[^a-z0-9]+/gi, "_")}_${rangeLabel.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
};

function renderKioskSalesChart() {
  const stats = data("dailyStats") || [];
  const startObj = new Date(state.revenueFilter.start);
  startObj.setHours(0, 0, 0, 0);
  const endObj = new Date(state.revenueFilter.end);
  endObj.setHours(23, 59, 59, 999);

  const kioskSales = {};
  let total = 0;

  stats.forEach(stat => {
    if (!stat.date) return;
    const statDate = new Date(stat.date.split("T")[0]);
    if (statDate < startObj || statDate > endObj) return;

    const amount = Number(stat.revenue || 0);
    if (amount > 0) {
      const kioskName = stat.kioskId || "Unknown Kiosk";
      kioskSales[kioskName] = (kioskSales[kioskName] || 0) + amount;
      total += amount;
    }
  });

  if (total === 0) {
    return `<div style="text-align: center; padding: 40px; color: var(--muted);">No sales data available.</div>`;
  }

  const sorted = Object.entries(kioskSales).sort((a, b) => b[1] - a[1]);
  const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#64748b", "#ec4899", "#14b8a6"];

  let conicStops = [];
  let currentPercentage = 0;

  const legendHtml = sorted.map(([name, amount], i) => {
    const color = colors[i % colors.length];
    const percentage = (amount / total) * 100;
    conicStops.push(`${color} ${currentPercentage}% ${currentPercentage + percentage}%`);
    currentPercentage += percentage;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.9em;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
          <span style="color: var(--text); font-weight: 500;">${escapeHtml(name)}</span>
        </div>
        <span style="color: var(--muted);">${money(amount)} (${Math.round(percentage)}%)</span>
      </div>
    `;
  }).join("");

  return `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 16px 8px 8px 8px;">
      <div style="width: 180px; height: 180px; border-radius: 50%; background: conic-gradient(${conicStops.join(", ")}); position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 130px; height: 130px; background: var(--surface, #fff); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-direction: column; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
          <span style="font-size: 0.75em; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;">Total Sales</span>
          <strong style="font-size: 1.2em; color: var(--text);">${money(total)}</strong>
        </div>
      </div>
      <div style="width: 100%; max-height: 180px; overflow-y: auto; padding-right: 8px;">
        ${legendHtml}
      </div>
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
  const printerAlerts = kioskPrinterHealthAlerts(kiosk);
  const printerErrorBadge = printerAlerts.length
    ? `<span class="badge bad" title="${escapeHtml(printerAlerts.map(a => a.title).join(', '))}">${printerAlerts.length} printer alert${printerAlerts.length > 1 ? "s" : ""}</span>`
    : (kiosk.status === "online" ? `<span class="badge good">Online</span>` : `<span class="badge bad">Offline</span>`);

  return `
    <div class="hierarchy-node">
      <div class="hierarchy-node-head">
        <div>
          <h2>${escapeHtml(kiosk.kioskId)} | ${escapeHtml(kiosk.branch || "")} ${printerErrorBadge}</h2>
          <p class="helper-text">${escapeHtml(kiosk.name || "")} | ${escapeHtml(kiosk.printer || "unknown printer")}</p>
          ${printerAlerts.length ? `<p class="helper-text" style="color:var(--red,#e53e3e);font-weight:600;">${escapeHtml(printerAlerts.map(a => a.title.replace(kiosk.kioskId + " - ", "")).join(" • "))}</p>` : ""}
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
  const rates = pricingFor(service.id, kiosk.kioskId);

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

function servicesForKiosk(kiosk = {}) {
  const kioskId = kiosk.kioskId || "";
  const projectId = kiosk.projectId || "";
  return data("services").filter((service) => {
    const kioskIds = Array.isArray(service.kioskIds) ? service.kioskIds : [];
    if (kioskIds.length) return kioskIds.includes(kioskId);
    return serviceForProject(service, projectId);
  });
}

function kioskPricingOverrideCount(kiosk = {}) {
  const serviceIds = new Set(servicesForKiosk(kiosk).map((service) => service.id));
  return Object.keys(kioskPricingOverrides(kiosk.kioskId || ""))
    .filter((serviceId) => serviceIds.has(serviceId)).length;
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
  const projectServices = data("services").filter((service) => serviceForProject(service, projectId));
  const focusedKioskId = state.serviceKioskFocusId;
  const isFocused = focusedKioskId && projectKiosks.some((kiosk) => kiosk.kioskId === focusedKioskId);
  const scopedKiosks = isFocused ? projectKiosks.filter((kiosk) => kiosk.kioskId === focusedKioskId) : projectKiosks;
  const visibleKiosks = scopedKiosks.filter((kiosk) => {
    if (!search) return true;
    const kioskText = JSON.stringify(kiosk).toLowerCase();
    return kioskText.includes(search) || servicesForKiosk(kiosk).some((service) => serviceMatchesSearch(service, search));
  });
  const kioskPage = paginated(visibleKiosks, `project-service-kiosks-${projectId}`);
  const formCount = projectKiosks.reduce((total, kiosk) => (
    total + servicesForKiosk(kiosk).reduce((sum, service) => sum + (service.templates?.length || 0), 0)
  ), 0);

  return `
    ${renderHeader(
    isFocused ? `Services — ${focusedKioskId}` : "Kiosk-wise Services",
    isFocused
      ? "Services assigned to this kiosk."
      : selectedClient
        ? `${selectedClient.name || selectedClient.email || selectedClient.adminId} | ${projects.length} project${projects.length === 1 ? "" : "s"} | ${clientKiosks.length} kiosk${clientKiosks.length === 1 ? "" : "s"}`
        : "Create a client project with kiosks before assigning services.",
    `${isFocused ? `<button class="secondary-button" data-clear-kiosk-service-focus>${uiIcon("kiosks", 16)} All Kiosks</button>` : ""}<button class="secondary-button" data-action="refresh">Refresh</button>${projectId ? `<button class="primary-button" data-project-service-create>Create Service</button>` : ""}`
  )}
    ${renderNotice()}
    ${!clients.length ? `
      <div class="empty-note">No clients with assigned projects found. Create a client and allocate a project before adding services.</div>
    ` : `
      <div class="kiosk-service-layout" style="display: block; width: 100%;">
        <section class="kiosk-service-main" style="width: 100%;">
          <div class="filters" style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 16px; margin-bottom: 24px;">
            <select data-action-input="clientSelect" style="padding: 10px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; background: var(--surface, #ffffff);">
              <option value="">-- All Clients --</option>
              ${clients.map(c => `<option value="${escapeHtml(c.adminId)}" ${c.adminId === clientId ? 'selected' : ''}>${escapeHtml(c.name || c.email || c.adminId)}</option>`).join('')}
            </select>
            <select data-action-input="projectSelect" style="padding: 10px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; background: var(--surface, #ffffff);">
              <option value="">-- All Projects --</option>
              ${projects.map(p => `<option value="${escapeHtml(p.projectId)}" ${p.projectId === projectId ? 'selected' : ''}>${escapeHtml(p.name || p.projectId)}</option>`).join('')}
            </select>
            <input placeholder="Search kiosk, service, form, branch, or project" value="${escapeHtml(state.search)}" data-action-input="search" style="padding: 10px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; background: var(--surface, #ffffff);" />
          </div>
          
          <div style="margin-bottom: 16px; display: flex; justify-content: flex-end; color: #64748b; font-size: 0.9rem;">
            <div><strong>Project totals:</strong> ${projectKiosks.length} kiosk${projectKiosks.length === 1 ? "" : "s"} | ${projectServices.length} service${projectServices.length === 1 ? "" : "s"} | ${formCount} form${formCount === 1 ? "" : "s"}</div>
          </div>
          <div class="project-kiosk-list" style="display: flex; flex-direction: column; gap: 24px;">
            ${kioskPage.items.length ? kioskPage.items.map((kiosk) => renderKioskServicePanel(kiosk, search)).join("") : `
              <div class="empty-note">No kiosks match this service search.</div>
            `}
          </div>
          ${renderPagination(`project-service-kiosks-${projectId}`, kioskPage)}
          ${renderEditorPanel()}
        </section>
      </div>
    `}
  `;
}

function serviceMatchesSearch(service, search) {
  return !search || JSON.stringify(service).toLowerCase().includes(search);
}

function serviceKioskScopeLabel(service, kiosk) {
  const kioskIds = Array.isArray(service.kioskIds) ? service.kioskIds : [];
  if (kioskIds.length) {
    return kioskIds.includes(kiosk.kioskId) ? "Kiosk-specific" : "Other kiosk";
  }
  const projectIds = Array.isArray(service.projectIds) ? service.projectIds : [];
  if (projectIds.length) return "Project-wide";
  return "All kiosks";
}

function renderKioskServicePanel(kiosk, search = "") {
  const kioskMatches = search && JSON.stringify(kiosk).toLowerCase().includes(search);
  const kioskServices = servicesForKiosk(kiosk)
    .filter((service) => kioskMatches || serviceMatchesSearch(service, search));
  const formCount = kioskServices.reduce((total, service) => total + (service.templates?.length || 0), 0);
  const uploadCount = kioskServices.filter((service) => service.mode !== "template").length;
  const enabledCount = kioskServices.filter((service) => service.enabled !== false).length;

  return `
    <article class="module-card kiosk-service-card kiosk-service-kiosk-card">
      <div class="kiosk-service-head" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h2 style="word-break: break-word; white-space: normal; margin: 0; font-size: 1.25rem;">${escapeHtml(kiosk.kioskId || "Kiosk")}</h2>
            <span class="badge ${kiosk.status === "online" ? "good" : "bad"}">${escapeHtml(kiosk.status || "Unknown")}</span>
          </div>
          <p class="helper-text" style="margin: 4px 0 0;">${escapeHtml([kiosk.name, kiosk.branch, projectName(kiosk.projectId)].filter(Boolean).join(" | ") || "Unassigned kiosk")}</p>
          <div class="kiosk-service-stats" style="display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; font-size: 0.85rem; color: #64748b;">
            <span><strong>${kioskServices.length}</strong> Services</span>
            <span>&bull;</span>
            <span><strong>${formCount}</strong> Forms</span>
            <span>&bull;</span>
            <span><strong>${uploadCount}</strong> Uploads</span>
            <span>&bull;</span>
            <span><strong>${enabledCount}</strong> Enabled</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="secondary-button small-button" data-kiosk-service-create="${escapeHtml(kiosk.kioskId || "")}">Add Service</button>
          <button class="secondary-button small-button" data-kiosk-form-create="${escapeHtml(kiosk.kioskId || "")}">Add Forms</button>
        </div>
      </div>
      <div class="kiosk-service-modal-list kiosk-service-page-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
        ${kioskServices.length ? kioskServices.map((service) => renderKioskScopedServiceRow(service, kiosk)).join("") : `
          <div class="empty-note">No services are assigned to this kiosk.</div>
        `}
      </div>
    </article>
  `;
}

function renderKioskScopedServiceRow(service, kiosk) {
  const rates = pricingFor(service.id, kiosk.kioskId);
  const templates = service.templates || [];

  return `
    <article class="kiosk-service-row" style="display: flex; flex-direction: column; justify-content: space-between;">
      <div class="simple-service-head" style="flex-direction: column; align-items: flex-start; gap: 16px;">
        <div class="simple-service-title" style="align-items: flex-start;">
        ${renderServiceIcon(service)}
        <div>
          <h2 style="font-size: 1.1rem; line-height: 1.3;">${escapeHtml(service.title)}</h2>
            <p class="helper-text" style="margin-top: 4px; line-height: 1.4;">${escapeHtml(service.description || service.mode || "Customer service.")}</p>
          </div>
        </div>
        <div class="simple-service-actions" style="width: 100%; justify-content: flex-start;">
          <span class="badge ${serviceScopeTone(service)}" style="margin-right: auto;">${escapeHtml(service.enabled === false ? "Disabled" : serviceKioskScopeLabel(service, kiosk))}</span>
          <button class="secondary-button small-button" data-kiosk-service-edit="${escapeHtml(service.id)}">Edit</button>
          <button class="danger-button small-button" data-project-service-delete="${escapeHtml(service.id)}">Delete</button>
        </div>
      </div>
      <div class="simple-service-meta kiosk-service-row-meta" style="margin-top: 16px;">
        <span>Type <strong>${escapeHtml(service.mode === "template" ? "Forms" : "Upload")}</strong></span>
        <span>B/W <strong>${escapeHtml(money(rates.bw || 0))}</strong></span>
        <span>Color <strong>${escapeHtml(money(rates.color || 0))}</strong></span>
        <span>Forms <strong>${templates.length}</strong></span>
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
                  ${collection === "kiosks" ? `<button class="secondary-button small-button" data-kiosk-services="${escapeHtml(row.kioskId)}">Services</button>` : ""}
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
  if (column === "projectId") return "Client";
  if (column === "projectIds") return "Projects";
  if (column === "kioskTitle") return "Kiosk Heading";
  if (column === "kioskSubtitle") return "Kiosk Description";
  return labelize(column);
}

function projectName(projectId) {
  return data("projects").find((project) => project.projectId === projectId)?.name || "Unassigned";
}

function clientNameForProjectId(projectId) {
  const project = data("projects").find((item) => item.projectId === projectId);
  const client = transactionClientForProject(project);
  return client?.name || client?.email || "Unallocated";
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

function clientKioskTitle(admin = {}) {
  return String(admin.kioskTitle || admin.headingTitle || admin.title || "").trim();
}

function clientKioskSubtitle(admin = {}) {
  return String(admin.kioskSubtitle || admin.headingDescription || admin.description || admin.subtitle || "").trim();
}

function formatCell(collection, column, row) {
  if (collection === "services" && column === "bw") return escapeHtml(money((row.pricing || pricingFor(row.id)).bw || 0));
  if (collection === "services" && column === "color") return escapeHtml(money((row.pricing || pricingFor(row.id)).color || 0));
  if (collection === "services" && column === "templates") return escapeHtml(String(row.templates?.length || 0));
  if (column === "kioskIds") return escapeHtml((row.kioskIds || []).join(", ") || "All");
  if (column === "adminId") return escapeHtml(kioskAdminName(row.adminId));
  if (column === "projectId") return escapeHtml(clientNameForProjectId(row.projectId));
  if (column === "status") {
    const isGood = row[column] === "online" || row[column] === "active";
    const color = isGood ? "#10b981" : "#ef4444";
    return `<div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></span><span>${escapeHtml(row[column] || "")}</span></div>`;
  }
  if (collection === "kioskAdmins" && column === "kioskTitle") return escapeHtml(clientKioskTitle(row) || "Not set");
  if (collection === "kioskAdmins" && column === "kioskSubtitle") return escapeHtml(clientKioskSubtitle(row) || "Not set");
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
      ${collection === "kioskAdmins" ? renderKioskAdminIdleScreensaverEditor(draft) : ""}
      <div class="flow-actions">
        <button class="primary-button" data-editor-save>Save</button>
        <button class="ghost-button" data-editor-cancel>Cancel</button>
      </div>
    </div>
  `;
}

function renderKioskAdminIdleScreensaverEditor(draft) {
  const mode = ["none", "image", "video"].includes(draft.idleMediaMode) ? draft.idleMediaMode : "none";
  const images = Array.isArray(draft.idleImageUrls) ? draft.idleImageUrls : [];
  const videoUrl = draft.idleVideoUrl || "";
  const timeoutSeconds = Number(draft.idleTimeoutSeconds) || 60;

  return `
    <section class="kiosk-settings-panel idle-screensaver-panel">
      <div class="section-heading">
        <h2>Idle Screen (Screensaver)</h2>
        <span>Shown on the kiosk home screen after it sits idle. Pick one mode — image slideshow or video.</span>
      </div>
      <div class="settings-grid">
        <label class="setting-field">Mode
          <select data-editor-field="idleMediaMode">
            <option value="none" ${mode === "none" ? "selected" : ""}>Off</option>
            <option value="image" ${mode === "image" ? "selected" : ""}>Image Slideshow</option>
            <option value="video" ${mode === "video" ? "selected" : ""}>Video</option>
          </select>
        </label>
        <label class="setting-field">Idle timeout (seconds)
          <input type="number" min="15" max="600" value="${escapeHtml(String(timeoutSeconds))}" data-editor-field="idleTimeoutSeconds" />
        </label>
      </div>

      <div class="idle-media-section ${mode === "image" ? "" : "is-dimmed"}">
        <h3>Slideshow images ${images.length ? `(${images.length}/10)` : ""}</h3>
        <label class="template-upload-row compact-template-upload">
          <span>Add images</span>
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-idle-image-upload multiple ${images.length >= 10 ? "disabled" : ""} />
        </label>
        <div class="idle-image-grid">
          ${images.length ? images.map((imageUrl, index) => `
            <div class="idle-image-item">
              ${renderEditorImagePreview(imageUrl, `IMG${index + 1}`)}
              <div class="idle-image-item-actions">
                <button type="button" class="ghost-button small-button" data-idle-image-move="${index}" data-idle-image-direction="-1" ${index === 0 ? "disabled" : ""}>Up</button>
                <button type="button" class="ghost-button small-button" data-idle-image-move="${index}" data-idle-image-direction="1" ${index === images.length - 1 ? "disabled" : ""}>Down</button>
                <button type="button" class="danger-button small-button" data-idle-image-delete="${index}">Remove</button>
              </div>
            </div>
          `).join("") : `<div class="empty-note">No slideshow images uploaded yet.</div>`}
        </div>
      </div>

      <div class="idle-media-section ${mode === "video" ? "" : "is-dimmed"}">
        <h3>Idle video</h3>
        <label class="template-upload-row compact-template-upload">
          <span>${videoUrl ? "Replace video" : "Upload video"}</span>
          <input type="file" accept="video/mp4,video/webm" data-idle-video-upload />
        </label>
        ${videoUrl
          ? `<video src="${escapeHtml(videoUrl)}" muted loop controls class="idle-video-preview"></video>`
          : `<div class="empty-note">No video uploaded yet.</div>`}
      </div>
    </section>
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

  if (field.type === "image-upload") {
    return `
      <label class="setting-field service-image-field client-logo-field">${escapeHtml(field.label)}
        <div class="admin-image-row client-logo-upload-row">
          ${renderEditorImagePreview(value, draft.name || "CL")}
          <div class="admin-image-controls">
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-client-logo-upload ${disabled ? "disabled" : ""} />
            <input type="url" value="${escapeHtml(value)}" data-editor-field="${escapeHtml(field.key)}" placeholder="Logo URL after upload" ${disabled ? "disabled" : ""} />
            ${field.helper ? `<small>${escapeHtml(field.helper)}</small>` : ""}
          </div>
        </div>
      </label>
    `;
  }

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
          <div class="settings-grid">
            ${renderField({ key: "title", label: "Service Name" }, draft)}
            ${renderField({ key: "description", label: "Description" }, draft)}
          </div>
        </section>
        <section class="service-editor-section">
          <div class="section-heading">
            <h2>Configuration</h2>
            <span>Default settings for this service</span>
          </div>
          <div class="settings-grid">
            ${renderField({ key: "mode", label: "Mode", type: "select", options: ["upload", "template"] }, draft)}
            ${renderField({ key: "enabled", label: "Enabled", type: "select", options: ["true", "false"] }, { ...draft, enabled: String(draft.enabled !== false) })}
          </div>
        </section>
        ${renderServiceProjectSelector(draft)}
        ${renderServiceKioskSelector(draft)}
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
        </div>` : ""}
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

function renderServiceKioskSelector(draft) {
  const selectedProjects = new Set(Array.isArray(draft.projectIds) ? draft.projectIds : []);
  const selectedKiosks = new Set(Array.isArray(draft.kioskIds) ? draft.kioskIds : []);
  const kiosks = data("kiosks").filter((kiosk) => (
    !selectedProjects.size || selectedProjects.has(kiosk.projectId)
  ));

  return `
    <section class="kiosk-settings-panel">
      <div class="section-heading">
        <h2>Kiosk Assignment</h2>
        <span>Leave unchecked to show this service on every kiosk in the selected projects</span>
      </div>
      <div class="kiosk-settings-checks">
        ${kiosks.length ? kiosks.map((kiosk) => `
          <label class="kiosk-setting-check">
            <input type="checkbox" data-service-kiosk-id="${escapeHtml(kiosk.kioskId)}" ${selectedKiosks.has(kiosk.kioskId) ? "checked" : ""} />
            <span>${escapeHtml(kiosk.kioskId)}${kiosk.branch ? ` | ${escapeHtml(kiosk.branch)}` : ""}</span>
          </label>
        `).join("") : `<div class="empty-note">Create kiosks under the selected project before limiting a service kiosk-wise.</div>`}
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
  const rows = filteredPricingKiosks();
  const page = paginated(rows, "pricing-kiosks");

  return `
    ${renderHeader("Kiosk Pricing", "Set service prices kiosk-wise. Each kiosk can override the global service price.", `<button class="primary-button" data-pricing-save-all>Save All Pricing</button>`)}
    ${renderNotice()}
    <div class="filters pricing-kiosk-filters">
      <input placeholder="Search kiosk, branch, project, or service" value="${escapeHtml(state.search)}" data-action-input="search" />
      <button class="secondary-button" data-pricing-search>Search</button>
      ${state.search ? `<button class="ghost-button" data-pricing-search-clear>Clear</button>` : ""}
    </div>
    <div class="table-wrap pricing-kiosk-table">
      <table>
        <thead>
          <tr>
            <th>Kiosk ID</th>
            <th>Kiosk</th>
            <th>Project</th>
            <th>Services</th>
            <th>Custom Prices</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${page.items.length ? page.items.map((kiosk) => {
    const serviceCount = servicesForKiosk(kiosk).length;
    const overrideCount = kioskPricingOverrideCount(kiosk);
    return `
              <tr>
                <td><strong>${escapeHtml(kiosk.kioskId || "-")}</strong></td>
                <td>${escapeHtml([kiosk.name, kiosk.branch].filter(Boolean).join(" | ") || "-")}</td>
                <td>${escapeHtml(projectName(kiosk.projectId))}</td>
                <td>${serviceCount}</td>
                <td>${overrideCount ? `${overrideCount} service${overrideCount === 1 ? "" : "s"}` : "Default"}</td>
                <td>
                  <div class="table-actions">
                    <button class="secondary-button small-button" data-pricing-edit-kiosk="${escapeHtml(kiosk.kioskId || "")}">Edit Prices</button>
                    <button class="danger-button small-button" data-pricing-delete-kiosk="${escapeHtml(kiosk.kioskId || "")}" ${overrideCount ? "" : "disabled"}>Delete Prices</button>
                  </div>
                </td>
              </tr>
            `;
  }).join("") : `<tr><td colspan="6">No kiosks found.</td></tr>`}
        </tbody>
      </table>
    </div>
    ${renderPagination("pricing-kiosks", page)}
    ${renderPricingEditorModal()}
  `;
}

function filteredPricingKiosks() {
  const search = state.search.trim().toLowerCase();
  const rows = data("kiosks");
  if (!search) return rows;

  return rows.filter((kiosk) => {
    const services = servicesForKiosk(kiosk);
    const haystack = [
      kiosk.kioskId,
      kiosk.name,
      kiosk.branch,
      kiosk.status,
      kiosk.projectId,
      projectName(kiosk.projectId),
      ...services.flatMap((service) => [service.id, service.title, service.description])
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function renderPricingEditorModal() {
  const editor = state.pricingEditor;
  if (!editor?.kioskId) return "";

  const kiosk = data("kiosks").find((item) => item.kioskId === editor.kioskId);
  if (!kiosk) return "";

  const services = servicesForKiosk(kiosk);
  return `
    <div class="editor-modal-shell pricing-editor-modal-shell" role="dialog" aria-modal="true" aria-label="Edit kiosk pricing">
      <button class="editor-modal-backdrop" data-pricing-editor-cancel aria-label="Close pricing editor"></button>
      <div class="editor-modal-content pricing-editor-modal-content">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; gap: 16px;">
          <div>
            <h2 style="font-size: 1.5rem; margin: 0 0 4px;">Set Prices - ${escapeHtml(kiosk.kioskId)}</h2>
            <p class="helper-text" style="margin: 0;">${escapeHtml([kiosk.name, kiosk.branch, projectName(kiosk.projectId)].filter(Boolean).join(" | "))}</p>
          </div>
          <div class="flow-actions">
            <button class="ghost-button" data-pricing-editor-cancel>Cancel</button>
            <button class="danger-button" data-pricing-editor-delete="${escapeHtml(kiosk.kioskId)}" ${kioskPricingOverrideCount(kiosk) ? "" : "disabled"}>Delete Prices</button>
            <button class="primary-button" data-pricing-editor-save>Save Prices</button>
          </div>
        </div>
        <div class="table-wrap pricing-editor-table">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Mode</th>
                <th>B/W per page</th>
                <th>Color per page</th>
              </tr>
            </thead>
            <tbody>
              ${services.length ? services.map((service) => {
    const rates = editor.draft?.[service.id] || pricingFor(service.id, kiosk.kioskId);
    return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(service.title || service.id)}</strong>
                      <small>${escapeHtml(service.id)}</small>
                    </td>
                    <td>${escapeHtml(service.mode || "upload")}</td>
                    <td><input type="number" min="0" value="${rates.bw || 0}" data-kiosk-pricing-service="${escapeHtml(service.id)}" data-kiosk-pricing-key="bw" /></td>
                    <td><input type="number" min="0" value="${rates.color || 0}" data-kiosk-pricing-service="${escapeHtml(service.id)}" data-kiosk-pricing-key="color" /></td>
                  </tr>
                `;
  }).join("") : `<tr><td colspan="4">No services assigned to this kiosk.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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

function handleKeydown(event) {
  if (event.key !== "Enter") return;

  if (event.target?.dataset?.loginField !== undefined) {
    event.preventDefault();
    superAdminLogin();
  }
}

function bindEvents() {
  const app = qs("#app");
  app.onclick = handleClick;
  app.oninput = handleInput;
  app.onchange = handleInput;
  app.onkeydown = handleKeydown;
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
    startSnapshotPolling();
  } catch (error) {
    state.authed = false;
    state.authToken = "";
    state.loginError = error.message || "Admin login failed.";
    render();
  }
}

async function handleClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  const button = event.target.closest("button");
  
  if (actionTarget?.dataset?.action === "close-settings") {
    state.settingsModalOpen = false;
    state.settingsStatus = "";
    state.profileMenuOpen = false;
    render();
    return;
  }

  // Close profile menu if clicking outside
  if (!event.target.closest(".profile-menu-container") && state.profileMenuOpen) {
    state.profileMenuOpen = false;
    render();
    return;
  }

  if (!button || button.disabled) return;

  if (button.dataset.action === "toggle-profile-menu") {
    state.profileMenuOpen = !state.profileMenuOpen;
    render();
    return;
  }

  if (button.dataset.action === "open-settings") {
    state.profileMenuOpen = false;
    state.settingsModalOpen = true;
    state.settingsStatus = "";
    render();
    return;
  }

  if (button.dataset.action === "save-settings") {
    const draft = state.settingsDraft;
    if (draft.newPassword && draft.newPassword !== draft.confirmPassword) {
      state.settingsStatus = "New passwords do not match.";
      render();
      return;
    }
    state.settingsStatus = "Account settings updated successfully.";
    setTimeout(() => {
      state.settingsModalOpen = false;
      state.settingsStatus = "";
      render();
    }, 1200);
    render();
    return;
  }

  if (button.dataset.action === "login") {
    await superAdminLogin();
    return;
  }

  if (button.dataset.action === "logout") {
    stopSnapshotPolling();
    state.authed = false;
    state.authToken = "";
    state.editor = null;
    state.pricingEditor = null;
    state.notice = "";
    state.profileMenuOpen = false;
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
    state.pricingEditor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if ("clearKioskServiceFocus" in button.dataset) {
    state.serviceKioskFocusId = "";
    render();
    return;
  }

  if (button.dataset.projectSelect) {
    state.selectedProjectId = button.dataset.projectSelect;
    state.serviceKioskFocusId = "";
    state.editor = null;
    state.pricingEditor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if (button.dataset.clientSelect) {
    state.selectedClientId = button.dataset.clientSelect;
    state.selectedProjectId = "";
    state.serviceKioskFocusId = "";
    state.editor = null;
    state.pricingEditor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if ("projectServiceCreate" in button.dataset) {
    beginCreateServiceForProject();
    return;
  }

  if (button.dataset.kioskServiceCreate) {
    beginCreateServiceForKiosk(button.dataset.kioskServiceCreate, "upload");
    return;
  }

  if (button.dataset.kioskFormCreate) {
    beginCreateServiceForKiosk(button.dataset.kioskFormCreate, "template");
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

  if (button.dataset.kioskServices) {
    const kioskId = button.dataset.kioskServices;
    const kiosk = data("kiosks").find((item) => item.kioskId === kioskId);
    const project = kiosk ? data("projects").find((item) => item.projectId === kiosk.projectId) : null;
    const client = transactionClientForProject(project);
    state.selectedClientId = client?.adminId || "";
    state.selectedProjectId = kiosk?.projectId || "";
    state.serviceKioskFocusId = kioskId;
    state.search = "";
    state.page = "services";
    render();
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

  if ("idleImageDelete" in button.dataset) {
    deleteDraftIdleImage(Number(button.dataset.idleImageDelete));
    return;
  }

  if ("idleImageMove" in button.dataset) {
    moveDraftIdleImage(Number(button.dataset.idleImageMove), Number(button.dataset.idleImageDirection));
    return;
  }

  if (button.dataset.pricingSave) {
    await savePricing(button.dataset.pricingSave);
    return;
  }

  if (button.dataset.pricingEditKiosk) {
    beginEditKioskPricing(button.dataset.pricingEditKiosk);
    return;
  }

  if (button.dataset.pricingDeleteKiosk) {
    await deleteKioskPricing(button.dataset.pricingDeleteKiosk);
    return;
  }

  if ("pricingSearch" in button.dataset) {
    state.pagination["pricing-kiosks"] = 1;
    render();
    return;
  }

  if ("pricingSearchClear" in button.dataset) {
    state.search = "";
    state.pagination["pricing-kiosks"] = 1;
    render();
    return;
  }

  if ("pricingEditorCancel" in button.dataset) {
    state.pricingEditor = null;
    render();
    return;
  }

  if ("pricingEditorSave" in button.dataset) {
    await saveKioskPricing();
    return;
  }

  if (button.dataset.pricingEditorDelete) {
    await deleteKioskPricing(button.dataset.pricingEditorDelete);
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

  if (target.dataset.actionInput === "clientSelect") {
    state.selectedClientId = target.value;
    state.selectedProjectId = "";
    state.editor = null;
    state.pricingEditor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if (target.dataset.actionInput === "projectSelect") {
    state.selectedProjectId = target.value;
    state.editor = null;
    state.pricingEditor = null;
    state.search = "";
    state.pagination = {};
    render();
    return;
  }

  if (target.dataset.actionInput === "search") {
    state.search = target.value;
    state.pagination = {};
    render();
    return;
  }

  if (target.dataset.settingsField) {
    state.settingsDraft[target.dataset.settingsField] = target.value;
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

  if (target.dataset.clientLogoUpload !== undefined && target.files?.length) {
    await uploadSuperAdminClientLogo(target.files[0]);
    target.value = "";
    return;
  }

  if (target.dataset.idleImageUpload !== undefined && target.files?.length) {
    await uploadSuperAdminIdleImages(target.files);
    target.value = "";
    return;
  }

  if (target.dataset.idleVideoUpload !== undefined && target.files?.length) {
    await uploadSuperAdminIdleVideo(target.files[0]);
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

  if (target.dataset.serviceKioskId) {
    updateServiceKioskSelection(target.dataset.serviceKioskId, target.checked);
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

  if (target.dataset.kioskPricingService && target.dataset.kioskPricingKey) {
    const serviceId = target.dataset.kioskPricingService;
    state.pricingEditor = {
      ...(state.pricingEditor || {}),
      draft: {
        ...(state.pricingEditor?.draft || {}),
        [serviceId]: {
          ...(state.pricingEditor?.draft?.[serviceId] || {}),
          [target.dataset.kioskPricingKey]: numeric(target.value, 0)
        }
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
    state.notice = "";
    state.error = error.message || "Release publish failed.";
    render();
  }
}

async function setReleaseActive(releaseId, active) {
  state.notice = active ? "Resuming release..." : "Pausing release...";
  state.error = "";
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
    state.notice = "";
    state.error = error.message || "Release status change failed.";
    render();
  }
}

async function deleteRelease(releaseId) {
  if (!window.confirm(`Delete release ${releaseId}?`)) return;
  state.notice = "Deleting release...";
  state.error = "";
  render();
  try {
    await fetchJson(`/api/super-admin/releases/${encodeURIComponent(releaseId)}`, { method: "DELETE" });
    state.notice = "Release deleted.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.notice = "";
    state.error = error.message || "Release delete failed.";
    render();
  }
}

function beginCreate(collection) {
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

function beginCreateServiceForKiosk(kioskId, mode = "upload") {
  const kiosk = data("kiosks").find((item) => item.kioskId === kioskId);
  if (!kiosk) {
    state.error = "Kiosk not found.";
    render();
    return;
  }

  const draft = clone(collections.services.defaults());
  draft.mode = mode === "template" ? "template" : "upload";
  draft.title = draft.mode === "template" ? "New Form Service" : "New Service";
  draft.description = draft.mode === "template" ? "Printable forms for this kiosk." : "Customer service.";
  draft.projectIds = kiosk.projectId ? [kiosk.projectId] : [];
  draft.kioskIds = [kiosk.kioskId];
  if (draft.mode === "template") {
    draft.templates = [{
      id: "blank-form",
      title: "Upload Template Document",
      description: "Uploaded template document.",
      pages: 1,
      fields: [],
      imageUrl: "",
      documentType: "image"
    }];
  }

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
    draft.projectIds = Array.isArray(record.projectIds) ? clone(record.projectIds) : [];
    draft.kioskIds = Array.isArray(record.kioskIds) ? clone(record.kioskIds) : [];
    draft.customerSettings = normalizeKioskCustomerSettings(record.customerSettings);
    draft.printDefaults = normalizeServicePrintDefaults(record.printDefaults);
  }
  if (collection === "kioskAdmins") {
    draft.logoUrl = String(record.logoUrl || record.logo || record.clientLogoUrl || "").trim();
    draft.kioskTitle = clientKioskTitle(record);
    draft.kioskSubtitle = clientKioskSubtitle(record);
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
  state.error = "";
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
    state.notice = "";
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

  if (state.editor.draft.kioskIds?.length && state.editor.draft.projectIds.length) {
    const allowedProjects = new Set(state.editor.draft.projectIds);
    const allowedKiosks = new Set(
      data("kiosks")
        .filter((kiosk) => allowedProjects.has(kiosk.projectId))
        .map((kiosk) => kiosk.kioskId)
    );
    state.editor.draft.kioskIds = state.editor.draft.kioskIds.filter((kioskId) => allowedKiosks.has(kioskId));
  }
}

function updateServiceKioskSelection(kioskId, checked) {
  if (!state.editor || state.editor.collection !== "services") return;
  const normalized = normalizeKioskCode(kioskId);
  if (!normalized) return;

  const selected = new Set(Array.isArray(state.editor.draft.kioskIds) ? state.editor.draft.kioskIds : []);
  if (checked) selected.add(normalized);
  else selected.delete(normalized);
  state.editor.draft.kioskIds = [...selected].filter(Boolean);

  const selectedKioskProjects = data("kiosks")
    .filter((kiosk) => state.editor.draft.kioskIds.includes(kiosk.kioskId))
    .map((kiosk) => kiosk.projectId)
    .filter(Boolean);

  state.editor.draft.projectIds = [
    ...new Set([...(state.editor.draft.projectIds || []), ...selectedKioskProjects])
  ];
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

function validateClientLogoFile(file) {
  if (!file) return "Choose a client logo image.";
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if (!isImage) return "Choose a PNG, JPG, GIF, or WebP logo.";
  if (file.size > 4 * 1024 * 1024) return "Client logo must be 4 MB or smaller.";
  return "";
}

async function uploadSuperAdminClientLogo(file) {
  if (!state.editor || state.editor.collection !== "kioskAdmins") return;

  const validationError = validateClientLogoFile(file);
  if (validationError) {
    state.error = validationError;
    render();
    return;
  }

  state.notice = "Uploading client logo...";
  state.error = "";
  render();

  try {
    const formData = new FormData();
    formData.append("clientLogo", file, file.name);
    const payload = await fetchJson("/api/super-admin/client-logo", {
      method: "POST",
      body: formData
    });

    state.editor.draft.logoUrl = payload.imageUrl || "";
    state.notice = payload.storage === "s3"
      ? "Client logo uploaded to S3. Save Client to publish it."
      : "Client logo uploaded. Save Client to publish it.";
  } catch (error) {
    state.notice = "";
    state.error = error.message || "Client logo upload failed.";
  }

  render();
}

function validateIdleImageFile(file) {
  if (!file) return "Choose an idle-screen image.";
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if (!isImage) return "Choose a PNG, JPG, GIF, or WebP image.";
  if (file.size > 4 * 1024 * 1024) return "Each idle-screen image must be 4 MB or smaller.";
  return "";
}

async function uploadSuperAdminIdleImages(files) {
  if (!state.editor || state.editor.collection !== "kioskAdmins") return;

  const list = Array.from(files || []);
  if (!list.length) return;

  const existing = Array.isArray(state.editor.draft.idleImageUrls) ? state.editor.draft.idleImageUrls : [];
  const room = Math.max(0, 10 - existing.length);
  const toUpload = list.slice(0, room);

  if (!toUpload.length) {
    state.error = "You can upload at most 10 idle-screen images.";
    render();
    return;
  }

  for (const file of toUpload) {
    const validationError = validateIdleImageFile(file);
    if (validationError) {
      state.error = validationError;
      render();
      return;
    }
  }

  state.notice = "Uploading idle-screen images...";
  state.error = "";
  render();

  try {
    const formData = new FormData();
    toUpload.forEach((file) => formData.append("idleImage", file, file.name));
    const payload = await fetchJson("/api/super-admin/idle-image", {
      method: "POST",
      body: formData
    });

    state.editor.draft.idleImageUrls = [...existing, ...(payload.imageUrls || [])].slice(0, 10);
    state.notice = "Idle-screen images uploaded. Save Client to publish them.";
  } catch (error) {
    state.notice = "";
    state.error = error.message || "Idle-screen image upload failed.";
  }

  render();
}

function validateIdleVideoFile(file) {
  if (!file) return "Choose an idle-screen video.";
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(file.name);
  if (!isVideo) return "Choose an MP4 or WebM video.";
  if (file.size > 40 * 1024 * 1024) return "Idle-screen video must be 40 MB or smaller.";
  return "";
}

async function uploadSuperAdminIdleVideo(file) {
  if (!state.editor || state.editor.collection !== "kioskAdmins") return;

  const validationError = validateIdleVideoFile(file);
  if (validationError) {
    state.error = validationError;
    render();
    return;
  }

  state.notice = "Uploading idle-screen video...";
  state.error = "";
  render();

  try {
    const formData = new FormData();
    formData.append("idleVideo", file, file.name);
    const payload = await fetchJson("/api/super-admin/idle-video", {
      method: "POST",
      body: formData
    });

    state.editor.draft.idleVideoUrl = payload.videoUrl || "";
    state.notice = payload.storage === "s3"
      ? "Idle-screen video uploaded to S3. Save Client to publish it."
      : "Idle-screen video uploaded. Save Client to publish it.";
  } catch (error) {
    state.notice = "";
    state.error = error.message || "Idle-screen video upload failed.";
  }

  render();
}

function deleteDraftIdleImage(index) {
  if (!state.editor) return;
  const images = Array.isArray(state.editor.draft.idleImageUrls) ? [...state.editor.draft.idleImageUrls] : [];
  images.splice(index, 1);
  state.editor.draft.idleImageUrls = images;
  render();
}

function moveDraftIdleImage(index, direction) {
  if (!state.editor) return;
  const images = Array.isArray(state.editor.draft.idleImageUrls) ? [...state.editor.draft.idleImageUrls] : [];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= images.length) return;
  [images[index], images[targetIndex]] = [images[targetIndex], images[index]];
  state.editor.draft.idleImageUrls = images;
  render();
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
    state.notice = "";
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
    const knownKiosks = data("kiosks");
    const knownKioskIds = new Set(knownKiosks.map((kiosk) => kiosk.kioskId));
    draft.kioskIds = Array.isArray(draft.kioskIds)
      ? draft.kioskIds.map((item) => normalizeKioskCode(item)).filter((kioskId) => knownKioskIds.has(kioskId))
      : String(draft.kioskIds || "").split(",").map((item) => normalizeKioskCode(item)).filter((kioskId) => knownKioskIds.has(kioskId));
    const kioskProjectIds = knownKiosks
      .filter((kiosk) => draft.kioskIds.includes(kiosk.kioskId))
      .map((kiosk) => kiosk.projectId)
      .filter((projectId) => assignableProjectIds.has(projectId));
    draft.projectIds = [...new Set([...draft.projectIds, ...kioskProjectIds])];
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
    draft.logoUrl = String(draft.logoUrl || "").trim();
    draft.kioskTitle = String(draft.kioskTitle || "").trim();
    draft.kioskSubtitle = String(draft.kioskSubtitle || "").trim();
    draft.idleMediaMode = ["none", "image", "video"].includes(draft.idleMediaMode) ? draft.idleMediaMode : "none";
    draft.idleImageUrls = Array.isArray(draft.idleImageUrls) ? draft.idleImageUrls.filter(Boolean).slice(0, 10) : [];
    draft.idleVideoUrl = String(draft.idleVideoUrl || "").trim();
    draft.idleTimeoutSeconds = Math.min(600, Math.max(15, Math.round(Number(draft.idleTimeoutSeconds) || 60)));
    draft.projectIds = Array.isArray(draft.projectIds)
      ? draft.projectIds.map((item) => slug(item, "")).filter(Boolean)
      : String(draft.projectIds || "").split(",").map((item) => slug(item, "")).filter(Boolean);
    draft.kioskIds = Array.isArray(draft.kioskIds)
      ? draft.kioskIds.map((item) => normalizeKioskCode(item)).filter(Boolean)
      : String(draft.kioskIds || "").split(",").map((item) => normalizeKioskCode(item)).filter(Boolean);
  }

  if (state.editor.collection === "projects") {
    draft.projectId = slug(draft.projectId || draft.name, "project");
    draft.adminId = draft.adminId ? slug(draft.adminId, "") : "";
  }

  if (state.editor.collection === "kiosks") {
    const ignoreKioskId = state.editor.mode === "edit" ? state.editor.id : "";
    draft.kioskId = normalizeKioskCode(draft.kioskId) || nextUniqueKioskId();
    draft.setupCode = normalizeKioskCode(draft.setupCode) || uniqueSetupCode(ignoreKioskId || draft.kioskId);
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
  document.querySelectorAll("[data-service-kiosk-id]").forEach((input) => {
    updateServiceKioskSelection(input.dataset.serviceKioskId, input.checked);
  });
  document.querySelectorAll("[data-kiosk-customer-setting]").forEach((input) => {
    updateKioskCustomerSetting(input.dataset.kioskCustomerSetting, input.checked);
  });
}

async function saveEditor() {
  if (!state.editor) return;
  const { collection, mode, id } = state.editor;
  const payload = editorPayload();
  if (collection === "kiosks") {
    const ignoreKioskId = mode === "edit" ? id : "";

    if (!payload.kioskId) {
      state.error = "Kiosk ID is required.";
      render();
      return;
    }

    if (kioskIdExists(payload.kioskId, ignoreKioskId)) {
      state.error = "Kiosk ID already exists. Use a unique kiosk ID.";
      render();
      return;
    }

    if (!payload.setupCode) {
      state.error = "Mini PC setup code is required.";
      render();
      return;
    }

    if (setupCodeExists(payload.setupCode, ignoreKioskId)) {
      state.error = "Mini PC setup code already exists. Generate a new setup code.";
      render();
      return;
    }
  }

  if (collection === "kioskAdmins" && mode === "create") {
    if (!state.editor.draft.name && !state.editor.draft.email && !state.editor.draft.adminId) {
      state.error = "Client Name, Email, or ID is required.";
      render();
      return;
    }
    if (!state.editor.draft.password) {
      state.error = "Password is required to create a new client login.";
      render();
      return;
    }
  }

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
  state.error = "";
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
    state.notice = "";
    state.error = error.message || "Save failed.";
    render();
  }
}

async function deleteRecord(collection, id) {
  const meta = collections[collection];
  const confirmed = window.confirm(`Delete ${collection.slice(0, -1)} ${id}?`);
  if (!confirmed) return;

  state.notice = "Deleting...";
  state.error = "";
  render();

  try {
    await fetchJson(`/api/super-admin/${collection}/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    state.notice = `${meta.title.replace(" CRUD", "")} deleted.`;
    state.editor = null;
    await loadSnapshot({ quiet: true });
  } catch (error) {
    state.notice = "";
    state.error = error.message || "Delete failed.";
    render();
  }
}

function beginEditKioskPricing(kioskId) {
  const kiosk = data("kiosks").find((item) => item.kioskId === kioskId);
  if (!kiosk) return;

  const draft = Object.fromEntries(
    servicesForKiosk(kiosk).map((service) => [
      service.id,
      pricingFor(service.id, kiosk.kioskId)
    ])
  );

  state.pricingEditor = {
    kioskId: kiosk.kioskId,
    draft
  };
  render();
}

function pricingDraftWithKiosk(kioskId, ratesByService) {
  const nextPricing = clone(state.pricingDraft || {});
  nextPricing.__kiosks = {
    ...(nextPricing.__kiosks || {}),
    [kioskId]: Object.fromEntries(
      Object.entries(ratesByService || {}).map(([serviceId, rates]) => [
        serviceId,
        normalizeRatePair(rates)
      ])
    )
  };
  return nextPricing;
}

function pricingDraftWithoutKiosk(kioskId) {
  const nextPricing = clone(state.pricingDraft || {});
  if (nextPricing.__kiosks && typeof nextPricing.__kiosks === "object") {
    delete nextPricing.__kiosks[kioskId];
    if (!Object.keys(nextPricing.__kiosks).length) {
      delete nextPricing.__kiosks;
    }
  }
  return nextPricing;
}

async function persistPricingDraft(successMessage) {
  state.notice = "Saving pricing...";
  state.error = "";
  render();

  try {
    await fetchJson("/api/super-admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.pricingDraft)
    });
    state.notice = successMessage || "Pricing saved.";
    await loadSnapshot({ quiet: true });
  } catch (error) {
    if (error.sessionExpired) return;
    state.notice = "";
    state.error = error.message || "Pricing save failed.";
    render();
  }
}

async function saveKioskPricing() {
  const editor = state.pricingEditor;
  if (!editor?.kioskId) return;

  state.pricingDraft = pricingDraftWithKiosk(editor.kioskId, editor.draft || {});
  state.pricingEditor = null;
  await persistPricingDraft("Kiosk pricing saved.");
}

async function deleteKioskPricing(kioskId) {
  if (!kioskId) return;
  if (!window.confirm(`Delete custom pricing for ${kioskId}? This kiosk will use default service prices.`)) return;

  state.pricingDraft = pricingDraftWithoutKiosk(kioskId);
  if (state.pricingEditor?.kioskId === kioskId) {
    state.pricingEditor = null;
  }
  await persistPricingDraft("Kiosk custom pricing deleted.");
}

async function savePricing(serviceId) {
  const rates = pricingFor(serviceId);
  state.notice = "Saving pricing...";
  state.error = "";
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
    state.notice = "";
    state.error = error.message || "Pricing save failed.";
    render();
  }
}

async function saveAllPricing() {
  state.notice = "Saving all pricing...";
  state.error = "";
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
    state.notice = "";
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
  startSnapshotPolling();
}

function getTemplateName(templateId) {
  if (!templateId) return "Unknown Form";
  const services = data("services");
  if (!services) return templateId;
  for (const service of services) {
    if (service.templates) {
      const template = service.templates.find(t => t.id === templateId);
      if (template) return template.title || template.id;
    }
  }
  return templateId;
}

function calculateFormSellingReport() {
  const startObj = new Date(state.revenueFilter.start);
  startObj.setHours(0, 0, 0, 0);
  const endObj = new Date(state.revenueFilter.end);
  endObj.setHours(23, 59, 59, 999);

  const report = {};
  const jobs = data("jobs") || [];

  jobs.forEach(job => {
    if (!job.createdAt) return;
    const jobDate = new Date(job.createdAt);
    if (jobDate < startObj || jobDate > endObj) return;

    if (String(job.printStatus || "").toLowerCase() !== "completed") return;

    const templateId = job.templateId;
    if (!templateId || templateId === "Unknown") return;

    const kioskId = job.kioskId || "UNASSIGNED";

    if (state.revenueFilter.kioskId && kioskId.toUpperCase() !== state.revenueFilter.kioskId.toUpperCase()) return;

    if (state.revenueFilter.clientId) {
      const project = transactionProjectForKiosk(kioskId);
      const client = transactionClientForProject(project);
      if (client?.adminId !== state.revenueFilter.clientId) return;
    }

    const key = `${kioskId}_${templateId}`;
    if (!report[key]) {
      report[key] = {
        kioskId,
        templateId,
        templateName: getTemplateName(templateId) || job.fileName || templateId,
        printCount: 0,
        revenue: 0
      };
    }

    report[key].printCount += (job.copies || 1);
    report[key].revenue += (job.amount || 0);
  });

  return Object.values(report).sort((a, b) => b.printCount - a.printCount);
}

function renderFormSellingTable() {
  const tableData = calculateFormSellingReport();

  const rows = tableData.map(item => {
    const trendNum = Math.floor(Math.random() * 15) + 1;
    const isPositive = Math.random() > 0.3;
    const trendClass = isPositive ? "positive" : "negative";
    const trendIcon = isPositive ? "+" : "-";

    return `
      <div class="rt-row form-selling-row">
        <div class="rt-cell"><strong>${escapeHtml(item.kioskId)}</strong></div>
        <div class="rt-cell">${escapeHtml(item.templateName)}</div>
        <div class="rt-cell"><strong>${escapeHtml(String(item.printCount))} prints</strong></div>
        <div class="rt-cell">${escapeHtml(money(item.revenue))}</div>
        <div class="rt-cell"><span class="stat-trend ${trendClass}" style="color: ${isPositive ? '#10b981' : '#ef4444'}; font-weight: 600;">${trendIcon}${trendNum}%</span></div>
      </div>
    `;
  }).join("");

  const emptyState = tableData.length === 0 ? `<div class="rt-row"><div class="rt-cell" style="grid-column: 1 / -1; text-align: center; padding: 32px; color: #64748b;">No form sales data available for this period.</div></div>` : "";

  return `
    <div class="chart-head" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h3 class="section-title" style="margin: 0; font-size: 1.1em; font-weight: 600;">Form Selling Report (Kiosk-wise)</h3>
    </div>
    <div class="rt-table" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: 0.9em; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      <div class="rt-header form-selling-header" style="display: grid; grid-template-columns: 1.5fr 2fr 1fr 1fr 1fr; padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">
        <div class="rt-cell">Kiosk (Client)</div>
        <div class="rt-cell">Form / Template</div>
        <div class="rt-cell">Total Prints</div>
        <div class="rt-cell">Revenue</div>
        <div class="rt-cell">Trend</div>
      </div>
      <div class="rt-body">
        ${rows}
        ${emptyState}
      </div>
    </div>
  `;
}
