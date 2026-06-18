const runtimeConfig = new URLSearchParams(window.location.search);
const frontendConfig = window.PRINTING_KIOSK_CONFIG || {};
const currentPage = window.location.pathname.split("/").pop() || "index.html";
const currentPath = window.location.pathname.replace(/\/+$/, "");
const isAdminEntry = currentPage === "admin.html" || currentPath.endsWith("/admin") || runtimeConfig.get("panel") === "admin";
const HOST_BACKEND_URL = {
  "printingkiosk.vercel.app": "https://api.theaaryatechnologies.com"
}[window.location.hostname] || "";
const DEFAULT_BACKEND_URL = HOST_BACKEND_URL || (/^https?:$/.test(window.location.protocol) ? window.location.origin : "http://localhost:5080");
const LOCAL_AGENT_URL = runtimeConfig.get("localAgentUrl") || frontendConfig.localAgentUrl || "http://localhost:5077";
const BACKEND_URL = (runtimeConfig.get("backendUrl") || frontendConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
const RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const PRINTER_STATUS_TIMEOUT_MS = 15000;
const UNASSIGNED_KIOSK_ID = "UNASSIGNED-KIOSK";
const KIOSK_ID = readConfiguredKioskId();
const HAS_EXPLICIT_LOCAL_AGENT = Boolean(runtimeConfig.get("localAgentUrl") || frontendConfig.localAgentUrl);

let services = [
  {
    id: "print",
    icon: "PR",
    title: "Print Document",
    description: "Upload PDF, Word, or image files and print after preview.",
    defaultPages: 5,
    imageUrl: ""
  },
  {
    id: "scan",
    icon: "SC",
    title: "Scan Document",
    description: "Scan paper documents to PDF with receipt and admin tracking.",
    defaultPages: 3,
    imageUrl: ""
  },
  {
    id: "copy",
    icon: "CP",
    title: "Copy Document",
    description: "Create quick photocopies with B/W or color pricing.",
    defaultPages: 2,
    imageUrl: ""
  },
  {
    id: "govt-form",
    icon: "GP",
    title: "Govt Form Print",
    description: "Print blank government form templates without upload.",
    defaultPages: 2,
    imageUrl: ""
  },
  {
    id: "college-form",
    icon: "CF",
    title: "College Form Print",
    description: "Print admission, exam, certificate, and fee forms.",
    defaultPages: 4,
    imageUrl: ""
  },
  {
    id: "certificate",
    icon: "CT",
    title: "Certificate Print",
    description: "Print certificates and supporting documents safely.",
    defaultPages: 1,
    imageUrl: ""
  }
];

const defaultServicePricing = {
  print: {
    bw: 2,
    color: 10
  },
  scan: {
    bw: 4,
    color: 8
  },
  copy: {
    bw: 2,
    color: 10
  },
  "govt-form": {
    bw: 3,
    color: 12
  },
  "college-form": {
    bw: 3,
    color: 12
  },
  certificate: {
    bw: 5,
    color: 15
  }
};

const customerSteps = [
  "Services",
  "File",
  "Preview",
  "Settings",
  "Price",
  "Payment",
  "Printing",
  "Done"
];

const allowedUploadExtensions = ["PDF", "DOC", "DOCX", "JPG", "JPEG", "PNG"];

let formTemplates = {
  "govt-form": [
    {
      id: "birth-certificate",
      title: "Birth Certificate Form",
      description: "Blank Form No. 5 birth certificate template.",
      pages: 1,
      fields: ["Name", "Sex", "Date of birth", "Place of birth", "Mother name", "Father name"],
      imageUrl: "https://www.pdffiller.com/preview/29/559/29559281/large.png"
    },
    {
      id: "voter-form-6",
      title: "Form 6",
      description: "Blank voter registration application template.",
      pages: 1,
      fields: ["Applicant", "Age / DOB", "Address", "Constituency", "Mobile"]
    },
    {
      id: "voter-form-8",
      title: "Form 8",
      description: "Blank voter correction or shifting application template.",
      pages: 1,
      fields: ["Applicant", "EPIC No.", "Correction type", "Correct details", "Mobile"]
    },
    {
      id: "domicile-certificate",
      title: "Domicile Certificate Form",
      description: "Blank domicile certificate application format.",
      pages: 1,
      fields: ["Applicant", "DOB", "Address", "Years of residence", "Mobile"]
    },
    {
      id: "income-certificate",
      title: "Income Certificate Form",
      description: "Blank income certificate request template.",
      pages: 1,
      fields: ["Applicant", "Occupation", "Annual income", "Purpose", "Mobile"]
    },
    {
      id: "caste-certificate",
      title: "Caste Certificate Form",
      description: "Blank caste certificate application template.",
      pages: 1,
      fields: ["Applicant", "Caste", "Sub caste", "Address", "Mobile"]
    }
  ],
  "college-form": [
    {
      id: "admission-form",
      title: "Admission Form",
      description: "Student admission details and guardian section.",
      pages: 4
    },
    {
      id: "exam-registration",
      title: "Exam Registration Form",
      description: "Semester exam subject and fee declaration.",
      pages: 2
    },
    {
      id: "scholarship-form",
      title: "Scholarship Form",
      description: "Student scholarship request and document list.",
      pages: 3
    },
    {
      id: "bonafide-request",
      title: "Bonafide Certificate Request",
      description: "Certificate request form for college office.",
      pages: 1
    }
  ]
};

const initialJobs = [
  {
    id: "JOB-1048",
    kiosk: "KIOSK-BANK-01",
    branch: "Main Bank Branch",
    file: "loan-form.pdf",
    service: "Govt Form Print",
    pages: 4,
    copies: 2,
    color: "B/W",
    amount: 24,
    payment: "Success",
    print: "Completed",
    date: "2026-06-07 10:15"
  },
  {
    id: "JOB-1049",
    kiosk: "KIOSK-EDU-02",
    branch: "City College",
    file: "exam-hall-ticket.pdf",
    service: "Print Document",
    pages: 2,
    copies: 1,
    color: "B/W",
    amount: 4,
    payment: "Success",
    print: "Payment Success Print Failed",
    date: "2026-06-07 10:48"
  },
  {
    id: "JOB-1050",
    kiosk: "KIOSK-BANK-01",
    branch: "Main Bank Branch",
    file: "kyc-copy.jpg",
    service: "Copy Document",
    pages: 1,
    copies: 3,
    color: "Color",
    amount: 30,
    payment: "Success",
    print: "Completed",
    date: "2026-06-07 11:12"
  }
];

const state = {
  mode: isAdminEntry ? "admin" : "customer",
  adminAuthed: false,
  adminToken: "",
  adminAccount: null,
  adminPage: runtimeConfig.get("adminPage") || "dashboard",
  adminLoginError: "",
  adminLoginDraft: {
    email: "",
    password: ""
  },
  step: 0,
  selectedService: null,
  file: null,
  uploadError: "",
  uploadSession: null,
  uploadPoller: null,
  previewZoom: 1,
  settings: {
    colorMode: "bw",
    copies: 1,
    paperSize: "A4",
    sides: "single",
    orientation: "portrait",
    range: "all",
    staple: "no"
  },
  printer: {
    online: false,
    name: "No printer selected",
    paper: "Unknown",
    toner: "Unknown",
    queue: 0,
    supportsColor: null,
    scanner: "Connected",
    internet: "Online",
    agent: "Not checked",
    statusText: "Printer has not been checked yet"
  },
  paymentStatus: "Pending",
  paymentStatusMessage: "",
  paymentError: "",
  paymentOrder: null,
  paymentBusy: false,
  printProgress: 0,
  printError: "",
  printStatusMessage: "",
  printJob: null,
  activeJobId: null,
  lastCompletedJob: null,
  jobs: [...initialJobs],
  adminData: {
    dashboard: null,
    revenue: null,
    jobs: [],
    payments: [],
    kiosks: [],
    refunds: [],
    reports: [],
    backendOnline: false,
    lastUpdated: "",
    error: ""
  },
  adminPoller: null,
  kiosk: {
    kioskId: KIOSK_ID,
    name: "",
    branch: "",
    status: ""
  },
  pricing: readStoredPricing(),
  pricingSaveStatus: "",
  servicesDirty: false,
  serviceEditor: null,
  imageUploadBusy: false,
  configVersion: 0,
  configUpdatedAt: "",
  configPoller: null,
  configStatus: "",
  kioskCreate: {
    kioskId: "",
    name: "",
    branch: "",
    setupCode: ""
  },
  kioskCreateStatus: "",
  alerts: [
    "KIOSK-EDU-02 has one paid job waiting for retry.",
    "Paper level check due at Main Bank Branch.",
    "Daily revenue summary will be ready at 10 PM."
  ],
  filters: {
    table: "",
    status: "all"
  }
};

function qs(selector) {
  return document.querySelector(selector);
}

function money(value) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeKioskId(value) {
  return String(value || "").trim().toUpperCase();
}

function readConfiguredKioskId() {
  return normalizeKioskId(runtimeConfig.get("kioskId")) || normalizeKioskId(frontendConfig.kioskId) || UNASSIGNED_KIOSK_ID;
}

function markServicesDirty(message = "") {
  state.servicesDirty = true;
  state.pricingSaveStatus = message;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

function validateAdminImageFile(file) {
  if (!file) return "Choose an image file.";
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
    return "Choose a PNG, JPG, GIF, or WebP image.";
  }
  if (file.size > 3 * 1024 * 1024) {
    return "Image must be 3 MB or smaller.";
  }
  return "";
}

function decodePowerShellError(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const errorParts = [...raw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => match[1]);
  const text = (errorParts.length ? errorParts.join("\n") : raw)
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/^#< CLIXML\s*/i, "")
    .replace(/<[^>]+>/g, " ");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^At line:/i.test(line))
    .filter((line) => !/^\+/.test(line))
    .filter((line) => !/^~+/.test(line))
    .filter((line) => !/^CategoryInfo\s*:/i.test(line))
    .filter((line) => !/^FullyQualifiedErrorId\s*:/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function friendlyPrintError(value) {
  const message = decodePowerShellError(value) || "Payment succeeded, but the printer did not complete the job.";

  if (/No application is associated with the specified file/i.test(message)) {
    return "Windows cannot print this file type because no default app with a Print command is associated with it. For PDF, install SumatraPDF or set a PDF reader as the default print app, then retry.";
  }

  return message;
}

function numericPrice(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function slug(value, fallback = "service") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function normalizeTemplateFields(fields) {
  if (Array.isArray(fields)) {
    return fields.map((field) => String(field || "").trim()).filter(Boolean).slice(0, 8);
  }

  return String(fields || "")
    .split(/\r?\n|,/)
    .map((field) => field.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates.map((template, index) => {
    const title = String(template?.title || `Template ${index + 1}`).trim();
    return {
      id: slug(template?.id || title, `template-${index + 1}`),
      title,
      description: String(template?.description || "Blank printable template.").trim(),
      pages: Math.max(1, Math.min(20, Number(template?.pages || 1))),
      fields: normalizeTemplateFields(template?.fields).length ? normalizeTemplateFields(template?.fields) : ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
      imageUrl: String(template?.imageUrl || "").trim()
    };
  }).filter((template) => template.title);
}

function mergeDefaultTemplateData(templates, defaults = []) {
  return templates.map((template) => {
    const fallback = defaults.find((item) => item.id === template.id || item.title === template.title) || {};

    return {
      ...template,
      imageUrl: template.imageUrl || fallback.imageUrl || "",
      fields: template.fields?.length ? template.fields : (fallback.fields || [])
    };
  });
}

function normalizeServicesConfig(value) {
  const source = Array.isArray(value) && value.length ? value : services;
  const seen = new Set();

  return source.map((service, index) => {
    const title = String(service?.title || `Service ${index + 1}`).trim();
    let id = slug(service?.id || title, `service-${index + 1}`);

    if (id === "bank-form") id = "govt-form";
    while (seen.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seen.add(id);

    const fallback = services.find((item) => item.id === id) || {};
    const hasSavedTemplates = Array.isArray(service?.templates) && service.templates.length > 0;
    const hasDefaultTemplates = (Array.isArray(fallback.templates) && fallback.templates.length > 0) ||
      (Array.isArray(formTemplates[id]) && formTemplates[id].length > 0);
    const explicitMode = service?.mode === "template" || service?.mode === "upload";
    const mode = explicitMode
      ? (service.mode === "template" ? "template" : "upload")
      : (hasDefaultTemplates ? "template" : "upload");
    return {
      id,
      icon: String(service?.icon || fallback.icon || title.slice(0, 2) || "SV").trim().toUpperCase().slice(0, 3),
      title,
      description: String(service?.description || fallback.description || "Customer service.").trim(),
      defaultPages: Math.max(1, Math.min(99, Number(service?.defaultPages || fallback.defaultPages || 1))),
      mode,
      imageUrl: String(service?.imageUrl || fallback.imageUrl || "").trim(),
      enabled: service?.enabled !== false,
      kioskIds: Array.isArray(service?.kioskIds) ? service.kioskIds.map((item) => String(item).trim()).filter(Boolean) : [],
      pricing: {
        bw: numericPrice(service?.pricing?.bw, fallback.pricing?.bw ?? defaultServicePricing[id]?.bw ?? defaultServicePricing.print.bw),
        color: numericPrice(service?.pricing?.color, fallback.pricing?.color ?? defaultServicePricing[id]?.color ?? defaultServicePricing.print.color)
      },
      templates: mode === "template"
        ? mergeDefaultTemplateData(
          normalizeTemplates(service?.templates?.length ? service.templates : (fallback.templates || formTemplates[id])),
          fallback.templates || formTemplates[id] || []
        )
        : []
    };
  });
}

function createDefaultPricing() {
  return services.reduce((pricing, service) => {
    pricing[service.id] = {
      ...(service.pricing || defaultServicePricing[service.id] || defaultServicePricing.print)
    };
    return pricing;
  }, {});
}

function normalizePricing(pricing) {
  const nextPricing = createDefaultPricing();

  if (!pricing || typeof pricing !== "object") {
    return nextPricing;
  }

  if (pricing["bank-form"] && !pricing["govt-form"]) {
    pricing = {
      ...pricing,
      "govt-form": pricing["bank-form"]
    };
  }

  if ("bw" in pricing || "color" in pricing) {
    services.forEach((service) => {
      nextPricing[service.id] = {
        bw: numericPrice(pricing.bw, nextPricing[service.id].bw),
        color: numericPrice(pricing.color, nextPricing[service.id].color)
      };
    });
  }

  services.forEach((service) => {
    const rates = pricing[service.id];

    if (!rates || typeof rates !== "object") {
      return;
    }

    nextPricing[service.id] = {
      bw: numericPrice(rates.bw, nextPricing[service.id].bw),
      color: numericPrice(rates.color, nextPricing[service.id].color)
    };
  });

  return nextPricing;
}

function readStoredPricing() {
  try {
    return normalizePricing(JSON.parse(window.localStorage.getItem("kioskServicePricing") || "null"));
  } catch {
    return createDefaultPricing();
  }
}

function storePricing() {
  try {
    window.localStorage.setItem("kioskServicePricing", JSON.stringify(state.pricing));
  } catch {
    // Local storage can be unavailable in hardened kiosk shells.
  }
}

function readStoredServices() {
  try {
    return normalizeServicesConfig(JSON.parse(window.localStorage.getItem("kioskServices") || "null"));
  } catch {
    return normalizeServicesConfig(services);
  }
}

function storeServices() {
  try {
    window.localStorage.setItem("kioskServices", JSON.stringify(services));
  } catch {
    // Local storage can be unavailable in hardened kiosk shells.
  }
}

function readStoredConfigVersion() {
  try {
    return Number(window.localStorage.getItem("kioskConfigVersion") || 0);
  } catch {
    return 0;
  }
}

function storeConfigMeta(config = {}) {
  state.configVersion = Number(config.version || state.configVersion || 0);
  state.configUpdatedAt = config.updatedAt || state.configUpdatedAt || "";

  try {
    window.localStorage.setItem("kioskConfigVersion", String(state.configVersion || 0));
    if (state.configUpdatedAt) {
      window.localStorage.setItem("kioskConfigUpdatedAt", state.configUpdatedAt);
    }
  } catch {
    // Local storage can be unavailable in hardened kiosk shells.
  }
}

services = readStoredServices();
state.configVersion = readStoredConfigVersion();
statePricingBootstrap();

function statePricingBootstrap() {
  const storedPricing = readStoredPricing();
  services = services.map((service) => ({
    ...service,
    pricing: storedPricing[service.id] || service.pricing
  }));
}

function selectedService() {
  return services.find((service) => service.id === state.selectedService) || services[0];
}

function formTemplatesForService(serviceId = state.selectedService) {
  const service = services.find((item) => item.id === serviceId);

  if (service) {
    return service.mode === "template" ? (service.templates || []) : [];
  }

  return formTemplates[serviceId] || [];
}

function isFormTemplateService(serviceId = state.selectedService) {
  const service = services.find((item) => item.id === serviceId);
  return service ? service.mode === "template" : formTemplatesForService(serviceId).length > 0;
}

function serviceAvailableForKiosk(service, kioskId = KIOSK_ID) {
  return service.enabled !== false && (!service.kioskIds?.length || service.kioskIds.includes(kioskId));
}

function customerServices() {
  return services.filter((service) => serviceAvailableForKiosk(service));
}

function serviceRates(serviceId = state.selectedService) {
  const service = services.find((item) => item.id === serviceId) || services[0];
  const rates = state.pricing?.[service.id] || service?.pricing || defaultServicePricing[service.id] || defaultServicePricing.print;

  return {
    bw: numericPrice(rates.bw, 0),
    color: numericPrice(rates.color, 0)
  };
}

function imagePreviewMarkup(imageUrl, fallbackText, className) {
  if (imageUrl) {
    return `<span class="${className} service-image"><img alt="" src="${escapeHtml(imageUrl)}" /></span>`;
  }

  return `<span class="${className}">${escapeHtml(fallbackText || "SV")}</span>`;
}

function serviceMediaMarkup(service, className = "service-icon") {
  return imagePreviewMarkup(service?.imageUrl || "", service?.icon || "SV", className);
}

function pageCount() {
  if (state.file) return state.file.pages;
  return 0;
}

function priceDetails() {
  const pages = Math.max(1, pageCount());
  const copies = Math.max(1, Number(state.settings.copies) || 1);
  const rates = serviceRates();
  const rate = state.settings.colorMode === "color" ? rates.color : rates.bw;
  const total = pages * copies * rate;

  return { pages, copies, rate, rates, total };
}

function colorSelectionSupported() {
  return state.settings.colorMode !== "color" || state.printer.supportsColor !== false;
}

function paymentReady() {
  return state.printer.online && colorSelectionSupported();
}

function paymentBlockMessage() {
  if (!state.printer.online) {
    return state.printer.statusText || "Printer is not ready. Refresh printer status before payment.";
  }

  if (!colorSelectionSupported()) {
    return "Color printing is selected, but the selected printer does not support color.";
  }

  return "";
}

function printerOfflineAlertMessage() {
  const status = state.printer.statusText || "Printer is offline.";

  if (state.printer.agent === "Offline") {
    return `Printer service is offline. Start the local print agent, then try again.\n\n${status}`;
  }

  return `Printer is offline. Please connect or turn on the printer, then try again.\n\n${status}`;
}

function alertPrinterUnavailable() {
  window.alert(printerOfflineAlertMessage());
}

async function requirePrinterBeforeUpload() {
  await refreshPrinterStatus({ rerender: false });

  if (state.printer.online) {
    return true;
  }

  alertPrinterUnavailable();
  return false;
}

function nextJobId() {
  return `JOB-${1100 + state.jobs.length + 1}`;
}

function ensureActiveJobId() {
  if (!state.activeJobId) {
    state.activeJobId = nextJobId();
  }

  return state.activeJobId;
}

function currentJobId() {
  return state.activeJobId || nextJobId();
}

function normalizedFileExtension(name) {
  return name.includes(".") ? name.split(".").pop().toUpperCase() : "";
}

function previewKindForExtension(extension, mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (extension === "PDF") return "pdf";
  if (["JPG", "JPEG", "PNG"].includes(extension)) return "image";
  if (["DOC", "DOCX"].includes(extension)) return "document";
  return "placeholder";
}

function createFileRecord(name, size, fallbackPages, mimeType = "") {
  const extension = normalizedFileExtension(name);
  const previewKind = previewKindForExtension(extension, mimeType);

  if (!allowedUploadExtensions.includes(extension) && previewKind === "placeholder") {
    return {
      error: "Unsupported file type. Please upload PDF, DOC, DOCX, JPG, or PNG."
    };
  }

  const pages = previewKind === "image"
    ? 1
    : Math.max(1, Math.min(24, Math.ceil(size / 180000) || fallbackPages || 1));

  return {
    file: {
      name,
      type: extension || mimeType || "FILE",
      pages,
      previewKind,
      previewUrl: "",
      validatedAt: new Date().toISOString()
    }
  };
}

function createReceivedFileRecord({ name, size, mimeType, previewUrl, pages }) {
  const result = createFileRecord(name, size || 1, 1, mimeType || "");

  if (result.error) {
    return result;
  }

  result.file.pages = pages || result.file.pages;
  result.file.previewUrl = previewUrl || "";
  result.file.receivedFromMobile = true;
  return result;
}

function createSourceFile(source) {
  return {
    name: `${source.toLowerCase().replace(/\s+/g, "-")}-upload.pdf`,
    type: "PDF",
    pages: 1,
    previewKind: "placeholder",
    previewUrl: "",
    source,
    validatedAt: new Date().toISOString()
  };
}

function templatePrintableText(template, serviceTitle) {
  if (template.id === "birth-certificate") {
    return birthCertificateTemplatePlainText();
  }

  const fields = Array.isArray(template.fields) && template.fields.length
    ? template.fields
    : ["Applicant", "Address", "Mobile", "Purpose", "Signature"];
  const lines = [
    template.title.toUpperCase(),
    serviceTitle,
    "----------------------------------------",
    "",
    ...fields.flatMap((field, index) => [
      `${index + 1}. ${field}: ______________________________`,
      ""
    ]),
    "Documents: [ ] ID Proof  [ ] Address Proof  [ ] Photo",
    "",
    "Signature: __________________   Date: __________",
    "",
    "Office use: _________________________________"
  ];

  return lines.join("\r\n");
}

function birthCertificateTemplatePlainText() {
  return [
    "                                   FORM NO. 5",
    "                              BIRTH CERTIFICATE",
    "                         जन्म प्रमाण - पत्र",
    "",
    "Issued under the Registration of Births and Deaths Act, 1969",
    "",
    "This is to certify that the following information has been taken",
    "from the original record of birth registered for:",
    "",
    "Local area / body: _________________________  District: __________________",
    "State / Union Territory: ___________________",
    "",
    "Name: ________________________________   Sex: ___________________________",
    "Date of Birth: ________________________   Place of Birth: _______________",
    "",
    "Name of Mother: _________________________________________________________",
    "Name of Father: _________________________________________________________",
    "",
    "Address of parents at time of birth:",
    "________________________________________________________________________",
    "________________________________________________________________________",
    "",
    "Permanent address of parents:",
    "________________________________________________________________________",
    "________________________________________________________________________",
    "",
    "Registration No.: ____________________   Date of Registration: __________",
    "Remarks, if any: ________________________________________________________",
    "",
    "Date of issue: _______________________   Signature: _____________________",
    "Address of issuing authority: __________________________________________",
    "",
    "Seal: ________________________________"
  ].join("\r\n");
}

function birthCertificateTemplateMarkup() {
  return `
    <div class="birth-certificate-document">
      <div class="birth-certificate-border">
        <div class="bc-form-no">प्रपत्र सं. 5<br><strong>FORM NO. 5</strong></div>
        <div class="bc-top-row">
          <div class="bc-emblem">
            <div class="bc-emblem-mark">☸</div>
            <span>सत्यमेव जयते</span>
          </div>
          <div class="bc-registration-mark">↻</div>
        </div>
        <h1>जन्म प्रमाण - पत्र</h1>
        <h2>BIRTH CERTIFICATE</h2>
        <p class="bc-rule">
          ( जन्म और मृत्यु रजिस्ट्रीकरण अधिनियम, 1969 की धारा 12/17 और<br>
          राजस्थान जन्म और मृत्यु रजिस्ट्रीकरण नियम, 2000 के नियम 8/13 के अधीन जारी किया गया )
        </p>
        <p class="bc-rule">
          ( Issued under Section 12/17 of the Registration of Births and Deaths Act,1969 and Rule 8/13 of the<br>
          Rajasthan Registration of Births and Deaths Rules, 2000 )
        </p>
        <p class="bc-hindi-cert">
          यह प्रमाणित किया जाता है कि निम्न लिखित सूचना जन्म के मूल अभिलेख से ली गई है जो कि (स्थानीय क्षेत्र/स्थानीय निकाय)
          <span class="dotline"></span> तहसील/खण्ड <span class="dotline short"></span> जिला <span class="dotline short"></span>
          राज्य/संघ राज्य क्षेत्र <span class="dotline medium"></span> का रजिस्टर है।
        </p>
        <p class="bc-english-cert">
          This is to certify that the following information has been taken from the original record of birth which is the
          register for (local area / local body) <span class="dotline"></span> of tahsil / block
          <span class="dotline short"></span> of District <span class="dotline short"></span>
          of state / Union territory <span class="dotline medium"></span>.
        </p>
        <div class="bc-fields">
          <div><span>नाम/Name:</span><i></i></div>
          <div><span>लिंग/Sex:</span><i></i></div>
          <div><span>जन्म तिथि/Date of Birth:</span><i></i></div>
          <div><span>जन्म स्थान/Place of Birth:</span><i></i></div>
          <div class="wide"><span>माता का नाम/Name of Mother:</span><i></i></div>
          <div class="wide"><span>पिता का नाम/Name of Father:</span><i></i></div>
        </div>
        <div class="bc-address-grid">
          <div>
            <h3>बच्चे के जन्म के समय माता पिता का पता</h3>
            <h4>Address of parents at the time of birth of the child:</h4>
            <p></p><p></p><p></p>
          </div>
          <div>
            <h3>माता-पिता का स्थायी पता</h3>
            <h4>Permanent address of parents:</h4>
            <p></p><p></p><p></p>
          </div>
        </div>
        <div class="bc-bottom-fields">
          <div><span>रजिस्ट्रेशन सं./Registration No.:</span><i></i></div>
          <div><span>रजिस्ट्रीकरण की तारीख/Date of Registration</span><i></i></div>
          <div class="wide"><span>टिप्पणी/Remarks(if any)</span><i></i></div>
          <div class="wide"><span>जारी करने की तारीख / Date of issue:</span><i></i><span>जारी करने वाले प्राधिकारी के हस्ताक्षर/ Signature of the issuing authority</span></div>
        </div>
        <div class="bc-authority">जारी करने वाले प्राधिकारी का पता / Address of the issuing authority</div>
        <div class="bc-seal">मुहर/Seal</div>
      </div>
    </div>
  `;
}

function birthCertificateTemplateHtml() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Birth Certificate Form</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Nirmala UI", "Mangal", "Times New Roman", serif; color: #000; background: #fff; }
    .birth-certificate-document { width: 184mm; margin: 0 auto; background: #fff; }
    .birth-certificate-border { border: 3px double #111; min-height: 245mm; padding: 8mm 4mm 5mm; position: relative; }
    .bc-form-no { left: 0; position: absolute; right: 0; text-align: center; top: 1.5mm; font-size: 10pt; font-weight: 700; line-height: 1.2; }
    .bc-top-row { align-items: start; display: flex; justify-content: space-between; padding: 7mm 14mm 0; }
    .bc-emblem { text-align: center; width: 26mm; }
    .bc-emblem-mark { border: 1px solid #111; font-size: 20pt; height: 18mm; line-height: 17mm; margin: 0 auto 1mm; width: 18mm; }
    .bc-emblem span { display: block; font-size: 7pt; }
    .bc-registration-mark { border: 2px solid #111; border-radius: 4mm; font-size: 28pt; height: 15mm; line-height: 12mm; text-align: center; width: 20mm; }
    h1 { font-size: 18pt; margin: 0; text-align: center; }
    h2 { font-size: 17pt; margin: 2mm 0 4mm; text-align: center; }
    .bc-rule { font-size: 9.5pt; line-height: 1.25; margin: 1mm 0; text-align: center; }
    .bc-hindi-cert, .bc-english-cert { font-size: 9pt; line-height: 1.45; margin: 5mm 0 0; text-align: justify; }
    .dotline { border-bottom: 1px dotted #111; display: inline-block; min-width: 45mm; transform: translateY(-1px); }
    .dotline.short { min-width: 25mm; }
    .dotline.medium { min-width: 34mm; }
    .bc-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 7mm; margin-top: 6mm; }
    .bc-fields div, .bc-bottom-fields div { align-items: end; display: flex; gap: 1mm; min-height: 5mm; }
    .bc-fields .wide, .bc-bottom-fields .wide { grid-column: 1 / -1; }
    .bc-fields span, .bc-bottom-fields span { font-size: 9.5pt; white-space: nowrap; }
    .bc-fields i, .bc-bottom-fields i { border-bottom: 1px dotted #111; flex: 1; height: 4mm; }
    .bc-address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; margin-top: 8mm; }
    .bc-address-grid h3 { font-size: 9pt; font-weight: 500; margin: 0; text-align: center; }
    .bc-address-grid h4 { font-size: 9pt; font-weight: 600; margin: 1mm 0 2mm; }
    .bc-address-grid p { border-bottom: 1px dotted #111; height: 5mm; margin: 0 0 1.5mm; }
    .bc-bottom-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; margin-top: 6mm; }
    .bc-authority { font-size: 9pt; margin-top: 10mm; text-align: right; padding-right: 16mm; }
    .bc-seal { bottom: 4mm; font-size: 9pt; left: 0; position: absolute; right: 0; text-align: center; }
  </style>
</head>
<body>${birthCertificateTemplateMarkup()}</body>
</html>
  `.trim();
}

function createTemplateFile(template) {
  const service = selectedService();
  if (template.id === "birth-certificate") {
    const html = birthCertificateTemplateHtml();
    return {
      name: `${template.id}.html`,
      type: "HTML",
      pages: 1,
      previewKind: "html-template",
      previewUrl: "",
      source: template.title,
      templateId: template.id,
      templateKind: "birth-certificate",
      htmlContent: birthCertificateTemplateMarkup(),
      printContentBase64: btoa(unescape(encodeURIComponent(html))),
      validatedAt: new Date().toISOString()
    };
  }

  if (template.imageUrl) {
    return {
      name: `${template.id}.png`,
      type: "PNG",
      pages: Math.max(1, Number(template.pages) || 1),
      previewKind: "image",
      previewUrl: template.imageUrl,
      source: template.title,
      templateId: template.id,
      validatedAt: new Date().toISOString()
    };
  }

  const printableText = templatePrintableText(template, service.title);

  return {
    name: `${template.id}.txt`,
    type: "TXT",
    pages: Math.max(1, Number(template.pages) || 1),
    previewKind: "placeholder",
    previewUrl: "",
    source: template.title,
    templateId: template.id,
    printContentBase64: btoa(unescape(encodeURIComponent(printableText))),
    validatedAt: new Date().toISOString()
  };
}

function revokePreviewUrl(file = state.file) {
  if (file?.previewUrl && file.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(file.previewUrl);
  }
}

function clearCurrentFile() {
  revokePreviewUrl();
  state.file = null;
  state.previewZoom = 1;
  state.uploadError = "";
}

function stopUploadPolling() {
  if (state.uploadPoller) {
    clearInterval(state.uploadPoller);
    state.uploadPoller = null;
  }
}

async function startMobileUploadSession() {
  if (!state.selectedService) {
    state.step = 0;
    render();
    return;
  }

  stopUploadPolling();
  state.uploadSession = {
    token: "",
    uploadUrl: "",
    qrSvg: "",
    status: "preparing",
    error: ""
  };
  render();

  try {
    const response = await fetch(`${BACKEND_URL}/api/mobile-upload/session`);

    if (!response.ok) {
      throw new Error("Upload service unavailable.");
    }

    state.uploadSession = await response.json();
    state.uploadSession.status = "waiting";
    render();
    startUploadPolling();
  } catch (error) {
    state.uploadSession = {
      token: "",
      uploadUrl: `${BACKEND_URL}/mobile-upload`,
      qrSvg: "",
      status: "offline",
      error: "Mobile upload service is not running. Start backend or restart the kiosk app."
    };
    render();
  }
}

function startUploadPolling() {
  stopUploadPolling();

  if (!state.uploadSession?.token) return;

  state.uploadPoller = setInterval(checkMobileUpload, 1800);
  checkMobileUpload();
}

async function checkMobileUpload() {
  if (!state.uploadSession?.token) return;

  try {
    const response = await fetch(`${BACKEND_URL}/api/mobile-upload/${state.uploadSession.token}/status`);

    if (!response.ok) return;

    const session = await response.json();
    state.uploadSession = {
      ...state.uploadSession,
      ...session
    };

    if (session.status === "uploaded" && session.file) {
      const result = createReceivedFileRecord(session.file);

      if (result.error) {
        state.uploadError = result.error;
        render();
        return;
      }

      stopUploadPolling();
      revokePreviewUrl();
      state.file = result.file;
      state.uploadError = "";
      state.step = 2;
      render();
      return;
    }

    render();
  } catch {
    state.uploadSession = {
      ...state.uploadSession,
      status: "offline",
      error: "Waiting for local backend service."
    };
    render();
  }
}

async function refreshPrinterStatus({ rerender = true } = {}) {
  if (state.mode === "admin" && !HAS_EXPLICIT_LOCAL_AGENT) {
    state.printer = {
      ...state.printer,
      online: false,
      name: "Mini-PC local agent",
      paper: "N/A",
      toner: "N/A",
      queue: 0,
      supportsColor: null,
      agent: "Not required",
      statusText: "Local printer agent runs only on the kiosk mini-PC."
    };
    if (rerender) render();
    return;
  }

  if (state.printer.testOverride) {
    if (rerender) render();
    return;
  }

  if (rerender) {
    state.printer.agent = "Checking";
    render();
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PRINTER_STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(`${LOCAL_AGENT_URL}/local/printer/status`, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Local print agent returned an error.");
    }

    const data = await response.json();
    const printer = data.printer || {};

    state.printer = {
      ...state.printer,
      online: printer.status === "online",
      name: printer.name || "No printer selected",
      paper: printer.paperStatus || "Unknown",
      toner: printer.tonerStatus || "Unknown",
      queue: Number(printer.queueLength || 0),
      supportsColor: typeof printer.supportsColor === "boolean" ? printer.supportsColor : null,
      agent: "Running",
      statusText: printer.errorMessage || (printer.status === "online" ? "Ready" : "Offline")
    };
  } catch (error) {
    state.printer = {
      ...state.printer,
      online: false,
      name: "No printer selected",
      paper: "Unknown",
      toner: "Unknown",
      queue: 0,
      supportsColor: null,
      agent: "Offline",
      statusText: error.name === "AbortError"
        ? "Printer status check timed out. Check the printer connection or restart the local print agent."
        : error.message || "Local print agent unavailable"
    };
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (rerender) {
    render();
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

function adminAuthHeaders(headers = {}) {
  return state.adminToken
    ? { ...headers, Authorization: `Bearer ${state.adminToken}` }
    : { ...headers };
}

function fetchAdminJson(path, options = {}) {
  return fetchJson(`${BACKEND_URL}${path}`, {
    ...options,
    headers: adminAuthHeaders(options.headers)
  });
}

function serviceConfigSignature(nextServices, nextPricing) {
  return JSON.stringify({
    services: normalizeServicesConfig(nextServices).map((service) => ({
      id: service.id,
      title: service.title,
      description: service.description,
      defaultPages: service.defaultPages,
      mode: service.mode,
      imageUrl: service.imageUrl,
      enabled: service.enabled,
      kioskIds: service.kioskIds,
      pricing: service.pricing,
      templates: service.templates
    })),
    pricing: normalizePricing(nextPricing)
  });
}

function applyServiceConfig(payload, { rerender = true, source = "backend" } = {}) {
  if (!payload || !Array.isArray(payload.services)) {
    return false;
  }

  const incomingVersion = Number(payload.config?.version || payload.version || 0);
  const hasNewVersion = incomingVersion && incomingVersion !== state.configVersion;
  const incomingSignature = serviceConfigSignature(payload.services, payload.pricing || state.pricing);
  const currentSignature = serviceConfigSignature(services, state.pricing);
  const hasDifferentServices = incomingSignature !== currentSignature;
  const shouldApply = hasNewVersion || hasDifferentServices || source === "manual" || !state.configVersion;

  if (!shouldApply && source !== "admin") {
    return false;
  }

  const previousSelectedService = state.selectedService;
  if (payload.kiosk) {
    state.kiosk = {
      kioskId: normalizeKioskId(payload.kiosk.kioskId) || KIOSK_ID,
      name: String(payload.kiosk.name || "").trim(),
      branch: String(payload.kiosk.branch || "").trim(),
      status: String(payload.kiosk.status || "").trim()
    };
  }
  services = normalizeServicesConfig(payload.services);
  state.pricing = normalizePricing(payload.pricing || state.pricing);
  storeServices();
  storePricing();
  storeConfigMeta(payload.config || {});

  const selectedStillAvailable = previousSelectedService
    ? services.some((service) => service.id === previousSelectedService && serviceAvailableForKiosk(service))
    : true;

  if (state.mode === "customer" && !selectedStillAvailable) {
    if (state.step <= 1 || !state.file) {
      stopUploadPolling();
      state.step = 0;
      state.selectedService = null;
      clearCurrentFile();
      state.uploadSession = null;
    } else {
      state.configStatus = "Service setup changed. Finish this job, then start a new session.";
    }
  } else if (state.mode === "customer" && hasNewVersion) {
    state.configStatus = "Service setup updated.";
  }

  if (rerender) {
    render();
  }

  return true;
}

async function refreshKioskConfig({ rerender = true, force = false } = {}) {
  if (state.servicesDirty || state.serviceEditor) {
    return false;
  }

  try {
    const payload = await fetchJson(`${BACKEND_URL}/api/kiosk/config?kioskId=${encodeURIComponent(KIOSK_ID)}`);
    return applyServiceConfig(payload, {
      rerender,
      source: force ? "manual" : "backend"
    });
  } catch (error) {
    state.configStatus = error.message || "Waiting for backend service config.";
    return false;
  }
}

function stopConfigPolling() {
  if (state.configPoller) {
    clearInterval(state.configPoller);
    state.configPoller = null;
  }
}

function startConfigPolling() {
  stopConfigPolling();
  state.configPoller = setInterval(() => {
    if (state.mode === "customer") {
      refreshKioskConfig({ rerender: state.step === 0 });
    }
  }, 5000);
}

function stopAdminPolling() {
  if (state.adminPoller) {
    clearInterval(state.adminPoller);
    state.adminPoller = null;
  }
}

function startAdminPolling() {
  stopAdminPolling();
  state.adminPoller = setInterval(() => {
    if (state.mode === "admin" && state.adminAuthed) {
      loadAdminData({ rerender: !isEditingFormField() });
    }
  }, 5000);
}

function isEditingFormField() {
  const element = document.activeElement;
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

async function loadAdminData({ rerender = true } = {}) {
  try {
    const [
      dashboard,
      revenue,
      history,
      transactions,
      kiosks,
      system,
      refunds,
      serviceConfig,
      reports
    ] = await Promise.all([
      fetchAdminJson("/api/admin/dashboard"),
      fetchAdminJson("/api/admin/revenue"),
      fetchAdminJson("/api/admin/print-history"),
      fetchAdminJson("/api/admin/transactions"),
      fetchAdminJson("/api/admin/kiosks"),
      fetchAdminJson("/api/admin/system-status"),
      fetchAdminJson("/api/admin/refunds"),
      fetchAdminJson("/api/admin/services"),
      fetchAdminJson("/api/admin/reports")
    ]);

    state.adminData = {
      ...state.adminData,
      dashboard,
      revenue,
      jobs: Array.isArray(history.jobs) ? history.jobs : [],
      payments: Array.isArray(transactions.payments) ? transactions.payments : [],
      kiosks: Array.isArray(kiosks.kiosks) ? kiosks.kiosks : [],
      refunds: Array.isArray(refunds.refunds) ? refunds.refunds : [],
      reports: Array.isArray(reports.reports) ? reports.reports : [],
      backendOnline: system.backend === "online",
      localAgentExpectedPort: system.localAgentExpectedPort,
      lastUpdated: new Date().toISOString(),
      error: ""
    };

    if (revenue.pricing && !state.servicesDirty) {
      state.pricing = normalizePricing(revenue.pricing);
      storePricing();
    }

    if (Array.isArray(serviceConfig.services) && !state.servicesDirty) {
      applyServiceConfig({
        services: serviceConfig.services,
        pricing: serviceConfig.pricing || revenue.pricing || state.pricing,
        config: serviceConfig.config || revenue.config
      }, { rerender: false, source: "admin" });
    }
  } catch (error) {
    state.adminData = {
      ...state.adminData,
      backendOnline: false,
      error: error.message || "Admin backend is offline."
    };
  }

  if (rerender && state.mode === "admin") {
    render();
  }
}

async function syncBackendPrintStatus(printStatus, failureReason = "") {
  if (!state.activeJobId) return;

  try {
    await fetchJson(`${BACKEND_URL}/api/print/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: currentJobId(),
        printStatus,
        paymentStatus: "Payment Success",
        failureReason
      })
    });
  } catch {
    // Admin will show the saved backend record once the backend is reachable again.
  }
}

function localAgentCanReadFile(file) {
  return Boolean(file?.printContentBase64) || /^https?:\/\//i.test(file?.previewUrl || "");
}

function localAgentFileUrl(file) {
  try {
    const url = new URL(file.previewUrl);
    if (url.port === "5080") {
      url.hostname = "localhost";
    }
    return url.toString();
  } catch {
    return file?.previewUrl || "";
  }
}

function paymentRequestBody() {
  const service = selectedService();
  const details = priceDetails();

  return {
    jobId: ensureActiveJobId(),
    kioskId: KIOSK_ID,
    service: service?.id || "print",
    fileName: state.file?.name || "kiosk-document.pdf",
    fileType: state.file?.type || "PDF",
    pageCount: details.pages,
    copies: details.copies,
    colorMode: state.settings.colorMode,
    paperSize: state.settings.paperSize,
    amount: details.total
  };
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_URL}"]`);

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay Checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
    document.head.appendChild(script);
  });
}

