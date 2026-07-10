const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const batch = process.argv[2] || "customer";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.RESPONSIVE_BASE_URL || "http://localhost:5173";
const port = Number(process.env.RESPONSIVE_DEBUG_PORT || 9341);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kiosk-responsive-chrome-"));

const allViewports = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [480, 800],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
  [2560, 1440],
  [667, 375],
  [844, 390]
];
const shotViewports = [
  [390, 844],
  [768, 1024]
];
const viewports = process.env.RESPONSIVE_VIEWPORTS === "shots" ? shotViewports : allViewports;

const resetCustomer = "sessionStorage.clear(); resetCustomer();";

const customerRoutes = [
  {
    name: "customer-services",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} render(); })()`
  },
  {
    name: "customer-upload",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => s.mode !== "template" && serviceAvailableForKiosk(s)) || services[0]; state.selectedService = svc?.id || null; state.step = 1; render(); })()`
  },
  {
    name: "customer-forms",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => (s.mode === "template" || (formTemplates[s.id] || []).length) && serviceAvailableForKiosk(s)) || services.find(s => s.mode === "template") || services[0]; state.selectedService = svc?.id || null; state.step = 1; state.templateSearchQuery = ""; state.templatePage = 1; render(); })()`
  },
  {
    name: "customer-forms-marathi-search",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => (s.mode === "template" || (formTemplates[s.id] || []).length) && serviceAvailableForKiosk(s)) || services.find(s => s.mode === "template") || services[0]; state.customerLanguage = "mr"; state.selectedService = svc?.id || null; state.step = 1; state.templateSearchQuery = "certificate"; state.templatePage = 1; render(); })()`
  },
  {
    name: "customer-preview-long-files",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => s.mode !== "template" && serviceAvailableForKiosk(s)) || services[0]; state.selectedService = svc?.id || null; window.kioskTestReceiveUploads([{ name: "very-long-citizen-document-name-for-overflow-testing-english-marathi-application-form.pdf", size: 2048, mimeType: "application/pdf" }, { name: "supporting-photo-with-long-name-for-mobile-layout-validation.png", size: 1024, mimeType: "image/png" }]); })()`
  },
  {
    name: "customer-payment",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => s.mode !== "template" && serviceAvailableForKiosk(s)) || services[0]; state.selectedService = svc?.id || null; window.kioskTestReceiveUpload({ name: "payment-ready-document-with-long-file-name.pdf", size: 2048, mimeType: "application/pdf" }); window.kioskTestSetPrinterReady(); state.step = 3; state.paymentStatus = "Pending"; state.paymentStatusMessage = "Waiting for payment confirmation with long instruction text for responsive wrapping."; render(); })()`
  },
  {
    name: "customer-receipt",
    url: "/index.html?testHooks=true",
    setup: `(() => { ${resetCustomer} const svc = services.find(s => s.mode !== "template" && serviceAvailableForKiosk(s)) || services[0]; state.selectedService = svc?.id || null; window.kioskTestReceiveUpload({ name: "receipt-ready-document-with-long-file-name.pdf", size: 2048, mimeType: "application/pdf" }); window.kioskTestSetPrinterReady(); state.paymentStatus = "Success"; state.step = 4; state.lastCompletedJob = { jobId: "JOB-RESPONSIVE-RECEIPT-001", fileName: "receipt-ready-document-with-long-file-name.pdf", pages: 12, copies: 2, amount: 72, paymentStatus: "Success", printStatus: "Completed", createdAt: new Date().toISOString() }; state.thankYouPhase = "thankyou"; render(); })()`
  },
  { name: "customer-privacy", url: "/index.html?page=privacy&testHooks=true" },
  { name: "mobile-payment-loading", url: "/index.html?mobilePayment=TEST-PAYMENT&testHooks=true" }
];