async function createRazorpayOrder() {
  const response = await fetch(`${BACKEND_URL}/api/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentRequestBody())
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error([payload.error, payload.setup].filter(Boolean).join(" ") || "Unable to create Razorpay order.");
  }

  return payload;
}

async function verifyRazorpayPayment(response) {
  const verifyResponse = await fetch(`${BACKEND_URL}/api/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: currentJobId(),
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    })
  });
  const payload = await verifyResponse.json().catch(() => ({}));

  if (!verifyResponse.ok) {
    throw new Error(payload.error || "Razorpay payment verification failed.");
  }

  state.paymentStatus = "Success";
  state.paymentStatusMessage = `Payment verified: ${response.razorpay_payment_id}`;
  state.paymentError = "";
  state.paymentBusy = false;
  state.paymentOrder = {
    ...(state.paymentOrder || {}),
    paymentId: response.razorpay_payment_id,
    orderId: response.razorpay_order_id
  };
  state.step = 6;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();
  startLocalPrintJob();
}

async function startRazorpayPayment() {
  if (state.paymentBusy) return;

  state.paymentBusy = true;
  state.paymentStatus = "Checking";
  state.paymentStatusMessage = "Checking printer before payment...";
  state.paymentError = "";
  render();

  try {
    await refreshPrinterStatus({ rerender: false });

    if (!paymentReady()) {
      state.paymentStatus = "Pending";
      state.paymentStatusMessage = "";
      state.paymentError = paymentBlockMessage();
      state.paymentBusy = false;
      render();
      return;
    }

    state.paymentStatus = "Creating";
    state.paymentStatusMessage = "Creating Razorpay test order...";
    render();

    await loadRazorpayCheckout();
    const payload = await createRazorpayOrder();
    const checkout = payload.checkout;
    const details = priceDetails();

    if (!checkout?.key || !checkout?.orderId) {
      throw new Error("Razorpay order response is missing checkout details.");
    }

    state.paymentOrder = {
      orderId: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency
    };
    state.paymentStatus = "Waiting";
    state.paymentStatusMessage = "Waiting for Razorpay checkout...";
    render();

    const razorpay = new window.Razorpay({
      key: checkout.key,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      order_id: checkout.orderId,
      prefill: checkout.prefill || {},
      notes: {
        jobId: currentJobId(),
        fileName: state.file?.name || "kiosk-document.pdf"
      },
      theme: {
        color: "#1f5fbf"
      },
      handler: async (response) => {
        state.paymentStatus = "Verifying";
        state.paymentStatusMessage = "Verifying Razorpay signature...";
        render();

        try {
          await verifyRazorpayPayment(response);
        } catch (error) {
          state.paymentStatus = "Failed";
          state.paymentError = error.message || "Razorpay payment verification failed.";
          state.paymentBusy = false;
          render();
        }
      },
      modal: {
        ondismiss: () => {
          if (["Success", "Failed"].includes(state.paymentStatus)) return;
          state.paymentStatus = "Pending";
          state.paymentStatusMessage = "";
          state.paymentError = "Payment window was closed before completion.";
          state.paymentBusy = false;
          render();
        }
      }
    });

    razorpay.on("payment.failed", (response) => {
      state.paymentStatus = "Failed";
      state.paymentError = response.error?.description || response.error?.reason || "Razorpay payment failed.";
      state.paymentBusy = false;
      render();
    });

    state.paymentStatusMessage = `Razorpay order ${checkout.orderId} ready for ${money(details.total)}.`;
    render();
    razorpay.open();
  } catch (error) {
    state.paymentStatus = "Failed";
    state.paymentError = error.message || "Unable to start Razorpay payment.";
    state.paymentBusy = false;
    render();
  }
}

async function startLocalPrintJob() {
  const file = state.file;

  if (!localAgentCanReadFile(file)) {
    state.printStatusMessage =
      "This demo file is not reachable by the local print agent. Use the manual progress button here, or upload through the QR flow for real printing.";
    state.printJob = null;
    render();
    return;
  }

  state.printJob = { status: "starting" };
  state.printProgress = 1;
  state.printStatusMessage = "Checking selected Windows printer...";
  render();

  try {
    await refreshPrinterStatus({ rerender: false });

    if (!state.printer.online) {
      throw new Error(state.printer.statusText || "Printer is offline.");
    }

    state.printProgress = 2;
    state.printStatusMessage = file.printContentBase64
      ? "Sending blank form template to the local print agent..."
      : "Sending uploaded file to the local print agent...";
    syncBackendPrintStatus("Printing");
    render();

    const printBody = {
      jobId: currentJobId(),
      fileName: file.name,
      copies: state.settings.copies,
      colorMode: state.settings.colorMode,
      paperSize: state.settings.paperSize,
      sides: state.settings.sides,
      orientation: state.settings.orientation,
      pageRange: state.settings.range,
      templateId: file.templateId || "",
      templateKind: file.templateKind || ""
    };

    if (file.printContentBase64) {
      printBody.fileContentBase64 = file.printContentBase64;
    } else {
      printBody.fileUrl = localAgentFileUrl(file);
    }

    const response = await fetch(`${LOCAL_AGENT_URL}/local/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(printBody)
    });

    const payload = await response.json().catch(() => ({}));
    state.printJob = payload.job || state.printJob;

    if (!response.ok) {
      throw new Error(payload.error || payload.job?.errorMessage || "Local print agent could not print the file.");
    }

    state.printProgress = 5;
    state.printStatusMessage = `Sent to ${payload.printer?.name || state.printer.name || "printer"}.`;
    addJob("Completed");
    state.step = 7;
    render();
  } catch (error) {
    addJob("Payment Success Print Failed");
    state.printError = friendlyPrintError(error.message);
    syncBackendPrintStatus("Payment Success Print Failed", state.printError);
    state.printStatusMessage = "";
    render();
  }
}

function goToNextStep() {
  state.uploadError = "";

  if (state.step === 0 && !state.selectedService) {
    render();
    return;
  }

  if (state.step === 1 && !state.file) {
    state.uploadError = "Please upload a valid file before preview.";
    render();
    return;
  }

  if (state.step === 4) {
    ensureActiveJobId();
  }

  const previousStep = state.step;
  state.step = Math.min(customerSteps.length - 1, state.step + 1);

  if (state.step === 5 && previousStep !== 5 && !state.printer.testOverride) {
    state.printer = {
      ...state.printer,
      online: false,
      name: "Checking printer",
      paper: "Unknown",
      toner: "Unknown",
      queue: 0,
      supportsColor: null,
      agent: "Checking",
      statusText: "Checking Windows printer status..."
    };
  }

  render();

  if (state.step === 5 && previousStep !== 5) {
    refreshPrinterStatus();
  }
}

function openAdmin(page = "dashboard") {
  state.mode = "admin";
  state.adminPage = page;
  render();

  if (state.adminAuthed) {
    loadAdminData();
    startAdminPolling();
  }
}

function openCustomer(reset = false) {
  stopAdminPolling();

  if (reset) {
    resetCustomer();
    refreshKioskConfig({ rerender: false, force: true });
    render();
    return;
  }

  state.mode = "customer";
  refreshKioskConfig({ rerender: false, force: true });
  render();
}

function render() {
  if (state.mode === "admin" && !state.adminAuthed) {
    syncAdminLoginDraftFromDom();
  }

  const app = qs("#app");
  app.innerHTML = state.mode === "customer" ? renderCustomerShell() : renderAdminShell();
  bindEvents();
}

function renderCustomerShell() {
  return `
    <div class="app-shell customer-shell">
      ${renderCustomerTopbar()}
      <main class="main">
        ${renderCustomer()}
      </main>
    </div>
  `;
}

function renderAdminShell() {
  return `
    <div class="app-shell admin-shell">
      ${renderAdminTopbar()}
      <main class="main admin-screen">
        ${renderAdmin()}
      </main>
    </div>
  `;
}

function renderCustomerTopbar() {
  const printerClass = state.printer.online ? "" : "warning";
  const printerText = state.printer.online ? "Printer ready" : "Printer offline";
  const kioskLabel = [state.kiosk.kioskId || KIOSK_ID, state.kiosk.name, state.kiosk.branch]
    .filter(Boolean)
    .join(" | ");

  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">PK</div>
        <div>
          <div class="brand-title">Smart Printing Kiosk</div>
          <div class="brand-subtitle">${escapeHtml(kioskLabel || KIOSK_ID)} | Government and education ready</div>
        </div>
      </div>
      <div class="topbar-actions">
        <span class="status-pill ${printerClass}"><span class="dot"></span>${printerText}</span>
        <button class="ghost-button" data-action="reset-session">New Session</button>
      </div>
    </header>
  `;
}

function renderAdminTopbar() {
  const adminLabel = state.adminAccount?.name || state.adminAccount?.email || "Kiosk Admin";
  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-mark">AD</div>
        <div>
          <div class="brand-title">Kiosk Admin Console</div>
          <div class="brand-subtitle">${escapeHtml(adminLabel)} | assigned kiosk data only</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="open-super-admin">Super Admin</button>
        ${state.adminAuthed ? `<button class="danger-button" data-action="admin-logout">Logout</button>` : ""}
      </div>
    </header>
  `;
}

function renderCustomer() {
  const showPanels = state.step > 0 && Boolean(state.selectedService);
  return `
    <div class="customer-layout ${showPanels ? "" : "upload-focused"}">
      ${showPanels ? `
        <aside class="rail">
          <h2 class="panel-title">Customer Flow</h2>
          <div class="stepper">
            ${customerSteps.map((step, index) => renderStepItem(step, index)).join("")}
          </div>
        </aside>
      ` : ""}
      <section class="content">
        ${renderCustomerStep()}
      </section>
      ${showPanels ? `
        <aside class="right-panel">
          ${renderSessionPanel()}
        </aside>
      ` : ""}
    </div>
  `;
}

function renderStepItem(step, index) {
  const status = index === state.step ? "active" : index < state.step ? "done" : "";
  return `
    <div class="step-item ${status}">
      <span class="step-number">${index + 1}</span>
      <span>${step}</span>
    </div>
  `;
}

function renderCustomerStep() {
  if (state.step === 0 || !state.selectedService) return renderServicesStep();
  if (state.step > 1 && !state.file) return isFormTemplateService() ? renderFormTemplateStep() : renderUploadStep();
  if (state.step === 1) return isFormTemplateService() ? renderFormTemplateStep() : renderUploadStep();
  if (state.step === 2) return renderPreviewStep();
  if (state.step === 3) return renderSettingsStep();
  if (state.step === 4) return renderPriceStep();
  if (state.step === 5) return renderPaymentStep();
  if (state.step === 6) return renderPrintingStep();
  return renderThankYouStep();
}

function renderServicesStep() {
  if (KIOSK_ID === UNASSIGNED_KIOSK_ID) {
    return `
      <div class="stage service-stage is-empty">
        <div class="stage-header">
          <h1>Kiosk setup required</h1>
          <p class="stage-intro">Ask the kiosk admin for this machine's kiosk ID and setup code.</p>
        </div>
      </div>
    `;
  }

  const availableServices = customerServices();
  let serviceCountClass = "is-catalog";

  if (availableServices.length === 0) serviceCountClass = "is-empty";
  if (availableServices.length === 1) serviceCountClass = "is-single";
  if (availableServices.length === 2) serviceCountClass = "is-pair";

  return `
    <div class="stage service-stage ${serviceCountClass}">
      <div class="stage-header">
        <h1>Choose service</h1>
        <p class="stage-intro">Select a service first. Form services include ready templates; other services use QR upload.</p>
      </div>
      ${state.configStatus ? `<div class="save-note">${escapeHtml(state.configStatus)}</div>` : ""}
      <div class="service-grid">
        ${availableServices.length ? availableServices.map((service) => {
          const rates = serviceRates(service.id);

          return `
            <button class="service-card ${state.selectedService === service.id ? "selected" : ""}" data-service="${service.id}">
              ${serviceMediaMarkup(service)}
              <div>
                <h2>${escapeHtml(service.title)}</h2>
                <p>${escapeHtml(service.description)}</p>
              </div>
              <div class="service-rates">
                <span><strong>${money(rates.bw)}</strong> B/W per page</span>
                <span><strong>${money(rates.color)}</strong> Color per page</span>
              </div>
            </button>
          `;
        }).join("") : `<div class="empty-note">No services are enabled for ${escapeHtml(KIOSK_ID)}. Open Admin Services to enable or assign services.</div>`}
      </div>
    </div>
  `;
}

function renderFormTemplateStep() {
  const service = selectedService();
  const templates = formTemplatesForService(service.id);

  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Choose form template</h1>
        <p class="stage-intro">${escapeHtml(service.title)} selected. Pick a demo template to preview and print.</p>
      </div>
      <div class="template-grid">
        ${templates.map((template) => `
          <button class="template-card" data-template="${escapeHtml(template.id)}">
            ${template.imageUrl
              ? `<span class="template-badge template-image"><img alt="" src="${escapeHtml(template.imageUrl)}" /></span>`
              : `<span class="template-badge">${escapeHtml(service.icon)}</span>`}
            <div>
              <h2>${escapeHtml(template.title)}</h2>
              <p>${escapeHtml(template.description)}</p>
            </div>
            <div class="template-meta">
              <span>${template.pages} page${template.pages === 1 ? "" : "s"}</span>
              <strong>Print Blank Form</strong>
            </div>
          </button>
        `).join("")}
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back to Services</button>
      </div>
    </div>
  `;
}

function renderUploadStep() {
  const session = state.uploadSession;
  const service = selectedService();
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Scan QR to upload</h1>
        <p class="stage-intro">${escapeHtml(service.title)} selected. Scan this QR code on your mobile, choose the document, and send it to the kiosk.</p>
      </div>
      <div class="qr-upload-layout qr-only">
        <div class="qr-upload-card">
          ${renderQrUploadBox(session)}
          ${state.uploadError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.uploadError)}</div>` : ""}
          ${session?.error ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(session.error)}</div>` : ""}
          <div class="flow-actions" style="margin-top: 16px;">
            <button class="secondary-button" data-action="refresh-upload">Check Upload</button>
            <button class="ghost-button" data-action="new-upload-qr">New QR</button>
          </div>
        </div>
      </div>
      ${state.file ? `
        <div class="flow-actions">
          <button class="primary-button" data-action="next-step">Preview File</button>
        </div>
      ` : `
        <div class="flow-actions">
          <button class="ghost-button" data-action="prev-step">Back to Services</button>
        </div>
      `}
    </div>
  `;
}

function renderQrUploadBox(session) {
  if (!session || session.status === "preparing") {
    return `
      <div class="qr-placeholder">
        <div class="qr-loading"></div>
        <h2>Preparing QR code</h2>
        <p>Starting secure mobile upload session...</p>
      </div>
    `;
  }

  if (session.status === "offline") {
    return `
      <div class="qr-placeholder">
        <div class="preview-file-icon">QR</div>
        <h2>QR service offline</h2>
        <p>Start the backend service, then generate a new QR.</p>
      </div>
    `;
  }

  return `
    <div class="qr-code-box">
      ${session.qrSvg || `<img alt="Upload QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=${encodeURIComponent(session.uploadUrl)}" />`}
    </div>
    <h2>Scan with mobile</h2>
    <p class="helper-text">After upload completes on phone, this kiosk will automatically move to preview.</p>
  `;
}

function renderPreviewStep() {
  const pages = pageCount();
  const previewClass = state.file?.previewUrl && ["pdf", "image"].includes(state.file.previewKind)
    ? "preview-live"
    : "preview-document-mode";
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Preview file</h1>
        <p class="stage-intro">Customer can confirm the uploaded file before settings and payment.</p>
      </div>
      <div class="preview-grid">
        <div class="document-preview ${previewClass}" style="transform: scale(${state.previewZoom}); transform-origin: top left;">
          ${renderPreviewContent()}
        </div>
        <div class="module-card">
          <h2>File Details</h2>
          <div class="info-list">
            <div class="info-row"><span>Name</span><strong>${escapeHtml(state.file?.name || "sample.pdf")}</strong></div>
            <div class="info-row"><span>Type</span><strong>${escapeHtml(state.file?.type || "PDF")}</strong></div>
            <div class="info-row"><span>Pages</span><strong>${pages}</strong></div>
            <div class="info-row"><span>Validation</span><strong>Passed</strong></div>
            <div class="info-row"><span>Password</span><strong>Not detected</strong></div>
          </div>
          <div class="flow-actions" style="margin-top: 16px;">
            <button class="secondary-button" data-action="zoom-in">Zoom</button>
            <button class="secondary-button" data-action="zoom-out">Fit</button>
            <button class="danger-button" data-action="delete-file">Delete</button>
          </div>
        </div>
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back</button>
        <button class="primary-button" data-action="next-step">Print Settings</button>
      </div>
    </div>
  `;
}