const adminSampleData = `window.__adminSampleData = {
  lastUpdated: new Date().toISOString(),
  dashboard: { jobsToday: 12, revenueToday: 3450, pagesPrinted: 860, failedJobs: 1, queueLength: 2 },
  revenue: { daily: [{ label: "Mon", total: 1200 }, { label: "Tue", total: 1800 }, { label: "Wed", total: 900 }] },
  jobs: [
    { jobId: "JOB-LONG-RESPONSIVE-001", createdAt: new Date().toISOString(), kioskId: "KIOSK-NASHIK-CENTRAL-01", branch: "Main municipal office", fileName: "very-long-citizen-application-file-name-for-responsive-testing-marathi-and-english.pdf", pages: 12, copies: 2, amount: 72, paymentStatus: "Success", printStatus: "Completed", service: "Upload & Print" },
    { jobId: "JOB-FAILED-002", createdAt: new Date().toISOString(), kioskId: "KIOSK-02", branch: "Ward Office", fileName: "birth-certificate-form.pdf", pages: 2, copies: 1, amount: 6, paymentStatus: "Success", printStatus: "Failed", service: "Government Forms" }
  ],
  transactions: [
    { paymentId: "PAY-001", jobId: "JOB-LONG-RESPONSIVE-001", kiosk: "KIOSK-NASHIK-CENTRAL-01", service: "Upload & Print", amount: 72, paymentMethod: "UPI", status: "Success", createdAt: new Date().toISOString(), printStatus: "Completed" }
  ],
  refunds: [
    { refundId: "REF-001", jobId: "JOB-FAILED-002", paymentId: "PAY-002", amount: 6, reason: "Print failed after payment", status: "Pending", requestedAt: new Date().toISOString() }
  ],
  kiosks: [
    { kioskId: "KIOSK-NASHIK-CENTRAL-01", name: "Central Office Kiosk", branch: "Main municipal office", projectId: "project-nmc", status: "online", lastOnline: new Date().toISOString() },
    { kioskId: "KIOSK-WARD-02", name: "Ward Office Kiosk", branch: "Ward 2", projectId: "project-nmc", status: "offline", lastOnline: "" }
  ],
  projects: [
    { projectId: "project-nmc", name: "Nashik Municipal Forms", status: "active", description: "Citizen services and printing", createdAt: new Date().toISOString() }
  ],
  services: [
    { id: "print", title: "Upload & Print", mode: "upload", enabled: true, projectIds: ["project-nmc"], pricing: { bw: 3, color: 10 }, templates: [] },
    { id: "gov-forms", title: "Government Forms", mode: "template", enabled: true, projectIds: ["project-nmc"], pricing: { bw: 3, color: 10 }, templates: [{ id: "birth", title: "Birth Certificate" }] }
  ],
  reports: [{ id: "RPT-001", title: "Daily operations", status: "Ready", createdAt: new Date().toISOString() }]
};`;

function adminSetup(page) {
  return `(() => { sessionStorage.clear(); ${adminSampleData} window.kioskTestOpenAdmin("${page}"); window.kioskTestSetAdminData(window.__adminSampleData); })()`;
}

const adminRoutes = [
  { name: "admin-login", url: "/admin.html?testHooks=true" },
  ..."dashboard projects kiosks services service-editor pricing revenue system history reports refunds alerts".split(" ").map(page => ({
    name: `admin-${page}`,
    url: "/admin.html?testHooks=true",
    setup: adminSetup(page)
  }))
];

const superBase = `(() => {
  const now = new Date().toISOString();
  state.authed = true;
  state.authToken = "ui-test-session";
  state.loading = false;
  state.error = "";
  state.notice = "";
  state.snapshot = { data: {
    kioskAdmins: [{ adminId: "admin-nmc", name: "NMC Client Administrator", email: "client@example.com", status: "active", projectIds: ["project-nmc"], lastLoginAt: now }],
    projects: [{ projectId: "project-nmc", adminId: "admin-nmc", name: "Nashik Municipal Forms", status: "active", description: "Citizen services and printing", createdAt: now }],
    kiosks: [{ kioskId: "KIOSK-NASHIK-CENTRAL-01", setupCode: "123456", projectId: "project-nmc", name: "Central Office Kiosk", branch: "Main municipal office", status: "online", lastOnline: now }],
    services: [{ id: "print", title: "Upload & Print", mode: "upload", enabled: true, projectIds: ["project-nmc"], pricing: { bw: 3, color: 10 }, templates: [] }, { id: "gov-forms", title: "Government Forms", mode: "template", enabled: true, projectIds: ["project-nmc"], pricing: { bw: 3, color: 10 }, templates: [{ id: "birth", title: "Birth Certificate", pages: 1 }] }],
    jobs: [{ jobId: "JOB-LONG-RESPONSIVE-001", kioskId: "KIOSK-NASHIK-CENTRAL-01", service: "Upload & Print", fileName: "very-long-citizen-application-file-name-for-responsive-testing.pdf", pageCount: 12, copies: 2, amount: 72, paymentStatus: "Success", printStatus: "Completed", createdAt: now }],
    payments: [{ paymentId: "PAY-001", jobId: "JOB-LONG-RESPONSIVE-001", gateway: "Razorpay", amount: 72, currency: "INR", paymentMethod: "UPI", status: "Success", createdAt: now }],
    refunds: [{ refundId: "REF-001", jobId: "JOB-LONG-RESPONSIVE-001", paymentId: "PAY-001", amount: 72, reason: "Responsive test pending refund", status: "Pending", requestedAt: now }],
    releases: []
  }};
})()`;