function renderPreviewContent() {
  const file = state.file;
  const pages = pageCount();

  if (!file) {
    return renderPreviewFallback("No file selected", "Upload a file to see the preview.");
  }

  if (file.previewKind === "pdf" && file.previewUrl) {
    return `
      <object class="preview-frame" data="${escapeHtml(file.previewUrl)}#toolbar=0&navpanes=0" type="application/pdf">
        ${renderPreviewFallback("PDF preview unavailable", "The file is valid. Continue after checking file details.")}
      </object>
    `;
  }

  if (file.previewKind === "image" && file.previewUrl) {
    return `<img class="preview-media" src="${escapeHtml(file.previewUrl)}" alt="${escapeHtml(file.name)} preview" />`;
  }

  if (file.previewKind === "html-template" && file.htmlContent) {
    return `<div class="html-template-preview">${file.htmlContent}</div>`;
  }

  if (file.printContentBase64) {
    return renderTextDocumentPreview(file);
  }

  if (file.previewKind === "document") {
    return renderUploadedDocumentPreview(file);
  }

  return `
    ${renderPreviewFallback(
      file.source ? `${escapeHtml(file.source)} demo upload` : "Preview placeholder",
      "A real uploaded PDF or image will render here."
    )}
    <div class="thumbnail-grid">
      ${Array.from({ length: Math.min(pages, 8) }, (_, index) => `
        <div class="page-thumb">
          <div class="page-lines"></div>
          <div class="page-number">Page ${index + 1}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function decodeBase64Utf8(value) {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function chunkLines(lines, size) {
  const chunks = [];

  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }

  return chunks;
}

function renderTextDocumentPreview(file) {
  const text = decodeBase64Utf8(file.printContentBase64);
  const lines = text.split(/\r?\n/);
  const pages = Math.max(pageCount(), 1);
  const chunks = chunkLines(lines, 22);

  while (chunks.length < pages) {
    chunks.push([""]);
  }

  return `
    <div class="form-preview-pages">
      ${chunks.slice(0, pages).map((pageLines, index) => `
        <article class="form-preview-page">
          <div class="form-preview-page-header">
            <strong>${escapeHtml(file.source || file.name)}</strong>
            <span>Page ${index + 1} of ${pages}</span>
          </div>
          <pre>${escapeHtml(pageLines.join("\n"))}</pre>
        </article>
      `).join("")}
    </div>
  `;
}

function renderUploadedDocumentPreview(file) {
  const pages = Math.max(pageCount(), 1);
  return `
    <div class="form-preview-pages">
      ${Array.from({ length: Math.min(pages, 6) }, (_, index) => `
        <article class="form-preview-page">
          <div class="form-preview-page-header">
            <strong>${escapeHtml(file.name)}</strong>
            <span>Page ${index + 1} of ${pages}</span>
          </div>
          <div class="document-preview-lines">
            <h3>${escapeHtml(file.name.replace(/\.[^.]+$/, ""))}</h3>
            <p>This uploaded document is ready for printing. A full DOC/DOCX visual preview needs server-side conversion to PDF.</p>
            ${Array.from({ length: 12 }, (_, lineIndex) => `
              <span style="width: ${lineIndex % 3 === 0 ? 92 : lineIndex % 3 === 1 ? 76 : 84}%;"></span>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPreviewFallback(title, message) {
  return `
    <div class="preview-fallback">
      <div class="preview-file-icon">${escapeHtml(state.file?.type || "FILE")}</div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function renderSettingsStep() {
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Print settings</h1>
        <p class="stage-intro">Set color, copies, paper, duplex, orientation, range, and finishing options before price calculation.</p>
      </div>
      <div class="settings-grid">
        <div class="setting-field">
          <label>Color Mode</label>
          <div class="segmented">
            <button class="${state.settings.colorMode === "bw" ? "active" : ""}" data-setting="colorMode" data-value="bw">B/W</button>
            <button class="${state.settings.colorMode === "color" ? "active" : ""}" data-setting="colorMode" data-value="color">Color</button>
          </div>
        </div>
        <div class="setting-field">
          <label for="copies">Copies</label>
          <input id="copies" type="number" min="1" max="99" value="${state.settings.copies}" data-input="copies" />
        </div>
        <div class="setting-field">
          <label for="paperSize">Paper Size</label>
          <select id="paperSize" data-input="paperSize">
            ${["A4", "A3", "Letter", "Legal"].map((size) => `<option ${state.settings.paperSize === size ? "selected" : ""}>${size}</option>`).join("")}
          </select>
        </div>
        <div class="setting-field">
          <label for="sides">Sides</label>
          <select id="sides" data-input="sides">
            <option value="single" ${state.settings.sides === "single" ? "selected" : ""}>Single side</option>
            <option value="duplex" ${state.settings.sides === "duplex" ? "selected" : ""}>Double side</option>
          </select>
        </div>
        <div class="setting-field">
          <label for="orientation">Orientation</label>
          <select id="orientation" data-input="orientation">
            <option value="portrait" ${state.settings.orientation === "portrait" ? "selected" : ""}>Portrait</option>
            <option value="landscape" ${state.settings.orientation === "landscape" ? "selected" : ""}>Landscape</option>
          </select>
        </div>
        <div class="setting-field">
          <label for="range">Page Range</label>
          <input id="range" value="${state.settings.range}" data-input="range" placeholder="all or 1-5" />
        </div>
        <div class="setting-field">
          <label for="staple">Staple</label>
          <select id="staple" data-input="staple">
            <option value="no" ${state.settings.staple === "no" ? "selected" : ""}>No</option>
            <option value="yes" ${state.settings.staple === "yes" ? "selected" : ""}>Yes, if supported</option>
          </select>
        </div>
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back</button>
        <button class="primary-button" data-action="next-step">Calculate Price</button>
      </div>
    </div>
  `;
}

function renderPriceStep() {
  const details = priceDetails();
  const service = selectedService();
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Price</h1>
        <p class="stage-intro">Review the job total before continuing to payment.</p>
      </div>
      <div class="price-layout">
        <div class="module-card">
          <h2>Price Breakdown</h2>
          <div class="info-list">
            <div class="info-row"><span>Service</span><strong>${escapeHtml(service.title)}</strong></div>
            <div class="info-row"><span>Pages</span><strong>${details.pages}</strong></div>
            <div class="info-row"><span>Copies</span><strong>${details.copies}</strong></div>
            <div class="info-row"><span>B/W per page</span><strong>${money(details.rates.bw)}</strong></div>
            <div class="info-row"><span>Color per page</span><strong>${money(details.rates.color)}</strong></div>
            <div class="info-row"><span>Selected rate</span><strong>${money(details.rate)} / page</strong></div>
          </div>
        </div>
        <div class="price-total">
          <span>Total Payable</span>
          <strong>${money(details.total)}</strong>
          <button class="primary-button" data-action="next-step">Continue to Payment</button>
        </div>
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back</button>
      </div>
    </div>
  `;
}

function renderHealthRow(label, value, tone) {
  return `
    <div class="health-row">
      <strong>${escapeHtml(label)}</strong>
      <span class="badge ${tone}">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderPaymentStep() {
  const details = priceDetails();
  const jobId = ensureActiveJobId();
  const orderId = state.paymentOrder?.orderId || "Not created";
  const busy = state.paymentBusy;
  const canPay = paymentReady();
  const colorSupported = colorSelectionSupported();
  const blockMessage = paymentBlockMessage();
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Printer setup and payment</h1>
        <p class="stage-intro">Confirm the selected printer here, then start Razorpay payment.</p>
      </div>
      <div class="payment-layout">
        <div class="qr-box">
          <div class="qr-pattern" aria-label="Razorpay checkout pattern"></div>
          <h2>${money(details.total)}</h2>
          <p class="helper-text">Job ${jobId}</p>
        </div>
        <div class="module-card">
          <h2>Payment Status</h2>
          <div class="info-list" style="margin-bottom: 16px;">
            <div class="info-row"><span>Gateway</span><strong>Razorpay Test Mode</strong></div>
            <div class="info-row"><span>Order</span><strong>${escapeHtml(orderId)}</strong></div>
            <div class="info-row"><span>Amount</span><strong>${money(details.total)}</strong></div>
          </div>
          <div class="timeline">
            ${renderTimelineRow(1, "Order created", Boolean(state.paymentOrder), state.paymentStatus === "Creating")}
            ${renderTimelineRow(2, "Checkout opened", ["Waiting", "Verifying", "Success"].includes(state.paymentStatus), state.paymentStatus === "Waiting")}
            ${renderTimelineRow(3, "Signature verified", state.paymentStatus === "Success", state.paymentStatus === "Verifying")}
            ${renderTimelineRow(4, "Job marked paid", state.paymentStatus === "Success")}
          </div>
          ${state.paymentStatusMessage ? `<p class="helper-text" style="margin-top: 14px;">${escapeHtml(state.paymentStatusMessage)}</p>` : ""}
          ${blockMessage ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(blockMessage)}</div>` : ""}
          ${state.paymentError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.paymentError)}</div>` : ""}
          <div class="flow-actions" style="margin-top: 16px;">
            <button class="primary-button" data-action="pay-razorpay" ${busy || !canPay ? "disabled" : ""}>${busy ? "Processing..." : "Pay with Razorpay"}</button>
            <button class="danger-button" data-action="payment-failed">Payment Failed</button>
          </div>
        </div>
        <div class="module-card printer-setup-card">
          <h2>Printer Setup</h2>
          <div class="health-list">
            ${renderHealthRow("Selected printer", state.printer.name || "No printer selected", state.printer.online ? "good" : "warn")}
            ${renderHealthRow("Printer", state.printer.online ? "Online" : "Offline", state.printer.online ? "good" : "bad")}
            ${state.settings.colorMode === "color" ? renderHealthRow("Color support", colorSupported ? "Available" : "Not supported", colorSupported ? "good" : "bad") : ""}
            ${renderHealthRow("Paper", state.printer.paper, state.printer.paper === "Ready" ? "good" : "warn")}
            ${renderHealthRow("Toner", state.printer.toner, "good")}
            ${renderHealthRow("Queue", `${state.printer.queue} waiting`, state.printer.queue < 5 ? "good" : "warn")}
            ${renderHealthRow("Local Agent", state.printer.agent, state.printer.agent === "Running" ? "good" : "bad")}
            ${renderHealthRow("Status", state.printer.statusText, state.printer.online ? "good" : "bad")}
          </div>
          <div class="flow-actions" style="margin-top: 16px;">
            <button class="secondary-button" data-action="refresh-printer">Refresh Printer Status</button>
          </div>
        </div>
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back</button>
      </div>
    </div>
  `;
}

function renderTimelineRow(index, text, done, active = false) {
  return `
    <div class="timeline-row ${done ? "done" : ""} ${active ? "active" : ""}">
      <span class="timeline-index">${index}</span>
      <strong>${text}</strong>
      <span class="badge ${done ? "good" : active ? "warn" : ""}">${done ? "Done" : active ? "Active" : "Pending"}</span>
    </div>
  `;
}

function renderPrintingStep() {
  if (state.printError) {
    return renderPrintFailureStep();
  }

  const manualMode = !localAgentCanReadFile(state.file);
  const statuses = [
    "Payment successful",
    "Preparing document",
    "Sending to printer",
    `Printing page ${Math.max(1, Math.min(pageCount(), state.printProgress))} of ${pageCount()}`,
    "Completed"
  ];

  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Printing status</h1>
        <p class="stage-intro">The local print agent owns the printer queue, retry logic, and live status updates. Paid jobs are never lost if printing fails.</p>
      </div>
      <div class="module-card">
        <h2>Live Job ${currentJobId()}</h2>
        ${state.printStatusMessage ? `<p class="helper-text">${escapeHtml(state.printStatusMessage)}</p>` : ""}
        <div class="health-list" style="margin-bottom: 16px;">
          ${renderHealthRow("Printer", state.printer.name || "Default printer", state.printer.online ? "good" : "warn")}
          ${renderHealthRow("Agent", state.printer.agent, state.printer.agent === "Running" ? "good" : "warn")}
        </div>
        <div class="timeline">
          ${statuses.map((text, index) => renderTimelineRow(index + 1, text, state.printProgress > index, state.printProgress === index)).join("")}
        </div>
        <div class="flow-actions" style="margin-top: 16px;">
          <button class="primary-button" data-action="advance-print" ${manualMode ? "" : "disabled"}>Advance Print Status</button>
          <button class="danger-button" data-action="print-failed">Simulate Print Failed</button>
        </div>
      </div>
    </div>
  `;
}

function renderPrintFailureStep() {
  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Printing needs attention</h1>
        <p class="stage-intro">${escapeHtml(state.printError)} The paid job is saved in admin history and can be retried without charging again.</p>
      </div>
      <div class="module-card">
        <h2>Recovery Options</h2>
        <div class="health-list">
          ${renderHealthRow("Payment", "Success", "good")}
          ${renderHealthRow("Print", "Failed", "bad")}
          ${renderHealthRow("Queue", "Saved for retry", "warn")}
          ${renderHealthRow("Refund", "Available if retry fails", "warn")}
        </div>
        ${state.printStatusMessage ? `<p class="helper-text">${escapeHtml(state.printStatusMessage)}</p>` : ""}
        <div class="flow-actions" style="margin-top: 16px;">
          <button class="primary-button" data-action="retry-print">Retry Print</button>
          <button class="secondary-button" data-action="request-refund">Request Refund</button>
        </div>
      </div>
    </div>
  `;
}

function renderThankYouStep() {
  const details = priceDetails();
  const receiptJob = state.lastCompletedJob || {
    id: currentJobId(),
    service: selectedService()?.title,
    pages: details.pages,
    copies: details.copies,
    amount: details.total,
    print: "Completed"
  };

  return `
    <div class="stage">
      <div class="stage-header">
        <h1>Thank you</h1>
        <p class="stage-intro">Printing completed successfully. Customer files are removed from kiosk storage after the session, while transaction metadata remains for reports.</p>
      </div>
      <div class="receipt-card">
        <h2>Receipt</h2>
        <div class="receipt-row"><span>Job ID</span><strong>${escapeHtml(receiptJob.id)}</strong></div>
        <div class="receipt-row"><span>Pages</span><strong>${receiptJob.pages}</strong></div>
        <div class="receipt-row"><span>Copies</span><strong>${receiptJob.copies}</strong></div>
        <div class="receipt-row"><span>Amount</span><strong>${money(receiptJob.amount)}</strong></div>
        <div class="receipt-row"><span>Status</span><strong>${escapeHtml(receiptJob.print)}</strong></div>
        <div class="flow-actions">
          <button class="secondary-button">Print Receipt</button>
          <button class="primary-button" data-action="finish-session">Start New Session</button>
        </div>
      </div>
    </div>
  `;
}

function renderSessionPanel() {
  const details = priceDetails();
  const service = selectedService();
  const rates = serviceRates(service.id);
  const rows = [
    `<div class="info-row"><span>Service</span><strong>${escapeHtml(service.title)}</strong></div>`,
    `<div class="info-row"><span>File</span><strong>${escapeHtml(state.file?.name || "Waiting")}</strong></div>`
  ];

  if (state.file && state.step >= 3) {
    rows.push(`<div class="info-row"><span>Copies</span><strong>${state.settings.copies}</strong></div>`);
    rows.push(`<div class="info-row"><span>Color</span><strong>${state.settings.colorMode === "color" ? "Color" : "B/W"}</strong></div>`);
  }

  if (state.file && state.step >= 4) {
    rows.push(`<div class="info-row"><span>B/W rate</span><strong>${money(rates.bw)} / page</strong></div>`);
    rows.push(`<div class="info-row"><span>Color rate</span><strong>${money(rates.color)} / page</strong></div>`);
    rows.push(`<div class="info-row"><span>Total</span><strong>${money(details.total)}</strong></div>`);
  }

  return `
    <h2 class="panel-title">Session</h2>
    <div class="info-list">
      ${rows.join("")}
    </div>
  `;
}

function renderAdmin() {
  if (!state.adminAuthed) return renderLogin();

  return `
    <div class="admin-layout">
      <nav class="admin-nav">
        ${adminNavGroups().map((group) => `
          <div class="admin-nav-group">
            <div class="admin-nav-label">${group.label}</div>
            ${group.pages.map((page) => `
              <button class="${state.adminPage === page.id ? "active" : ""}" data-admin-page="${page.id}">${page.label}</button>
            `).join("")}
          </div>
        `).join("")}
      </nav>
      <section class="admin-main">
        ${renderAdminPage()}
      </section>
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="login-view">
      <div class="login-panel">
        <h1>Kiosk Admin Login</h1>
        <p class="helper-text">Open the admin website directly. Customer kiosk screens do not expose admin access.</p>
        ${state.adminLoginError ? `<div class="empty-note">${escapeHtml(state.adminLoginError)}</div>` : ""}
        <label>Email or mobile
          <input name="username" value="${escapeHtml(state.adminLoginDraft.email)}" autocomplete="username" data-admin-login-field="email" />
        </label>
        <label>Password
          <input type="password" name="password" value="${escapeHtml(state.adminLoginDraft.password)}" autocomplete="current-password" data-admin-login-field="password" />
        </label>
        <button class="primary-button" data-action="admin-login">Open Kiosk Admin</button>
      </div>
    </div>
  `;
}

function adminNavGroups() {
  return [
    {
      label: "Operate",
      pages: [
        { id: "dashboard", label: "Dashboard" },
        { id: "services", label: "Services" },
        { id: "pricing", label: "Pricing" },
        { id: "history", label: "Print History" },
        { id: "transactions", label: "Transactions" }
      ]
    },
    {
      label: "Support",
      pages: [
        { id: "system", label: "System Status" },
        { id: "revenue", label: "Revenue" },
        { id: "kiosks", label: "Kiosks" },
        { id: "refunds", label: "Refunds" }
      ]
    }
  ];
}

function adminPages() {
  return adminNavGroups().flatMap((group) => group.pages);
}

function renderAdminHeader(title, subtitle, action = "") {
  return `
    <div class="admin-header">
      <div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="flow-actions">${action}</div>
    </div>
  `;
}

function renderAdminPage() {
  const page = state.adminPage;
  if (page === "dashboard") return renderDashboard();
  if (page === "revenue") return renderRevenue();
  if (page === "history") return renderHistory();
  if (page === "transactions") return renderTransactions();
  if (page === "system") return renderSystemStatus();
  if (page === "reports") return renderReports();
  if (page === "services") return renderServicesAdmin();
  if (page === "service-editor") return renderServiceEditorPage();
  if (page === "pricing") return renderPricing();
  if (page === "kiosks") return renderKiosks();
  if (page === "refunds") return renderRefunds();
  if (page === "alerts") return renderAlerts();
  return renderDashboard();
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function serviceTitle(serviceId) {
  return services.find((service) => service.id === serviceId)?.title || serviceId || "Print Document";
}

function adminNotice() {
  if (state.adminData.error) {
    return `<div class="empty-note" style="margin-bottom: 16px;">${escapeHtml(state.adminData.error)} Showing only local session data until backend reconnects.</div>`;
  }

  if (state.adminData.lastUpdated) {
    return `<p class="helper-text" style="margin-top: -10px; margin-bottom: 16px;">Live backend data. Last updated ${escapeHtml(formatDateTime(state.adminData.lastUpdated))}.</p>`;
  }

  return `<p class="helper-text" style="margin-top: -10px; margin-bottom: 16px;">Loading live backend data...</p>`;
}

function liveJobs() {
  return state.adminData.jobs.length ? state.adminData.jobs : [];
}

function jobRow(job) {
  return {
    id: job.jobId || job.id || "",
    date: formatDateTime(job.completedAt || job.createdAt || job.date),
    kiosk: job.kioskId || job.kiosk || "KIOSK-BANK-01",
    branch: job.branch || "Local Branch",
    file: job.fileName || job.file || "Document",
    service: serviceTitle(job.service),
    pages: Number(job.pageCount || job.pages || 1),
    copies: Number(job.copies || 1),
    amount: Number(job.amount || 0),
    payment: job.paymentStatus || job.payment || "Draft",
    print: job.printStatus || job.print || "Draft"
  };
}

function paymentRow(payment) {
  const job = liveJobs().find((item) => item.jobId === payment.jobId) || {};

  return {
    time: formatDateTime(payment.paidAt || payment.createdAt),
    jobId: payment.jobId || "",
    gatewayId: payment.razorpayPaymentId || payment.razorpayOrderId || payment.paymentId || "",
    upiRef: payment.upiReferenceId || "-",
    amount: Number(payment.amount || job.amount || 0),
    payment: payment.status || "Pending",
    print: job.printStatus || "-"
  };
}

function emptyRows(message, columns) {
  return [[message, ...Array(Math.max(0, columns - 1)).fill("")]];
}

function dashboardMetrics() {
  const dashboard = state.adminData.dashboard || {};
  const revenue = state.adminData.revenue || {};
  const jobs = liveJobs().map(jobRow);
  const failed = dashboard.failedJobs ?? jobs.filter((job) => job.print.includes("Failed")).length;
  const pages = jobs.reduce((sum, job) => sum + (job.pages * job.copies), 0);
  const pendingRefunds = state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || "")).length;
  const queueLength = jobs.filter((job) => /queue|printing|pending/i.test(job.print)).length;
  const printerReady = state.printer.online ? "Printer ready" : (state.printer.statusText || "Printer unchecked");

  return [
    ["Today Revenue", money(revenue.gross ?? dashboard.revenueToday ?? 0), "Live backend total"],
    ["Today Jobs", String(dashboard.jobsToday ?? jobs.length), `${state.adminData.kiosks.length || 1} kiosk record(s)`],
    ["Failed Jobs", String(failed), "Needs support action"],
    ["Active Kiosks", String(dashboard.activeKiosks ?? state.adminData.kiosks.filter((kiosk) => kiosk.status === "online").length), "Backend kiosk records"],
    ["Pages Printed", String(pages), "Completed and queued jobs"],
    ["Pending Refunds", String(pendingRefunds), "Approval required"],
    ["Queue Length", String(queueLength), "Live job records"],
    ["System Health", state.adminData.backendOnline ? "Online" : "Offline", printerReady]
  ];
}

function renderDashboard() {
  const failedJobs = liveJobs().map(jobRow).filter((job) => job.print.includes("Failed"));
  const queuedJobs = liveJobs().map(jobRow).filter((job) => /queue|printing|pending/i.test(job.print));
  const alerts = [
    ...failedJobs.map((job) => `${job.id} needs print recovery`),
    ...state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || "")).map((refund) => `${refund.refundId} refund pending`),
    ...(state.printer.online ? [] : [state.printer.statusText || "Printer status needs attention"])
  ];

  return `
    ${renderAdminHeader("Dashboard", "Revenue, jobs, failures, kiosk health, and alerts in one operational view.", `<button class="secondary-button">Export Summary</button>`)}
    ${adminNotice()}
    <div class="metrics-grid">
      ${dashboardMetrics().map(([label, value, detail]) => `
        <div class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${detail}</small>
        </div>
      `).join("")}
    </div>
    <div class="module-grid">
      <div class="module-card">
        <h2>Failure Safe Queue</h2>
        <div class="health-list">
          ${renderHealthRow("Payment success print failed", `${failedJobs.length} job(s)`, failedJobs.length ? "warn" : "good")}
          ${renderHealthRow("Active print queue", `${queuedJobs.length} job(s)`, queuedJobs.length ? "warn" : "good")}
          ${renderHealthRow("Backend", state.adminData.backendOnline ? "Online" : "Offline", state.adminData.backendOnline ? "good" : "bad")}
        </div>
      </div>
      <div class="module-card">
        <h2>Latest Alerts</h2>
        <div class="info-list">
          ${(alerts.length ? alerts : ["No live alerts"]).map((alert) => `<div class="info-row"><span>${escapeHtml(alert)}</span><strong>${alerts.length ? "Open" : "OK"}</strong></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderRevenue() {
  const revenue = state.adminData.revenue || {};
  const jobs = liveJobs().map(jobRow);
  const serviceTotals = jobs.reduce((totals, job) => {
    if (/success/i.test(job.payment)) {
      const key = `${job.kiosk}|${job.branch}|${job.service}`;
      totals[key] = totals[key] || {
        kiosk: job.kiosk,
        branch: job.branch,
        service: job.service,
        gross: 0,
        refund: 0
      };
      totals[key].gross += job.amount;
    }
    return totals;
  }, {});
  const rows = Object.values(serviceTotals).map((row) => [
    "Today",
    row.kiosk,
    row.branch,
    row.service,
    money(row.gross),
    money(row.refund),
    money(row.gross - row.refund)
  ]);

  return `
    ${renderAdminHeader("Revenue", "Daily, monthly, kiosk-wise, branch-wise, service-wise, refund, gross, and net revenue.", `<button class="secondary-button">Download CSV</button><button class="secondary-button">Download PDF</button>`)}
    ${adminNotice()}
    ${renderFilters()}
    <div class="metrics-grid">
      <div class="metric-card"><span>Gross Revenue</span><strong>${money(revenue.gross || 0)}</strong><small>Backend payments</small></div>
      <div class="metric-card"><span>Refunds</span><strong>${money(revenue.refunds || 0)}</strong><small>${state.adminData.refunds.length} refund record(s)</small></div>
      <div class="metric-card"><span>Net Revenue</span><strong>${money(revenue.net || 0)}</strong><small>After refunds</small></div>
      <div class="metric-card"><span>Transactions</span><strong>${state.adminData.payments.length}</strong><small>Razorpay records</small></div>
    </div>
    ${renderTable(["Range", "Kiosk", "Branch", "Service", "Gross", "Refund", "Net"], rows.length ? rows : emptyRows("No paid jobs have been recorded yet.", 7))}
  `;
}