function superSetup(page, modal = false) {
  return `${superBase}; (() => { sessionStorage.clear(); state.page = "${page}"; ${modal ? "state.editor = { collection: 'projects', mode: 'create', draft: collections.projects.defaults() };" : "state.editor = null;"} render(); })()`;
}

const superRoutes = [
  { name: "super-login", url: "/super-admin.html" },
  ..."dashboard kioskAdmins projects kiosks pricing revenue jobs payments refunds services".split(" ").map(page => ({
    name: `super-${page}`,
    url: "/super-admin.html",
    setup: superSetup(page)
  })),
  { name: "super-project-modal", url: "/super-admin.html", setup: superSetup("projects", true) }
];

const routesByBatch = {
  customer: customerRoutes,
  admin: adminRoutes,
  super: superRoutes,
  all: [...customerRoutes, ...adminRoutes, ...superRoutes],
  shots: [
    customerRoutes.find(route => route.name === "customer-services"),
    customerRoutes.find(route => route.name === "customer-forms"),
    customerRoutes.find(route => route.name === "customer-preview-long-files"),
    customerRoutes.find(route => route.name === "customer-payment"),
    adminRoutes.find(route => route.name === "admin-dashboard"),
    superRoutes.find(route => route.name === "super-dashboard")
  ].filter(Boolean)
};

const routes = routesByBatch[batch];
if (!routes) {
  console.error(`Unknown batch "${batch}". Use customer, admin, super, or all.`);
  process.exit(2);
}

const captureScreenshots = process.env.RESPONSIVE_SCREENSHOTS === "1" || batch === "shots";
const screenshotMap = new Map([
  ["customer-services|390x844", "current-customer-services-390x844.png"],
  ["customer-forms|390x844", "current-customer-forms-390x844.png"],
  ["customer-preview-long-files|768x1024", "current-customer-preview-768x1024.png"],
  ["customer-payment|390x844", "current-customer-payment-390x844.png"],
  ["admin-dashboard|390x844", "current-admin-dashboard-390x844.png"],
  ["super-dashboard|390x844", "current-super-dashboard-390x844.png"]
]);

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    ws.onmessage = event => this.handle(JSON.parse(event.data));
  }

  handle(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? reject(new Error(message.error.message || JSON.stringify(message.error))) : resolve(message.result || {});
      return;
    }

    this.waiters = this.waiters.filter(waiter => {
      if (message.method === waiter.method && (!waiter.sessionId || message.sessionId === waiter.sessionId)) {
        clearTimeout(waiter.timer);
        waiter.resolve(message.params || {});
        return false;
      }
      return true;
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  wait(method, sessionId, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      this.waiters.push({ method, sessionId, resolve, reject, timer });
    });
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForChrome() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await delay(200);
  }
  throw new Error("Chrome did not expose the debugging endpoint.");
}