function renderHistory() {
  const rows = liveJobs().map(jobRow).map((job) => [
    job.id,
    job.date,
    job.kiosk,
    job.branch,
    job.file,
    job.pages,
    job.copies,
    money(job.amount),
    job.payment,
    job.print,
    job.print.includes("Failed") ? "Retry / Refund" : "Receipt"
  ]);

  return `
    ${renderAdminHeader("Print History", "Every job has payment status, print status, retry, refund, and receipt actions.", `<button class="secondary-button">Export History</button>`)}
    ${adminNotice()}
    ${renderFilters()}
    ${renderTable(["Job ID", "Date", "Kiosk", "Branch", "File", "Pages", "Copies", "Amount", "Payment", "Print", "Action"], rows.length ? rows : emptyRows("No backend print jobs yet. Complete a real payment/print flow to populate this table.", 11))}
  `;
}

function renderTransactions() {
  const rows = state.adminData.payments.map(paymentRow).map((payment) => [
    payment.time,
    payment.jobId,
    payment.gatewayId,
    payment.upiRef,
    money(payment.amount),
    payment.payment,
    payment.print
  ]);

  return `
    ${renderAdminHeader("Daily Transactions", "Payment reconciliation by gateway transaction, UPI reference, job, amount, and status.")}
    ${adminNotice()}
    ${renderTable(["Time", "Job ID", "Gateway ID", "UPI Ref", "Amount", "Payment", "Print"], rows.length ? rows : emptyRows("No Razorpay transaction records yet.", 7))}
  `;
}

function renderSystemStatus() {
  const kiosk = state.adminData.kiosks[0] || {};

  return `
    ${renderAdminHeader("System Status", "Live kiosk, printer, scanner, internet, UPS, local agent, and app health.")}
    ${adminNotice()}
    <div class="module-grid">
      <div class="module-card">
        <h2>${escapeHtml(kiosk.kioskId || "Local Kiosk")}</h2>
        <div class="health-list">
          ${renderHealthRow("Kiosk", kiosk.status || "Unknown", kiosk.status === "online" ? "good" : "warn")}
          ${renderHealthRow("Backend", state.adminData.backendOnline ? "Online" : "Offline", state.adminData.backendOnline ? "good" : "bad")}
          ${renderHealthRow("Printer", state.printer.online ? state.printer.name : "Offline", state.printer.online ? "good" : "bad")}
          ${renderHealthRow("Scanner", state.printer.scanner, "good")}
          ${renderHealthRow("Paper", state.printer.paper, state.printer.paper === "Ready" ? "good" : "warn")}
          ${renderHealthRow("Toner", state.printer.toner, state.printer.toner === "Ready" ? "good" : "warn")}
          ${renderHealthRow("Agent", state.printer.agent, state.printer.agent === "Running" ? "good" : "bad")}
        </div>
      </div>
      <div class="module-card">
        <h2>Device Detail</h2>
        <div class="health-list">
          ${renderHealthRow("Printer status", state.printer.statusText, state.printer.online ? "good" : "bad")}
          ${renderHealthRow("Queue", `${state.printer.queue} waiting`, state.printer.queue < 5 ? "good" : "warn")}
          ${renderHealthRow("Internet", state.printer.internet, "good")}
          ${renderHealthRow("App Version", kiosk.appVersion || "1.0.0", "good")}
          ${renderHealthRow("Expected Agent Port", String(state.adminData.localAgentExpectedPort || 5077), "good")}
        </div>
      </div>
    </div>
  `;
}

function renderReports() {
  const reports = state.adminData.reports.length
    ? state.adminData.reports
    : ["daily-sales", "failed-transactions", "refunds", "maintenance"];

  return `
    ${renderAdminHeader("Reports", "Generate PDF, Excel, and CSV reports for accounts, support, and maintenance.", `<button class="primary-button">Generate Report</button>`)}
    ${adminNotice()}
    <div class="module-grid">
      ${reports.map((report) => `
        <div class="module-card">
          <h2>${escapeHtml(String(report).replace(/-/g, " "))}</h2>
          <p class="helper-text">Uses live backend jobs, transactions, refunds, and kiosk records.</p>
          <div class="flow-actions">
            <button class="secondary-button">PDF</button>
            <button class="secondary-button">Excel</button>
            <button class="secondary-button">CSV</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function serviceTemplatesText(service) {
  return (service.templates || [])
    .map((template) => `${template.title} | ${template.pages} | ${template.description} | ${(template.fields || []).join(", ")}${template.imageUrl ? ` | ${template.imageUrl}` : ""}`)
    .join("\n");
}

function parseServiceTemplates(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const [title, pages, description, fields, imageUrl] = line.split("|").map((part) => part?.trim() || "");
      if (!title) return null;

      return {
        id: slug(title, `template-${index + 1}`),
        title,
        pages: Math.max(1, Number(pages) || 1),
        description: description || "Blank printable template.",
        fields: normalizeTemplateFields(fields || "Applicant, Address, Mobile, Purpose, Signature"),
        imageUrl: imageUrl || ""
      };
    })
    .filter(Boolean);
}

function renderServiceImageControl(service) {
  return `
    <label class="setting-field service-image-field">Service Image
      <div class="admin-image-row">
        ${serviceMediaMarkup(service, "admin-image-preview")}
        <div class="admin-image-controls">
          <input value="${escapeHtml(service.imageUrl || "")}" placeholder="https://... or uploaded image URL" data-service-field="${escapeHtml(service.id)}" data-field="imageUrl" />
          <input type="file" accept="image/*" data-service-image="${escapeHtml(service.id)}" />
        </div>
      </div>
    </label>
  `;
}

function renderDraftServiceImageControl(service) {
  return `
    <label class="setting-field service-image-field">Service Image
      <div class="admin-image-row">
        ${serviceMediaMarkup(service, "admin-image-preview")}
        <div class="admin-image-controls">
          <input value="${escapeHtml(service.imageUrl || "")}" placeholder="https://... or uploaded image URL" data-service-draft-field="imageUrl" />
          <input type="file" accept="image/*" data-draft-service-image />
        </div>
      </div>
    </label>
  `;
}

function renderTemplateImagePreview(template, service) {
  return imagePreviewMarkup(template.imageUrl || "", service.icon || "FM", "admin-image-preview");
}

function serviceModeLabel(service) {
  return service.mode === "template" ? "Form service" : "QR upload service";
}