async function run() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    const version = await waitForChrome();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);

    const results = [];
    for (const [width, height] of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768
      }, sessionId);

      for (const route of routes) {
        const load = cdp.wait("Page.loadEventFired", sessionId, 12000).catch(() => null);
        await cdp.send("Page.navigate", { url: `${baseUrl}${route.url}` }, sessionId);
        await load;
        await delay(80);

        if (route.setup) {
          const setup = await cdp.send("Runtime.evaluate", {
            expression: route.setup,
            awaitPromise: true,
            returnByValue: true
          }, sessionId);
          if (setup.exceptionDetails) {
            results.push({ route: route.name, viewport: `${width}x${height}`, error: setup.exceptionDetails.text || "setup failed" });
            continue;
          }
          await delay(60);
        }

        const metrics = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const doc = document.documentElement;
            const body = document.body;
            const app = document.querySelector("#app");
            const visibleOverflow = Array.from(document.body.querySelectorAll("*")).filter(el => {
              const style = getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden") return false;
              const rect = el.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) return false;
              if (el.closest(".table-wrap, .document-tabs, .rail .stepper, .admin-nav, .template-keyboard-popup-content")) return false;
              if (el.classList.contains("tq-bg-circle")) return false;
              return rect.right > window.innerWidth + 1 || rect.left < -1;
            }).slice(0, 6).map(el => {
              const rect = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                className: String(el.className || "").slice(0, 90),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width)
              };
            });
            const footer = document.querySelector(".customer-footer");
            const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
            const isClippedByScrollableAncestor = (el, rect) => {
              let parent = el.parentElement;
              while (parent && parent !== document.body && parent !== document.documentElement) {
                const style = getComputedStyle(parent);
                const clips = /(auto|scroll|hidden)/.test(style.overflowY + " " + style.overflow);
                if (clips && parent.scrollHeight > parent.clientHeight + 1) {
                  const parentRect = parent.getBoundingClientRect();
                  if (rect.bottom > parentRect.bottom + 1 || rect.top < parentRect.top - 1) return true;
                }
                parent = parent.parentElement;
              }
              return false;
            };
            const footerOverlap = footer ? Array.from(document.body.querySelectorAll(".content button, .content [data-service], .content [data-template]")).filter(el => {
              const style = getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden") return false;
              if (el.closest(".customer-footer")) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) return false;
              if (isClippedByScrollableAncestor(el, rect)) return false;
              return rect.top < footerTop - 1 && rect.bottom > footerTop + 1;
            }).slice(0, 6).map(el => {
              const rect = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                className: String(el.className || "").slice(0, 90),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                footerTop: Math.round(footerTop)
              };
            }) : [];
            const serviceCtaOverlap = footer && document.querySelector(".service-stage") && window.innerWidth >= 901
              ? Array.from(document.querySelectorAll(".service-stage .premium-btn")).filter(el => {
                const style = getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden") return false;
                const rect = el.getBoundingClientRect();
                return rect.bottom > footerTop - 1 || rect.top < 0;
              }).map(el => {
                const rect = el.getBoundingClientRect();
                return {
                  tag: el.tagName,
                  className: String(el.className || "").slice(0, 90),
                  top: Math.round(rect.top),
                  bottom: Math.round(rect.bottom),
                  footerTop: Math.round(footerTop)
                };
              })
              : [];
            return {
              appTextLength: (app?.innerText || "").trim().length,
              docClientWidth: doc.clientWidth,
              docScrollWidth: doc.scrollWidth,
              bodyScrollWidth: body.scrollWidth,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              pageOverflow: Math.max(doc.scrollWidth, body.scrollWidth) > window.innerWidth + 1,
              visibleOverflow,
              footerOverlap,
              serviceCtaOverlap
            };
          })()`
        }, sessionId);

        results.push({
          route: route.name,
          viewport: `${width}x${height}`,
          ...(metrics.result?.value || {})
        });

        if (captureScreenshots) {
          const screenshotName = screenshotMap.get(`${route.name}|${width}x${height}`);
          if (screenshotName) {
            const screenshot = await cdp.send("Page.captureScreenshot", {
              format: "png",
              captureBeyondViewport: false
            }, sessionId);
            const screenshotPath = path.join(process.cwd(), "responsive-checks", screenshotName);
            fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
          }
        }
      }
    }

    const failed = results.filter(item => item.error || item.pageOverflow || (item.visibleOverflow && item.visibleOverflow.length) || (item.footerOverlap && item.footerOverlap.length) || (item.serviceCtaOverlap && item.serviceCtaOverlap.length));
    const summary = { batch, totalChecks: results.length, failedChecks: failed.length, failed };
    const outputPath = path.join(process.cwd(), "responsive-checks", `last-responsive-overflow-${batch}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ batch, totalChecks: results.length, failedChecks: failed.length, outputPath }, null, 2));
    if (failed.length) {
      console.log(JSON.stringify(failed.slice(0, 20), null, 2));
      process.exitCode = 1;
    }

    ws.close();
  } finally {
    chrome.kill();
    await delay(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