function renderServiceHierarchySummary() {
  const templateServices = services.filter((service) => service.mode === "template");
  const uploadServices = services.filter((service) => service.mode !== "template");

  return `
    <div class="service-hierarchy-board">
      <div class="service-hierarchy-group">
        <div class="service-hierarchy-title">
          <h2>Form Services</h2>
          <span>${templateServices.length} service${templateServices.length === 1 ? "" : "s"}</span>
        </div>
        <div class="service-hierarchy-list">
          ${(templateServices.length ? templateServices : []).map((service) => renderServiceHierarchyRow(service)).join("") || `<div class="empty-note">No form services yet. Change a service mode to Form templates to add forms.</div>`}
        </div>
      </div>
      <div class="service-hierarchy-group">
        <div class="service-hierarchy-title">
          <h2>Upload Services</h2>
          <span>${uploadServices.length} service${uploadServices.length === 1 ? "" : "s"}</span>
        </div>
        <div class="service-hierarchy-list">
          ${(uploadServices.length ? uploadServices : []).map((service) => renderServiceHierarchyRow(service)).join("") || `<div class="empty-note">No QR upload services configured.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderServiceHierarchyRow(service) {
  const templates = service.templates || [];
  const childText = service.mode === "template"
    ? `${templates.length} form${templates.length === 1 ? "" : "s"}`
    : "Mobile QR document upload";

  return `
    <div class="service-hierarchy-row">
      ${serviceMediaMarkup(service, "service-hierarchy-icon")}
      <div class="service-hierarchy-main">
        <div class="service-hierarchy-parent">
          <strong>${escapeHtml(service.title)}</strong>
          <span>${escapeHtml(service.id)} | ${escapeHtml(serviceModeLabel(service))}</span>
        </div>
        <div class="service-hierarchy-children">
          ${service.mode === "template" && templates.length
            ? templates.map((template) => `<span>${escapeHtml(template.title)}</span>`).join("")
            : `<span>${escapeHtml(childText)}</span>`}
        </div>
      </div>
      <span class="badge ${service.enabled ? "good" : "bad"}">${service.enabled ? "Enabled" : "Off"}</span>
    </div>
  `;
}

function renderTemplateEditor(service) {
  const templates = service.templates?.length
    ? service.templates
    : [{ id: "sample-form", title: "Sample Form", description: "Blank printable template.", pages: 1, fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"], imageUrl: "" }];

  return `
    <div class="template-editor-section">
      <div class="template-editor-header">
        <div>
          <h3>Forms under ${escapeHtml(service.title)}</h3>
          <p class="helper-text">These forms appear only inside this parent service on the customer kiosk.</p>
        </div>
        <button class="secondary-button" data-template-add="${escapeHtml(service.id)}">Add Template</button>
      </div>
      <div class="template-editor-list">
        ${templates.map((template, index) => `
          <div class="template-editor-card">
            <div class="template-editor-top">
              ${renderTemplateImagePreview(template, service)}
              <div>
                <h4>Form ${index + 1}: ${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
                <p class="helper-text">${escapeHtml(template.id || `template-${index + 1}`)} | ${escapeHtml(template.imageUrl ? "Image ready" : "No image selected")}</p>
              </div>
              <button class="danger-button" data-template-delete="${escapeHtml(service.id)}" data-template-index="${index}" ${templates.length <= 1 ? "disabled" : ""}>Remove</button>
            </div>
            <div class="settings-grid service-editor-grid">
              <label class="setting-field">Template Name
                <input value="${escapeHtml(template.title || "")}" data-template-field="${escapeHtml(service.id)}" data-template-index="${index}" data-field="title" />
              </label>
              <label class="setting-field">Pages
                <input type="number" min="1" max="20" value="${Number(template.pages || 1)}" data-template-field="${escapeHtml(service.id)}" data-template-index="${index}" data-field="pages" />
              </label>
              <label class="setting-field">Description
                <input value="${escapeHtml(template.description || "")}" data-template-field="${escapeHtml(service.id)}" data-template-index="${index}" data-field="description" />
              </label>
              <label class="setting-field">Fields
                <input value="${escapeHtml((template.fields || []).join(", "))}" data-template-field="${escapeHtml(service.id)}" data-template-index="${index}" data-field="fields" />
              </label>
              <label class="setting-field">Image URL
                <input value="${escapeHtml(template.imageUrl || "")}" placeholder="https://... or uploaded image URL" data-template-field="${escapeHtml(service.id)}" data-template-index="${index}" data-field="imageUrl" />
              </label>
              <label class="setting-field">Upload Image
                <input type="file" accept="image/*" data-template-image="${escapeHtml(service.id)}" data-template-index="${index}" />
              </label>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSimpleServiceForms(service) {
  const templates = service.templates || [];

  if (service.mode !== "template") {
    return `
      <div class="simple-form-list upload-only">
        <div class="simple-form-title">Forms under this service</div>
        <div class="simple-form-empty">No forms. Customer uses QR upload for PDF, DOC, image, and other supported documents.</div>
      </div>
    `;
  }

  return `
    <div class="simple-form-list">
      <div class="simple-form-title">Forms under this service</div>
      ${templates.length ? templates.map((template, index) => `
        <div class="simple-form-row">
          <span class="simple-form-index">${index + 1}</span>
          <div>
            <strong>${escapeHtml(template.title)}</strong>
            <p>${escapeHtml(template.description || "Blank printable template.")}</p>
          </div>
          <span>${Number(template.pages || 1)} page${Number(template.pages || 1) === 1 ? "" : "s"}</span>
        </div>
      `).join("") : `<div class="simple-form-empty">No forms added yet. Edit this service to create forms.</div>`}
    </div>
  `;
}

function renderServicesAdmin() {
  return `
    ${renderAdminHeader("Service Management", "Services are listed first. Forms appear underneath their parent service. Open a service to create or update details.", `<button class="primary-button" data-action="add-service">Create Service</button><button class="secondary-button" data-action="save-services">Save Changes</button>`)}
    ${state.servicesDirty ? `<div class="save-note">Unsaved service changes. Use Save Services to publish them to the kiosk backend.</div>` : ""}
    ${state.pricingSaveStatus ? `<div class="save-note">${escapeHtml(state.pricingSaveStatus)}</div>` : ""}
    ${adminNotice()}
    <div class="simple-service-list">
      ${services.map((service) => {
        const rates = serviceRates(service.id);
        return `
          <div class="module-card simple-service-card">
            <div class="simple-service-head">
              <div class="simple-service-title">
                ${serviceMediaMarkup(service, "simple-service-icon")}
                <div>
                  <h2>${escapeHtml(service.title)}</h2>
                  <p class="helper-text">${escapeHtml(service.id)} | ${escapeHtml(serviceModeLabel(service))}</p>
                </div>
              </div>
              <div class="simple-service-actions">
                <span class="badge ${service.enabled ? "good" : "bad"}">${service.enabled ? "Enabled" : "Off"}</span>
                <button class="secondary-button" data-service-edit="${escapeHtml(service.id)}">Edit</button>
                <button class="danger-button" data-service-delete="${escapeHtml(service.id)}">Remove</button>
              </div>
            </div>
            <div class="simple-service-meta">
              <span>B/W <strong>${money(rates.bw)}</strong></span>
              <span>Color <strong>${money(rates.color)}</strong></span>
              <span>Kiosks <strong>${service.kioskIds?.length ? escapeHtml(service.kioskIds.join(", ")) : "All"}</strong></span>
              <span>Forms <strong>${(service.templates || []).length}</strong></span>
            </div>
            ${service.description ? `<p class="helper-text simple-service-description">${escapeHtml(service.description)}</p>` : ""}
            ${renderSimpleServiceForms(service)}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderServiceDraftTemplateEditor(service) {
  const templates = service.templates || [];

  return `
    <div class="template-editor-section">
      <div class="template-editor-header">
        <div>
          <h3>Forms under ${escapeHtml(service.title || "this service")}</h3>
          <p class="helper-text">Add or update the forms that belong to this service.</p>
        </div>
        <button class="secondary-button" data-draft-template-add>Add Form</button>
      </div>
      <div class="template-editor-list">
        ${templates.length ? templates.map((template, index) => `
          <div class="template-editor-card">
            <div class="template-editor-top">
              ${renderTemplateImagePreview(template, service)}
              <div>
                <h4>Form ${index + 1}: ${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
                <p class="helper-text">${escapeHtml(template.id || `template-${index + 1}`)}</p>
              </div>
              <button class="danger-button" data-draft-template-delete="${index}">Remove Form</button>
            </div>
            <div class="settings-grid service-editor-grid">
              <label class="setting-field">Form Name
                <input value="${escapeHtml(template.title || "")}" data-template-draft-index="${index}" data-template-draft-field="title" />
              </label>
              <label class="setting-field">Pages
                <input type="number" min="1" max="20" value="${Number(template.pages || 1)}" data-template-draft-index="${index}" data-template-draft-field="pages" />
              </label>
              <label class="setting-field">Description
                <input value="${escapeHtml(template.description || "")}" data-template-draft-index="${index}" data-template-draft-field="description" />
              </label>
              <label class="setting-field">Fields
                <input value="${escapeHtml((template.fields || []).join(", "))}" data-template-draft-index="${index}" data-template-draft-field="fields" />
              </label>
              <label class="setting-field">Image URL
                <input value="${escapeHtml(template.imageUrl || "")}" placeholder="https://... or uploaded image URL" data-template-draft-index="${index}" data-template-draft-field="imageUrl" />
              </label>
              <label class="setting-field">Upload Image
                <input type="file" accept="image/*" data-draft-template-image data-template-draft-index="${index}" />
              </label>
            </div>
          </div>
        `).join("") : `<div class="empty-note">No forms yet. Use Add Form to create the first form for this service.</div>`}
      </div>
    </div>
  `;
}

function renderServiceEditorPage() {
  const editor = state.serviceEditor;
  if (!editor) return renderServicesAdmin();
  const service = editor.draft;
  const rates = service.pricing || { bw: 0, color: 0 };
  const title = editor.mode === "create" ? "Create Service" : "Edit Service";

  return `
    ${renderAdminHeader(title, "Update service details on this page, then save to return to the Services list.", `<button class="ghost-button" data-action="cancel-service-editor">Back to Services</button><button class="primary-button" data-action="save-service-editor">Save Service</button>`)}
    ${state.pricingSaveStatus ? `<div class="save-note">${escapeHtml(state.pricingSaveStatus)}</div>` : ""}
    <div class="module-card service-editor-page">
      <div class="service-admin-head">
        <div class="service-admin-title">
          ${serviceMediaMarkup(service, "admin-image-preview")}
          <div>
            <h2>${escapeHtml(service.title || "New Service")}</h2>
            <p class="helper-text">${escapeHtml(service.id || "new-service")} | ${escapeHtml(serviceModeLabel(service))}</p>
          </div>
        </div>
      </div>
      <div class="settings-grid service-editor-grid">
        <label class="setting-field">Service ID
          <input value="${escapeHtml(service.id || "")}" data-service-draft-field="id" ${editor.mode === "edit" ? "disabled" : ""} />
        </label>
        <label class="setting-field">Enabled
          <select data-service-draft-field="enabled">
            <option value="true" ${service.enabled !== false ? "selected" : ""}>Yes</option>
            <option value="false" ${service.enabled === false ? "selected" : ""}>No</option>
          </select>
        </label>
        <label class="setting-field">Mode
          <select data-service-draft-field="mode">
            <option value="upload" ${service.mode === "upload" ? "selected" : ""}>QR upload / image upload</option>
            <option value="template" ${service.mode === "template" ? "selected" : ""}>Form templates</option>
          </select>
        </label>
        <label class="setting-field">Icon
          <input value="${escapeHtml(service.icon || "")}" data-service-draft-field="icon" />
        </label>
        <label class="setting-field">Service Name
          <input value="${escapeHtml(service.title || "")}" data-service-draft-field="title" />
        </label>
        <label class="setting-field">Description
          <input value="${escapeHtml(service.description || "")}" data-service-draft-field="description" />
        </label>
        <label class="setting-field">Kiosk IDs
          <input value="${escapeHtml((service.kioskIds || []).join(", "))}" placeholder="KIOSK-1, KIOSK-2 (blank = all)" data-service-draft-field="kioskIds" />
        </label>
        <label class="setting-field">B/W Rate
          <input type="number" min="0" value="${rates.bw || 0}" data-service-draft-field="bw" />
        </label>
        <label class="setting-field">Color Rate
          <input type="number" min="0" value="${rates.color || 0}" data-service-draft-field="color" />
        </label>
        ${renderDraftServiceImageControl(service)}
      </div>
      ${service.mode === "template" ? renderServiceDraftTemplateEditor(service) : `
        <div class="template-editor-section">
          <div class="template-editor-header">
            <div>
              <h3>Upload Service</h3>
              <p class="helper-text">This service will show QR upload to customers. Change mode to Form templates if it should contain forms.</p>
            </div>
          </div>
        </div>
      `}
      <div class="flow-actions">
        <button class="primary-button" data-action="save-service-editor">Save Service</button>
        <button class="ghost-button" data-action="cancel-service-editor">Cancel</button>
      </div>
    </div>
  `;
}

function renderPricing() {
  return `
    ${renderAdminHeader("Pricing Management", "Set page-wise B/W and color rates for each customer service.", `<button class="primary-button" data-action="save-pricing">Save Pricing</button>`)}
    ${state.pricingSaveStatus ? `<div class="save-note">${escapeHtml(state.pricingSaveStatus)}</div>` : ""}
    <div class="settings-grid pricing-settings-grid">
      ${services.map((service) => {
        const rates = serviceRates(service.id);

        return `
          <div class="setting-field service-pricing-card">
            <div>
              <h2>${escapeHtml(service.title)}</h2>
              <p class="helper-text">${escapeHtml(service.description)}</p>
            </div>
            <label for="price-${service.id}-bw">B/W per page</label>
            <input id="price-${service.id}-bw" type="number" min="0" value="${rates.bw}" data-service-price="${service.id}" data-price-key="bw" />
            <label for="price-${service.id}-color">Color per page</label>
            <input id="price-${service.id}-color" type="number" min="0" value="${rates.color}" data-service-price="${service.id}" data-price-key="color" />
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadPricingSettings() {
  if (state.mode === "customer") {
    try {
      const configResponse = await fetch(`${BACKEND_URL}/api/kiosk/config?kioskId=${encodeURIComponent(KIOSK_ID)}`, { cache: "no-store" });

      if (configResponse.ok) {
        applyServiceConfig(await configResponse.json(), { rerender: true, source: "manual" });
      }
    } catch {
      // The kiosk can still use locally stored pricing if the backend is offline.
    }
    return;
  }

  if (!state.adminAuthed) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/pricing`, {
      cache: "no-store",
      headers: adminAuthHeaders()
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (Array.isArray(payload.services) && !state.servicesDirty) {
      applyServiceConfig(payload, { rerender: false, source: "admin" });
    }
    if (!state.servicesDirty) {
      state.pricing = normalizePricing(payload.pricing);
      storePricing();
      storeConfigMeta(payload.config || {});
      render();
    }
  } catch {
    // The kiosk can still use locally stored pricing if the backend is offline.
  }
}

async function savePricingSettings() {
  syncPricingDraftFromDom();
  state.pricing = normalizePricing(state.pricing);
  storePricing();
  state.pricingSaveStatus = "Saving pricing...";
  render();

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/pricing`, {
      method: "POST",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(state.pricing)
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Backend pricing save failed.");
    }

    state.pricing = normalizePricing(payload.pricing);
    storeConfigMeta(payload.config || {});
    storePricing();
    state.pricingSaveStatus = "Pricing saved for all services.";
  } catch (error) {
    state.pricingSaveStatus = `${error.message || "Backend pricing service is offline."} Local kiosk pricing is saved.`;
  }

  render();
}

function syncPricingDraftFromDom() {
  document.querySelectorAll("[data-service-price][data-price-key]").forEach((input) => {
    const serviceId = input.dataset.servicePrice;
    const priceKey = input.dataset.priceKey;
    state.pricing = normalizePricing(state.pricing);
    if (state.pricing[serviceId]) {
      state.pricing[serviceId][priceKey] = numericPrice(input.value, 0);
    }
  });
}

function updateServiceField(serviceId, field, value) {
  services = services.map((service) => {
    if (service.id !== serviceId) return service;

    const next = { ...service };

    if (field === "enabled") {
      next.enabled = value === true || value === "true";
    } else if (field === "mode") {
      next.mode = value === "template" ? "template" : "upload";
      next.templates = next.mode === "template" && !next.templates.length
        ? [{ id: "sample-form", title: "Sample Form", description: "Blank printable template.", pages: 1, fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"] }]
        : next.templates;
    } else if (field === "kioskIds") {
      next.kioskIds = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (field === "bw" || field === "color") {
      next.pricing = {
        ...next.pricing,
        [field]: numericPrice(value, 0)
      };
      state.pricing = {
        ...state.pricing,
        [serviceId]: {
          ...(state.pricing[serviceId] || next.pricing),
          [field]: numericPrice(value, 0)
        }
      };
    } else if (field === "templates") {
      next.templates = parseServiceTemplates(value);
    } else if (field === "icon") {
      next.icon = String(value || "SV").trim().toUpperCase().slice(0, 3);
    } else if (field === "imageUrl") {
      next.imageUrl = String(value || "").trim();
    } else if (["title", "description"].includes(field)) {
      next[field] = String(value || "").trimStart();
    }

    return next;
  });

  storeServices();
  storePricing();
  markServicesDirty("");
}

function defaultServiceDraft() {
  const id = `custom-service-${Date.now().toString().slice(-5)}`;

  return {
    id,
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
  };
}

function openServiceEditor(serviceId) {
  const service = services.find((item) => item.id === serviceId);
  if (!service) return;

  state.serviceEditor = {
    mode: "edit",
    originalId: serviceId,
    draft: JSON.parse(JSON.stringify({
      ...service,
      pricing: state.pricing[service.id] || service.pricing || { bw: 0, color: 0 },
      templates: service.templates || []
    }))
  };
  state.adminPage = "service-editor";
  state.pricingSaveStatus = "";
  render();
}

function openCreateServiceEditor() {
  state.serviceEditor = {
    mode: "create",
    originalId: null,
    draft: defaultServiceDraft()
  };
  state.adminPage = "service-editor";
  state.pricingSaveStatus = "";
  render();
}

function closeServiceEditor() {
  state.serviceEditor = null;
  state.adminPage = "services";
  state.pricingSaveStatus = "";
  render();
}

function updateServiceDraftField(field, value) {
  const editor = state.serviceEditor;
  if (!editor) return;

  const draft = editor.draft;

  if (field === "enabled") {
    draft.enabled = value === true || value === "true";
  } else if (field === "mode") {
    draft.mode = value === "template" ? "template" : "upload";
    if (draft.mode === "template" && !draft.templates.length) {
      draft.templates = [{
        id: "sample-form",
        title: "Sample Form",
        description: "Blank printable template.",
        pages: 1,
        fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
        imageUrl: ""
      }];
    }
  } else if (field === "kioskIds") {
    draft.kioskIds = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  } else if (field === "bw" || field === "color") {
    draft.pricing = {
      ...(draft.pricing || {}),
      [field]: numericPrice(value, 0)
    };
  } else if (field === "icon") {
    draft.icon = String(value || "SV").trim().toUpperCase().slice(0, 3);
  } else if (field === "id") {
    draft.id = slug(value, "service");
  } else if (["title", "description", "imageUrl"].includes(field)) {
    draft[field] = String(value || "").trimStart();
  }
}

function updateServiceDraftTemplateField(templateIndex, field, value) {
  const editor = state.serviceEditor;
  if (!editor) return;

  const templates = editor.draft.templates || [];
  const existing = templates[templateIndex];
  if (!existing) return;

  if (field === "title") {
    existing.title = String(value || "").trimStart();
    existing.id = existing.id || slug(existing.title, `template-${templateIndex + 1}`);
  } else if (field === "pages") {
    existing.pages = Math.max(1, Math.min(20, Number(value) || 1));
  } else if (field === "description") {
    existing.description = String(value || "").trimStart();
  } else if (field === "fields") {
    existing.fields = normalizeTemplateFields(value);
  } else if (field === "imageUrl") {
    existing.imageUrl = String(value || "").trim();
  }
}

function addDraftTemplate() {
  const editor = state.serviceEditor;
  if (!editor) return;

  const templates = editor.draft.templates || [];
  const title = `Template ${templates.length + 1}`;
  templates.push({
    id: slug(title, `template-${templates.length + 1}`),
    title,
    description: "Blank printable template.",
    pages: 1,
    fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
    imageUrl: ""
  });
  editor.draft.templates = templates;
  editor.draft.mode = "template";
  render();
}

function removeDraftTemplate(templateIndex) {
  const editor = state.serviceEditor;
  if (!editor) return;

  editor.draft.templates = (editor.draft.templates || []).filter((_, index) => index !== templateIndex);
  render();
}

async function saveServiceEditor() {
  const editor = state.serviceEditor;
  if (!editor) return;

  syncServiceEditorDraftFromDom();
  const normalized = normalizeServicesConfig([editor.draft])[0];

  if (!normalized.title) {
    state.pricingSaveStatus = "Service name is required.";
    render();
    return;
  }

  const duplicate = services.some((service) => service.id === normalized.id && service.id !== editor.originalId);
  if (duplicate) {
    state.pricingSaveStatus = "Another service already uses this service ID.";
    render();
    return;
  }

  if (editor.mode === "create") {
    services = [...services, normalized];
  } else {
    services = services.map((service) => service.id === editor.originalId ? normalized : service);
  }

  const nextPricing = { ...state.pricing };
  if (editor.originalId && editor.originalId !== normalized.id) {
    delete nextPricing[editor.originalId];
  }
  nextPricing[normalized.id] = normalized.pricing;
  state.pricing = nextPricing;
  state.serviceEditor = null;
  state.adminPage = "services";
  storeServices();
  storePricing();
  markServicesDirty("Saving service...");
  await saveServicesSettings();
}

function updateServiceTemplateField(serviceId, templateIndex, field, value) {
  services = services.map((service) => {
    if (service.id !== serviceId) return service;

    const templates = [...(service.templates || [])];
    const existing = templates[templateIndex] || {
      id: `template-${templateIndex + 1}`,
      title: `Template ${templateIndex + 1}`,
      description: "Blank printable template.",
      pages: 1,
      fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
      imageUrl: ""
    };
    const next = { ...existing };

    if (field === "title") {
      next.title = String(value || "").trimStart();
      next.id = next.id || slug(next.title, `template-${templateIndex + 1}`);
    } else if (field === "pages") {
      next.pages = Math.max(1, Math.min(20, Number(value) || 1));
    } else if (field === "description") {
      next.description = String(value || "").trimStart();
    } else if (field === "fields") {
      next.fields = normalizeTemplateFields(value);
    } else if (field === "imageUrl") {
      next.imageUrl = String(value || "").trim();
    }

    templates[templateIndex] = next;

    return {
      ...service,
      mode: "template",
      templates
    };
  });

  storeServices();
  markServicesDirty("");
}

function addServiceTemplate(serviceId) {
  services = services.map((service) => {
    if (service.id !== serviceId) return service;

    const templates = [...(service.templates || [])];
    const title = `Template ${templates.length + 1}`;

    templates.push({
      id: slug(title, `template-${templates.length + 1}`),
      title,
      description: "Blank printable template.",
      pages: 1,
      fields: ["Applicant", "Address", "Mobile", "Purpose", "Signature"],
      imageUrl: ""
    });

    return {
      ...service,
      mode: "template",
      templates
    };
  });

  storeServices();
  markServicesDirty("Template added. Save services to update backend.");
  render();
}

function removeServiceTemplate(serviceId, templateIndex) {
  services = services.map((service) => {
    if (service.id !== serviceId) return service;

    const templates = [...(service.templates || [])];
    if (templates.length <= 1) return service;
    templates.splice(templateIndex, 1);

    return {
      ...service,
      templates
    };
  });

  storeServices();
  markServicesDirty("Template removed. Save services to update backend.");
  render();
}

async function uploadAdminImage(file, { serviceId, templateIndex = null, draft = false } = {}) {
  const validationError = validateAdminImageFile(file);

  if (validationError) {
    state.pricingSaveStatus = validationError;
    render();
    return;
  }

  state.imageUploadBusy = true;
  state.pricingSaveStatus = "Uploading image...";
  render();

  let imageUrl = "";
  let usedLocalFallback = false;

  try {
    const formData = new FormData();
    formData.append(templateIndex === null ? "serviceImage" : "templateImage", file, file.name);

    const response = await fetch(`${BACKEND_URL}/api/admin/service-image`, {
      method: "POST",
      headers: adminAuthHeaders(),
      body: formData
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Backend image upload failed.");
    }

    imageUrl = payload.imageUrl || "";
  } catch {
    try {
      imageUrl = await readFileAsDataUrl(file);
      usedLocalFallback = true;
    } catch (error) {
      state.imageUploadBusy = false;
      state.pricingSaveStatus = error.message || "Could not upload or read the selected image.";
      render();
      return;
    }
  }

  if (draft && templateIndex === null) {
    updateServiceDraftField("imageUrl", imageUrl);
  } else if (draft) {
    updateServiceDraftTemplateField(templateIndex, "imageUrl", imageUrl);
  } else if (templateIndex === null) {
    updateServiceField(serviceId, "imageUrl", imageUrl);
  } else {
    updateServiceTemplateField(serviceId, templateIndex, "imageUrl", imageUrl);
  }

  state.imageUploadBusy = false;
  if (draft) {
    state.pricingSaveStatus = usedLocalFallback
      ? "Image embedded locally because backend upload is unavailable."
      : "Image uploaded. Save this service to publish the change.";
  } else {
    markServicesDirty(usedLocalFallback
      ? "Image embedded locally because backend upload is unavailable. Save services when backend is online."
      : "Image uploaded. Save services to publish this change.");
  }
  render();
}

function addService() {
  const id = `custom-service-${Date.now().toString().slice(-5)}`;
  const service = {
    id,
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
  };

  services = [...services, service];
  state.pricing = {
    ...state.pricing,
    [id]: service.pricing
  };
  storeServices();
  storePricing();
  markServicesDirty("New service added. Edit details, then save services.");
  render();
}

function removeService(serviceId) {
  if (services.length <= 1) {
    state.pricingSaveStatus = "At least one service must remain.";
    render();
    return;
  }

  services = services.filter((service) => service.id !== serviceId);
  const nextPricing = { ...state.pricing };
  delete nextPricing[serviceId];
  state.pricing = nextPricing;
  storeServices();
  storePricing();
  markServicesDirty("Service removed. Save services to update backend.");
  render();
}

async function saveServicesSettings() {
  syncInlineServicesDraftFromDom();
  services = normalizeServicesConfig(services);
  state.pricing = normalizePricing(state.pricing);
  storeServices();
  storePricing();
  state.pricingSaveStatus = "Saving services...";
  render();

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/services`, {
      method: "POST",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ services, pricing: state.pricing })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Backend service save failed.");
    }

    services = normalizeServicesConfig(payload.services);
    state.pricing = normalizePricing(payload.pricing);
    state.servicesDirty = false;
    storeConfigMeta(payload.config || {});
    storeServices();
    storePricing();
    state.pricingSaveStatus = "Services saved for this kiosk project.";
  } catch (error) {
    state.pricingSaveStatus = `${error.message || "Backend service is offline."} Local service setup is saved.`;
  }

  render();
}

function syncInlineServicesDraftFromDom() {
  document.querySelectorAll("[data-service-field][data-field]").forEach((input) => {
    updateServiceField(input.dataset.serviceField, input.dataset.field, input.value);
  });
  document.querySelectorAll("[data-template-field][data-template-index][data-field]").forEach((input) => {
    updateServiceTemplateField(input.dataset.templateField, Number(input.dataset.templateIndex || 0), input.dataset.field, input.value);
  });
}

function syncServiceEditorDraftFromDom() {
  document.querySelectorAll("[data-service-draft-field]").forEach((input) => {
    updateServiceDraftField(input.dataset.serviceDraftField, input.value);
  });
  document.querySelectorAll("[data-template-draft-field][data-template-draft-index]").forEach((input) => {
    updateServiceDraftTemplateField(Number(input.dataset.templateDraftIndex || 0), input.dataset.templateDraftField, input.value);
  });
}

function pricingLabel(key) {
  return {
    bw: "B/W per page",
    color: "Color per page"
  }[key] || key;
}

function renderKiosks() {
  const jobs = liveJobs().map(jobRow);
  const rows = state.adminData.kiosks.map((kiosk) => {
    const kioskJobs = jobs.filter((job) => job.kiosk === kiosk.kioskId);
    const revenue = kioskJobs.reduce((sum, job) => sum + (/success/i.test(job.payment) ? job.amount : 0), 0);
    const errors = kioskJobs.filter((job) => /failed/i.test(job.print)).length;

    return [
      kiosk.kioskId || "",
      kiosk.name || "",
      kiosk.branch || "",
      state.printer.name || kiosk.printer || "Unknown",
      state.printer.scanner || kiosk.scanner || "Unknown",
      kiosk.status || "Unknown",
      money(revenue),
      String(errors),
      kiosk.setupCode || "",
      kiosk.activatedAt ? "Activated" : "Not activated",
      "Logs"
    ];
  });

  return `
    ${renderAdminHeader("Kiosk Management", "Create kiosk IDs first, then give the setup code to the installer for that mini-PC.", `<button class="secondary-button">Push Update</button>`)}
    ${adminNotice()}
    ${renderKioskCreatePanel()}
    ${renderTable(["Kiosk ID", "Name", "Branch", "Printer", "Scanner", "Status", "Revenue", "Errors", "Setup Code", "Activation", "Actions"], rows.length ? rows : emptyRows("No kiosk records returned by backend.", 11))}
  `;
}

function renderKioskCreatePanel() {
  return `
    <div class="module-card" style="margin-bottom: 16px;">
      <h2>Create Kiosk</h2>
      ${state.kioskCreateStatus ? `<div class="save-note">${escapeHtml(state.kioskCreateStatus)}</div>` : ""}
      <div class="settings-grid">
        <label class="setting-field">Kiosk ID
          <input value="${escapeHtml(state.kioskCreate.kioskId)}" placeholder="KIOSK-BANK-01" data-kiosk-create-field="kioskId" />
        </label>
        <label class="setting-field">Name
          <input value="${escapeHtml(state.kioskCreate.name)}" placeholder="Bank lobby kiosk" data-kiosk-create-field="name" />
        </label>
        <label class="setting-field">Branch
          <input value="${escapeHtml(state.kioskCreate.branch)}" placeholder="Main Branch" data-kiosk-create-field="branch" />
        </label>
        <label class="setting-field">Setup code
          <input value="${escapeHtml(state.kioskCreate.setupCode)}" placeholder="Auto if blank" data-kiosk-create-field="setupCode" />
        </label>
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-action="create-kiosk">Create Kiosk</button>
      </div>
    </div>
  `;
}

function renderRefunds() {
  const rows = state.adminData.refunds.map((refund) => [
    refund.refundId || "",
    refund.jobId || "",
    refund.paymentId || "",
    money(refund.amount || 0),
    refund.reason || "",
    refund.status || "",
    /pending/i.test(refund.status || "") ? "Approve / Reject" : "Receipt"
  ]);

  return `
    ${renderAdminHeader("Refund Management", "Refunds are created for print failed, duplicate payment, wrong print, or payment deducted without job.", `<button class="secondary-button">Export Refunds</button>`)}
    ${adminNotice()}
    ${renderTable(["Refund ID", "Job ID", "Payment ID", "Amount", "Reason", "Status", "Action"], rows.length ? rows : emptyRows("No refund requests have been created yet.", 7))}
  `;
}

function renderAlerts() {
  const failedJobs = liveJobs().map(jobRow).filter((job) => /failed/i.test(job.print));
  const pendingRefunds = state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || ""));
  const alerts = [
    ...(state.printer.online ? [] : [{ title: "Printer offline", detail: state.printer.statusText || "Printer is not ready", tone: "warn" }]),
    ...failedJobs.map((job) => ({ title: "Payment success but print failed", detail: `${job.id} ${job.file}`, tone: "warn" })),
    ...pendingRefunds.map((refund) => ({ title: "Refund request", detail: `${refund.refundId} ${money(refund.amount || 0)}`, tone: "warn" }))
  ];

  return `
    ${renderAdminHeader("Notifications", "Dashboard, email, SMS, and WhatsApp alerts can be wired here.")}
    ${adminNotice()}
    <div class="module-grid">
      ${(alerts.length ? alerts : [{ title: "No live alerts", detail: "Backend and local device checks are clear.", tone: "good" }]).map((alert) => `
        <div class="module-card">
          <h2>${escapeHtml(alert.title)}</h2>
          <p class="helper-text">${escapeHtml(alert.detail)}</p>
          <span class="badge ${alert.tone}">${alert.tone === "good" ? "OK" : "Open"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderHardware() {
  return `
    ${renderAdminHeader("Hardware Requirements", "Recommended kiosk hardware for banks, colleges, and high-volume locations.")}
    <div class="module-grid">
      <div class="module-card">
        <h2>Basic Setup</h2>
        <div class="info-list">
          <div class="info-row"><span>Touchscreen</span><strong>21 inch Full HD</strong></div>
          <div class="info-row"><span>Mini PC</span><strong>i3, 8 GB RAM, 256 GB SSD</strong></div>
          <div class="info-row"><span>Printer</span><strong>B/W laser</strong></div>
          <div class="info-row"><span>Scanner</span><strong>Flatbed</strong></div>
          <div class="info-row"><span>Power</span><strong>UPS + surge protector</strong></div>
        </div>
      </div>
      <div class="module-card">
        <h2>Professional Setup</h2>
        <div class="info-list">
          <div class="info-row"><span>Touchscreen</span><strong>24 inch anti-glare</strong></div>
          <div class="info-row"><span>Mini PC</span><strong>i5, 16 GB RAM, 512 GB SSD</strong></div>
          <div class="info-row"><span>Printer</span><strong>High duty B/W + color laser</strong></div>
          <div class="info-row"><span>Scanner</span><strong>ADF scanner</strong></div>
          <div class="info-row"><span>Network</span><strong>LAN + 4G backup</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filters">
      <input placeholder="Search job, kiosk, branch" value="${state.filters.table}" data-filter="table" />
      <select data-filter="status">
        <option value="all" ${state.filters.status === "all" ? "selected" : ""}>All statuses</option>
        <option value="success" ${state.filters.status === "success" ? "selected" : ""}>Success</option>
        <option value="failed" ${state.filters.status === "failed" ? "selected" : ""}>Failed</option>
        <option value="refund" ${state.filters.status === "refund" ? "selected" : ""}>Refund</option>
      </select>
      <input type="date" value="2026-06-07" />
      <button class="secondary-button">Apply</button>
    </div>
  `;
}

function renderTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindEvents() {
  const app = qs("#app");
  app.onclick = handleClick;
  app.onchange = handleChange;
  app.oninput = handleInput;
}

function syncAdminLoginDraftFromDom() {
  const emailInput = document.querySelector("[data-admin-login-field='email']");
  const passwordInput = document.querySelector("[data-admin-login-field='password']");

  if (emailInput) {
    state.adminLoginDraft.email = emailInput.value;
  }

  if (passwordInput) {
    state.adminLoginDraft.password = passwordInput.value;
  }
}

async function adminLogin() {
  syncAdminLoginDraftFromDom();
  const email = state.adminLoginDraft.email.trim();
  const password = state.adminLoginDraft.password;

  if (!email || !password) {
    state.adminLoginError = "Enter admin email and password.";
    render();
    return;
  }

  try {
    const payload = await fetchJson(`${BACKEND_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    state.adminAuthed = true;
    state.adminToken = payload.token || "";
    state.adminAccount = payload.admin || null;
    state.adminLoginError = "";
    state.adminLoginDraft.password = "";
    render();
    loadAdminData();
    startAdminPolling();
  } catch (error) {
    state.adminAuthed = false;
    state.adminToken = "";
    state.adminAccount = null;
    state.adminLoginError = error.message || "Admin login failed.";
    render();
  }
}

async function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }

  if (target.disabled) {
    return;
  }

  if (target.dataset.service) {
    state.selectedService = target.dataset.service;
    state.step = 1;
    stopUploadPolling();
    clearCurrentFile();
    state.uploadSession = null;
    state.uploadError = "";
    state.printError = "";
    state.printStatusMessage = "";
    state.printJob = null;
    state.paymentStatus = "Pending";
    state.paymentStatusMessage = "";
    state.paymentError = "";
    state.paymentOrder = null;
    state.paymentBusy = false;
    state.activeJobId = null;
    state.lastCompletedJob = null;
    render();

    if (!isFormTemplateService(target.dataset.service)) {
      startMobileUploadSession();
    }

    return;
  }

  if (target.dataset.adminPage) {
    state.adminPage = target.dataset.adminPage;
    state.serviceEditor = null;
    render();
    loadAdminData();
    return;
  }

  if (target.dataset.serviceEdit) {
    openServiceEditor(target.dataset.serviceEdit);
    return;
  }

  if (target.dataset.serviceDelete) {
    removeService(target.dataset.serviceDelete);
    return;
  }

  if (target.dataset.draftTemplateAdd !== undefined) {
    addDraftTemplate();
    return;
  }

  if (target.dataset.draftTemplateDelete !== undefined) {
    removeDraftTemplate(Number(target.dataset.draftTemplateDelete || 0));
    return;
  }

  if (target.dataset.templateAdd) {
    addServiceTemplate(target.dataset.templateAdd);
    return;
  }

  if (target.dataset.templateDelete) {
    removeServiceTemplate(target.dataset.templateDelete, Number(target.dataset.templateIndex || 0));
    return;
  }

  if (target.dataset.setting) {
    state.settings[target.dataset.setting] = target.dataset.value;
    render();
    return;
  }

  if (target.dataset.source) {
    if (!state.selectedService) {
      state.selectedService = "print";
    }

    revokePreviewUrl();
    state.file = createSourceFile(target.dataset.source);
    state.uploadError = "";
    state.step = 2;
    render();
    return;
  }

  if (target.dataset.template) {
    const template = formTemplatesForService().find((item) => item.id === target.dataset.template);

    if (!template) {
      return;
    }

    stopUploadPolling();
    revokePreviewUrl();
    state.file = createTemplateFile(template);
    state.uploadError = "";
    state.uploadSession = null;
    state.step = 2;
    render();
    return;
  }

  switch (target.dataset.action) {
    case "open-admin":
      window.location.href = `./admin.html${window.location.search || ""}`;
      break;
    case "open-admin-history":
      window.location.href = "./admin.html?adminPage=history";
      break;
    case "open-customer":
      window.location.href = `./index.html${window.location.search || ""}`;
      break;
    case "open-super-admin":
      window.location.href = `./super-admin.html${window.location.search || ""}`;
      break;
    case "create-kiosk":
      await createAdminKiosk();
      break;
    case "admin-logout":
      state.adminAuthed = false;
      state.adminToken = "";
      state.adminAccount = null;
      stopAdminPolling();
      openAdmin();
      break;
    case "reset-session":
    case "finish-session":
      resetCustomer();
      render();
      break;
    case "prev-step":
      if (state.step <= 1) {
        stopUploadPolling();
        state.step = 0;
        state.uploadSession = null;
        state.uploadError = "";
      } else {
        state.step = Math.max(0, state.step - 1);
      }
      render();
      break;
    case "next-step":
      goToNextStep();
      break;
    case "zoom-in":
      state.previewZoom = Math.min(1.2, state.previewZoom + 0.1);
      render();
      break;
    case "zoom-out":
      state.previewZoom = 1;
      render();
      break;
    case "delete-file":
      clearCurrentFile();
      state.step = 1;
      if (!isFormTemplateService()) {
        startMobileUploadSession();
      }
      render();
      break;
    case "refresh-printer":
      refreshPrinterStatus();
      break;
    case "refresh-upload":
      checkMobileUpload();
      break;
    case "new-upload-qr":
      clearCurrentFile();
      state.step = 1;
      if (!isFormTemplateService()) {
        startMobileUploadSession();
      }
      break;
    case "pay-razorpay":
      startRazorpayPayment();
      break;
    case "payment-failed":
      state.paymentStatus = "Failed";
      state.paymentStatusMessage = "";
      state.paymentError = "Payment was marked failed.";
      state.paymentBusy = false;
      state.step = 5;
      render();
      break;
    case "advance-print":
      advancePrint();
      render();
      break;
    case "print-failed":
      addJob("Payment Success Print Failed");
      state.printError = "Payment succeeded, but the printer did not complete the job.";
      syncBackendPrintStatus("Payment Success Print Failed", state.printError);
      render();
      break;
    case "retry-print":
      state.printError = "";
      state.printProgress = 0;
      state.printStatusMessage = "";
      state.step = 6;
      render();
      startLocalPrintJob();
      break;
    case "request-refund":
      state.alerts.unshift(`${currentJobId()} refund request created after print failure.`);
      state.printStatusMessage = "Refund request saved. Please contact kiosk staff for admin review.";
      render();
      break;
    case "admin-login":
      await adminLogin();
      break;
    case "save-pricing":
      savePricingSettings();
      break;
    case "save-services":
      saveServicesSettings();
      break;
    case "add-service":
      openCreateServiceEditor();
      break;
    case "cancel-service-editor":
      closeServiceEditor();
      break;
    case "save-service-editor":
      saveServiceEditor();
      break;
    default:
      break;
  }
}

async function handleChange(event) {
  const target = event.target;

  if (target.dataset.adminLoginField) {
    state.adminLoginDraft[target.dataset.adminLoginField] = target.value;
    state.adminLoginError = "";
    return;
  }

  if (target.dataset.draftServiceImage !== undefined && target.files?.length) {
    await uploadAdminImage(target.files[0], { draft: true });
    target.value = "";
    return;
  }

  if (target.dataset.draftTemplateImage !== undefined && target.files?.length) {
    await uploadAdminImage(target.files[0], {
      draft: true,
      templateIndex: Number(target.dataset.templateDraftIndex || 0)
    });
    target.value = "";
    return;
  }

  if (target.dataset.serviceImage && target.files?.length) {
    await uploadAdminImage(target.files[0], { serviceId: target.dataset.serviceImage });
    target.value = "";
    return;
  }

  if (target.dataset.templateImage && target.files?.length) {
    await uploadAdminImage(target.files[0], {
      serviceId: target.dataset.templateImage,
      templateIndex: Number(target.dataset.templateIndex || 0)
    });
    target.value = "";
    return;
  }

  if (target.id === "file-input" && target.files?.length) {
    if (!state.selectedService) {
      state.selectedService = "print";
    }

    const file = target.files[0];
    const result = createFileRecord(file.name, file.size, 1, file.type);

    if (result.error) {
      clearCurrentFile();
      state.uploadError = result.error;
      render();
      return;
    }

    revokePreviewUrl();

    if (["pdf", "image"].includes(result.file.previewKind)) {
      result.file.previewUrl = URL.createObjectURL(file);
    }

    state.file = result.file;
    state.uploadError = "";
    state.step = 2;
    render();
    return;
  }

  if (target.dataset.input) {
    state.settings[target.dataset.input] = target.value;
    render();
    return;
  }

  if (target.dataset.kioskCreateField) {
    state.kioskCreate[target.dataset.kioskCreateField] = target.dataset.kioskCreateField === "setupCode" || target.dataset.kioskCreateField === "kioskId"
      ? normalizeKioskId(target.value)
      : target.value;
    render();
    return;
  }

  if (target.dataset.serviceField && target.dataset.field) {
    updateServiceField(target.dataset.serviceField, target.dataset.field, target.value);
    render();
    return;
  }

  if (target.dataset.serviceDraftField) {
    updateServiceDraftField(target.dataset.serviceDraftField, target.value);
    render();
    return;
  }

  if (target.dataset.templateField && target.dataset.field) {
    updateServiceTemplateField(target.dataset.templateField, Number(target.dataset.templateIndex || 0), target.dataset.field, target.value);
    render();
    return;
  }

  if (target.dataset.templateDraftField) {
    updateServiceDraftTemplateField(Number(target.dataset.templateDraftIndex || 0), target.dataset.templateDraftField, target.value);
    render();
    return;
  }

  if (target.dataset.filter) {
    state.filters[target.dataset.filter] = target.value;
    render();
    return;
  }

  render();
}

function handleInput(event) {
  const target = event.target;

  if (target.dataset.input) {
    state.settings[target.dataset.input] = target.value;
  }

  if (target.dataset.adminLoginField) {
    state.adminLoginDraft[target.dataset.adminLoginField] = target.value;
    state.adminLoginError = "";
    return;
  }

  if (target.dataset.servicePrice && target.dataset.priceKey) {
    const serviceId = target.dataset.servicePrice;

    state.pricing = normalizePricing(state.pricing);

    if (state.pricing[serviceId]) {
      state.pricing[serviceId][target.dataset.priceKey] = numericPrice(target.value, 0);
      state.pricingSaveStatus = "";
    }
  }

  if (target.dataset.serviceField && target.dataset.field) {
    updateServiceField(target.dataset.serviceField, target.dataset.field, target.value);
  }

  if (target.dataset.serviceDraftField) {
    updateServiceDraftField(target.dataset.serviceDraftField, target.value);
  }

  if (target.dataset.templateField && target.dataset.field) {
    updateServiceTemplateField(target.dataset.templateField, Number(target.dataset.templateIndex || 0), target.dataset.field, target.value);
  }

  if (target.dataset.templateDraftField) {
    updateServiceDraftTemplateField(Number(target.dataset.templateDraftIndex || 0), target.dataset.templateDraftField, target.value);
  }

  if (target.dataset.filter) {
    state.filters[target.dataset.filter] = target.value;
  }

  if (target.dataset.kioskCreateField) {
    state.kioskCreate[target.dataset.kioskCreateField] = target.dataset.kioskCreateField === "setupCode" || target.dataset.kioskCreateField === "kioskId"
      ? normalizeKioskId(target.value)
      : target.value;
  }

  if (target.dataset.priceKey || target.dataset.filter || target.dataset.input || target.dataset.kioskCreateField || target.dataset.serviceField || target.dataset.templateField || target.dataset.serviceDraftField || target.dataset.templateDraftField) {
    return;
  }
}

async function createAdminKiosk() {
  syncKioskCreateDraftFromDom();
  const kiosk = {
    ...state.kioskCreate,
    kioskId: normalizeKioskId(state.kioskCreate.kioskId),
    setupCode: normalizeKioskId(state.kioskCreate.setupCode)
  };

  if (!kiosk.kioskId) {
    state.kioskCreateStatus = "Enter a kiosk ID.";
    render();
    return;
  }

  state.kioskCreateStatus = "Creating kiosk...";
  render();

  try {
    const payload = await fetchJson(`${BACKEND_URL}/api/admin/kiosks`, {
      method: "POST",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ kiosk })
    });

    state.adminData.kiosks = Array.isArray(payload.kiosks) ? payload.kiosks : state.adminData.kiosks;
    state.kioskCreate = { kioskId: "", name: "", branch: "", setupCode: "" };
    state.kioskCreateStatus = `Created ${payload.kiosk.kioskId}. Setup code: ${payload.kiosk.setupCode}`;
  } catch (error) {
    state.kioskCreateStatus = error.message || "Could not create kiosk.";
  }

  render();
}

function syncKioskCreateDraftFromDom() {
  document.querySelectorAll("[data-kiosk-create-field]").forEach((input) => {
    const field = input.dataset.kioskCreateField;
    state.kioskCreate[field] = field === "setupCode" || field === "kioskId"
      ? normalizeKioskId(input.value)
      : input.value;
  });
}

function advancePrint() {
  state.printProgress += 1;

  if (state.printProgress >= 5) {
    addJob("Completed");
    state.step = 7;
    state.printProgress = 0;
  }
}

function addJob(printStatus) {
  const service = selectedService();
  const details = priceDetails();

  const job = {
    id: currentJobId(),
    kiosk: KIOSK_ID,
    branch: "Main Bank Branch",
    file: state.file?.name || "kiosk-document.pdf",
    service: service?.title || "Print Document",
    pages: details.pages,
    copies: details.copies,
    color: state.settings.colorMode === "color" ? "Color" : "B/W",
    amount: details.total,
    payment: "Success",
    print: printStatus,
    date: new Date().toISOString().slice(0, 16).replace("T", " ")
  };

  state.jobs.unshift(job);
  syncBackendPrintStatus(printStatus, state.printError);

  if (printStatus === "Completed") {
    state.lastCompletedJob = job;
  }

  return job;
}

function resetCustomer() {
  stopUploadPolling();
  state.mode = "customer";
  state.step = 0;
  state.selectedService = null;
  clearCurrentFile();
  state.uploadSession = null;
  state.previewZoom = 1;
  state.paymentStatus = "Pending";
  state.paymentStatusMessage = "";
  state.paymentError = "";
  state.paymentOrder = null;
  state.paymentBusy = false;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  state.activeJobId = null;
  state.lastCompletedJob = null;
  state.printer = {
    ...state.printer,
    online: false,
    name: "No printer selected",
    paper: "Unknown",
    toner: "Unknown",
    queue: 0,
    supportsColor: null,
    agent: "Not checked",
    statusText: "Printer has not been checked yet",
    testOverride: false
  };
  state.settings = {
    colorMode: "bw",
    copies: 1,
    paperSize: "A4",
    sides: "single",
    orientation: "portrait",
    range: "all",
    staple: "no"
  };
}

window.kioskTestReceiveUpload = function kioskTestReceiveUpload({ name, size = 1024, mimeType = "application/pdf" }) {
  if (!state.selectedService) {
    state.selectedService = "print";
  }
  state.step = Math.max(state.step, 1);

  const result = createReceivedFileRecord({
    name,
    size,
    mimeType,
    pages: mimeType.startsWith("image/") ? 1 : undefined
  });

  if (result.error) {
    clearCurrentFile();
    state.uploadError = result.error;
    render();
    return result;
  }

  revokePreviewUrl();

  if (["pdf", "image"].includes(result.file.previewKind)) {
    const blob = new Blob([new Uint8Array(size)], { type: mimeType });
    result.file.previewUrl = URL.createObjectURL(blob);
  }

  stopUploadPolling();
  state.file = result.file;
  state.uploadError = "";
  state.step = 2;
  render();
  return { file: result.file };
};

window.kioskTestMarkPaymentSuccess = function kioskTestMarkPaymentSuccess() {
  ensureActiveJobId();
  state.paymentStatus = "Success";
  state.paymentStatusMessage = "Test payment marked successful.";
  state.paymentError = "";
  state.paymentBusy = false;
  state.step = 6;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();
  startLocalPrintJob();
};

window.kioskTestSetPrinterReady = function kioskTestSetPrinterReady() {
  state.printer = {
    ...state.printer,
    online: true,
    name: "Test printer",
    paper: "Ready",
    toner: "Ready",
    queue: 0,
    agent: "Running",
    statusText: "Ready",
    testOverride: true
  };
  render();
  return state.printer;
};

render();
loadPricingSettings();
startConfigPolling();
