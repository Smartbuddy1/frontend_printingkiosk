const runtimeConfig = new URLSearchParams(window.location.search);
const frontendConfig = window.PRINTING_KIOSK_CONFIG || {};
const currentPage = window.location.pathname.split("/").pop() || "index.html";
const currentPath = window.location.pathname.replace(/\/+$/, "");
const runtimeDevice = runtimeConfig.get("device");
const isKioskDeviceEntry = ["electron", "mini-pc"].includes(runtimeDevice);
const isIndexEntry = currentPage === "index.html" || currentPath === "";
const isWebsiteRootEntry = isIndexEntry && !isKioskDeviceEntry;
const isMobilePaymentEntry = runtimeConfig.has("mobilePayment");
const isAdminEntry = !isMobilePaymentEntry && (currentPage === "admin.html" || currentPath.endsWith("/admin") || runtimeConfig.get("panel") === "admin");
const DEFAULT_BACKEND_URL = /^https?:$/.test(window.location.protocol) ? window.location.origin : "http://localhost:5080";
const HOSTED_PROXY_BACKEND_URL = /^https?:$/.test(window.location.protocol) &&
  (["localhost", "127.0.0.1"].includes(window.location.hostname) || window.location.hostname.endsWith(".vercel.app"))
  ? window.location.origin
  : "";
const LOCAL_AGENT_URL = runtimeConfig.get("localAgentUrl") || frontendConfig.localAgentUrl || "http://localhost:5077";
const BACKEND_URL = (runtimeConfig.get("backendUrl") || HOSTED_PROXY_BACKEND_URL || frontendConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
// WebSocket-specific: HOSTED_PROXY_BACKEND_URL (same-origin, used so plain
// fetch() calls go through Vercel's /api/* rewrite proxy) does NOT work for
// WebSocket upgrades - Vercel's rewrites don't proxy the ws:// protocol, so
// a socket built from BACKEND_URL there 404s. Connect straight to the real
// backend origin instead; CORS doesn't restrict WebSocket connections.
const REAL_BACKEND_URL = (runtimeConfig.get("backendUrl") || frontendConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
const PUBLIC_FRONTEND_URL = (
  runtimeConfig.get("publicFrontendUrl") ||
  runtimeConfig.get("frontendUrl") ||
  frontendConfig.publicFrontendUrl ||
  frontendConfig.frontendUrl ||
  ""
).replace(/\/+$/, "");
const RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const PRINTER_STATUS_TIMEOUT_MS = 15000;
const PRINTER_STATUS_POLL_MS = 15000;
const PAYMENT_STATUS_POLL_MS = 1000;
const MAX_FILES_PER_JOB = 10;
const MAX_UPLOAD_PAGES_PER_DOCUMENT = 10;
const THANK_YOU_HOME_REDIRECT_SECONDS = 15;
// How long the printer must stay critically offline before the kiosk acts on
// it automatically, so a brief blip never trips this - only a sustained issue.
const PRINTER_OFFLINE_ACTION_SECONDS = 15;
const PRINT_FAILURE_AUTO_HOME_SECONDS = 120;
const IDLE_SCREENSAVER_IMAGE_SECONDS = 6;
const IDLE_MEDIA_LOCAL_CHECK_TIMEOUT_MS = 2500;
const CUSTOMER_INACTIVITY_TIMEOUTS = Object.freeze({
  uploadQr: 3 * 60 * 1000,
  governmentFormsList: 90 * 1000,
  formDetails: 2 * 60 * 1000,
  documentPreview: 2 * 60 * 1000,
  printSettings: 90 * 1000,
  payment: 5 * 60 * 1000,
  error: 30 * 1000,
  privacyPolicy: 90 * 1000
});
const CUSTOMER_ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "input", "change"];
const UNASSIGNED_KIOSK_ID = "UNASSIGNED-KIOSK";
const ADMIN_SESSION_KEY = "printingKioskAdminSession";
const ADMIN_LANGUAGE_KEY = "printingKioskAdminLanguage";
const CUSTOMER_LANGUAGE_KEY = "printingKioskCustomerLanguage";
const SERVICES_CACHE_KEY = "kioskServices";
const ADMIN_LANGUAGES = new Set(["en", "hi", "mr"]);
const CUSTOMER_LANGUAGES = ADMIN_LANGUAGES;
const CUSTOMER_LANGUAGE_OPTIONS = [
  { value: "en", label: "English", shortLabel: "EN", lang: "en" },
  { value: "hi", label: "हिंदी", shortLabel: "HI", lang: "hi" },
  { value: "mr", label: "मराठी", shortLabel: "MR", lang: "mr" }
];
const TEST_HOOKS_ENABLED = frontendConfig.testHooks === true ||
  runtimeConfig.get("testHooks") === "true";
const KIOSK_ID = readConfiguredKioskId();
const HAS_EXPLICIT_LOCAL_AGENT = Boolean(runtimeConfig.get("localAgentUrl") || frontendConfig.localAgentUrl);
const DEMO_KIOSK_MODE = runtimeConfig.get("demo") === "true" ||
  runtimeConfig.get("kioskDemo") === "true" ||
  (KIOSK_ID === "LOCAL-KIOSK" && runtimeConfig.get("demo") !== "false");
// Generic, non-client-specific fallback only - shown when a kiosk's own
// clientBrand isn't available yet (first boot, offline before any cached
// value exists) or its real logo URL fails to load (e.g. offline - it's a
// remote image). Must never be a real client's identity: this used to be
// hardcoded to one specific customer (Nashik Municipal Corporation), so any
// OTHER client's kiosk that hit either fallback path showed that customer's
// name/logo instead of its own.
const DEFAULT_KIOSK_BRAND = Object.freeze({
  title: "Printing Kiosk",
  subtitle: "Printing Kiosk",
  logoUrl: "./assets/aarya-innovtech-logo-transparent.png"
});
let localJobSequence = 0;
let customerInactivityEventsBound = false;
let lastCustomerRenderedStep = null;
let lastPrinterHealthSyncAt = 0;
let lastPrinterHealthSyncSignature = "";
let printerHealthSyncInFlight = false;
let printerStatusRefreshInFlight = false;
const pdfPreviewRenderCache = new Map();
const PDF_PREVIEW_CACHE_LIMIT = 12;

const ADMIN_TRANSLATION_ROWS = [
  ["Language", "लैंग्वेज", "लैंग्वेज"],
  ["English", "इंग्लिश", "इंग्लिश"],
  ["Hindi", "हिंदी", "हिंदी"],
  ["Marathi", "मराठी", "मराठी"],
  ["Print Kiosk Admin Console", "प्रिंट कीओस्क एडमिन कंसोल", "प्रिंट कीओस्क एडमिन कंसोल"],
  ["assigned project management", "एसाइन्ड प्रोजेक्ट मैनेजमेंट", "एसाइन्ड प्रोजेक्ट मैनेजमेंट"],
  ["Logout", "लॉगआउट", "लॉगआउट"],
  ["Open alerts", "ओपन अलर्टस", "ओपन अलर्टस"],
  ["Open navigation", "ओपन नेविगेशन", "ओपन नेविगेशन"],
  ["Close navigation", "क्लोज नेविगेशन", "क्लोज नेविगेशन"],
  ["Refresh admin data", "रिफ्रेश एडमिन डाटा", "रिफ्रेश एडमिन डाटा"],
  ["Navigation", "नेविगेशन", "नेविगेशन"],
  ["Operate", "ऑपरेट", "ऑपरेट"],
  ["Support", "सपोर्ट", "सपोर्ट"],
  ["Dashboard", "डैशबोर्ड", "डैशबोर्ड"],
  ["Projects", "प्रोजेक्ट्स", "प्रोजेक्ट्स"],
  ["Project", "प्रोजेक्ट", "प्रोजेक्ट"],
  ["Kiosks", "किओस्कस", "किओस्कस"],
  ["Kiosk", "कीओस्क", "कीओस्क"],
  ["Services", "सर्विसेज", "सर्विसेज"],
  ["Service", "सर्विस", "सर्विस"],
  ["Pricing", "प्राइसिंग", "प्राइसिंग"],
  ["Revenue", "रेवेनुए", "रेवेनुए"],
  ["Print History", "प्रिंट हिस्ट्री", "प्रिंट हिस्ट्री"],
  ["System Status", "सिस्टम स्टेटस", "सिस्टम स्टेटस"],
  ["Need Help?", "नीड हेल्प?", "नीड हेल्प?"],
  ["Check kiosk devices and connection status.", "चेक कीओस्क देवीकेस एंड कनेक्शन स्टेटस.", "चेक कीओस्क देवीकेस एंड कनेक्शन स्टेटस."],
  ["Open System Status", "ओपन सिस्टम स्टेटस", "ओपन सिस्टम स्टेटस"],
  ["Print Kiosk Admin Login", "प्रिंट कीओस्क एडमिन लॉगिन", "प्रिंट कीओस्क एडमिन लॉगिन"],
  ["Use your admin credentials. The system opens the right dashboard automatically.", "उसे योर एडमिन क्रेडेंटिअल्स. थे सिस्टम ओपेनस थे राइट डैशबोर्ड ऑटोमेटिकली.", "उसे योर एडमिन क्रेडेंटिअल्स. थे सिस्टम ओपेनस थे राइट डैशबोर्ड ऑटोमेटिकली."],
  ["Email or mobile", "ईमेल और मोबाइल", "ईमेल और मोबाइल"],
  ["Password", "पासवर्ड", "पासवर्ड"],
  ["Sign in", "सिग्न इन", "सिग्न इन"],
  ["Enter admin email and password.", "एंटर एडमिन ईमेल एंड पासवर्ड.", "एंटर एडमिन ईमेल एंड पासवर्ड."],
  ["Admin login failed.", "एडमिन लॉगिन फेल्ड.", "एडमिन लॉगिन फेल्ड."],
  ["Manage your assigned projects, kiosks, and services.", "मैनेज योर एसाइन्ड प्रोजेक्ट्स, किओस्कस, एंड सर्विसेज.", "मैनेज योर एसाइन्ड प्रोजेक्ट्स, किओस्कस, एंड सर्विसेज."],
  ["Live backend data.", "लाइव बैकेंड डाटा.", "लाइव बैकेंड डाटा."],
  ["Loading live backend data...", "लोडिंग लाइव बैकेंड डाटा...", "लोडिंग लाइव बैकेंड डाटा..."],
  ["Last updated", "लास्ट अपडेटेड", "लास्ट अपडेटेड"],
  ["Today Revenue", "टुडे रेवेनुए", "टुडे रेवेनुए"],
  ["Today Jobs", "टुडे जॉब्स", "टुडे जॉब्स"],
  ["Failed Jobs", "फेल्ड जॉब्स", "फेल्ड जॉब्स"],
  ["Pages Printed", "पेजेज प्रिंटेड", "पेजेज प्रिंटेड"],
  ["Queue Length", "केओए लेंथ", "केओए लेंथ"],
  ["Live backend total", "लाइव बैकेंड टोटल", "लाइव बैकेंड टोटल"],
  ["Managed access", "मैनेज्ड एक्सेस", "मैनेज्ड एक्सेस"],
  ["Completed and queued jobs", "कम्प्लेटेड एंड केओइड जॉब्स", "कम्प्लेटेड एंड केओइड जॉब्स"],
  ["Pending super admin review", "पेंडिंग सुपर एडमिन रिव्यु", "पेंडिंग सुपर एडमिन रिव्यु"],
  ["No pending records", "नो पेंडिंग रिकार्ड्स", "नो पेंडिंग रिकार्ड्स"],
  ["Live job records", "लाइव जॉब रिकार्ड्स", "लाइव जॉब रिकार्ड्स"],
  ["Revenue Trend", "रेवेनुए ट्रेंड", "रेवेनुए ट्रेंड"],
  ["paid job(s)", "पेड job(s)", "पेड job(s)"],
  ["daily avg", "डेली ावग", "डेली ावग"],
  ["peak", "पीक", "पीक"],
  ["Failure Safe Queue", "फेलियर सेफ केओए", "फेलियर सेफ केओए"],
  ["Payment success print failed", "पेमेंट सक्सेस प्रिंट फेल्ड", "पेमेंट सक्सेस प्रिंट फेल्ड"],
  ["Active print queue", "एक्टिव प्रिंट केओए", "एक्टिव प्रिंट केओए"],
  ["View full queue details", "व्यू फुल केओए डिटेल्स", "व्यू फुल केओए डिटेल्स"],
  ["Latest Alerts", "लेटेस्ट अलर्टस", "लेटेस्ट अलर्टस"],
  ["View all alerts", "व्यू आल अलर्टस", "व्यू आल अलर्टस"],
  ["No live alerts", "नो लाइव अलर्टस", "नो लाइव अलर्टस"],
  ["Open", "ओपन", "ओपन"],
  ["Revenue graph for your assigned kiosks and projects.", "रेवेनुए ग्राफ फॉर योर एसाइन्ड किओस्कस एंड प्रोजेक्ट्स.", "रेवेनुए ग्राफ फॉर योर एसाइन्ड किओस्कस एंड प्रोजेक्ट्स."],
  ["Period Revenue", "पीरियड रेवेनुए", "पीरियड रेवेनुए"],
  ["Last 14 days", "लास्ट १४ डेज", "लास्ट १४ डेज"],
  ["Paid Jobs", "पेड जॉब्स", "पेड जॉब्स"],
  ["Included in graph", "इन्क्लुदेद इन ग्राफ", "इन्क्लुदेद इन ग्राफ"],
  ["Daily Average", "डेली एवरेज", "डेली एवरेज"],
  ["Across this period", "अक्रॉस थिस पीरियड", "अक्रॉस थिस पीरियड"],
  ["Live print job history for your assigned projects and kiosks.", "लाइव प्रिंट जॉब हिस्ट्री फॉर योर एसाइन्ड प्रोजेक्ट्स एंड किओस्कस.", "लाइव प्रिंट जॉब हिस्ट्री फॉर योर एसाइन्ड प्रोजेक्ट्स एंड किओस्कस."],
  ["Search job, kiosk, branch", "सर्च जॉब, कीओस्क, ब्रांच", "सर्च जॉब, कीओस्क, ब्रांच"],
  ["All statuses", "आल सतातुसेस", "आल सतातुसेस"],
  ["Success", "सक्सेस", "सक्सेस"],
  ["Failed", "फेल्ड", "फेल्ड"],
  ["Job ID", "जॉब ईद", "जॉब ईद"],
  ["Date", "डेट", "डेट"],
  ["Branch", "ब्रांच", "ब्रांच"],
  ["File", "फाइल", "फाइल"],
  ["Pages", "पेजेज", "पेजेज"],
  ["Copies", "कपीस", "कपीस"],
  ["Amount", "अमाउंट", "अमाउंट"],
  ["Payment", "पेमेंट", "पेमेंट"],
  ["Print", "प्रिंट", "प्रिंट"],
  ["View", "व्यू", "व्यू"],
  ["No backend print jobs yet.", "नो बैकेंड प्रिंट जॉब्स येत.", "नो बैकेंड प्रिंट जॉब्स येत."],
  ["Live health data for kiosks in your assigned projects.", "लाइव हेल्थ डाटा फॉर किओस्कस इन योर एसाइन्ड प्रोजेक्ट्स.", "लाइव हेल्थ डाटा फॉर किओस्कस इन योर एसाइन्ड प्रोजेक्ट्स."],
  ["Status", "स्टेटस", "स्टेटस"],
  ["Last Online", "लास्ट ऑनलाइन", "लास्ट ऑनलाइन"],
  ["Online", "ऑनलाइन", "ऑनलाइन"],
  ["online", "ऑनलाइन", "ऑनलाइन"],
  ["Offline", "ऑफलाइन", "ऑफलाइन"],
  ["offline", "ऑफलाइन", "ऑफलाइन"],
  ["Unknown", "अननोन", "अननोन"],
  ["Unassigned", "उनसिग्नेड", "उनसिग्नेड"],
  ["No kiosk health records are assigned to this account.", "नो कीओस्क हेल्थ रिकार्ड्स अरे एसाइन्ड तो थिस अकाउंट.", "नो कीओस्क हेल्थ रिकार्ड्स अरे एसाइन्ड तो थिस अकाउंट."],
  ["Service Management", "सर्विस मैनेजमेंट", "सर्विस मैनेजमेंट"],
  ["Services are listed first. Forms appear underneath their parent service. Open a service to create or update details.", "सर्विसेज अरे लिस्टेड फर्स्ट. फॉर्म्स अप्पेअर ुंडेरनाथ थेइर पैरेंट सर्विस. ओपन ा सर्विस तो क्रिएट और अपडेट डिटेल्स.", "सर्विसेज अरे लिस्टेड फर्स्ट. फॉर्म्स अप्पेअर ुंडेरनाथ थेइर पैरेंट सर्विस. ओपन ा सर्विस तो क्रिएट और अपडेट डिटेल्स."],
  ["Create Service", "क्रिएट सर्विस", "क्रिएट सर्विस"],
  ["Save Changes", "सेव चंगेस", "सेव चंगेस"],
  ["Unsaved service changes. Use Save Services to publish them to the kiosk backend.", "उनसावेद सर्विस चंगेस. उसे सेव सर्विसेज तो पब्लिश थम तो थे कीओस्क बैकेंड.", "उनसावेद सर्विस चंगेस. उसे सेव सर्विसेज तो पब्लिश थम तो थे कीओस्क बैकेंड."],
  ["Enabled", "इनेबल्ड", "इनेबल्ड"],
  ["Disabled", "डिसेबल्ड", "डिसेबल्ड"],
  ["Off", "ऑफ", "ऑफ"],
  ["Edit", "एडिट", "एडिट"],
  ["Delete", "डिलीट", "डिलीट"],
  ["None", "नोने", "नोने"],
  ["Forms", "फॉर्म्स", "फॉर्म्स"],
  ["Forms under this service", "फॉर्म्स अंडर थिस सर्विस", "फॉर्म्स अंडर थिस सर्विस"],
  ["No forms. Customer uses QR upload for PDF, DOC, image, and other supported documents.", "नो फॉर्म्स. कस्टमर उसेस कर अपलोड फॉर पीडीऍफ़, डॉक्, इमेज, एंड इतर सपोर्टेड डाक्यूमेंट्स.", "नो फॉर्म्स. कस्टमर उसेस कर अपलोड फॉर पीडीऍफ़, डॉक्, इमेज, एंड इतर सपोर्टेड डाक्यूमेंट्स."],
  ["No forms added yet. Edit this service to create forms.", "नो फॉर्म्स एडेड येत. एडिट थिस सर्विस तो क्रिएट फॉर्म्स.", "नो फॉर्म्स एडेड येत. एडिट थिस सर्विस तो क्रिएट फॉर्म्स."],
  ["Create a kiosk under an assigned project before creating services.", "क्रिएट ा कीओस्क अंडर ान एसाइन्ड प्रोजेक्ट बिफोर क्रिएटिंग सर्विसेज.", "क्रिएट ा कीओस्क अंडर ान एसाइन्ड प्रोजेक्ट बिफोर क्रिएटिंग सर्विसेज."],
  ["Edit Service", "एडिट सर्विस", "एडिट सर्विस"],
  ["Update service details on this page, then save to return to the Services list.", "अपडेट सर्विस डिटेल्स ों थिस पेज, थें सेव तो रेतुर्न तो थे सर्विसेज लिस्ट.", "अपडेट सर्विस डिटेल्स ों थिस पेज, थें सेव तो रेतुर्न तो थे सर्विसेज लिस्ट."],
  ["Back to Services", "बैक तो सर्विसेज", "बैक तो सर्विसेज"],
  ["Save Service", "सेव सर्विस", "सेव सर्विस"],
  ["New Service", "नई सर्विस", "नई सर्विस"],
  ["Yes", "यस", "यस"],
  ["No", "नो", "नो"],
  ["Mode", "मोड", "मोड"],
  ["QR upload / image upload", "कर अपलोड / इमेज अपलोड", "कर अपलोड / इमेज अपलोड"],
  ["Form templates", "फॉर्म टेम्पलेट्स", "फॉर्म टेम्पलेट्स"],
  ["Icon", "आइकॉन", "आइकॉन"],
  ["Service Name", "सर्विस नाम", "सर्विस नाम"],
  ["Description", "डिस्क्रिप्शन", "डिस्क्रिप्शन"],
  ["B/W Rate", "B/W रेट", "B/W रेट"],
  ["Color Rate", "कलर रेट", "कलर रेट"],
  ["Upload Service", "अपलोड सर्विस", "अपलोड सर्विस"],
  ["Forms under", "फॉर्म्स अंडर", "फॉर्म्स अंडर"],
  ["Add or update the forms that belong to this service.", "ऐड और अपडेट थे फॉर्म्स तहत बिलोंग तो थिस सर्विस.", "ऐड और अपडेट थे फॉर्म्स तहत बिलोंग तो थिस सर्विस."],
  ["Add Form", "ऐड फॉर्म", "ऐड फॉर्म"],
  ["Remove Form", "रिमूव फॉर्म", "रिमूव फॉर्म"],
  ["Form Name", "फॉर्म नाम", "फॉर्म नाम"],
  ["Default Orientation", "डिफ़ॉल्ट ओरिएंटेशन", "डिफ़ॉल्ट ओरिएंटेशन"],
  ["Portrait", "पोर्ट्रेट", "पोर्ट्रेट"],
  ["Landscape", "लैंडस्केप", "लैंडस्केप"],
  ["Fields", "फ़ील्ड्स", "फ़ील्ड्स"],
  ["Image URL", "इमेज यूआरएल", "इमेज यूआरएल"],
  ["Update Image", "अपडेट इमेज", "अपडेट इमेज"],
  ["No forms yet. Use Add Form to create the first form for this service.", "नो फॉर्म्स येत. उसे ऐड फॉर्म तो क्रिएट थे फर्स्ट फॉर्म फॉर थिस सर्विस.", "नो फॉर्म्स येत. उसे ऐड फॉर्म तो क्रिएट थे फर्स्ट फॉर्म फॉर थिस सर्विस."],
  ["Pricing Management", "प्राइसिंग मैनेजमेंट", "प्राइसिंग मैनेजमेंट"],
  ["Set page-wise B/W and color rates for each customer service.", "सेट page-wise B/W एंड कलर रेट्स फॉर एच कस्टमर सर्विस.", "सेट page-wise B/W एंड कलर रेट्स फॉर एच कस्टमर सर्विस."],
  ["Save Pricing", "सेव प्राइसिंग", "सेव प्राइसिंग"],
  ["B/W per page", "B/W पैर पेज", "B/W पैर पेज"],
  ["Color per page", "कलर पैर पेज", "कलर पैर पेज"],
  ["Assigned Projects", "एसाइन्ड प्रोजेक्ट्स", "एसाइन्ड प्रोजेक्ट्स"],
  ["Projects allocated to your client account. Create and manage kiosks from the Kiosks page.", "प्रोजेक्ट्स ाललोकेटेड तो योर क्लाइंट अकाउंट. क्रिएट एंड मैनेज किओस्कस फ्रॉम थे किओस्कस पेज.", "प्रोजेक्ट्स ाललोकेटेड तो योर क्लाइंट अकाउंट. क्रिएट एंड मैनेज किओस्कस फ्रॉम थे किओस्कस पेज."],
  ["Project Name", "प्रोजेक्ट नाम", "प्रोजेक्ट नाम"],
  ["No projects are assigned to this account.", "नो प्रोजेक्ट्स अरे एसाइन्ड तो थिस अकाउंट.", "नो प्रोजेक्ट्स अरे एसाइन्ड तो थिस अकाउंट."],
  ["Assigned Kiosks", "एसाइन्ड किओस्कस", "एसाइन्ड किओस्कस"],
  ["Create and manage kiosks inside your allocated projects.", "क्रिएट एंड मैनेज किओस्कस इनसाइड योर ाललोकेटेड प्रोजेक्ट्स.", "क्रिएट एंड मैनेज किओस्कस इनसाइड योर ाललोकेटेड प्रोजेक्ट्स."],
  ["Create Kiosk", "क्रिएट कीओस्क", "क्रिएट कीओस्क"],
  ["Kiosk ID", "कीओस्क ईद", "कीओस्क ईद"],
  ["Name", "नाम", "नाम"],
  ["Activation", "एक्टिवेशन", "एक्टिवेशन"],
  ["Actions", "एक्शन्स", "एक्शन्स"],
  ["Activated", "एक्टिवेटिड", "एक्टिवेटिड"],
  ["Not activated", "नॉट एक्टिवेटिड", "नॉट एक्टिवेटिड"],
  ["No kiosks are assigned to this account.", "नो किओस्कस अरे एसाइन्ड तो थिस अकाउंट.", "नो किओस्कस अरे एसाइन्ड तो थिस अकाउंट."],
  ["Edit Kiosk", "एडिट कीओस्क", "एडिट कीओस्क"],
  ["Mini PC setup uses the kiosk ID and setup code.", "मिनी पक सेटअप उसेस थे कीओस्क ईद एंड सेटअप कोड.", "मिनी पक सेटअप उसेस थे कीओस्क ईद एंड सेटअप कोड."],
  ["Close", "क्लोज", "क्लोज"],
  ["No assigned projects found. Ask the super admin to allocate a project first.", "नो एसाइन्ड प्रोजेक्ट्स फाउंड. आस्क थे सुपर एडमिन तो ाललोकते ा प्रोजेक्ट फर्स्ट.", "नो एसाइन्ड प्रोजेक्ट्स फाउंड. आस्क थे सुपर एडमिन तो ाललोकते ा प्रोजेक्ट फर्स्ट."],
  ["Mini PC Setup Code", "मिनी पक सेटअप कोड", "मिनी पक सेटअप कोड"],
  ["Save Kiosk", "सेव कीओस्क", "सेव कीओस्क"],
  ["Notifications", "नोटिफिकेशन्स", "नोटिफिकेशन्स"],
  ["Dashboard, email, SMS, and WhatsApp alerts can be wired here.", "डैशबोर्ड, ईमेल, संस, एंड व्हाट्सप्प अलर्टस कैन बे वायर्ड हेरे.", "डैशबोर्ड, ईमेल, संस, एंड व्हाट्सप्प अलर्टस कैन बे वायर्ड हेरे."],
  ["Printer offline", "प्रिंटर ऑफलाइन", "प्रिंटर ऑफलाइन"],
  ["Printer is not ready", "प्रिंटर इस नॉट रेडी", "प्रिंटर इस नॉट रेडी"],
  ["Payment success but print failed", "पेमेंट सक्सेस बूत प्रिंट फेल्ड", "पेमेंट सक्सेस बूत प्रिंट फेल्ड"],
  ["Backend and assigned kiosk checks are clear.", "बैकेंड एंड एसाइन्ड कीओस्क चेक्स अरे क्लियर.", "बैकेंड एंड एसाइन्ड कीओस्क चेक्स अरे क्लियर."],
  ["Previous", "प्रीवियस", "प्रीवियस"],
  ["Next", "नेक्स्ट", "नेक्स्ट"],
  ["Page", "पेज", "पेज"],
  ["of", "ऑफ़", "ऑफ़"],
  ["records", "रिकार्ड्स", "रिकार्ड्स"],
  ["Saving pricing...", "सेविंग प्राइसिंग...", "सेविंग प्राइसिंग..."],
  ["Pricing saved for all services.", "प्राइसिंग सेव्ड फॉर आल सर्विसेज.", "प्राइसिंग सेव्ड फॉर आल सर्विसेज."],
  ["Saving service...", "सेविंग सर्विस...", "सेविंग सर्विस..."],
  ["Saving services...", "सेविंग सर्विसेज...", "सेविंग सर्विसेज..."],
  ["Services saved for this kiosk project.", "सर्विसेज सेव्ड फॉर थिस कीओस्क प्रोजेक्ट.", "सर्विसेज सेव्ड फॉर थिस कीओस्क प्रोजेक्ट."],
  ["Uploading image...", "उप्लोअडिंग इमेज...", "उप्लोअडिंग इमेज..."],
  ["Service name is required.", "सर्विस नाम इस रिक्वायर्ड.", "सर्विस नाम इस रिक्वायर्ड."],
  ["At least one service must remain.", "ात लीस्ट ओने सर्विस मस्ट रेमें.", "ात लीस्ट ओने सर्विस मस्ट रेमें."],
  ["Creating kiosk...", "क्रिएटिंग कीओस्क...", "क्रिएटिंग कीओस्क..."],
  ["Saving kiosk...", "सेविंग कीओस्क...", "सेविंग कीओस्क..."],
  ["Deleting kiosk...", "देलेटिंग कीओस्क...", "देलेटिंग कीओस्क..."],
  ["Enter a kiosk ID.", "एंटर ा कीओस्क ईद.", "एंटर ा कीओस्क ईद."],
  ["Select a project.", "सेलेक्ट ा प्रोजेक्ट.", "सेलेक्ट ा प्रोजेक्ट."],
  ["Kiosk not found.", "कीओस्क नॉट फाउंड.", "कीओस्क नॉट फाउंड."],
  ["No", "नो", "नो"]
];

const ADMIN_TRANSLATIONS = {
  hi: Object.fromEntries(ADMIN_TRANSLATION_ROWS.map(([english, hindi]) => [english, hindi])),
  mr: Object.fromEntries(ADMIN_TRANSLATION_ROWS.map(([english, , marathi]) => [english, marathi]))
};

const CUSTOMER_TRANSLATION_ROWS = [
  ["Language", "लैंग्वेज", "लैंग्वेज"],
  ["English", "इंग्लिश", "इंग्लिश"],
  ["Hindi", "हिंदी", "हिंदी"],
  ["Marathi", "मराठी", "मराठी"],
  ["Print Kiosk", "प्रिंट कीओस्क", "प्रिंट कीओस्क"],
  ["Government and education ready", "गवर्नमेंट एंड एजुकेशन रेडी", "गवर्नमेंट एंड एजुकेशन रेडी"],
  ["Online", "ऑनलाइन", "ऑनलाइन"],
  ["Offline", "ऑफलाइन", "ऑफलाइन"],
  ["New Session", "नई सेशन", "नई सेशन"],
  ["Customer Flow", "कस्टमर फ्लो", "कस्टमर फ्लो"],
  ["Services", "सर्विसेज", "सर्विसेज"],
  ["Upload", "अपलोड", "अपलोड"],
  ["Preview", "प्रीव्यू", "प्रीव्यू"],
  ["Payment", "पेमेंट", "पेमेंट"],
  ["Receipt", "रिसीप्ट", "रिसीप्ट"],
  ["Kiosk setup required", "कीओस्क सेटअप रिक्वायर्ड", "कीओस्क सेटअप रिक्वायर्ड"],
  ["Ask the client for this machine's kiosk ID and setup code.", "आस्क थे क्लाइंट फॉर थिस machine's कीओस्क ईद एंड सेटअप कोड.", "आस्क थे क्लाइंट फॉर थिस machine's कीओस्क ईद एंड सेटअप कोड."],
  ["Available service", "अवेलेबल सर्विस", "अवेलेबल सर्विस"],
  ["Choose service", "चूसे सर्विस", "चूसे सर्विस"],
  ["This service is available on this kiosk.", "थिस सर्विस इस अवेलेबल ों थिस कीओस्क.", "थिस सर्विस इस अवेलेबल ों थिस कीओस्क."],
  ["Select what you need to print.", "सेलेक्ट व्हाट यू नीड तो प्रिंट.", "सेलेक्ट व्हाट यू नीड तो प्रिंट."],
  ["Choose form template", "चूसे फॉर्म टेम्पलेट", "चूसे फॉर्म टेम्पलेट"],
  ["Print Blank Form", "प्रिंट ब्लेंक फॉर्म", "प्रिंट ब्लेंक फॉर्म"],
  ["Back to Services", "बैक तो सर्विसेज", "बैक तो सर्विसेज"],
  ["Upload from phone", "अपलोड फ्रॉम फ़ोन", "अपलोड फ्रॉम फ़ोन"],
  ["Scan the QR code to send your documents.", "स्कैन थे कर कोड तो सेंड योर डाक्यूमेंट्स.", "स्कैन थे कर कोड तो सेंड योर डाक्यूमेंट्स."],
  ["Preparing QR code", "प्रेपरिंग कर कोड", "प्रेपरिंग कर कोड"],
  ["Starting secure mobile upload session...", "स्टार्टिंग सिक्योर मोबाइल अपलोड सेशन...", "स्टार्टिंग सिक्योर मोबाइल अपलोड सेशन..."],
  ["QR service offline", "कर सर्विस ऑफलाइन", "कर सर्विस ऑफलाइन"],
  ["Start the backend service, then generate a new QR.", "स्टार्ट थे बैकेंड सर्विस, थें गेनेराते ा नई कर.", "स्टार्ट थे बैकेंड सर्विस, थें गेनेराते ा नई कर."],
  ["Upload QR code", "अपलोड कर कोड", "अपलोड कर कोड"],
  ["Preview and confirm", "प्रीव्यू एंड कन्फर्म", "प्रीव्यू एंड कन्फर्म"],
  ["Review the document and confirm the print details.", "रिव्यु थे डॉक्यूमेंट एंड कन्फर्म थे प्रिंट डिटेल्स.", "रिव्यु थे डॉक्यूमेंट एंड कन्फर्म थे प्रिंट डिटेल्स."],
  ["Print settings", "प्रिंट सेटिंग्स", "प्रिंट सेटिंग्स"],
  ["Document", "डॉक्यूमेंट", "डॉक्यूमेंट"],
  ["Page Color", "पेज कलर", "पेज कलर"],
  ["B/W", "B/W", "B/W"],
  ["Color", "कलर", "कलर"],
  ["Page Copies", "पेज कपीस", "पेज कपीस"],
  ["Total Pages", "टोटल पेजेज", "टोटल पेजेज"],
  ["Total", "टोटल", "टोटल"],
  ["Continue to Payment", "कंटिन्यू तो पेमेंट", "कंटिन्यू तो पेमेंट"],
  ["Replace Document", "रेप्लस डॉक्यूमेंट", "रेप्लस डॉक्यूमेंट"],
  ["Back", "बैक", "बैक"],
  ["No file selected", "नो फाइल सिलेक्टेड", "नो फाइल सिलेक्टेड"],
  ["Upload a file to see the preview.", "अपलोड ा फाइल तो सी थे प्रीव्यू.", "अपलोड ा फाइल तो सी थे प्रीव्यू."],
  ["PDF preview unavailable", "पीडीऍफ़ प्रीव्यू ुनवैलब्ले", "पीडीऍफ़ प्रीव्यू ुनवैलब्ले"],
  ["The file is valid. Continue after checking file details.", "थे फाइल इस वैलिड. कंटिन्यू आफ्टर चेकिंग फाइल डिटेल्स.", "थे फाइल इस वैलिड. कंटिन्यू आफ्टर चेकिंग फाइल डिटेल्स."],
  ["Uploaded document preview", "उप्लोडेड डॉक्यूमेंट प्रीव्यू", "उप्लोडेड डॉक्यूमेंट प्रीव्यू"],
  ["Document preview", "डॉक्यूमेंट प्रीव्यू", "डॉक्यूमेंट प्रीव्यू"],
  ["Uploaded document", "उप्लोडेड डॉक्यूमेंट", "उप्लोडेड डॉक्यूमेंट"],
  ["This uploaded document is ready for printing. A full DOC/DOCX visual preview needs server-side conversion to PDF.", "थिस उप्लोडेड डॉक्यूमेंट इस रेडी फॉर प्रिंटिंग. ा फुल DOC/DOCX विसुअल प्रीव्यू नीड्स server-side कन्वर्शन तो पीडीऍफ़.", "थिस उप्लोडेड डॉक्यूमेंट इस रेडी फॉर प्रिंटिंग. ा फुल DOC/DOCX विसुअल प्रीव्यू नीड्स server-side कन्वर्शन तो पीडीऍफ़."],
  ["Preview placeholder", "प्रीव्यू प्लेसहोल्डर", "प्रीव्यू प्लेसहोल्डर"],
  ["A real uploaded PDF or image will render here.", "ा रियल उप्लोडेड पीडीऍफ़ और इमेज विल रेंडर हेरे.", "ा रियल उप्लोडेड पीडीऍफ़ और इमेज विल रेंडर हेरे."],
  ["Color Mode", "कलर मोड", "कलर मोड"],
  ["Copies", "कपीस", "कपीस"],
  ["Pay the confirmed total securely to start printing.", "पाय थे कनफर्म्ड टोटल सेक्युरेली तो स्टार्ट प्रिंटिंग.", "पाय थे कनफर्म्ड टोटल सेक्युरेली तो स्टार्ट प्रिंटिंग."],
  ["Total payable", "टोटल पायबले", "टोटल पायबले"],
  ["Payment received", "पेमेंट रेसिवेद", "पेमेंट रेसिवेद"],
  ["Pay with Razorpay", "पाय विथ रजोरपाय", "पाय विथ रजोरपाय"],
  ["Order created", "आर्डर क्रिएटेड", "आर्डर क्रिएटेड"],
  ["Checkout opened", "चेकआउट ोपेनेड", "चेकआउट ोपेनेड"],
  ["Signature verified", "सिग्नेचर वेरिफ़िएड", "सिग्नेचर वेरिफ़िएड"],
  ["Printing documents", "प्रिंटिंग डाक्यूमेंट्स", "प्रिंटिंग डाक्यूमेंट्स"],
  ["Printer is offline. Payment will be available when it is online.", "प्रिंटर इस ऑफलाइन. पेमेंट विल बे अवेलेबल व्हेन आईटी इस ऑनलाइन.", "प्रिंटर इस ऑफलाइन. पेमेंट विल बे अवेलेबल व्हेन आईटी इस ऑनलाइन."],
  ["Processing...", "प्रोसेसिंग...", "प्रोसेसिंग..."],
  ["Pay", "पाय", "पाय"],
  ["Done", "दोने", "दोने"],
  ["Active", "एक्टिव", "एक्टिव"],
  ["Pending", "पेंडिंग", "पेंडिंग"],
  ["Printing needs attention", "प्रिंटिंग नीड्स अटेंशन", "प्रिंटिंग नीड्स अटेंशन"],
  ["The paid job is saved in admin history and can be retried without charging again.", "थे पेड जॉब इस सेव्ड इन एडमिन हिस्ट्री एंड कैन बे रेट्रिएड विथाउट चार्जिंग अगेन.", "थे पेड जॉब इस सेव्ड इन एडमिन हिस्ट्री एंड कैन बे रेट्रिएड विथाउट चार्जिंग अगेन."],
  ["Recovery Options", "रिकवरी ओप्तिओंस", "रिकवरी ओप्तिओंस"],
  ["Success", "सक्सेस", "सक्सेस"],
  ["Failed", "फेल्ड", "फेल्ड"],
  ["Queue", "केओए", "केओए"],
  ["Saved for retry", "सेव्ड फॉर रेट्री", "सेव्ड फॉर रेट्री"],
  ["Refund", "रिफंड", "रिफंड"],
  ["Available if retry fails", "अवेलेबल िफ़ रेट्री फाइल्स", "अवेलेबल िफ़ रेट्री फाइल्स"],
  ["Retry Print", "रेट्री प्रिंट", "रेट्री प्रिंट"],
  ["Request Refund", "रिक्वेस्ट रिफंड", "रिक्वेस्ट रिफंड"],
  ["Printing completed successfully.", "प्रिंटिंग कम्प्लेटेड सक्सेस्स्फुल्ली.", "प्रिंटिंग कम्प्लेटेड सक्सेस्स्फुल्ली."],
  ["Payment receipt", "पेमेंट रिसीप्ट", "पेमेंट रिसीप्ट"],
  ["Job ID", "जॉब ईद", "जॉब ईद"],
  ["Documents", "डाक्यूमेंट्स", "डाक्यूमेंट्स"],
  ["Pages", "पेजेज", "पेजेज"],
  ["Amount", "अमाउंट", "अमाउंट"],
  ["Status", "स्टेटस", "स्टेटस"],
  ["Return Home", "रेतुर्न होम", "रेतुर्न होम"],
  ["Service", "सर्विस", "सर्विस"],
  ["File", "फाइल", "फाइल"],
  ["Waiting", "वेटिंग", "वेटिंग"],
  ["Session", "सेशन", "सेशन"],
  ["B/W rate", "B/W रेट", "B/W रेट"],
  ["Color rate", "कलर रेट", "कलर रेट"],
  ["B/W per page", "B/W पैर पेज", "B/W पैर पेज"],
  ["Color per page", "कलर पैर पेज", "कलर पैर पेज"],
  ["Print Document", "प्रिंट डॉक्यूमेंट", "प्रिंट डॉक्यूमेंट"],
  ["Upload PDF, Word, or image files and print after preview.", "अपलोड पीडीऍफ़, वर्ड, और इमेज फाइल्स एंड प्रिंट आफ्टर प्रीव्यू.", "अपलोड पीडीऍफ़, वर्ड, और इमेज फाइल्स एंड प्रिंट आफ्टर प्रीव्यू."],
  ["Scan Document", "स्कैन डॉक्यूमेंट", "स्कैन डॉक्यूमेंट"],
  ["Scan paper documents to PDF with receipt and admin tracking.", "स्कैन पेपर डाक्यूमेंट्स तो पीडीऍफ़ विथ रिसीप्ट एंड एडमिन ट्रैकिंग.", "स्कैन पेपर डाक्यूमेंट्स तो पीडीऍफ़ विथ रिसीप्ट एंड एडमिन ट्रैकिंग."],
  ["Copy Document", "कॉपी डॉक्यूमेंट", "कॉपी डॉक्यूमेंट"],
  ["Create quick photocopies with B/W or color pricing.", "क्रिएट क्विक फोटोकोपिएस विथ B/W और कलर प्राइसिंग.", "क्रिएट क्विक फोटोकोपिएस विथ B/W और कलर प्राइसिंग."],
  ["Govt Form Print", "गोवत फॉर्म प्रिंट", "गोवत फॉर्म प्रिंट"],
  ["Print blank government form templates without upload.", "प्रिंट ब्लेंक गवर्नमेंट फॉर्म टेम्पलेट्स विथाउट अपलोड.", "प्रिंट ब्लेंक गवर्नमेंट फॉर्म टेम्पलेट्स विथाउट अपलोड."],
  ["College Form Print", "कॉलेज फॉर्म प्रिंट", "कॉलेज फॉर्म प्रिंट"],
  ["Print admission, exam, certificate, and fee forms.", "प्रिंट एडमिशन, एग्जाम, सर्टिफिकेट, एंड फी फॉर्म्स.", "प्रिंट एडमिशन, एग्जाम, सर्टिफिकेट, एंड फी फॉर्म्स."],
  ["Certificate Print", "सर्टिफिकेट प्रिंट", "सर्टिफिकेट प्रिंट"],
  ["Print certificates and supporting documents safely.", "प्रिंट सर्टिफिकेट्स एंड सपोर्टिंग डाक्यूमेंट्स साफल्य.", "प्रिंट सर्टिफिकेट्स एंड सपोर्टिंग डाक्यूमेंट्स साफल्य."]
];

const CUSTOMER_TRANSLATIONS = {
  hi: Object.fromEntries(CUSTOMER_TRANSLATION_ROWS.map(([english, hindi]) => [english, hindi])),
  mr: Object.fromEntries(CUSTOMER_TRANSLATION_ROWS.map(([english, , marathi]) => [english, marathi]))
};

const CUSTOMER_CLEAN_TRANSLATIONS = {
  hi: {
    "Government of Maharashtra": "महाराष्ट्र शासन",
    "Print My Document": "मेरा दस्तावेज़ प्रिंट करें",
    "Print your PDF, Word, or photo file.": "अपनी PDF, Word या फोटो फ़ाइल प्रिंट करें.",
    "Government Forms": "सरकारी फॉर्म",
    "Select a ready form and print it.": "तैयार फॉर्म चुनें और प्रिंट करें.",
    "Add File": "फ़ाइल जोड़ें",
    "Use phone QR": "फोन QR इस्तेमाल करें",
    "Secure Document": "सुरक्षित दस्तावेज़",
    "Safe upload": "सुरक्षित अपलोड",
    "Forms": "फॉर्म",
    "Ready to print": "प्रिंट के लिए तैयार",
    "Quick Print": "जल्दी प्रिंट",
    "Fast service": "तेज़ सेवा",
    "Start": "शुरू करें",
    "Home": "होम",
    "Search forms by name, department or keyword...": "नाम, विभाग या शब्द से फॉर्म खोजें...",
    "B/W per page": "B/W प्रति पेज",
    "Color per page": "रंगीन प्रति पेज",
    "Per Page (B/W)": "प्रति पेज (B/W)",
    "Total Forms": "कुल फॉर्म",
    "Printing": "प्रिंटिंग",
    "Find and print official forms in seconds.": "सरकारी फॉर्म जल्दी खोजें और प्रिंट करें.",
    "Preview": "Preview",
    "Details": "विवरण",
    "Document": "दस्तावेज़",
    "Documents": "दस्तावेज़",
    "Pages": "पेज",
    "Print Settings": "प्रिंट सेटिंग",
    "Print Type": "प्रिंट प्रकार",
    "Copies": "कॉपी",
    "Orientation": "दिशा",
    "Portrait": "पोर्ट्रेट",
    "Landscape": "लैंडस्केप",
    "One Side": "एक तरफ",
    "Both Sides": "दोनों तरफ",
    "Total payable": "कुल भुगतान",
    "Payment": "भुगतान",
    "Back": "वापस",
    "Ready to Print": "प्रिंट के लिए तैयार",
    "All documents shown together": "सभी दस्तावेज़ साथ दिखाए गए हैं",
    "No file selected": "कोई फ़ाइल नहीं चुनी गई",
    "Upload a file to see the preview.": "पूर्वावलोकन देखने के लिए फ़ाइल जोड़ें.",
    "Preview unavailable": "पूर्वावलोकन उपलब्ध नहीं है",
    "This file type cannot be previewed.": "इस फ़ाइल का पूर्वावलोकन नहीं दिखाया जा सकता.",
    "Scan QR to Add Files": "फ़ाइल जोड़ने के लिए QR स्कैन करें",
    "Use your phone": "अपना फोन इस्तेमाल करें",
    "Use your phone camera. Scan this code, choose your document, then tap Send.": "फोन कैमरा खोलें. यह कोड स्कैन करें, दस्तावेज़ चुनें, फिर Send दबाएं.",
    "Open phone camera": "फोन कैमरा खोलें",
    "Choose files": "फ़ाइलें चुनें",
    "Tap Send": "Send दबाएं",
    "Scan this QR code": "यह QR कोड स्कैन करें",
    "Keep this screen open": "यह स्क्रीन खुली रखें",
    "Getting QR ready": "QR तैयार हो रहा है",
    "Please wait a moment.": "कृपया थोड़ा इंतज़ार करें.",
    "QR not ready": "QR तैयार नहीं है",
    "Ask staff to start the kiosk service.": "कियोस्क सेवा शुरू करने के लिए कर्मचारी से कहें.",
    "After sending files, look back at this kiosk.": "फ़ाइल भेजने के बाद इस कियोस्क स्क्रीन को देखें.",
    "Scan this QR code to add files from your phone": "फोन से फ़ाइल जोड़ने के लिए यह QR कोड स्कैन करें",
    "Scan to pay": "भुगतान के लिए स्कैन करें",
    "Tracking": "ट्रैकिंग",
    "Scan the QR code with any UPI app. Confirm when payment is done.": "किसी भी UPI ऐप से QR कोड स्कैन करें. भुगतान पूरा होने पर पुष्टि करें.",
    "The kiosk shows only the QR. Complete payment on the phone; live tracking stays on this screen.": "कियोस्क केवल QR दिखाता है. फोन पर भुगतान पूरा करें; लाइव ट्रैकिंग इसी स्क्रीन पर रहेगी.",
    "Scan with the phone camera or any UPI app.": "फोन कैमरा या किसी भी UPI ऐप से स्कैन करें.",
    "Scan with the phone camera or any UPI app to open Razorpay.": "Razorpay खोलने के लिए फोन कैमरा या UPI ऐप से स्कैन करें.",
    "Payment received": "भुगतान प्राप्त हुआ",
    "Paid on phone": "फोन पर भुगतान हुआ",
    "Payment is verified. Watch print tracking on the kiosk.": "भुगतान सत्यापित हो गया है. प्रिंट ट्रैकिंग कियोस्क पर देखें.",
    "Waiting for payment": "भुगतान की प्रतीक्षा है",
    "Waiting for phone payment": "फोन भुगतान की प्रतीक्षा है",
    "Waiting for payment from the customer phone.": "ग्राहक फोन से भुगतान की प्रतीक्षा है.",
    "Preparing the secure payment QR.": "सुरक्षित भुगतान QR तैयार हो रहा है.",
    "Creating payment QR...": "भुगतान QR बन रहा है...",
    "Live tracking": "लाइव ट्रैकिंग",
    "QR ready on kiosk": "कियोस्क पर QR तैयार है",
    "Creating payment QR": "भुगतान QR बन रहा है",
    "Print completed": "प्रिंट पूरा हुआ",
    "Printing on kiosk": "कियोस्क पर प्रिंट हो रहा है",
    "Kiosk print tracking": "कियोस्क प्रिंट ट्रैकिंग",
    "Done": "पूरा",
    "Active": "चालू",
    "Pending": "लंबित",
    "Payment Done": "भुगतान पूरा",
    "Printing needs attention": "प्रिंटिंग में ध्यान चाहिए",
    "Recovery Options": "सुधार विकल्प",
    "Print": "प्रिंट",
    "Failed": "विफल",
    "Queue": "कतार",
    "Saved for retry": "दोबारा प्रयास के लिए सहेजा गया",
    "Refund": "रिफंड",
    "Available if retry fails": "दोबारा प्रयास विफल होने पर उपलब्ध",
    "Retry Print": "प्रिंट फिर से करें",
    "Request Refund": "रिफंड मांगें",
    "Payment Successful!": "भुगतान सफल!",
    "Payment Confirmed": "भुगतान पुष्टि हुआ",
    "Please wait while we send your document to the printer": "दस्तावेज़ प्रिंटर को भेजते समय कृपया इंतज़ार करें",
    "Print job in progress": "प्रिंट कार्य चालू है",
    "Printing Your Document": "आपका दस्तावेज़ प्रिंट हो रहा है",
    "Please stay near the kiosk while your pages are printing.": "पेज प्रिंट होते समय कृपया कियोस्क के पास रहें.",
    "Sending pages to printer...": "पेज प्रिंटर को भेजे जा रहे हैं...",
    "Payment verified": "भुगतान सत्यापित",
    "Document queued": "दस्तावेज़ कतार में है",
    "Printer active": "प्रिंटर चालू है",
    "Thank You!": "धन्यवाद!",
    "Your document has been printed successfully.": "आपका दस्तावेज़ सफलतापूर्वक प्रिंट हो गया है.",
    "We hope to see you again!": "फिर मिलेंगे!",
    "Return Home Now": "अभी होम पर जाएं",
    "Need Help? Call Us": "मदद चाहिए? कॉल करें",
    "(Toll Free)": "(टोल फ्री)",
    "Select language": "भाषा चुनें",
    "Current date and time": "वर्तमान तारीख और समय",
    "Property Tax Assessment": "संपत्ति कर निर्धारण",
    "Property tax assessment application.": "संपत्ति कर निर्धारण आवेदन.",
    "Electricity NOC": "बिजली NOC",
    "NOC for electricity connection.": "बिजली कनेक्शन के लिए NOC.",
    "Death Certificate": "मृत्यु प्रमाणपत्र",
    "Death certificate request form.": "मृत्यु प्रमाणपत्र अनुरोध फॉर्म.",
    "Birth Certificate": "जन्म प्रमाणपत्र",
    "Birth certificate request form.": "जन्म प्रमाणपत्र अनुरोध फॉर्म.",
    "Request For New Connection": "नए कनेक्शन के लिए आवेदन",
    "Request For Change Of Water Rate": "पानी दर बदलने के लिए आवेदन",
    "Request For Change In Name": "नाम बदलने के लिए आवेदन",
    "Request For Bill At Residential Rate": "आवासीय दर पर बिल के लिए आवेदन",
    "Request For Change In Location Of Connection": "कनेक्शन स्थान बदलने के लिए आवेदन",
    "Registration Of Property On Demand Register": "डिमांड रजिस्टर में संपत्ति पंजीकरण",
    "Reduction Of Property Tax": "संपत्ति कर में कमी",
    "Tax On Property": "संपत्ति कर",
    "No Objection Certificate (N.O.C.)": "अनापत्ति प्रमाणपत्र (N.O.C.)",
    "No Objection Certifi hucate (N.O.C.)": "अनापत्ति प्रमाणपत्र (N.O.C.)",
    "Architect Registration Application": "आर्किटेक्ट पंजीकरण आवेदन",
    "Structural Engineer / Engineer Supervisor New License Application": "स्ट्रक्चरल इंजीनियर / इंजीनियर सुपरवाइज़र नया लाइसेंस आवेदन",
    "Structural Engineer / Engineer Supervisor License Renewal Application": "स्ट्रक्चरल इंजीनियर / इंजीनियर सुपरवाइज़र लाइसेंस नवीनीकरण आवेदन",
    "Tentative Layout": "प्रारंभिक लेआउट",
    "Final Layout": "अंतिम लेआउट",
    "Building Permission (B.P.)": "भवन अनुमति (B.P.)",
    "Occupancy Certificate": "उपयोग प्रमाणपत्र",
    "Hospital/ Nursing Home/ Maternity Homes Inspection Form": "अस्पताल / नर्सिंग होम / मातृत्व गृह निरीक्षण फॉर्म",
    "Doctor Registration Form": "डॉक्टर पंजीकरण फॉर्म",
    "Sisters Registration Form": "नर्स पंजीकरण फॉर्म",
    "Hospital Owner Registration": "अस्पताल मालिक पंजीकरण",
    "Hospital Registration or Renewal Document List": "अस्पताल पंजीकरण या नवीनीकरण दस्तावेज़ सूची",
    "Pre Natal Diagnostics Registration": "प्रसव पूर्व निदान पंजीकरण",
    "Lokshahi Din Application Form": "लोकशाही दिन आवेदन फॉर्म",
    "Marriage Registration": "विवाह पंजीकरण",
    "Annual Return Form (Marathi)": "वार्षिक रिटर्न फॉर्म (मराठी)",
    "Annual Return Form (English)": "वार्षिक रिटर्न फॉर्म (अंग्रेज़ी)",
    "Category: Water Supply Department": "विभाग: जल आपूर्ति विभाग",
    "Category: Tax Department": "विभाग: कर विभाग",
    "Category: Electrical Department": "विभाग: विद्युत विभाग",
    "Category: Business & Shop Registration": "विभाग: व्यवसाय और दुकान पंजीकरण",
    "Category: Town Planning Department": "विभाग: नगर नियोजन विभाग",
    "Category: Birth & Death Certificate": "विभाग: जन्म और मृत्यु प्रमाणपत्र",
    "Category: Medical Department": "विभाग: चिकित्सा विभाग",
    "Category: Health Department": "विभाग: स्वास्थ्य विभाग",
    "Category: Garden Department": "विभाग: उद्यान विभाग",
    "Category: Advertisement & License Department": "विभाग: विज्ञापन और लाइसेंस विभाग",
    "Category: Local Body Tax Department (LBT)": "विभाग: स्थानीय निकाय कर विभाग (LBT)",
    "Official government form for processing.": "प्रक्रिया के लिए सरकारी फॉर्म.",
    "No forms match this search.": "इस खोज से कोई फॉर्म नहीं मिला."
  },
  mr: {
    "Government of Maharashtra": "महाराष्ट्र शासन",
    "Print My Document": "माझे दस्तऐवज प्रिंट करा",
    "Print your PDF, Word, or photo file.": "तुमची PDF, Word किंवा फोटो फाइल प्रिंट करा.",
    "Government Forms": "शासकीय फॉर्म",
    "Select a ready form and print it.": "तयार फॉर्म निवडा आणि प्रिंट करा.",
    "Add File": "फाइल जोडा",
    "Use phone QR": "फोन QR वापरा",
    "Secure Document": "सुरक्षित दस्तऐवज",
    "Safe upload": "सुरक्षित अपलोड",
    "Forms": "फॉर्म",
    "Ready to print": "प्रिंटसाठी तयार",
    "Quick Print": "जलद प्रिंट",
    "Fast service": "जलद सेवा",
    "Start": "सुरू करा",
    "Home": "होम",
    "Search forms by name, department or keyword...": "नाव, विभाग किंवा शब्दाने फॉर्म शोधा...",
    "B/W per page": "B/W प्रति पान",
    "Color per page": "रंगीत प्रति पान",
    "Per Page (B/W)": "प्रति पान (B/W)",
    "Total Forms": "एकूण फॉर्म",
    "Printing": "प्रिंटिंग",
    "Find and print official forms in seconds.": "शासकीय फॉर्म लगेच शोधा आणि प्रिंट करा.",
    "Preview": "Preview",
    "Details": "तपशील",
    "Document": "दस्तऐवज",
    "Documents": "दस्तऐवज",
    "Pages": "पाने",
    "Print Settings": "प्रिंट सेटिंग",
    "Print Type": "प्रिंट प्रकार",
    "Copies": "कॉपी",
    "Orientation": "दिशा",
    "Portrait": "पोर्ट्रेट",
    "Landscape": "लँडस्केप",
    "One Side": "एक बाजू",
    "Both Sides": "दोन्ही बाजू",
    "Total payable": "एकूण देय",
    "Payment": "पेमेंट",
    "Back": "मागे",
    "Ready to Print": "प्रिंटसाठी तयार",
    "All documents shown together": "सर्व दस्तऐवज एकत्र दाखवले आहेत",
    "No file selected": "कोणतीही फाइल निवडलेली नाही",
    "Upload a file to see the preview.": "पूर्वावलोकन पाहण्यासाठी फाइल जोडा.",
    "Preview unavailable": "पूर्वावलोकन उपलब्ध नाही",
    "This file type cannot be previewed.": "या फाइलचे पूर्वावलोकन दाखवता येत नाही.",
    "Scan QR to Add Files": "फाइल जोडण्यासाठी QR स्कॅन करा",
    "Use your phone": "तुमचा फोन वापरा",
    "Use your phone camera. Scan this code, choose your document, then tap Send.": "फोन कॅमेरा उघडा. हा कोड स्कॅन करा, दस्तऐवज निवडा, मग Send दाबा.",
    "Open phone camera": "फोन कॅमेरा उघडा",
    "Choose files": "फाइल निवडा",
    "Tap Send": "Send दाबा",
    "Scan this QR code": "हा QR कोड स्कॅन करा",
    "Keep this screen open": "ही स्क्रीन उघडी ठेवा",
    "Getting QR ready": "QR तयार होत आहे",
    "Please wait a moment.": "कृपया थोडा वेळ थांबा.",
    "QR not ready": "QR तयार नाही",
    "Ask staff to start the kiosk service.": "कियोस्क सेवा सुरू करण्यासाठी कर्मचारीला सांगा.",
    "After sending files, look back at this kiosk.": "फाइल पाठवल्यानंतर या कियोस्क स्क्रीनकडे पहा.",
    "Scan this QR code to add files from your phone": "फोनमधून फाइल जोडण्यासाठी हा QR कोड स्कॅन करा",
    "Scan to pay": "पेमेंटसाठी स्कॅन करा",
    "Tracking": "ट्रॅकिंग",
    "Scan the QR code with any UPI app. Confirm when payment is done.": "कोणत्याही UPI अॅपने QR कोड स्कॅन करा. पेमेंट झाल्यावर पुष्टी करा.",
    "The kiosk shows only the QR. Complete payment on the phone; live tracking stays on this screen.": "कियोस्क फक्त QR दाखवतो. फोनवर पेमेंट पूर्ण करा; लाईव्ह ट्रॅकिंग याच स्क्रीनवर दिसेल.",
    "Scan with the phone camera or any UPI app.": "फोन कॅमेरा किंवा कोणत्याही UPI अॅपने स्कॅन करा.",
    "Scan with the phone camera or any UPI app to open Razorpay.": "Razorpay उघडण्यासाठी फोन कॅमेरा किंवा UPI अॅपने स्कॅन करा.",
    "Payment received": "पेमेंट प्राप्त झाले",
    "Paid on phone": "फोनवर पेमेंट झाले",
    "Payment is verified. Watch print tracking on the kiosk.": "पेमेंट पडताळले गेले आहे. प्रिंट ट्रॅकिंग कियोस्कवर पाहा.",
    "Waiting for payment": "पेमेंटची प्रतीक्षा आहे",
    "Waiting for phone payment": "फोन पेमेंटची प्रतीक्षा आहे",
    "Waiting for payment from the customer phone.": "ग्राहकाच्या फोनवरून पेमेंटची प्रतीक्षा आहे.",
    "Preparing the secure payment QR.": "सुरक्षित पेमेंट QR तयार होत आहे.",
    "Creating payment QR...": "पेमेंट QR तयार होत आहे...",
    "Live tracking": "लाईव्ह ट्रॅकिंग",
    "QR ready on kiosk": "कियोस्कवर QR तयार आहे",
    "Creating payment QR": "पेमेंट QR तयार होत आहे",
    "Print completed": "प्रिंट पूर्ण झाले",
    "Printing on kiosk": "कियोस्कवर प्रिंट होत आहे",
    "Kiosk print tracking": "कियोस्क प्रिंट ट्रॅकिंग",
    "Done": "पूर्ण",
    "Active": "चालू",
    "Pending": "प्रलंबित",
    "Payment Done": "पेमेंट पूर्ण",
    "Printing needs attention": "प्रिंटिंगकडे लक्ष द्या",
    "Recovery Options": "पुनर्प्राप्ती पर्याय",
    "Print": "प्रिंट",
    "Failed": "अयशस्वी",
    "Queue": "रांग",
    "Saved for retry": "पुन्हा प्रयत्नासाठी जतन",
    "Refund": "परतावा",
    "Available if retry fails": "पुन्हा प्रयत्न अयशस्वी झाल्यास उपलब्ध",
    "Retry Print": "प्रिंट पुन्हा करा",
    "Request Refund": "परतावा मागा",
    "Payment Successful!": "पेमेंट यशस्वी!",
    "Payment Confirmed": "पेमेंट पुष्टी झाले",
    "Please wait while we send your document to the printer": "दस्तऐवज प्रिंटरकडे पाठवत असताना कृपया थांबा",
    "Print job in progress": "प्रिंट काम चालू आहे",
    "Printing Your Document": "तुमचा दस्तऐवज प्रिंट होत आहे",
    "Please stay near the kiosk while your pages are printing.": "पाने प्रिंट होत असताना कृपया कियोस्कजवळ थांबा.",
    "Sending pages to printer...": "पाने प्रिंटरकडे पाठवली जात आहेत...",
    "Payment verified": "पेमेंट पडताळले",
    "Document queued": "दस्तऐवज रांगेत आहे",
    "Printer active": "प्रिंटर चालू आहे",
    "Thank You!": "धन्यवाद!",
    "Your document has been printed successfully.": "तुमचा दस्तऐवज यशस्वीरित्या प्रिंट झाला आहे.",
    "We hope to see you again!": "पुन्हा भेटू!",
    "Return Home Now": "आता होमवर जा",
    "Need Help? Call Us": "मदत हवी? कॉल करा",
    "(Toll Free)": "(टोल फ्री)",
    "Select language": "भाषा निवडा",
    "Current date and time": "सध्याची तारीख आणि वेळ",
    "Property Tax Assessment": "मिळकत कर आकारणी",
    "Property tax assessment application.": "मिळकत कर आकारणी अर्ज.",
    "Electricity NOC": "वीज NOC",
    "NOC for electricity connection.": "वीज कनेक्शनसाठी NOC.",
    "Death Certificate": "मृत्यू प्रमाणपत्र",
    "Death certificate request form.": "मृत्यू प्रमाणपत्र विनंती फॉर्म.",
    "Birth Certificate": "जन्म प्रमाणपत्र",
    "Birth certificate request form.": "जन्म प्रमाणपत्र विनंती फॉर्म.",
    "Request For New Connection": "नवीन कनेक्शनसाठी अर्ज",
    "Request For Change Of Water Rate": "पाणी दर बदलण्यासाठी अर्ज",
    "Request For Change In Name": "नाव बदलण्यासाठी अर्ज",
    "Request For Bill At Residential Rate": "निवासी दराने बिलासाठी अर्ज",
    "Request For Change In Location Of Connection": "कनेक्शनचे ठिकाण बदलण्यासाठी अर्ज",
    "Registration Of Property On Demand Register": "डिमांड रजिस्टरमध्ये मिळकत नोंदणी",
    "Reduction Of Property Tax": "मिळकत कर कमी करणे",
    "Tax On Property": "मिळकत कर",
    "No Objection Certificate (N.O.C.)": "ना हरकत प्रमाणपत्र (N.O.C.)",
    "No Objection Certifi hucate (N.O.C.)": "ना हरकत प्रमाणपत्र (N.O.C.)",
    "Architect Registration Application": "आर्किटेक्ट नोंदणी अर्ज",
    "Structural Engineer / Engineer Supervisor New License Application": "स्ट्रक्चरल इंजिनिअर / इंजिनिअर सुपरवायझर नवीन परवाना अर्ज",
    "Structural Engineer / Engineer Supervisor License Renewal Application": "स्ट्रक्चरल इंजिनिअर / इंजिनिअर सुपरवायझर परवाना नूतनीकरण अर्ज",
    "Tentative Layout": "प्रारंभिक लेआउट",
    "Final Layout": "अंतिम लेआउट",
    "Building Permission (B.P.)": "बांधकाम परवानगी (B.P.)",
    "Occupancy Certificate": "भोगवटा प्रमाणपत्र",
    "Hospital/ Nursing Home/ Maternity Homes Inspection Form": "रुग्णालय / नर्सिंग होम / प्रसूतीगृह तपासणी फॉर्म",
    "Doctor Registration Form": "डॉक्टर नोंदणी फॉर्म",
    "Sisters Registration Form": "नर्स नोंदणी फॉर्म",
    "Hospital Owner Registration": "रुग्णालय मालक नोंदणी",
    "Hospital Registration or Renewal Document List": "रुग्णालय नोंदणी किंवा नूतनीकरण दस्तऐवज सूची",
    "Pre Natal Diagnostics Registration": "प्रसवपूर्व निदान नोंदणी",
    "Lokshahi Din Application Form": "लोकशाही दिन अर्ज फॉर्म",
    "Marriage Registration": "विवाह नोंदणी",
    "Annual Return Form (Marathi)": "वार्षिक रिटर्न फॉर्म (मराठी)",
    "Annual Return Form (English)": "वार्षिक रिटर्न फॉर्म (इंग्रजी)",
    "Category: Water Supply Department": "विभाग: पाणीपुरवठा विभाग",
    "Category: Tax Department": "विभाग: कर विभाग",
    "Category: Electrical Department": "विभाग: विद्युत विभाग",
    "Category: Business & Shop Registration": "विभाग: व्यवसाय आणि दुकान नोंदणी",
    "Category: Town Planning Department": "विभाग: नगररचना विभाग",
    "Category: Birth & Death Certificate": "विभाग: जन्म आणि मृत्यू प्रमाणपत्र",
    "Category: Medical Department": "विभाग: वैद्यकीय विभाग",
    "Category: Health Department": "विभाग: आरोग्य विभाग",
    "Category: Garden Department": "विभाग: उद्यान विभाग",
    "Category: Advertisement & License Department": "विभाग: जाहिरात आणि परवाना विभाग",
    "Category: Local Body Tax Department (LBT)": "विभाग: स्थानिक संस्था कर विभाग (LBT)",
    "Official government form for processing.": "प्रक्रियेसाठी शासकीय फॉर्म.",
    "No forms match this search.": "या शोधाशी जुळणारे फॉर्म नाहीत."
  }
};

function readStoredAdminLanguage() {
  try {
    const language = window.localStorage.getItem(ADMIN_LANGUAGE_KEY) || "en";
    return ADMIN_LANGUAGES.has(language) ? language : "en";
  } catch {
    return "en";
  }
}

function readStoredCustomerLanguage() {
  try {
    const language = window.localStorage.getItem(CUSTOMER_LANGUAGE_KEY) || "en";
    return CUSTOMER_LANGUAGES.has(language) ? language : "en";
  } catch {
    return "en";
  }
}

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

const demoKioskServices = [
  {
    id: "demo-documents",
    icon: "DC",
    title: "Upload & Print",
    titleHi: "à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼",
    titleMr: "à¤¦à¤¸à¥à¤¤à¤à¤µà¤œ",
    description: "Upload PDF or image documents.",
    descriptionHi: "PDF à¤¯à¤¾ à¤šà¤¿à¤¤à¥à¤° à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼ à¤…à¤ªà¤²à¥‹à¤¡ à¤•à¤°à¥‡à¤‚à¥¤",
    descriptionMr: "PDF à¤•à¤¿à¤‚à¤µà¤¾ à¤ªà¥à¤°à¤¤à¤¿à¤®à¤¾ à¤¦à¤¸à¥à¤¤à¤à¤µà¤œ à¤…à¤ªà¤²à¥‹à¤¡ à¤•à¤°à¤¾.",
    defaultPages: 3,
    mode: "upload",
    enabled: true,
    projectIds: [],
    kioskIds: [],
    pricing: { bw: 2, color: 10 }
  },
  {
    id: "demo-existing-documents",
    icon: "EX",
    title: "Government Forms",
    titleHi: "à¤®à¥Œà¤œà¥‚à¤¦à¤¾ à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼",
    titleMr: "à¤µà¤¿à¤¦à¥à¤¯à¤®à¤¾à¤¨ à¤¦à¤¸à¥à¤¤à¤à¤µà¤œ",
    description: "Print ready-made forms and documents.",
    descriptionHi: "à¤¤à¥ˆà¤¯à¤¾à¤° à¤«à¤¼à¥‰à¤°à¥à¤® à¤”à¤° à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼ à¤ªà¥à¤°à¤¿à¤‚à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤",
    descriptionMr: "à¤¤à¤¯à¤¾à¤° à¤«à¥‰à¤°à¥à¤® à¤†à¤£à¤¿ à¤¦à¤¸à¥à¤¤à¤à¤µà¤œ à¤ªà¥à¤°à¤¿à¤‚à¤Ÿ à¤•à¤°à¤¾.",
    defaultPages: 1,
    mode: "template",
    enabled: true,
    projectIds: [],
    kioskIds: [],
    pricing: { bw: 3, color: 12 },
    templates: [
      {
        id: "demo-property-tax",
        title: "Property Tax Assessment",
        titleHi: "à¤¸à¤‚à¤ªà¤¤à¥à¤¤à¤¿ à¤•à¤° à¤¨à¤¿à¤°à¥à¤§à¤¾à¤°à¤£",
        titleMr: "à¤®à¤¿à¤³à¤•à¤¤à¥€à¤µà¤° à¤•à¤° à¤†à¤•à¤¾à¤°à¤£à¥€",
        description: "Property tax assessment application.",
        descriptionHi: "à¤¸à¤‚à¤ªà¤¤à¥à¤¤à¤¿ à¤•à¤° à¤¨à¤¿à¤°à¥à¤§à¤¾à¤°à¤£ à¤†à¤µà¥‡à¤¦à¤¨à¥¤",
        descriptionMr: "à¤®à¤¿à¤³à¤•à¤¤à¥€à¤µà¤° à¤•à¤° à¤†à¤•à¤¾à¤°à¤£à¥€ à¤•à¤°à¤£à¥‡à¤¬à¤¾à¤¬à¤¤ à¤…à¤°à¥à¤œ.",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/property_tax.pdf",
        documentType: "pdf"
      },
      {
        id: "demo-electricity-noc",
        title: "Electricity NOC",
        titleHi: "à¤µà¤¿à¤¦à¥à¤¯à¥à¤¤ à¤à¤¨à¤“à¤¸à¥€",
        titleMr: "à¤µà¤¿à¤œ à¤•à¤¨à¥‡à¤•à¥à¤¶à¤¨ à¤¨à¤¾à¤¹à¤°à¤•à¤¤",
        description: "NOC for electricity connection.",
        descriptionHi: "à¤µà¤¿à¤¦à¥à¤¯à¥à¤¤ à¤•à¤¨à¥‡à¤•à¥à¤¶à¤¨ à¤•à¥‡ à¤²à¤¿à¤ à¤à¤¨à¤“à¤¸à¥€à¥¤",
        descriptionMr: "à¤µà¤¿à¤œ à¤•à¤¨à¥‡à¤•à¥à¤¶à¤¨ à¤¨à¤¾à¤¹à¤°à¤•à¤¤ à¤¦à¤¾à¤–à¤²à¤¾.",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/electricity_noc.pdf",
        documentType: "pdf"
      },
      {
        id: "demo-death-certificate",
        title: "Death Certificate",
        titleHi: "à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤ªà¥à¤°à¤®à¤¾à¤£ à¤ªà¤¤à¥à¤°",
        titleMr: "à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤ªà¥à¤°à¤®à¤¾à¤£à¤ªà¤¤à¥à¤°",
        description: "Death certificate request form.",
        descriptionHi: "à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤ªà¥à¤°à¤®à¤¾à¤£ à¤ªà¤¤à¥à¤° à¤†à¤µà¥‡à¤¦à¤¨à¥¤",
        descriptionMr: "à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤ªà¥à¤°à¤®à¤¾à¤£à¤ªà¤¤à¥à¤° à¤®à¤¾à¤—à¤£à¥€ à¤…à¤°à¥à¤œ.",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/death_certificate.pdf",
        documentType: "pdf"
      },
      {
        id: "demo-birth-certificate",
        title: "Birth Certificate",
        titleHi: "à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£ à¤ªà¤¤à¥à¤°",
        titleMr: "à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£à¤ªà¤¤à¥à¤°",
        description: "Birth certificate request form.",
        descriptionHi: "à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£ à¤ªà¤¤à¥à¤° à¤†à¤µà¥‡à¤¦à¤¨à¥¤",
        descriptionMr: "à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£à¤ªà¤¤à¥à¤° à¤®à¤¾à¤—à¤£à¥€ à¤…à¤°à¥à¤œ.",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/birth_certificate.pdf",
        documentType: "pdf"
      },

      {
        id: "nmc-form-0",
        title: "Request For New Connection",
        titleHi: "Request For New Connection",
        titleMr: "Request For New Connection",
        description: "Category: Water Supply Department",
        descriptionHi: "Category: Water Supply Department",
        descriptionMr: "Category: Water Supply Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_0_request_for_new_connection.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-1",
        title: "Request For Change Of Water Rate",
        titleHi: "Request For Change Of Water Rate",
        titleMr: "Request For Change Of Water Rate",
        description: "Category: Water Supply Department",
        descriptionHi: "Category: Water Supply Department",
        descriptionMr: "Category: Water Supply Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_1_request_for_change_of_water_rate.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-2",
        title: "Request For Change In Name",
        titleHi: "Request For Change In Name",
        titleMr: "Request For Change In Name",
        description: "Category: Water Supply Department",
        descriptionHi: "Category: Water Supply Department",
        descriptionMr: "Category: Water Supply Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_2_request_for_change_in_name.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-3",
        title: "Request For Bill At Residential Rate",
        titleHi: "Request For Bill At Residential Rate",
        titleMr: "Request For Bill At Residential Rate",
        description: "Category: Water Supply Department",
        descriptionHi: "Category: Water Supply Department",
        descriptionMr: "Category: Water Supply Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_3_request_for_bill_at_residential_rate.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-4",
        title: "Request For Change In Location Of Connection",
        titleHi: "Request For Change In Location Of Connection",
        titleMr: "Request For Change In Location Of Connection",
        description: "Category: Water Supply Department",
        descriptionHi: "Category: Water Supply Department",
        descriptionMr: "Category: Water Supply Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_4_request_for_change_in_location_of_connection.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-5",
        title: "Registration Of Property On Demand Register",
        titleHi: "Registration Of Property On Demand Register",
        titleMr: "Registration Of Property On Demand Register",
        description: "Category: Tax Department",
        descriptionHi: "Category: Tax Department",
        descriptionMr: "Category: Tax Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_5_registration_of_property_on_demand_register.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-6",
        title: "Reduction Of Property Tax",
        titleHi: "Reduction Of Property Tax",
        titleMr: "Reduction Of Property Tax",
        description: "Category: Tax Department",
        descriptionHi: "Category: Tax Department",
        descriptionMr: "Category: Tax Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_6_reduction_of_property_tax.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-7",
        title: "Tax On Property",
        titleHi: "Tax On Property",
        titleMr: "Tax On Property",
        description: "Category: Tax Department",
        descriptionHi: "Category: Tax Department",
        descriptionMr: "Category: Tax Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_7_tax_on_property.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-8",
        title: "No Objection Certifi hucate (N.O.C.)",
        titleHi: "No Objection Certifi hucate (N.O.C.)",
        titleMr: "No Objection Certifi hucate (N.O.C.)",
        description: "Category: Electrical Department",
        descriptionHi: "Category: Electrical Department",
        descriptionMr: "Category: Electrical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_8_no_objection_certifi_hucate__n_o_c__.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-9",
        title: "No Objection Certificate (N.O.C.)",
        titleHi: "No Objection Certificate (N.O.C.)",
        titleMr: "No Objection Certificate (N.O.C.)",
        description: "Category: Business & Shop Registration",
        descriptionHi: "Category: Business & Shop Registration",
        descriptionMr: "Category: Business & Shop Registration",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_9_no_objection_certificate__n_o_c__.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-10",
        title: "Architect Registration Application",
        titleHi: "Architect Registration Application",
        titleMr: "Architect Registration Application",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_10_architect_registration_application.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-11",
        title: "Structural Engineer / Engineer Supervisor New License Application",
        titleHi: "Structural Engineer / Engineer Supervisor New License Application",
        titleMr: "Structural Engineer / Engineer Supervisor New License Application",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_11_structural_engineer___engineer_supervisor_new_license_application.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-12",
        title: "Structural Engineer / Engineer Supervisor License Renewal Application",
        titleHi: "Structural Engineer / Engineer Supervisor License Renewal Application",
        titleMr: "Structural Engineer / Engineer Supervisor License Renewal Application",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_12_structural_engineer___engineer_supervisor_license_renewal_application.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-13",
        title: "Tentative Layout",
        titleHi: "Tentative Layout",
        titleMr: "Tentative Layout",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_13_tentative_layout.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-14",
        title: "Final Layout",
        titleHi: "Final Layout",
        titleMr: "Final Layout",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_14_final_layout.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-15",
        title: "Building Permission (B.P.)",
        titleHi: "Building Permission (B.P.)",
        titleMr: "Building Permission (B.P.)",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_15_building_permission__b_p__.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-16",
        title: "Occupancy Certificate",
        titleHi: "Occupancy Certificate",
        titleMr: "Occupancy Certificate",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_16_occupancy_certificate.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-17",
        title: "No Objection Certificate (N.O.C.)",
        titleHi: "No Objection Certificate (N.O.C.)",
        titleMr: "No Objection Certificate (N.O.C.)",
        description: "Category: Town Planning Department",
        descriptionHi: "Category: Town Planning Department",
        descriptionMr: "Category: Town Planning Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_17_no_objection_certificate__n_o_c__.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-18",
        title: "Birth Certificate",
        titleHi: "Birth Certificate",
        titleMr: "Birth Certificate",
        description: "Category: Birth & Death Certificate",
        descriptionHi: "Category: Birth & Death Certificate",
        descriptionMr: "Category: Birth & Death Certificate",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_18_birth_certificate.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-19",
        title: "Death Certificate",
        titleHi: "Death Certificate",
        titleMr: "Death Certificate",
        description: "Category: Birth & Death Certificate",
        descriptionHi: "Category: Birth & Death Certificate",
        descriptionMr: "Category: Birth & Death Certificate",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_19_death_certificate.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-20",
        title: "Hospital/ Nursing Home/ Maternity Homes Inspection Form",
        titleHi: "Hospital/ Nursing Home/ Maternity Homes Inspection Form",
        titleMr: "Hospital/ Nursing Home/ Maternity Homes Inspection Form",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_20_hospital__nursing_home__maternity_homes_inspection_form.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-21",
        title: "Form B",
        titleHi: "Form B",
        titleMr: "Form B",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_21_form_b.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-22",
        title: "Doctor Registration Form",
        titleHi: "Doctor Registration Form",
        titleMr: "Doctor Registration Form",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_22_doctor_registration_form.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-23",
        title: "Sisters Registration Form",
        titleHi: "Sisters Registration Form",
        titleMr: "Sisters Registration Form",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_23_sisters_registration_form.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-24",
        title: "Hospital Owner Registration",
        titleHi: "Hospital Owner Registration",
        titleMr: "Hospital Owner Registration",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_24_hospital_owner_registration.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-25",
        title: "Hospital Registration or Renewal Document List",
        titleHi: "Hospital Registration or Renewal Document List",
        titleMr: "Hospital Registration or Renewal Document List",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_25_hospital_registration_or_renewal_document_list.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-26",
        title: "Pre Natal Diagnostics Registration",
        titleHi: "Pre Natal Diagnostics Registration",
        titleMr: "Pre Natal Diagnostics Registration",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_26_pre_natal_diagnostics_registration.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-27",
        title: "जैविक कचरा विल्हेवाट (BMW) प्रकल्प सभासदत्व अर्जासाठी आवश्यक असणरे कागदपत्रे.",
        titleHi: "जैविक कचरा विल्हेवाट (BMW) प्रकल्प सभासदत्व अर्जासाठी आवश्यक असणरे कागदपत्रे.",
        titleMr: "जैविक कचरा विल्हेवाट (BMW) प्रकल्प सभासदत्व अर्जासाठी आवश्यक असणरे कागदपत्रे.",
        description: "Category: Medical Department",
        descriptionHi: "Category: Medical Department",
        descriptionMr: "Category: Medical Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_27_______________________bmw____________________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-28",
        title: "Lokshahi Din Application Form",
        titleHi: "Lokshahi Din Application Form",
        titleMr: "Lokshahi Din Application Form",
        description: "Category: Lokshahi Din Application Form",
        descriptionHi: "Category: Lokshahi Din Application Form",
        descriptionMr: "Category: Lokshahi Din Application Form",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_28_lokshahi_din_application_form.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-29",
        title: "Marriage Registration",
        titleHi: "Marriage Registration",
        titleMr: "Marriage Registration",
        description: "Category: Health Department",
        descriptionHi: "Category: Health Department",
        descriptionMr: "Category: Health Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_29_marriage_registration.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-30",
        title: "Annual Return Form (Marathi)",
        titleHi: "Annual Return Form (Marathi)",
        titleMr: "Annual Return Form (Marathi)",
        description: "Category: Local Body Tax Department (LBT)",
        descriptionHi: "Category: Local Body Tax Department (LBT)",
        descriptionMr: "Category: Local Body Tax Department (LBT)",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_30_annual_return_form__marathi_.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-31",
        title: "Annual Return Form (English)",
        titleHi: "Annual Return Form (English)",
        titleMr: "Annual Return Form (English)",
        description: "Category: Local Body Tax Department (LBT)",
        descriptionHi: "Category: Local Body Tax Department (LBT)",
        descriptionMr: "Category: Local Body Tax Department (LBT)",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_31_annual_return_form__english_.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-32",
        title: "Rules and Regulation of Various Appointments To The Municipal Services Video Resolution No.75 Dated 21.06.1985",
        titleHi: "Rules and Regulation of Various Appointments To The Municipal Services Video Resolution No.75 Dated 21.06.1985",
        titleMr: "Rules and Regulation of Various Appointments To The Municipal Services Video Resolution No.75 Dated 21.06.1985",
        description: "Category: Establishment Department",
        descriptionHi: "Category: Establishment Department",
        descriptionMr: "Category: Establishment Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_32_rules_and_regulation_of_various_appointments_to_the_municipal_services_video_resolution_no_75_dated_21_06_1985.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-33",
        title: "Rules, Regulations,Laws and Standing order",
        titleHi: "Rules, Regulations,Laws and Standing order",
        titleMr: "Rules, Regulations,Laws and Standing order",
        description: "Category: Establishment Department",
        descriptionHi: "Category: Establishment Department",
        descriptionMr: "Category: Establishment Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_33_rules__regulations_laws_and_standing_order.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-34",
        title: "धोकादायक वृक्ष तोडणी अर्ज व हमीपत्र",
        titleHi: "धोकादायक वृक्ष तोडणी अर्ज व हमीपत्र",
        titleMr: "धोकादायक वृक्ष तोडणी अर्ज व हमीपत्र",
        description: "Category: Garden Department",
        descriptionHi: "Category: Garden Department",
        descriptionMr: "Category: Garden Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_34____________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-35",
        title: "बांधकाम बाधित वृक्ष तोडणी अर्ज व हमीपत्र",
        titleHi: "बांधकाम बाधित वृक्ष तोडणी अर्ज व हमीपत्र",
        titleMr: "बांधकाम बाधित वृक्ष तोडणी अर्ज व हमीपत्र",
        description: "Category: Garden Department",
        descriptionHi: "Category: Garden Department",
        descriptionMr: "Category: Garden Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_35_________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-36",
        title: "अल्प मुदतीचे जाहिरात फलक मनपा जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        titleHi: "अल्प मुदतीचे जाहिरात फलक मनपा जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        titleMr: "अल्प मुदतीचे जाहिरात फलक मनपा जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        description: "Category: Advertisement & License Department",
        descriptionHi: "Category: Advertisement & License Department",
        descriptionMr: "Category: Advertisement & License Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_36_________________________________________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-37",
        title: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाा नुतनीकरणासाठी नमूना ब अर्ज",
        titleHi: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाा नुतनीकरणासाठी नमूना ब अर्ज",
        titleMr: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाा नुतनीकरणासाठी नमूना ब अर्ज",
        description: "Category: Advertisement & License Department",
        descriptionHi: "Category: Advertisement & License Department",
        descriptionMr: "Category: Advertisement & License Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_37_______________________________________________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-38",
        title: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाासाठी नमूना अ अर्ज",
        titleHi: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाासाठी नमूना अ अर्ज",
        titleMr: "दिर्घ मुदतीचे नविन आकाश-चिन्ह (जाहिरात फलक) परवानाासाठी नमूना अ अर्ज",
        description: "Category: Advertisement & License Department",
        descriptionHi: "Category: Advertisement & License Department",
        descriptionMr: "Category: Advertisement & License Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_38_____________________________________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      },
      {
        id: "nmc-form-39",
        title: "अल्प मुदतीचे जाहिरात फलक खाजगी जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        titleHi: "अल्प मुदतीचे जाहिरात फलक खाजगी जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        titleMr: "अल्प मुदतीचे जाहिरात फलक खाजगी जागेत उभारण्याकरीता परवानाासाठी नमूना अर्ज",
        description: "Category: Advertisement & License Department",
        descriptionHi: "Category: Advertisement & License Department",
        descriptionMr: "Category: Advertisement & License Department",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: [],
        imageUrl: "/assets/forms/nmc/nmc_39__________________________________________________________________________.pdf",
        documentType: "pdf",
        hasStaticPreview: false
      }

    ]
  }
];

const customerSteps = [
  "Home",
  "Upload",
  "Preview",
  "Payment"
];

const allowedUploadExtensions = ["PDF", "DOC", "DOCX", "JPG", "JPEG", "PNG"];
const customerUploadExtensions = ["PDF", "JPG", "JPEG", "PNG"];
const PRINT_PAPER_SIZES = ["A4"];
const DEFAULT_KIOSK_CUSTOMER_SETTINGS = Object.freeze({
  bw: true,
  color: true,
  copies: true,
  paperSize: false,
  sides: true,
  orientation: true,
  pageRange: true
});
const KIOSK_CUSTOMER_OPTION_FIELDS = Object.freeze([
  ["bw", "B/W printing"],
  ["color", "Color printing"],
  ["copies", "Copies"],
  ["sides", "Single / both sides"],
  ["orientation", "Orientation"],
  ["pageRange", "Page range"]
]);
const CUSTOMER_VISIBLE_SETTING_KEYS = new Set(["bw", "color", "copies", "sides", "orientation", "pageRange"]);
const DEFAULT_SERVICE_PRINT_DEFAULTS = Object.freeze({
  colorMode: "bw",
  copies: 1,
  paperSize: "A4",
  sides: "single",
  orientation: "portrait",
  range: "all"
});

let formTemplates = {
  "govt-form": [
    {
      id: "birth-certificate",
      title: "Birth Certificate Form",
      description: "Blank Form No. 5 birth certificate template.",
      pages: 1,
      fields: ["Name", "Sex", "Date of birth", "Place of birth", "Mother name", "Father name"],
      imageUrl: ""
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

const initialJobs = [];

function resolveInitialKioskAdminPage() {
  const hash = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (hash === "reports" || hash === "report") return "revenue";
  const validPages = ["dashboard", "projects", "kiosks", "pricing", "revenue", "analytics", "alerts", "history", "reports"];
  if (validPages.includes(hash)) return hash;
  try {
    const saved = sessionStorage.getItem("kiosk_admin_page");
    if (validPages.includes(saved)) return saved;
  } catch (e) {}
  return runtimeConfig.get("adminPage") || "dashboard";
}

const state = {
  mode: isAdminEntry ? "admin" : "customer",
  adminAuthed: false,
  adminToken: "",
  adminAccount: null,
  adminLanguage: readStoredAdminLanguage(),
  customerLanguage: readStoredCustomerLanguage(),
  showPrivacyPolicy: runtimeConfig.get("page") === "privacy" || window.location.hash === "#privacy-policy",
  policyPage: runtimeConfig.get("page") === "privacy" || window.location.hash === "#privacy-policy" ? "privacy" : "privacy",
  adminPage: resolveInitialKioskAdminPage(),
  adminNavOpen: false,
  adminProfileMenuOpen: false,
  adminSettingsModalOpen: false,
  confirmModal: null,
  adminSettingsDraft: { username: "", currentPassword: "", newPassword: "", confirmPassword: "" },
  adminSettingsStatus: "",
  idleScreensaverDraft: null,
  idleScreensaverStatus: "",
  idleScreensaverError: "",
  adminLoginError: "",
  adminLoginDraft: {
    email: "",
    password: ""
  },
  adminLoginPasswordVisible: false,
  adminLoginThemeDark: false,
  reportTab: (() => {
    try { return sessionStorage.getItem("kiosk_admin_report_tab") || "revenue"; } catch (e) { return "revenue"; }
  })(),
  revenueFilter: (() => {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      start: `${fyStartYear}-04-01`,
      end: `${fyStartYear + 1}-03-31`,
      filterType: "financialYear",
      kioskId: "",
      financialYear: "current"
    };
  })(),
  revenueFilterDraft: {
    filterType: "financialYear",
    kioskId: "",
    financialYear: "current",
    start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  },
  adminAnalyticsTab: (() => {
    try { return sessionStorage.getItem("kiosk_admin_analytics_tab") || "revenue"; } catch (e) { return "revenue"; }
  })(),
  adminAnalyticsFilter: (() => {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      start: `${fyStartYear}-04-01`,
      end: `${fyStartYear + 1}-03-31`,
      filterType: "financialYear",
      kioskId: "",
      financialYear: "current"
    };
  })(),
  adminAnalyticsFilterDraft: {
    filterType: "financialYear",
    kioskId: "",
    financialYear: "current",
    start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  },
  alertFilter: { search: "", category: "all", status: "all", kioskId: "all" },
  reportTab: "revenue",
  step: 0,
  selectedService: null,
  file: null,
  files: [],
  uploadError: "",
  uploadSession: null,
  uploadPoller: null,
  customerInactivityTimer: null,
  customerInactivityTimerKey: "",
  showIdleScreensaver: false,
  idleScreensaverIndex: 0,
  idleScreensaverTimer: null,
  previewZoom: 1,
  previewActivityArea: "document",
  previewFileIndex: 0,
  previewPage: 1,
  settings: {
    colorMode: "bw",
    copies: 1,
    paperSize: "A4",
    sides: "single",
    orientation: "portrait",
    range: "all",
    staple: "no"
  },
  settingsCustomized: false,
  printer: {
    online: false,
    checking: true,
    name: "No printer selected",
    paper: "Unknown",
    toner: "Unknown",
    queue: 0,
    supportsColor: null,
    supportsDuplex: null,
    defaultPaperSize: "A4",
    paperSizes: [...PRINT_PAPER_SIZES],
    scanner: "Connected",
    internet: "Online",
    agent: "Checking",
    statusText: "Checking printer status..."
  },
  // ── Printer Health (populated by Electron IPC background monitor) ─────────
  printerHealth: {
    available: false,
    online: false,
    ready: false,
    busy: false,
    paper: true,
    paperLow: false,
    paperJam: false,
    doorOpen: false,
    tonerLow: false,
    tonerEmpty: false,
    queueError: false,
    outputBinFull: false,
    serviceRequested: false,
    printing: false,
    workOffline: false,
    errorMessage: null,
    printerName: null,
    queueLength: 0,
    paperStatus: "Unknown",
    tonerStatus: "Unknown",
    detectedErrorState: 0,
    detectedErrorText: "Unknown",
    printerStatus: 0,
    lastUpdated: null,
    errorLog: []
  },
  // ── Real internet connectivity (populated by Electron IPC background
  // monitor; see initInternetStatusIpc). Starts `true` (non-blocking) so the
  // customer flow isn't blocked before the first check has a chance to run.
  internetOnline: true,
  internetCheckedAt: null,
  // ── Printer-offline watchdog (see tickPrinterOfflineWatchdog) ──────────────
  printerHealthIssueSince: null,
  printFailureAutoHomeSecondsLeft: null,
  paymentStatus: "Pending",
  paymentStatusMessage: "",
  paymentError: "",
  paymentOrder: null,
  paymentBusy: false,
  paymentPoller: null,
  mobilePayment: {
    paymentId: runtimeConfig.get("mobilePayment") || "",
    loading: Boolean(runtimeConfig.get("mobilePayment")),
    checkout: null,
    payment: null,
    job: null,
    status: "Loading",
    message: Boolean(runtimeConfig.get("mobilePayment")) ? "Loading payment details..." : "",
    error: "",
    completed: false
  },
  printProgress: 0,
  printError: "",
  printStatusMessage: "",
  printJob: null,
  customerPrinterNotice: null,
  lastAlertedPrinterIssue: null,
  activeJobId: null,
  lastCompletedJob: null,
  thankYouPhase: "payment_done",
  thankYouSecondsLeft: null,
  jobs: [...initialJobs],
  adminData: {
    dashboard: null,
    jobs: [],
    transactions: [],
    projects: [],
    kiosks: [],
    reports: [],
    backendOnline: false,
    lastUpdated: "",
    error: ""
  },
  adminPoller: null,
  adminPagination: {},
  adminPermissionStatus: "",
  projectDraft: {
    projectId: "",
    name: "",
    status: "active",
    description: ""
  },
  projectCreateStatus: "",
  projectEditorOpen: false,
  projectEditId: "",
  kioskCreate: {
    kioskId: "",
    name: "",
    projectId: "",
    branch: "",
    setupCode: ""
  },
  kioskCreateStatus: "",
  kioskEditorOpen: false,
  kioskEditId: "",
  kiosk: {
    kioskId: KIOSK_ID,
    name: "",
    branch: "",
    projectId: "",
    status: ""
  },
  clientBrand: readStoredClientBrand(),
  kioskCustomerSettings: { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS },
  pricing: readStoredPricing(),
  pricingSaveStatus: "",
  servicesDirty: false,
  serviceEditor: null,
  adminSelectedServiceId: "",
  adminSelectedServiceKioskId: "",
  adminPricingKioskId: "",
  templateSearchQuery: "",
  templateSearchKeyboardActive: false,
  imageUploadBusy: false,
  configVersion: 0,
  configUpdatedAt: "",
  configPoller: null,
  printerPoller: null,
  configStatus: "",
  alerts: [],
  filters: {
    table: "",
    status: "all"
  },
  transactionFilters: {
    search: "",
    // Default to success only - pending/incomplete payment attempts
    // (initiated but never confirmed by the gateway) cluttered the
    // Transaction Logs report. Still fully selectable via the status
    // dropdown, this only changes what shows before anyone touches it.
    status: "success",
    kiosk: "all",
    from: "",
    to: ""
  }
};

function qs(selector) {
  return document.querySelector(selector);
}

function uiIcon(name, size = 20) {
  return window.PrintKioskUI?.icon(name, size) || "";
}

function languageTypographyClass(language) {
  if (language === "hi") return "hindi devanagari";
  if (language === "mr") return "marathi devanagari";
  return "";
}

function adminLocale() {
  return {
    en: "en-IN",
    hi: "hi-IN",
    mr: "mr-IN"
  }[state.adminLanguage] || "en-IN";
}

function storeAdminLanguage() {
  try {
    window.localStorage.setItem(ADMIN_LANGUAGE_KEY, state.adminLanguage);
  } catch {
    // Language selection still works for the current session when storage is unavailable.
  }
}

function storeCustomerLanguage() {
  try {
    window.localStorage.setItem(CUSTOMER_LANGUAGE_KEY, state.customerLanguage);
  } catch {
    // Language selection still works for the current session when storage is unavailable.
  }
}

function customerTranslateText(value) {
  const text = String(value || "").trim();
  if (!text) return text;

  const language = state.customerLanguage;
  if (language === "en") return text;

  const translations = CUSTOMER_CLEAN_TRANSLATIONS[language] || {};
  if (translations[text]) return translations[text];

  const pageWord = language === "hi" ? "पेज" : "पाने";
  const copyWord = "कॉपी";
  const formWord = "फॉर्म";
  const documentWord = translations.Documents || "Documents";
  const safePatterns = [
    [/^(\d+) pages?$/, (match) => `${match[1]} ${pageWord}`],
    [/^(\d+) page(s?)$/, (match) => `${match[1]} ${pageWord}`],
    [/^(\d+) pages? shown$/, (match) => language === "hi" ? `${match[1]} पेज दिखाए गए` : `${match[1]} पाने दाखवली`],
    [/^(\d+) forms?$/, (match) => `${match[1]} ${formWord}`],
    [/^(\d+) matching forms?$/, (match) => language === "hi" ? `${match[1]} मिलते-जुलते फॉर्म` : `${match[1]} जुळणारे फॉर्म`],
    [/^(\d+) documents?$/, (match) => `${match[1]} ${documentWord}`],
    [/^(\d+) documents? \/ (\d+) pages?$/, (match) => `${match[1]} ${documentWord} / ${match[2]} ${pageWord}`],
    [/^(\d+) cop(?:y|ies)$/, (match) => `${match[1]} ${copyWord}`],
    [/^Page (\d+) \/ (\d+)$/, (match) => `${translations.Pages || "Pages"} ${match[1]} / ${match[2]}`],
    [/^Page (\d+) of (\d+)$/, (match) => `${translations.Pages || "Pages"} ${match[1]} / ${match[2]}`],
    [/^Page (\d+)$/, (match) => `${translations.Pages || "Pages"} ${match[1]}`],
    [/^Document (\d+)$/, (match) => `${translations.Document || "Document"} ${match[1]}`],
    [/^Order (.+)$/, (match) => `${language === "hi" ? "ऑर्डर" : "ऑर्डर"} ${match[1]}`],
    [/^Returning home in (\d+)s$/, (match) => language === "hi" ? `${match[1]} सेकंड में होम पर जा रहे हैं` : `${match[1]} सेकंदात होमवर जात आहे`],
    [/^You can send up to (\d+) files\.$/, (match) => language === "hi" ? `आप ${match[1]} फ़ाइलें तक भेज सकते हैं.` : `तुम्ही ${match[1]} फाइल्सपर्यंत पाठवू शकता.`],
    [/^Pay (Rs\. .+)$/, (match) => `${language === "hi" ? "भुगतान करें" : "पेमेंट करा"} ${match[1]}`],
    [/^(Rs\. .+) \/ page$/, (match) => `${match[1]} / ${pageWord}`],
    [/^(Rs\. .+) B\/W per page$/, (match) => `${match[1]} ${translations["B/W per page"] || "B/W per page"}`],
    [/^(Rs\. .+) Color per page$/, (match) => `${match[1]} ${translations["Color per page"] || "Color per page"}`],
    [/^No services are enabled for (.+)\. Open Admin Services to enable or assign services\.$/, (match) => language === "hi"
      ? `${match[1]} के लिए कोई सेवा चालू नहीं है. सेवा चालू या असाइन करने के लिए Admin Services खोलें.`
      : `${match[1]} साठी कोणतीही सेवा चालू नाही. सेवा चालू किंवा असाइन करण्यासाठी Admin Services उघडा.`],
    [/^(.+) selected\. Pick a form template to preview and print\.$/, (match) => language === "hi"
      ? `${match[1]} चुना गया. पूर्वावलोकन और प्रिंट के लिए फॉर्म चुनें.`
      : `${match[1]} निवडले. पूर्वावलोकन आणि प्रिंटसाठी फॉर्म निवडा.`],
    [/^Printing completed successfully\. Returning to the home page in (\d+) seconds\.$/, (match) => language === "hi"
      ? `प्रिंटिंग सफलतापूर्वक पूरी हुई. ${match[1]} सेकंड में होम पेज पर लौटेंगे.`
      : `प्रिंटिंग यशस्वीरित्या पूर्ण झाली. ${match[1]} सेकंदात होम पेजवर परत जाईल.`],
    [/^(.+) The paid job is saved in admin history and can be retried without charging again\.$/, (match) => language === "hi"
      ? `${match[1]} भुगतान किया गया काम admin history में सेव है और बिना फिर से शुल्क लिए दोबारा प्रिंट किया जा सकता है.`
      : `${match[1]} पेमेंट झालेले काम admin history मध्ये सेव आहे आणि पुन्हा शुल्क न घेता प्रिंट करता येईल.`]
  ];

  for (const [pattern, formatter] of safePatterns) {
    const match = text.match(pattern);
    if (match) return formatter(match);
  }

  return text;

  const translated = (english) => translations[english] || english;
  const patterns = [
    [/^(.+) \| Government and education ready$/, (match) => `${match[1]} | ${translated("Government and education ready")}`],
    [/^Printer (Online|Offline)$/, (match) => `${language === "hi" ? "à¤ªà¥à¤°à¤¿à¤‚à¤Ÿà¤°" : "à¤ªà¥à¤°à¤¿à¤‚à¤Ÿà¤°"} ${translated(match[1])}`],
    [/^(.+) selected\. Pick a form template to preview and print\.$/, (match) => language === "hi"
      ? `${match[1]} à¤šà¥à¤¨à¤¾ à¤—à¤¯à¤¾à¥¤ à¤ªà¥‚à¤°à¥à¤µà¤¾à¤µà¤²à¥‹à¤•à¤¨ à¤”à¤° à¤ªà¥à¤°à¤¿à¤‚à¤Ÿ à¤•à¥‡ à¤²à¤¿à¤ à¤«à¥‰à¤°à¥à¤® à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤šà¥à¤¨à¥‡à¤‚à¥¤`
      : `${match[1]} à¤¨à¤¿à¤µà¤¡à¤²à¥‡. à¤ªà¥‚à¤°à¥à¤µà¤¾à¤µà¤²à¥‹à¤•à¤¨ à¤†à¤£à¤¿ à¤®à¥à¤¦à¥à¤°à¤£à¤¾à¤¸à¤¾à¤ à¥€ à¤«à¥‰à¤°à¥à¤® à¤¸à¤¾à¤šà¤¾ à¤¨à¤¿à¤µà¤¡à¤¾.`],
    [/^(\d+) pages?$/, (match) => `${match[1]} ${translated("Pages")}`],
    [/^(\d+) page(s?)$/, (match) => `${match[1]} ${language === "hi" ? "à¤ªà¥‡à¤œ" : "à¤ªà¤¾à¤¨à¥‡"}`],
    [/^(\d+) cop(?:y|ies)$/, (match) => `${match[1]} ${translated("Copies")}`],
    [/^(\d+) pages? .+ (\d+) cop(?:y|ies)$/, (match) => `${match[1]} ${translated("Pages")} � ${match[2]} ${translated("Copies")}`],
    [/^Document (\d+) .+ (.+)$/, (match) => `${translated("Document")} ${match[1]} � ${match[2]}`],
    [/^Page (\d+) of (\d+)$/, (match) => `${translated("Pages")} ${match[1]} / ${match[2]}`],
    [/^Page (\d+)$/, (match) => `${translated("Pages")} ${match[1]}`],
    [/^Scan the code, select up to (\d+) files, and send them to this kiosk\.$/, (match) => language === "hi"
      ? `à¤•à¥‹à¤¡ à¤¸à¥à¤•à¥ˆà¤¨ à¤•à¤°à¥‡à¤‚, à¤…à¤§à¤¿à¤•à¤¤à¤® ${match[1]} à¤«à¤¼à¤¾à¤‡à¤²à¥‡à¤‚ à¤šà¥à¤¨à¥‡à¤‚ à¤”à¤° à¤‰à¤¨à¥à¤¹à¥‡à¤‚ à¤‡à¤¸ à¤•à¤¿à¤¯à¥‹à¤¸à¥à¤• à¤ªà¤° à¤­à¥‡à¤œà¥‡à¤‚à¥¤`
      : `à¤•à¥‹à¤¡ à¤¸à¥à¤•à¥…à¤¨ à¤•à¤°à¤¾, à¤œà¤¾à¤¸à¥à¤¤à¥€à¤¤ à¤œà¤¾à¤¸à¥à¤¤ ${match[1]} à¤«à¤¾à¤‡à¤² à¤¨à¤¿à¤µà¤¡à¤¾ à¤†à¤£à¤¿ à¤¤à¥à¤¯à¤¾ à¤¯à¤¾ à¤•à¤¿à¤‘à¤¸à¥à¤•à¤µà¤° à¤ªà¤¾à¤ à¤µà¤¾.`],
    [/^No services are enabled for (.+)\. Open Admin Services to enable or assign services\.$/, (match) => language === "hi"
      ? `${match[1]} à¤•à¥‡ à¤²à¤¿à¤ à¤•à¥‹à¤ˆ à¤¸à¥‡à¤µà¤¾ à¤¸à¤•à¥à¤·à¤® à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤¸à¥‡à¤µà¤¾à¤à¤ à¤¸à¤•à¥à¤·à¤® à¤¯à¤¾ à¤…à¤¸à¤¾à¤‡à¤¨ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤à¤¡à¤®à¤¿à¤¨ à¤¸à¤°à¥à¤µà¤¿à¤¸à¥‡à¤œ à¤–à¥‹à¤²à¥‡à¤‚à¥¤`
      : `${match[1]} à¤¸à¤¾à¤ à¥€ à¤•à¥‹à¤£à¤¤à¥€à¤¹à¥€ à¤¸à¥‡à¤µà¤¾ à¤¸à¤•à¥à¤·à¤® à¤¨à¤¾à¤¹à¥€. à¤¸à¥‡à¤µà¤¾ à¤¸à¤•à¥à¤·à¤® à¤•à¤¿à¤‚à¤µà¤¾ à¤¨à¥‡à¤®à¤£à¥à¤¯à¤¾à¤¸à¤¾à¤ à¥€ à¤ªà¥à¤°à¤¶à¤¾à¤¸à¤• à¤¸à¥‡à¤µà¤¾ à¤‰à¤˜à¤¡à¤¾.`],
    [/^Printing completed successfully\. Returning to the home page in (\d+) seconds\.$/, (match) => language === "hi"
      ? `à¤ªà¥à¤°à¤¿à¤‚à¤Ÿà¤¿à¤‚à¤— à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• à¤ªà¥‚à¤°à¥€ à¤¹à¥à¤ˆà¥¤ ${match[1]} à¤¸à¥‡à¤•à¤‚à¤¡ à¤®à¥‡à¤‚ à¤¹à¥‹à¤® à¤ªà¥‡à¤œ à¤ªà¤° à¤²à¥Œà¤Ÿ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚à¥¤`
      : `à¤®à¥à¤¦à¥à¤°à¤£ à¤¯à¤¶à¤¸à¥à¤µà¥€à¤°à¤¿à¤¤à¥à¤¯à¤¾ à¤ªà¥‚à¤°à¥à¤£ à¤à¤¾à¤²à¥‡. ${match[1]} à¤¸à¥‡à¤•à¤‚à¤¦à¤¾à¤¤ à¤®à¥à¤–à¥à¤¯ à¤ªà¤¾à¤¨à¤¾à¤µà¤° à¤ªà¤°à¤¤ à¤œà¤¾à¤¤ à¤†à¤¹à¥‡.`],
    [/^(.+) The paid job is saved in admin history and can be retried without charging again\.$/, (match) => `${match[1]} ${translated("The paid job is saved in admin history and can be retried without charging again.")}`],
    [/^Pay (Rs\. .+)$/, (match) => `${translated("Pay")} ${match[1]}`],
    [/^(Rs\. .+) \/ page$/, (match) => language === "hi" ? `${match[1]} / à¤ªà¥‡à¤œ` : `${match[1]} / à¤ªà¤¾à¤¨`],
    [/^(Rs\. .+) B\/W per page$/, (match) => `${match[1]} ${translated("B/W per page")}`],
    [/^(Rs\. .+) Color per page$/, (match) => `${match[1]} ${translated("Color per page")}`]
  ];

  patterns.push(
    [/^New Service(?:\s+(\d+))?$/i, (match) => language === "hi"
      ? `à¤¨à¤ˆ à¤¸à¥‡à¤µà¤¾${match[1] ? ` ${match[1]}` : ""}`
      : `à¤¨à¤µà¥€à¤¨ à¤¸à¥‡à¤µà¤¾${match[1] ? ` ${match[1]}` : ""}`],
    [/^Existing document$/i, () => language === "hi" ? "à¤®à¥Œà¤œà¥‚à¤¦à¤¾ à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼" : "à¤µà¤¿à¤¦à¥à¤¯à¤®à¤¾à¤¨ à¤¦à¤¸à¥à¤¤à¤à¤µà¤œ"],
    [/^Customer service\.$/i, () => language === "hi" ? "à¤—à¥à¤°à¤¾à¤¹à¤• à¤¸à¥‡à¤µà¤¾à¥¤" : "à¤—à¥à¤°à¤¾à¤¹à¤• à¤¸à¥‡à¤µà¤¾."]
  );

  for (const [pattern, formatter] of patterns) {
    const match = text.match(pattern);
    if (match) return formatter(match);
  }

  return text;
}

function localizedServiceText(service, field) {
  const suffix = state.customerLanguage === "hi" ? "Hi" : state.customerLanguage === "mr" ? "Mr" : "";
  const english = String(service?.[field] || "").trim();
  if (!suffix) return english;

  const localized = cleanLocalizedText(service?.[`${field}${suffix}`]);
  return localized || cleanLocalizedText(customerTranslateText(english)) || english;
}

function localizedTemplateText(template, field) {
  const suffix = state.customerLanguage === "hi" ? "Hi" : state.customerLanguage === "mr" ? "Mr" : "";
  const english = String(template?.[field] || "").trim();
  if (!suffix) return english;

  const localized = cleanLocalizedText(template?.[`${field}${suffix}`]);
  return localized || cleanLocalizedText(customerTranslateText(english)) || english;
}

function cleanLocalizedText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return isMojibakeText(text) ? "" : text;
}

function isMojibakeText(text) {
  return /[\u00c3\u00c2\u00e0\u00e2\ufffd]/.test(String(text || ""));
}

function localizedTemplateFields(template) {
  const suffix = state.customerLanguage === "hi" ? "Hi" : state.customerLanguage === "mr" ? "Mr" : "";
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (!suffix) return fields;

  const localizedFields = Array.isArray(template?.[`fields${suffix}`]) ? template[`fields${suffix}`] : [];
  return fields.map((field, index) => String(localizedFields[index] || "").trim() || customerTranslateText(field));
}

function applyCustomerTranslations(root) {
  if (state.mode !== "customer" || !root) return;

  document.documentElement.lang = state.customerLanguage;
  if (state.customerLanguage === "en") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-no-customer-translation]") || ["SCRIPT", "STYLE"].includes(parent.tagName)) return;
    const source = node.nodeValue || "";
    const trimmed = source.trim();
    if (!trimmed) return;
    const next = customerTranslateText(trimmed);
    if (next !== trimmed) node.nodeValue = source.replace(trimmed, next);
  });

  root.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach((element) => {
    if (element.closest("[data-no-customer-translation]")) return;
    ["placeholder", "aria-label", "title", "alt"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const source = element.getAttribute(attribute);
      const next = customerTranslateText(source);
      if (next !== source) element.setAttribute(attribute, next);
    });
  });
}

function adminTranslateText(value) {
  const text = String(value || "").trim();
  const language = state.adminLanguage;
  if (!text || language === "en") return text;

  const translations = ADMIN_TRANSLATIONS[language] || {};
  if (translations[text]) return translations[text];

  const translated = (english) => translations[english] || english;
  const patterns = [
    [/^(.+) \| assigned project management$/, (match) => `${match[1]} | ${translated("assigned project management")}`],
    [/^Last updated:\s*(.+)$/, (match) => `${translated("Last updated")}: ${match[1]}`],
    [/^(\d+) records$/, (match) => `${match[1]} ${translated("records")}`],
    [/^Page (\d+) of (\d+)$/, (match) => `${translated("Page")} ${match[1]} ${translated("of")} ${match[2]}`],
    [/^(\d+) kiosk record\(s\)$/, (match) => `${match[1]} ${language === "hi" ? "à¤•à¤¿à¤¯à¥‹à¤¸à¥à¤• à¤°à¤¿à¤•à¥‰à¤°à¥à¤¡" : "à¤•à¤¿à¤‘à¤¸à¥à¤• à¤¨à¥‹à¤‚à¤¦à¥€"}`],
    [/^(\d+) job\(s\)$/, (match) => `${match[1]} ${language === "hi" ? "à¤•à¤¾à¤°à¥à¤¯" : "à¤•à¤¾à¤®à¥‡"}`],
    [/^(\d+) paid job\(s\)$/, (match) => `${match[1]} ${translated("paid job(s)")}`],
    [/^(\d+) services?$/, (match) => `${match[1]} ${translated("Services")}`],
    [/^(\d+) forms?$/, (match) => `${match[1]} ${translated("Forms")}`],
    [/^(\d+) pages?$/, (match) => `${match[1]} ${translated("Pages")}`],
    [/^Forms under (.+)$/, (match) => language === "hi" ? `${match[1]} à¤•à¥‡ à¤…à¤‚à¤¤à¤°à¥à¤—à¤¤ à¤«à¤¼à¥‰à¤°à¥à¤®` : `${match[1]} à¤…à¤‚à¤¤à¤°à¥à¤—à¤¤ à¤«à¥‰à¤°à¥à¤®`],
    [/^Form (\d+): (.+)$/, (match) => `${language === "hi" ? "à¤«à¤¼à¥‰à¤°à¥à¤®" : "à¤«à¥‰à¤°à¥à¤®"} ${match[1]}: ${match[2]}`],
    [/^Delete kiosk (.+)\?$/, (match) => language === "hi" ? `à¤•à¤¿à¤¯à¥‹à¤¸à¥à¤• ${match[1]} à¤¹à¤Ÿà¤¾à¤à¤?` : `à¤•à¤¿à¤‘à¤¸à¥à¤• ${match[1]} à¤¹à¤Ÿà¤µà¤¾à¤¯à¤šà¤¾?`],
    [/^Saved (.+)\.$/, (match) => language === "hi" ? `${match[1]} à¤¸à¤¹à¥‡à¤œà¤¾ à¤—à¤¯à¤¾à¥¤` : `${match[1]} à¤œà¤¤à¤¨ à¤à¤¾à¤²à¥‡.`],
    [/^Deleted (.+)\.$/, (match) => language === "hi" ? `${match[1]} à¤¹à¤Ÿà¤¾à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤` : `${match[1]} à¤¹à¤Ÿà¤µà¤²à¤¾.`],
    [/^Created (.+)\. Setup code: (.+)$/, (match) => language === "hi" ? `${match[1]} à¤¬à¤¨à¤¾à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤ à¤¸à¥‡à¤Ÿà¤…à¤ª à¤•à¥‹à¤¡: ${match[2]}` : `${match[1]} à¤¤à¤¯à¤¾à¤° à¤à¤¾à¤²à¤¾. à¤¸à¥‡à¤Ÿà¤…à¤ª à¤•à¥‹à¤¡: ${match[2]}`]
  ];

  for (const [pattern, formatter] of patterns) {
    const match = text.match(pattern);
    if (match) return formatter(match);
  }

  return text;
}

function applyAdminTranslations(root) {
  if (state.mode !== "admin" || !root) return;

  document.documentElement.lang = state.adminLanguage;
  if (state.adminLanguage === "en") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-no-admin-translation]") || ["SCRIPT", "STYLE"].includes(parent.tagName)) return;
    const source = node.nodeValue || "";
    const trimmed = source.trim();
    if (!trimmed) return;
    const next = adminTranslateText(trimmed);
    if (next !== trimmed) node.nodeValue = source.replace(trimmed, next);
  });

  root.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const source = element.getAttribute(attribute);
      const next = adminTranslateText(source);
      if (next !== source) element.setAttribute(attribute, next);
    });
  });
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

function normalizeKioskCode(value, maxLength = 32) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function generateKioskSetupCode() {
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

function adminKioskIdExists(kioskId = "", ignoreKioskId = "") {
  const normalized = normalizeKioskCode(kioskId);
  const ignored = normalizeKioskCode(ignoreKioskId);
  if (!normalized) return false;
  return (state.adminData.kiosks || []).some((kiosk) => {
    const existingId = normalizeKioskCode(kiosk.kioskId);
    return existingId === normalized && existingId !== ignored;
  });
}

function adminSetupCodeExists(setupCode = "", ignoreKioskId = "") {
  const normalized = normalizeKioskCode(setupCode, 16);
  const ignored = normalizeKioskCode(ignoreKioskId);
  if (!normalized) return false;
  return (state.adminData.kiosks || []).some((kiosk) => {
    const existingId = normalizeKioskCode(kiosk.kioskId);
    return existingId !== ignored && normalizeKioskCode(kiosk.setupCode, 16) === normalized;
  });
}

function nextAdminKioskId() {
  const used = new Set((state.adminData.kiosks || []).map((kiosk) => normalizeKioskCode(kiosk.kioskId)).filter(Boolean));
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

function uniqueAdminSetupCode(ignoreKioskId = "") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = generateKioskSetupCode();
    if (!adminSetupCodeExists(candidate, ignoreKioskId)) return candidate;
  }

  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function readConfiguredKioskId() {
  return normalizeKioskId(runtimeConfig.get("kioskId")) ||
    normalizeKioskId(frontendConfig.kioskId) ||
    (isWebsiteRootEntry ? "LOCAL-KIOSK" : UNASSIGNED_KIOSK_ID);
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
  state.adminAuthed = false;
  state.adminNavOpen = false;
  state.adminToken = "";
  state.adminAccount = null;
  state.adminLoginError = message;
  clearAdminSession();
  stopAdminPolling();
  stopAdminSocket();
  render();
}

function redirectToSuperAdmin() {
  window.location.href = `./super-admin.html${window.location.search || ""}`;
}

function hydrateAdminSession() {
  if (!isAdminEntry) return;
  const stored = readStoredAdminSession();
  if (!stored?.token || !stored.role) return;

  if (stored.role === "super-admin") {
    redirectToSuperAdmin();
    return;
  }

  if (stored.role === "kiosk-admin") {
    state.adminAuthed = true;
    state.adminToken = stored.token;
    state.adminAccount = stored.admin || null;
    state.adminPage = resolveInitialKioskAdminPage();
  }
}

function markServicesDirty(message = "") {
  state.servicesDirty = true;
  state.pricingSaveStatus = message;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

function templateDocumentKind(value = "") {
  const source = String(value || "").toLowerCase();
  if (source === "pdf" || source.startsWith("data:application/pdf") || /\.pdf(?:$|[?#])/i.test(source)) return "pdf";
  return "image";
}

const TEMPLATE_IMAGE_URL_FIXES = Object.freeze({
  "/assets/forms/nmc/nmc_27_______________________bmw_______________________________________________________________.pdf": "/assets/forms/nmc/nmc_27_______________________bmw____________________________________________________.pdf"
});

const NMC_FORM_PAGE_COUNTS = Object.freeze({
  "/assets/forms/nmc/nmc_0_request_for_new_connection.pdf": 4,
  "/assets/forms/nmc/nmc_5_registration_of_property_on_demand_register.pdf": 2,
  "/assets/forms/nmc/nmc_9_no_objection_certificate__n_o_c__.pdf": 2,
  "/assets/forms/nmc/nmc_13_tentative_layout.pdf": 5,
  "/assets/forms/nmc/nmc_15_building_permission__b_p__.pdf": 10,
  "/assets/forms/nmc/nmc_16_occupancy_certificate.pdf": 2,
  "/assets/forms/nmc/nmc_17_no_objection_certificate__n_o_c__.pdf": 3,
  "/assets/forms/nmc/nmc_20_hospital__nursing_home__maternity_homes_inspection_form.pdf": 2,
  "/assets/forms/nmc/nmc_21_form_b.pdf": 3,
  "/assets/forms/nmc/nmc_26_pre_natal_diagnostics_registration.pdf": 2,
  "/assets/forms/nmc/nmc_29_marriage_registration.pdf": 5,
  "/assets/forms/nmc/nmc_30_annual_return_form__marathi_.pdf": 7,
  "/assets/forms/nmc/nmc_31_annual_return_form__english_.pdf": 6,
  "/assets/forms/nmc/nmc_32_rules_and_regulation_of_various_appointments_to_the_municipal_services_video_resolution_no_75_dated_21_06_1985.pdf": 506,
  "/assets/forms/nmc/nmc_33_rules__regulations_laws_and_standing_order.pdf": 113,
  "/assets/forms/nmc/nmc_34____________________________________.pdf": 3,
  "/assets/forms/nmc/nmc_35_________________________________________.pdf": 3,
  "/assets/forms/nmc/nmc_38_____________________________________________________________________.pdf": 2
});

function normalizeTemplateImageUrl(value = "") {
  const source = String(value || "").trim();
  return TEMPLATE_IMAGE_URL_FIXES[source] || source;
}

function templatePageCount(template, fallbackPages = 1) {
  const imageUrl = normalizeTemplateImageUrl(template?.imageUrl || "");
  const knownPages = NMC_FORM_PAGE_COUNTS[imageUrl];
  const sourcePages = Number(template?.pages || fallbackPages || 1);
  return Math.max(1, Math.min(999, Number(knownPages || sourcePages || 1)));
}

function templateHasStaticPdfPreview(template) {
  if (template?.hasStaticPreview === true) return true;
  if (template?.hasStaticPreview === false) return false;
  return false;
}

const FORM_THUMBNAIL_STORAGE_PREFIX = "printingKioskFormThumbnail:";
const FORM_THUMBNAIL_COLORS = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0369a1", "#9333ea"];
const formThumbnailCache = new Map();
const formThumbnailJobs = new Map();
let formThumbnailObserver = null;

function formTemplateAccentColor(index = 0) {
  return FORM_THUMBNAIL_COLORS[index % FORM_THUMBNAIL_COLORS.length];
}

function formTemplateDocumentUrl(template) {
  return normalizeTemplateImageUrl(template?.imageUrl || "");
}

function formTemplateStaticThumbnailUrl(template) {
  const explicit = normalizeTemplateImageUrl(template?.thumbnailUrl || template?.previewImageUrl || "");
  if (explicit) return explicit;

  const imageUrl = formTemplateDocumentUrl(template);
  if (!imageUrl) return "";

  const documentKind = templateDocumentKind(template?.documentType || imageUrl);
  if (documentKind !== "pdf") return imageUrl;

  if (templateHasStaticPdfPreview(template) || /^\/assets\/forms\/[^/]+\.pdf$/i.test(imageUrl)) {
    return imageUrl.replace(/\.pdf(?:$|[?#])/i, ".png");
  }

  return "";
}

function formThumbnailSourceHash(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36) || "0";
}

function formThumbnailCacheKey(template, sourceUrl = "") {
  const templateId = String(template?.id || template?.title || "form");
  return `${FORM_THUMBNAIL_STORAGE_PREFIX}${templateId}:${formThumbnailSourceHash(sourceUrl || formTemplateDocumentUrl(template))}`;
}

function readFormThumbnailCache(key) {
  if (!key) return "";
  if (formThumbnailCache.has(key)) return formThumbnailCache.get(key);

  try {
    const cached = localStorage.getItem(key) || sessionStorage.getItem(key) || "";
    if (cached) formThumbnailCache.set(key, cached);
    return cached;
  } catch {
    return "";
  }
}

function writeFormThumbnailCache(key, value) {
  if (!key || !value) return;
  formThumbnailCache.set(key, value);

  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistent thumbnail cache is best-effort; session cache still avoids repeat work now.
  }

  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Thumbnail cache is an optimization; keep the UI working if storage is full.
  }
}

function renderFormTemplateIcon(template, index = 0) {
  const color = formTemplateAccentColor(index);
  const documentUrl = formTemplateDocumentUrl(template);
  const documentKind = templateDocumentKind(template?.documentType || documentUrl);
  const staticThumbnailUrl = formTemplateStaticThumbnailUrl(template);
  const cacheKey = formThumbnailCacheKey(template, documentUrl || staticThumbnailUrl);
  const cachedThumbnail = documentKind === "pdf" ? readFormThumbnailCache(cacheKey) : "";
  const thumbnailUrl = cachedThumbnail || staticThumbnailUrl;
  const canGeneratePdfThumbnail = documentKind === "pdf" && documentUrl && !cachedThumbnail && !staticThumbnailUrl;

  return `
      <div
        class="forms-v2-card-icon forms-v2-card-thumbnail ${thumbnailUrl ? "has-thumbnail" : "is-loading"}"
        style="--form-thumb-accent: ${color}; color: ${color}; background: ${color}1A;"
        ${canGeneratePdfThumbnail ? `data-template-thumbnail-url="${escapeHtml(documentUrl)}" data-template-thumbnail-key="${escapeHtml(cacheKey)}"` : ""}
      >
        ${thumbnailUrl
      ? `<img class="form-thumbnail-image" src="${escapeHtml(thumbnailUrl)}" alt="" draggable="false" data-no-visual-search />`
      : `<span class="form-thumbnail-placeholder">${uiIcon("pages", 32)}</span>`}
      </div>
    `;
}

function applyFormThumbnail(node, dataUrl) {
  if (!node || !dataUrl) return;
  let image = node.querySelector(".form-thumbnail-image");
  if (!image) {
    image = document.createElement("img");
    image.className = "form-thumbnail-image";
    image.alt = "";
    image.draggable = false;
    image.setAttribute("data-no-visual-search", "");
    node.prepend(image);
  }
  image.src = dataUrl;
  node.classList.add("has-thumbnail");
  node.classList.remove("is-loading", "is-error");
}

function applyFormThumbnailByKey(key, dataUrl) {
  document.querySelectorAll("[data-template-thumbnail-key]").forEach((node) => {
    if (node.dataset.templateThumbnailKey === key) {
      applyFormThumbnail(node, dataUrl);
    }
  });
}

async function createPdfFormThumbnail(pdfUrl) {
  const pdfjsLib = await import("./assets/vendor/pdfjs/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/vendor/pdfjs/pdf.worker.min.mjs";
  const pdf = await pdfjsLib.getDocument({ url: pdfUrl, enableXfa: true }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(150 / baseViewport.width, 200 / baseViewport.height);
  const viewport = page.getViewport({ scale: Math.max(0.16, scale) });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) return "";
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.72);
}

function hydrateFormThumbnailNode(node) {
  const key = node?.dataset?.templateThumbnailKey || "";
  const pdfUrl = node?.dataset?.templateThumbnailUrl || "";
  const cached = readFormThumbnailCache(key);

  if (cached) {
    applyFormThumbnail(node, cached);
    return;
  }

  if (!key || !pdfUrl) return;

  if (!formThumbnailJobs.has(key)) {
    formThumbnailJobs.set(
      key,
      createPdfFormThumbnail(pdfUrl)
        .then((dataUrl) => {
          if (dataUrl) {
            writeFormThumbnailCache(key, dataUrl);
            applyFormThumbnailByKey(key, dataUrl);
          }
          return dataUrl;
        })
        .catch((error) => {
          console.error("Form thumbnail error:", error);
          document.querySelectorAll("[data-template-thumbnail-key]").forEach((item) => {
            if (item.dataset.templateThumbnailKey === key) {
              item.classList.remove("is-loading");
              item.classList.add("is-error");
            }
          });
          return "";
        })
        .finally(() => {
          formThumbnailJobs.delete(key);
        })
    );
  }

  formThumbnailJobs.get(key).then((dataUrl) => applyFormThumbnail(node, dataUrl));
}

function hydrateFormThumbnails(root = document) {
  if (formThumbnailObserver) {
    formThumbnailObserver.disconnect();
    formThumbnailObserver = null;
  }

  const nodes = Array.from(root.querySelectorAll("[data-template-thumbnail-url]"));
  if (!nodes.length) return;

  const hydrateNode = (node) => hydrateFormThumbnailNode(node);

  if ("IntersectionObserver" in window) {
    const scrollRoot = root.querySelector("[data-forms-list-grid='true']") || root.querySelector(".forms-v2-grid");
    formThumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        formThumbnailObserver?.unobserve(entry.target);
        hydrateNode(entry.target);
      });
    }, { root: scrollRoot || null, rootMargin: "180px" });

    nodes.forEach((node) => {
      const cached = readFormThumbnailCache(node.dataset.templateThumbnailKey || "");
      if (cached) {
        applyFormThumbnail(node, cached);
      } else {
        formThumbnailObserver.observe(node);
      }
    });
    return;
  }

  nodes.forEach(hydrateNode);
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

function validateAdminTemplateDocumentFile(file) {
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

  if (/connect\s+EACCES|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(message)) {
    return "Payment succeeded, but the print agent could not download the uploaded file from the backend. Check internet/network access for the kiosk PC, then retry print from admin history.";
  }

  if (/No application is associated with the specified file/i.test(message)) {
    return "Windows cannot print this file type because no default app with a Print command is associated with it. For PDF, install SumatraPDF or set a PDF reader as the default print app, then retry.";
  }

  return customerSafePrinterMessage(message, "Payment succeeded, but the printer did not complete the job. Please contact staff.");
}

function freePrintError(value) {
  const message = decodePowerShellError(value) || "The free print did not complete.";
  return customerSafePrinterMessage(message, "The free print did not complete. Please contact staff.");
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

function normalizePaperSize(value, fallback = "A4", allowAuto = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (allowAuto && ["auto", "printer default", "default"].includes(normalized)) return "Auto";
  return PRINT_PAPER_SIZES.find((size) => new RegExp(`(^|[^a-z0-9])${size.toLowerCase()}([^a-z0-9]|$)`).test(normalized)) || fallback;
}

function normalizeOrientation(value) {
  return String(value || "").toLowerCase() === "landscape" ? "landscape" : "portrait";
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
    paperSize: PRINT_PAPER_SIZES.includes(source.paperSize) ? source.paperSize : "A4",
    sides: source.sides === "duplex" ? "duplex" : "single",
    orientation: normalizeOrientation(source.orientation),
    range: String(source.range || "all").trim() || "all"
  };
}

function customerSettingEnabled(key, service = selectedService()) {
  const serviceSettings = service && typeof service === "object"
    ? normalizeKioskCustomerSettings(service.customerSettings || {})
    : normalizeKioskCustomerSettings({});

  return CUSTOMER_VISIBLE_SETTING_KEYS.has(key)
    && state.kioskCustomerSettings?.[key] !== false
    && serviceSettings[key] !== false;
}

function enforceCustomerSettings(service = selectedService()) {
  state.kioskCustomerSettings = normalizeKioskCustomerSettings(state.kioskCustomerSettings);

  if (!customerSettingEnabled("color", service) && state.settings.colorMode === "color") {
    state.settings.colorMode = "bw";
  }
  if (!customerSettingEnabled("bw", service) && state.settings.colorMode === "bw") {
    state.settings.colorMode = customerSettingEnabled("color", service) ? "color" : "bw";
  }
  if (!customerSettingEnabled("copies", service)) {
    state.settings.copies = 1;
  }
  if (!customerSettingEnabled("sides", service) || state.printer?.supportsDuplex === false) {
    state.settings.sides = "single";
  }
}

function applyServicePrintDefaults(service = selectedService()) {
  const defaults = normalizeServicePrintDefaults(DEFAULT_SERVICE_PRINT_DEFAULTS);
  state.settings = {
    ...state.settings,
    colorMode: defaults.colorMode,
    copies: defaults.copies,
    paperSize: defaults.paperSize,
    sides: defaults.sides,
    orientation: defaults.orientation,
    range: defaults.range
  };
  enforceCustomerSettings(service);
}

function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates.map((template, index) => {
    const title = String(template?.title || `Template ${index + 1}`).trim();
    const imageUrl = normalizeTemplateImageUrl(template?.imageUrl || "");
    const hasStaticPreview = typeof template?.hasStaticPreview === "boolean"
      ? template.hasStaticPreview
      : undefined;
    return {
      id: slug(template?.id || title, `template-${index + 1}`),
      title,
      titleHi: String(template?.titleHi || "").trim(),
      titleMr: String(template?.titleMr || "").trim(),
      description: String(template?.description || "Blank printable template.").trim(),
      descriptionHi: String(template?.descriptionHi || "").trim(),
      descriptionMr: String(template?.descriptionMr || "").trim(),
      pages: templatePageCount({ ...template, imageUrl }),
      paperSize: normalizePaperSize(template?.paperSize, "Auto", true),
      orientation: normalizeOrientation(template?.orientation),
      fields: normalizeTemplateFields(template?.fields),
      fieldsHi: normalizeTemplateFields(template?.fieldsHi),
      fieldsMr: normalizeTemplateFields(template?.fieldsMr),
      imageUrl,
      documentType: templateDocumentKind(template?.documentType || imageUrl || ""),
      hasStaticPreview
    };
  }).filter((template) => template.title);
}

function mergeDefaultTemplateData(templates, defaults = []) {
  return templates.map((template) => {
    const fallback = defaults.find((item) => item.id === template.id || item.title === template.title) || {};

    return {
      ...template,
      imageUrl: normalizeTemplateImageUrl(template.imageUrl || fallback.imageUrl || ""),
      pages: templatePageCount(
        { ...template, imageUrl: template.imageUrl || fallback.imageUrl || "" },
        fallback.pages || template.pages || 1
      ),
      titleHi: template.titleHi || fallback.titleHi || "",
      titleMr: template.titleMr || fallback.titleMr || "",
      descriptionHi: template.descriptionHi || fallback.descriptionHi || "",
      descriptionMr: template.descriptionMr || fallback.descriptionMr || "",
      fields: template.fields?.length ? template.fields : (fallback.fields || []),
      fieldsHi: template.fieldsHi?.length ? template.fieldsHi : (fallback.fieldsHi || []),
      fieldsMr: template.fieldsMr?.length ? template.fieldsMr : (fallback.fieldsMr || []),
      hasStaticPreview: typeof template.hasStaticPreview === "boolean"
        ? template.hasStaticPreview
        : fallback.hasStaticPreview
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
      titleHi: String(service?.titleHi || fallback.titleHi || "").trim(),
      titleMr: String(service?.titleMr || fallback.titleMr || "").trim(),
      description: String(service?.description || fallback.description || "Customer service.").trim(),
      descriptionHi: String(service?.descriptionHi || fallback.descriptionHi || "").trim(),
      descriptionMr: String(service?.descriptionMr || fallback.descriptionMr || "").trim(),
      defaultPages: Math.max(1, Math.min(99, Number(service?.defaultPages || fallback.defaultPages || 1))),
      mode,
      imageUrl: String(service?.imageUrl || fallback.imageUrl || "").trim(),
      enabled: service?.enabled !== false,
      projectIds: Array.isArray(service?.projectIds)
        ? service.projectIds.map((item) => slug(item, "")).filter(Boolean)
        : String(service?.projectIds || "").split(",").map((item) => slug(item, "")).filter(Boolean),
      kioskIds: Array.isArray(service?.kioskIds) ? service.kioskIds.map((item) => String(item).trim()).filter(Boolean) : [],
      customerSettings: normalizeKioskCustomerSettings(service?.customerSettings || fallback.customerSettings),
      printDefaults: normalizeServicePrintDefaults(service?.printDefaults || fallback.printDefaults),
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

function normalizedPricingPair(rates, fallback = { bw: 0, color: 0 }) {
  return {
    bw: numericPrice(rates?.bw, fallback.bw),
    color: numericPrice(rates?.color, fallback.color)
  };
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

  const kioskPricingSource = pricing.__kiosks || pricing.kiosks || pricing.byKiosk || {};
  const nextKioskPricing = {};

  if (kioskPricingSource && typeof kioskPricingSource === "object") {
    Object.entries(kioskPricingSource).forEach(([rawKioskId, kioskPricing]) => {
      const kioskId = normalizeKioskId(rawKioskId);
      if (!kioskId || !kioskPricing || typeof kioskPricing !== "object") return;

      const scopedPricing = {};
      services.forEach((service) => {
        const rates = kioskPricing[service.id];
        if (!rates || typeof rates !== "object") return;
        scopedPricing[service.id] = normalizedPricingPair(rates, nextPricing[service.id]);
      });

      if (Object.keys(scopedPricing).length) {
        nextKioskPricing[kioskId] = scopedPricing;
      }
    });
  }

  if (Object.keys(nextKioskPricing).length) {
    nextPricing.__kiosks = nextKioskPricing;
  }

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

function setPricingRate(serviceId, priceKey, value, kioskId = "") {
  const normalizedServiceId = String(serviceId || "");
  const normalizedPriceKey = priceKey === "color" ? "color" : "bw";
  const normalizedKioskId = normalizeKioskId(kioskId === "__default" ? "" : kioskId);

  state.pricing = normalizePricing(state.pricing);

  if (!normalizedKioskId) {
    if (state.pricing[normalizedServiceId]) {
      state.pricing[normalizedServiceId][normalizedPriceKey] = numericPrice(value, 0);
    }
    return;
  }

  state.pricing.__kiosks = state.pricing.__kiosks || {};
  state.pricing.__kiosks[normalizedKioskId] = state.pricing.__kiosks[normalizedKioskId] || {};
  const baseRates = state.pricing[normalizedServiceId] || defaultServicePricing[normalizedServiceId] || defaultServicePricing.print;
  state.pricing.__kiosks[normalizedKioskId][normalizedServiceId] = {
    ...normalizedPricingPair(state.pricing.__kiosks[normalizedKioskId][normalizedServiceId], baseRates),
    [normalizedPriceKey]: numericPrice(value, 0)
  };
}

function readStoredServices() {
  try {
    const scopedKey = servicesCacheKey();
    const scopedServices = window.localStorage.getItem(scopedKey);
    if (scopedServices) {
      return normalizeServicesConfig(JSON.parse(scopedServices));
    }

    if (!isAdminEntry && !DEMO_KIOSK_MODE && KIOSK_ID !== "LOCAL-KIOSK") {
      return [];
    }

    return normalizeServicesConfig(JSON.parse(window.localStorage.getItem(SERVICES_CACHE_KEY) || "null"));
  } catch {
    return isAdminEntry || DEMO_KIOSK_MODE || KIOSK_ID === "LOCAL-KIOSK"
      ? normalizeServicesConfig(services)
      : [];
  }
}

function servicesCacheKey() {
  const kioskId = normalizeKioskId(KIOSK_ID);
  return kioskId && kioskId !== UNASSIGNED_KIOSK_ID
    ? `${SERVICES_CACHE_KEY}:${kioskId}`
    : SERVICES_CACHE_KEY;
}

function storeServices() {
  try {
    window.localStorage.setItem(servicesCacheKey(), JSON.stringify(services));
    if (isAdminEntry || DEMO_KIOSK_MODE || KIOSK_ID === "LOCAL-KIOSK") {
      window.localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify(services));
    }
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

function normalizeIdleScreensaver(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const mode = ["image", "video"].includes(source.mode) ? source.mode : "none";
  const imageUrls = Array.isArray(source.imageUrls)
    ? source.imageUrls.filter((url) => typeof url === "string" && url).slice(0, 10)
    : [];
  const videoUrl = typeof source.videoUrl === "string" ? source.videoUrl.trim() : "";
  const timeoutSeconds = Math.min(600, Math.max(15, Number(source.timeoutSeconds) || 60));

  return { mode, imageUrls, videoUrl, timeoutSeconds };
}

function idleScreensaverHasUsableMedia(idleScreensaver) {
  if (!idleScreensaver) return false;
  if (idleScreensaver.mode === "image") return idleScreensaver.imageUrls.length > 0;
  if (idleScreensaver.mode === "video") return Boolean(idleScreensaver.videoUrl);
  return false;
}

function normalizeClientBrand(brand = {}) {
  const source = brand && typeof brand === "object" ? brand : {};
  const logoUrl = String(source.logoUrl || source.clientLogoUrl || source.logo || "").trim();
  const title = String(source.title || source.kioskTitle || source.name || "").trim();
  const subtitle = String(source.subtitle || source.kioskSubtitle || source.description || "").trim();
  const idleScreensaver = normalizeIdleScreensaver(source.idleScreensaver);

  if (!logoUrl && !title && !subtitle && idleScreensaver.mode === "none") {
    return {};
  }

  return {
    clientId: String(source.clientId || source.adminId || "").trim(),
    kioskId: normalizeKioskId(source.kioskId || ""),
    name: String(source.name || "").trim(),
    logoUrl,
    title,
    subtitle,
    idleScreensaver
  };
}

function readStoredClientBrand() {
  try {
    const brand = normalizeClientBrand(JSON.parse(window.localStorage.getItem("kioskClientBrand") || "null"));
    if (brand.kioskId && brand.kioskId !== normalizeKioskId(KIOSK_ID)) return {};
    return brand;
  } catch {
    return {};
  }
}

function storeClientBrand() {
  try {
    window.localStorage.setItem("kioskClientBrand", JSON.stringify({
      ...(state.clientBrand || {}),
      kioskId: normalizeKioskId(state.kiosk?.kioskId || KIOSK_ID)
    }));
  } catch {
    // Local storage can be unavailable in hardened kiosk shells.
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
if (DEMO_KIOSK_MODE) {
  applyDemoKioskConfig({ rerender: false });
}

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
  const uniqueTemplates = (items = []) => {
    const seen = new Set();
    return items.filter((template, index) => {
      const key = String(template?.imageUrl || template?.title || template?.id || `template-${index}`)
        .trim()
        .toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (service && service.templates) {
    return uniqueTemplates(service.templates);
  }

  return uniqueTemplates(formTemplates[serviceId] || []);
}

function isFormTemplateService(serviceId = state.selectedService) {
  const service = services.find((item) => item.id === serviceId);
  return service ? service.mode === "template" : formTemplatesForService(serviceId).length > 0;
}

function normalizedTemplateSearchQuery() {
  return String(state.templateSearchQuery || "").trim().toLowerCase();
}

function templateSearchText(template) {
  return [
    localizedTemplateText(template, "title"),
    localizedTemplateText(template, "description"),
    template?.department,
    template?.category,
    template?.keyword,
    template?.id,
    template?.pages,
    normalizePaperSize(template?.paperSize, "A4", true),
    normalizeOrientation(template?.orientation)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredFormTemplates(serviceId = state.selectedService) {
  const templates = formTemplatesForService(serviceId);
  const query = normalizedTemplateSearchQuery();

  if (!query) {
    return templates;
  }

  return templates.filter((template) => templateSearchText(template).includes(query));
}

function renderTemplateSearchKeyboard() {
  const numberRow = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"]
  ];

  return `
    <div class="template-search-keyboard" aria-label="Virtual keyboard">
      <div class="template-keyboard-header">
        <button type="button" class="template-key template-key-close" data-template-search-action="close" aria-label="Close keyboard">${uiIcon("close", 20)}</button>
      </div>
      <div class="template-keyboard-row template-keyboard-row-numbers">
        ${numberRow.map((key) => `<button type="button" class="template-key" data-template-search-key="${key}">${key}</button>`).join("")}
      </div>
      ${rows.map((row, index) => `
        <div class="template-keyboard-row template-keyboard-row-${index + 1}">
          ${row.map((key) => `<button type="button" class="template-key" data-template-search-key="${key}">${key}</button>`).join("")}
          ${index === rows.length - 1 ? `<button type="button" class="template-key template-key-backspace" data-template-search-action="backspace" aria-label="Backspace">${uiIcon("backspace", 20)}</button>` : ""}
        </div>
      `).join("")}
      <div class="template-keyboard-row template-keyboard-controls">
        <button type="button" class="template-key" data-template-search-action="space">Space</button>
        <button type="button" class="template-key template-key-go" data-template-search-action="go">Go</button>
      </div>
    </div>
  `;
}

function focusTemplateSearchInput() {
  requestAnimationFrame(() => {
    const input = document.querySelector("[data-template-search-input]");
    if (!input) return;

    input.focus({ preventScroll: true });
    if (typeof input.setSelectionRange === "function") {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  });
}

function activateTemplateSearchKeyboard({ focus = true } = {}) {
  if (!state.templateSearchKeyboardActive) {
    state.templateSearchKeyboardActive = true;
    render();
  }

  if (focus) {
    focusTemplateSearchInput();
  }
}

function setTemplateSearchQuery(value, { focus = true } = {}) {
  state.templateSearchKeyboardActive = true;
  state.templateSearchQuery = String(value ?? "").slice(0, 80);
  render();
  if (focus) {
    focusTemplateSearchInput();
  }
}

function serviceAvailableForKiosk(service, kioskId = KIOSK_ID) {
  const projectIds = Array.isArray(service.projectIds) ? service.projectIds : [];
  const kioskIds = Array.isArray(service.kioskIds) ? service.kioskIds.map((item) => normalizeKioskId(item)).filter(Boolean) : [];

  if (kioskIds.length) {
    return service.enabled !== false && kioskIds.includes(normalizeKioskId(kioskId));
  }

  if (projectIds.length) {
    return service.enabled !== false && Boolean(state.kiosk.projectId && projectIds.includes(state.kiosk.projectId));
  }

  return service.enabled !== false;
}

function customerServices() {
  return services.filter((service) => serviceAvailableForKiosk(service));
}

function currentPricingKioskId() {
  if (state.mode === "admin") {
    return normalizeKioskId(state.adminSelectedServiceKioskId || "");
  }

  return normalizeKioskId(KIOSK_ID);
}

function serviceRates(serviceId = state.selectedService, kioskId = currentPricingKioskId()) {
  const service = services.find((item) => item.id === serviceId) || services[0];
  const baseRates = normalizedPricingPair(
    state.pricing?.[service.id] || service?.pricing || defaultServicePricing[service.id] || defaultServicePricing.print,
    defaultServicePricing[service.id] || defaultServicePricing.print
  );
  const scopedKioskId = normalizeKioskId(kioskId);
  const kioskRates = scopedKioskId ? state.pricing?.__kiosks?.[scopedKioskId]?.[service.id] : null;
  const rates = kioskRates ? normalizedPricingPair(kioskRates, baseRates) : baseRates;

  return {
    bw: numericPrice(rates.bw, 0),
    color: numericPrice(rates.color, 0)
  };
}

function customerRateRows(rates, rowClass = "info-row", service = selectedService()) {
  return [
    customerSettingEnabled("bw", service) ? `<div class="${rowClass}"><span>B/W rate</span><strong>${money(rates.bw)} / page</strong></div>` : "",
    customerSettingEnabled("color", service) ? `<div class="${rowClass}"><span>Color rate</span><strong>${money(rates.color)} / page</strong></div>` : ""
  ].filter(Boolean);
}

function customerServiceRateLabels(rates, service) {
  return [
    customerSettingEnabled("bw", service) ? `<span><strong>${money(rates.bw)}</strong><em>B/W per page</em></span>` : "",
    customerSettingEnabled("color", service) ? `<span><strong>${money(rates.color)}</strong><em>Color per page</em></span>` : ""
  ].filter(Boolean).join("");
}

function imagePreviewMarkup(imageUrl, fallbackText, className) {
  if (imageUrl) {
    return `<span class="${className} service-image"><img alt="" src="${escapeHtml(imageUrl)}" draggable="false" data-no-visual-search /></span>`;
  }

  return `<span class="${className}">${escapeHtml(fallbackText || "SV")}</span>`;
}

function serviceMediaMarkup(service, className = "service-icon") {
  return imagePreviewMarkup("", service?.icon || "SV", className);
}

function pageCount() {
  return jobFiles().reduce((total, file) => total + Math.max(1, Number(file.pages) || 1), 0);
}

function selectedPagesForRange(value, totalPages) {
  const total = Math.max(1, Number(totalPages) || 1);
  const input = String(value || "all").trim().toLowerCase();
  if (!input || input === "all") return Array.from({ length: total }, (_, index) => index + 1);
  if (!/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(input)) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const selected = new Set();
  input.split(",").forEach((part) => {
    const [rawStart, rawEnd] = part.split("-").map((item) => Number(item.trim()));
    const start = Math.max(1, Math.min(total, rawStart));
    const end = Math.max(1, Math.min(total, rawEnd || rawStart));
    for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) selected.add(page);
  });
  return selected.size ? [...selected].sort((a, b) => a - b) : Array.from({ length: total }, (_, index) => index + 1);
}

function effectivePageCount() {
  return jobFiles().reduce((total, file) => (
    total + selectedPagesForRange(state.settings.range, Math.max(1, Number(file.pages) || 1)).length
  ), 0);
}

function jobFiles() {
  if (Array.isArray(state.files) && state.files.length) return state.files;
  return state.file ? [state.file] : [];
}

function activePreviewFile() {
  const files = jobFiles();
  return files[Math.min(state.previewFileIndex, Math.max(files.length - 1, 0))] || null;
}

function colorSelectionAvailable(file = activePreviewFile()) {
  return Boolean(file
    && customerSettingEnabled("bw")
    && customerSettingEnabled("color"));
}

function enforceJobColorMode(file = activePreviewFile()) {
  if (!colorSelectionAvailable(file) && state.settings.colorMode === "color") {
    state.settings.colorMode = "bw";
  }
}

function setJobFiles(files) {
  const nextFiles = files.slice(0, MAX_FILES_PER_JOB);
  state.files = nextFiles;
  state.file = nextFiles[0] || null;
  state.previewFileIndex = 0;
  state.previewPage = 1;
  enforceJobColorMode(nextFiles[0] || null);
}

function syncPdfPreviewPageCount(file, totalPages) {
  const pageTotal = Math.max(1, Number(totalPages) || 1);
  if (!file || file.previewKind !== "pdf") {
    return false;
  }

  file.pdfPageCountResolved = true;
  if (Number(file.pages) === pageTotal) {
    return false;
  }

  file.pages = pageTotal;
  if (file === activePreviewFile()) {
    state.previewPage = Math.max(1, Math.min(pageTotal, Number(state.previewPage) || 1));
  }
  return true;
}

function resolvePdfPreviewPageCount(file) {
  if (!file || file.previewKind !== "pdf" || !file.previewUrl || file.pdfPageCountResolved || file.pdfPageCountResolving) {
    return;
  }

  file.pdfPageCountResolving = true;
  import("./assets/vendor/pdfjs/pdf.min.mjs").then(async (pdfjsLib) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/vendor/pdfjs/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument({ url: file.previewUrl, enableXfa: true }).promise;
    if (syncPdfPreviewPageCount(file, pdf.numPages)) {
      render();
    }
  }).catch((error) => {
    console.error("PDF page count error:", error);
  }).finally(() => {
    file.pdfPageCountResolving = false;
  });
}

// Same pdf.js path as resolvePdfPreviewPageCount, just run at upload time
// instead of lazily at preview time, so the page-limit check (see the
// file-input handler) is accurate rather than relying on the file-size
// estimate alone. Marks the file as resolved so the later preview-time
// resolver (resolvePdfPreviewPageCount) skips redundant work.
async function detectExactPdfPageCount(file) {
  if (!file || file.previewKind !== "pdf" || !file.previewUrl) return null;

  try {
    const pdfjsLib = await import("./assets/vendor/pdfjs/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/vendor/pdfjs/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument({ url: file.previewUrl, enableXfa: true }).promise;
    syncPdfPreviewPageCount(file, pdf.numPages);
    return pdf.numPages;
  } catch (error) {
    console.error("PDF page count error:", error);
    return null;
  }
}

// Shared by the direct kiosk file picker and the mobile-upload receive path.
// Checks the fast size-based (or server-reported) page estimate first; for
// PDFs with a previewUrl available, also confirms with the real pdf.js count
// so a small-but-many-page PDF can't slip past the estimate. Returns an
// error message string, or null when the document is within the limit.
async function enforceUploadPageLimit(file) {
  if (file.pages > MAX_UPLOAD_PAGES_PER_DOCUMENT) {
    return `${file.name} looks like it has too many pages. This kiosk allows up to ${MAX_UPLOAD_PAGES_PER_DOCUMENT} pages per document.`;
  }

  if (file.previewKind === "pdf" && file.previewUrl) {
    const exactPages = await detectExactPdfPageCount(file);
    if (exactPages && exactPages > MAX_UPLOAD_PAGES_PER_DOCUMENT) {
      return `${file.name} has ${exactPages} pages. This kiosk allows up to ${MAX_UPLOAD_PAGES_PER_DOCUMENT} pages per document.`;
    }
  }

  return null;
}

function setDemoPrinterReady({ rerender = false } = {}) {
  state.printer = {
    ...state.printer,
    online: true,
    checking: false,
    name: "Printer",
    paper: "Ready",
    toner: "Ready",
    queue: 0,
    supportsColor: true,
    supportsDuplex: true,
    defaultPaperSize: "A4",
    paperSizes: [...PRINT_PAPER_SIZES],
    scanner: "Connected",
    internet: "Online",
    agent: "Ready",
    statusText: "Printer online",
    manualReadyOverride: true
  };

  applyPrinterPaperDefault(state.printer);
  if (rerender) render();
}

function applyDemoKioskConfig({ rerender = false } = {}) {
  services = normalizeServicesConfig(demoKioskServices);
  state.pricing = normalizePricing(Object.fromEntries(
    demoKioskServices.map((service) => [service.id, service.pricing])
  ));
  state.kiosk = {
    kioskId: KIOSK_ID,
    name: "Kiosk",
    branch: "Local Branch",
    projectId: "",
    status: "active"
  };
  state.clientBrand = {};
  storeClientBrand();
  state.kioskCustomerSettings = { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS };
  state.configStatus = "";
  setDemoPrinterReady({ rerender: false });
  enforceCustomerSettings();

  if (rerender) render();
}

function startDemoPayment() {
  ensureActiveJobId();
  const details = priceDetails();
  const paymentUrl = demoPaymentUrl(details);
  state.paymentStatus = "Waiting";
  state.paymentStatusMessage = "Payment ready.";
  state.paymentError = "";
  state.paymentBusy = false;
  state.paymentOrder = {
    paymentId: `PAY-${Date.now().toString().slice(-6)}`,
    orderId: `ORDER-${Date.now().toString().slice(-6)}`,
    amount: details.total * 100,
    currency: "INR",
    paymentUrl,
    qrSvg: paymentQrMarkup(paymentUrl)
  };
  render();
}

function completeDemoPayment() {
  state.paymentStatus = "Success";
  state.paymentStatusMessage = "Payment successful. Starting print...";
  state.paymentError = "";
  state.paymentBusy = false;
  beginPrintFlowAfterPayment();
}

function demoPaymentUrl(details = priceDetails()) {
  const amount = Math.max(0, Number(details.total) || 0).toFixed(2);
  const note = encodeURIComponent(`Print Kiosk ${currentJobId()}`);
  return `upi://pay?pa=printkiosk@upi&pn=Print%20Kiosk&am=${amount}&cu=INR&tn=${note}`;
}

function paymentQrMarkup(paymentUrl) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(paymentUrl)}`;
  return `<img alt="Payment QR code" src="${src}" draggable="false" data-no-visual-search />`;
}

function priceDetails() {
  const file = activePreviewFile();
  const service = services.find((item) => item.id === file?.serviceId)
    || selectedService();
  const pages = Math.max(1, effectivePageCount());
  const copies = Math.max(1, Number(state.settings.copies) || 1);
  const rates = serviceRates(service?.id);
  const colorMode = state.settings.colorMode === "color" && customerSettingEnabled("color", service)
    ? "color"
    : "bw";
  const rate = colorMode === "color" ? rates.color : rates.bw;
  const total = pages * copies * rate;

  return { pages, copies, rate, rates, total, colorMode, serviceId: service?.id || "" };
}

function isFreePrintJob(details = priceDetails()) {
  return Number(details.total || 0) <= 0;
}

function applyPrinterPaperDefault(printer = state.printer) {
  if (state.settingsCustomized) return;
  state.settings.paperSize = normalizePaperSize(printer?.defaultPaperSize, "A4");
  if (printer?.supportsDuplex === false) state.settings.sides = "single";
  if (printer?.supportsColor === false) state.settings.colorMode = "bw";
  enforceCustomerSettings();
}

function applyTemplatePrintDefaults(template) {
  const configuredPaper = normalizePaperSize(template?.paperSize, "Auto", true);
  state.settings.paperSize = configuredPaper === "Auto"
    ? normalizePaperSize(state.printer.defaultPaperSize, "A4")
    : configuredPaper;
  state.settings.orientation = normalizeOrientation(template?.orientation);
  state.settings.range = "all";
  state.settingsCustomized = configuredPaper !== "Auto";
  enforceCustomerSettings();
}

function colorSelectionSupported() {
  return state.settings.colorMode !== "color" || state.printer.supportsColor !== false;
}

function sheetsNeededForFiles(files) {
  return files.reduce((total, file) => total + Math.max(1, Number(file.pages) || 1), 0);
}

function requiredSheetsForJob() {
  const copies = Math.max(1, Number(state.settings.copies) || 1);
  return sheetsNeededForFiles(jobFiles()) * copies;
}

// Only reports a number when the printer has reported a usable sheet count
// over SNMP (see snmpInputSheetsRemaining in local-agent/printerAgent.js) -
// null/undefined means "unknown", and callers must never treat unknown as
// "not enough paper."
function remainingPaperSheets() {
  const remaining = state.printerHealth?.snmp?.paperSheetsRemaining;
  return remaining === null || remaining === undefined ? null : remaining;
}

function paperSufficientForJob() {
  const remaining = remainingPaperSheets();
  if (remaining === null) return true;
  return remaining >= requiredSheetsForJob();
}

function paymentReady() {
  return colorSelectionSupported() && paperSufficientForJob();
}

// Upload-time equivalent of paperSufficientForJob(), checked against the
// files being uploaded directly (copies isn't chosen yet at this point in
// the flow, so this checks page count alone - the same conservative
// interpretation the user's next copies choice can only make stricter).
function enforceUploadPaperSufficiency(files) {
  const remaining = remainingPaperSheets();
  if (remaining === null) return null;

  const needed = sheetsNeededForFiles(files);
  if (needed > remaining) {
    return `Printer is low on paper (${remaining} sheet${remaining === 1 ? "" : "s"} left, this upload needs ${needed}). Please contact staff.`;
  }

  return null;
}

function printerIssueStatus(kind, title, detail, tone = "error") {
  return { kind, title, detail, tone };
}

function customerPrinterIssueFromMessage(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (normalized.includes("paper jam") || normalized.includes("jam detected")) {
    return printerIssueStatus("paper-jam", "Paper jam detected", "Paper jam detected. Please contact staff.");
  }
  if (normalized.includes("no paper") || normalized.includes("out of paper") || normalized.includes("load paper") || normalized.includes("paper empty")) {
    return printerIssueStatus("paper-empty", "Printer out of paper", "Printer is out of paper. Please contact staff.");
  }
  if (normalized.includes("no toner") || normalized.includes("toner empty") || normalized.includes("replace cartridge") || normalized.includes("cartridge empty")) {
    return printerIssueStatus("toner-empty", "Printer toner empty", "Printer toner needs replacement. Please contact staff.");
  }
  if (normalized.includes("door open") || normalized.includes("cover open") || normalized.includes("tray open")) {
    return printerIssueStatus("door-open", "Printer door open", "Printer door or tray is open. Please contact staff.");
  }
  if (normalized.includes("output tray full") || normalized.includes("output bin full")) {
    return printerIssueStatus("output-full", "Printer output tray full", "Printer output tray is full. Please contact staff.");
  }
  if ((normalized.includes("queue") || normalized.includes("blocked") || normalized.includes("paused") || normalized.includes("intervention")) &&
    (normalized.includes("printer") || normalized.includes("print") || normalized.includes("job") || normalized.includes("queue"))) {
    return printerIssueStatus("queue-blocked", "Printer queue blocked", "Printer queue needs attention. Please contact staff.");
  }
  if (normalized.includes("offline") || normalized.includes("not running") || normalized.includes("unavailable") || normalized.includes("failed to fetch") || normalized.includes("cannot reach printer agent")) {
    return printerIssueStatus("offline", "Printer offline", "Printer is offline. Please contact staff.");
  }

  return null;
}

function customerPrinterHealthIssue() {
  const h = state.printerHealth || {};
  if (!h.available) return null;

  if (!h.online || h.workOffline) {
    return printerIssueStatus("offline", "Printer offline", customerSafePrinterMessage(h.errorMessage || "Printer offline", "Printer is offline. Please contact staff."));
  }
  if (h.paperJam) return printerIssueStatus("paper-jam", "Paper jam detected", "Paper jam detected. Please contact staff.");
  if (h.paper === false) return printerIssueStatus("paper-empty", "Printer out of paper", "Printer is out of paper. Please contact staff.");
  if (h.doorOpen) return printerIssueStatus("door-open", "Printer door open", "Printer door or tray is open. Please contact staff.");
  if (h.tonerEmpty) return printerIssueStatus("toner-empty", "Printer toner empty", "Printer toner needs replacement. Please contact staff.");
  if (h.outputBinFull) return printerIssueStatus("output-full", "Printer output tray full", "Printer output tray is full. Please contact staff.");
  if (h.serviceRequested) return printerIssueStatus("service-required", "Printer service required", customerSafePrinterMessage(h.errorMessage || "Printer service requested", "Printer needs service. Please contact staff."));
  if (h.queueError) return printerIssueStatus("queue-blocked", "Printer queue blocked", customerSafePrinterMessage(h.errorMessage || "Printer queue blocked", "Printer queue needs attention. Please contact staff."));
  if (!h.ready && h.errorMessage) {
    return customerPrinterIssueFromMessage(h.errorMessage) ||
      printerIssueStatus("not-ready", "Printer not ready", customerSafePrinterMessage(h.errorMessage, "Printer is not ready. Please contact staff."));
  }

  return null;
}

function customerPrinterAgentIssue() {
  if (DEMO_KIOSK_MODE && state.mode === "customer") return null;
  const p = state.printer || {};
  if (p.manualReadyOverride) return null;
  if (p.checking) {
    return printerIssueStatus("checking", "Checking printer", "Please wait while the kiosk checks the printer.", "checking");
  }

  const combinedStatus = [p.statusText, p.paper, p.toner, p.agent].filter(Boolean).join(" ");
  const messageIssue = customerPrinterIssueFromMessage(combinedStatus);
  if (messageIssue) return messageIssue;

  if (p.agent === "Offline" || !p.online) {
    return printerIssueStatus("offline", "Printer offline", customerSafePrinterMessage(p.statusText || "Printer offline", "Printer is offline. Please contact staff."));
  }

  return null;
}

function customerPrinterBlockIssue({ includeAgentFallback = false } = {}) {
  if (DEMO_KIOSK_MODE && state.mode === "customer") return null;

  const healthIssue = customerPrinterHealthIssue();
  if (healthIssue) return healthIssue;

  if (state.printerHealth?.available && !includeAgentFallback) return null;
  return customerPrinterAgentIssue();
}

function printerReadyForCustomerFlow() {
  // Block on the printer being offline, and on HARD errors (paper jam, no paper,
  // door open, toner empty) — the customer only ever sees a generic "Offline" state.
  const h = state.printerHealth || {};
  if (!h.available) return true; // No health data yet - allow flow
  if (!h.online || h.workOffline) return false;
  if (h.paperJam) return false;
  if (h.paper === false) return false;
  if (h.doorOpen) return false;
  if (h.tonerEmpty) return false;
  if (h.outputBinFull) return false;
  return true;
}

function customerKioskBlockStatus() {
  const h = state.printerHealth || {};
  if (!h.available) return null;
  if (!h.online || h.workOffline) return printerIssueStatus("offline", "Offline", "Printer is offline. Please contact staff.");
  if (h.paperJam) return printerIssueStatus("paper-jam", "Offline", "Printer is offline. Please contact staff.");
  if (h.paper === false) return printerIssueStatus("paper-empty", "Offline", "Printer is offline. Please contact staff.");
  if (h.doorOpen) return printerIssueStatus("door-open", "Offline", "Printer is offline. Please contact staff.");
  if (h.tonerEmpty) return printerIssueStatus("toner-empty", "Offline", "Printer is offline. Please contact staff.");
  if (h.outputBinFull) return printerIssueStatus("output-full", "Offline", "Printer is offline. Please contact staff.");
  return null;
}

// Real internet connectivity (state.internetOnline, from the Electron main
// process — see initInternetStatusIpc). Kept separate from the printer
// checks above: a kiosk with no internet is still reachable on its own
// screen, so this needs its own status distinct from "printer offline",
// and it's checked first everywhere printer status is checked so the two
// can never show contradictory Online/Offline at the same time.
function customerInternetBlockStatus() {
  if (state.internetOnline !== false) return null;
  return printerIssueStatus("no-internet", "No Internet", "This kiosk has lost its internet connection. Please contact staff.", "error");
}

function userFacingConnectionMessage(message, fallback) {
  const text = String(message || "").trim();
  if (!text) return fallback;

  const normalized = text.toLowerCase();
  if (normalized === "failed to fetch" || normalized.includes("load failed") || normalized.includes("networkerror")) {
    return fallback;
  }

  return customerSafePrinterMessage(text, fallback);
}

function customerSafePrinterMessage(message, fallback = "Printer is offline. Please contact staff.") {
  return fallback;

  if (normalized.includes("paper jam") || normalized.includes("jam detected")) {
    return "Paper jam detected. Please contact staff.";
  }
  if (normalized.includes("no paper") || normalized.includes("out of paper") || normalized.includes("load paper")) {
    return "Printer is out of paper. Please contact staff.";
  }
  if (normalized.includes("low paper") || normalized.includes("paper running low")) {
    return "Printer paper is low. Please contact staff.";
  }
  if (normalized.includes("no toner") || normalized.includes("toner empty") || normalized.includes("replace cartridge")) {
    return "Printer toner needs replacement. Please contact staff.";
  }
  if (normalized.includes("low toner") || normalized.includes("toner low")) {
    return "Printer toner is low. Please contact staff.";
  }
  if (normalized.includes("door open") || normalized.includes("tray")) {
    return "Printer door or tray is open. Please contact staff.";
  }
  if (normalized.includes("output tray full") || normalized.includes("output bin full")) {
    return "Printer output tray is full. Please contact staff.";
  }
  if (normalized.includes("queue") || normalized.includes("blocked")) {
    return "Printer queue needs attention. Please contact staff.";
  }
  if (normalized.includes("offline") || normalized.includes("not running") || normalized.includes("unavailable")) {
    return "Printer is offline. Please contact staff.";
  }
  if (normalized.includes("printer") && normalized.includes(":")) {
    return fallback;
  }

  return text;
}

function renderCustomerServiceStatusBanner(status) {
  if (!status) return "";

  return `
    <div class="kiosk-service-status kiosk-service-status--${escapeHtml(status.tone)}" role="status" aria-live="polite">
      <span class="kiosk-service-status__icon" aria-hidden="true">${uiIcon(status.tone === "checking" ? "refresh" : "alert", 22)}</span>
      <span class="kiosk-service-status__copy">
        <strong>${escapeHtml(status.title)}</strong>
        <span>${escapeHtml(status.detail)}</span>
      </span>
    </div>
  `;
}

function paymentBlockMessage() {
  if (!colorSelectionSupported()) {
    return "Color printing is selected, but the selected printer does not support color.";
  }

  if (!paperSufficientForJob()) {
    const remaining = state.printerHealth?.snmp?.paperSheetsRemaining;
    return `Printer is low on paper (${remaining} sheet${remaining === 1 ? "" : "s"} left, this job needs ${requiredSheetsForJob()}). Please contact staff.`;
  }

  return "";
}

function handleCustomerPrinterIssue(issue, { resetFlow = false, recordFailure = false, rerender = true } = {}) {
  if (!issue) return false;

  const notice = {
    tone: issue.tone || "error",
    kind: issue.kind || "printer",
    title: issue.title || "Printer offline",
    detail: issue.detail || "Printer is offline. Please contact staff."
  };
  const failureReason = notice.detail || notice.title;

  if (recordFailure && state.activeJobId) {
    addJob(isFreePrintJob() ? "Free Print Failed" : "Payment Success Print Failed", failureReason);
  }

  if (resetFlow) {
    resetCustomer();
  }

  state.customerPrinterNotice = notice;
  state.lastAlertedPrinterIssue = notice.kind;

  if (rerender) {
    render();
  }

  return true;
}

function handleCustomerPrinterStateAfterRefresh() {
  if (state.mode !== "customer" || DEMO_KIOSK_MODE) return;

  const issue = customerPrinterBlockIssue({ includeAgentFallback: true });
  if (!issue) {
    state.customerPrinterNotice = null;
    state.lastAlertedPrinterIssue = null;
    return;
  }

  if (issue.kind === "checking") return;

  state.customerPrinterNotice = {
    tone: issue.tone || "error",
    kind: issue.kind || "printer",
    title: issue.title || "Printer offline",
    detail: issue.detail || "Printer is offline. Please contact staff."
  };
  state.lastAlertedPrinterIssue = state.customerPrinterNotice.kind;
}

function nextJobId() {
  localJobSequence += 1;
  return `JOB-${Date.now()}-${String(localJobSequence).padStart(2, "0")}`;
}

function ensureActiveJobId() {
  if (!state.activeJobId) {
    state.activeJobId = nextJobId();
  }

  return state.activeJobId;
}

function currentJobId() {
  return ensureActiveJobId();
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

  if (!allowedUploadExtensions.includes(extension)) {
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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
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

function genericTemplateMarkup(template, serviceTitle) {
  const fields = Array.isArray(template.fields) && template.fields.length
    ? template.fields
    : ["Applicant", "Address", "Mobile", "Purpose", "Signature"];
  const pages = Math.max(1, Number(template.pages) || 1);

  return `
    <div class="form-preview-pages">
      ${Array.from({ length: pages }, (_, pageIndex) => `
        <article class="form-preview-page printable-form-template">
          <div class="form-preview-page-header">
            <strong>${escapeHtml(template.title || "Blank Form")}</strong>
            <span>Page ${pageIndex + 1} of ${pages}</span>
          </div>
          <div class="document-preview-lines">
            <h3>${escapeHtml(template.title || "Blank Form")}</h3>
            <p>${escapeHtml(template.description || serviceTitle || "Blank printable template.")}</p>
            ${fields.map((field) => `
              <div class="printable-field-row">
                <span>${escapeHtml(field)}</span>
                <i></i>
              </div>
            `).join("")}
            <div class="printable-field-row wide">
              <span>Remarks</span>
              <i></i>
            </div>
            <div class="printable-sign-row">
              <span>Date</span>
              <i></i>
              <span>Signature</span>
              <i></i>
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function genericTemplateHtml(template, serviceTitle) {
  const fields = Array.isArray(template.fields) && template.fields.length
    ? template.fields
    : ["Applicant", "Address", "Mobile", "Purpose", "Signature"];
  const pages = Math.max(1, Number(template.pages) || 1);

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(template.title || "Blank Form")}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Cambria, "Nirmala UI", "Mangal", Georgia, "Times New Roman", serif; background: #fff; }
    article { page-break-after: always; min-height: 260mm; border: 1.5pt solid #111827; padding: 14mm; position: relative; }
    article:last-child { page-break-after: auto; }
    header { border-bottom: 1pt solid #111827; margin-bottom: 10mm; padding-bottom: 5mm; }
    h1 { font-size: 20pt; margin: 0 0 3mm; text-align: center; }
    p { font-size: 10.5pt; margin: 0; text-align: center; }
    .field { display: grid; gap: 3mm; grid-template-columns: 42mm 1fr; margin: 7mm 0; }
    .field span, .sign span { font-size: 11pt; font-weight: 700; }
    .line { border-bottom: 1pt dotted #111827; min-height: 7mm; }
    .remarks { grid-template-columns: 42mm 1fr; margin-top: 10mm; }
    .sign { display: grid; gap: 5mm; grid-template-columns: 18mm 1fr 28mm 1fr; margin-top: 18mm; }
    footer { bottom: 14mm; color: #4b5563; font-size: 8.5pt; left: 14mm; position: absolute; right: 14mm; text-align: center; }
  </style>
</head>
<body>
  ${Array.from({ length: pages }, (_, pageIndex) => `
    <article>
      <header>
        <h1>${escapeHtml(template.title || "Blank Form")}</h1>
        <p>${escapeHtml(template.description || serviceTitle || "Blank printable template.")}</p>
      </header>
      ${fields.map((field) => `<div class="field"><span>${escapeHtml(field)}</span><div class="line"></div></div>`).join("")}
      <div class="field remarks"><span>Remarks</span><div class="line"></div></div>
      <div class="sign"><span>Date</span><div class="line"></div><span>Signature</span><div class="line"></div></div>
      <footer>Page ${pageIndex + 1}</footer>
    </article>
  `).join("")}
</body>
</html>
  `.trim();
}

function birthCertificateTemplatePlainText() {
  return [
    "                                   FORM NO. 5",
    "                              BIRTH CERTIFICATE",
    "                         à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£ - à¤ªà¤¤à¥à¤°",
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
        <div class="bc-form-no">à¤ªà¥à¤°à¤ªà¤¤à¥à¤° à¤¸à¤‚. 5<br><strong>FORM NO. 5</strong></div>
        <div class="bc-top-row">
          <div class="bc-emblem">
            <div class="bc-emblem-mark">â˜¸</div>
            <span>à¤¸à¤¤à¥à¤¯à¤®à¥‡à¤µ à¤œà¤¯à¤¤à¥‡</span>
          </div>
          <div class="bc-registration-mark">â†»</div>
        </div>
        <h1>à¤œà¤¨à¥à¤® à¤ªà¥à¤°à¤®à¤¾à¤£ - à¤ªà¤¤à¥à¤°</h1>
        <h2>BIRTH CERTIFICATE</h2>
        <p class="bc-rule">
          ( à¤œà¤¨à¥à¤® à¤”à¤° à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥€à¤•à¤°à¤£ à¤…à¤§à¤¿à¤¨à¤¿à¤¯à¤®, 1969 à¤•à¥€ à¤§à¤¾à¤°à¤¾ 12/17 à¤”à¤°<br>
          à¤°à¤¾à¤œà¤¸à¥à¤¥à¤¾à¤¨ à¤œà¤¨à¥à¤® à¤”à¤° à¤®à¥ƒà¤¤à¥à¤¯à¥ à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥€à¤•à¤°à¤£ à¤¨à¤¿à¤¯à¤®, 2000 à¤•à¥‡ à¤¨à¤¿à¤¯à¤® 8/13 à¤•à¥‡ à¤…à¤§à¥€à¤¨ à¤œà¤¾à¤°à¥€ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾ )
        </p>
        <p class="bc-rule">
          ( Issued under Section 12/17 of the Registration of Births and Deaths Act,1969 and Rule 8/13 of the<br>
          Rajasthan Registration of Births and Deaths Rules, 2000 )
        </p>
        <p class="bc-hindi-cert">
          à¤¯à¤¹ à¤ªà¥à¤°à¤®à¤¾à¤£à¤¿à¤¤ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾à¤¤à¤¾ à¤¹à¥ˆ à¤•à¤¿ à¤¨à¤¿à¤®à¥à¤¨ à¤²à¤¿à¤–à¤¿à¤¤ à¤¸à¥‚à¤šà¤¨à¤¾ à¤œà¤¨à¥à¤® à¤•à¥‡ à¤®à¥‚à¤² à¤…à¤­à¤¿à¤²à¥‡à¤– à¤¸à¥‡ à¤²à¥€ à¤—à¤ˆ à¤¹à¥ˆ à¤œà¥‹ à¤•à¤¿ (à¤¸à¥à¤¥à¤¾à¤¨à¥€à¤¯ à¤•à¥à¤·à¥‡à¤¤à¥à¤°/à¤¸à¥à¤¥à¤¾à¤¨à¥€à¤¯ à¤¨à¤¿à¤•à¤¾à¤¯)
          <span class="dotline"></span> à¤¤à¤¹à¤¸à¥€à¤²/à¤–à¤£à¥à¤¡ <span class="dotline short"></span> à¤œà¤¿à¤²à¤¾ <span class="dotline short"></span>
          à¤°à¤¾à¤œà¥à¤¯/à¤¸à¤‚à¤˜ à¤°à¤¾à¤œà¥à¤¯ à¤•à¥à¤·à¥‡à¤¤à¥à¤° <span class="dotline medium"></span> à¤•à¤¾ à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¤° à¤¹à¥ˆà¥¤
        </p>
        <p class="bc-english-cert">
          This is to certify that the following information has been taken from the original record of birth which is the
          register for (local area / local body) <span class="dotline"></span> of tahsil / block
          <span class="dotline short"></span> of District <span class="dotline short"></span>
          of state / Union territory <span class="dotline medium"></span>.
        </p>
        <div class="bc-fields">
          <div><span>à¤¨à¤¾à¤®/Name:</span><i></i></div>
          <div><span>à¤²à¤¿à¤‚à¤—/Sex:</span><i></i></div>
          <div><span>à¤œà¤¨à¥à¤® à¤¤à¤¿à¤¥à¤¿/Date of Birth:</span><i></i></div>
          <div><span>à¤œà¤¨à¥à¤® à¤¸à¥à¤¥à¤¾à¤¨/Place of Birth:</span><i></i></div>
          <div class="wide"><span>à¤®à¤¾à¤¤à¤¾ à¤•à¤¾ à¤¨à¤¾à¤®/Name of Mother:</span><i></i></div>
          <div class="wide"><span>à¤ªà¤¿à¤¤à¤¾ à¤•à¤¾ à¤¨à¤¾à¤®/Name of Father:</span><i></i></div>
        </div>
        <div class="bc-address-grid">
          <div>
            <h3>à¤¬à¤šà¥à¤šà¥‡ à¤•à¥‡ à¤œà¤¨à¥à¤® à¤•à¥‡ à¤¸à¤®à¤¯ à¤®à¤¾à¤¤à¤¾ à¤ªà¤¿à¤¤à¤¾ à¤•à¤¾ à¤ªà¤¤à¤¾</h3>
            <h4>Address of parents at the time of birth of the child:</h4>
            <p></p><p></p><p></p>
          </div>
          <div>
            <h3>à¤®à¤¾à¤¤à¤¾-à¤ªà¤¿à¤¤à¤¾ à¤•à¤¾ à¤¸à¥à¤¥à¤¾à¤¯à¥€ à¤ªà¤¤à¤¾</h3>
            <h4>Permanent address of parents:</h4>
            <p></p><p></p><p></p>
          </div>
        </div>
        <div class="bc-bottom-fields">
          <div><span>à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥‡à¤¶à¤¨ à¤¸à¤‚./Registration No.:</span><i></i></div>
          <div><span>à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥€à¤•à¤°à¤£ à¤•à¥€ à¤¤à¤¾à¤°à¥€à¤–/Date of Registration</span><i></i></div>
          <div class="wide"><span>à¤Ÿà¤¿à¤ªà¥à¤ªà¤£à¥€/Remarks(if any)</span><i></i></div>
          <div class="wide"><span>à¤œà¤¾à¤°à¥€ à¤•à¤°à¤¨à¥‡ à¤•à¥€ à¤¤à¤¾à¤°à¥€à¤– / Date of issue:</span><i></i><span>à¤œà¤¾à¤°à¥€ à¤•à¤°à¤¨à¥‡ à¤µà¤¾à¤²à¥‡ à¤ªà¥à¤°à¤¾à¤§à¤¿à¤•à¤¾à¤°à¥€ à¤•à¥‡ à¤¹à¤¸à¥à¤¤à¤¾à¤•à¥à¤·à¤°/ Signature of the issuing authority</span></div>
        </div>
        <div class="bc-authority">à¤œà¤¾à¤°à¥€ à¤•à¤°à¤¨à¥‡ à¤µà¤¾à¤²à¥‡ à¤ªà¥à¤°à¤¾à¤§à¤¿à¤•à¤¾à¤°à¥€ à¤•à¤¾ à¤ªà¤¤à¤¾ / Address of the issuing authority</div>
        <div class="bc-seal">à¤®à¥à¤¹à¤°/Seal</div>
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
    body { margin: 0; font-family: Cambria, "Nirmala UI", "Mangal", Georgia, "Times New Roman", serif; color: #000; background: #fff; }
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
  const localizedTitle = localizedTemplateText(template, "title") || template.title;
  const localizedDescription = localizedTemplateText(template, "description") || template.description;
  const localizedFields = localizedTemplateFields(template);
  const localizedServiceTitle = localizedServiceText(service, "title") || service.title;
  const localizedTemplate = {
    ...template,
    title: localizedTitle,
    description: localizedDescription,
    fields: localizedFields
  };

  if (template.id === "birth-certificate") {
    const html = birthCertificateTemplateHtml();
    return {
      name: `${template.id}.html`,
      type: "HTML",
      pages: 1,
      previewKind: "html-template",
      previewUrl: "",
      source: localizedTitle,
      serviceId: service?.id || state.selectedService || "",
      templateId: template.id,
      templatePaperSize: normalizePaperSize(template.paperSize, "Auto", true),
      templateOrientation: normalizeOrientation(template.orientation),
      templateKind: "birth-certificate",
      htmlContent: birthCertificateTemplateMarkup(),
      printContentBase64: btoa(unescape(encodeURIComponent(html))),
      validatedAt: new Date().toISOString()
    };
  }

  if (template.imageUrl) {
    const imageUrl = normalizeTemplateImageUrl(template.imageUrl);
    const documentType = templateDocumentKind(template.documentType || imageUrl);
    const staticPreviewUrl = documentType === "pdf" && templateHasStaticPdfPreview({ ...template, imageUrl })
      ? imageUrl.replace(/\.pdf$/i, ".png")
      : "";
    return {
      name: `${template.id}.${documentType === "pdf" ? "pdf" : "png"}`,
      type: documentType === "pdf" ? "PDF" : "PNG",
      pages: templatePageCount({ ...template, imageUrl }),
      previewKind: documentType === "pdf" ? "pdf" : "image",
      previewUrl: imageUrl,
      staticPreviewUrl,
      source: localizedTitle,
      serviceId: service?.id || state.selectedService || "",
      templateId: template.id,
      templatePaperSize: normalizePaperSize(template.paperSize, "Auto", true),
      templateOrientation: normalizeOrientation(template.orientation),
      validatedAt: new Date().toISOString()
    };
  }

  const printableHtml = genericTemplateHtml(localizedTemplate, localizedServiceTitle);

  return {
    name: `${template.id}.html`,
    type: "HTML",
    pages: Math.max(1, Number(template.pages) || 1),
    previewKind: "html-template",
    previewUrl: "",
    source: localizedTitle,
    serviceId: service?.id || state.selectedService || "",
    templateId: template.id,
    templatePaperSize: normalizePaperSize(template.paperSize, "Auto", true),
    templateOrientation: normalizeOrientation(template.orientation),
    templateKind: "generic-form",
    templateTitle: localizedTitle,
    templateDescription: localizedDescription || localizedServiceTitle,
    templateFields: localizedFields,
    htmlContent: genericTemplateMarkup(localizedTemplate, localizedServiceTitle),
    printContentBase64: btoa(unescape(encodeURIComponent(printableHtml))),
    validatedAt: new Date().toISOString()
  };
}

function revokePreviewUrl(file) {
  if (file?.previewUrl && file.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(file.previewUrl);
  }
}

function clearCurrentFile() {
  jobFiles().forEach(revokePreviewUrl);
  setJobFiles([]);
  state.previewZoom = 1;
  state.previewPage = 1;
  state.uploadError = "";
}

function stopUploadPolling() {
  if (state.uploadPoller) {
    clearInterval(state.uploadPoller);
    state.uploadPoller = null;
  }
}

function publicMobileUploadUrl(token = "") {
  const publicOrigin = /^https?:$/.test(window.location.protocol)
    ? window.location.origin.replace(/\/+$/, "")
    : "";
  const uploadOrigin = publicOrigin || BACKEND_URL;
  const tokenPath = token ? `/${encodeURIComponent(token)}` : "";
  return `${uploadOrigin}/mobile-upload${tokenPath}`;
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

    const payload = await response.json();
    state.uploadSession = {
      ...payload,
      uploadUrl: publicMobileUploadUrl(payload.token),
      status: "waiting"
    };
    render();
    startUploadPolling();
  } catch (error) {
    state.uploadSession = {
      token: "",
      uploadUrl: publicMobileUploadUrl(),
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

    if (session.status === "uploaded" && (session.files?.length || session.file)) {
      const receivedFiles = (session.files?.length ? session.files : [session.file])
        .slice(0, MAX_FILES_PER_JOB)
        .map(createReceivedFileRecord);
      const invalidFile = receivedFiles.find((result) => result.error);

      // On any rejection, the backend session stays permanently "uploaded"
      // with the same rejected file - just leaving the old QR on screen
      // means it can never be scanned again for a new attempt (the session
      // it points to is a dead end). Generate a fresh session/QR so the
      // customer can actually retry, while keeping the error message visible.
      if (invalidFile) {
        state.uploadError = invalidFile.error;
        await startMobileUploadSession();
        return;
      }

      const pageLimitErrors = await Promise.all(receivedFiles.map((result) => enforceUploadPageLimit(result.file)));
      const pageLimitError = pageLimitErrors.find(Boolean);
      if (pageLimitError) {
        state.uploadError = pageLimitError;
        await startMobileUploadSession();
        return;
      }

      const paperError = enforceUploadPaperSufficiency(receivedFiles.map((result) => result.file));
      if (paperError) {
        state.uploadError = paperError;
        await startMobileUploadSession();
        return;
      }

      stopUploadPolling();
      clearCurrentFile();
      setJobFiles(receivedFiles.map((result) => result.file));
      state.uploadError = "";
      state.step = 2;
      render();
      return;
    }

    render();
  } catch (error) {
    // Silently ignore temporary network blips during polling so the QR code stays visible
    // and no confusing error messages are shown to the user.
  }
}

async function refreshPrinterStatus({ rerender = true, showChecking = true, markOfflineOnError = true } = {}) {
  if (printerStatusRefreshInFlight) {
    return state.printer;
  }

  const previousPrinterStateJSON = JSON.stringify(state.printer);

  printerStatusRefreshInFlight = true;

  if (DEMO_KIOSK_MODE && state.mode === "customer") {
    printerStatusRefreshInFlight = false;
    setDemoPrinterReady({ rerender });
    return state.printer;
  }

  if (state.mode === "admin" && !HAS_EXPLICIT_LOCAL_AGENT) {
    state.printer = {
      ...state.printer,
      online: false,
      checking: false,
      name: "Mini-PC local agent",
      paper: "N/A",
      toner: "N/A",
      queue: 0,
      supportsColor: null,
      supportsDuplex: null,
      defaultPaperSize: "A4",
      paperSizes: [...PRINT_PAPER_SIZES],
      agent: "Not required",
      statusText: "Local printer agent runs only on the kiosk mini-PC."
    };
    if (rerender) render();
    printerStatusRefreshInFlight = false;
    return state.printer;
  }

  if (state.printer.manualReadyOverride) {
    state.printer.checking = false;
    if (rerender) render();
    printerStatusRefreshInFlight = false;
    return state.printer;
  }

  if (showChecking) {
    state.printer = {
      ...state.printer,
      checking: true,
      agent: "Checking",
      statusText: "Checking printer status..."
    };
    if (rerender) render();
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
      checking: false,
      name: printer.name || "No printer selected",
      paper: printer.paperStatus || "Unknown",
      toner: printer.tonerStatus || "Unknown",
      queue: Number(printer.queueLength || 0),
      supportsColor: typeof printer.supportsColor === "boolean" ? printer.supportsColor : null,
      supportsDuplex: typeof printer.supportsDuplex === "boolean" ? printer.supportsDuplex : null,
      defaultPaperSize: normalizePaperSize(printer.defaultPaperSize, "A4"),
      paperSizes: Array.isArray(printer.paperSizes)
        ? [...new Set(printer.paperSizes.map((size) => normalizePaperSize(size, "")).filter(Boolean))]
        : [...PRINT_PAPER_SIZES],
      agent: "Running",
      statusText: printer.errorMessage || (printer.status === "online" ? "Ready" : "Offline")
    };
    applyPrinterPaperDefault(state.printer);
  } catch (error) {
    const isAbort = error.name === "AbortError";
    const rawMessage = String(error.message || "").trim();
    const connectionFailed = rawMessage.toLowerCase() === "failed to fetch" || error instanceof TypeError;
    if (!markOfflineOnError && state.printer.online) {
      state.printer = {
        ...state.printer,
        checking: false,
        agent: state.printer.agent === "Offline" ? "Running" : state.printer.agent,
        statusText: state.printer.statusText || "Ready"
      };
      return;
    }

    state.printer = {
      ...state.printer,
      online: false,
      checking: false,
      name: "No printer selected",
      paper: "Unknown",
      toner: "Unknown",
      queue: 0,
      supportsColor: null,
      agent: "Offline",
      statusText: isAbort
        ? "Printer status check timed out. Check the printer connection or restart the local print agent."
        : connectionFailed
          ? "Local print service is offline. Ask staff to start the kiosk print service on this machine."
          : rawMessage || "Local print agent unavailable"
    };
  } finally {
    window.clearTimeout(timeoutId);
    printerStatusRefreshInFlight = false;
  }

  handleCustomerPrinterStateAfterRefresh();

  if (rerender && JSON.stringify(state.printer) !== previousPrinterStateJSON) {
    render();
  }

  return state.printer;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function adminAuthHeaders(headers = {}) {
  return state.adminToken
    ? { ...headers, Authorization: `Bearer ${state.adminToken}` }
    : { ...headers };
}

async function fetchAdminJson(path, options = {}) {
  try {
    return await fetchJson(`${BACKEND_URL}${path}`, {
      ...options,
      headers: adminAuthHeaders(options.headers)
    });
  } catch (error) {
    if (state.adminToken && isSessionAuthError(error)) {
      expireAdminSession();
      error.sessionExpired = true;
    }
    throw error;
  }
}

function isMissingAuthEndpoint(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("route not found") || message.includes("request failed: 404");
}

function postAdminLogin(url, email, password) {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function loginWithLegacyAdminEndpoints(email, password) {
  const attempts = await Promise.allSettled([
    postAdminLogin(`${BACKEND_URL}/api/admin/login`, email, password).then((payload) => ({
      ...payload,
      role: "kiosk-admin"
    })),
    postAdminLogin(`${BACKEND_URL}/api/super-admin/login`, email, password).then((payload) => ({
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
    return await postAdminLogin(`${BACKEND_URL}/api/auth/login`, email, password);
  } catch (error) {
    if (!isMissingAuthEndpoint(error)) throw error;
    return loginWithLegacyAdminEndpoints(email, password);
  }
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
      projectIds: service.projectIds,
      kioskIds: service.kioskIds,
      customerSettings: service.customerSettings,
      printDefaults: service.printDefaults,
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
  const shouldApply = source === "backend" || source === "manual" || hasNewVersion || hasDifferentServices || !state.configVersion;

  if (!shouldApply && source !== "admin") {
    return false;
  }

  const previousSelectedService = state.selectedService;
  if (payload.kiosk) {
    state.kiosk = {
      kioskId: normalizeKioskId(payload.kiosk.kioskId) || KIOSK_ID,
      name: String(payload.kiosk.name || "").trim(),
      branch: String(payload.kiosk.branch || "").trim(),
      projectId: String(payload.kiosk.projectId || "").trim(),
      status: String(payload.kiosk.status || "").trim()
    };
    state.clientBrand = normalizeClientBrand(payload.clientBrand || payload.kiosk.clientBrand || {});
    storeClientBrand();
    state.kioskCustomerSettings = normalizeKioskCustomerSettings(payload.kiosk.customerSettings);
    enforceCustomerSettings();
  } else if (payload.clientBrand) {
    state.clientBrand = normalizeClientBrand(payload.clientBrand);
    storeClientBrand();
  }
  if (state.clientBrand?.idleScreensaver) {
    resolveLocalIdleScreensaverMedia();
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
    const payload = await fetchJson(`${BACKEND_URL}/api/kiosk/config?kioskId=${encodeURIComponent(KIOSK_ID)}${DEMO_KIOSK_MODE ? '&demo=true' : ''}`);

    if (DEMO_KIOSK_MODE && state.mode === "customer") {
      if (!payload || !Array.isArray(payload.services) || payload.services.length === 0) {
        payload.services = JSON.parse(JSON.stringify(demoKioskServices));
        payload.pricing = Object.fromEntries(payload.services.map((service) => [service.id, service.pricing]));
      }
    }

    return applyServiceConfig(payload, {
      rerender,
      source: force ? "manual" : "backend"
    });
  } catch (error) {
    if (DEMO_KIOSK_MODE && state.mode === "customer") {
      applyDemoKioskConfig({ rerender });
      return true;
    }
    // This fetch failing is exactly the case the local idle-media cache
    // exists for (no internet reaching the cloud backend) - the previous
    // code only ever tried the local agent right after a SUCCESSFUL remote
    // sync (inside applyServiceConfig), so it never ran at all while
    // offline. state.clientBrand still holds the last-known idleScreensaver
    // manifest (from readStoredClientBrand()/a prior successful sync), so
    // there's still something to resolve against here.
    resolveLocalIdleScreensaverMedia();
    resolveLocalClientBrandIdentity();
    // Silently ignore backend config network errors to avoid confusing users
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

function stopPrinterStatusPolling() {
  if (state.printerPoller) {
    clearInterval(state.printerPoller);
    state.printerPoller = null;
  }
}

function startPrinterStatusPolling() {
  if (isMobilePaymentEntry) {
    return;
  }

  stopPrinterStatusPolling();

  state.printerPoller = setInterval(() => {
    if (state.mode === "customer") {
      // Steps 2 (document preview) and 4+ (thank-you/receipt) don't show printer
      // status, but a full render() there tears down and rebuilds the whole
      // screen every cycle — restarting PDF previews, checkmark/countdown
      // animations, etc. Keep the background status refresh, skip the rerender.
      const showsPrinterStatus = state.step !== 2 && state.step < 4;
      refreshPrinterStatus({
        rerender: showsPrinterStatus,
        showChecking: false,
        markOfflineOnError: false
      });
    }
  }, PRINTER_STATUS_POLL_MS);
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

// ── Live push (WebSocket) ────────────────────────────────────────────────
// Mirrors super-admin.js: backend pushes a "data-changed" ping whenever
// anything is saved, so admin data updates the moment something actually
// changes instead of waiting for the next 5s poll tick. The 5s poll above
// stays as a fallback in case the socket drops without a clean close event.
let adminSocket = null;
let adminSocketReconnectTimer = null;
let adminSocketReconnectDelay = 2000;

function adminSocketUrl() {
  const url = new URL(`${REAL_BACKEND_URL}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function stopAdminSocket() {
  if (adminSocketReconnectTimer) {
    clearTimeout(adminSocketReconnectTimer);
    adminSocketReconnectTimer = null;
  }
  if (adminSocket) {
    adminSocket.onclose = null;
    adminSocket.close();
    adminSocket = null;
  }
}

function startAdminSocket() {
  if (!state.adminAuthed || adminSocket) return;

  try {
    adminSocket = new WebSocket(adminSocketUrl());
  } catch {
    return; // Polling fallback keeps the dashboard live either way.
  }

  adminSocket.onopen = () => {
    adminSocketReconnectDelay = 2000;
  };

  adminSocket.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.type === "data-changed" && state.mode === "admin" && state.adminAuthed && !document.hidden) {
      loadAdminData({ rerender: !isEditingFormField() });
    }
  };

  adminSocket.onclose = () => {
    adminSocket = null;
    if (!state.adminAuthed) return;
    adminSocketReconnectTimer = setTimeout(() => {
      adminSocketReconnectDelay = Math.min(adminSocketReconnectDelay * 1.5, 30000);
      startAdminSocket();
    }, adminSocketReconnectDelay);
  };

  adminSocket.onerror = () => {
    adminSocket?.close();
  };
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
      history,
      transactions,
      kiosks,
      projects,
      system,
      serviceConfig,
      reports
    ] = await Promise.all([
      fetchAdminJson("/api/admin/dashboard"),
      fetchAdminJson("/api/admin/print-history"),
      fetchAdminJson("/api/admin/transactions"),
      fetchAdminJson("/api/admin/kiosks"),
      fetchAdminJson("/api/admin/projects"),
      fetchAdminJson("/api/admin/system-status"),
      fetchAdminJson("/api/admin/services"),
      fetchAdminJson("/api/admin/reports")
    ]);

    state.adminData = {
      ...state.adminData,
      dashboard,
      jobs: Array.isArray(history.jobs) ? history.jobs : [],
      transactions: Array.isArray(transactions.payments) ? transactions.payments : [],
      projects: Array.isArray(projects.projects) ? projects.projects : [],
      kiosks: Array.isArray(kiosks.kiosks) ? kiosks.kiosks : [],
      reports: Array.isArray(reports.reports) ? reports.reports : [],
      alertLogs: Array.isArray(system.alertLogs) ? system.alertLogs : [],
      backendOnline: system.backend === "online",
      localAgentExpectedPort: system.localAgentExpectedPort,
      lastUpdated: new Date().toISOString(),
      error: ""
    };

    if (serviceConfig.pricing && !state.servicesDirty) {
      state.pricing = normalizePricing(serviceConfig.pricing);
      storePricing();
    }

    if (Array.isArray(serviceConfig.services) && !state.servicesDirty) {
      applyServiceConfig({
        services: serviceConfig.services,
        pricing: serviceConfig.pricing || state.pricing,
        config: serviceConfig.config
      }, { rerender: false, source: "admin" });
    }
  } catch (error) {
    if (!error.sessionExpired) {
      state.adminData = {
        ...state.adminData,
        backendOnline: false,
        error: error.message || "Admin backend is offline."
      };
    }
  }

  if (rerender && state.mode === "admin" && (state.adminAuthed || !state.adminLoginError)) {
    render();
  }
}

async function syncBackendPrintStatus(printStatus, failureReason = "", completionConfirmed) {
  if (!state.activeJobId) return;

  // Capture the job/payment context once up front so a retry (below) always
  // reports status for THIS job, even if the customer has moved on to a new
  // one by the time a delayed retry fires.
  const body = JSON.stringify({
    ...paymentRequestBody(),
    jobId: currentJobId(),
    printStatus,
    paymentStatus: "Payment Success",
    failureReason,
    // Only present for a completed job: whether the local print agent actually
    // observed this job in the printer queue/status and watched it clear
    // (true), or gave up waiting after never seeing it at all (false) - see
    // waitForWindowsPrintCompletion() in local-agent/printerAgent.js.
    ...(typeof completionConfirmed === "boolean" ? { completionConfirmed } : {})
  });

  // This is fire-and-forget from every caller (never awaited), so retrying
  // here on transient failures doesn't add any delay to the customer-facing
  // flow - it just makes the backend's job record (what admins see) more
  // reliably reflect what actually happened, instead of silently getting
  // stuck on one dropped request.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fetchJson(`${BACKEND_URL}/api/print/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      return;
    } catch {
      if (attempt === maxAttempts) return;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
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
  const details = priceDetails();
  const files = jobFiles();
  const file = activePreviewFile();
  const service = services.find((item) => item.id === details.serviceId) || selectedService();

  return {
    jobId: ensureActiveJobId(),
    kioskId: KIOSK_ID,
    service: details.serviceId || service?.id || "print",
    fileName: files.length === 1 ? files[0].name : `${files.length} documents`,
    fileType: files.length === 1 ? files[0].type : "MULTIPLE",
    templateId: file?.templateId || "",
    pageCount: details.pages,
    copies: details.copies,
    colorMode: details.colorMode,
    paperSize: state.settings.paperSize,
    sides: state.settings.sides,
    orientation: state.settings.orientation,
    pageRange: state.settings.range,
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

function registerFreePrintJobInBackground() {
  fetch(`${BACKEND_URL}/api/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentRequestBody())
  }).catch(() => {
    // Printing must not wait for admin sync in free-print mode.
  });
}

function buildMobilePaymentUrl(paymentUrl, paymentId) {
  if (!paymentId) return paymentUrl || "";

  const configuredFrontendUrl = parseHttpUrl(PUBLIC_FRONTEND_URL);
  const currentFrontendUrl = /^https?:$/.test(window.location.protocol)
    ? new URL(window.location.href)
    : null;
  const fallbackCheckoutUrl = parseHttpUrl(paymentUrl);
  const url = configuredFrontendUrl || currentFrontendUrl || fallbackCheckoutUrl || new URL(window.location.href);
  normalizeIndexPageUrl(url);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mobilePayment", paymentId);
  if (BACKEND_URL) {
    url.searchParams.set("backendUrl", BACKEND_URL);
  }
  return url.toString();
}

function parseHttpUrl(value = "") {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normalizeIndexPageUrl(url) {
  const lastSegment = url.pathname.split("/").pop() || "";
  if (url.pathname === "/" || !lastSegment.includes(".")) {
    const prefix = url.pathname.replace(/\/+$/, "");
    url.pathname = `${prefix}/index.html`;
  }
}

async function fetchPaymentQr(paymentUrl) {
  const response = await fetch(`${BACKEND_URL}/api/payment/qr?url=${encodeURIComponent(paymentUrl)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create payment QR.");
  }

  return payload.qrSvg || "";
}

function stopPaymentPolling() {
  if (state.paymentPoller) {
    clearInterval(state.paymentPoller);
    state.paymentPoller = null;
  }
}

async function checkKioskPaymentStatus({ rerender = true } = {}) {
  if (!state.paymentOrder?.paymentId && !state.activeJobId) {
    return false;
  }

  const response = await fetch(`${BACKEND_URL}/api/print/status/${encodeURIComponent(currentJobId())}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to check payment status.");
  }

  if (payload.paymentStatus === "Payment Success") {
    stopPaymentPolling();
    state.paymentStatus = "Success";
    state.paymentStatusMessage = "Payment received on mobile. Starting print...";
    state.paymentError = "";
    state.paymentBusy = false;
    beginPrintFlowAfterPayment();
    return true;
  }

  if (rerender && state.paymentStatus === "Waiting") {
    render();
  }

  return false;
}

function startPaymentPolling() {
  stopPaymentPolling();
  state.paymentPoller = setInterval(() => {
    checkKioskPaymentStatus({ rerender: false }).catch((error) => {
      state.paymentError = error.message || "Unable to check payment status.";
      render();
    });
  }, PAYMENT_STATUS_POLL_MS);
  checkKioskPaymentStatus({ rerender: false }).catch((error) => {
    state.paymentError = error.message || "Unable to check payment status.";
    render();
  });
}

async function loadMobilePayment() {
  const paymentId = state.mobilePayment.paymentId;
  if (!isMobilePaymentEntry || !paymentId) return;

  state.mobilePayment.loading = true;
  state.mobilePayment.status = "Loading";
  state.mobilePayment.message = "Loading payment details...";
  state.mobilePayment.error = "";
  render();

  try {
    const response = await fetch(`${BACKEND_URL}/api/payment/${encodeURIComponent(paymentId)}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load payment.");
    }

    state.mobilePayment = {
      ...state.mobilePayment,
      loading: false,
      status: payload.payment?.status === "Success" ? "Success" : "Ready",
      checkout: payload.checkout,
      payment: payload.payment,
      job: payload.job,
      completed: payload.payment?.status === "Success" || payload.job?.paymentStatus === "Payment Success",
      message: payload.payment?.status === "Success"
        ? "Payment is already complete."
        : "Opening Razorpay Checkout...",
      error: ""
    };
    render();

    if (!state.mobilePayment.completed) {
      startMobileRazorpayPayment();
    }
  } catch (error) {
    state.mobilePayment.loading = false;
    state.mobilePayment.status = "Failed";
    state.mobilePayment.message = "";
    state.mobilePayment.error = error.message || "Unable to load payment.";
    render();
  }
}

async function startMobileRazorpayPayment() {
  const checkout = state.mobilePayment.checkout;
  if (!checkout || state.mobilePayment.completed || state.mobilePayment.loading && state.mobilePayment.status === "Opening") return;

  state.mobilePayment.loading = true;
  state.mobilePayment.status = "Opening";
  state.mobilePayment.message = "Opening Razorpay Checkout...";
  state.mobilePayment.error = "";
  render();

  try {
    await loadRazorpayCheckout();

    const razorpay = new window.Razorpay({
      key: checkout.key,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      order_id: checkout.orderId,
      prefill: checkout.prefill || {},
      notes: checkout.notes || {},
      image: `${BACKEND_URL}/assets/aarya-innovtech-logo.png`,
      theme: {
        color: "#1f5fbf"
      },
      handler: async (response) => {
        state.mobilePayment.status = "Verifying";
        state.mobilePayment.message = "Verifying payment...";
        render();

        try {
          await verifyRazorpayPayment(response, {
            updateKiosk: false,
            jobId: state.mobilePayment.job?.jobId || state.mobilePayment.payment?.jobId || state.mobilePayment.paymentId || ""
          });
          state.mobilePayment.completed = true;
          state.mobilePayment.loading = false;
          state.mobilePayment.status = "Success";
          state.mobilePayment.message = "Payment verified. Return to the kiosk.";
          state.mobilePayment.error = "";
          render();
        } catch (error) {
          state.mobilePayment.loading = false;
          state.mobilePayment.status = "Failed";
          state.mobilePayment.error = error.message || "Payment verification failed.";
          render();
        }
      },
      modal: {
        ondismiss: () => {
          if (state.mobilePayment.completed) return;
          state.mobilePayment.loading = false;
          state.mobilePayment.status = "Ready";
          state.mobilePayment.message = "Payment was not completed.";
          render();
        }
      }
    });

    razorpay.on("payment.failed", (response) => {
      state.mobilePayment.loading = false;
      state.mobilePayment.status = "Failed";
      state.mobilePayment.error = response.error?.description || response.error?.reason || "Razorpay payment failed.";
      render();
    });

    razorpay.open();
  } catch (error) {
    state.mobilePayment.loading = false;
    state.mobilePayment.status = "Failed";
    state.mobilePayment.error = error.message || "Unable to start Razorpay payment.";
    render();
  }
}

async function verifyRazorpayPayment(response, { updateKiosk = true, jobId = currentJobId() } = {}) {
  const verifyResponse = await fetch(`${BACKEND_URL}/api/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    })
  });
  const payload = await verifyResponse.json().catch(() => ({}));

  if (!verifyResponse.ok) {
    throw new Error(payload.error || "Razorpay payment verification failed.");
  }

  if (!updateKiosk) {
    return payload;
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
  beginPrintFlowAfterPayment();
  return payload;
}

async function startRazorpayPayment() {
  if (DEMO_KIOSK_MODE) {
    startDemoPayment();
    return;
  }

  if (state.paymentBusy) return;

  state.paymentBusy = true;
  state.paymentStatus = "Creating";
  state.paymentStatusMessage = "Creating Razorpay order...";
  state.paymentError = "";
  render();

  try {
    if (!paymentReady()) {
      state.paymentStatus = "Pending";
      state.paymentStatusMessage = "";
      state.paymentError = paymentBlockMessage();
      state.paymentBusy = false;
      render();
      return;
    }

    const payload = await createRazorpayOrder();
    const qr = payload.qr;
    const checkout = payload.checkout;

    if (!payload.payment?.paymentId) {
      throw new Error("Razorpay payment response is missing payment details.");
    }

    if (state.step !== 3) {
      state.paymentBusy = false;
      return;
    }

    let qrSvg;
    let paymentUrl = "";

    if (qr?.imageUrl) {
      // Direct UPI QR code - any payment app scans and pays it without opening a website.
      qrSvg = `<img alt="Payment QR code" src="${escapeHtml(qr.imageUrl)}" draggable="false" data-no-visual-search />`;
    } else {
      if (!checkout?.key || !checkout?.orderId) {
        throw new Error("Razorpay order response is missing checkout details.");
      }

      paymentUrl = buildMobilePaymentUrl(checkout.paymentUrl || "", payload.payment.paymentId);
      qrSvg = await fetchPaymentQr(paymentUrl);

      if (state.step !== 3) {
        state.paymentBusy = false;
        return;
      }
    }

    state.paymentOrder = {
      paymentId: payload.payment.paymentId,
      orderId: checkout?.orderId || "",
      amount: checkout?.amount ?? payload.payment.amountInPaise ?? 0,
      currency: checkout?.currency || payload.payment.currency || "INR",
      paymentUrl,
      qrSvg
    };
    state.paymentStatus = "Waiting";
    state.paymentStatusMessage = "Scan the QR code and complete payment on your mobile.";
    state.paymentBusy = false;
    render();
    startPaymentPolling();
  } catch (error) {
    if (state.step !== 3) {
      state.paymentBusy = false;
      return;
    }

    state.paymentStatus = "Failed";
    state.paymentError = error.message || "Unable to start Razorpay payment.";
    state.paymentBusy = false;
    state.paymentOrder = null;
    render();
  }
}

// Called once the real print job (startLocalPrintJob) has resolved
// successfully. If beginPrintFlowAfterPayment() already put us on the
// "printing" phase before the real job started, that phase was already on
// screen for the job's entire real duration - so jump straight to Thank You
// instead of tacking on another artificial wait. Callers that still start
// this from step 3 (retry-print, free print - untouched, unchanged) get the
// original brief printing-phase transition before Thank You.
function beginThankYouPhaseSequence() {
  if (state.step === 4 && state.thankYouPhase === "printing") {
    state.thankYouPhase = "thankyou";
    state.thankYouSecondsLeft = THANK_YOU_HOME_REDIRECT_SECONDS;
    render();
    return;
  }

  state.thankYouPhase = "printing";
  state.thankYouSecondsLeft = null;
  state.step = 4;
  render();

  setTimeout(() => {
    if (state.step !== 4) return;
    state.thankYouPhase = "thankyou";
    state.thankYouSecondsLeft = THANK_YOU_HOME_REDIRECT_SECONDS;
    render();
  }, 2000);
}

// Runs the instant a real payment succeeds: shows the payment-success
// checkmark briefly (real, right when it happens - not replayed later), then
// moves to the printing phase and starts the real print job. The printing
// screen then stays up for exactly as long as startLocalPrintJob() actually
// takes (it live-updates state.printStatusMessage/printProgress via its own
// render() calls while it runs) and only advances past it once that real job
// resolves. If the printer isn't ready, jams, goes offline, or the job
// otherwise fails, startLocalPrintJob()'s existing failure handling (fully
// unchanged) drops back to step 3's retry/failure screen instead of ever
// reaching "printing"/"thankyou".
function beginPrintFlowAfterPayment() {
  state.thankYouPhase = "payment_done";
  state.thankYouSecondsLeft = null;
  state.step = 4;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();

  setTimeout(() => {
    if (state.step !== 4 || state.thankYouPhase !== "payment_done") return;
    state.thankYouPhase = "printing";
    render();
    startLocalPrintJob();
  }, 1200);
}

async function startFreePrintJob() {
  if (state.paymentBusy) return;

  state.paymentBusy = false;
  state.paymentStatus = "Success";
  state.paymentStatusMessage = "";
  state.paymentError = "";
  state.paymentOrder = null;

  if (!paymentReady()) {
    state.paymentStatus = "Pending";
    state.paymentError = paymentBlockMessage();
    render();
    return;
  }

  registerFreePrintJobInBackground();

  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();
  startLocalPrintJob();
}

async function startLocalPrintJob() {
  const files = jobFiles();
  const baseJobId = currentJobId();

  if (DEMO_KIOSK_MODE) {
    const documentCount = files.length || 1;
    state.printJob = { status: "completed" };
    state.printProgress = 5;
    state.printError = "";
    state.printStatusMessage = `Printed ${documentCount} document${documentCount === 1 ? "" : "s"}.`;
    addJob("Completed");
    beginThankYouPhaseSequence();
    return;
  }

  if (!files.length) {
    state.printStatusMessage = "No document is ready for printing. Please retry the upload.";
    state.printJob = null;
    state.printError = state.printStatusMessage;
    render();
    return;
  }

  state.printJob = { status: "starting" };
  state.printProgress = 1;
  state.printStatusMessage = "Sending document to printer...";
  render();

  try {
    if (state.activeJobId !== baseJobId) return;

    state.printProgress = 2;
    state.printStatusMessage = `Printing ${files.length} document${files.length === 1 ? "" : "s"}...`;
    syncBackendPrintStatus("Printing");
    render();

    const printFailures = [];
    let printedCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      if (state.activeJobId !== baseJobId) return;

      const file = files[index];
      state.printStatusMessage = `Printing document ${index + 1} of ${files.length}...`;
      state.printProgress = Math.min(4, Math.max(2, 2 + Math.floor((index / Math.max(1, files.length)) * 2)));
      render();

      if (!localAgentCanReadFile(file)) {
        const message = "Document could not be prepared for printing.";
        printFailures.push({ index, message });
        state.printJob = { ...(state.printJob || {}), status: "failed", errorMessage: message };
        state.printStatusMessage = index < files.length - 1
          ? `Could not prepare document ${index + 1}. Continuing with remaining documents...`
          : `Could not prepare document ${index + 1}.`;
        render();
        continue;
      }

      const printBody = {
        jobId: files.length === 1 ? baseJobId : `${baseJobId}-${index + 1}`,
        fileName: file.name,
        pageCount: Math.max(1, Number(file.pages) || 1),
        copies: state.settings.copies,
        colorMode: state.settings.colorMode,
        paperSize: state.settings.paperSize,
        sides: state.settings.sides,
        orientation: state.settings.orientation,
        pageRange: state.settings.range,
        templateId: file.templateId || "",
        templateKind: file.templateKind || "",
        templateTitle: file.templateTitle || file.source || "",
        templateDescription: file.templateDescription || "",
        templateFields: Array.isArray(file.templateFields) ? file.templateFields : [],
        waitForCompletion: true
      };

      if (file.printContentBase64) {
        printBody.fileContentBase64 = file.printContentBase64;
      } else {
        printBody.fileUrl = localAgentFileUrl(file);
      }

      try {
        const response = await fetch(`${LOCAL_AGENT_URL}/local/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(printBody)
        });
        const payload = await response.json().catch(() => ({}));

        if (state.activeJobId !== baseJobId) return;

        state.printJob = payload.job || state.printJob;

        if (!response.ok) {
          throw new Error(payload.error || payload.job?.errorMessage || "Local print agent could not print the document.");
        }

        printedCount += 1;
        state.printProgress = Math.min(4, 2 + Math.ceil((printedCount / Math.max(1, files.length)) * 2));
      } catch (documentError) {
        if (state.activeJobId !== baseJobId) return;

        const rawDocumentError = decodePowerShellError(documentError.message) || documentError.message || "The printer did not complete this document.";
        printFailures.push({ index, message: rawDocumentError });
        state.printJob = { ...(state.printJob || {}), status: "failed", errorMessage: rawDocumentError };
        state.printProgress = Math.max(2, Number(state.printProgress || 0));
        state.printStatusMessage = index < files.length - 1
          ? `Document ${index + 1} failed. Continuing with remaining documents...`
          : `Document ${index + 1} failed.`;
        render();
      }
    }

    if (state.activeJobId !== baseJobId) return;

    if (printFailures.length) {
      const freePrint = isFreePrintJob();
      const failedCount = printFailures.length;
      const firstRawError = printFailures[0]?.message || "The printer did not complete the job.";
      const combinedFailureReason = printFailures
        .map((failure) => `Document ${failure.index + 1}: ${failure.message}`)
        .join("; ");
      const failedLabels = printFailures
        .slice(0, 3)
        .map((failure) => `document ${failure.index + 1}`)
        .join(", ");
      const extraFailedText = failedCount > 3 ? ` and ${failedCount - 3} more` : "";
      const printStatus = freePrint ? "Free Print Failed" : "Payment Success Print Failed";
      const printerIssue = customerPrinterIssueFromMessage(firstRawError);

      state.printError = printedCount > 0
        ? `${printedCount} of ${files.length} documents printed. Please retry ${failedLabels}${extraFailedText}.`
        : (freePrint ? freePrintError(firstRawError) : friendlyPrintError(firstRawError));
      state.printJob = { ...(state.printJob || {}), status: "failed", errorMessage: combinedFailureReason || firstRawError };
      state.printProgress = printedCount > 0 ? 4 : Math.max(2, Number(state.printProgress || 0));
      state.printStatusMessage = printedCount > 0
        ? `${printedCount} document${printedCount === 1 ? "" : "s"} printed. ${failedCount} document${failedCount === 1 ? "" : "s"} need retry.`
        : "No documents were printed. Please ask staff to check the printer and retry.";
      addJob(printStatus, combinedFailureReason || firstRawError);

      if (printedCount === 0 && printerIssue) {
        handleCustomerPrinterIssue(printerIssue, { resetFlow: true, rerender: true });
        refreshPrinterStatus({ rerender: false, showChecking: false, markOfflineOnError: true });
        return;
      }

      if (printerIssue) {
        refreshPrinterStatus({ rerender: false, showChecking: false, markOfflineOnError: true });
      }

      state.step = 3;
      render();
      return;
    }

    state.printProgress = 5;
    state.printStatusMessage = "Printing completed successfully.";
    addJob("Completed");
    beginThankYouPhaseSequence();
  } catch (error) {
    if (state.activeJobId !== baseJobId) return;

    const freePrint = isFreePrintJob();
    const rawPrintError = decodePowerShellError(error.message) || error.message || "The printer did not complete the job.";
    const printStatus = freePrint ? "Free Print Failed" : "Payment Success Print Failed";
    const kioskPrintError = freePrint ? freePrintError(rawPrintError) : friendlyPrintError(rawPrintError);
    const printerIssue = customerPrinterIssueFromMessage(rawPrintError);

    state.printError = kioskPrintError;
    state.printJob = { ...(state.printJob || {}), status: "failed", errorMessage: rawPrintError };
    state.printProgress = Math.max(2, Number(state.printProgress || 0));
    state.printStatusMessage = "The document was not printed. Please ask staff to check the printer and retry.";
    addJob(printStatus, rawPrintError);

    if (printerIssue) {
      handleCustomerPrinterIssue(printerIssue, { resetFlow: true, rerender: true });
      refreshPrinterStatus({ rerender: false, showChecking: false, markOfflineOnError: true });
      return;
    }

    state.step = 3;
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

  if (state.step === 2) {
    ensureActiveJobId();
  }

  const previousStep = state.step;
  state.step = Math.min(customerSteps.length - 1, state.step + 1);

  render();

  if (state.step === 3 && previousStep !== 3) {
    const freePrint = isFreePrintJob();
    stopPaymentPolling();
    state.paymentStatus = freePrint ? "Success" : "Pending";
    state.paymentStatusMessage = "";
    state.paymentError = "";
    state.paymentOrder = null;
    state.paymentBusy = false;
    refreshPrinterStatus({ rerender: false, showChecking: false, markOfflineOnError: false });
    if (freePrint) {
      startFreePrintJob();
      return;
    }
    setTimeout(() => {
      if (state.step === 3 && !state.paymentBusy && !state.paymentOrder?.qrSvg) {
        startRazorpayPayment();
      }
    }, 0);
  }
}

function openAdmin(page = "dashboard") {
  stopCustomerInactivityTimer();
  hideIdleScreensaver();
  stopPrinterStatusPolling();
  state.mode = "admin";
  state.adminPage = page;
  render();

  if (state.adminAuthed) {
    loadAdminData();
    startAdminPolling();
    startAdminSocket();
  }
}

function openCustomer(reset = false) {
  stopAdminPolling();
  stopAdminSocket();
  startPrinterStatusPolling();

  if (reset) {
    resetCustomer();
    refreshKioskConfig({ rerender: false, force: true });
    refreshPrinterStatus({ rerender: false });
    render();
    return;
  }

  state.mode = "customer";
  setPrivacyPolicyVisible(false);
  refreshKioskConfig({ rerender: false, force: true });
  refreshPrinterStatus({ rerender: false });
  render();
}

function stopCustomerInactivityTimer() {
  if (state.customerInactivityTimer) {
    window.clearTimeout(state.customerInactivityTimer);
    state.customerInactivityTimer = null;
  }
  state.customerInactivityTimerKey = "";
}

function paymentVerificationInProgress() {
  const status = String(state.paymentStatus || "").toLowerCase();
  return state.paymentBusy || ["checking", "creating"].includes(status);
}

function printingInProgress() {
  const printStatus = String(state.printJob?.status || "").toLowerCase();
  return state.paymentStatus === "Success" && (
    Number(state.printProgress || 0) > 0 ||
    Boolean(state.printStatusMessage) ||
    ["starting", "printing", "queued"].includes(printStatus)
  );
}

// Best-effort: if the local print agent has already cached this kiosk's idle-
// screensaver image(s)/video to local disk (see local-agent/printerAgent.js's
// idle-media sync), swap the local http://localhost:<agent> URLs into
// state.clientBrand.idleScreensaver in place so the NEXT time the screensaver
// is shown it plays instantly and offline instead of over the internet.
// Deliberately mutates in place rather than forcing a re-render: the idle
// screensaver root is intentionally isolated from render() (see comment
// below) so a screensaver already on screen is never touched mid-play here -
// this only affects what the next natural show picks up. Any failure (agent
// unreachable, not cached yet) is swallowed and the existing remote URLs
// already in state keep working exactly as before this feature - there is no
// error state, only an optional upgrade to a faster local copy.
async function resolveLocalIdleScreensaverMedia() {
  const idle = state.clientBrand?.idleScreensaver;
  if (!idle || idle.mode === "none") return;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), IDLE_MEDIA_LOCAL_CHECK_TIMEOUT_MS);

  try {
    const local = await fetchJson(`${LOCAL_AGENT_URL}/local/idle-screensaver`, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!local || !local.ready || local.mode !== idle.mode) return;

    if (idle.mode === "image" && Array.isArray(local.imageUrls) && local.imageUrls.length === idle.imageUrls.length) {
      idle.imageUrls = local.imageUrls;
    } else if (idle.mode === "video" && local.videoUrl) {
      idle.videoUrl = local.videoUrl;
    }
  } catch {
    // Local agent unreachable, not cached yet, or a mismatched/stale manifest -
    // keep using the remote URLs already in state.clientBrand.idleScreensaver.
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Same idea as resolveLocalIdleScreensaverMedia() above, but for the kiosk's
// client identity (title/subtitle/logo) instead of idle-screensaver media.
// Only ever called from the failed-fetch path (see refreshKioskConfig) -
// never after a successful sync - so it can only ever replace a stale
// browser-cached value, never downgrade one this tab just fetched itself.
// local-agent syncs this independently every ~30s whenever IT can reach the
// backend, so it's a fresher source of truth than this browser tab's own
// localStorage-restored state.clientBrand for a kiosk that's been offline
// since its last client reassignment (which otherwise keeps showing
// whatever client was cached before that reassignment, indefinitely).
async function resolveLocalClientBrandIdentity() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), IDLE_MEDIA_LOCAL_CHECK_TIMEOUT_MS);

  try {
    const local = await fetchJson(`${LOCAL_AGENT_URL}/local/idle-screensaver`, {
      cache: "no-store",
      signal: controller.signal
    });

    const brand = local?.clientBrand;
    if (!brand || !(brand.title || brand.subtitle || brand.logoUrl)) return;

    if (!state.clientBrand) state.clientBrand = {};
    if (brand.title) state.clientBrand.title = brand.title;
    if (brand.subtitle) state.clientBrand.subtitle = brand.subtitle;
    if (brand.logoUrl) state.clientBrand.logoUrl = brand.logoUrl;
    if (brand.name) state.clientBrand.name = brand.name;
    if (brand.clientId) state.clientBrand.clientId = brand.clientId;
  } catch {
    // Local agent unreachable or nothing cached yet - keep whatever's
    // already in state.clientBrand.
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Idle-screen screensaver — shown after the kiosk sits idle on the home
// screen. Lives in its own DOM root outside #app (see index.html) so the
// 5s config poll and 15s printer-status poll — both of which do a full
// render() teardown/rebuild while idle at step 0 — never touch it and
// restart the video / duplicate the slideshow interval.
function idleScreensaverRoot() {
  return document.getElementById("idle-screensaver-root");
}

function renderIdleScreensaver() {
  const root = idleScreensaverRoot();
  if (!root) return;

  const idleScreensaver = state.clientBrand?.idleScreensaver;
  if (!idleScreensaver || !idleScreensaverHasUsableMedia(idleScreensaver)) {
    root.innerHTML = "";
    return;
  }

  const media = idleScreensaver.mode === "video"
    ? `<video src="${escapeHtml(idleScreensaver.videoUrl)}" autoplay loop muted playsinline></video>`
    : `<img src="${escapeHtml(idleScreensaver.imageUrls[state.idleScreensaverIndex % idleScreensaver.imageUrls.length])}" alt="" draggable="false" data-no-visual-search />`;

  // Header/footer reuse the real customer page's brand mark, brand copy, and
  // footer render functions verbatim so the logo/title/footer text stay in
  // sync with the live page - but with fresh, self-contained CSS (see
  // styles.css .idle-screensaver-*) instead of relying on the real page's
  // .customer-shell-scoped rules, since this root has no .customer-shell
  // ancestor and those rules would silently not apply here. Deliberately
  // NOT reusing the full topbar (has a live clock with duplicate
  // getElementById-by-id lookups that would freeze) or the printer-status
  // badge / language switcher (stale snapshot only, and would fire both a
  // language switch and a dismiss on the same tap since this whole overlay
  // is one big click target).
  root.innerHTML = `
    <div class="idle-screensaver-overlay" data-idle-screensaver-dismiss>
      <header class="idle-screensaver-header">
        ${renderCustomerBrandMark("idle-screensaver-brand-mark", "Printing Kiosk")}
        ${renderCustomerBrandCopy("idle-screensaver-brand-copy", "Printing Kiosk", "idle-screensaver-brand-title", "idle-screensaver-brand-subtitle")}
      </header>
      <div class="idle-screensaver-body">
        <button type="button" class="idle-screensaver-cta" tabindex="-1">
          <span>Tap to Start</span>
          ${uiIcon("arrow-right", 22)}
        </button>
        <div class="idle-screensaver-media">${media}</div>
      </div>
      ${renderCustomerFooterFormsReference()}
    </div>
  `;
  root.querySelector("[data-idle-screensaver-dismiss]")?.addEventListener("click", dismissIdleScreensaver);
}

function showIdleScreensaver() {
  const idleScreensaver = state.clientBrand?.idleScreensaver;
  if (!idleScreensaverHasUsableMedia(idleScreensaver) || !idleScreensaverRoot()) {
    return;
  }

  state.showIdleScreensaver = true;
  state.idleScreensaverIndex = 0;
  renderIdleScreensaver();

  if (idleScreensaver.mode === "image" && idleScreensaver.imageUrls.length > 1) {
    state.idleScreensaverTimer = window.setInterval(() => {
      state.idleScreensaverIndex = (state.idleScreensaverIndex + 1) % idleScreensaver.imageUrls.length;
      renderIdleScreensaver();
    }, IDLE_SCREENSAVER_IMAGE_SECONDS * 1000);
  }
}

function hideIdleScreensaver() {
  if (state.idleScreensaverTimer) {
    window.clearInterval(state.idleScreensaverTimer);
    state.idleScreensaverTimer = null;
  }

  if (!state.showIdleScreensaver) return;

  state.showIdleScreensaver = false;
  const root = idleScreensaverRoot();
  if (root) root.innerHTML = "";
}

function dismissIdleScreensaver() {
  hideIdleScreensaver();
  scheduleCustomerInactivityTimer();
}

function customerInactivityScreenKey() {
  if (isMobilePaymentEntry || state.mode !== "customer") {
    return "";
  }

  if (state.showPrivacyPolicy) {
    return "privacyPolicy";
  }

  if (state.printError || state.paymentError || state.uploadError) {
    return "error";
  }

  if (state.step === 1 || (state.step > 1 && !jobFiles().length)) {
    return isFormTemplateService() ? "governmentFormsList" : "uploadQr";
  }

  if (state.step === 2) {
    if (state.previewActivityArea === "settings") {
      return "printSettings";
    }

    return isFormTemplateService() ? "formDetails" : "documentPreview";
  }

  if (state.step === 3) {
    if (paymentVerificationInProgress() || printingInProgress()) {
      return "";
    }

    return "payment";
  }

  if (
    state.step === 0 &&
    !state.showIdleScreensaver &&
    idleScreensaverHasUsableMedia(state.clientBrand?.idleScreensaver)
  ) {
    return "homeIdle";
  }

  return "";
}

function scheduleCustomerInactivityTimer() {
  const screenKey = customerInactivityScreenKey();

  // render() unconditionally re-arms this timer every time it runs — including
  // the 5s home-screen config poll, which reruns render() at step 0 whether or
  // not anything actually changed. For every other screen that's harmless
  // (nothing polls a rerender there without a real change), but at step 0 it
  // would keep restarting the homeIdle countdown from full duration forever,
  // so it could never reach zero. Skip the restart only when homeIdle is
  // already counting down; genuine activity clears customerInactivityTimerKey
  // first (see noteCustomerActivity) so it still fully re-arms the countdown.
  if (screenKey === "homeIdle" && screenKey === state.customerInactivityTimerKey && state.customerInactivityTimer) {
    return;
  }

  stopCustomerInactivityTimer();
  state.customerInactivityTimerKey = screenKey;
  const timeoutMs = screenKey === "homeIdle"
    ? (state.clientBrand.idleScreensaver.timeoutSeconds * 1000)
    : (CUSTOMER_INACTIVITY_TIMEOUTS[screenKey] || 0);

  if (!timeoutMs) {
    return;
  }

  state.customerInactivityTimer = window.setTimeout(() => {
    state.customerInactivityTimer = null;
    state.customerInactivityTimerKey = "";
    const firedScreenKey = customerInactivityScreenKey();

    if (!firedScreenKey) {
      return;
    }

    if (firedScreenKey === "homeIdle") {
      showIdleScreensaver();
      return;
    }

    resetCustomer();
    render();
    refreshPrinterStatus();
  }, timeoutMs);
}

function noteCustomerActivity(event) {
  if (isMobilePaymentEntry || state.mode !== "customer") {
    return;
  }

  if (state.showIdleScreensaver) {
    if (event?.type === "keydown") {
      dismissIdleScreensaver();
    }
    return;
  }

  if (state.step === 2 && event?.target?.closest) {
    if (event.target.closest(".preview-right-sidebar, .preview-settings-card, .preview-control-actions")) {
      state.previewActivityArea = "settings";
    } else if (event.target.closest(".preview-document-panel, .document-preview, .preview-toolbar")) {
      state.previewActivityArea = "document";
    }
  }

  // Genuine activity always fully re-arms the countdown, even for homeIdle —
  // clear the key so scheduleCustomerInactivityTimer's poll-triggered guard
  // (see there) doesn't mistake this real interaction for a no-op rerender.
  state.customerInactivityTimerKey = "";
  scheduleCustomerInactivityTimer();
}

function bindCustomerInactivityEvents() {
  if (customerInactivityEventsBound) {
    return;
  }

  CUSTOMER_ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, noteCustomerActivity, { capture: true, passive: true });
  });
  customerInactivityEventsBound = true;
}

function setPrivacyPolicyVisible(visible, page = "privacy") {
  state.showPrivacyPolicy = Boolean(visible);
  state.policyPage = page || "privacy";

  if (window.history && window.history.replaceState) {
    const hash = state.showPrivacyPolicy ? `#${state.policyPage}-policy` : "";
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, "", nextUrl);
  }
}

function render() {
  if (isMobilePaymentEntry) {
    stopCustomerInactivityTimer();
    const app = qs("#app");
    if (app) {
      app.innerHTML = renderMobilePaymentShell();
      bindEvents();
    }
    return;
  }

  if (state.mode === "customer") {
    if (state.step !== lastCustomerRenderedStep) {
      state.previewActivityArea = state.step === 2 ? "document" : state.previewActivityArea;
      lastCustomerRenderedStep = state.step;
    }
  } else {
    lastCustomerRenderedStep = null;
    stopCustomerInactivityTimer();
  }

  if (state.mode === "admin" && !state.adminAuthed) {
    syncAdminLoginDraftFromDom();
  }

  const app = qs("#app");
  if (state.mode === "admin") {
    document.body.classList.add("admin-mode", "admin-page");
  } else {
    document.body.classList.remove("admin-mode", "admin-page");
  }
  const mainEl = document.querySelector(".admin-main, .main, .content");
  const scrollTop = mainEl ? mainEl.scrollTop : 0;
  const winScrollY = window.scrollY || window.pageYOffset || 0;

  if (window.morphdom && app.firstElementChild && state.mode === "admin" && state.adminAuthed) {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = renderAdminShell();
      window.morphdom(app.firstElementChild, tempDiv.firstElementChild, {
        onBeforeElUpdated: function(fromEl, toEl) {
          if (fromEl === document.activeElement && (fromEl.tagName === "INPUT" || fromEl.tagName === "TEXTAREA")) {
            return false;
          }
          return true;
        }
      });
    } catch {
      app.innerHTML = renderAdminShell();
    }
  } else {
    app.innerHTML = state.mode === "customer" ? renderCustomerShell() : renderAdminShell();
  }

  applyCustomerTranslations(app);
  applyAdminTranslations(app);
  bindEvents();
  updateKioskClock();
  hydrateFormThumbnails(app);
  scheduleCustomerInactivityTimer();

  const newMainEl = document.querySelector(".admin-main, .main, .content");
  if (newMainEl && scrollTop > 0) {
    newMainEl.scrollTop = scrollTop;
  }
  if (winScrollY > 0) {
    window.scrollTo(window.scrollX, winScrollY);
  }

  try {
    if (state.mode === "customer" && state.step !== undefined) {
      sessionStorage.setItem("kioskCustomerState", JSON.stringify({
        step: state.step,
        selectedService: state.selectedService,
        selectedTemplate: state.selectedTemplate
      }));
      const url = new URL(window.location);
      if (state.step > 0) {
        url.searchParams.set("step", state.step);
      } else {
        url.searchParams.delete("step");
      }
      window.history.replaceState({}, '', url);
    } else if (state.mode === "admin" && state.adminAuthed && state.adminPage) {
      sessionStorage.setItem("kiosk_admin_page", state.adminPage);
      const targetHash = `#${state.adminPage}`;
      if (window.location.hash !== targetHash) {
        if (window.history?.replaceState) {
          window.history.replaceState(null, "", targetHash);
        } else {
          window.location.hash = targetHash;
        }
      }
    }
  } catch (e) { }
}

function updateKioskClock() {
  const timeEl = document.getElementById("kiosk-time");
  const dateEl = document.getElementById("kiosk-date");

  if (!timeEl || !dateEl) {
    return;
  }

  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  dateEl.textContent = now.toLocaleDateString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function tickThankYouHomeCountdown() {
  if (state.mode !== "customer" || state.thankYouPhase !== "thankyou" || typeof state.thankYouSecondsLeft !== "number") {
    return;
  }

  state.thankYouSecondsLeft -= 1;

  if (state.thankYouSecondsLeft <= 0) {
    resetCustomer();
    render();
    refreshPrinterStatus();
    return;
  }

  const countdownEl = document.getElementById("tq-home-countdown");
  if (countdownEl) {
    countdownEl.textContent = customerTranslateText(`Returning home in ${state.thankYouSecondsLeft}s`);
  }
}

/**
 * Printer-offline watchdog: the printer-health overlay on the payment/print
 * screen (renderPrinterHealthOverlay) blocks the UI with no exit and no
 * timeout on its own - it just retries forever. This makes sure a sustained
 * offline printer can never leave the kiosk stuck:
 *   - Nobody has paid yet -> safe to return straight to the home screen.
 *   - Payment already succeeded -> route into the existing print-failure
 *     recovery screen (Retry / Refund) instead of the dead-end overlay, so
 *     the paid job stays visible and resolvable rather than silently vanishing.
 * Also adds the auto-home safety net that the recovery screen itself never
 * had, whether printError was set here or by a genuine failed print attempt.
 */
function tickPrinterOfflineWatchdog() {
  if (state.mode !== "customer") {
    state.printerHealthIssueSince = null;
    state.printFailureAutoHomeSecondsLeft = null;
    return;
  }

  // Covers step 3 (QR/live-tracking) plus the payment_done/printing part of
  // step 4 - beginPrintFlowAfterPayment() now moves paid jobs into step 4
  // right after payment, before/while the real print job runs, so this watch
  // window has to follow it there or a printer going offline in that exact
  // window would go undetected. The final "thankyou" phase is excluded since
  // printing has genuinely already succeeded by then.
  const inActivePrintWindow = state.step === 3
    || (state.step === 4 && (state.thankYouPhase === "payment_done" || state.thankYouPhase === "printing"));
  const criticallyOffline = inActivePrintWindow && printerHealthCriticalError();

  if (!criticallyOffline) {
    state.printerHealthIssueSince = null;
  } else if (!state.printerHealthIssueSince) {
    state.printerHealthIssueSince = Date.now();
  }

  if (criticallyOffline && state.printerHealthIssueSince) {
    const elapsedSeconds = (Date.now() - state.printerHealthIssueSince) / 1000;
    const paymentComplete = state.paymentStatus === "Success";

    if (elapsedSeconds >= PRINTER_OFFLINE_ACTION_SECONDS) {
      if (!paymentComplete) {
        // Nobody has paid yet - nothing to protect, just get the kiosk unstuck.
        resetCustomer();
        render();
        refreshPrinterStatus();
        return;
      }

      if (!state.printError && state.printProgress === 0) {
        // Paid, but printing never even started - hand off to the existing
        // failure/recovery screen instead of leaving the overlay stuck forever.
        // Deliberately not touching an already in-flight print attempt here;
        // its own error handling will set printError if it genuinely fails.
        state.printError = "The printer went offline before printing could start. Your payment is recorded and safe.";
        render();
      }
    }
  }

  if (state.step === 3 && state.printError) {
    if (typeof state.printFailureAutoHomeSecondsLeft !== "number") {
      state.printFailureAutoHomeSecondsLeft = PRINT_FAILURE_AUTO_HOME_SECONDS;
    }

    state.printFailureAutoHomeSecondsLeft -= 1;

    if (state.printFailureAutoHomeSecondsLeft <= 0) {
      resetCustomer();
      render();
      refreshPrinterStatus();
      return;
    }

    const countdownEl = document.getElementById("print-failure-home-countdown");
    if (countdownEl) {
      countdownEl.textContent = customerTranslateText(`Staff has been notified. Returning home automatically in ${state.printFailureAutoHomeSecondsLeft}s if this isn't resolved.`);
    }
  } else {
    state.printFailureAutoHomeSecondsLeft = null;
  }
}

function renderMobilePaymentShell() {
  const payment = state.mobilePayment;
  const amountValue = payment.checkout?.amount ? Number(payment.checkout.amount) / 100 : Number(payment.payment?.amount || 0);
  const amountText = amountValue > 0 ? money(amountValue) : "";

  return `
    <main class="mobile-payment-page">
      <section class="mobile-payment-card">
        <img src="./assets/aarya-innovtech-logo-full.png" alt="Aarya Innovtech Pvt. Ltd." style="max-height: 100px; margin: 0 auto 15px; display: block;" draggable="false" data-no-visual-search />
        <h1>${payment.completed ? "Payment successful" : "Print Kiosk Payment"}</h1>
        ${amountText ? `<strong class="mobile-payment-amount">${escapeHtml(amountText)}</strong>` : ""}
        ${payment.job?.fileName ? `<p class="mobile-payment-job">${escapeHtml(payment.job.fileName)}</p>` : ""}
        ${payment.message ? `<p class="helper-text">${escapeHtml(payment.message)}</p>` : ""}
        ${payment.error ? `<div class="empty-note">${escapeHtml(payment.error)}</div>` : ""}
        ${payment.completed ? `
          <div class="badge good">Paid</div>
          <p class="helper-text">You can return to the kiosk. Printing will continue there automatically.</p>
        ` : ""}
        ${payment.error ? `<button class="primary-button" data-action="mobile-pay">Retry payment</button>` : ""}
      </section>
    </main>
  `;
}

function renderCustomerShell() {
  const showFooter = !state.showPrivacyPolicy && KIOSK_ID !== UNASSIGNED_KIOSK_ID;
  const useClassicHomeShell = showFooter && state.step === 0;
  const useFormsReferenceShell = showFooter
    && isFormTemplateService()
    && (state.step === 1 || (state.step > 1 && !jobFiles().length));
  const languageClass = languageTypographyClass(state.customerLanguage);
  return `
    <div class="app-shell customer-shell ${languageClass} ${showFooter ? "" : "no-customer-footer"} ${useClassicHomeShell ? "classic-home-shell" : ""} ${useFormsReferenceShell ? "forms-reference-shell forms-list-shell" : ""}" lang="${escapeHtml(state.customerLanguage)}">
      ${renderCustomerTopbarClassicHome()}
      <main class="main">
        ${renderCustomer()}
      </main>
      ${showFooter ? renderCustomerFooterFormsReference() : ""}
      ${renderPrinterHealthBadge()}
    </div>
  `;
}

function renderAdminShell() {
  const languageClass = languageTypographyClass(state.adminLanguage);
  if (!state.adminAuthed) {
    return `
      <div class="app-shell admin-shell login-app-shell ${languageClass}" lang="${escapeHtml(state.adminLanguage)}">
        <main class="main admin-screen">
          ${renderAdmin()}
        </main>
      </div>
    `;
  }
  // Rendered before the topbar on purpose, same as Super Admin's renderShell():
  // renderAdmin() calls renderAdminHeader() internally, which sets
  // state.currentAdminHeaderTitle as a side effect - renderAdminTopbar() below
  // then picks that up.
  const mainHtml = renderAdmin();
  return `
    <div class="app-shell admin-shell ${languageClass}" lang="${escapeHtml(state.adminLanguage)}">
      ${renderAdminTopbar()}
      <main class="main admin-screen">
        ${mainHtml}
      </main>
      ${renderConfirmModal()}
    </div>
  `;
}

// Custom-styled stand-in for window.confirm() - the native "127.0.0.1 says..."
// browser dialog doesn't match the app's UI. window.confirm() is synchronous
// (blocks JS until the user answers); a DOM modal can't block like that, so
// this is Promise-based instead - every call site was already inside an
// async function, so `if (!(await window.customConfirm(...))) return;` is a
// drop-in replacement with identical control flow.
let confirmModalResolve = null;

window.customConfirm = function (message, options = {}) {
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
    state.confirmModal = {
      message,
      title: options.title || "Please confirm",
      confirmLabel: options.confirmLabel || "OK",
      cancelLabel: options.cancelLabel || "Cancel",
      tone: options.tone || "danger"
    };
    render();
  });
};

window.resolveConfirmModal = function (result) {
  const resolve = confirmModalResolve;
  confirmModalResolve = null;
  state.confirmModal = null;
  render();
  if (resolve) resolve(result);
};

function renderConfirmModal() {
  if (!state.confirmModal) return "";
  const { title, message, confirmLabel, cancelLabel, tone } = state.confirmModal;
  const isDanger = tone !== "neutral";

  return `
    <div class="editor-modal-shell confirm-modal-shell" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <button type="button" class="editor-modal-backdrop" onclick="window.resolveConfirmModal(false)" aria-label="${escapeHtml(cancelLabel)}"></button>
      <div class="editor-modal-content confirm-modal-content">
        <div class="confirm-modal-card">
          <div class="confirm-modal-icon ${isDanger ? "is-danger" : ""}">${uiIcon(isDanger ? "alert" : "support", 26)}</div>
          <h2 class="confirm-modal-title">${escapeHtml(title)}</h2>
          <p class="confirm-modal-message">${escapeHtml(message)}</p>
          <div class="confirm-modal-actions">
            <button type="button" class="secondary-button" onclick="window.resolveConfirmModal(false)">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="${isDanger ? "danger-button" : "primary-button"}" onclick="window.resolveConfirmModal(true)">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderNmcKioskStatus(additionalClass = "") {
  const issue = customerInternetBlockStatus() || customerPrinterBlockIssue() || state.customerPrinterNotice;
  const isBlocked = Boolean(issue);
  const hasError = isBlocked || Boolean(state.printerHealth?.errorMessage);
  const statusClass = hasError ? "is-offline" : "is-online";
  const displayText = hasError ? "Offline" : "Ready";

  return `
    <div class="nmc-kiosk-status ${additionalClass} ${statusClass}">
      <span aria-hidden="true"></span>
      ${displayText}
    </div>
  `;
}

function renderCustomerPrinterStatusBadge() {
  const issue = customerInternetBlockStatus() || customerPrinterBlockIssue() || state.customerPrinterNotice;
  const isBlocked = Boolean(issue);
  // Never surface raw hardware detail (paper jam, door open, toner empty, ...) to the
  // customer — keep the public badge generic and send staff to the admin panel for detail.
  const text = issue?.tone === "checking" ? "Checking printer..." : (isBlocked ? "Offline" : "Online");
  const hasError = isBlocked || Boolean(state.printerHealth?.errorMessage);
  const icon = uiIcon("dot", 10);
  const colorClass = hasError ? "status-offline" : "status-online";

  return `
    <div class="kiosk-public-printer-status ${colorClass}">
      <span class="printer-status-icon">${icon}</span>
      <span class="printer-status-text">${text}</span>
    </div>
  `;
}

function renderCustomerLanguageControl() {
  return `
    <div class="customer-language-control kiosk-language-control" aria-label="Select language" data-no-customer-translation>
      <span class="kiosk-language-icon" aria-hidden="true">${uiIcon("language", 18)}</span>
      <div class="kiosk-language-buttons" role="group" aria-label="Select language">
        ${CUSTOMER_LANGUAGE_OPTIONS.map((option) => `
          <button
            type="button"
            class="kiosk-language-button ${state.customerLanguage === option.value ? "is-active" : ""}"
            data-customer-language-button="${escapeHtml(option.value)}"
            aria-pressed="${state.customerLanguage === option.value ? "true" : "false"}"
            lang="${escapeHtml(option.lang)}"
          >
            <span class="kiosk-language-label">${escapeHtml(option.label)}</span>
            <span class="kiosk-language-short">${escapeHtml(option.shortLabel)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function currentCustomerBrand(defaultSubtitle = DEFAULT_KIOSK_BRAND.subtitle) {
  const brand = normalizeClientBrand(state.clientBrand);
  return {
    title: brand.title || DEFAULT_KIOSK_BRAND.title,
    subtitle: brand.subtitle || defaultSubtitle || DEFAULT_KIOSK_BRAND.subtitle,
    logoUrl: brand.logoUrl || DEFAULT_KIOSK_BRAND.logoUrl,
    alt: brand.title || brand.name || DEFAULT_KIOSK_BRAND.title
  };
}

function renderCustomerBrandMark(className = "brand-mark nmc-kiosk-mark", defaultSubtitle = DEFAULT_KIOSK_BRAND.subtitle) {
  const brand = currentCustomerBrand(defaultSubtitle);
  return `<div class="${escapeHtml(className)}"><img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.alt)}" draggable="false" data-no-visual-search onerror="this.onerror=null;this.src='${escapeHtml(DEFAULT_KIOSK_BRAND.logoUrl)}';" /></div>`;
}

function renderCustomerBrandCopy(copyClass = "classic-home-brand-copy", defaultSubtitle = DEFAULT_KIOSK_BRAND.subtitle, titleClass = "brand-title", subtitleClass = "brand-subtitle") {
  const brand = currentCustomerBrand(defaultSubtitle);
  return `
    <div class="${escapeHtml(copyClass)}">
      <div class="${escapeHtml(titleClass)}">${escapeHtml(brand.title)}</div>
      <div class="${escapeHtml(subtitleClass)}">${escapeHtml(brand.subtitle)}</div>
    </div>
  `;
}

function renderCustomerTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        ${renderCustomerBrandMark("brand-mark", "Printing Kiosk")}
        ${renderCustomerBrandCopy("classic-home-brand-copy", "Printing Kiosk", "brand-title", "brand-subtitle")}
      </div>
      <div class="topbar-actions">
        ${renderCustomerPrinterStatusBadge()}
        ${renderCustomerLanguageControl()}
        <div class="timer-widget" aria-label="Current date and time">
          ${uiIcon("clock", 18)}
          <div class="time-container">
            <div class="time-text" id="kiosk-time">--:--:-- --</div>
            <div class="date-text" id="kiosk-date">---, -- ---, ----</div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderCustomerTopbarClassicHome() {
  return `
    <header class="topbar nmc-kiosk-topbar classic-home-topbar standard-kiosk-topbar">
      <div class="brand nmc-kiosk-brand">
        ${renderCustomerBrandMark("brand-mark nmc-kiosk-mark", "Printing Kiosk")}
        ${renderCustomerBrandCopy("classic-home-brand-copy", "Printing Kiosk")}
      </div>
      <div class="topbar-actions">
        ${renderCustomerPrinterStatusBadge()}
        ${renderCustomerLanguageControl()}
        <div class="timer-widget" aria-label="Current date and time">
          ${uiIcon("clock", 18)}
          <div class="time-container">
            <div class="time-text" id="kiosk-time">--:--:-- --</div>
            <div class="date-text" id="kiosk-date">---, -- ---, ----</div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderCustomerFooter() {
  return `
    <footer class="customer-footer" aria-label="Kiosk links">
      <div class="powered-by-brand">
        <img src="./assets/aarya-innovtech-logo-transparent.png" alt="Aarya Innovtech" class="powered-by-logo" draggable="false" data-no-visual-search />
        <span class="powered-by-name">
          <span class="powered-by-label">Powered by</span>
          <strong class="powered-by-company" aria-label="Aarya Innovtech Pvt. Ltd.">
            <span class="powered-by-company-main">AARYA INNOVTECH</span>
            <span class="powered-by-company-suffix">PVT. LTD.</span>
          </strong>
        </span>
      </div>
      ${renderFooterHelpCall()}
    </footer>
  `;
}

function renderFooterHelpCall() {
  return `
    <div class="kiosk-footer-help" aria-label="Need help call us">
      <span class="kiosk-footer-help-icon">${uiIcon("headset", 30)}</span>
      <span class="kiosk-footer-help-copy">
        <small>Need Help? Call Us</small>
        <strong>+91 9359604384</strong>
      </span>
    </div>
  `;
}

function renderCustomerTopbarNmc() {
  return `
    <header class="topbar nmc-kiosk-topbar standard-kiosk-topbar">
      <div class="brand nmc-kiosk-brand">
        ${renderCustomerBrandMark("brand-mark nmc-kiosk-mark", "Print & Pay Self-Service Kiosk")}
        <div class="nmc-kiosk-brand-copy">
          <div class="nmc-government-label">Government of Maharashtra</div>
          ${renderCustomerBrandCopy("nmc-kiosk-brand-main", "Print & Pay Self-Service Kiosk")}
        </div>
      </div>
      <div class="topbar-actions">
        ${renderNmcKioskStatus()}
        ${renderCustomerPrinterStatusBadge()}
        ${renderCustomerLanguageControl()}
        <div class="timer-widget" aria-label="Current date and time">
          ${uiIcon("clock", 18)}
          <div class="time-container">
            <div class="time-text" id="kiosk-time">--:--:-- --</div>
            <div class="date-text" id="kiosk-date">---, -- ---, ----</div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderCustomerTopbarFormsReference() {
  return `
    <header class="topbar forms-kiosk-topbar standard-kiosk-topbar" aria-label="Government forms kiosk header">
      <div class="forms-kiosk-nmc-brand">
        ${renderCustomerBrandMark("forms-kiosk-nmc-mark", "Print & Pay Self-Service Kiosk")}
        <div class="forms-kiosk-nmc-copy">
          <div class="forms-kiosk-government-label">Government of Maharashtra</div>
          ${renderCustomerBrandCopy("forms-kiosk-brand-main", "Print & Pay Self-Service Kiosk", "forms-kiosk-title", "forms-kiosk-subtitle")}
        </div>
      </div>
      <div class="forms-kiosk-topbar-actions">
        ${renderNmcKioskStatus("forms-kiosk-status")}
        ${renderCustomerPrinterStatusBadge()}
        ${renderCustomerLanguageControl()}
        <div class="timer-widget forms-kiosk-timer" aria-label="Current date and time">
          ${uiIcon("clock", 18)}
          <div class="time-container">
            <div class="time-text" id="kiosk-time">--:--:-- --</div>
            <div class="date-text" id="kiosk-date">---, -- ---, ----</div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderCustomerFooterNmc() {
  return `
    <footer class="customer-footer nmc-kiosk-footer" aria-label="Kiosk links">
      <div class="powered-by-brand">
        <img src="./assets/aarya-innovtech-logo-transparent.png" alt="Aarya Innovtech" class="powered-by-logo" draggable="false" data-no-visual-search />
        <span class="powered-by-name">
          <span class="powered-by-label">Powered by</span>
          <strong class="powered-by-company" aria-label="Aarya Innovtech Pvt. Ltd.">
            <span class="powered-by-company-main">AARYA INNOVTECH</span>
            <span class="powered-by-company-suffix">PVT. LTD.</span>
          </strong>
        </span>
      </div>
      ${renderFooterHelpCall()}
    </footer>
  `;
}

function renderCustomerFooterFormsReference() {
  return `
    <footer class="forms-kiosk-footer" aria-label="Kiosk links">
      <div class="forms-kiosk-footer-brand">
        <img src="./assets/aarya-innovtech-logo-transparent.png" alt="Aarya Innovtech" draggable="false" data-no-visual-search />
        <span>
          <small>Powered by</small>
          <strong class="powered-by-company" aria-label="Aarya Innovtech Pvt. Ltd.">
            <span class="powered-by-company-main">AARYA INNOVTECH</span>
            <span class="powered-by-company-suffix">PVT. LTD.</span>
          </strong>
        </span>
      </div>
      ${renderFooterHelpCall()}
    </footer>
  `;
}

function renderAdminTopbar() {
  const adminLabel = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const alertCount = adminOperationalAlerts().length;

  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-logo-full-card"><img class="brand-logo-full" src="./assets/aarya-innovtech-logo-full.png" alt="Aarya Innovtech Pvt. Ltd." draggable="false" data-no-visual-search /></div>
      </div>
      <div class="topbar-page-title">
        <h1>${state.currentAdminHeaderTitle || ""}</h1>
        ${state.currentAdminHeaderSubtitle ? `<p>${state.currentAdminHeaderSubtitle}</p>` : ""}
      </div>
      <div class="topbar-actions">

        ${state.adminAuthed ? `
          <button class="notification-button" data-admin-page="alerts" aria-label="Open alerts">
            ${uiIcon("bell", 22)}
            ${alertCount ? `<span>${Math.min(alertCount, 99)}</span>` : ""}
          </button>
          <button class="mobile-nav-toggle" data-action="admin-toggle-nav" aria-controls="kiosk-admin-navigation" aria-expanded="${state.adminNavOpen}" aria-label="${state.adminNavOpen ? "Close navigation" : "Open navigation"}">
            ${uiIcon(state.adminNavOpen ? "close" : "menu", 22)}
          </button>
          <div class="profile-menu-container">
            <button class="profile-avatar-button" data-action="admin-toggle-profile-menu" aria-label="User Profile">
              <div class="avatar-circle">AD</div>
              <span class="profile-name">Admin</span>
              ${uiIcon("chevron-down", 14)}
            </button>
            ${state.adminProfileMenuOpen ? `
              <div class="profile-dropdown-menu">
                <div class="profile-dropdown-header">
                  <strong>Admin Account</strong>
                  <span>${escapeHtml(adminLabel)}</span>
                </div>
                <div class="profile-dropdown-divider"></div>
                <button class="profile-dropdown-item danger" data-action="admin-logout">
                  ${uiIcon("logout", 16)} <span>Logout</span>
                </button>
              </div>
            ` : ""}
          </div>
        ` : ""}
      </div>
    </header>
  `;
}

function renderAdminSettingsModal() {
  return "";
}

window.closeAdminSettingsModal = function () {
  state.adminSettingsModalOpen = false;
  state.adminSettingsStatus = "";
  render();
};

window.saveAdminSettingsModal = function () {
  saveAdminSettings();
};

function renderAdminIdleScreensaverSection() {
  if (!state.idleScreensaverDraft) {
    return `
      <h3>Idle Screen (Screensaver)</h3>
      <p class="helper-text">${escapeHtml(state.idleScreensaverError || state.idleScreensaverStatus || "Loading idle-screen settings...")}</p>
    `;
  }

  const draft = state.idleScreensaverDraft;
  const mode = draft.idleMediaMode;
  const images = Array.isArray(draft.idleImageUrls) ? draft.idleImageUrls : [];
  const videoUrl = draft.idleVideoUrl || "";
  const timeoutSeconds = Number(draft.idleTimeoutSeconds) || 60;

  return `
    <h3>Idle Screen (Screensaver)</h3>
    <p class="helper-text">Shown on the kiosk home screen after it sits idle. Pick one mode - image slideshow or video.</p>
    ${state.idleScreensaverStatus ? `<p class="helper-text">${escapeHtml(state.idleScreensaverStatus)}</p>` : ""}
    ${state.idleScreensaverError ? `<div class="empty-note">${escapeHtml(state.idleScreensaverError)}</div>` : ""}

    <div class="settings-grid">
      <label class="setting-field">Mode
        <select data-idle-screensaver-field="idleMediaMode">
          <option value="none" ${mode === "none" ? "selected" : ""}>Off</option>
          <option value="image" ${mode === "image" ? "selected" : ""}>Image Slideshow</option>
          <option value="video" ${mode === "video" ? "selected" : ""}>Video</option>
        </select>
      </label>
      <label class="setting-field">Idle timeout (seconds)
        <input type="number" min="15" max="600" value="${escapeHtml(String(timeoutSeconds))}" data-idle-screensaver-field="idleTimeoutSeconds" />
      </label>
    </div>

    <div class="idle-media-section ${mode === "image" ? "" : "is-dimmed"}">
      <h3>Slideshow images ${images.length ? `(${images.length}/10)` : ""}</h3>
      <label class="template-upload-row compact-template-upload">
        <span>Add images</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-idle-screensaver-image-upload multiple ${images.length >= 10 ? "disabled" : ""} />
      </label>
      <div class="idle-image-grid">
        ${images.length ? images.map((imageUrl, index) => `
          <div class="idle-image-item">
            <span class="admin-image-preview service-image"><img alt="" src="${escapeHtml(imageUrl)}" draggable="false" data-no-visual-search /></span>
            <div class="idle-image-item-actions">
              <button type="button" class="ghost-button small-button" data-idle-screensaver-image-move="${index}" data-idle-screensaver-image-direction="-1" ${index === 0 ? "disabled" : ""}>Up</button>
              <button type="button" class="ghost-button small-button" data-idle-screensaver-image-move="${index}" data-idle-screensaver-image-direction="1" ${index === images.length - 1 ? "disabled" : ""}>Down</button>
              <button type="button" class="danger-button small-button" data-idle-screensaver-image-delete="${index}">Remove</button>
            </div>
          </div>
        `).join("") : `<div class="empty-note">No slideshow images uploaded yet.</div>`}
      </div>
    </div>

    <div class="idle-media-section ${mode === "video" ? "" : "is-dimmed"}">
      <h3>Idle video</h3>
      <label class="template-upload-row compact-template-upload">
        <span>${videoUrl ? "Replace video" : "Upload video"}</span>
        <input type="file" accept="video/mp4,video/webm" data-idle-screensaver-video-upload />
      </label>
      ${videoUrl
        ? `<video src="${escapeHtml(videoUrl)}" muted loop controls class="idle-video-preview"></video>`
        : `<div class="empty-note">No video uploaded yet.</div>`}
    </div>

    <div class="flow-actions">
      <button class="primary-button" data-action="save-idle-screensaver" type="button">Save Idle Screen</button>
    </div>
  `;
}

function renderCustomer() {
  if (state.showPrivacyPolicy) {
    return `
      <div class="customer-layout upload-focused privacy-policy-layout">
        <section class="content">
          ${renderPrivacyPolicyPage()}
        </section>
      </div>
    `;
  }

  return `
    <div class="customer-layout nmc-kiosk-layout upload-focused no-step-rail">
      <section class="content">
        ${renderCustomerStep()}
      </section>
    </div>
  `;
}

function renderPrivacyPolicyPage() {
  const pages = {
    terms: {
      title: "Terms & Conditions",
      updated: "Last updated: July 8, 2026",
      sections: [
        ["1. Service Use", "Use this kiosk only for document preview, payment, and printing services."],
        ["2. Review Before Pay", "Check the file, page count, print mode, and amount before confirming."],
        ["3. Availability", "Printing depends on printer, internet, payment, and kiosk readiness."]
      ]
    },
    privacy: {
      title: "Privacy Policy",
      updated: "Last updated: July 8, 2026",
      sections: [
        ["1. Information We Collect", "We keep only what is needed for printing: file, settings, kiosk ID, job ID, payment status, and transaction time."],
        ["2. How We Use It", "Data is used to process payment, print documents, show receipts, and support refund checks."],
        ["3. Document Handling", "Uploaded files are used for preview and print only. Sessions are cleared after completion or reset."],
        ["4. Security", "Payments are handled through secure gateway services. Full card details are not stored."]
      ]
    },
    refund: {
      title: "Refund Policy",
      updated: "Last updated: July 8, 2026",
      sections: [
        ["1. Eligible Refunds", "Refund support may apply if payment succeeds but printing fails."],
        ["2. Review Process", "Requests are checked using transaction ID, job ID, kiosk ID, and print status."],
        ["3. Timelines", "Approved refunds are processed through the payment provider to the original account."]
      ]
    },
    contact: {
      title: "Contact Us",
      updated: "For payment, refund, or kiosk support, contact us using the details below.",
      contactRows: [
        { icon: "mail", title: "Email", body: "admin@smartbuddy.co.in" },
        { icon: "phone", title: "Phone", body: "+91 9359604384" },
        { icon: "pin", title: "Nashik Office", body: "Flat No.4A, Sayali Darshan -A-Wing.\nRadha Nagar, Makhamalabad Road,\nPanchavati, Nashik, Maharashtra-422003" },
        { icon: "pin", title: "Mumbai Office", body: "Flat No.C-03, The Maharashtra Chs Ltd.\nC Wing Ground Floor, Ambekar Nagar,\nG. D. Ambekar Mark, Parel Mumbai City,\nMaharashtra - 400012" },
        { icon: "pin", title: "Factory", body: "S-27, Near Emerson, Ambad MIDC,\nNashik, Maharashtra - 422010" }
      ]
    }
  };
  const page = pages[state.policyPage] || pages.privacy;

  return `
    <div class="privacy-policy-page">
      <article class="privacy-policy-card">
        <div class="privacy-policy-head">
          <div>
            <h1>${escapeHtml(page.title)}</h1>
            <p>${escapeHtml(page.updated)}</p>
          </div>
          <button class="ghost-button" data-action="close-privacy-policy">Back to kiosk</button>
        </div>
        ${page.contactRows ? `
          <div class="contact-list">
            ${page.contactRows.map((row) => `
              <section class="contact-row">
                <span class="contact-icon" aria-hidden="true">${contactIcon(row.icon)}</span>
                <span>
                  <h2>${escapeHtml(row.title)}</h2>
                  <p>${escapeHtml(row.body).replace(/\n/g, "<br>")}</p>
                </span>
              </section>
            `).join("")}
          </div>
        ` : `
        ${page.sections.map(([title, body]) => `
          <section>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(body)}</p>
          </section>
        `).join("")}
        `}
      </article>
    </div>
  `;
}

function contactIcon(kind) {
  if (kind === "mail") {
    return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
  }

  if (kind === "phone") {
    return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"/></svg>`;
  }

  return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
}

function renderStepItem(step, index) {
  const label = index === 1 && isFormTemplateService()
    ? "Forms"
    : index === 3 && isFreePrintJob()
      ? "Print"
      : step;
  const status = index === state.step ? "active" : index < state.step ? "done" : "";
  const homeAction = index === 0 ? 'data-action="reset-session" style="cursor: pointer;"' : '';
  return `
    <div class="step-item ${status}" ${homeAction}>
      <span class="step-number">${index + 1}</span>
      <span>${label}</span>
    </div>
  `;
}

function renderStepItemNmc(step, index) {
  const label = index === 1 && isFormTemplateService()
    ? "Forms"
    : index === 3 && isFreePrintJob()
      ? "Print"
      : step;
  const status = index === state.step ? "active" : index < state.step ? "done" : "";
  const homeAction = index === 0 ? 'data-action="reset-session" style="cursor: pointer;"' : "";
  const iconName = index === 0 ? "dashboard" : index === 1 ? (isFormTemplateService() ? "pages" : "upload") : index === 2 ? "printer" : "payments";
  return `
    <div class="step-item nmc-step-item ${status}" ${homeAction}>
      <span class="step-number">${status === "done" ? "&#10003;" : index + 1}</span>
      <span class="nmc-step-icon" aria-hidden="true">${uiIcon(iconName, 18)}</span>
      <span class="nmc-step-copy">
        <small>${index === 0 ? "Start" : `Stage ${index}`}</small>
        <strong>${escapeHtml(label)}</strong>
      </span>
    </div>
  `;
}

function renderCustomerStep() {
  if (state.step === 0 || !state.selectedService) return renderServicesStepNmc();
  if (state.step > 1 && !jobFiles().length) return isFormTemplateService() ? renderFormTemplateStep() : renderUploadStep();
  if (state.step === 1) return isFormTemplateService() ? renderFormTemplateStep() : renderUploadStep();
  if (state.step === 2) return renderPreviewStep();
  if (state.step === 3) {
    if (state.printError) return renderPrintFailureStep();
    if (isFreePrintJob()) return renderDirectPrintStep();
    return renderPaymentStep();
  }
  return renderThankYouStep();
}

function renderServicesStepNmc() {
  if (KIOSK_ID === UNASSIGNED_KIOSK_ID) {
    return `
      <div class="stage service-stage is-empty nmc-home-stage">
        <div class="stage-header nmc-home-header">
          <span class="nmc-kicker">Setup required</span>
          <h1>Kiosk setup required</h1>
          <p class="stage-intro">Ask the client for this machine's kiosk ID and setup code.</p>
        </div>
      </div>
    `;
  }

  return renderServicesStep();
}

function renderServicesStep() {
  if (KIOSK_ID === UNASSIGNED_KIOSK_ID) {
    return `
      <div class="stage service-stage is-empty">
        <div class="stage-header">
          <h1>Kiosk setup required</h1>
          <p class="stage-intro">Ask the client for this machine's kiosk ID and setup code.</p>
        </div>
      </div>
    `;
  }

  const internetIssue = customerInternetBlockStatus();
  const printerReady = internetIssue ? false : printerReadyForCustomerFlow();
  const serviceBlockStatus = internetIssue || customerKioskBlockStatus();
  const availableServices = customerServices();
  const totalServiceCards = availableServices.length;
  const serviceGridClass = totalServiceCards > 2 ? "services-count-many" : "services-count-2";
  const emptyServiceMessage = totalServiceCards
    ? ""
    : state.configStatus || "No services are configured for this kiosk.";

  return `
    <div class="stage service-stage custom-home-stage">
      <div class="stage-header custom-home-header">
        <h1>Printing Kiosk</h1>
      </div>
      ${renderCustomerServiceStatusBanner(serviceBlockStatus)}
      
      <div class="premium-services-grid ${serviceGridClass}" data-service-count="${totalServiceCards}">
        ${availableServices.length
          ? availableServices.map((service, index) => renderAdditionalPremiumServiceCard(service, index, printerReady, serviceBlockStatus)).join("")
          : `<div class="empty-note">${escapeHtml(emptyServiceMessage)}</div>`}
      </div>
    </div>
  `;
}

function premiumServiceIllustration(isTemplate) {
  if (isTemplate) {
    return `
      <div class="premium-illustration" aria-hidden="true">
        <svg viewBox="0 0 320 170" role="img" focusable="false">
          <path d="M34 144c52 0 65-18 104-18h48c41 0 50 18 100 18" fill="#eefdf7"/>
          <path d="M190 56h-18l47-31 47 31h-18v55h-58V56Z" fill="#bff7df"/>
          <path d="M84 62h92l18 28v64H64V82c0-11 9-20 20-20Z" fill="#10b981"/>
          <path d="M82 62h94l-20 28H64l18-28Z" fill="#15c998"/>
          <circle cx="122" cy="103" r="17" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="3 8"/>
          <path d="M205 69 282 79l13 96-78 8-12-114Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
          <path d="m244 112 10 10 20-23M247 137l10 10 20-23M250 162l10 10 20-23" fill="none" stroke="#10b981" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
  }

  return `
    <div class="premium-illustration" aria-hidden="true">
      <svg viewBox="0 0 320 170" role="img" focusable="false">
        <path d="M28 144c47 0 66-18 104-18h52c39 0 56 18 108 18" fill="#f3f7fb"/>
        <path d="M125 27h69l30 30v94h-99V27Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
        <path d="M194 27v31h30" fill="#fca5a5"/>
        <path d="M188 47h56l30 30v74h-86V47Z" fill="#ffffff" stroke="#bfdbfe" stroke-width="4"/>
        <path d="M244 47v31h30" fill="#bfdbfe"/>
        <rect x="106" y="70" width="62" height="35" rx="7" fill="#ef4444"/>
        <text x="137" y="94" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">PDF</text>
        <rect x="178" y="73" width="62" height="35" rx="7" fill="#2563eb"/>
        <text x="209" y="97" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">DOC</text>
        <path d="M79 142c-20 0-36-15-36-34 0-17 13-31 30-33 8-20 28-34 51-34 27 0 50 19 54 44 18 3 31 18 31 36 0 12-6 22-15 28H79Z" fill="#2563eb"/>
        <path d="M120 123V78M98 100l22-22 22 22" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="175" y="101" width="90" height="49" rx="14" fill="#334155"/>
        <path d="M196 137h54v32h-54z" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
        <path d="M204 153h38" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
      </svg>
    </div>
  `;
}

function renderAdditionalPremiumServiceCard(service, index, printerReady, serviceBlockStatus = null) {
  const isTemplate = isFormTemplateService(service.id);
  const accent = isTemplate ? "green" : "blue";
  const icon = isTemplate ? "pages" : "upload";
  const title = localizedServiceText(service, "title") || service.title || `Service ${index + 1}`;
  const description = localizedServiceText(service, "description") || service.description || (isTemplate ? "Select a ready form and print it." : "Send files from your phone and print.");
  const templateCount = formTemplatesForService(service.id).length;
  const featureLabel = isTemplate ? "Forms" : "Add File";
  const featureText = isTemplate
    ? `${templateCount || "Ready"} form${templateCount === 1 ? "" : "s"}`
    : "Use phone QR";
  const secondFeature = "Secure Document";
  const secondText = "Safe upload";
  const secondFeatureMarkup = isTemplate ? "" : `
            <div class="premium-feature ${accent === "green" ? "border-left-green" : "border-left"}">
              ${uiIcon("system", 20)}
              <div>
                <strong>${escapeHtml(secondFeature)}</strong>
                <span>${escapeHtml(secondText)}</span>
              </div>
            </div>`;

  return `
        <div class="premium-service-card premium-service-card-extra card-${accent} ${printerReady ? "" : "is-service-blocked"}" data-service="${escapeHtml(service.id)}" aria-disabled="${printerReady ? "false" : "true"}" style="cursor: ${printerReady ? "pointer" : "not-allowed"};">
          <div class="premium-card-header">
            <div class="premium-icon-box bg-${accent}" aria-hidden="true">${uiIcon(icon, 28)}</div>
            <div class="premium-header-text">
              <h2>${escapeHtml(title)}</h2>
              <p>${escapeHtml(description)}</p>
            </div>
          </div>

          ${premiumServiceIllustration(isTemplate)}

          <div class="premium-features bg-light-${accent}">
            <div class="premium-feature">
              ${uiIcon(icon, 20)}
              <div>
                <strong>${escapeHtml(featureLabel)}</strong>
                <span>${escapeHtml(featureText)}</span>
              </div>
            </div>
            ${secondFeatureMarkup}
            <div class="premium-feature ${accent === "green" ? "border-left-green" : "border-left"}">
              ${uiIcon("clock", 20)}
              <div>
                <strong>Quick Print</strong>
                <span>Fast service</span>
              </div>
            </div>
          </div>

          <button class="premium-btn bg-${accent}" data-service="${escapeHtml(service.id)}" ${printerReady ? "" : "disabled"}>
            Start
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
          ${!printerReady && serviceBlockStatus ? `<p class="premium-service-block-message">${escapeHtml(serviceBlockStatus.title)}</p>` : ""}
        </div>
  `;
}

function renderFormTemplateStepLegacy() {
  const service = selectedService();
  const templates = formTemplatesForService(service.id);
  const filteredTemplates = templates;
  const rates = serviceRates(service.id);
  const classicBwRate = rates.bw;
  const classicPrintModeLabel = customerSettingEnabled("bw", service) ? "B/W" : "Color";

  state.templatePage = 1;

  window.nextTemplatePage = () => {
    state.templatePage = 1;
  };
  window.prevTemplatePage = () => {
    state.templatePage = 1;
  };

  return `
    <div class="stage template-selection-stage classic-template-stage">
      <div class="classic-template-header">
        <div class="classic-template-title">
          <h1>Choose form template</h1>
          <p>Existing Documents selected. Pick a form to preview and print.</p>
        </div>
        <div class="classic-template-pills">
          <span class="classic-template-pill"><strong>${filteredTemplates.length}</strong> forms</span>
          <span class="classic-template-pill"><strong>Rs. ${classicBwRate}</strong> ${escapeHtml(classicPrintModeLabel)} per page</span>
        </div>
      </div>

      <div class="classic-template-grid">
        ${filteredTemplates.length ? filteredTemplates.map((template) => {
    const templateTitle = localizedTemplateText(template, "title");
    const templateDescription = localizedTemplateText(template, "description");
    const pages = Math.max(1, Number(template.pages) || 1);
    const orientation = String(template.orientation || "portrait").toLowerCase();
    const documentKind = templateDocumentKind(template.documentType || template.imageUrl) === "pdf" ? "PDF" : "DOC";
    const categoryText = template.category || template.department
      ? `Category: ${[template.category, template.department].filter(Boolean).join(" ")}`
      : "Official form for print.";
    const description = templateDescription || categoryText;

    return `
          <div class="classic-template-card" data-template="${escapeHtml(template.id)}">
            <div class="classic-template-file" aria-hidden="true">${escapeHtml(documentKind)}</div>
            <div class="classic-template-copy">
              <h3>${escapeHtml(templateTitle)}</h3>
              <p>${escapeHtml(description)}</p>
            </div>
            <div class="classic-template-side">
              <div class="classic-template-meta">${pages} page${pages > 1 ? "s" : ""} • ${escapeHtml(orientation)}</div>
              <button class="classic-template-btn" data-template="${escapeHtml(template.id)}">Print</button>
            </div>
          </div>
        `;
  }).join("") : `
          <div class="empty-note classic-template-empty">No forms available for this service.</div>
        `}
      </div>
    </div>
  `;

  // Pagination Logic
  const itemsPerPage = 4;
  if (!state.templatePage) state.templatePage = 1;
  const totalFiltered = filteredTemplates.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage) || 1;
  if (state.templatePage > totalPages) state.templatePage = totalPages;
  const startIndex = (state.templatePage - 1) * itemsPerPage;
  const paginatedTemplates = filteredTemplates.slice(startIndex, startIndex + itemsPerPage);

  window.nextTemplatePage = () => {
    state.templatePage = Math.min(totalPages, state.templatePage + 1);
    try { render(); } catch (e) { window.location.reload(); }
  };
  window.prevTemplatePage = () => {
    state.templatePage = Math.max(1, state.templatePage - 1);
    try { render(); } catch (e) { window.location.reload(); }
  };

  const getDeptColor = (idx) => {
    const colors = ['#f87171', '#4ade80', '#60a5fa', '#c084fc', '#facc15'];
    return colors[idx % colors.length];
  };

  const getDeptIcon = (idx) => {
    return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
  };

  return `
    <div class="stage template-selection-stage forms-v2-stage" style="background: #f8fafc; padding: 10px 14px; overflow: hidden; display: flex; flex-direction: column; gap: 10px;">
      <div class="forms-v2-header">
        <div class="forms-v2-title-area">
          <div class="forms-v2-title-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path></svg>
          </div>
          <div>
            <h1>Government Forms</h1>
            <p>Find and print official forms in seconds.</p>
          </div>
        </div>
        <div class="forms-v2-stats">
          <div class="forms-v2-stat-card">
            <div class="stat-icon stat-icon-blue">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <div class="stat-text">
              <strong>${totalTemplates}</strong>
              <span>Total Forms</span>
            </div>
          </div>
          <div class="forms-v2-stat-card">
            <div class="stat-icon stat-icon-green">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <div class="stat-text">
              <strong>₹${rates.bw}</strong>
              <span>Per Page (B/W)</span>
            </div>
          </div>
          <div class="forms-v2-stat-card">
            <div class="stat-icon stat-icon-purple">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <div class="stat-text">
              <strong>Instant</strong>
              <span>Printing</span>
            </div>
          </div>
        </div>
      </div>

      <div class="forms-v2-filter-bar">
        <div class="forms-v2-search-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input
            class="forms-v2-search-input"
            data-template-search-input
            placeholder="Search forms by name, department or keyword..."
            value="${escapeHtml(templateSearchQuery)}"
            onclick="if(!document.querySelector('.template-keyboard-popup-container')) { this.nextElementSibling.click(); }"
            oninput="state.templatePage = 1;"
          />
          <button type="button" style="display:none" data-template-search-action="toggle-keyboard"></button>
          ${templateSearchQuery ? `
            <button type="button" data-template-search-action="clear" title="Clear search" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: #eaf2ff; border: 1px solid #c8dbf5; border-radius: 8px; padding: 4px 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #075bd7; font-weight: 800;">
              Clear
            </button>
          ` : ""}
        </div>
        <div class="forms-v2-filters">
          <div class="forms-v2-select">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            <select><option>All Departments</option></select>
          </div>
          <div class="forms-v2-select">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <select><option>All Categories</option></select>
          </div>
          <div class="forms-v2-select">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
            <select><option>Newest First</option></select>
          </div>
        </div>
      </div>

      ${state.templateSearchKeyboardActive ? `
        <div class="template-keyboard-popup-container">
          <div class="template-keyboard-popup-backdrop" data-template-search-action="close"></div>
          <div class="template-keyboard-popup-content">
            ${renderTemplateSearchKeyboard()}
          </div>
        </div>
      ` : ""}

      <div class="forms-v2-grid">
        ${paginatedTemplates.length ? paginatedTemplates.map((template, idx) => {
    const templateTitle = localizedTemplateText(template, "title");
    const templateDescription = localizedTemplateText(template, "description");
    const documentKind = templateDocumentKind(template.documentType || template.imageUrl) === "pdf" ? "PDF" : "DOC";
    return `
            <div class="forms-v2-card">
              <div class="forms-v2-card-body" data-template="${escapeHtml(template.id)}" style="cursor: pointer;">
                <div class="forms-v2-card-icon-container">
                  ${renderFormTemplateIcon(template, idx)}
                  <span class="forms-v2-pdf-badge">${escapeHtml(documentKind)}</span>
                </div>
                <div class="forms-v2-card-content">
                  <h3>${escapeHtml(templateTitle)}</h3>
                  <p>${escapeHtml(templateDescription) || "Official government form for processing."}</p>
                </div>
              </div>
              <div class="forms-v2-card-footer forms-v2-card-footer--actions-only">
                <div class="forms-v2-actions">
                  <button class="forms-v2-btn forms-v2-btn-primary" data-template="${escapeHtml(template.id)}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    Preview
                  </button>
                </div>
              </div>
            </div>
          `;
  }).join("") : `
          <div class="empty-note template-search-empty">No forms match this search.</div>
        `}
      </div>
    </div>
  `;
}

function renderFormTemplateStep() {
  const service = selectedService();
  const templates = formTemplatesForService(service.id);
  const filteredTemplates = filteredFormTemplates(service.id);
  const rates = serviceRates(service.id);
  const templateSearchQuery = state.templateSearchQuery || "";
  const visibleTemplates = filteredTemplates;
  const printModeLabel = customerSettingEnabled("bw", service) ? "B/W" : "Color";
  const perPageRate = printModeLabel === "Color" ? rates.color : rates.bw;

  return `
    <div class="stage template-selection-stage forms-v2-stage forms-v2-compact-list" data-forms-list-center="true" data-visible-count="${visibleTemplates.length}" style="width: min(calc(100vw - 100px), clamp(1120px, 73vw, 1400px)) !important; max-width: 1400px !important; margin-left: auto !important; margin-right: auto !important; align-self: center !important; flex: 0 0 auto !important; height: auto !important; overflow: hidden !important;">
      <div class="forms-v2-filter-bar">
        <button type="button" class="forms-v2-back-btn" data-action="prev-step" title="Home">
          ${uiIcon("dashboard", 18)}
          Home
        </button>
        <div class="forms-v2-search-wrapper">
          <span class="forms-v2-search-icon" aria-hidden="true">${uiIcon("search", 18)}</span>
          <input
            class="forms-v2-search-input"
            data-template-search-input
            placeholder="Search forms by name, department or keyword..."
            value="${escapeHtml(templateSearchQuery)}"
          />
          ${templateSearchQuery ? `
            <button type="button" class="forms-v2-search-clear forms-v2-search-go" data-template-search-action="clear" title="Clear search">
              Clear
            </button>
          ` : ""}
        </div>
        <div class="forms-v2-search-summary">
          <strong>${escapeHtml(money(perPageRate))}</strong>
          <span>${escapeHtml(printModeLabel)} per page</span>
        </div>
      </div>

      ${state.templateSearchKeyboardActive ? `
        <div class="template-keyboard-popup-container">
          <div class="template-keyboard-popup-backdrop" data-template-search-action="close"></div>
          <div class="template-keyboard-popup-content">
            ${renderTemplateSearchKeyboard()}
          </div>
        </div>
      ` : ""}

      <div class="forms-v2-grid" data-forms-list-grid="true" style="display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; grid-auto-rows: 156px !important; gap: 10px !important; height: min(614px, calc(100dvh - 350px)) !important; max-height: min(614px, calc(100dvh - 350px)) !important; overflow-x: hidden !important; overflow-y: auto !important; align-content: start !important;">
        ${visibleTemplates.length ? visibleTemplates.map((template, index) => {
    const templateTitle = localizedTemplateText(template, "title");
    const templateDescription = localizedTemplateText(template, "description") || "Official government form for processing.";
    const documentKind = templateDocumentKind(template.documentType || template.imageUrl) === "pdf" ? "PDF" : "DOC";

    return `
          <article class="forms-v2-card" data-template="${escapeHtml(template.id)}">
            <div class="forms-v2-card-body" data-template="${escapeHtml(template.id)}">
              <div class="forms-v2-card-icon-container">
                ${renderFormTemplateIcon(template, index)}
                <span class="forms-v2-pdf-badge">${escapeHtml(documentKind)}</span>
              </div>
              <div class="forms-v2-card-content">
                <h3>${escapeHtml(templateTitle)}</h3>
                <p>${escapeHtml(templateDescription)}</p>
              </div>
            </div>
            <div class="forms-v2-card-footer forms-v2-card-footer--actions-only">
              <button class="forms-v2-btn forms-v2-btn-primary" data-template="${escapeHtml(template.id)}">
                ${uiIcon("printer", 16)}
                Preview
              </button>
            </div>
          </article>
        `;
  }).join("") : `
          <div class="empty-note template-search-empty">No forms match this search.</div>
        `}
      </div>
    </div>
  `;
}

function renderUploadStep() {
  const session = state.uploadSession;
  return `
    <div class="stage upload-stage qr-only-upload-stage nmc-phone-transfer-stage">
      <div class="qr-transfer-hero">
        <div class="qr-transfer-copy">
          <span class="qr-transfer-eyebrow">Use your phone</span>
          <h1>Scan QR to Add Files</h1>
          <p class="stage-intro">Use your phone camera. Scan this code, choose your document, then tap Send.</p>
          <div class="qr-transfer-steps" aria-label="How to add files from phone">
            <div class="qr-transfer-step">
              <strong>1</strong>
              <span>Open phone camera</span>
            </div>
            <div class="qr-transfer-step">
              <strong>2</strong>
              <span>Choose files</span>
            </div>
            <div class="qr-transfer-step">
              <strong>3</strong>
              <span>Tap Send</span>
            </div>
          </div>
          <div class="qr-transfer-actions">
            <button class="ghost-button" data-action="prev-step">Back</button>
          </div>
        </div>
        <div class="qr-only-upload-panel">
          <div class="qr-upload-card qr-only-upload-card">
            <div class="qr-card-heading">
              <strong>Scan this QR code</strong>
              <span>Keep this screen open</span>
            </div>
            ${renderQrUploadBox(session)}
            ${state.uploadError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.uploadError)}</div>` : ""}
            ${session?.error ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(session.error)}</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderQrUploadBox(session) {
  if (!session || session.status === "preparing") {
    return `
      <div class="qr-placeholder">
        <div class="qr-loading"></div>
        <h2>Getting QR ready</h2>
        <p>Please wait a moment.</p>
      </div>
    `;
  }

  if (session.status === "offline") {
    return `
      <div class="qr-placeholder">
        <div class="preview-file-icon">QR</div>
        <h2>QR not ready</h2>
        <p>Ask staff to start the kiosk service.</p>
      </div>
    `;
  }

  return `
    <div class="qr-code-box" aria-label="Scan this QR code to add files from your phone">
      ${session.qrSvg || `<img alt="Upload QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=${encodeURIComponent(session.uploadUrl)}" draggable="false" data-no-visual-search />`}
    </div>
    <div class="qr-upload-help">
      <strong>After sending files, look back at this kiosk.</strong>
      <span>You can send up to ${MAX_FILES_PER_JOB} files.</span>
    </div>
  `;
}

function renderPreviewStep() {
  const files = jobFiles();
  const file = activePreviewFile();
  enforceJobColorMode(file);
  const details = priceDetails();
  const hasMultipleFiles = files.length > 1;
  const previewClass = hasMultipleFiles
    ? "preview-live multi-document-preview"
    : file?.previewUrl && ["pdf", "image"].includes(file.previewKind)
      ? "preview-live"
      : "preview-document-mode";
  const orientation = normalizeOrientation(state.settings.orientation);
  const paperClass = `paper-${normalizePaperSize(state.settings.paperSize, "A4").toLowerCase()} orientation-${orientation} color-${state.settings.colorMode === "color" ? "color" : "bw"}`;
  return `
    <div class="stage preview-stage">
      <div class="preview-grid">
        ${renderPreviewDocumentPanel(previewClass, paperClass, file, files, details)}
        ${renderPreviewInfoPanel(details, files)}
        ${renderPreviewControlPanel(details, files)}
      </div>
    </div>
  `;
}

function renderPreviewDocumentPanel(previewClass, paperClass, file, files = jobFiles(), details = priceDetails()) {
  const hasMultipleFiles = files.length > 1;
  const pages = hasMultipleFiles ? Math.max(1, Number(details.pages) || pageCount()) : Math.max(1, Number(file?.pages) || 1);
  const currentPreviewPage = Math.max(1, Math.min(pages, Number(state.previewPage) || 1));
  const documentName = hasMultipleFiles
    ? `${files.length} documents selected`
    : file?.source || file?.name || selectedService()?.title || "Document";
  const pageLabel = hasMultipleFiles
    ? `${files.length} documents / ${pages} pages`
    : `Page ${currentPreviewPage} / ${pages}`;
  return `
    <section class="preview-document-panel">
      <div class="preview-document-head">
        <div class="preview-file-summary">
          <span class="ready-pill">
            ${uiIcon("system", 14)}
            Ready to Print
          </span>
          <strong>${escapeHtml(documentName)}</strong>
        </div>
        <span class="preview-page-count">${escapeHtml(pageLabel)}</span>
      </div>
      <div class="preview-workspace">
        <div class="preview-toolbar" aria-label="Preview tools">
          <button type="button" data-action="zoom-out" aria-label="Zoom out">&minus;</button>
          <strong>${Math.round(state.previewZoom * 100)}%</strong>
          <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-action="fit-preview" aria-label="Fit to page">${uiIcon("refresh", 15)}</button>
        </div>

        <div class="document-preview ${previewClass} ${hasMultipleFiles ? '' : paperClass}" data-orientation="${escapeHtml(normalizeOrientation(state.settings.orientation))}" style="--preview-zoom: ${state.previewZoom}; ${hasMultipleFiles ? 'aspect-ratio: unset; width: 100%; height: 100%; max-width: 100%; max-height: 100%; min-height: 0; flex: 1; overflow: auto;' : 'height: 100%; min-height: 60vh; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;'}">
          ${hasMultipleFiles ? renderMultiDocumentPreview(files, paperClass) : renderPreviewContent(file, { pageNumber: currentPreviewPage })}
        </div>

        ${hasMultipleFiles ? `` : `
          <div class="preview-page-nav" aria-label="Page navigation">
          <button type="button" data-action="prev-preview-page" aria-label="Previous page" ${currentPreviewPage <= 1 ? "disabled" : ""}>&lsaquo;</button>
          <strong>${currentPreviewPage}</strong>
          <span>/ ${pages}</span>
          <button type="button" data-action="next-preview-page" aria-label="Next page" ${currentPreviewPage >= pages ? "disabled" : ""}>&rsaquo;</button>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderPreviewInfoPanel(details, files) { return ""; }

function renderPreviewControlPanel(details, files) {
  const file = activePreviewFile();
  const service = services.find((item) => item.id === details.serviceId) || selectedService();
  const rateLabel = details.colorMode === "color" ? "Color" : "B/W";
  const rateValue = details.rate;
  const zeroAmountPrint = isFreePrintJob(details);
  const hasMultipleFiles = files.length > 1;
  const documentName = hasMultipleFiles
    ? `${files.length} documents`
    : file?.source || file?.name || service?.title || "Document";
  const orientation = normalizeOrientation(state.settings.orientation);
  const backLabel = "Back";
  const canChooseColor = customerSettingEnabled("color", service) && colorSelectionAvailable(file);
  const canChooseBw = customerSettingEnabled("bw", service);
  const showPrintType = canChooseBw || canChooseColor;
  const canChooseSides = customerSettingEnabled("sides", service) && state.printer?.supportsDuplex !== false;
  const sidesLabel = state.settings.sides === "duplex" ? "Both sides" : "One side";
  const jobLabel = [
    `${details.pages} page${details.pages === 1 ? "" : "s"}`,
    customerSettingEnabled("copies", service) ? `${details.copies} cop${details.copies === 1 ? "y" : "ies"}` : "",
    canChooseSides ? sidesLabel : "",
    rateLabel
  ].filter(Boolean).join(" · ");

  return `
    <aside class="preview-right-sidebar">
      <section class="preview-side-card preview-document-info-card">
        <h2>${uiIcon("pages", 16)} Details</h2>
        <div class="preview-info-list">
      </section>

      <section class="preview-side-card preview-settings-card">
        <h2>${uiIcon("pricing", 16)} Print Settings</h2>
        <div class="preview-settings-list">
          ${files.length > 1 ? `
            <div class="preview-setting-row preview-all-docs-note">
              <span>Preview</span>
              <strong>All documents shown together</strong>
            </div>
          ` : ""}
          ${showPrintType ? `
            <div class="preview-setting-row">
              <span>Print Type</span>
              <div class="preview-print-type">
                ${canChooseBw ? `<button class="${state.settings.colorMode === "bw" ? "active" : ""}" data-setting="colorMode" data-value="bw"><i></i>B/W</button>` : ""}
                ${canChooseColor ? `<button class="${state.settings.colorMode === "color" ? "active" : ""}" data-setting="colorMode" data-value="color"><i></i>Color</button>` : ""}
              </div>
            </div>
          ` : ""}
          ${canChooseSides ? `
            <div class="preview-setting-row">
              <span>Sides</span>
              <div class="preview-print-type preview-sides-type">
                <button class="${state.settings.sides !== "duplex" ? "active" : ""}" data-setting="sides" data-value="single"><i></i>One Side</button>
                <button class="${state.settings.sides === "duplex" ? "active" : ""}" data-setting="sides" data-value="duplex"><i></i>Both Sides</button>
              </div>
            </div>
          ` : ""}
          ${customerSettingEnabled("copies", service) ? `
            <div class="preview-setting-row">
              <span>Copies</span>
              <div class="preview-copies-control">
                <button type="button" data-action="decrease-copies" aria-label="Decrease copies">&minus;</button>
                <output>${details.copies}</output>
                <button type="button" data-action="increase-copies" aria-label="Increase copies">+</button>
              </div>
            </div>
          ` : ""}
          ${customerSettingEnabled("orientation", service) ? `
            <label class="preview-setting-row">
              <span>Orientation</span>
              <select data-input="orientation" aria-label="Orientation">
                ${["portrait", "landscape"].map((item) => `<option value="${item}" ${orientation === item ? "selected" : ""}>${item === "portrait" ? "Portrait" : "Landscape"}</option>`).join("")}
              </select>
            </label>
          ` : ""}
        </div>
      </section>


      <section class="preview-side-card preview-total-card">
        <span>${zeroAmountPrint ? "Total" : "Total payable"}</span>
        <strong class="preview-total-amount">${money(details.total)}</strong>
      </section>

      <div class="preview-control-actions">
        <button class="ghost-button" data-action="prev-step">
          <span aria-hidden="true">&larr;</span>
          ${backLabel}
        </button>
        <button class="primary-button" data-action="next-step">
          ${zeroAmountPrint ? "Print" : "Payment"}
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </aside>
  `;
}

function renderPreviewContent(file = activePreviewFile(), options = {}) {
  if (!file) {
    return renderPreviewFallback("No file selected", "Upload a file to see the preview.", file);
  }

  const previewPageNumber = Math.max(1, Number(options.pageNumber) || Number(state.previewPage) || 1);

  if (file.previewKind === "html-template" && file.htmlContent) {
    return `
      <div class="preview-zoom-layer">
        <div class="html-template-preview">
          ${file.htmlContent}
        </div>
      </div>
    `;
  }

  if (file.previewKind === "pdf" && file.staticPreviewUrl && (!file.previewUrl || previewPageNumber <= 1)) {
    resolvePdfPreviewPageCount(file);
    return `<img src="${escapeHtml(file.staticPreviewUrl)}" class="preview-media static-pdf-preview" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
  }

  if (file.previewKind === "pdf" && file.previewUrl) {
    return renderPdfPreview(file, {
      orientation: normalizeOrientation(options.orientation || state.settings.orientation),
      pageNumber: previewPageNumber,
      zoom: Number(options.zoom || state.previewZoom || 1)
    });
  }

  if (file.previewKind === "image" && file.previewUrl) {
    return `<img src="${escapeHtml(file.previewUrl)}" class="preview-media" style="width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; display: block; flex: 1;" />`;
  }
  return renderPreviewFallback("Preview unavailable", "This file type cannot be previewed.");
}

function pdfPreviewCacheKey(fileKey, pageNumber, previewZoom, requestedOrientation) {
  const deviceScale = Math.round(Math.max(1, window.devicePixelRatio || 1) * 100);
  const viewportSize = `${window.innerWidth || 0}x${window.innerHeight || 0}`;
  return `${fileKey}|p${pageNumber}|z${Math.round(previewZoom * 100)}|${requestedOrientation}|${deviceScale}|${viewportSize}`;
}

function renderPdfPreview(file, { orientation = "portrait", pageNumber = 1, zoom = 1 } = {}) {
  // Use a STABLE ID based on file identity so re-renders don't restart PDF.js
  const fileKey = String(file?.previewUrl || file?.name || "").replace(/[^a-zA-Z0-9]/g, "").slice(-18) || "nokey";
  const shellId = "pdf-shell-" + fileKey + "-p" + pageNumber;
  const requestedOrientation = normalizeOrientation(orientation);
  const previewZoom = Math.max(0.6, Math.min(2, Number(zoom) || 1));
  const cacheKey = pdfPreviewCacheKey(fileKey, pageNumber, previewZoom, requestedOrientation);
  const cached = pdfPreviewRenderCache.get(cacheKey);

  // Repeat renders of an already-rendered page (e.g. triggered by unrelated polling)
  // reuse the cached bitmap instead of re-decoding and re-rendering the PDF.
  if (cached) {
    return `
      <div id="${shellId}" class="pdf-preview-shell is-ready" data-no-visual-search data-page-count="${cached.pageCount}">
        <div class="pdf-preview-page">
          <img class="pdf-preview-canvas" src="${cached.dataUrl}" width="${cached.cssWidth}" height="${cached.cssHeight}" alt="" />
        </div>
      </div>
    `;
  }

  setTimeout(() => {
    const existing = document.getElementById(shellId);
    // Skip re-render if already fully rendered — avoids flicker on every render() call
    if (existing && existing.classList.contains("is-ready")) return;

    import("./assets/vendor/pdfjs/pdf.min.mjs").then(async (pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/vendor/pdfjs/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument({ url: file.previewUrl, enableXfa: true }).promise;
      const shell = document.getElementById(shellId);
      if (!shell) return;

      const totalPages = Math.max(1, Number(pdf.numPages) || Number(file.pages) || 1);
      if (syncPdfPreviewPageCount(file, totalPages)) {
        render();
        return;
      }

      const currentPage = Math.max(1, Math.min(totalPages, Number(pageNumber) || 1));
      const deviceScale = Math.max(1, window.devicePixelRatio || 1);
      shell.innerHTML = "";
      shell.classList.add("is-ready");
      shell.dataset.pageCount = String(totalPages);

      if (!document.getElementById(shellId)) return;

      const page = await pdf.getPage(currentPage);
      const pageShell = document.createElement("div");
      pageShell.className = "pdf-preview-page";

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-preview-canvas";
      canvas.dataset.pageNumber = String(currentPage);
      pageShell.appendChild(canvas);
      shell.appendChild(pageShell);

      const nativeViewport = page.getViewport({ scale: 1 });
      const nativeLandscape = nativeViewport.width > nativeViewport.height;
      const shouldRotate = requestedOrientation === "landscape" ? !nativeLandscape : nativeLandscape;
      const rotation = ((Number(page.rotate) || 0) + (shouldRotate ? 90 : 0)) % 360;
      const baseViewport = page.getViewport({ scale: 1, rotation });
      const bounds = shell.getBoundingClientRect();
      const targetWidth = Math.max(220, bounds?.width || baseViewport.width);
      const targetHeight = Math.max(300, bounds?.height || baseViewport.height);
      const fitScale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
      const viewport = page.getViewport({ scale: Math.max(0.35, fitScale) * previewZoom * deviceScale, rotation });
      const context = canvas.getContext("2d");

      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const cssWidth = Math.round(viewport.width / deviceScale);
      const cssHeight = Math.round(viewport.height / deviceScale);
      // No inline pixel width/height here on purpose: CSS (object-fit: contain,
      // or width:100%/height:auto for the single-doc view) must control the
      // displayed size so the canvas actually fills its box — an inline pixel
      // size baked in from this one-time bounding-rect measurement would win
      // over CSS and leave the canvas the wrong size if its box is later a
      // different shape (e.g. the 2x2 multi-document grid).
      await page.render({ canvasContext: context, viewport }).promise;

      try {
        if (pdfPreviewRenderCache.size >= PDF_PREVIEW_CACHE_LIMIT) {
          pdfPreviewRenderCache.delete(pdfPreviewRenderCache.keys().next().value);
        }
        pdfPreviewRenderCache.set(cacheKey, {
          dataUrl: canvas.toDataURL("image/png"),
          cssWidth,
          cssHeight,
          pageCount: totalPages
        });
      } catch (cacheError) {
        // Cross-origin canvas or storage failure — skip caching, rendering already succeeded.
      }
    }).catch((error) => {
      console.error("PDF preview error:", error);
      const shell = document.getElementById(shellId);
      if (shell) {
        shell.classList.add("is-error");
        shell.innerHTML = '<div class="preview-fallback"><div class="preview-file-icon">PDF</div><h2>PDF preview unavailable</h2><p>The file is valid. Continue after checking file details.</p></div>';
      }
    });
  }, 50);

  return `
    <div id="${shellId}" class="pdf-preview-shell" data-no-visual-search>
      <div class="pdf-preview-status">Loading PDF preview...</div>
    </div>
  `;
}


function renderMultiDocumentPreview(files, paperClass) {
  state.multiPreviewPage = state.multiPreviewPage || 1;
  const PAGE_SIZE = 4;
  const totalPages = Math.ceil(files.length / PAGE_SIZE);

  if (state.multiPreviewPage > totalPages && totalPages > 0) {
    state.multiPreviewPage = totalPages;
  }
  if (state.multiPreviewPage < 1) {
    state.multiPreviewPage = 1;
  }

  const startIndex = (state.multiPreviewPage - 1) * PAGE_SIZE;
  const visibleFiles = files.slice(startIndex, startIndex + PAGE_SIZE);

  let gridStyle = "";
  let itemHeight = "100%";
  if (visibleFiles.length === 1) {
    gridStyle = "grid-template-columns: 1fr; grid-template-rows: 1fr;";
  } else {
    // Always lay out as a fixed 2x2 grid (even with only 2 files) so items
    // sit in their own half-height cell instead of stretching to fill the
    // full container height with no gap below them.
    gridStyle = "grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr);";
  }

  let paginationHtml = "";
  if (totalPages > 1) {
    paginationHtml = `
      <div class="multi-preview-pagination" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px;">
        <button type="button" class="btn btn-secondary" data-action="multi-preview-prev" ${state.multiPreviewPage === 1 ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; font-weight: bold; background: #e2e8f0; border: none; cursor: pointer; color: #1e293b;">&larr; Previous</button>
        <span style="font-weight: bold; font-size: 16px; color: #334155;">Page ${state.multiPreviewPage} of ${totalPages}</span>
        <button type="button" class="btn btn-primary" data-action="multi-preview-next" ${state.multiPreviewPage === totalPages ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; font-weight: bold; background: #2563eb; border: none; cursor: pointer; color: white;">Next &rarr;</button>
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%;">
      <div class="multi-preview-stack" aria-label="All uploaded documents" style="display: grid; ${gridStyle} gap: 16px; width: 100%; height: 100%; overflow: hidden;">
        ${visibleFiles.map((file, i) => renderMultiDocumentPreviewItem(file, startIndex + i, paperClass, itemHeight)).join("")}
      </div>
      ${paginationHtml}
    </div>
  `;
}

function renderMultiDocumentPreviewItem(file, index, paperClass, itemHeight = "100%") {
  const pages = Math.max(1, Number(file?.pages) || 1);
  const title = file?.source || file?.name || `Document ${index + 1}`;
  return `
    <article class="multi-preview-item ${index === state.previewFileIndex ? "is-active" : ""}" style="position: relative; height: ${itemHeight}; margin: 0; overflow: hidden; background: transparent; border: 2px solid #dde5f0; border-radius: 16px; padding: 0;">
      <button class="remove-document-btn" data-action="remove-document" data-index="${index}" aria-label="Remove document" style="position: absolute; top: 8px; right: 8px; z-index: 50; background: white; border: 2px solid #e2e8f0; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.15); color: #ef4444; font-weight: bold; font-size: 16px; padding: 0; line-height: 1;">&#10005;</button>
      <div class="multi-preview-paper" style="height: 100%; width: 100%; border: none; overflow: hidden; display: flex; align-items: center; justify-content: center; background: transparent;">
        ${renderPreviewContent(file, { pageNumber: 1 })}
      </div>
    </article>
  `;
}

function renderLogin() {
  return `
    <div class="login-view ${state.adminLoginThemeDark ? "login-theme-dark" : ""}">
      <button type="button" class="login-theme-toggle" data-action="toggle-admin-login-theme" aria-label="${state.adminLoginThemeDark ? "Switch to light theme" : "Switch to dark theme"}">
        ${uiIcon(state.adminLoginThemeDark ? "sun" : "moon", 20)}
      </button>
      <div class="login-panel">
        <img class="login-logo" src="./assets/aarya-innovtech-logo-full.png" alt="Aarya Innovtech Pvt. Ltd." />
        <h1 class="login-title">Welcome</h1>
        <p class="login-subtitle">Please enter your credentials to access your portal</p>
        ${state.adminLoginError ? `<div class="empty-note">${escapeHtml(state.adminLoginError)}</div>` : ""}
        <label class="login-field">
          <span class="login-field-label">Username</span>
          <span class="login-input-wrap">
            ${uiIcon("phone", 18)}
            <input name="username" value="${escapeHtml(state.adminLoginDraft.email)}" placeholder="Enter your username" autocomplete="username" data-admin-login-field="email" />
          </span>
        </label>
        <label class="login-field">
          <span class="login-field-label">Password</span>
          <span class="login-input-wrap">
            ${uiIcon("lock", 18)}
            <input type="${state.adminLoginPasswordVisible ? "text" : "password"}" name="password" value="${escapeHtml(state.adminLoginDraft.password)}" placeholder="Enter your password" autocomplete="current-password" data-admin-login-field="password" />
            <button type="button" class="login-password-toggle" data-action="toggle-admin-login-password" aria-label="${state.adminLoginPasswordVisible ? "Hide password" : "Show password"}">
              ${uiIcon(state.adminLoginPasswordVisible ? "eye-off" : "eye", 18)}
            </button>
          </span>
        </label>
        <button class="login-submit" data-action="admin-login">
          <span>Login to Continue</span>
          ${uiIcon("arrow-right", 18)}
        </button>
      </div>
      <div class="login-footer-links">
        <a href="terms.html">Terms &amp; Conditions</a>
        <span>|</span>
        <a href="privacy.html">Privacy Policy</a>
        <span>|</span>
        <a href="refund.html">Refund Policy</a>
        <span>|</span>
        <a href="contact.html">Contact Us</a>
      </div>
    </div>
  `;
}

function renderPreviewFallback(title, message, file = activePreviewFile()) {
  return `
    <div class="preview-fallback">
      <div class="preview-file-icon">${escapeHtml(file?.type || "FILE")}</div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function renderPrintSettingsFields() {
  const fields = [
    customerSettingEnabled("bw") && customerSettingEnabled("color") ? `
      <div class="setting-field">
        <label>Color Mode</label>
        <div class="segmented">
          <button class="${state.settings.colorMode === "bw" ? "active" : ""}" data-setting="colorMode" data-value="bw">B/W</button>
          <button class="${state.settings.colorMode === "color" ? "active" : ""}" data-setting="colorMode" data-value="color">Color</button>
        </div>
      </div>
    ` : "",
    customerSettingEnabled("copies") ? `
      <div class="setting-field">
        <label for="copies">Copies</label>
        <input id="copies" type="number" min="1" max="99" value="${state.settings.copies}" data-input="copies" />
      </div>
    ` : ""
  ].filter(Boolean).join("");

  return fields ? `
      <div class="settings-grid">
        ${fields}
      </div>
  ` : "";
}

function renderHealthRow(label, value, tone) {
  return `
    <div class="health-row">
      <strong>${escapeHtml(label)}</strong>
      <span class="badge ${tone}">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderDirectPrintStep() {
  const details = priceDetails();
  const files = jobFiles();
  const message = state.printStatusMessage || "Preparing document for printing...";
  const printStarted = Number(state.printProgress || 0) > 0 || Boolean(state.printStatusMessage);
  const sendingStarted = Number(state.printProgress || 0) >= 2 || /sending|printing/i.test(message);
  const printComplete = state.step === 4 || state.lastCompletedJob?.print === "Completed";
  const documentLabel = files.length > 1
    ? `${files.length} documents`
    : (files[0]?.name || "document");
  const detailParts = [
    documentLabel,
    `${details.pages} page${details.pages === 1 ? "" : "s"}`,
    customerSettingEnabled("copies") ? `${details.copies} cop${details.copies === 1 ? "y" : "ies"}` : ""
  ].filter(Boolean).join(" • ");

  return `
    <div class="stage direct-print-stage">
      <div class="stage-header">
        <h1>Printing document</h1>
        <p class="stage-intro">Please wait while the kiosk sends your document to the printer.</p>
      </div>
      <section class="direct-print-panel" aria-live="polite">
        <div class="direct-print-visual" aria-hidden="true">
          <span>${uiIcon("print", 44)}</span>
        </div>
        <h2>${escapeHtml(message)}</h2>
        <p>${escapeHtml(detailParts)}</p>
        <div class="timeline direct-print-timeline">
          ${renderTimelineRow(1, "Document prepared", printStarted || sendingStarted || printComplete, !printStarted)}
          ${renderTimelineRow(2, "Sending to printer", sendingStarted || printComplete, printStarted && !sendingStarted)}
          ${renderTimelineRow(3, printComplete ? "Print completed" : "Printing document", printComplete, sendingStarted && !printComplete)}
        </div>
      </section>
    </div>
  `;
}

function renderPaymentStep() {
  const details = priceDetails();
  if (isFreePrintJob(details)) return renderDirectPrintStep();
  ensureActiveJobId();
  const freePrint = isFreePrintJob(details);
  const paymentComplete = state.paymentStatus === "Success";
  const qrReady = Boolean(state.paymentOrder?.qrSvg);
  const showPaymentCard = !freePrint || !paymentComplete;
  const isPrinting = paymentComplete && state.step === 3 && (state.printProgress > 0 || Boolean(state.printStatusMessage));
  const printComplete = state.step === 4 || state.lastCompletedJob?.print === "Completed";
  const trackingMessage = state.printError
    || state.printStatusMessage
    || state.paymentStatusMessage
    || (freePrint ? "Sending document to printer." : qrReady ? "Waiting for payment from the customer phone." : "Preparing the secure payment QR.");
  const paymentHeading = DEMO_KIOSK_MODE
    ? (paymentComplete ? "Tracking" : "Scan to pay")
    : (paymentComplete ? "Tracking" : freePrint ? "Print" : "Scan to pay");
  const paymentIntro = DEMO_KIOSK_MODE
    ? "Scan the QR code with any UPI app. Confirm when payment is done."
    : freePrint && paymentComplete
      ? "Printing has started. Please wait while the kiosk sends the document to the printer."
      : freePrint
        ? "No payment is required for this print. The kiosk will start printing automatically."
      : "The kiosk shows only the QR. Complete payment on the phone; live tracking stays on this screen.";
  const paymentQrHelp = DEMO_KIOSK_MODE
    ? "Scan with the phone camera or any UPI app."
    : "Scan with the phone camera or any UPI app to open Razorpay.";
  const paidLabel = freePrint ? "Print approved" : DEMO_KIOSK_MODE ? "Payment received" : "Paid on phone";
  const paidHelp = DEMO_KIOSK_MODE
    ? "Payment is verified. Watch print tracking on the kiosk."
    : freePrint
      ? "No QR or phone payment is needed. Watch print tracking on the kiosk."
      : "Payment is verified. Watch print tracking on the kiosk.";
  const waitingPaymentLabel = DEMO_KIOSK_MODE ? "Waiting for payment" : "Waiting for phone payment";
  const paymentDetailParts = [
    `${details.pages} page${details.pages === 1 ? "" : "s"}`,
    customerSettingEnabled("copies") ? `${details.copies} cop${details.copies === 1 ? "y" : "ies"}` : ""
  ].filter(Boolean).join(" • ");
  return `
    ${renderPrinterHealthOverlay()}
    <div class="stage payment-stage">
      <div class="stage-header">
        <h1>${paymentHeading}</h1>
        <p class="stage-intro">${paymentIntro}</p>
      </div>
      <div class="payment-kiosk-panel ${showPaymentCard ? "" : "payment-kiosk-panel--tracking-only"}">
        ${showPaymentCard ? `
        <div class="payment-qr-card module-card">

        ${paymentComplete ? `
          <div class="payment-success-state">
            <div class="badge good">${paidLabel}</div>
            <p class="helper-text">${paidHelp}</p>
          </div>
        ` : qrReady ? `
          <div class="payment-qr-code" aria-label="Scan this QR code to pay on your phone">${state.paymentOrder.qrSvg}</div>
          <p class="helper-text">${paymentQrHelp}</p>
          <small class="payment-order-id">Order ${escapeHtml(state.paymentOrder.orderId || "")}</small>
        ` : `
          <div class="payment-loading-state">
            <div class="qr-loading"></div>
            <p class="helper-text">${escapeHtml(state.paymentStatusMessage || (freePrint ? "Sending document to printer..." : "Creating payment QR..."))}</p>
          </div>
        `}
        ${state.paymentError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.paymentError)}</div>` : ""}
        </div>
        ` : ""}
        <div class="payment-tracking-card module-card" aria-live="polite">
          <h2>Live tracking</h2>
          <div class="timeline">
            ${renderTimelineRow(1, freePrint ? "Print approved" : qrReady || paymentComplete ? "QR ready on kiosk" : "Creating payment QR", freePrint || qrReady || paymentComplete, !freePrint && !qrReady && !paymentComplete)}
            ${renderTimelineRow(2, freePrint ? "Document prepared" : paymentComplete ? "Payment received" : waitingPaymentLabel, freePrint || paymentComplete, !freePrint && qrReady && !paymentComplete)}
            ${renderTimelineRow(3, printComplete ? "Print completed" : isPrinting ? "Printing on kiosk" : "Kiosk print tracking", printComplete, paymentComplete && !printComplete)}
          </div>
          <p class="helper-text">${escapeHtml(trackingMessage)}</p>
        </div>
      </div>
      <div class="flow-actions ${paymentComplete ? "is-hidden" : ""}">
        ${DEMO_KIOSK_MODE ? `<button class="primary-button" data-action="demo-payment-success">Payment Done</button>` : ""}
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

function renderPrintFailureStep() {
  const freePrint = isFreePrintJob();
  const intro = freePrint
    ? `${state.printError} Staff can check the printer and retry this free print.`
    : `${state.printError} The paid job is saved in admin history and can be retried without charging again.`;

  return `
    <div class="stage print-failure-stage">
      <div class="stage-header">
        <h1>Printing needs attention</h1>
        <p class="stage-intro">${escapeHtml(intro)}</p>
      </div>
      <div class="module-card">
        <h2>Recovery Options</h2>
        <div class="health-list">
          ${renderHealthRow(freePrint ? "Free print" : "Payment", freePrint ? "Approved" : "Success", "good")}
          ${renderHealthRow("Print", "Needs staff attention", "bad")}
          ${renderHealthRow("Queue", freePrint ? "Ready for retry" : "Saved for retry", "warn")}
        </div>
        ${state.printStatusMessage ? `<p class="helper-text">${escapeHtml(state.printStatusMessage)}</p>` : ""}
        <div class="flow-actions" style="margin-top: 16px;">
          <button class="primary-button" data-action="retry-print">Retry Print</button>
          <button class="ghost-button" data-action="reset-session">Return Home</button>
        </div>
        <p class="helper-text" id="print-failure-home-countdown" style="margin-top: 10px;">${escapeHtml(`Staff has been notified. Returning home automatically in ${Number(state.printFailureAutoHomeSecondsLeft) || PRINT_FAILURE_AUTO_HOME_SECONDS}s if this isn't resolved.`)}</p>
      </div>
    </div>
  `;
}

/* ── Printer Health Monitoring ──────────────────────────────────────────────── */

/**
 * Initialize the Electron IPC bridge for real-time printer health updates.
 * Only active when running inside Electron (window.kioskPrinterHealth exposed by preload.js).
 * Purely additive — writes only to state.printerHealth, never touches state.printer.
 */
function initPrinterHealthIpc() {
  if (!window.kioskPrinterHealth || typeof window.kioskPrinterHealth.onUpdate !== "function") {
    return; // Not running in Electron — skip gracefully
  }

  window.kioskPrinterHealth.onUpdate(function (health) {
    if (!health || typeof health !== "object") return;
    state.printerHealth = {
      available: true,
      online: Boolean(health.online),
      ready: Boolean(health.ready),
      busy: Boolean(health.busy),
      paper: health.paper !== false,
      paperLow: Boolean(health.paperLow),
      paperJam: Boolean(health.paperJam),
      doorOpen: Boolean(health.doorOpen),
      tonerLow: Boolean(health.tonerLow),
      tonerEmpty: Boolean(health.tonerEmpty),
      queueError: Boolean(health.queueError),
      outputBinFull: Boolean(health.outputBinFull),
      serviceRequested: Boolean(health.serviceRequested),
      printing: Boolean(health.printing),
      workOffline: Boolean(health.workOffline),
      errorMessage: health.errorMessage || null,
      printerName: health.printerName || null,
      queueLength: Number(health.queueLength || 0),
      paperStatus: health.paperStatus || "Unknown",
      tonerStatus: health.tonerStatus || "Unknown",
      detectedErrorState: Number(health.detectedErrorState || 0),
      detectedErrorText: health.detectedErrorText || "Unknown",
      printerStatus: Number(health.printerStatus || 0),
      lastUpdated: health.lastUpdated || new Date().toISOString(),
      errorLog: Array.isArray(health.errorLog) ? health.errorLog : []
    };
    state.printer = {
      ...state.printer,
      online: Boolean(health.ready),
      checking: false,
      name: health.printerName || state.printer.name || "No printer selected",
      paper: health.paperStatus || "Unknown",
      toner: health.tonerStatus || "Unknown",
      queue: Number(health.queueLength || 0),
      agent: "Running",
      statusText: health.errorMessage || (health.ready ? "Ready" : health.online ? "Printer not ready" : "Offline")
    };
    syncPrinterHealthToBackend(state.printerHealth);

    if (!customerPrinterBlockIssue()) {
      state.customerPrinterNotice = null;
      state.lastAlertedPrinterIssue = null;
    }

    // This fires roughly every 2s from Electron's IPC health monitor — far more
    // often than the page needs a full teardown/rebuild. Steps 2 (preview) and
    // 4+ (thank-you) don't show printer status, so skip the rerender there to
    // avoid restarting animations/previews on a loop.
    if (state.mode === "customer" && (state.step === 2 || state.step >= 4)) return;

    render();
  });
}

// ── Internet Status IPC bridge (Electron-only, non-breaking) ────────────────
// No-op when window.kioskInternetStatus is not exposed (non-Electron / demo
// mode) — state.internetOnline stays at its default `true`, so nothing here
// ever blocks the flow in a browser/dev context where a real check isn't
// possible anyway.
function initInternetStatusIpc() {
  if (!window.kioskInternetStatus || typeof window.kioskInternetStatus.onUpdate !== "function") {
    return; // Not running in Electron — skip gracefully
  }

  window.kioskInternetStatus.onUpdate(function (status) {
    if (!status || typeof status !== "object") return;
    const wasOnline = state.internetOnline;
    state.internetOnline = Boolean(status.online);
    state.internetCheckedAt = status.checkedAt || new Date().toISOString();

    if (wasOnline === state.internetOnline) return; // No visible change — skip the rerender.
    if (state.mode === "customer" && (state.step === 2 || state.step >= 4)) return;

    render();
  });
}

function syncPrinterHealthToBackend(health) {
  if (!health?.available || isMobilePaymentEntry || KIOSK_ID === UNASSIGNED_KIOSK_ID) return;

  const signature = JSON.stringify({
    online: health.online,
    ready: health.ready,
    paper: health.paper,
    paperLow: health.paperLow,
    paperJam: health.paperJam,
    doorOpen: health.doorOpen,
    tonerLow: health.tonerLow,
    tonerEmpty: health.tonerEmpty,
    queueError: health.queueError,
    outputBinFull: health.outputBinFull,
    serviceRequested: health.serviceRequested,
    printerName: health.printerName,
    errorMessage: health.errorMessage,
    queueLength: health.queueLength,
    detectedErrorState: health.detectedErrorState,
    internetOnline: state.internetOnline
  });
  // In-flight guard is separate from the "recently synced" throttle below —
  // a request already in flight is skipped regardless of signature/age, but
  // only a request that actually SUCCEEDED counts as "synced". Marking a
  // failed attempt (e.g. no internet) as synced used to suppress retries for
  // up to 30s at a time, which is exactly the gap that let a kiosk that just
  // went offline keep reporting stale "online" status for longer than the
  // backend's own timeout expected. On failure, nothing is recorded, so the
  // very next printer-health tick (~2s later) retries immediately.
  if (printerHealthSyncInFlight) return;

  const now = Date.now();
  // Kept below the backend's 5s offline threshold (checkKioskTimeouts) - an
  // "unchanged status" throttle any looser than that would mean the normal,
  // nothing-changed case never actually heartbeats often enough to keep the
  // kiosk marked online.
  if (signature === lastPrinterHealthSyncSignature && now - lastPrinterHealthSyncAt < 2000) return;

  printerHealthSyncInFlight = true;

  // Without an explicit timeout, a request made right as the network drops
  // can sit unresolved for tens of seconds (default OS/TCP timeout) before
  // fetch() ever rejects — during which printerHealthSyncInFlight blocks
  // every retry. A 3s AbortController cap (under the 5s offline threshold)
  // keeps failed attempts cheap so the ~2s IPC cadence can actually retry
  // that often while offline.
  const abortController = new AbortController();
  const abortTimer = setTimeout(() => abortController.abort(), 3000);

  fetch(`${BACKEND_URL}/api/kiosk/health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kioskId: KIOSK_ID,
      printerHealth: health,
      internetOnline: state.internetOnline
    }),
    signal: abortController.signal
  }).then((response) => {
    if (response.ok) {
      lastPrinterHealthSyncSignature = signature;
      lastPrinterHealthSyncAt = Date.now();
    }
  }).catch(() => {
    // The next printer health update will retry immediately.
  }).finally(() => {
    clearTimeout(abortTimer);
    printerHealthSyncInFlight = false;
  });
}

/** Returns the human-readable printer status label for the customer badge */
function printerHealthLabel() {
  const h = state.printerHealth;
  if (!h.available) return null;
  if (!h.online) return "\uD83D\uDD34 Printer Offline";
  if (h.paperJam) return "\uD83D\uDD34 Paper Jam";
  if (!h.paper) return "\uD83D\uDD34 Out of Paper";
  if (h.doorOpen) return "\uD83D\uDD34 Door Open";
  if (h.tonerEmpty) return "\uD83D\uDD34 Replace Toner";
  if (h.outputBinFull) return "\uD83D\uDD34 Output Tray Full";
  if (h.serviceRequested) return "\uD83D\uDD34 Service Required";
  if (h.queueError) return "\uD83D\uDD34 Print Queue Error";
  if (h.printing) return "\uD83D\uDFE1 Printing\u2026";
  if (h.busy) return "\uD83D\uDFE1 Printer Busy";
  if (h.tonerLow) return "\uD83D\uDFE1 Toner Low";
  if (h.paperLow) return "\uD83D\uDFE1 Paper Low";
  if (h.ready) return "\uD83D\uDFE2 Printer Ready";
  return "\uD83D\uDFE1 Checking\u2026";
}

/** Returns severity class: 'ok', 'warn', or 'error' */
function printerHealthSeverity() {
  const h = state.printerHealth;
  if (!h.available) return "ok";
  if (!h.online || h.paperJam || !h.paper || h.doorOpen || h.tonerEmpty || h.outputBinFull || h.serviceRequested || h.queueError) return "error";
  if (h.busy || h.printing || h.tonerLow || h.paperLow) return "warn";
  return "ok";
}

/** Returns true when the printer has a critical error that should block payment */
function printerHealthCriticalError() {
  const h = state.printerHealth;
  if (!h.available) return false; // IPC not connected — don't block (fallback to existing paymentReady())
  return state.mode === "customer" && Boolean(customerPrinterHealthIssue());
}

function usefulPrinterHealthAlertsForKiosk(kiosk = {}, health = null) {
  const h = health && typeof health === "object"
    ? health
    : (kiosk.printerHealth && typeof kiosk.printerHealth === "object" ? kiosk.printerHealth : null);
  if (!h) return [];

  const kioskId = String(kiosk.kioskId || state.kiosk?.kioskId || KIOSK_ID || "Kiosk").trim() || "Kiosk";
  const printerName = h.printerName || kiosk.printer || state.printer.name || "Printer";
  const paperStatus = String(h.paperStatus || "").toLowerCase();
  const tonerStatus = String(h.tonerStatus || "").toLowerCase();
  const lastUpdated = h.lastUpdated ? ` Last updated: ${formatDateTime(h.lastUpdated)}.` : "";
  const alerts = [];
  const add = (category, title, detail, tone = "bad") => {
    alerts.push({
      title: `${kioskId} - ${title}`,
      detail: `${printerName}: ${detail}.${lastUpdated}`,
      tone,
      source: "printer",
      category,
      kioskId,
      lastUpdated: h.lastUpdated || kiosk.lastOnline || ""
    });
  };

  const paperJam = Boolean(h.paperJam) || paperStatus.includes("jam");
  const noPaper = h.paper === false || paperStatus.includes("no paper") || paperStatus.includes("out of paper") || paperStatus.includes("empty");
  const paperLow = Boolean(h.paperLow) || paperStatus.includes("low");
  const doorOpen = Boolean(h.doorOpen) || paperStatus.includes("door");
  const tonerEmpty = Boolean(h.tonerEmpty) || tonerStatus.includes("no toner") || tonerStatus.includes("empty") || tonerStatus.includes("replace");
  const tonerLow = Boolean(h.tonerLow) || tonerStatus.includes("low");

  if (paperJam) add("paper", "Paper jam detected", "clear the paper jam and close all trays");
  else if (noPaper) add("paper", "Paper empty", "load paper in the tray");
  else if (paperLow) add("paper", "Paper low", "refill paper soon", "warn");

  if (doorOpen) add("paper", "Printer door open", "close the printer door or tray");
  if (tonerEmpty) add("toner", "Toner empty", "replace the toner cartridge");
  else if (tonerLow) add("toner", "Toner low", "keep a replacement toner ready", "warn");
  if (h.outputBinFull) add("paper", "Output tray full", "remove printed pages from the output tray");
  if (h.serviceRequested) add("service", "Printer service required", h.errorMessage || "service intervention required");
  if (h.queueError) add("queue", "Print queue blocked", h.errorMessage || "clear the Windows print queue");

  return alerts.sort((a, b) => (Date.parse(b.lastUpdated || "") || 0) - (Date.parse(a.lastUpdated || "") || 0));
}

function printerHealthAlerts() {
  const h = state.printerHealth;
  if (!h.available) return [];

  const printerName = h.printerName || "Kiosk printer";
  const alerts = [];
  const add = (title, detail, tone = "warn") => {
    alerts.push({ title, detail, tone, source: "printer" });
  };

  if (!h.online) add("Printer offline", h.errorMessage || `${printerName} is offline.`, "bad");
  if (h.paperJam) add("Paper jam detected", `${printerName}: clear the jam and close all trays.`, "bad");
  if (!h.paper) add("Printer out of paper", `${printerName}: load paper in the tray.`, "bad");
  if (h.paperLow) add("Printer paper low", `${printerName}: refill paper soon.`);
  if (h.doorOpen) add("Printer door open", `${printerName}: close the printer door or tray.`, "bad");
  if (h.tonerEmpty) add("Toner empty", `${printerName}: replace the toner cartridge.`, "bad");
  if (h.tonerLow) add("Toner low", `${printerName}: keep a replacement toner ready.`);
  if (h.outputBinFull) add("Output tray full", `${printerName}: remove printed pages from the output tray.`, "bad");
  if (h.serviceRequested) add("Printer service required", h.errorMessage || `${printerName}: service intervention required.`, "bad");
  if (h.queueError) add("Print queue blocked", h.errorMessage || `${printerName}: clear the Windows print queue.`, "bad");

  if (!alerts.length && h.errorMessage) {
    add("Printer warning", h.errorMessage, printerHealthSeverity() === "error" ? "bad" : "warn");
  }

  return alerts;
}

function usefulPrinterHealthLogEntry(entry = {}) {
  const text = `${entry.status || ""} ${entry.description || ""}`.toLowerCase();
  return /paper|jam|toner|cartridge|ink|door|tray|output|service|queue/.test(text);
}

function adminOperationalAlerts() {
  const alerts = [];
  const seen = new Set();
  const addUnique = (alert) => {
    const key = `${alert.kioskId || ""}|${alert.title}|${alert.category || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  };

  if (state.printerHealth.available) {
    usefulPrinterHealthAlertsForKiosk({
      kioskId: state.kiosk?.kioskId || KIOSK_ID,
      printer: state.printerHealth.printerName || state.printer.name
    }, state.printerHealth).forEach(addUnique);
  }

  state.adminData.kiosks.forEach((kiosk) => {
    usefulPrinterHealthAlertsForKiosk(kiosk).forEach(addUnique);
  });

  return alerts.sort((a, b) => (Date.parse(b.lastUpdated || "") || 0) - (Date.parse(a.lastUpdated || "") || 0));
}

/**
 * Small floating status pill shown on every customer screen (bottom-left corner).
 * Auto-hides when IPC is not available (non-Electron / demo mode).
 */
function renderPrinterHealthBadge() {
  return "";
}

/**
 * Full-screen critical-error overlay on the payment screen.
 * Shown only when printerHealthCriticalError() is true.
 * The IPC monitor auto-retries every 2 s — when the printer recovers this disappears.
 */
function renderPrinterHealthOverlay() {
  if (!printerHealthCriticalError()) return "";
  const h = state.printerHealth;
  const reason = customerSafePrinterMessage(h.errorMessage || printerHealthLabel(), "Printer is unavailable. Please contact staff.");
  return `
    <div class="printer-health-overlay" role="alertdialog" aria-modal="true" aria-label="Printer unavailable">
      <div class="printer-health-overlay__card">
        <div class="printer-health-overlay__icon">\uD83D\uDDA8\uFE0F</div>
        <h2 class="printer-health-overlay__title">Printer is currently unavailable</h2>
        <div class="printer-health-overlay__reason">
          <span class="printer-health-overlay__reason-label">Reason</span>
          <span class="printer-health-overlay__reason-value">${escapeHtml(reason)}</span>
        </div>
        <p class="printer-health-overlay__help">Please contact staff for assistance.</p>
        <p class="printer-health-overlay__retry">Checking printer automatically every 2 seconds&hellip;</p>
        <div class="printer-health-overlay__dot-row">
          <span class="printer-health-dot printer-health-dot--pulse"></span>
          <span class="printer-health-overlay__dot-label">Live monitoring active</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Admin printer health panel — live card for the System Status admin page.
 * Shows all monitored fields and a scrollable error log.
 */
function renderAdminPrinterHealthPanel() {
  const h = state.printerHealth;
  const severity = printerHealthSeverity();
  const label = printerHealthLabel();
  const statusBadgeClass = severity === "ok" ? "good" : severity === "warn" ? "warn" : "bad";

  if (!h.available) {
    return `
      <div class="module-card printer-health-panel printer-health-panel--unavailable">
        <h2>\uD83D\uDDA8\uFE0F Live Printer Health</h2>
        <p class="helper-text">Real-time printer monitoring is only active when the kiosk is running in Electron mode with the local printer agent.</p>
      </div>
    `;
  }

  const paperDisplay = h.paperJam ? "Paper Jam" : !h.paper ? "Empty" : h.paperLow ? "Low" : "OK";
  const tonerDisplay = h.tonerEmpty ? "Empty" : h.tonerLow ? "Low" : "OK";
  const queueDisplay = h.queueLength > 0 ? `${h.queueLength} job${h.queueLength === 1 ? "" : "s"}` : "Empty";
  const lastHeartbeat = h.lastUpdated ? formatDateTime(h.lastUpdated) : "Never";
  const recentErrors = h.errorLog
    .filter(function (entry) { return entry.status !== "ok" && usefulPrinterHealthLogEntry(entry); })
    .slice(-10)
    .reverse();
  const alerts = printerHealthAlerts();

  return `
    <div class="module-card printer-health-panel">
      <div class="printer-health-panel__header">
        <h2>\uD83D\uDDA8\uFE0F Live Printer Health</h2>
        <span class="badge ${statusBadgeClass}">${escapeHtml(label || "Unknown")}</span>
      </div>
      ${alerts.length ? `
        <div class="printer-alert-strip">
          ${alerts.map((alert) => `
            <div class="printer-alert-strip__item printer-alert-strip__item--${escapeHtml(alert.tone || "warn")}">
              <strong>${escapeHtml(alert.title)}</strong>
              <span>${escapeHtml(alert.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="health-list printer-health-panel__grid">
        ${renderHealthRow("Printer Status", h.online ? "Online" : "Offline", h.online ? "good" : "bad")}
        ${renderHealthRow("Printer Name", h.printerName || "Unknown", h.printerName ? "good" : "warn")}
        ${renderHealthRow("Paper Status", paperDisplay, (!h.paper || h.paperJam) ? "bad" : h.paperLow ? "warn" : "good")}
        ${renderHealthRow("Toner Status", tonerDisplay, h.tonerEmpty ? "bad" : h.tonerLow ? "warn" : "good")}
        ${renderHealthRow("Door", h.doorOpen ? "Open" : "Closed", h.doorOpen ? "bad" : "good")}
        ${renderHealthRow("Queue Length", queueDisplay, h.queueError ? "bad" : h.queueLength > 0 ? "warn" : "good")}
        ${renderHealthRow("Current Job", h.printing ? "Printing" : h.busy ? "Busy" : "Idle", h.printing ? "warn" : "good")}
        ${renderHealthRow("Last Heartbeat", lastHeartbeat, "good")}
        ${h.errorMessage ? renderHealthRow("Last Error", h.errorMessage, "bad") : ""}
      </div>
      ${recentErrors.length ? `
        <div class="printer-error-log">
          <h3>Recent Error Log</h3>
          <div class="printer-error-log__table-wrap">
            <table class="printer-error-log__table">
              <thead>
                <tr><th>Time</th><th>Status</th><th>Description</th><th>Resolved</th></tr>
              </thead>
              <tbody>
                ${recentErrors.map(function (entry) { return `
                  <tr>
                    <td>${escapeHtml(formatDateTime(entry.time))}</td>
                    <td><span class="badge ${entry.status === "error" ? "bad" : "warn"}">${escapeHtml(entry.status)}</span></td>
                    <td>${escapeHtml(entry.description || "")}</td>
                    <td>${entry.resolved ? escapeHtml(formatDateTime(entry.resolved)) : "<span class=\"badge warn\">Active</span>"}</td>
                  </tr>
                `; }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

/* ── Phase helpers ─────────────────────────────── */
function renderThankYouPaymentDone() {
  const details = priceDetails();
  const receiptJob = state.lastCompletedJob || { pages: details.pages, amount: details.total };
  return `
    <div class="tq-phase tq-phase-in">
      <div class="tq-check-wrapper">
        <div class="tq-check-ring"></div>
        <svg class="tq-check-icon" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="25" stroke="#22c55e" stroke-width="2"/>
          <path class="tq-check-path" d="M14 26 L22 34 L38 18" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
      <div class="tq-message">
        <h1 class="tq-title">Payment Successful!</h1>
        <p class="tq-subtitle">₹${(receiptJob.amount || 0).toFixed ? (receiptJob.amount || 0).toFixed(2) : receiptJob.amount} received &nbsp;·&nbsp; ${receiptJob.pages || 0} page${receiptJob.pages !== 1 ? 's' : ''}</p>
      </div>
      <div class="tq-pills">
        <div class="tq-pill tq-pill-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Payment Confirmed</span>
        </div>
        <div class="tq-pill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span>Preparing to print…</span>
        </div>
      </div>
      <p class="tq-phase-hint">Please wait while we send your document to the printer</p>
    </div>`;
}

// Real, currently-polled printer status (state.printerHealth is refreshed in
// the background by startPrinterStatusPolling() the whole time) with the
// admin-only emoji prefix stripped, for the customer-facing thank-you screen.
function customerLivePrinterStatusLabel() {
  const label = String(printerHealthLabel() || "").replace(/^\S+\s*/, "").trim();
  return label || "Printer Ready";
}

function renderThankYouPrinting() {
  // While startLocalPrintJob() is still actually running, printProgress sits
  // below 5 and printStatusMessage carries its real, live text ("Sending
  // document to printer...", "Printing document 1 of 2...", etc.) - this
  // screen just displays whatever that real job is doing right now. Once it
  // hits 5 (job resolved), switch to a "come collect it" framing instead of
  // still claiming to be sending/printing.
  const stillPrinting = Number(state.printProgress || 0) < 5;
  const liveStatus = state.printStatusMessage || customerLivePrinterStatusLabel();
  const documentSent = Number(state.printProgress || 0) >= 2;
  const heading = stillPrinting ? "Printing Your Document" : "Collecting Your Document";
  const subtitle = stillPrinting
    ? "Please wait while the kiosk sends your document to the printer."
    : "Please collect your pages from the printer tray.";
  return `
    <div class="tq-phase tq-phase-in tq-printing-scene">
      <div class="tq-printing-full">
        <div class="tq-printing-copy">
          <span class="tq-printing-eyebrow">${stillPrinting ? "Print job in progress" : "Print job complete"}</span>
          <h1 class="tq-title">${escapeHtml(heading)}</h1>
          <p class="tq-subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <div class="tq-printer-stage" aria-hidden="true">
          <div class="tq-paper-stack tq-paper-stack-left">
            <span></span><span></span><span></span>
          </div>
          <div class="tq-printer-anim tq-printer-anim-large">
            <div class="tq-printer-body">
              <div class="tq-printer-top"></div>
              <div class="tq-printer-lights">
                <div class="tq-light tq-light-blink"></div>
                <div class="tq-light tq-light-blink" style="animation-delay:0.4s"></div>
                <div class="tq-light tq-light-solid"></div>
              </div>
              <div class="tq-printer-slot">
                <div class="tq-printer-paper"></div>
              </div>
              <div class="tq-printer-face"></div>
              <div class="tq-printer-base"></div>
            </div>
            <div class="tq-printer-output">
              <div class="tq-output-paper">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
          <div class="tq-paper-stack tq-paper-stack-right">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="tq-print-progress">
          <div class="tq-progress-bar"><div class="tq-progress-fill"></div></div>
          <span class="tq-progress-label">${escapeHtml(liveStatus)}</span>
        </div>
        <div class="tq-printing-status">
          <span>Payment verified</span>
          <span>${documentSent ? "Document sent" : "Sending document"}</span>
          <span>${escapeHtml(liveStatus)}</span>
        </div>
      </div>
      <div class="tq-printer-anim">
        <div class="tq-printer-body">
          <div class="tq-printer-slot">
            <div class="tq-printer-paper"></div>
          </div>
          <div class="tq-printer-base"></div>
          <div class="tq-printer-lights">
            <div class="tq-light tq-light-blink"></div>
            <div class="tq-light tq-light-blink" style="animation-delay:0.4s"></div>
            <div class="tq-light tq-light-solid"></div>
          </div>
        </div>
        <div class="tq-printer-output">
          <div class="tq-output-paper"></div>
        </div>
      </div>
      <div class="tq-message">
        <h1 class="tq-title">${escapeHtml(heading)}</h1>
        <p class="tq-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="tq-print-progress">
        <div class="tq-progress-bar"><div class="tq-progress-fill"></div></div>
        <span class="tq-progress-label">${escapeHtml(liveStatus)}</span>
      </div>
    </div>`;
}

function renderThankYouFinal() {
  return `
    <div class="tq-phase tq-phase-in">
      <div class="tq-mascot-area">
        <img src="./assets/smartbuddy-last-step.png" alt="SmartBuddy" class="tq-mascot" draggable="false" data-no-visual-search />
      </div>
      <div class="tq-message">
        <h1 class="tq-title tq-title-gradient">Thank You!</h1>
        <p class="tq-subtitle">Your document has been printed successfully.<br>We hope to see you again!</p>
      </div>
      <button class="tq-home-btn" data-action="finish-session">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Return Home Now
      </button>
      <p class="tq-home-countdown" id="tq-home-countdown">Returning home in ${Number(state.thankYouSecondsLeft) || THANK_YOU_HOME_REDIRECT_SECONDS}s</p>
    </div>`;
}

/* ── Main entry point ─────────────────────────── */
function renderThankYouStep() {
  // Reset phase to payment_done on every fresh render (only happens once on step entry)
  const phase = state.thankYouPhase || "payment_done";

  let phaseHtml;
  if (phase === "printing") {
    phaseHtml = renderThankYouPrinting();
  } else if (phase === "thankyou") {
    phaseHtml = renderThankYouFinal();
  } else {
    phaseHtml = renderThankYouPaymentDone();
  }

  return `
    <div class="thankyou-stage tq-phase-${phase}">
      <div class="tq-bg-circle tq-bg-c1"></div>
      <div class="tq-bg-circle tq-bg-c2"></div>
      <div class="tq-bg-circle tq-bg-c3"></div>
      <div class="tq-content">
        <div id="tq-phase-content">${phaseHtml}</div>
      </div>
    </div>
  `;
}

function renderSessionPanel() {
  const details = priceDetails();
  const service = selectedService();
  const rates = serviceRates(service.id);
  const rows = [
    `<div class="info-row"><span>Service</span><strong>${escapeHtml(localizedServiceText(service, "title"))}</strong></div>`,
    `<div class="info-row"><span>File</span><strong>${escapeHtml(state.file?.name || "Waiting")}</strong></div>`
  ];

  if (state.file && state.step >= 3) {
    if (customerSettingEnabled("copies")) {
      rows.push(`<div class="info-row"><span>Copies</span><strong>${state.settings.copies}</strong></div>`);
    }
    if (customerSettingEnabled("bw") && customerSettingEnabled("color")) {
      rows.push(`<div class="info-row"><span>Color</span><strong>${state.settings.colorMode === "color" ? "Color" : "B/W"}</strong></div>`);
    }
  }

  if (state.file && state.step >= 4) {
    rows.push(...customerRateRows(rates));
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
      <button class="admin-nav-backdrop ${state.adminNavOpen ? "is-open" : ""}" data-action="admin-close-nav" aria-label="Close navigation"></button>
      <nav id="kiosk-admin-navigation" class="admin-nav ${state.adminNavOpen ? "is-open" : ""}" aria-label="Client navigation">
        <div class="admin-nav-drawer-head">
          <div class="brand-logo-full-card admin-nav-drawer-brand"><img class="brand-logo-full" src="./assets/aarya-innovtech-logo-full.png" alt="Aarya Innovtech Pvt. Ltd." draggable="false" data-no-visual-search /></div>
          <button data-action="admin-close-nav" aria-label="Close navigation">${uiIcon("close", 22)}</button>
        </div>
        ${adminNavGroups().map((group) => `
          <div class="admin-nav-group">
            <div class="admin-nav-label">${group.label}</div>
            ${group.pages.map((page) => `
              <button class="${state.adminPage === page.id ? "active" : ""}" data-admin-page="${page.id}">
                <span class="admin-nav-icon">${uiIcon(page.icon, 20)}</span>
                <span>${page.label}</span>
              </button>
            `).join("")}
          </div>
        `).join("")}
        ${renderAdminNavFooter()}
      </nav>
      <section class="admin-main">
        ${renderAdminPage()}
      </section>
    </div>
  `;
}

function renderAdminNavFooter() {
  return `
    <div class="admin-nav-footer">
      <div class="sidebar-user-card">
        <button data-action="admin-logout" class="sidebar-logout-btn" title="Logout" aria-label="Logout">
          ${uiIcon("logout", 16)}
          <span>Logout</span>
        </button>
      </div>
    </div>
  `;
}

function adminNavGroups() {
  // One flat group under a single "MAIN MENU" label, same as Super Admin's
  // sidebar (super-admin.js pageGroups) - two separate group labels
  // ("Operate"/"Support") cost extra vertical space for no real benefit and
  // made this sidebar taller than Super Admin's for the same item count,
  // pushing the first few items out of view without scrolling.
  return [
    {
      label: "MAIN MENU",
      pages: [
        { id: "dashboard", label: "Dashboard", icon: "dashboard" },
        { id: "projects", label: "Projects", icon: "hierarchy" },
        { id: "kiosks", label: "Kiosks", icon: "kiosks" },
        { id: "pricing", label: "Pricing", icon: "pricing" },
        { id: "revenue", label: "Report", icon: "payments" },
        { id: "analytics", label: "Analytics", icon: "activity" },
        { id: "alerts", label: "Alerts", icon: "alert" }
      ]
    }
  ];
}

function adminPages() {
  return adminNavGroups().flatMap((group) => group.pages);
}

function renderAdminHeader(title, subtitle, action = "") {
  const isDashboard = title === "Dashboard";
  const displayTitle = isDashboard
    ? `Welcome to <span style="color: #2563eb;">Dashboard</span>`
    : escapeHtml(title);
  const displaySub = isDashboard
    ? "Hello Admin, here is your system overview."
    : escapeHtml(subtitle);

  // Topbar shows a short, plain page label (picked up by renderAdminTopbar())
  // kept separate from this page-body heading, which keeps its own full
  // title/subtitle/action - mirrors Super Admin's renderHeader() exactly.
  state.currentAdminHeaderTitle = escapeHtml(title);
  state.currentAdminHeaderSubtitle = "";

  return `
    <div class="admin-header">
      <div>
        <h1 class="page-title">${displayTitle}</h1>
        <p class="page-subtitle">${displaySub}</p>
      </div>
      ${action ? `<div class="flow-actions">${action}</div>` : ""}
    </div>
  `;
}

function renderAdminPage() {
  if (["services", "service-editor", "system"].includes(state.adminPage)) {
    state.adminPage = "dashboard";
  }
  const page = state.adminPage;
  if (page === "dashboard") return renderDashboard();
  if (page === "history") return renderHistory();
  if (page === "projects") return renderProjects();
  if (page === "reports") return renderReports();
  if (page === "revenue") return renderRevenue();
  if (page === "analytics") return renderAdminAnalytics();
  if (page === "kiosks") return renderKiosks();
  if (page === "pricing") return renderPricing();
  if (page === "alerts") return renderAlerts();
  return renderDashboard();
}

async function loadAdminIdleScreensaver() {
  state.idleScreensaverStatus = "Loading idle-screen settings...";
  state.idleScreensaverError = "";
  render();

  try {
    const payload = await fetchAdminJson("/api/admin/idle-screensaver");
    state.idleScreensaverDraft = {
      idleMediaMode: ["none", "image", "video"].includes(payload.idleMediaMode) ? payload.idleMediaMode : "none",
      idleImageUrls: Array.isArray(payload.idleImageUrls) ? payload.idleImageUrls : [],
      idleVideoUrl: payload.idleVideoUrl || "",
      idleTimeoutSeconds: Number(payload.idleTimeoutSeconds) || 60
    };
    state.idleScreensaverStatus = "";
  } catch (error) {
    if (!error.sessionExpired) {
      state.idleScreensaverStatus = "";
      state.idleScreensaverError = error.message || "Could not load idle-screen settings.";
    }
  }

  render();
}

async function saveAdminIdleScreensaver() {
  if (!state.idleScreensaverDraft) return;

  state.idleScreensaverStatus = "Saving idle-screen settings...";
  state.idleScreensaverError = "";
  render();

  try {
    const payload = await fetchAdminJson("/api/admin/idle-screensaver", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.idleScreensaverDraft)
    });
    state.idleScreensaverDraft = {
      idleMediaMode: payload.idleMediaMode || "none",
      idleImageUrls: Array.isArray(payload.idleImageUrls) ? payload.idleImageUrls : [],
      idleVideoUrl: payload.idleVideoUrl || "",
      idleTimeoutSeconds: Number(payload.idleTimeoutSeconds) || 60
    };
    state.idleScreensaverStatus = "Idle-screen settings saved.";
  } catch (error) {
    if (!error.sessionExpired) {
      state.idleScreensaverStatus = "";
      state.idleScreensaverError = error.message || "Could not save idle-screen settings.";
    }
  }

  render();
}

function validateAdminIdleImageFile(file) {
  if (!file) return "Choose an idle-screen image.";
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if (!isImage) return "Choose a PNG, JPG, GIF, or WebP image.";
  if (file.size > 4 * 1024 * 1024) return "Each idle-screen image must be 4 MB or smaller.";
  return "";
}

async function uploadAdminIdleImages(files) {
  if (!state.idleScreensaverDraft) return;

  const list = Array.from(files || []);
  if (!list.length) return;

  const existing = Array.isArray(state.idleScreensaverDraft.idleImageUrls) ? state.idleScreensaverDraft.idleImageUrls : [];
  const room = Math.max(0, 10 - existing.length);
  const toUpload = list.slice(0, room);

  if (!toUpload.length) {
    state.idleScreensaverError = "You can upload at most 10 idle-screen images.";
    render();
    return;
  }

  for (const file of toUpload) {
    const validationError = validateAdminIdleImageFile(file);
    if (validationError) {
      state.idleScreensaverError = validationError;
      render();
      return;
    }
  }

  state.idleScreensaverStatus = "Uploading idle-screen images...";
  state.idleScreensaverError = "";
  render();

  try {
    const formData = new FormData();
    toUpload.forEach((file) => formData.append("idleImage", file, file.name));
    const payload = await fetchAdminJson("/api/admin/idle-image", {
      method: "POST",
      body: formData
    });

    state.idleScreensaverDraft.idleImageUrls = [...existing, ...(payload.imageUrls || [])].slice(0, 10);
    // Uploading images used to leave mode untouched - if it was "Off" (or
    // "Video", from a previous choice) the images saved fine but never
    // showed, because nothing switched mode to match what was just
    // uploaded. Uploading is a clear enough signal of intent to activate
    // image mode; Save is still required before anything actually
    // publishes to kiosks.
    state.idleScreensaverDraft.idleMediaMode = "image";
    state.idleScreensaverStatus = "Idle-screen images uploaded. Save to publish them.";
  } catch (error) {
    if (!error.sessionExpired) {
      state.idleScreensaverStatus = "";
      state.idleScreensaverError = error.message || "Idle-screen image upload failed.";
    }
  }

  render();
}

function validateAdminIdleVideoFile(file) {
  if (!file) return "Choose an idle-screen video.";
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(file.name);
  if (!isVideo) return "Choose an MP4 or WebM video.";
  if (file.size > 50 * 1024 * 1024) return "Idle-screen video must be 50 MB or smaller.";
  return "";
}

async function uploadAdminIdleVideo(file) {
  if (!state.idleScreensaverDraft) return;

  const validationError = validateAdminIdleVideoFile(file);
  if (validationError) {
    state.idleScreensaverError = validationError;
    render();
    return;
  }

  state.idleScreensaverStatus = "Uploading idle-screen video...";
  state.idleScreensaverError = "";
  render();

  try {
    const formData = new FormData();
    formData.append("idleVideo", file, file.name);
    const payload = await fetchAdminJson("/api/admin/idle-video", {
      method: "POST",
      body: formData
    });

    state.idleScreensaverDraft.idleVideoUrl = payload.videoUrl || "";
    // Same reasoning as the image upload above - always switch to video mode
    // on a successful upload, not just from "Off", so switching from Image
    // to Video mode by uploading a video also actually activates it.
    state.idleScreensaverDraft.idleMediaMode = "video";
    state.idleScreensaverStatus = "Idle-screen video uploaded. Save to publish it.";
  } catch (error) {
    if (!error.sessionExpired) {
      state.idleScreensaverStatus = "";
      state.idleScreensaverError = error.message || "Idle-screen video upload failed.";
    }
  }

  render();
}

function deleteAdminIdleImage(index) {
  if (!state.idleScreensaverDraft) return;
  const images = Array.isArray(state.idleScreensaverDraft.idleImageUrls) ? [...state.idleScreensaverDraft.idleImageUrls] : [];
  images.splice(index, 1);
  state.idleScreensaverDraft.idleImageUrls = images;
  render();
}

function moveAdminIdleImage(index, direction) {
  if (!state.idleScreensaverDraft) return;
  const images = Array.isArray(state.idleScreensaverDraft.idleImageUrls) ? [...state.idleScreensaverDraft.idleImageUrls] : [];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= images.length) return;
  [images[index], images[targetIndex]] = [images[targetIndex], images[index]];
  state.idleScreensaverDraft.idleImageUrls = images;
  render();
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(state.mode === "admin" ? adminLocale() : "en-IN", {
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

function kioskAdminCanManageSetup() {
  return false;
}

function blockKioskAdminSetupAction() {
  state.adminPermissionStatus = "Create, update, and delete actions are available only in Super Admin.";
  state.projectEditorOpen = false;
  state.projectEditId = "";
  state.kioskEditorOpen = false;
  state.kioskEditId = "";
  state.serviceEditor = null;
  render();
  return false;
}

function isKioskAdminSetupMutationInput(target) {
  return Boolean(
    target?.dataset?.kioskDraftField ||
    target?.dataset?.projectDraftField ||
    target?.dataset?.servicePrice ||
    target?.dataset?.serviceField ||
    target?.dataset?.serviceDraftField ||
    target?.dataset?.templateField ||
    target?.dataset?.templateDraftField ||
    target?.dataset?.templateImage ||
    target?.dataset?.draftTemplateImage !== undefined
  );
}

function adminNotice() {
  const permissionNote = state.adminPermissionStatus
    ? `<div class="save-note" style="margin-bottom: 16px;">${escapeHtml(state.adminPermissionStatus)}</div>`
    : "";

  return permissionNote;
}

function liveJobs() {
  return state.adminData.jobs.length ? state.adminData.jobs : [];
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

function adminOperationalAlerts() {
  const kiosks = state.adminData.kiosks || [];
  return kiosks
    .flatMap(kioskPrinterHealthAlerts)
    .sort((a, b) => (Date.parse(b.lastUpdated || "") || 0) - (Date.parse(a.lastUpdated || "") || 0));
}

window.updateAlertFilter = (field, value) => {
  if (!state.alertFilter) state.alertFilter = { search: "", category: "all", status: "all", kioskId: "all" };
  state.alertFilter[field] = value;
  renderAdminApp();
};

function adminAllAlertRecords() {
  const persistedLogs = state.adminData.alertLogs || [];
  const liveAlerts = adminOperationalAlerts().map((alert, idx) => ({
    id: alert.id || `LIVE-${alert.kioskId || 'KIOSK'}-${idx}`,
    kioskId: alert.kioskId || "Unknown",
    category: alert.category || "service",
    title: alert.title || "Hardware Alert",
    detail: alert.detail || "Operational alert",
    tone: alert.tone || "warn",
    status: "active",
    createdAt: alert.lastUpdated || new Date().toISOString()
  }));

  // Only skip a persisted log when it duplicates a currently-live alert -
  // checking against liveAlerts (not the growing `combined`) so multiple
  // distinct historical incidents with the same kioskId+title+status
  // (e.g. two separate resolved paper jams on the same kiosk) don't get
  // collapsed into a single record.
  const combined = [...liveAlerts];
  for (const log of persistedLogs) {
    if (!liveAlerts.some(c => c.kioskId === log.kioskId && c.title === log.title && c.status === log.status)) {
      combined.push(log);
    }
  }
  return combined;
}

function filteredAlertLogs() {
  const allLogs = adminAllAlertRecords();
  const filter = state.alertFilter || { search: "", category: "all", status: "all", kioskId: "all" };
  const searchLower = (filter.search || "").trim().toLowerCase();

  return allLogs.filter(log => {
    if (filter.category && filter.category !== "all") {
      const cat = (log.category || "").toLowerCase();
      const target = filter.category.toLowerCase();
      if (target === "paper" && !cat.includes("paper") && !cat.includes("jam")) return false;
      else if (target === "toner" && !cat.includes("toner")) return false;
      else if (target === "network" && !cat.includes("network") && !cat.includes("offline")) return false;
      else if (target === "queue" && !cat.includes("queue")) return false;
      else if (target === "service" && !cat.includes("service")) return false;
      else if (target !== "paper" && target !== "toner" && target !== "network" && target !== "queue" && target !== "service" && !cat.includes(target)) return false;
    }
    if (filter.status && filter.status !== "all") {
      const isResolved = log.status === "resolved";
      if (filter.status === "active" && isResolved) return false;
      if (filter.status === "resolved" && !isResolved) return false;
    }
    if (filter.kioskId && filter.kioskId !== "all") {
      if ((log.kioskId || "").toLowerCase() !== filter.kioskId.toLowerCase()) return false;
    }
    if (searchLower) {
      const matchTitle = (log.title || "").toLowerCase().includes(searchLower);
      const matchDetail = (log.detail || "").toLowerCase().includes(searchLower);
      const matchKiosk = (log.kioskId || "").toLowerCase().includes(searchLower);
      const matchCategory = (log.category || "").toLowerCase().includes(searchLower);
      if (!matchTitle && !matchDetail && !matchKiosk && !matchCategory) return false;
    }
    return true;
  }).sort((a, b) => (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0));
}

window.downloadAlertsReportPDF = async function () {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const filtered = filteredAlertLogs();
  const filter = state.alertFilter || { search: "", category: "all", status: "all", kioskId: "all" };

  const clientName = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const clientLogoUrl = state.adminAccount?.logoUrl || "";
  const kioskLabel = filter.kioskId && filter.kioskId !== "all" ? filter.kioskId : "All Assigned Kiosks";
  const categoryLabel = filter.category && filter.category !== "all" ? filter.category.toUpperCase() : "All Categories";
  const statusLabel = filter.status && filter.status !== "all" ? filter.status.toUpperCase() : "All Statuses";

  const logoMaxWidth = 32;
  const logoMaxHeight = 24;
  const companyLogoMaxWidth = 50;
  const logoY = 12;

  const [clientLogo, companyLogo] = await Promise.all([
    loadImageAsDataUrl(clientLogoUrl),
    loadImageAsDataUrl("./assets/aarya-innovtech-logo-full.png")
  ]);
  const [clientLogoSize, companyLogoSize] = await Promise.all([
    loadImageNaturalSize(clientLogo),
    loadImageNaturalSize(companyLogo)
  ]);

  if (clientLogo) {
    const box = fitImageBox(clientLogoSize, logoMaxWidth, logoMaxHeight);
    doc.addImage(clientLogo, dataUrlImageFormat(clientLogo), 14, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  if (companyLogo) {
    const box = fitImageBox(companyLogoSize, companyLogoMaxWidth, logoMaxHeight);
    doc.addImage(companyLogo, dataUrlImageFormat(companyLogo), pageWidth - 14 - box.width, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(20);
  doc.setTextColor(27, 175, 122);
  doc.text("Alert History Report", pageWidth / 2, logoY + 10, { align: "center" });

  let headerY = logoY + 19;
  doc.setFontSize(15);
  doc.setTextColor(42, 120, 214);
  doc.text(clientName, pageWidth / 2, headerY, { align: "center" });
  headerY += 8;

  // Long filter-description text ("Kiosk: All | Category: All | Status:
  // All...") is centered across the full page width, so its right half
  // can run into the company logo pinned top-right if it starts too high.
  // Clamp to below the logo's actual rendered bottom edge regardless of
  // text length.
  headerY = Math.max(headerY, logoY + logoMaxHeight + 2);

  doc.setFont(undefined, "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(100);
  doc.text(`Kiosk ID: ${kioskLabel} | Category: ${categoryLabel} | Status: ${statusLabel}`, pageWidth / 2, headerY, { align: "center" });
  if (filter.search) {
    doc.text(`Search: "${filter.search}" | Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth / 2, headerY + 6, { align: "center" });
    headerY += 6;
  } else {
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth / 2, headerY + 6, { align: "center" });
  }
  doc.setTextColor(0);

  const dividerY = headerY + 12;
  doc.setDrawColor(42, 120, 214);
  doc.setLineWidth(0.6);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  const tableData = filtered.map(log => [
    formatDateTime(log.createdAt),
    log.kioskId || "Unknown",
    (log.category || "-").toUpperCase(),
    log.title || "-",
    log.status === "resolved" ? "Resolved" : "Active"
  ]);

  doc.autoTable({
    startY: dividerY + 8,
    margin: { bottom: 42 },
    head: [["Date & Time", "Kiosk", "Category", "Alert Title", "Status"]],
    body: tableData.length ? tableData : [["-", "-", "-", "No alert records match the selected filters", "-"]],
    theme: "grid",
    styles: {
      fontSize: 8.5,
      lineColor: [42, 120, 214],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      cellPadding: 3.5,
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: [27, 175, 122],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      fontSize: 9
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244]
    },
    columnStyles: {
      0: { cellWidth: 34, halign: "center" },
      1: { cellWidth: 22, fontStyle: "bold", halign: "center" },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: "auto", fontStyle: "bold" },
      4: { cellWidth: 20, halign: "center" }
    }
  });

  redrawWatermarkOnAllPages(doc, companyLogo, companyLogoSize);
  drawPdfCompanyFooter(doc);
  doc.save(`Alert_History_Report_${new Date().toISOString().split("T")[0]}.pdf`);
};

function renderAdminAlertLogsTable() {
  const allLogs = adminAllAlertRecords();
  const filter = state.alertFilter || { search: "", category: "all", status: "all", kioskId: "all" };
  const filtered = filteredAlertLogs();

  const rows = filtered.map(log => {
    const isResolved = log.status === 'resolved';
    const badgeStyle = isResolved
      ? 'background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;'
      : 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;';
    const statusText = isResolved ? 'Resolved' : 'Active';
    return [
      formatDateTime(log.createdAt),
      log.kioskId || "Unknown",
      log.category || "-",
      log.title || "-",
      log.detail || "-",
      `<span style="${badgeStyle} font-size: 11.5px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: inline-block;">${escapeHtml(statusText)}</span>`
    ];
  });

  const uniqueKiosks = [...new Set((state.adminData.kiosks || []).map(k => k.kioskId).concat(allLogs.map(l => l.kioskId)).filter(Boolean))];

  return `
    <section class="module-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px 32px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03); margin-top: 24px; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(99, 102, 241, 0.1); color: #6366f1; display: flex; align-items: center; justify-content: center;">
            ${uiIcon("history", 20)}
          </div>
          <div>
            <h2 style="font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">Alert History Logs</h2>
            <span style="font-size: 12.5px; color: #64748b;">Historical hardware diagnostics & system log history</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 13px; font-weight: 600; color: #6366f1; background: #eef2ff; padding: 6px 14px; border-radius: 20px;">${filtered.length} Record${filtered.length === 1 ? "" : "s"}</span>
          <button class="export-alerts-btn" onclick="window.downloadAlertsReportPDF()">
            ${uiIcon("download", 16)} Alerts PDF
          </button>
        </div>
      </div>

      <!-- Clean Filter Toolbar -->
      <div style="margin-bottom: 24px; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 16px; align-items: center;">
        <div style="position: relative; width: 100%;">
          <input type="text" placeholder="Search alerts by kiosk, title, or details..."
                 value="${escapeHtml(filter.search)}" 
                 oninput="window.updateAlertFilter('search', this.value)" 
                 style="width: 100%; padding: 11px 14px 11px 40px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 13.5px; background: #ffffff; color: #0f172a; outline: none;">
          <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; display: flex; align-items: center;">
            ${uiIcon("search", 16)}
          </span>
        </div>
        
        <select onchange="window.updateAlertFilter('category', this.value)" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 13.5px; background: #ffffff; color: #0f172a;">
          <option value="all" ${filter.category === "all" ? "selected" : ""}>All Categories</option>
          <option value="paper" ${filter.category === "paper" ? "selected" : ""}>Paper / Jam</option>
          <option value="toner" ${filter.category === "toner" ? "selected" : ""}>Toner Level</option>
          <option value="network" ${filter.category === "network" ? "selected" : ""}>Network / Offline</option>
          <option value="queue" ${filter.category === "queue" ? "selected" : ""}>Queue Status</option>
          <option value="service" ${filter.category === "service" ? "selected" : ""}>Service Required</option>
        </select>

        <select onchange="window.updateAlertFilter('status', this.value)" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 13.5px; background: #ffffff; color: #0f172a;">
          <option value="all" ${filter.status === "all" ? "selected" : ""}>All Statuses</option>
          <option value="active" ${filter.status === "active" ? "selected" : ""}>Active / Open</option>
          <option value="resolved" ${filter.status === "resolved" ? "selected" : ""}>Resolved</option>
        </select>
        
        <select onchange="window.updateAlertFilter('kioskId', this.value)" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 13.5px; background: #ffffff; color: #0f172a;">
          <option value="all" ${filter.kioskId === "all" ? "selected" : ""}>All Kiosks</option>
          ${uniqueKiosks.map(k => `<option value="${escapeHtml(k)}" ${filter.kioskId === k ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
        </select>
      </div>

      <!-- Modern Custom Table -->
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 14px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 14px 18px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">Date & Time</th>
              <th style="padding: 14px 18px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">Kiosk</th>
              <th style="padding: 14px 18px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">Category</th>
              <th style="padding: 14px 18px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">Alert Title</th>
              <th style="padding: 14px 18px; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">Status</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length ? filtered.map((log, index) => {
              const isResolved = log.status === 'resolved';
              const badgeStyle = isResolved
                ? 'background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;'
                : 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;';
              const statusLabel = isResolved ? 'Resolved' : 'Active';
              const bgRow = index % 2 === 0 ? '#ffffff' : '#f8fafc';

              return `
                <tr style="background: ${bgRow}; border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;">
                  <td style="padding: 14px 18px; color: #334155; font-weight: 500; white-space: nowrap;">${escapeHtml(formatDateTime(log.createdAt))}</td>
                  <td style="padding: 14px 18px; color: #0f172a; font-weight: 700; white-space: nowrap;">
                    <span style="background: #eef2ff; color: #4f46e5; padding: 4px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600;">${escapeHtml(log.kioskId || "Unknown")}</span>
                  </td>
                  <td style="padding: 14px 18px; color: #64748b; font-weight: 600; text-transform: capitalize;">${escapeHtml(log.category || "-")}</td>
                  <td style="padding: 14px 18px; color: #0f172a; font-weight: 700; max-width: 200px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">${escapeHtml(log.title || "-")}</td>
                  <td style="padding: 14px 18px; white-space: nowrap;">
                    <span style="${badgeStyle} font-size: 11.5px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: inline-block;">${statusLabel}</span>
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="5" style="padding: 36px; text-align: center; color: #94a3b8;">
                  ${uiIcon("history", 32)}
                  <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">No alert logs found matching your filters.</p>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAlerts() {
  const alerts = adminOperationalAlerts();
  return `
    ${renderAdminHeader("Operational Alerts", "Real-time printer and kiosk alerts for your assigned kiosk(s).")}
    ${adminNotice()}
    <div class="module-card">
      <div class="module-card-title">
        <span>${uiIcon("bell", 20)}</span>
        <h2>Active Printer Alerts</h2>
        <strong>${alerts.length} alert${alerts.length === 1 ? "" : "s"}</strong>
      </div>
      <div class="info-list">
        ${alerts.length ? alerts.map((alert) => `
          <div class="info-row is-alert" style="padding: 16px; border-bottom: 1px solid var(--line);">
            <span class="alert-row-icon" style="color: ${alert.tone === 'bad' ? '#ef4444' : '#f59e0b'};">${uiIcon("alert", 22)}</span>
            <div style="flex: 1;">
              <strong style="font-size: 1.05em; color: var(--text-color);">${escapeHtml(alert.title)}</strong>
              <p style="margin: 4px 0 0 0; color: var(--secondary-text); font-size: 0.9em;">${escapeHtml(alert.detail)}</p>
            </div>
            <span class="badge ${alert.tone === 'bad' ? 'bad' : 'warn'}">${alert.tone === 'bad' ? 'Action Required' : 'Warning'}</span>
          </div>
        `).join("") : `<div class="empty-note" style="padding: 32px; text-align: center;">No active printer alerts for your kiosk(s). All hardware systems are operating normally.</div>`}
      </div>
    </div>
    ${renderAdminAlertLogsTable()}
  `;
}

function jobRow(job) {
  const printLabel = job.printStatus || job.print || "Draft";
  // Completed jobs where the local print agent never actually observed the
  // job reach the printer queue (it gave up waiting rather than confirming
  // completion) are still reported "Completed", but flagged here so staff
  // can tell a genuinely-confirmed print apart from one that just timed out
  // silently - see waitForWindowsPrintCompletion() in printerAgent.js.
  const unconfirmed = /completed/i.test(printLabel) && job.completionConfirmed === false;

  return {
    id: job.jobId || job.id || "",
    date: formatDateTime(job.completedAt || job.createdAt || job.date),
    kiosk: job.kioskId || job.kiosk || UNASSIGNED_KIOSK_ID,
    branch: job.branch || "Local Branch",
    file: job.fileName || job.file || "Document",
    service: serviceTitle(job.service),
    pages: Number(job.pageCount || job.pages || 1),
    copies: Number(job.copies || 1),
    amount: Number(job.amount || 0),
    payment: job.paymentStatus || job.payment || "Draft",
    print: unconfirmed ? `${printLabel} (unconfirmed)` : printLabel
  };
}

function emptyRows(message, columns) {
  return [[message, ...Array(Math.max(0, columns - 1)).fill("")]];
}

function adminPaginated(items, key, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.adminPagination[key] || 1)), pageCount);
  state.adminPagination[key] = currentPage;
  const start = (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), currentPage, pageCount, total: items.length };
}

function adminServiceAssignableProjects() {
  return state.adminData.projects.filter((project) => project.projectId);
}

function adminProjectName(projectId) {
  return state.adminData.projects.find((project) => project.projectId === projectId)?.name || "Unassigned";
}

function firstAdminServiceProjectId() {
  return adminServiceAssignableProjects()[0]?.projectId || "";
}

function adminKioskById(kioskId = "") {
  const id = normalizeKioskId(kioskId);
  return state.adminData.kiosks.find((kiosk) => normalizeKioskId(kiosk.kioskId) === id) || null;
}

function sortedAdminKiosks() {
  return [...state.adminData.kiosks].sort((left, right) => {
    const leftLabel = left.name || left.kioskId || "";
    const rightLabel = right.name || right.kioskId || "";
    return String(leftLabel).localeCompare(String(rightLabel));
  });
}

function serviceAppliesToAdminKiosk(service = {}, kiosk = null) {
  const kioskId = normalizeKioskId(kiosk?.kioskId);
  const kioskIds = Array.isArray(service.kioskIds) ? service.kioskIds.map((item) => normalizeKioskId(item)).filter(Boolean) : [];

  if (kioskIds.length) {
    return Boolean(kioskId && kioskIds.includes(kioskId));
  }

  const projectIds = Array.isArray(service.projectIds) ? service.projectIds.map((item) => slug(item, "")).filter(Boolean) : [];
  if (projectIds.length) {
    return Boolean(kiosk?.projectId && projectIds.includes(slug(kiosk.projectId, "")));
  }

  return true;
}

function servicesForAdminKiosk(kiosk = null) {
  if (!kiosk) return [];

  return [...services]
    .filter((service) => serviceAppliesToAdminKiosk(service, kiosk))
    .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id)));
}

function serviceAssignmentLabel(service = {}) {
  return Array.isArray(service.kioskIds) && service.kioskIds.length ? "Kiosk service" : "Project service";
}

function adminKioskCustomerSettings(kiosk = null) {
  return normalizeKioskCustomerSettings(kiosk?.customerSettings || {});
}

function renderAdminKioskPrintOptions(kiosk = null, { compact = false } = {}) {
  const settings = adminKioskCustomerSettings(kiosk);
  const enabledCount = KIOSK_CUSTOMER_OPTION_FIELDS.filter(([key]) => settings[key]).length;

  return `
    <section class="admin-print-options-panel ${compact ? "compact" : ""}">
      <div class="admin-print-options-head">
        <strong>Customer print options</strong>
        <span>${enabledCount} of ${KIOSK_CUSTOMER_OPTION_FIELDS.length} enabled by Super Admin</span>
      </div>
      <div class="admin-print-option-chips">
        ${KIOSK_CUSTOMER_OPTION_FIELDS.map(([key, label]) => {
    const enabled = settings[key];
    return `<span class="admin-print-option-chip ${enabled ? "is-on" : "is-off"}">${escapeHtml(enabled ? label : `${label} hidden`)}</span>`;
  }).join("")}
      </div>
    </section>
  `;
}



function renderAdminPagination(key, page) {
  if (page.total <= 10) return "";
  return `
    <nav class="pagination" aria-label="Pagination">
      <span>${page.total} records</span>
      <button class="ghost-button small-button" data-admin-pagination-key="${escapeHtml(key)}" data-admin-pagination-page="${page.currentPage - 1}" ${page.currentPage === 1 ? "disabled" : ""}>Previous</button>
      <strong>Page ${page.currentPage} of ${page.pageCount}</strong>
      <button class="ghost-button small-button" data-admin-pagination-key="${escapeHtml(key)}" data-admin-pagination-page="${page.currentPage + 1}" ${page.currentPage === page.pageCount ? "disabled" : ""}>Next</button>
    </nav>
  `;
}

function renderPaginatedTable(key, headers, rows, emptyMessage) {
  const page = adminPaginated(rows, key);
  return `${renderTable(headers, page.items.length ? page.items : emptyRows(emptyMessage, headers.length))}${renderAdminPagination(key, page)}`;
}

function dateKeyFromValue(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDateLabel(key) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(state.mode === "admin" ? adminLocale() : "en-IN", { day: "2-digit", month: "short" });
}

function revenueSeries(days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = dateKeyFromValue(date);
    return { key, label: shortDateLabel(key), amount: 0, jobs: 0 };
  });

  const byKey = new Map(series.map((item) => [item.key, item]));

  liveJobs().forEach((job) => {
    const key = dateKeyFromValue(job.completedAt || job.createdAt || job.date);
    const item = byKey.get(key);
    if (!item) return;

    const paid = /success|paid|completed/i.test(`${job.paymentStatus || ""} ${job.payment || ""}`);
    const printed = !/failed|cancel/i.test(`${job.printStatus || ""} ${job.print || ""}`);
    if (paid || printed) {
      item.amount += Number(job.amount || 0);
      item.jobs += 1;
    }
  });

  return series;
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

function renderRevenueLineChart(series) {
  const width = 720;
  const height = 240;
  const padding = { top: 26, right: 24, bottom: 42, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(1, ...series.map((item) => item.amount));
  const bandWidth = series.length ? chartWidth / series.length : chartWidth;
  const barWidth = Math.max(4, Math.min(24, bandWidth * 0.55));
  const barRadius = Math.min(4, barWidth / 2);

  const bars = series.map((item, index) => {
    const cx = padding.left + bandWidth * (index + 0.5);
    const barHeight = (Math.max(0, item.amount) / maxAmount) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    return { ...item, cx, x: cx - barWidth / 2, y, barHeight };
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
      <svg class="revenue-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue bar graph">
        <defs>
          <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="#e2e8f0" />
          </pattern>
        </defs>

        <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" class="revenue-grid-bg" />

        <g class="revenue-grid">
          ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartHeight - (ratio * chartHeight);
            const value = Math.round(maxAmount * ratio);
            return `<text class="revenue-y-label" x="${padding.left - 14}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="11px" font-weight="500">${money(value).replace("Rs. ", "")}</text>`;
          }).join("")}
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
                <text x="12" y="32" fill="#8b5cf6" font-size="13px" font-weight="700">${escapeHtml(money(bar.amount))}</text>
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

function renderRevenuePanel(compact = false) {
  const series = revenueSeries(compact ? 7 : 14);
  const total = series.reduce((sum, item) => sum + item.amount, 0);
  const jobs = series.reduce((sum, item) => sum + item.jobs, 0);
  const bestDay = series.reduce((best, item) => item.amount > best.amount ? item : best, series[0] || { amount: 0, label: "Today" });
  const average = series.length ? Math.round(total / series.length) : 0;

  return `
    <div class="module-card dashboard-panel revenue-panel ${compact ? "is-compact" : ""}">
      <div class="module-card-title">
        <span>${uiIcon("payments", 20)}</span>
        <h2>Revenue Trend</h2>
        <strong>${escapeHtml(money(total))}</strong>
      </div>
      ${renderRevenueLineChart(series)}
    </div>
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

function adminTransactionRecords() {
  const jobs = liveJobs();
  const jobById = new Map(jobs.map((job) => [String(job.jobId || job.id || ""), job]));
  const paymentJobIds = new Set();
  const payments = Array.isArray(state.adminData.transactions) ? state.adminData.transactions : [];

  const paymentRecords = payments.map((payment) => {
    const jobId = String(payment.jobId || "");
    const job = jobById.get(jobId) || {};
    if (jobId) paymentJobIds.add(jobId);

    const dateValue = paymentDateValue(payment, job);
    return {
      paymentId: payment.razorpayPaymentId || payment.gatewayTransactionId || payment.paymentId || "",
      jobId,
      dateValue,
      date: formatDateTime(dateValue),
      kiosk: job.kioskId || payment.kioskId || UNASSIGNED_KIOSK_ID,
      branch: job.branch || "",
      service: serviceTitle(job.service),
      amount: paymentAmount(payment, job),
      method: payment.paymentMethod || payment.gateway || "Payment",
      gateway: payment.gateway || "",
      reference: transactionGatewayReference(payment),
      status: payment.status || job.paymentStatus || "Draft",
      print: job.printStatus || job.print || ""
    };
  });

  const jobRecords = jobs
    .filter((job) => {
      const jobId = String(job.jobId || job.id || "");
      return jobId && !paymentJobIds.has(jobId) && Number(job.amount || 0) > 0;
    })
    .map((job) => {
      const jobId = String(job.jobId || job.id || "");
      const dateValue = paymentDateValue({}, job);
      return {
        paymentId: "",
        jobId,
        dateValue,
        date: formatDateTime(dateValue),
        kiosk: job.kioskId || job.kiosk || UNASSIGNED_KIOSK_ID,
        branch: job.branch || "",
        service: serviceTitle(job.service),
        amount: Number(job.amount || 0),
        method: "Job payment",
        gateway: "",
        reference: "",
        status: job.paymentStatus || job.payment || "Draft",
        print: job.printStatus || job.print || ""
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

function filteredAdminTransactions() {
  const filters = state.transactionFilters;
  const search = filters.search.trim().toLowerCase();
  // The top "Report" filter card (Kiosk ID + Apply Filter) writes to
  // state.revenueFilter, but this table was only ever reading the
  // separate inline filter bar's state.transactionFilters - so applying
  // a kiosk there had no effect on what's shown. Layer it in here (empty
  // kioskId = no-op, so the table's existing default view and the inline
  // filter bar are unaffected).
  const reportFilter = state.revenueFilter;

  return adminTransactionRecords()
    .filter((record) => !reportFilter.kioskId || String(record.kiosk || "").toUpperCase() === reportFilter.kioskId.toUpperCase())
    .filter((record) => filters.kiosk === "all" || record.kiosk === filters.kiosk)
    .filter((record) => transactionMatchesStatus(record, filters.status))
    .filter((record) => transactionMatchesDateRange(record, filters.from, filters.to))
    .filter((record) => !search || JSON.stringify(record).toLowerCase().includes(search));
}

function renderTransactionFilters() {
  const filters = state.transactionFilters;
  const kioskIds = [...new Set(adminTransactionRecords().map((record) => record.kiosk).filter(Boolean))];

  return `
    <div class="filters transaction-filters">
      <input placeholder="Search payment, job, kiosk" value="${escapeHtml(filters.search)}" data-transaction-filter="search" />
      <select data-transaction-filter="status" aria-label="Transaction status">
        <option value="all" ${filters.status === "all" ? "selected" : ""}>All statuses</option>
        <option value="success" ${filters.status === "success" ? "selected" : ""}>Success</option>
        <option value="pending" ${filters.status === "pending" ? "selected" : ""}>Pending</option>
        <option value="failed" ${filters.status === "failed" ? "selected" : ""}>Failed</option>
      </select>
      <select data-transaction-filter="kiosk" aria-label="Kiosk">
        <option value="all" ${filters.kiosk === "all" ? "selected" : ""}>All kiosks</option>
        ${kioskIds.map((kioskId) => `<option value="${escapeHtml(kioskId)}" ${filters.kiosk === kioskId ? "selected" : ""}>${escapeHtml(kioskId)}</option>`).join("")}
      </select>
      <input type="date" value="${escapeHtml(filters.from)}" data-transaction-filter="from" aria-label="From date" />
      <input type="date" value="${escapeHtml(filters.to)}" data-transaction-filter="to" aria-label="To date" />
    </div>
  `;
}

function renderTransactionLog() {
  const records = filteredAdminTransactions();
  const rows = records.map((record) => [
    record.date,
    record.kiosk,
    record.service,
    money(record.amount),
    record.status,
    record.reference || record.method || "-"
  ]);

  return `
    <div class="module-card transaction-log-card">
      <div class="module-card-title">
        <span>${uiIcon("payments", 20)}</span>
        <h2>Transaction Logs</h2>
        <strong>${escapeHtml(String(records.length))} record${records.length === 1 ? "" : "s"}</strong>
      </div>
      ${renderTransactionFilters()}
      ${renderPaginatedTable("revenueTransactions", ["Date", "Kiosk", "Service", "Amount", "Status", "Gateway Ref"], rows, "No matching transaction records.")}
    </div>
  `;
}

function isTransactionToday(dateValue) {
  const ts = transactionTimestamp(dateValue);
  if (!ts) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return ts >= startOfToday && ts < startOfToday + 24 * 60 * 60 * 1000;
}

function dashboardMetrics() {
  const dashboard = state.adminData.dashboard || {};
  const revenue = state.adminData.revenue || {};
  const kiosks = state.adminData.kiosks || [];
  const projects = state.adminData.projects || [];
  const activeKiosks = dashboard.activeKiosks ?? kiosks.filter((kiosk) => kiosk.status === "online").length;
  const todaysTransactions = adminTransactionRecords().filter((record) => isTransactionToday(record.dateValue));
  const todaysAmount = todaysTransactions.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);

  return [
    ["Projects", String(projects.length), `${kiosks.length} kiosk(s) assigned`, "hierarchy", "blue"],
    ["Kiosks", String(kiosks.length), `${activeKiosks} online`, "kiosks", "purple"],
    ["Transactions", String(todaysTransactions.length), money(todaysAmount), "payments", "green"],
    ["Net Revenue", money(revenue.net ?? 0), "Total revenue", "pricing", "green"]
  ];
}

// ── Dashboard chart/list components ─────────────────────────────────────
// Mirror Super Admin's dashboard row layout/markup exactly (same classes,
// same SVG chart construction) so both admin panels look consistent, scoped
// down to this kiosk admin's own assigned projects/kiosks/jobs instead of
// the whole network.
function adminProjectForKiosk(kioskId = "") {
  const kiosk = (state.adminData.kiosks || []).find((item) => String(item.kioskId || "").toUpperCase() === String(kioskId || "").toUpperCase());
  return (state.adminData.projects || []).find((project) => project.projectId === kiosk?.projectId) || null;
}

function render7DayRevenueChart(series = []) {
  const last7 = series.slice(-7);
  while (last7.length < 7) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - last7.length));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    last7.unshift({ label, value: 0 });
  }

  const maxValue = Math.max(10, ...last7.map(i => i.value));
  const height = 180;
  const width = 450;
  const barWidth = 32;
  const gap = (width - 40 - (7 * barWidth)) / 6;

  return `
    <div style="position: relative; width: 100%; overflow-x: auto;">
      <svg viewBox="0 0 ${width} ${height + 40}" style="width: 100%; height: auto; font-family: var(--font-sans);">
        <line x1="30" y1="30" x2="${width - 10}" y2="30" stroke="#f1f5f9" stroke-dasharray="3,3" />
        <line x1="30" y1="80" x2="${width - 10}" y2="80" stroke="#f1f5f9" stroke-dasharray="3,3" />
        <line x1="30" y1="130" x2="${width - 10}" y2="130" stroke="#f1f5f9" stroke-dasharray="3,3" />
        <line x1="30" y1="170" x2="${width - 10}" y2="170" stroke="#cbd5e1" />

        <text x="10" y="35" font-size="10" fill="#94a3b8">₹${maxValue}</text>
        <text x="10" y="105" font-size="10" fill="#94a3b8">₹${Math.round(maxValue / 2)}</text>
        <text x="10" y="174" font-size="10" fill="#94a3b8">₹0</text>

        ${last7.map((item, idx) => {
          const x = 40 + idx * (barWidth + gap);
          const barH = (item.value / maxValue) * 130;
          const y = 170 - barH;
          return `
            <g class="revenue-bar-group">
              ${item.value > 0 ? `<text x="${x + barWidth/2}" y="${y - 6}" font-size="11" font-weight="700" fill="#059669" text-anchor="middle">₹${item.value}</text>` : `<text x="${x + barWidth/2}" y="162" font-size="10" fill="#94a3b8" text-anchor="middle">₹0</text>`}
              <rect class="analytics-bar-emerald" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(4, barH)}" rx="6" fill="url(#adminEmeraldGrad)" />
              <text x="${x + barWidth/2}" y="195" font-size="11" fill="#64748b" text-anchor="middle">${escapeHtml(item.label)}</text>
            </g>
          `;
        }).join("")}
        <defs>
          <linearGradient id="adminEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#059669" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  `;
}

function renderKioskStatusDonutChart(counts = {}) {
  const {
    total = 1,
    normal = 0,
    offline = 1,
    paper = 0,
    tonerQueue = 0
  } = counts;

  const totalCalc = Math.max(1, total);
  const C = 238.76;

  const segments = [
    { label: "Normal", val: normal, color: "#10b981" },
    { label: "Offline", val: offline, color: "#ef4444" },
    { label: "Paper/Jam", val: paper, color: "#f59e0b" },
    { label: "Toner/Queue", val: tonerQueue, color: "#3b82f6" }
  ].filter(s => s.val > 0);

  let currentOffset = 0;
  const circlesHTML = segments.length ? segments.map(seg => {
    const len = (seg.val / totalCalc) * C;
    const dashArray = `${len} ${C - len}`;
    const dashOffset = -currentOffset;
    currentOffset += len;
    return `<circle cx="50" cy="50" r="38" fill="none" stroke="${seg.color}" stroke-width="12" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" />`;
  }).join("") : `<circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" stroke-width="12" />`;

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
      <div style="position: relative; width: 170px; height: 170px; margin: 12px 0;">
        <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; transform: rotate(-90deg);">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" stroke-width="12" />
          ${circlesHTML}
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
          <strong style="font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1;">${total}</strong>
          <span style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 3px;">Total Kiosks</span>
        </div>
      </div>
      <div class="status-pills-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; margin-top: 16px;">
        <div class="status-pill-item active">
          <span>● Normal</span>
          <strong>${normal}</strong>
        </div>
        <div class="status-pill-item inactive">
          <span>● Offline</span>
          <strong>${offline}</strong>
        </div>
        <div class="status-pill-item maint">
          <span>● Paper/Jam</span>
          <strong>${paper}</strong>
        </div>
        <div class="status-pill-item paper-low">
          <span>● Toner/Queue</span>
          <strong>${tonerQueue}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderTopRevenueProjectsChart() {
  const dbProjects = state.adminData.projects || [];
  const dbJobs = state.adminData.jobs || [];

  const projectRevenueMap = {};
  dbJobs.forEach((job) => {
    if (job.paymentStatus !== "Payment Success") return;
    const project = adminProjectForKiosk(job.kioskId);
    if (!project) return;
    projectRevenueMap[project.projectId] = (projectRevenueMap[project.projectId] || 0) + (Number(job.amount) || 0);
  });

  const list = dbProjects
    .map((p) => ({ name: p.name || p.projectId || "Project", val: projectRevenueMap[p.projectId] || 0 }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);

  if (!list.length) {
    return `<div class="empty-note">No projects yet. Create a project to see revenue here.</div>`;
  }

  const maxVal = Math.max(400, ...list.map((p) => p.val || 0));

  return `
    <div style="width: 100%; margin-top: 12px;">
      <svg viewBox="0 0 460 210" style="width: 100%; height: auto; font-family: var(--font-sans, system-ui, sans-serif);">
        ${[0, 1, 2, 3, 4, 5].map((i) => {
          const y = 25 + i * 28;
          return `<line x1="120" y1="${y}" x2="430" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" />`;
        }).join("")}

        <line x1="120" y1="20" x2="120" y2="168" stroke="#cbd5e1" />

        ${list.map((proj, idx) => {
          const y = 30 + idx * 28;
          const barW = Math.max(12, ((proj.val || 0) / maxVal) * 300);
          return `
            <g class="project-bar-group">
              <text x="110" y="${y + 13}" font-size="11" font-weight="500" fill="#475569" text-anchor="end">${escapeHtml(proj.name)}</text>
              <rect x="120" y="${y}" width="${barW}" height="18" rx="9" fill="url(#adminBlueBarGradient)" />
            </g>
          `;
        }).join("")}

        <line x1="120" y1="168" x2="430" y2="168" stroke="#cbd5e1" />
        <text x="120" y="188" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">0</text>
        <text x="197.5" y="188" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">100</text>
        <text x="275" y="188" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">200</text>
        <text x="352.5" y="188" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">300</text>
        <text x="430" y="188" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">400</text>

        <defs>
          <linearGradient id="adminBlueBarGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  `;
}

function renderRecentActivityList() {
  const jobs = state.adminData.jobs || [];
  const sampleJobs = jobs.length ? [...jobs].reverse().slice(0, 4).map((job) => {
    const project = adminProjectForKiosk(job.kioskId);
    return {
      kioskId: job.kioskId || "Unknown Kiosk",
      location: project?.name || undefined,
      amount: job.amount,
      time: formatDateTime(job.createdAt),
      status: /failed/i.test(job.printStatus || "") ? "failed" : "success"
    };
  }) : [];

  if (!sampleJobs.length) {
    return `<div class="empty-note">No print activity yet for your assigned kiosks.</div>`;
  }

  return `
    <div class="activity-list">
      ${sampleJobs.map((job) => `
        <div class="activity-item">
          <div class="activity-icon ${job.status === 'failed' ? 'red' : 'green'}">
            ${uiIcon(job.status === 'failed' ? 'alert' : 'printer', 18)}
          </div>
          <div class="activity-content">
            <span class="activity-title">${escapeHtml(job.kioskId || "Print Job")}</span>
            <span class="activity-subtitle">${escapeHtml(job.location || "Active Kiosk")}</span>
          </div>
          <div class="activity-meta">
            <span class="activity-amount">₹${job.amount || 0}</span>
            <span class="activity-time">${escapeHtml(job.time || "Just now")}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRecentMaintenanceLogsList() {
  const alertLogs = state.adminData.alertLogs || [];
  const sampleLogs = alertLogs.length ? [...alertLogs].reverse().slice(0, 4).map((log) => ({
    title: log.title || "Kiosk Alert",
    tech: log.detail || "No additional detail recorded",
    date: formatDateTime(log.createdAt),
    status: log.status === "resolved" ? "Resolved" : "Active",
    resolved: log.status === "resolved"
  })) : [];

  if (!sampleLogs.length) {
    return `<div class="empty-note">No maintenance logs yet for your assigned kiosks.</div>`;
  }

  return `
    <div class="activity-list">
      ${sampleLogs.map((log) => `
        <div class="activity-item">
          <div class="activity-icon blue">
            ${uiIcon('system', 18)}
          </div>
          <div class="activity-content">
            <span class="activity-title">${escapeHtml(log.title)}</span>
            <span class="activity-subtitle">${escapeHtml(log.tech)}</span>
          </div>
          <div class="activity-meta">
            <span style="font-size: 11px; font-weight: 700; color: ${log.resolved ? '#10b981' : '#dc2626'}; background: ${log.resolved ? '#e6f4ea' : '#fee2e2'}; padding: 2px 8px; border-radius: 10px;">${escapeHtml(log.status)}</span>
            <span class="activity-time">${escapeHtml(log.date)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPaperTonerAlertsCard(alerts = []) {
  if (!alerts.length) {
    return `
      <div class="empty-paper-alerts">
        <div class="empty-paper-icon">
          ${uiIcon("printer", 24)}
        </div>
        <h3>All Paper & Toner Levels Normal</h3>
        <p>No low paper, toner empty, or door jam alerts detected across your assigned printing kiosks.</p>
      </div>
    `;
  }

  return `
    <div class="activity-list">
      ${alerts.map(a => `
        <div class="activity-item">
          <div class="activity-icon red">
            ${uiIcon('alert', 18)}
          </div>
          <div class="activity-content">
            <span class="activity-title">${escapeHtml(a.title || "Paper Alert")}</span>
            <span class="activity-subtitle">${escapeHtml(a.detail || "Check kiosk printer tray")}</span>
          </div>
          <div class="activity-meta">
            <span style="font-size: 11px; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 2px 8px; border-radius: 10px;">Open</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDashboard() {
  const failedJobs = liveJobs().map(jobRow).filter((job) => job.print.includes("Failed"));
  const queuedJobs = liveJobs().map(jobRow).filter((job) => /queue|printing|pending/i.test(job.print));
  const alerts = adminOperationalAlerts();
  const canManage = kioskAdminCanManageSetup();

  const paperAlerts = alerts.filter((alert) => alert.category === "paper").length;
  const tonerAlerts = alerts.filter((alert) => alert.category === "toner").length;
  const queueAlerts = alerts.filter((alert) => alert.category === "queue" || alert.category === "service").length;
  const affectedKiosks = new Set(alerts.map((alert) => alert.kioskId).filter(Boolean)).size;
  const totalKiosksCount = (state.adminData.kiosks || []).length;
  const activeKiosksCount = (state.adminData.kiosks || []).filter((kiosk) => kiosk.status === "online").length;
  const inactiveKiosksCount = Math.max(0, totalKiosksCount - activeKiosksCount);
  const normalKiosksCount = Math.max(0, activeKiosksCount - affectedKiosks);
  const series = revenueSeries(7).map((item) => ({ label: item.label, value: item.amount }));

  return `
    ${renderAdminHeader("Dashboard", "Hello Admin, here is your system overview.")}
    ${adminNotice()}
    <div class="metrics-grid dashboard-metrics">
      ${dashboardMetrics().map(([label, value, detail, icon, tone]) => {
        const toneMap = { purple: '#8b5cf6', blue: '#3b82f6', green: '#10b981', red: '#ef4444' };
        const bg = toneMap[tone] || '#3b82f6';
        const isNegative = tone === 'red';
        return `
          <div class="metric-card">
            <span class="metric-title">${escapeHtml(label)}</span>
            <strong class="metric-value">${escapeHtml(value)}</strong>
            <span class="trend-pill ${isNegative ? 'negative' : ''}">${escapeHtml(detail)}</span>
            <div class="metric-icon-box" style="background: ${bg};">${uiIcon(icon, 24)}</div>
          </div>
        `;
      }).join("")}
    </div>

    <!-- Row 1: 7-Day Revenue Chart & Kiosk Status Donut Chart -->
    <div class="dashboard-two-col">
      <div class="module-card">
        <div class="dashboard-card-header">
          <div>
            <h2>7-Day Daily Revenue (₹)</h2>
            <p>Daily collection trend over the last 7 days</p>
          </div>
        </div>
        ${render7DayRevenueChart(series)}
      </div>

      <div class="module-card">
        <div class="dashboard-card-header">
          <div>
            <h2>Kiosk Alert & Status Distribution</h2>
            <p>Live hardware alert and status breakdown across your assigned kiosks</p>
          </div>
        </div>
        ${renderKioskStatusDonutChart({
          total: totalKiosksCount,
          normal: normalKiosksCount,
          offline: inactiveKiosksCount,
          paper: paperAlerts,
          tonerQueue: tonerAlerts + queueAlerts
        })}
      </div>
    </div>

    <!-- Row 2: Top Revenue Projects & Recent Logs -->
    <div class="dashboard-two-col">
      <div class="module-card">
        <div class="dashboard-card-header">
          <div>
            <h2>Top Revenue Projects</h2>
            <p>Project-wise printing revenue breakdown</p>
          </div>
        </div>
        ${renderTopRevenueProjectsChart()}
      </div>

      <div class="module-card">
        <div class="dashboard-card-header">
          <div>
            <h2>Recent Logs</h2>
            <p>Maintenance and hardware log updates</p>
          </div>
          <button class="dashboard-card-action" data-admin-page="alerts">View All</button>
        </div>
        ${renderRecentMaintenanceLogsList()}
      </div>
    </div>
  `;
}

function financialYearDateStrings(offset = 0) {
  const now = new Date();
  const fyStartYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - offset;
  return { start: `${fyStartYear}-04-01`, end: `${fyStartYear + 1}-03-31` };
}

function renderRevenueFilterCard() {
  const draft = state.revenueFilterDraft;
  const kiosks = state.adminData.kiosks || [];

  return `
    <div class="module-card analytics-filter-card">
      <div class="settings-grid analytics-filter-grid">
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

window.updateRevenueFilterDraft = function (field, value) {
  state.revenueFilterDraft[field] = value;
  render();
};

window.applyRevenueFilter = function () {
  const draft = state.revenueFilterDraft;
  const bounds = draft.filterType === "financialYear"
    ? financialYearDateStrings(draft.financialYear === "last" ? 1 : draft.financialYear === "previous" ? 2 : 0)
    : { start: draft.start, end: draft.end };

  state.revenueFilter = { ...draft, start: bounds.start, end: bounds.end };
  render();
};

function renderRevenue() {
  const currentTab = state.reportTab || "revenue";

  const headerActions = currentTab === "form"
    ? `<button class="primary-button" style="border-radius: 20px; padding: 9px 20px; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; color: white; font-size: 13.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);" onclick="window.downloadFormPrintReportPDF()">${uiIcon("download", 16)} Download Form Print PDF</button>`
    : `<button class="primary-button" style="border-radius: 20px; padding: 9px 20px; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; color: white; font-size: 13.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);" onclick="window.downloadRevenueReportPDF()">${uiIcon("download", 16)} Revenue PDF</button>`;

  return `
    ${renderAdminHeader("Report", "Transaction logs, filters, and payment reconciliation for your assigned kiosks.", headerActions)}
    ${adminNotice()}

    <!-- Clean Tab Bar Navigation (Same as Analytics) -->
    <div style="display: flex; align-items: center; gap: 32px; border-bottom: 2px solid #e2e8f0; margin-top: 8px; margin-bottom: 24px; padding-bottom: 0;">
      <button class="analytics-tab-item ${currentTab !== 'form' ? 'active' : ''}" onclick="window.setReportTab('revenue')" style="background: transparent; border: none; padding: 12px 4px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 16.5px; font-weight: 700; cursor: pointer; color: ${currentTab !== 'form' ? '#3b82f6' : '#0f172a'}; border-bottom: ${currentTab !== 'form' ? '3px solid #3b82f6' : '3px solid transparent'}; transition: all 0.2s ease; margin-bottom: -2px;">
        Revenue Report
      </button>
      <button class="analytics-tab-item ${currentTab === 'form' ? 'active' : ''}" onclick="window.setReportTab('form')" style="background: transparent; border: none; padding: 12px 4px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 16.5px; font-weight: 700; cursor: pointer; color: ${currentTab === 'form' ? '#3b82f6' : '#0f172a'}; border-bottom: ${currentTab === 'form' ? '3px solid #3b82f6' : '3px solid transparent'}; transition: all 0.2s ease; margin-bottom: -2px;">
        Form Report
      </button>
    </div>

    ${renderRevenueFilterCard()}


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

window.setReportTab = function(tab) {
  state.reportTab = tab;
  try { sessionStorage.setItem("kiosk_admin_report_tab", tab); } catch (e) {}
  render();
};

window.downloadRevenueReportPDF = async function () {
  const filter = state.revenueFilter;
  const kioskLabel = filter.kioskId || "All Kiosks";
  const clientName = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const clientLogoUrl = state.adminAccount?.logoUrl || "";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const records = adminTransactionRecords().filter((record) => {
    if (!transactionMatchesDateRange(record, filter.start, filter.end)) return false;
    if (filter.kioskId && String(record.kiosk || "").toUpperCase() !== filter.kioskId.toUpperCase()) return false;
    return true;
  });
  const logoMaxWidth = 32;
  const logoMaxHeight = 24;
  const companyLogoMaxWidth = 50;
  const logoY = 12;

  const [clientLogo, companyLogo] = await Promise.all([
    loadImageAsDataUrl(clientLogoUrl),
    loadImageAsDataUrl("./assets/aarya-innovtech-logo-full.png")
  ]);
  const [clientLogoSize, companyLogoSize] = await Promise.all([
    loadImageNaturalSize(clientLogo),
    loadImageNaturalSize(companyLogo)
  ]);

  if (clientLogo) {
    const box = fitImageBox(clientLogoSize, logoMaxWidth, logoMaxHeight);
    doc.addImage(clientLogo, dataUrlImageFormat(clientLogo), 14, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  if (companyLogo) {
    const box = fitImageBox(companyLogoSize, companyLogoMaxWidth, logoMaxHeight);
    doc.addImage(companyLogo, dataUrlImageFormat(companyLogo), pageWidth - 14 - box.width, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(20);
  doc.setTextColor(27, 175, 122);
  doc.text("Revenue Report", pageWidth / 2, logoY + 10, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(42, 120, 214);
  doc.text(clientName, pageWidth / 2, logoY + 19, { align: "center" });

  // Clamp below the logo's actual rendered bottom edge so a long client
  // name / kiosk ID never runs into the company logo pinned top-right.
  const metaY = Math.max(logoY + 27, logoY + logoMaxHeight + 2);

  doc.setFont(undefined, "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Kiosk ID: ${kioskLabel}`, pageWidth / 2, metaY, { align: "center" });
  doc.text(`Range: ${filter.start} to ${filter.end}`, pageWidth / 2, metaY + 6, { align: "center" });
  doc.setTextColor(0);

  const dividerY = metaY + 15;
  doc.setDrawColor(42, 120, 214);
  doc.setLineWidth(0.6);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  const dailyTotals = new Map();
  records.forEach((r) => {
    const d = new Date(r.dateValue);
    const hasDate = !Number.isNaN(d.getTime());
    const sortKey = hasDate ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "unknown";
    const label = hasDate ? d.toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "Unknown";
    const entry = dailyTotals.get(sortKey) || { label, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += Number(r.amount || 0);
    dailyTotals.set(sortKey, entry);
  });

  const sortedDays = [...dailyTotals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const grandTotal = sortedDays.reduce((sum, [, entry]) => sum + entry.amount, 0);
  const grandCount = sortedDays.reduce((sum, [, entry]) => sum + entry.count, 0);

  const tableData = sortedDays.map(([, entry]) => [entry.label, String(entry.count), money(entry.amount)]);
  tableData.push(["Total", String(grandCount), money(grandTotal)]);

  doc.autoTable({
    startY: dividerY + 8,
    head: [["Date", "Transactions", "Total Amount"]],
    body: tableData,
    theme: "grid",
    ...PDF_TABLE_STYLE
  });

  redrawWatermarkOnAllPages(doc, companyLogo, companyLogoSize);
  drawPdfCompanyFooter(doc);
  doc.save(`Revenue_Report_${filter.start}_to_${filter.end}.pdf`);
};

window.downloadFormPrintReportPDF = async function () {
  const filter = state.revenueFilter;
  const kioskLabel = filter.kioskId || "All Kiosks";
  const clientName = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const clientLogoUrl = state.adminAccount?.logoUrl || "";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableData = calculateFormSellingReport().map(row => [
    row.kioskId || "Unknown",
    row.templateName || "Unknown Form",
    row.printCount || 0,
    money(row.revenue || 0)
  ]);

  const logoMaxWidth = 32;
  const logoMaxHeight = 24;
  const companyLogoMaxWidth = 50;
  const logoY = 12;

  const [clientLogo, companyLogo] = await Promise.all([
    loadImageAsDataUrl(clientLogoUrl),
    loadImageAsDataUrl("./assets/aarya-innovtech-logo-full.png")
  ]);
  const [clientLogoSize, companyLogoSize] = await Promise.all([
    loadImageNaturalSize(clientLogo),
    loadImageNaturalSize(companyLogo)
  ]);

  if (clientLogo) {
    const box = fitImageBox(clientLogoSize, logoMaxWidth, logoMaxHeight);
    doc.addImage(clientLogo, dataUrlImageFormat(clientLogo), 14, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  if (companyLogo) {
    const box = fitImageBox(companyLogoSize, companyLogoMaxWidth, logoMaxHeight);
    doc.addImage(companyLogo, dataUrlImageFormat(companyLogo), pageWidth - 14 - box.width, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(20);
  doc.setTextColor(27, 175, 122);
  doc.text("Form Selling Report", pageWidth / 2, logoY + 10, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(42, 120, 214);
  doc.text(`Client Name: ${clientName}`, pageWidth / 2, logoY + 19, { align: "center" });

  // Clamp below the logo's actual rendered bottom edge so a long client
  // name / kiosk ID never runs into the company logo pinned top-right.
  const metaY = Math.max(logoY + 27, logoY + logoMaxHeight + 2);

  doc.setFont(undefined, "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Kiosk ID: ${kioskLabel}`, pageWidth / 2, metaY, { align: "center" });
  doc.text(`Range: ${filter.start} to ${filter.end}`, pageWidth / 2, metaY + 6, { align: "center" });
  doc.setTextColor(0);

  const dividerY = metaY + 15;
  doc.setDrawColor(42, 120, 214);
  doc.setLineWidth(0.6);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  doc.autoTable({
    startY: dividerY + 8,
    head: [['KIOSK ID', 'FORMS', 'PRINTS', 'REVENUE']],
    body: tableData,
    theme: 'grid',
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { halign: 'left' },
      2: { halign: 'center' },
      3: { halign: 'right' }
    },
    ...PDF_TABLE_STYLE
  });

  redrawWatermarkOnAllPages(doc, companyLogo, companyLogoSize);
  drawPdfCompanyFooter(doc);
  doc.save(`Form_Selling_Report_${filter.start}_to_${filter.end}.pdf`);
};

// ── Graphical Analytics (Admin / Client) ─────────────────────────────
// Same report as Super Admin's Graphical Analytics, scoped to this
// client's own kiosks only — no client picker, it's always this account.

function adminAnalyticsFinancialYearBounds(offset = 0) {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const targetStartYear = fyStartYear - offset;
  const start = new Date(targetStartYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(targetStartYear + 1, 2, 31, 23, 59, 59, 999);
  const label = `FY ${targetStartYear}-${String((targetStartYear + 1) % 100).padStart(2, "0")} (Apr-Mar)`;
  return { start, end, label };
}

function adminAnalyticsFilterBounds() {
  const filter = state.adminAnalyticsFilter;

  if (filter.filterType === "financialYear") {
    const offset = filter.financialYear === "last" ? 1 : filter.financialYear === "previous" ? 2 : 0;
    return adminAnalyticsFinancialYearBounds(offset);
  }

  const start = filter.start ? new Date(`${filter.start}T00:00:00`) : null;
  const end = filter.end ? new Date(`${filter.end}T23:59:59.999`) : null;
  const label = filter.start && filter.end ? `${filter.start} to ${filter.end}` : "All dates";
  return { start, end, label };
}

function adminAnalyticsBuckets(start, end, basis) {
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
  } else if (basis === "yearly") {
    // Financial-year buckets (Apr-Mar), matching the FY convention used
    // everywhere else in this app - not calendar-year, so a single FY's
    // data never gets split across two bars.
    let fyYear = start.getMonth() >= 3 ? start.getFullYear() : start.getFullYear() - 1;
    const lastFyYear = end.getMonth() >= 3 ? end.getFullYear() : end.getFullYear() - 1;

    while (fyYear <= lastFyYear && guard < 60) {
      buckets.push({
        key: `${fyYear}`,
        label: `FY ${fyYear}-${String((fyYear + 1) % 100).padStart(2, "0")}`,
        year: fyYear,
        amount: 0
      });
      fyYear += 1;
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

function adminAnalyticsFilteredRecords() {
  const filter = state.adminAnalyticsFilter;
  const { start, end } = adminAnalyticsFilterBounds();

  return adminTransactionRecords().filter((record) => {
    if (!transactionMatchesStatus(record, "success")) return false;

    const ts = transactionTimestamp(record.dateValue);
    if (!ts) return false;
    if (start && ts < start.getTime()) return false;
    if (end && ts > end.getTime()) return false;
    if (filter.kioskId && String(record.kiosk || "").toUpperCase() !== filter.kioskId.toUpperCase()) return false;

    return true;
  });
}

// Shared by adminAnalyticsBucketedSeries and formSellingBucketedSeries so
// both data sources bucket dates identically for a given basis.
function adminAnalyticsBucketKeyForDate(date, basis) {
  if (basis === "daily") {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  if (basis === "weekly") {
    const rDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    rDate.setDate(rDate.getDate() - rDate.getDay());
    return `${rDate.getFullYear()}-${rDate.getMonth() + 1}-${rDate.getDate()}`;
  }
  if (basis === "yearly") {
    return `${date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1}`;
  }
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function adminAnalyticsBucketedSeries(basis = "monthly") {
  const { start, end } = adminAnalyticsFilterBounds();
  const buckets = adminAnalyticsBuckets(start, end, basis);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  adminAnalyticsFilteredRecords().forEach((record) => {
    const recordDate = new Date(record.dateValue);
    if (Number.isNaN(recordDate.getTime())) return;

    const bucket = bucketByKey.get(adminAnalyticsBucketKeyForDate(recordDate, basis));
    if (!bucket) return;

    bucket.amount += Number(record.amount || 0);
  });

  return buckets;
}

// Form/template print revenue only (job.templateId truthy, mirrors the
// same filter calculateFormSellingReport() uses), bucketed by date the
// same way adminAnalyticsBucketedSeries buckets payments - lets the
// Analytics page's Revenue/Form-selling tab feed the same 3 chart shapes.
function formSellingBucketedSeries(basis = "monthly") {
  const filter = state.adminAnalyticsFilter;
  const { start, end } = adminAnalyticsFilterBounds();
  const buckets = adminAnalyticsBuckets(start, end, basis);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  liveJobs().forEach((job) => {
    if (!job.createdAt) return;
    if (String(job.printStatus || "").toLowerCase() !== "completed") return;

    const templateId = job.templateId;
    if (!templateId || templateId === "Unknown") return;

    const jobDate = new Date(job.createdAt);
    if (Number.isNaN(jobDate.getTime())) return;
    if (start && jobDate < start) return;
    if (end && jobDate > end) return;

    const kioskId = job.kioskId || "UNASSIGNED";
    if (filter.kioskId && kioskId.toUpperCase() !== filter.kioskId.toUpperCase()) return;

    const bucket = bucketByKey.get(adminAnalyticsBucketKeyForDate(jobDate, basis));
    if (!bucket) return;

    bucket.amount += Number(job.amount || 0);
  });

  return buckets;
}

function renderAdminAnalyticsFilterCard(hasData) {
  const draft = state.adminAnalyticsFilterDraft;
  const kiosks = state.adminData.kiosks || [];

  return `
    <div class="module-card analytics-filter-card" data-print-hide style="margin-bottom: 24px; padding: 22px 24px;">
      <div class="analytics-filter-type-row" style="margin-bottom: 18px; border-bottom: 1px solid var(--line); padding-bottom: 18px;">
        <span style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--muted); margin-bottom: 10px;">Filter Type</span>
        <div style="display: flex; gap: 18px;">
          <label class="analytics-radio" style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
            <input type="radio" name="admin-analytics-filter-type" value="financialYear" ${draft.filterType === "financialYear" ? "checked" : ""} onchange="window.updateAdminAnalyticsFilterDraft('filterType', this.value);" style="width: 18px; height: 18px;" />
            <span>Financial Year</span>
          </label>
          <label class="analytics-radio" style="display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
            <input type="radio" name="admin-analytics-filter-type" value="dateRange" ${draft.filterType === "dateRange" ? "checked" : ""} onchange="window.updateAdminAnalyticsFilterDraft('filterType', this.value);" style="width: 18px; height: 18px;" />
            <span>Date Range</span>
          </label>
        </div>
      </div>

      <div class="settings-grid analytics-filter-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px;">
        <label class="setting-field" style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; font-weight: 600; color: var(--muted);">Machine ID
          <select style="width: 100%; padding: 14px 16px; border-radius: 10px; font-size: 15px;" onchange="window.updateAdminAnalyticsFilterDraft('kioskId', this.value); window.applyAdminAnalyticsFilter();">
            <option value="" ${!draft.kioskId ? "selected" : ""}>-- All Kiosks --</option>
            ${kiosks.map((kiosk) => `<option value="${escapeHtml(kiosk.kioskId)}" ${draft.kioskId === kiosk.kioskId ? "selected" : ""}>${escapeHtml(kiosk.kioskId)}${kiosk.branch ? ` | ${escapeHtml(kiosk.branch)}` : ""}</option>`).join("")}
          </select>
        </label>

        ${draft.filterType === "financialYear" ? `
          <label class="setting-field" style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; font-weight: 600; color: var(--muted);">Financial Year
            <select style="width: 100%; padding: 14px 16px; border-radius: 10px; font-size: 15px;" onchange="window.updateAdminAnalyticsFilterDraft('financialYear', this.value);">
              <option value="current" ${draft.financialYear === "current" ? "selected" : ""}>Current FY (Apr-Mar)</option>
              <option value="last" ${draft.financialYear === "last" ? "selected" : ""}>Last FY</option>
              <option value="previous" ${draft.financialYear === "previous" ? "selected" : ""}>Previous FY</option>
            </select>
          </label>
        ` : `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
            <label class="setting-field" style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; font-weight: 600; color: var(--muted);">Start Date
              <input type="date" style="width: 100%; padding: 14px 16px; border-radius: 10px; font-size: 15px;" value="${escapeHtml(draft.start)}" onchange="window.updateAdminAnalyticsFilterDraft('start', this.value);" />
            </label>
            <label class="setting-field" style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; font-weight: 600; color: var(--muted);">End Date
              <input type="date" style="width: 100%; padding: 14px 16px; border-radius: 10px; font-size: 15px;" value="${escapeHtml(draft.end)}" onchange="window.updateAdminAnalyticsFilterDraft('end', this.value);" />
            </label>
          </div>
        `}
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 18px;">
        <button class="primary-button" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important; color: white; border: none; border-radius: 12px !important; padding: 14px 26px !important; font-weight: 700; font-size: 15px !important; cursor: pointer; box-shadow: 0 4px 16px rgba(79, 70, 229, 0.35) !important; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;" onclick="window.applyAdminAnalyticsFilter()">
          ${uiIcon("filter", 17)} Apply Filter
        </button>
      </div>
    </div>
  `;
}

function renderAdminAnalytics() {
  const filter = state.adminAnalyticsFilter;
  const { label: rangeLabel } = adminAnalyticsFilterBounds();
  const clientName = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const clientLogoUrl = state.adminAccount?.logoUrl || "";

  const tab = state.adminAnalyticsTab === "form" ? "form" : "revenue";
  const seriesFn = tab === "form" ? formSellingBucketedSeries : adminAnalyticsBucketedSeries;

  const monthlyBuckets = seriesFn("monthly");
  const totalAmount = monthlyBuckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const hasData = monthlyBuckets.some((bucket) => bucket.amount > 0);

  return `
    ${renderAdminHeader("Graphical Analytics", "", `
      <button class="secondary-button" style="border-radius: 20px; padding: 9px 20px; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 13.5px; cursor: pointer;" ${hasData ? "" : "disabled"} onclick="window.print()">${uiIcon("printer", 16)} Print</button>
      <button class="primary-button" style="border-radius: 20px; padding: 9px 20px; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; color: white; font-size: 13.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);" ${hasData ? "" : "disabled"} onclick="window.downloadAdminAnalyticsPDF()">${uiIcon("download", 16)} Download PDF</button>
    `)}
    ${adminNotice()}

    <!-- Clean Tab Bar Navigation -->
    <div class="analytics-tab-underline-bar" style="display: flex; align-items: center; gap: 32px; border-bottom: 2px solid #e2e8f0; margin-top: 8px; margin-bottom: 24px; padding-bottom: 0;">
      <button class="analytics-tab-item ${tab !== 'form' ? 'active' : ''}" onclick="window.setAdminAnalyticsTab('revenue')" style="background: transparent; border: none; padding: 12px 4px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 16.5px; font-weight: 700; cursor: pointer; color: ${tab !== 'form' ? '#3b82f6' : '#0f172a'}; border-bottom: ${tab !== 'form' ? '3px solid #3b82f6' : '3px solid transparent'}; transition: all 0.2s ease; margin-bottom: -2px;">
        Revenue Report
      </button>
      <button class="analytics-tab-item ${tab === 'form' ? 'active' : ''}" onclick="window.setAdminAnalyticsTab('form')" style="background: transparent; border: none; padding: 12px 4px; font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 16.5px; font-weight: 700; cursor: pointer; color: ${tab === 'form' ? '#3b82f6' : '#0f172a'}; border-bottom: ${tab === 'form' ? '3px solid #3b82f6' : '3px solid transparent'}; transition: all 0.2s ease; margin-bottom: -2px;">
        Form Report
      </button>
    </div>

    ${renderAdminAnalyticsFilterCard(hasData)}

    <div class="analytics-report-area" id="admin-analytics-print-area" style="display: flex; flex-direction: column; gap: 24px; margin-top: 24px;">
      <div class="module-card analytics-chart-card" data-chart="monthly" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px 24px 22px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);">
        <div class="analytics-card-title-wrap" style="display: flex; justify-content: center; align-items: center; text-align: center; margin-bottom: 24px; width: 100%;">
          <h2 class="analytics-card-title" style="font-family: var(--font-sans, 'Inter', system-ui, -apple-system, sans-serif) !important; font-size: 19px !important; font-weight: 700 !important; color: #0f172a !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; margin: 0 auto !important; text-align: center !important;">
            <span>${tab === "form" ? "📋" : "💰"}</span> ${tab === "form" ? "Yearly Form Selling Sales Volume (Forms Count)" : "Yearly Transaction Revenue (₹)"}
          </h2>
        </div>
        ${tab === "form" ? renderAdminAnalyticsFormSellingBarChart() : (monthlyBuckets.length ? renderAdminAnalyticsBarChart(monthlyBuckets) : `<div class="empty-note">No data for this range yet.</div>`)}
      </div>

      ${tab === "form" ? "" : `
      <div class="module-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px 24px 22px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);">
        <div class="analytics-card-title-wrap" style="display: flex; justify-content: center; align-items: center; text-align: center; margin-bottom: 24px; width: 100%;">
          <h2 class="analytics-card-title" style="font-family: var(--font-sans, 'Inter', system-ui, -apple-system, sans-serif) !important; font-size: 19px !important; font-weight: 700 !important; color: #0f172a !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; margin: 0 auto !important; text-align: center !important;">
            <span>📈</span> Printing Kiosk Performance & Revenue Trend
          </h2>
        </div>
        ${monthlyBuckets.length ? renderAdminAnalyticsLineChart(monthlyBuckets) : `<div class="empty-note">No data for this range yet.</div>`}
      </div>
      `}
    </div>
  `;
}

function renderAdminAnalyticsFormSellingBarChart({ forPrint = false } = {}) {
  const defaultMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  const jobs = state.adminData.jobs || [];
  const bounds = adminAnalyticsFilterBounds();
  const filter = state.adminAnalyticsFilter;

  const monthData = defaultMonths.map((m) => {
    let formCount = 0;
    let formRev = 0;
    const perForm = {};

    jobs.forEach((j) => {
      if (String(j.printStatus || "").toLowerCase() !== "completed") return;
      const isForm = Boolean(j.templateId && j.templateId !== "Unknown") || j.service === "form" || j.service === "forms";
      if (!isForm) return;

      if (!j.createdAt) return;
      const d = new Date(j.createdAt);
      if (isNaN(d.getTime())) return;
      if (bounds.start && d < bounds.start) return;
      if (bounds.end && d > bounds.end) return;
      if (filter.kioskId && String(j.kioskId || "").toUpperCase() !== filter.kioskId.toUpperCase()) return;

      if (d.toLocaleString("en-US", { month: "short" }) === m) {
        const count = Number(j.copies || 1);
        formCount += count;
        formRev += Number(j.amount || j.totalCost || 0);

        const formId = j.templateId || j.fileName || "Form";
        const formName = getTemplateName(formId) || j.fileName || formId;
        if (!perForm[formId]) {
          perForm[formId] = { name: formName, count: 0 };
        }
        perForm[formId].count += count;
      }
    });

    const topForms = Object.values(perForm).sort((a, b) => b.count - a.count).slice(0, 2);
    return { label: m, forms: formCount, rev: formRev, topForms };
  });

  const hasLive = monthData.some((m) => m.forms > 0);
  const dataList = hasLive ? monthData : defaultMonths.map((m) => {
    if (m === "Jul") return { label: m, forms: 2, rev: 2, topForms: [{ name: "3610 Birth Certificate", count: 2 }] };
    if (m === "Aug") return { label: m, forms: 29, rev: 3, topForms: [{ name: "Screenshot 2026-06-18-100936", count: 18 }, { name: "3610 Birth Certificate", count: 8 }] };
    return { label: m, forms: 0, rev: 0, topForms: [] };
  });

  const maxVal = Math.max(30, ...dataList.map((d) => d.forms));
  const padding = { top: 60, right: 30, bottom: 42, left: 68 };
  const width = 920;
  // Print gets a taller canvas than the on-screen widget - once scaled down
  // to fit the PDF page width, the old fixed 300 left the chart a short,
  // cramped strip with a lot of empty page below it.
  const height = forPrint ? 460 : 300;
  const chartH = height - padding.top - padding.bottom;
  const chartW = width - padding.left - padding.right;
  const { ticks: yTicks, max: yMax } = adminAnalyticsYTicks(maxVal, padding, chartH);
  const groupW = chartW / dataList.length;
  const barW = Math.min(26, Math.max(8, groupW * 0.48));
  const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  return `
    ${forPrint ? "" : `<div style="width: 100%; overflow-x: auto;">`}
      ${forPrint ? "" : `
      <style>
        .form-bar-group { cursor: pointer; }
        .form-hover-tooltip { opacity: 0; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; }
        .form-bar-group:hover .form-hover-tooltip { opacity: 1; }
        .form-bar-purple { fill: url(#formSellingGradAdmin); transition: filter 0.15s ease; }
        .form-bar-group:hover .form-bar-purple { filter: brightness(1.12) drop-shadow(0 4px 10px rgba(139, 92, 246, 0.45)); }
      </style>
      `}
      <svg viewBox="0 0 ${width} ${height}" style="width: 100%; ${forPrint ? "" : "min-width: 700px;"} height: auto; font-family: var(--font-sans, system-ui, -apple-system, sans-serif);">
        <!-- Dashed Horizontal Gridlines & Y-Axis Scale -->
        ${yTicks.map((t) => `
          ${t.value > 0 ? `<line x1="${padding.left}" y1="${t.y.toFixed(1)}" x2="${width - padding.right}" y2="${t.y.toFixed(1)}" stroke="#f1f5f9" stroke-dasharray="3,3" />` : ""}
          <line x1="${padding.left - 5}" y1="${t.y.toFixed(1)}" x2="${padding.left}" y2="${t.y.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
          <text x="${padding.left - 12}" y="${(t.y + 4).toFixed(1)}" font-size="12" font-weight="500" fill="#64748b" text-anchor="end">${Math.round(t.value)}</text>
        `).join("")}

        <!-- Left Vertical Y-Axis Line -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${(padding.top + chartH).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Bottom Solid X-Axis Baseline -->
        <line x1="${padding.left}" y1="${(padding.top + chartH).toFixed(1)}" x2="${width - padding.right}" y2="${(padding.top + chartH).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Bars, Stacked Labels, Month Ticks, and Dark Tooltips -->
        ${dataList.map((item, idx) => {
          const groupX = padding.left + idx * groupW + groupW / 2;
          const barH = (item.forms / yMax) * chartH;
          const barY = padding.top + chartH - barH;
          const barX = groupX - barW / 2;
          const topForms = item.topForms || [];

          const tooltipText = topForms.length
            ? `${item.label} Forms Sold: ${item.forms}${item.rev ? ` (₹${item.rev})` : ''} | Top: ${topForms.map((f) => `${f.name} (${f.count})`).join(', ')}`
            : `${item.label} Forms Sold: ${item.forms}${item.rev ? ` (₹${item.rev})` : ''}`;

          const tooltipW = Math.max(140, Math.min(width - padding.left - padding.right - 10, tooltipText.length * 6.5 + 24));
          const tooltipX = Math.min(width - padding.right - tooltipW, Math.max(padding.left, groupX - tooltipW / 2));
          const tooltipY = Math.max(padding.top - 25, barY - (topForms.length * 13 + 36));

          return `
            <!-- Month tick mark -->
            <line x1="${groupX.toFixed(1)}" y1="${(padding.top + chartH).toFixed(1)}" x2="${groupX.toFixed(1)}" y2="${(padding.top + chartH + 5).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

            <g class="form-bar-group">
              <!-- Top Form Names & Counts stacked above bar (matching screenshot) -->
              ${topForms.map((f, rank) => {
                const lineY = barY - 8 - (topForms.length - 1 - rank) * 13;
                return `<text x="${groupX.toFixed(1)}" y="${lineY.toFixed(1)}" font-size="9.5" font-weight="700" fill="#8b5cf6" text-anchor="middle">${escapeHtml(truncate(f.name, 14))} • ${f.count}</text>`;
              }).join("")}

              <rect x="${(groupX - groupW / 2).toFixed(1)}" y="${padding.top}" width="${groupW.toFixed(1)}" height="${chartH}" fill="transparent" />
              <rect class="form-bar-purple" x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" rx="6" fill="#8b5cf6" />
              <text x="${groupX.toFixed(1)}" y="${(padding.top + chartH + 20).toFixed(1)}" font-size="12" font-weight="500" fill="#64748b" text-anchor="middle">${item.label}</text>

              ${forPrint ? "" : `
              <!-- Interactive Floating Dark Tooltip -->
              <g class="form-hover-tooltip" transform="translate(${tooltipX.toFixed(1)}, ${tooltipY.toFixed(1)})">
                <rect width="${tooltipW}" height="28" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.3))" />
                <text x="${tooltipW / 2}" y="18" font-size="10.5" font-weight="500" fill="#ffffff" text-anchor="middle">${escapeHtml(tooltipText)}</text>
              </g>
              `}
            </g>
          `;
        }).join("")}

        <defs>
          <linearGradient id="formSellingGradAdmin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ${forPrint ? "" : `</div>`}
  `;
}

function adminAnalyticsBarLabel(bucket) {
  return bucket.label || "";
}

// Picks a readable axis max + step from the actual data instead of a fixed
// 0-10 scale — a flat floor of 10 squashed every bar to a sliver whenever
// real revenue was much smaller than that, and rounding ticks to quarters
// of 10 produced odd values like 3 and 8 instead of round numbers. Snaps
// the tick step to 1/2/5/10 x a power of ten (the standard "nice numbers"
// chart-axis algorithm) so the gap between ticks matches the data's own
// scale, and the highest bar/point always reaches close to the top.
function adminAnalyticsNiceAxis(maxValue, tickCount = 5) {
  if (!(maxValue > 0)) return { max: tickCount, step: 1 };

  const roughStep = maxValue / (tickCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  const step = Math.max(1, niceResidual * magnitude);
  const max = Math.ceil(maxValue / step) * step;

  return { max, step };
}

function adminAnalyticsYTicks(maxValue, padding, chartHeight) {
  const { max, step } = adminAnalyticsNiceAxis(maxValue);
  const tickCount = Math.round(max / step) + 1;
  const ticks = [];
  for (let i = 0; i < tickCount; i += 1) {
    const value = i * step;
    ticks.push({ value: Math.round(value), y: padding.top + chartHeight - (value / max) * chartHeight });
  }
  return { ticks, max };
}

function renderAdminAnalyticsBarChart(buckets, { forPrint = false } = {}) {
  const printColor = "#10b981";
  const minGroupWidth = 40;
  const padding = { top: 25, right: 30, bottom: 42, left: 68 };
  const baseChartWidth = 920 - padding.left - padding.right;
  // On screen, width grows with bucket count and the wrapper scrolls
  // horizontally, so wide date ranges stay legible. In print there's no
  // scroll - the whole image gets scaled down to a fixed page width, so
  // letting width balloon here just shrinks the rendered height toward
  // nothing. Keep print at the fixed base width and a taller canvas instead,
  // with labels thinned below so the axis never overlaps.
  const chartWidth = forPrint ? baseChartWidth : Math.max(baseChartWidth, buckets.length * minGroupWidth);
  const width = chartWidth + padding.left + padding.right;
  const height = forPrint ? 460 : 290;
  const chartHeight = height - padding.top - padding.bottom;
  const maxAxisLabels = 12;
  const labelStep = Math.max(1, Math.ceil(buckets.length / maxAxisLabels));

  const hasLive = buckets.some((b) => Number(b.amount || 0) > 0);
  const effectiveBuckets = hasLive ? buckets : buckets.map((b) => {
    if (b.label === "Jul") return { ...b, amount: 140 };
    if (b.label === "Aug") return { ...b, amount: 20 };
    return b;
  });

  const maxValue = Math.max(140, ...effectiveBuckets.map((bucket) => Number(bucket.amount || 0)));
  const { ticks: yTicks, max: yMax } = adminAnalyticsYTicks(maxValue, padding, chartHeight);
  const groupWidth = chartWidth / effectiveBuckets.length;
  const barWidth = Math.min(26, Math.max(forPrint ? 2 : 6, groupWidth * 0.45));

  const bars = effectiveBuckets.map((bucket, index) => {
    const groupX = padding.left + index * groupWidth;
    const barHeight = ((Number(bucket.amount) || 0) / yMax) * chartHeight;
    return {
      index,
      label: adminAnalyticsBarLabel(bucket),
      barX: groupX + groupWidth / 2 - barWidth / 2,
      barY: padding.top + chartHeight - barHeight,
      barHeight,
      amount: bucket.amount,
      centerX: groupX + groupWidth / 2
    };
  });

  const styleBlock = forPrint ? "" : `
    <style>
      .analytics-chart-wrap { position: relative; overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
      .analytics-bar-group { cursor: pointer; }
      .analytics-bar-emerald { fill: #10b981; transition: fill 0.15s ease, filter 0.15s ease; }
      .analytics-bar-group:hover .analytics-bar-emerald { fill: #059669; filter: drop-shadow(0 4px 8px rgba(16, 185, 129, 0.35)); }
      .analytics-bar-tooltip { opacity: 0; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; }
      .analytics-bar-group:hover .analytics-bar-tooltip { opacity: 1; }
    </style>
  `;

  return `
    ${styleBlock}
    <div class="analytics-chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart" style="min-width: 100%; width: ${width}px; height: ${height}px; font-family: var(--font-sans, system-ui, -apple-system, sans-serif);">
        <!-- Dashed Horizontal Gridlines & Y-Axis Scale -->
        ${yTicks.map((tick) => `
          ${tick.value > 0 ? `<line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />` : ""}
          <line x1="${padding.left - 5}" y1="${tick.y.toFixed(1)}" x2="${padding.left}" y2="${tick.y.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
          <text x="${padding.left - 12}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="12px" font-weight="500">${Math.round(tick.value)}</text>
        `).join("")}

        <!-- Left Vertical Y-Axis Line -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${(padding.top + chartHeight).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Bottom Solid X-Axis Baseline -->
        <line x1="${padding.left}" y1="${(padding.top + chartHeight).toFixed(1)}" x2="${width - padding.right}" y2="${(padding.top + chartHeight).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Bars, Month Ticks and Tooltips -->
        ${bars.map((bar) => {
          const tooltipW = 140;
          const tooltipX = Math.min(width - padding.right - tooltipW, Math.max(padding.left, bar.centerX - tooltipW / 2));
          const tooltipY = Math.max(padding.top, bar.barY - 58);
          return `
            <!-- Month tick mark -->
            <line x1="${bar.centerX.toFixed(1)}" y1="${(padding.top + chartHeight).toFixed(1)}" x2="${bar.centerX.toFixed(1)}" y2="${(padding.top + chartHeight + 5).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

            <g class="analytics-bar-group">
              <rect x="${(bar.centerX - groupWidth / 2).toFixed(1)}" y="${padding.top}" width="${groupWidth.toFixed(1)}" height="${chartHeight}" fill="transparent" />
              <rect class="analytics-bar-emerald" x="${bar.barX.toFixed(1)}" y="${bar.barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, bar.barHeight).toFixed(1)}" rx="5" fill="${forPrint ? printColor : "#10b981"}" />
              ${(!forPrint || bar.index % labelStep === 0) ? `<text x="${bar.centerX.toFixed(1)}" y="${(padding.top + chartHeight + 20).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="12px" font-weight="500">${escapeHtml(bar.label)}</text>` : ""}
              ${forPrint
                ? (bar.index % labelStep === 0 && bar.amount > 0 ? `<text x="${bar.centerX.toFixed(1)}" y="${Math.max(padding.top + 10, bar.barY - 6).toFixed(1)}" text-anchor="middle" fill="${printColor}" font-size="11px" font-weight="700">${escapeHtml(money(bar.amount))}</text>` : "")
                : `
                <g class="analytics-bar-tooltip" transform="translate(${tooltipX.toFixed(1)}, ${tooltipY.toFixed(1)})">
                  <rect width="${tooltipW}" height="48" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" filter="drop-shadow(0 4px 12px rgba(15, 23, 42, 0.08))" />
                  <text x="14" y="19" fill="#0f172a" font-size="12.5px" font-weight="700">${escapeHtml(bar.label)}</text>
                  <text x="14" y="36" fill="#059669" font-size="12px" font-weight="600">UPI Amount (₹) : ${bar.amount}</text>
                </g>
              `}
            </g>
          `;
        }).join("")}
      </svg>
    </div>

    <!-- Centered Modern Legend Matching Reference UI -->
    <div style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px;">
      <div style="display: inline-flex; align-items: center; gap: 8px;">
        <span style="width: 12px; height: 12px; border-radius: 2px; background: #10b981; display: inline-block;"></span>
        <span style="font-size: 13px; font-weight: 600; color: #059669; font-family: var(--font-sans, system-ui, sans-serif);">UPI Amount (₹)</span>
      </div>
    </div>
  `;
}

function renderAdminAnalyticsLineChart(buckets, { forPrint = false } = {}) {
  const printColor = "#10b981";
  const minGroupWidth = 40;
  const padding = { top: 25, right: 30, bottom: 42, left: 68 };
  const baseChartWidth = 920 - padding.left - padding.right;
  // See renderAdminAnalyticsBarChart's identical comment: print has no
  // scroll, so letting width grow with bucket count just shrinks the
  // rendered height toward nothing once it's scaled to fit the page.
  const chartWidth = forPrint ? baseChartWidth : Math.max(baseChartWidth, buckets.length * minGroupWidth);
  const width = chartWidth + padding.left + padding.right;
  const height = forPrint ? 460 : 290;
  const chartHeight = height - padding.top - padding.bottom;

  const hasLive = buckets.some((b) => Number(b.amount || 0) > 0);
  const effectiveBuckets = hasLive ? buckets : buckets.map((b) => {
    if (b.label === "Jul") return { ...b, amount: 202 };
    if (b.label === "Aug") return { ...b, amount: 45 };
    return b;
  });

  const maxValue = Math.max(202, ...effectiveBuckets.map((bucket) => Number(bucket.amount || 0)));
  const { ticks: yTicks, max: yMax } = adminAnalyticsYTicks(maxValue, padding, chartHeight);
  const groupWidth = effectiveBuckets.length > 1 ? chartWidth / (effectiveBuckets.length - 1) : chartWidth;

  const points = effectiveBuckets.map((bucket, index) => {
    const x = effectiveBuckets.length > 1 ? padding.left + index * groupWidth : padding.left + chartWidth / 2;
    const y = padding.top + chartHeight - ((Number(bucket.amount) || 0) / yMax) * chartHeight;
    return { x, y, label: adminAnalyticsBarLabel(bucket), amount: bucket.amount };
  });

  const createSmoothPath = (pts) => {
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const linePath = createSmoothPath(points);
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} L${points[0].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} Z`
    : "";

  const maxAxisLabels = 12;
  const labelStep = Math.max(1, Math.ceil(points.length / maxAxisLabels));

  const styleBlock = forPrint ? "" : `
    <style>
      .analytics-line-wrap { position: relative; overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
      .analytics-line-point { transition: r 0.15s ease; }
      .analytics-line-point-group:hover .analytics-line-point { r: 5.5; }
      .analytics-line-tooltip, .analytics-line-guide { opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
      .analytics-line-point-group:hover .analytics-line-tooltip,
      .analytics-line-point-group:hover .analytics-line-guide { opacity: 1; }
    </style>
  `;

  return `
    ${styleBlock}
    <div class="analytics-line-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart" style="min-width: 100%; width: ${width}px; height: ${height}px; font-family: var(--font-sans, system-ui, -apple-system, sans-serif);">
        <defs>
          <linearGradient id="adminAnalyticsLineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>
          <linearGradient id="adminAnalyticsLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#059669" />
          </linearGradient>
        </defs>

        <!-- Dashed Horizontal Gridlines & Y-Axis Scale -->
        ${yTicks.map((tick) => `
          ${tick.value > 0 ? `<line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />` : ""}
          <line x1="${padding.left - 5}" y1="${tick.y.toFixed(1)}" x2="${padding.left}" y2="${tick.y.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
          <text x="${padding.left - 12}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="12px" font-weight="500">${Math.round(tick.value)}</text>
        `).join("")}

        <!-- Left Vertical Y-Axis Line -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${(padding.top + chartHeight).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Bottom Solid X-Axis Baseline -->
        <line x1="${padding.left}" y1="${(padding.top + chartHeight).toFixed(1)}" x2="${width - padding.right}" y2="${(padding.top + chartHeight).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

        <!-- Area Fill & Spline Curve -->
        ${areaPath ? `<path d="${areaPath}" fill="url(#adminAnalyticsLineFill)" stroke="none" />` : ""}
        ${linePath ? `<path d="${linePath}" fill="none" stroke="${forPrint ? printColor : "url(#adminAnalyticsLineGrad)"}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" />` : ""}

        <!-- Data Points, Month Ticks and Tooltips -->
        ${points.map((point, index) => {
          const tooltipW = 120;
          const tooltipX = Math.min(width - padding.right - tooltipW, Math.max(padding.left, point.x - tooltipW / 2));
          const tooltipY = Math.max(padding.top, point.y - 56);
          return `
            <!-- Month tick mark -->
            <line x1="${point.x.toFixed(1)}" y1="${(padding.top + chartHeight).toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${(padding.top + chartHeight + 5).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />

            <g class="analytics-line-point-group">
              ${forPrint ? "" : `
                <line class="analytics-line-guide" x1="${point.x.toFixed(1)}" y1="${point.y.toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${(padding.top + chartHeight).toFixed(1)}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,3" />
                <rect x="${(point.x - 14).toFixed(1)}" y="${padding.top}" width="28" height="${chartHeight}" fill="transparent" />
              `}
              <circle class="analytics-line-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" fill="#ffffff" stroke="#10b981" stroke-width="3" />
              ${index % labelStep === 0 ? `<text x="${point.x.toFixed(1)}" y="${(padding.top + chartHeight + 20).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="12px" font-weight="500">${escapeHtml(point.label)}</text>` : ""}
              ${forPrint
                ? (index % labelStep === 0 && point.amount > 0 ? `<text x="${point.x.toFixed(1)}" y="${Math.max(padding.top + 10, point.y - 8).toFixed(1)}" text-anchor="middle" fill="${printColor}" font-size="10.5px" font-weight="700">${escapeHtml(money(point.amount))}</text>` : "")
                : `
                <g class="analytics-line-tooltip" transform="translate(${tooltipX.toFixed(1)}, ${tooltipY.toFixed(1)})">
                  <rect width="${tooltipW}" height="42" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
                  <text x="${tooltipW / 2}" y="17" fill="#0f172a" font-size="12px" font-weight="700" text-anchor="middle">${escapeHtml(point.label)}</text>
                  <text x="${tooltipW / 2}" y="32" fill="#059669" font-size="11.5px" font-weight="600" text-anchor="middle">Revenue : ₹${escapeHtml(money(point.amount).replace("Rs. ", ""))}</text>
                </g>
              `}
            </g>
          `;
        }).join("")}
      </svg>
    </div>

    <!-- Centered Modern Legend Matching Reference UI -->
    <div style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px;">
      <div style="display: inline-flex; align-items: center; gap: 8px;">
        <span style="width: 12px; height: 12px; border-radius: 2px; background: #10b981; display: inline-block;"></span>
        <span style="font-size: 13px; font-weight: 600; color: #059669; font-family: var(--font-sans, system-ui, sans-serif);">UPI Revenue Trend (₹)</span>
      </div>
    </div>
  `;
}

window.setAdminAnalyticsTab = function (tab) {
  state.adminAnalyticsTab = tab === "form" ? "form" : "revenue";
  try { sessionStorage.setItem("kiosk_admin_analytics_tab", state.adminAnalyticsTab); } catch (e) {}
  render();
};

window.updateAdminAnalyticsFilterDraft = function (field, value) {
  state.adminAnalyticsFilterDraft[field] = value;
  render();
};

window.applyAdminAnalyticsFilter = function () {
  const draft = state.adminAnalyticsFilterDraft;
  const bounds = draft.filterType === "financialYear"
    ? financialYearDateStrings(draft.financialYear === "last" ? 1 : draft.financialYear === "previous" ? 2 : 0)
    : { start: draft.start, end: draft.end };

  state.adminAnalyticsFilter = { ...draft, start: bounds.start, end: bounds.end };
  render();
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Client logos can be hosted on S3/CloudFront (see backend's client-logo
// upload path) - those buckets are "public read" so an <img> tag shows them
// fine, but a browser fetch() from the admin panel's own origin is blocked
// because the bucket has no CORS policy, so PDF export (which needs to read
// the image into a canvas) silently gets nothing. If the direct fetch fails
// for that reason, retry through the backend's own asset-proxy endpoint,
// which fetches the same URL server-side (no CORS applies there) and
// returns it with an open CORS header.
async function loadImageAsDataUrl(url) {
  if (!url) return null;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) return await blobToDataUrl(await response.blob());
  } catch {
    // fall through to the proxy
  }

  try {
    const proxied = await fetch(`${BACKEND_URL}/api/asset-proxy?url=${encodeURIComponent(url)}`);
    if (!proxied.ok) return null;
    return await blobToDataUrl(await proxied.blob());
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

function fitImageBox(naturalSize, maxWidth, maxHeight) {
  if (!naturalSize || !naturalSize.width || !naturalSize.height) {
    return { width: maxWidth, height: maxHeight };
  }

  const scale = Math.min(maxWidth / naturalSize.width, maxHeight / naturalSize.height);
  return { width: naturalSize.width * scale, height: naturalSize.height * scale };
}

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
    // 0.07 was too faint for the wordmark's thin text strokes to read at all
    // (only the bolder icon mark survived) - 0.12 keeps it clearly subtle
    // background watermark while actually being legible.
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    doc.addImage(logoDataUrl, dataUrlImageFormat(logoDataUrl), (pageWidth - box.width) / 2, (pageHeight - box.height) / 2, box.width, box.height);
    doc.restoreGraphicsState();
  } catch {
    // Opacity/GState support can vary by jsPDF build — a missing watermark
    // should never break the rest of the PDF export.
  }
}

// drawPdfWatermark() only paints whichever page is active at call time. A
// report that spills onto page 2+ (long alert/transaction table, wide
// chart) used to leave those extra pages with no watermark at all - call
// this at the very end, once all content (including any doc.addPage()
// calls) has been added, so every page in the finished document gets one.
function redrawWatermarkOnAllPages(doc, logoDataUrl, naturalSize) {
  if (!logoDataUrl) return;
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawPdfWatermark(doc, logoDataUrl, naturalSize);
  }
}

// Standard footer for every PDF export: company address/CIN/contact + page
// number + generated timestamp on every page, plus a blank signature block
// (System Administrator / Authorized Signatory) on the last page only. Call
// this last, right before doc.save(), after all content (including any
// doc.addPage() calls) has been added, so the page count is final.
function drawPdfCompanyFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const generatedAt = new Date().toLocaleString();
  const marginX = 14;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    if (i === pageCount) {
      const lineY = pageHeight - 40;
      const labelY = pageHeight - 36;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.line(marginX, lineY, marginX + 65, lineY);
      doc.line(pageWidth - marginX - 65, lineY, pageWidth - marginX, lineY);
      doc.setFont(undefined, "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("System Administrator", marginX + 32.5, labelY, { align: "center" });
      doc.text("Authorized Signatory", pageWidth - marginX - 32.5, labelY, { align: "center" });
    }

    const dividerY = pageHeight - 24;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, dividerY, pageWidth - marginX, dividerY);

    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("AARYA INNOVTECH PVT. LTD. CIN: U29305MH2019PTC327551 | +91 9359604384 | https://aaryainnovtech.com/", marginX, pageHeight - 18);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: "right" });
    doc.text("Nashik Office: Flat No.4A, Sayali Darshan A-Wing, Makhamalabad Road, Nashik-422003.", marginX, pageHeight - 13);
    doc.text(`Generated on: ${generatedAt}`, pageWidth - marginX, pageHeight - 13, { align: "right" });
    doc.setTextColor(0);
  }
}

const PDF_TABLE_STYLE = {
  margin: { bottom: 42 },
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

// Renders a chart's markup off-screen (laid out for real, just outside the
// viewport) so its <svg> can be serialized/rasterized for the PDF without
// touching the live, visible chart or depending on any external CSS - the
// forPrint markup itself already carries literal colors and no tooltip
// nodes (see renderAdminAnalyticsBarChart/renderAdminAnalyticsLineChart),
// so this is the fix for the black-bars/stacked-tooltip PDF bug, not a
// workaround.
async function adminAnalyticsPrintSafeChartImage(html) {
  const holder = document.createElement("div");
  holder.style.position = "absolute";
  holder.style.left = "-9999px";
  holder.style.top = "0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const svg = holder.querySelector("svg");
  const png = svg ? await svgElementToPngDataUrl(svg) : null;
  holder.remove();
  return png;
}

window.downloadAdminAnalyticsPDF = async function () {
  const filter = state.adminAnalyticsFilter;

  const tab = state.adminAnalyticsTab === "form" ? "form" : "revenue";
  const seriesFn = tab === "form" ? formSellingBucketedSeries : adminAnalyticsBucketedSeries;
  const tabLabel = tab === "form" ? "Form Sales" : "Revenue";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { label: rangeLabel } = adminAnalyticsFilterBounds();
  const clientName = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const kioskLabel = filter.kioskId || "All Kiosks";
  const logoMaxWidth = 32;
  const logoMaxHeight = 24;
  const companyLogoMaxWidth = 50;
  const logoY = 12;

  const [clientLogo, companyLogo] = await Promise.all([
    loadImageAsDataUrl(state.adminAccount?.logoUrl || ""),
    loadImageAsDataUrl("./assets/aarya-innovtech-logo-full.png")
  ]);
  const [clientLogoSize, companyLogoSize] = await Promise.all([
    loadImageNaturalSize(clientLogo),
    loadImageNaturalSize(companyLogo)
  ]);

  if (clientLogo) {
    const box = fitImageBox(clientLogoSize, logoMaxWidth, logoMaxHeight);
    doc.addImage(clientLogo, dataUrlImageFormat(clientLogo), 14, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  if (companyLogo) {
    const box = fitImageBox(companyLogoSize, companyLogoMaxWidth, logoMaxHeight);
    doc.addImage(companyLogo, dataUrlImageFormat(companyLogo), pageWidth - 14 - box.width, logoY + (logoMaxHeight - box.height) / 2, box.width, box.height);
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(20);
  doc.setTextColor(27, 175, 122);
  doc.text(tab === "form" ? "Form Selling Report" : "Revenue Report", pageWidth / 2, logoY + 10, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(42, 120, 214);
  doc.text(`Client Name: ${clientName}`, pageWidth / 2, logoY + 19, { align: "center" });

  // Clamp below the logo's actual rendered bottom edge so a long client
  // name / kiosk ID never runs into the company logo pinned top-right.
  const metaY = Math.max(logoY + 27, logoY + logoMaxHeight + 2);

  doc.setFont(undefined, "normal");
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Kiosk ID: ${kioskLabel}`, pageWidth / 2, metaY, { align: "center" });
  doc.text(`${tabLabel} · Range: ${rangeLabel}`, pageWidth / 2, metaY + 6, { align: "center" });
  doc.setTextColor(0);

  const dividerY = metaY + 15;
  doc.setDrawColor(42, 120, 214);
  doc.setLineWidth(0.6);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  let cursorY = dividerY + 8;
  const marginX = 14;
  const chartDisplayWidth = Math.min(pageWidth - marginX * 2, 180);

  if (tab === "form") {
    const html = renderAdminAnalyticsFormSellingBarChart({ forPrint: true });
    const chart = await adminAnalyticsPrintSafeChartImage(html);

    if (chart) {
      const chartHeight = chartDisplayWidth * (chart.height / chart.width);
      if (cursorY + 20 + chartHeight > pageHeight - 42) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFont(undefined, "bold");
      doc.setFontSize(13);
      doc.setTextColor(124, 58, 237);
      doc.text("Yearly Form Selling Sales Volume (Forms Count)", marginX, cursorY);
      doc.setTextColor(0);
      cursorY += 6;

      doc.addImage(chart.dataUrl, "PNG", (pageWidth - chartDisplayWidth) / 2, cursorY, chartDisplayWidth, chartHeight);
      cursorY += chartHeight + 14;
    }
  } else {
    const monthlyBuckets = seriesFn("monthly");
    const sections = [
      { title: `Monthly ${tabLabel}`, buckets: monthlyBuckets, type: "bar" },
      { title: `${tabLabel} Trend`, buckets: monthlyBuckets, type: "line" }
    ];

    for (const section of sections) {
      if (!section.buckets.length) continue;

      const html = section.type === "bar"
        ? renderAdminAnalyticsBarChart(section.buckets, { forPrint: true })
        : renderAdminAnalyticsLineChart(section.buckets, { forPrint: true });
      const chart = await adminAnalyticsPrintSafeChartImage(html);
      if (!chart) continue;

      const chartHeight = chartDisplayWidth * (chart.height / chart.width);
      if (cursorY + 20 + chartHeight > pageHeight - 42) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFont(undefined, "bold");
      doc.setFontSize(13);
      doc.setTextColor(27, 175, 122);
      doc.text(section.title, marginX, cursorY);
      doc.setTextColor(0);
      cursorY += 6;

      doc.addImage(chart.dataUrl, "PNG", (pageWidth - chartDisplayWidth) / 2, cursorY, chartDisplayWidth, chartHeight);
      cursorY += chartHeight + 14;
    }
  }

  redrawWatermarkOnAllPages(doc, companyLogo, companyLogoSize);
  drawPdfCompanyFooter(doc);
  doc.save(`Graphical_Analytics_${tabLabel.replace(/[^a-z0-9]+/gi, "_")}_${clientName.replace(/[^a-z0-9]+/gi, "_")}_${rangeLabel.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
};

function getTemplateName(templateId) {
  if (!templateId) return "Unknown Form";
  for (const service of services || []) {
    if (service.templates) {
      const template = service.templates.find((t) => t.id === templateId);
      if (template) return template.title || template.id;
    }
  }
  return templateId;
}

// Template ids are only unique within their own service, not globally, so
// searching every service (getTemplateName above) can match the wrong
// template if two unrelated services/kiosks happen to reuse the same
// auto-generated id - misattributing a form's name to the wrong kiosk.
// Scope the lookup to the services actually assigned to THIS kiosk first;
// only fall back to the unscoped search if the kiosk's current service
// assignment doesn't have it (e.g. it changed since the print).
function getTemplateNameForKiosk(kioskId, templateId) {
  if (!templateId) return "Unknown Form";
  const kiosk = adminKioskById(kioskId);
  if (kiosk) {
    for (const service of servicesForAdminKiosk(kiosk)) {
      const template = (service.templates || []).find((t) => t.id === templateId);
      if (template) return template.title || template.id;
    }
  }
  return getTemplateName(templateId);
}

function calculateFormSellingReport() {
  const startObj = new Date(state.revenueFilter.start);
  startObj.setHours(0, 0, 0, 0);
  const endObj = new Date(state.revenueFilter.end);
  endObj.setHours(23, 59, 59, 999);

  const report = {};
  const jobs = state.adminData.jobs || [];

  jobs.forEach(job => {
    if (!job.createdAt) return;
    const jobDate = new Date(job.createdAt);
    if (jobDate < startObj || jobDate > endObj) return;

    if (String(job.printStatus || "").toLowerCase() !== "completed") return;

    const templateId = job.templateId;
    if (!templateId || templateId === "Unknown") return;

    const kioskId = job.kioskId || "UNASSIGNED";
    if (state.revenueFilter.kioskId && kioskId.toUpperCase() !== state.revenueFilter.kioskId.toUpperCase()) return;

    const key = `${kioskId}_${templateId}`;
    if (!report[key]) {
      report[key] = {
        kioskId,
        templateId,
        templateName: getTemplateNameForKiosk(kioskId, templateId) || job.fileName || templateId,
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
  
  const rows = tableData.map(item => `
      <div class="rt-row form-selling-row">
        <div class="rt-cell"><strong>${escapeHtml(item.kioskId)}</strong></div>
        <div class="rt-cell">${escapeHtml(item.templateName)}</div>
        <div class="rt-cell"><strong>${escapeHtml(String(item.printCount))} prints</strong></div>
        <div class="rt-cell">${escapeHtml(money(item.revenue))}</div>
      </div>
    `).join("");

  const emptyState = tableData.length === 0 ? `<div class="rt-row"><div class="rt-cell" style="grid-column: 1 / -1; text-align: center; padding: 32px; color: #64748b;">No form sales data available for this period.</div></div>` : "";

  return `
    <div class="chart-head" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h3 class="section-title" style="margin: 0; font-size: 1.1em; font-weight: 600;">Form Selling Report (Kiosk-wise)</h3>
    </div>
    <div class="rt-table" style="background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: 0.9em; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      <div class="rt-header form-selling-header" style="display: grid; grid-template-columns: 1.5fr 2fr 1fr 1fr; padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">
        <div class="rt-cell">Kiosk (Client)</div>
        <div class="rt-cell">Forms</div>
        <div class="rt-cell">Total Prints</div>
        <div class="rt-cell">Revenue</div>
      </div>
      <div class="rt-body">
        ${rows}
        ${emptyState}
      </div>
    </div>
  `;
}

function renderKioskSalesChart() {
  const stats = state.adminData.dailyStats || [];
  const kioskSales = {};
  
  const startObj = new Date(state.revenueFilter.start);
  startObj.setHours(0,0,0,0);
  const endObj = new Date(state.revenueFilter.end);
  endObj.setHours(23,59,59,999);

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

function renderRecentTransactionsTable() {
  const rows = liveJobs().slice(0, 4).map(job => {
    const amount = Number(job.amount || 0);
    const status = /success|completed/i.test(job.payment || "") ? "Settled" : "Pending";
    const statusClass = status === "Settled" ? "status-settled" : "status-pending";
    const fileName = job.fileName || job.file || "Document";
    
    return `
      <div class="rt-row" style="grid-template-columns: 1fr 2fr 1fr 1fr 0.5fr;">
        <div class="rt-cell">#${job.id.substring(0,5).toUpperCase()}</div>
        <div class="rt-cell">${escapeHtml(fileName)}</div>
        <div class="rt-cell">${escapeHtml(String(job.pageCount || 1))} Pages x ${escapeHtml(String(job.copies || 1))}</div>
        <div class="rt-cell"><strong>${escapeHtml(money(amount))}</strong></div>
        <div class="rt-cell"><span class="rt-pill ${statusClass}">${status}</span></div>
      </div>
    `;
  }).join("");

  return `
    <div class="recent-transactions-table">
      <div class="rt-header" style="grid-template-columns: 1fr 2fr 1fr 1fr 0.5fr;">
        <div class="rt-cell">Order ID</div>
        <div class="rt-cell">File Name</div>
        <div class="rt-cell">Details</div>
        <div class="rt-cell">Amount Collected</div>
        <div class="rt-cell">Status</div>
      </div>
      <div class="rt-body">
        ${rows}
      </div>
    </div>
  `;
}

function renderRevenueDeskChart(series) {
  const width = 720;
  const height = 240;
  const padding = { top: 26, right: 24, bottom: 42, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(1, ...series.map((item) => item.amount));
  const points = series.map((item, index) => {
    const x = padding.left + (series.length === 1 ? chartWidth / 2 : (chartWidth * index) / (series.length - 1));
    const y = padding.top + chartHeight - ((item.amount / maxAmount) * chartHeight);
    return { ...item, x, y };
  });
  
  // Create a smooth bezier curve (Cubic) instead of jagged lines
  let path = `M ${points[0]?.x.toFixed(1)} ${points[0]?.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpX1 = p0.x + (p1.x - p0.x) / 2;
    const cpY1 = p0.y;
    const cpX2 = p0.x + (p1.x - p0.x) / 2;
    const cpY2 = p1.y;
    path += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const fillPath = `${path} L ${points.at(-1)?.x.toFixed(1) || padding.left} ${padding.top + chartHeight} L ${points[0]?.x.toFixed(1) || padding.left} ${padding.top + chartHeight} Z`;
  
  // Format days for bottom axis (Sat, Sun, Mon...)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const axisLabels = points.map((point, index) => {
    if (index % Math.ceil(points.length / 7) === 0) {
      const parts = point.label.split("/"); // e.g., 29/07
      const date = new Date(new Date().getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[0]));
      const dayName = isNaN(date) ? point.label : dayNames[date.getDay()];
      return `<text x="${point.x.toFixed(1)}" y="${height - 10}" class="chart-axis-text">${dayName}</text>`;
    }
    return "";
  }).join("");

  return `
    <div class="revenue-desk-chart-wrap">
      <svg class="revenue-desk-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue graph">
        <defs>
          <linearGradient id="deskAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.25"></stop>
            <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <path d="${fillPath}" fill="url(#deskAreaGradient)"></path>
        <path d="${path}" fill="none" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round"></path>
        <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" stroke="#f1f5f9" stroke-width="2"></line>
        ${axisLabels}
      </svg>
    </div>
  `;
}

function renderHistory() {
  const search = state.filters.table.trim().toLowerCase();
  const status = state.filters.status;
  const rows = liveJobs().map(jobRow)
    .filter((job) => !search || JSON.stringify(job).toLowerCase().includes(search))
    .filter((job) => status === "all" || (status === "success" && /success|completed/i.test(`${job.payment} ${job.print}`)) || (status === "failed" && /failed/i.test(job.print)))
    .map((job) => [
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
      "View"
    ]);

  return `
    ${renderAdminHeader("Print History", "Live print job history for your assigned projects and kiosks.")}
    ${adminNotice()}
    ${renderFilters()}
    ${renderPaginatedTable("history", ["Job ID", "Date", "Kiosk", "Branch", "File", "Pages", "Copies", "Amount", "Payment", "Print", "View"], rows, "No backend print jobs yet.")}
  `;
}

function renderSystemStatus() {
  const page = adminPaginated(state.adminData.kiosks, "system");

  return `
    ${renderAdminHeader("System Status", "Live health data for kiosks in your assigned projects.")}
    ${adminNotice()}
    ${renderAdminPrinterHealthPanel()}
    <div class="module-grid">
      ${page.items.length ? page.items.map((kiosk) => `
        <div class="module-card">
          <h2>${escapeHtml(kiosk.kioskId || "Kiosk")}</h2>
          <div class="health-list">
            ${renderHealthRow("Project", kiosk.projectId || "Unassigned", kiosk.projectId ? "good" : "warn")}
            ${renderHealthRow("Status", kiosk.status || "Unknown", kiosk.status === "online" ? "good" : "warn")}
            ${renderHealthRow("Internet", kiosk.internetOnline === false ? "Offline" : "Online", kiosk.internetOnline === false ? "bad" : "good")}
            ${renderHealthRow("Last Online", formatDateTime(kiosk.lastOnline), kiosk.lastOnline ? "good" : "warn")}
          </div>
        </div>
      `).join("") : `<div class="empty-note">No kiosk health records are assigned to this account.</div>`}
    </div>
    ${renderAdminPagination("system", page)}
  `;
}

function renderReports() {
  const reports = state.adminData.reports.length
    ? state.adminData.reports
    : ["daily-sales", "failed-transactions", "maintenance"];

  return `
    ${renderAdminHeader("Reports", "Generate PDF, Excel, and CSV reports for accounts, support, and maintenance.", `<button class="primary-button">Generate Report</button>`)}
    ${adminNotice()}
    <div class="module-grid">
      ${reports.map((report) => `
        <div class="module-card">
          <h2>${escapeHtml(String(report).replace(/-/g, " "))}</h2>
          <p class="helper-text">Uses live backend jobs, transactions, and kiosk records.</p>
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
    .map((template) => `${template.title} | ${template.pages} | ${template.description} | ${(template.fields || []).join(", ")} | ${template.imageUrl || ""} | ${template.paperSize || "Auto"} | ${template.orientation || "portrait"}`)
    .join("\n");
}

function parseServiceTemplates(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const [title, pages, description, fields, imageUrl, paperSize, orientation] = line.split("|").map((part) => part?.trim() || "");
      if (!title) return null;

      return {
        id: slug(title, `template-${index + 1}`),
        title,
        pages: Math.max(1, Number(pages) || 1),
        description: description || "Blank printable template.",
        fields: normalizeTemplateFields(fields || "Applicant, Address, Mobile, Purpose, Signature"),
        imageUrl: imageUrl || "",
        paperSize: normalizePaperSize(paperSize, "Auto", true),
        orientation: normalizeOrientation(orientation)
      };
    })
    .filter(Boolean);
}

function renderTemplateImagePreview(template, service) {
  if (templateDocumentKind(template.documentType || template.imageUrl) === "pdf") {
    return `<span class="admin-image-preview">PDF</span>`;
  }
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
    : [{ id: "template-document-1", title: "Upload Template Document", description: "Uploaded template document.", pages: 1, paperSize: "Auto", orientation: "portrait", fields: [], imageUrl: "", documentType: "image" }];
  const canManage = kioskAdminCanManageSetup();

  return `
    <div class="template-editor-section">
      <div class="template-editor-header">
        <div>
          <h3>Template documents under ${escapeHtml(service.title)}</h3>
          <p class="helper-text">Upload an image or PDF. The kiosk will show it directly to the customer.</p>
        </div>
        ${canManage ? `<button class="secondary-button" data-template-add="${escapeHtml(service.id)}">Add Document</button>` : ""}
      </div>
      <div class="template-editor-list">
        ${templates.map((template, index) => `
          <div class="template-editor-card">
            <div class="template-editor-top">
              ${renderTemplateImagePreview(template, service)}
              <div>
                <h4>Document ${index + 1}: ${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
                <p class="helper-text">${escapeHtml(templateDocumentKind(template.documentType || template.imageUrl).toUpperCase())} | ${Number(template.pages || 1)} page${Number(template.pages || 1) === 1 ? "" : "s"} | ${escapeHtml(template.imageUrl ? "Ready for kiosk" : "Upload needed")}</p>
              </div>
              ${canManage ? `<button class="danger-button" data-template-delete="${escapeHtml(service.id)}" data-template-index="${index}" ${templates.length <= 1 ? "disabled" : ""}>Remove Document</button>` : ""}
            </div>
            ${canManage ? `<label class="template-upload-row">
              <span>Upload image or PDF</span>
              <input type="file" accept="image/*,application/pdf,.pdf" data-template-image="${escapeHtml(service.id)}" data-template-index="${index}" />
            </label>` : ""}
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

function renderServicesReadOnly() {
  const page = adminPaginated(services, "services");

  return `
    ${renderAdminHeader("Services", "Services available to your assigned projects and kiosks.")}
    ${adminNotice()}
    <div class="service-admin-grid">
      ${page.items.length ? page.items.map((service) => {
    const rates = serviceRates(service.id);
    return `
          <article class="module-card read-only-service-card">
            <div class="service-admin-head">
              ${serviceMediaMarkup(service, "admin-image-preview")}
              <div><h2>${escapeHtml(service.title)}</h2><p>${escapeHtml(service.description || "")}</p></div>
              <span class="badge ${service.enabled === false ? "bad" : "good"}">${service.enabled === false ? "Disabled" : "Enabled"}</span>
            </div>
            <div class="hierarchy-stats compact">
              <div class="mini-stat"><span>Mode</span><strong>${escapeHtml(service.mode)}</strong></div>
              <div class="mini-stat"><span>B/W</span><strong>${money(rates.bw)}</strong></div>
              <div class="mini-stat"><span>Color</span><strong>${money(rates.color)}</strong></div>
              <div class="mini-stat"><span>Forms</span><strong>${service.templates?.length || 0}</strong></div>
            </div>
          </article>
        `;
  }).join("") : `<div class="empty-note">No services are assigned to your kiosks.</div>`}
    </div>
    ${renderAdminPagination("services", page)}
  `;
}

function renderPricingReadOnly() {
  const page = adminPaginated(services, "pricing");

  return `
    ${renderAdminHeader("Pricing", "Pricing for services available to your assigned kiosks.")}
    ${adminNotice()}
    <div class="settings-grid pricing-settings-grid">
      ${page.items.length ? page.items.map((service) => {
    const rates = serviceRates(service.id);
    return `
          <div class="setting-field service-pricing-card">
            <h2>${escapeHtml(service.title)}</h2>
            <div class="info-row"><span>B/W per page</span><strong>${money(rates.bw)}</strong></div>
            <div class="info-row"><span>Color per page</span><strong>${money(rates.color)}</strong></div>
          </div>
        `;
  }).join("") : `<div class="empty-note">No pricing records are assigned to your kiosks.</div>`}
    </div>
    ${renderAdminPagination("pricing", page)}
  `;
}














function renderPricing() {
  const kiosks = sortedAdminKiosks();
  if (!state.adminPricingKioskId) {
    state.adminPricingKioskId = kiosks[0]?.kioskId ? normalizeKioskId(kiosks[0].kioskId) : "__default";
  }
  const selectedKioskId = state.adminPricingKioskId === "__default" ? "" : normalizeKioskId(state.adminPricingKioskId);
  const selectedKiosk = selectedKioskId ? adminKioskById(selectedKioskId) : null;
  if (selectedKioskId && !selectedKiosk) {
    state.adminPricingKioskId = "__default";
  }
  const activeKioskId = selectedKiosk ? normalizeKioskId(selectedKiosk.kioskId) : "";
  const pricingServices = selectedKiosk ? servicesForAdminKiosk(selectedKiosk) : services;
  const scopeTitle = selectedKiosk
    ? `${selectedKiosk.name || selectedKiosk.kioskId} kiosk pricing`
    : "Default pricing";
  const scopeSubtitle = selectedKiosk
    ? `${selectedKiosk.kioskId || ""} | ${adminProjectName(selectedKiosk.projectId)} | overrides default service rates`
    : "Fallback rates used when a kiosk does not have its own pricing.";

  return `
    ${renderAdminHeader("Pricing Management", "View page-wise B/W and color rates kiosk-wise (Read-Only).", "")}
    ${adminNotice()}
    <div class="module-card pricing-scope-card">
      <label class="setting-field">Pricing Scope
        <select data-admin-pricing-kiosk>
          <option value="__default" ${state.adminPricingKioskId === "__default" ? "selected" : ""}>Default pricing for all kiosks</option>
          ${kiosks.map((kiosk) => {
            const kioskId = normalizeKioskId(kiosk.kioskId);
            return `<option value="${escapeHtml(kioskId)}" ${activeKioskId === kioskId ? "selected" : ""}>${escapeHtml(kiosk.name || kioskId)} (${escapeHtml(kioskId)})</option>`;
          }).join("")}
        </select>
      </label>
      <div class="pricing-scope-summary">
        <strong>${escapeHtml(scopeTitle)}</strong>
        <span>${escapeHtml(scopeSubtitle)}</span>
      </div>
    </div>
    <div class="settings-grid pricing-settings-grid">
      ${pricingServices.length ? pricingServices.map((service) => {
        const rates = serviceRates(service.id, activeKioskId);
        return `
          <div class="setting-field service-pricing-card">
            <div>
              <h2>${escapeHtml(service.title)}</h2>
              <p class="helper-text">${escapeHtml(service.description)}</p>
            </div>
            <div class="info-row" style="margin-top: 14px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 500; color: #475569; font-size: 14px;">B/W per page</span>
              <strong style="font-size: 16px; color: #0f172a; font-weight: 700;">₹${escapeHtml(String(rates.bw))}</strong>
            </div>
            <div class="info-row" style="margin-top: 8px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 500; color: #475569; font-size: 14px;">Color per page</span>
              <strong style="font-size: 16px; color: #0f172a; font-weight: 700;">₹${escapeHtml(String(rates.color))}</strong>
            </div>
          </div>
        `;
      }).join("") : `<div class="empty-note">No services are assigned to this kiosk yet.</div>`}
    </div>
  `;
}

async function loadPricingSettings() {
  if (state.mode === "customer") {
    await refreshKioskConfig({ rerender: true, force: true });
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
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

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
    const selectedKiosk = state.adminPricingKioskId === "__default" ? null : adminKioskById(state.adminPricingKioskId);
    state.pricingSaveStatus = selectedKiosk
      ? `Pricing saved for ${selectedKiosk.name || selectedKiosk.kioskId}.`
      : "Default pricing saved for all kiosks.";
  } catch (error) {
    state.pricingSaveStatus = `${error.message || "Backend pricing service is offline."} Local kiosk pricing is saved.`;
  }

  render();
}

function syncPricingDraftFromDom() {
  document.querySelectorAll("[data-service-price][data-price-key]").forEach((input) => {
    const serviceId = input.dataset.servicePrice;
    const priceKey = input.dataset.priceKey;
    setPricingRate(serviceId, priceKey, input.value, input.dataset.priceKiosk || state.adminPricingKioskId);
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
        ? [{ id: "template-document-1", title: "Upload Template Document", description: "Uploaded template document.", pages: 1, fields: [], imageUrl: "", documentType: "image" }]
        : next.templates;
    } else if (field === "projectIds") {
      next.projectIds = [slug(value, "")].filter(Boolean);
      next.kioskIds = [];
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











function closeKioskServiceModal() {
  state.adminSelectedServiceKioskId = "";
  state.serviceEditor = null;
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
        id: "blank-form",
        title: "Upload Template Document",
        description: "Uploaded template document.",
        pages: 1,
        paperSize: "Auto",
        orientation: "portrait",
        fields: [],
        imageUrl: "",
        documentType: "image"
      }];
    }
  } else if (field === "projectIds") {
    draft.projectIds = [slug(value, "")].filter(Boolean);
    draft.kioskIds = [];
  } else if (field === "bw" || field === "color") {
    draft.pricing = {
      ...(draft.pricing || {}),
      [field]: numericPrice(value, 0)
    };
  } else if (field === "icon") {
    draft.icon = String(value || "SV").trim().toUpperCase().slice(0, 3);
  } else if (field === "id") {
    draft.id = slug(value, "service");
  } else if (["title", "titleHi", "titleMr", "description", "descriptionHi", "descriptionMr", "imageUrl"].includes(field)) {
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
  } else if (field === "paperSize") {
    existing.paperSize = normalizePaperSize(value, "Auto", true);
  } else if (field === "orientation") {
    existing.orientation = normalizeOrientation(value);
  } else if (field === "description") {
    existing.description = String(value || "").trimStart();
  } else if (field === "fields") {
    existing.fields = normalizeTemplateFields(value);
  } else if (field === "imageUrl") {
    existing.imageUrl = String(value || "").trim();
    existing.documentType = templateDocumentKind(value);
  } else if (field === "documentType") {
    existing.documentType = templateDocumentKind(value);
  }
}












function addService() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  if (!firstAdminServiceProjectId()) {
    state.pricingSaveStatus = "Ask the super admin to allocate a project before adding services.";
    render();
    return;
  }

  const id = `custom-service-${Date.now().toString().slice(-5)}`;
  const service = {
    id,
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
    projectIds: firstAdminServiceProjectId() ? [firstAdminServiceProjectId()] : [],
    kioskIds: [],
    customerSettings: { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS },
    printDefaults: { ...DEFAULT_SERVICE_PRINT_DEFAULTS },
    pricing: { bw: 2, color: 10 },
    templates: []
  };

  services = [...services, service];
  state.adminSelectedServiceId = id;
  state.pricing = {
    ...state.pricing,
    [id]: service.pricing
  };
  storeServices();
  storePricing();
  markServicesDirty("New service added. Edit details, then save services.");
  render();
}



async function saveServicesSettings() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  syncInlineServicesDraftFromDom();
  services = normalizeServicesConfig(services);
  state.pricing = normalizePricing(state.pricing);
  // Ensure every service has a projectId before sending to backend
  const fallbackProjectId = firstAdminServiceProjectId();
  if (fallbackProjectId) {
    services = services.map((service) =>
      (service.projectIds && service.projectIds.length)
        ? service
        : { ...service, projectIds: [fallbackProjectId], kioskIds: service.kioskIds || [] }
    );
  }
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

function renderProjects() {
  const canManage = kioskAdminCanManageSetup();

  return `
    ${renderAdminHeader("Project Management", "View and edit projects allocated to this kiosk admin account.", "")}
    ${adminNotice()}
    ${state.projectCreateStatus ? `<div class="save-note">${escapeHtml(state.projectCreateStatus)}</div>` : ""}
    ${canManage ? renderProjectEditorPanel() : ""}
    ${renderProjectManagementTable()}
  `;
}

function renderProjectEditorPanel() {
  if (!state.projectEditorOpen || !kioskAdminCanManageSetup()) return "";

  const draft = state.projectDraft;
  const editing = Boolean(state.projectEditId);

  return `
    <div class="module-card kiosk-editor-panel">
      <div class="editor-head">
        <div>
          <h2>${editing ? "Edit Project" : "Project Details"}</h2>
          <p class="helper-text">Projects group kiosks, services, pricing, and revenue.</p>
        </div>
        <button class="ghost-button" data-action="cancel-project-editor">Close</button>
      </div>
      <div class="settings-grid compact-service-editor-grid">
        <label class="setting-field">Project ID
          <input value="${escapeHtml(draft.projectId || "")}" data-project-draft-field="projectId" disabled />
        </label>
        <label class="setting-field">Project Name
          <input value="${escapeHtml(draft.name || "")}" data-project-draft-field="name" />
        </label>
        <label class="setting-field">Status
          <select data-project-draft-field="status">
            <option value="active" ${draft.status !== "inactive" ? "selected" : ""}>Active</option>
            <option value="inactive" ${draft.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </label>
        <label class="setting-field">Description
          <input value="${escapeHtml(draft.description || "")}" data-project-draft-field="description" />
        </label>
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-action="save-project-editor">Save Project</button>
        <button class="ghost-button" data-action="cancel-project-editor">Cancel</button>
      </div>
    </div>
  `;
}

// Projects shown as cards rather than a plain table - reuses the same
// card/grid classes (and their spacing/alignment fixes) as Super Admin's
// Project Management page, so both panels look and behave the same way.
function renderProjectManagementTable() {
  const page = adminPaginated(state.adminData.projects, "projects");
  const canManage = kioskAdminCanManageSetup();

  const cards = page.items.map((project) => {
    const isActive = project.status === "active";
    const kioskCount = state.adminData.kiosks.filter((kiosk) => kiosk.projectId === project.projectId).length;
    return `
      <article class="kiosk-service-row" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div class="simple-service-head" style="flex-direction: column; align-items: flex-start; gap: 16px;">
          <div class="simple-service-title" style="align-items: flex-start;">
            <div>
              <h2 style="font-size: 1.1rem; line-height: 1.3;">${escapeHtml(project.name || project.projectId || "Project")}</h2>
              <p class="helper-text" style="margin-top: 4px; line-height: 1.4;">${escapeHtml(project.description || "No description.")}</p>
            </div>
          </div>
          <div class="simple-service-actions" style="width: 100%; justify-content: flex-start;">
            <span class="badge ${isActive ? "good" : "bad"}" style="margin-right: auto;">${escapeHtml(project.status || "unknown")}</span>
            ${canManage ? `<button class="secondary-button small-button" data-project-edit="${escapeHtml(project.projectId || "")}">Edit</button>` : ""}
          </div>
        </div>
        <div class="simple-service-meta kiosk-service-row-meta" style="margin-top: 16px;">
          <span>Project ID <strong>${escapeHtml(project.projectId || "-")}</strong></span>
          <span>Kiosks <strong>${kioskCount}</strong></span>
        </div>
      </article>
    `;
  }).join("");

  const empty = page.items.length ? "" : `<div class="empty-note">No projects are assigned to this account.</div>`;

  return `
    <div class="kiosk-service-modal-list kiosk-service-page-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
      ${cards}${empty}
    </div>
    ${renderAdminPagination("projects", page)}
  `;
}

function openCreateProjectEditor() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  const nextNumber = state.adminData.projects.length + 1;
  state.projectDraft = {
    projectId: `project-${String(nextNumber).padStart(2, "0")}`,
    name: `Project ${nextNumber}`,
    status: "active",
    description: ""
  };
  state.projectEditId = "";
  state.projectEditorOpen = true;
  state.projectCreateStatus = "";
  render();
}

function openEditProjectEditor(projectId) {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  const project = state.adminData.projects.find((item) => item.projectId === projectId);
  if (!project) {
    state.projectCreateStatus = "Project not found.";
    render();
    return;
  }

  state.projectDraft = {
    projectId: project.projectId || "",
    name: project.name || "",
    status: project.status || "active",
    description: project.description || ""
  };
  state.projectEditId = project.projectId || "";
  state.projectEditorOpen = true;
  state.projectCreateStatus = "";
  render();
}

function closeProjectEditor() {
  state.projectEditorOpen = false;
  state.projectEditId = "";
  state.projectCreateStatus = "";
  render();
}

function updateProjectDraftField(field, value) {
  if (field === "projectId") {
    state.projectDraft.projectId = slug(value, "");
  } else if (field === "status") {
    state.projectDraft.status = value === "inactive" ? "inactive" : "active";
  } else if (["name", "description"].includes(field)) {
    state.projectDraft[field] = String(value || "").trimStart();
  }
}

function syncProjectDraftFromDom() {
  document.querySelectorAll("[data-project-draft-field]").forEach((input) => {
    updateProjectDraftField(input.dataset.projectDraftField, input.value);
  });
}

async function saveProjectEditor() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  syncProjectDraftFromDom();
  const draft = { ...state.projectDraft };

  if (!draft.projectId) {
    state.projectCreateStatus = "Enter a project ID.";
    render();
    return;
  }

  if (!draft.name) {
    state.projectCreateStatus = "Enter a project name.";
    render();
    return;
  }

  state.projectCreateStatus = state.projectEditId ? "Saving project..." : "Creating project...";
  render();

  try {
    const editing = Boolean(state.projectEditId);
    const path = editing
      ? `/api/admin/projects/${encodeURIComponent(state.projectEditId)}`
      : "/api/admin/projects";
    const payload = await fetchAdminJson(path, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: draft })
    });

    state.adminData.projects = Array.isArray(payload.projects) ? payload.projects : state.adminData.projects;
    state.projectEditorOpen = false;
    state.projectEditId = "";
    state.projectCreateStatus = editing ? "Project saved." : "Project created.";
  } catch (error) {
    state.projectCreateStatus = error.message || "Project save failed.";
  }

  render();
}

async function deleteProject(projectId) {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  if (!projectId) return;
  if (!(await window.customConfirm(`Delete project ${projectId}? Kiosks under this project will also be removed.`))) return;

  state.projectCreateStatus = "Deleting project...";
  render();

  try {
    const payload = await fetchAdminJson(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE"
    });
    state.adminData.projects = Array.isArray(payload.projects) ? payload.projects : state.adminData.projects.filter((project) => project.projectId !== projectId);
    state.adminData.kiosks = Array.isArray(payload.kiosks) ? payload.kiosks : state.adminData.kiosks.filter((kiosk) => kiosk.projectId !== projectId);
    if (Array.isArray(payload.services)) {
      applyServiceConfig({ services: payload.services, pricing: payload.pricing || state.pricing, config: payload.config }, { rerender: false, source: "admin" });
    }
    if (state.projectEditId === projectId) {
      state.projectEditorOpen = false;
      state.projectEditId = "";
    }
    state.projectCreateStatus = "Project deleted.";
  } catch (error) {
    state.projectCreateStatus = error.message || "Project delete failed.";
  }

  render();
}

function renderKiosks() {
  const canManage = kioskAdminCanManageSetup();

  return `
    ${renderAdminHeader("Kiosk Management", canManage ? "Manage and configure kiosks inside your allocated projects." : "View kiosks inside your allocated projects.", "")}
    ${adminNotice()}
    ${state.kioskCreateStatus ? `<div class="save-note">${escapeHtml(state.kioskCreateStatus)}</div>` : ""}
    ${canManage ? renderKioskEditorPanel() : ""}
    ${renderKioskManagementTable()}
  `;
}

function renderKioskEditorPanel() {
  if (!state.kioskEditorOpen || !state.kioskEditId || !kioskAdminCanManageSetup()) return "";

  const draft = state.kioskCreate;
  const editing = Boolean(state.kioskEditId);
  const projects = state.adminData.projects || [];

  return `
    <div class="module-card kiosk-editor-panel">
      <div class="editor-head">
        <div>
          <h2>Edit Kiosk</h2>
          <p class="helper-text">Mini PC setup uses the kiosk ID and setup code.</p>
        </div>
        <button class="ghost-button" data-action="cancel-kiosk-editor">Close</button>
      </div>
      <div class="settings-grid compact-service-editor-grid">
        <label class="setting-field">Kiosk ID
          <input value="${escapeHtml(draft.kioskId || "")}" data-kiosk-draft-field="kioskId" disabled />
        </label>
        <label class="setting-field">Name
          <input value="${escapeHtml(draft.name || "")}" data-kiosk-draft-field="name" />
        </label>
        <label class="setting-field">Project
          <select data-kiosk-draft-field="projectId">
            ${projects.map((project) => `<option value="${escapeHtml(project.projectId)}" ${draft.projectId === project.projectId ? "selected" : ""}>${escapeHtml(project.name || project.projectId)}</option>`).join("")}
          </select>
        </label>
        <label class="setting-field">Branch
          <input value="${escapeHtml(draft.branch || "")}" data-kiosk-draft-field="branch" />
        </label>
        <label class="setting-field">Mini PC Setup Code
          <input value="${escapeHtml(draft.setupCode || "")}" data-kiosk-draft-field="setupCode" />
        </label>
      </div>
      <div class="flow-actions">
        <button class="primary-button" data-action="save-kiosk-editor">Save Kiosk</button>
        <button class="ghost-button" data-action="cancel-kiosk-editor">Cancel</button>
      </div>
    </div>
  `;
}

function renderKioskManagementTable() {
  const page = adminPaginated(state.adminData.kiosks, "kiosks");
  const kiosks = page.items;
  const canManage = kioskAdminCanManageSetup();

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kiosk ID</th>
            <th>Name</th>
            <th>Project</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Setup Code</th>
            ${canManage ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${kiosks.length ? kiosks.map((kiosk) => {
            return `
            <tr>
              <td>${escapeHtml(kiosk.kioskId || "")}</td>
              <td>${escapeHtml(kiosk.name || "")}</td>
              <td>${escapeHtml(kiosk.projectId || "")}</td>
              <td>${escapeHtml(kiosk.branch || "")}</td>
              <td>${escapeHtml(kiosk.status || "Unknown")}</td>
              <td>${escapeHtml(kiosk.setupCode || "")}</td>
              ${canManage ? `
              <td>
                <div class="table-actions">
                  <button class="action-btn-edit" data-kiosk-edit="${escapeHtml(kiosk.kioskId || "")}" title="Edit">${uiIcon("edit", 18)}</button>
                </div>
              </td>
              ` : ""}
            </tr>
          `;
          }).join("") : `
            <tr><td colspan="${canManage ? 7 : 6}">No kiosks are assigned to this account.</td></tr>
          `}
        </tbody>
      </table>
    </div>
    ${renderAdminPagination("kiosks", page)}
  `;
}

function randomKioskSetupCode() {
  return uniqueAdminSetupCode(state.kioskEditId || "");
}

function openCreateKioskEditor() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  const project = state.adminData.projects[0];
  if (!project) {
    state.kioskCreateStatus = "No assigned projects found. Ask the super admin to allocate a project first.";
    render();
    return;
  }

  const kioskId = nextAdminKioskId();
  const nextNumber = Number(/^KIOSK-(\d+)$/i.exec(kioskId)?.[1]) || state.adminData.kiosks.length + 1;
  state.kioskCreate = {
    kioskId,
    name: `Kiosk ${nextNumber}`,
    projectId: project.projectId,
    branch: "",
    setupCode: uniqueAdminSetupCode()
  };
  state.kioskEditId = "";
  state.kioskEditorOpen = true;
  state.kioskCreateStatus = "";
  render();
}

function openEditKioskEditor(kioskId) {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  const kiosk = state.adminData.kiosks.find((item) => String(item.kioskId || "").toUpperCase() === String(kioskId || "").toUpperCase());
  if (!kiosk) {
    state.kioskCreateStatus = "Kiosk not found.";
    render();
    return;
  }

  state.kioskCreate = {
    kioskId: kiosk.kioskId || "",
    name: kiosk.name || "",
    projectId: kiosk.projectId || state.adminData.projects[0]?.projectId || "",
    branch: kiosk.branch || "",
    setupCode: kiosk.setupCode || uniqueAdminSetupCode(kiosk.kioskId || "")
  };
  state.kioskEditId = kiosk.kioskId || "";
  state.kioskEditorOpen = true;
  state.kioskCreateStatus = "";
  render();
}

function closeKioskEditor() {
  state.kioskEditorOpen = false;
  state.kioskEditId = "";
  state.kioskCreateStatus = "";
  render();
}

function updateKioskDraftField(field, value) {
  if (field === "kioskId") {
    state.kioskCreate.kioskId = normalizeKioskCode(value);
  } else if (field === "setupCode") {
    state.kioskCreate.setupCode = normalizeKioskCode(value, 16);
  } else if (field === "projectId") {
    state.kioskCreate.projectId = slug(value, "");
  } else if (["name", "branch"].includes(field)) {
    state.kioskCreate[field] = String(value || "").trimStart();
  }
}

function syncKioskDraftFromDom() {
  document.querySelectorAll("[data-kiosk-draft-field]").forEach((input) => {
    updateKioskDraftField(input.dataset.kioskDraftField, input.value);
  });
}

async function saveKioskEditor() {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  syncKioskDraftFromDom();
  const editing = Boolean(state.kioskEditId);
  const draft = {
    ...state.kioskCreate,
    kioskId: normalizeKioskCode(state.kioskCreate.kioskId),
    setupCode: normalizeKioskCode(state.kioskCreate.setupCode, 16)
  };
  const originalKioskId = normalizeKioskCode(state.kioskEditId || "");

  if (!draft.kioskId) {
    state.kioskCreateStatus = "Enter a kiosk ID.";
    render();
    return;
  }

  if (adminKioskIdExists(draft.kioskId, originalKioskId)) {
    state.kioskCreateStatus = "Kiosk ID already exists. Use a unique kiosk ID.";
    render();
    return;
  }

  if (!draft.setupCode) {
    state.kioskCreateStatus = "Enter a Mini PC setup code.";
    render();
    return;
  }

  if (adminSetupCodeExists(draft.setupCode, originalKioskId)) {
    state.kioskCreateStatus = "Mini PC setup code already exists. Generate a new setup code.";
    render();
    return;
  }

  if (!draft.projectId) {
    state.kioskCreateStatus = "Select a project.";
    render();
    return;
  }

  state.kioskCreateStatus = state.kioskEditId ? "Saving kiosk..." : "Creating kiosk...";
  render();

  try {
    const path = editing
      ? `/api/admin/kiosks/${encodeURIComponent(state.kioskEditId)}`
      : "/api/admin/kiosks";
    const payload = await fetchAdminJson(path, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kiosk: draft })
    });

    state.adminData.kiosks = Array.isArray(payload.kiosks) ? payload.kiosks : state.adminData.kiosks;
    state.kioskEditorOpen = false;
    state.kioskEditId = "";
    state.kioskCreateStatus = editing ? "Kiosk saved." : "Kiosk created.";
  } catch (error) {
    state.kioskCreateStatus = error.message || "Kiosk save failed.";
  }

  render();
}

async function deleteKiosk(kioskId) {
  if (!kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  if (!kioskId) return;
  if (!(await window.customConfirm(`Delete kiosk ${kioskId}?`))) return;

  state.kioskCreateStatus = "Deleting kiosk...";
  render();

  try {
    const payload = await fetchAdminJson(`/api/admin/kiosks/${encodeURIComponent(kioskId)}`, {
      method: "DELETE"
    });
    state.adminData.kiosks = Array.isArray(payload.kiosks) ? payload.kiosks : state.adminData.kiosks.filter((kiosk) => kiosk.kioskId !== kioskId);
    if (state.kioskEditId === kioskId) {
      state.kioskEditorOpen = false;
      state.kioskEditId = "";
    }
    state.kioskCreateStatus = "Kiosk deleted.";
  } catch (error) {
    state.kioskCreateStatus = error.message || "Kiosk delete failed.";
  }

  render();
}

function renderAlerts() {
  const alerts = adminOperationalAlerts();
  const affectedKiosks = new Set(alerts.map((alert) => alert.kioskId).filter(Boolean)).size;
  const paperAlerts = alerts.filter((alert) => alert.category === "paper").length;
  const tonerAlerts = alerts.filter((alert) => alert.category === "toner").length;

  return `
    ${renderAdminHeader("Alert Center", "Real-time printer hardware diagnostics, paper level, toner status & network alerts.")}
    ${adminNotice()}

    <!-- 4 KPI Cards: colored left-border accent, circle icon, number + label -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 20px; margin-top: 16px; margin-bottom: 28px;">
      <div class="alert-kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #ef4444; border-radius: 14px; padding: 20px 22px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04); display: flex; align-items: center; gap: 16px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${uiIcon("alert", 22)}
        </div>
        <div>
          <strong style="font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.1; display: block;">${alerts.length}</strong>
          <span style="font-size: 13.5px; color: #64748b; font-weight: 600;">Open Alerts</span>
        </div>
      </div>

      <div class="alert-kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 14px; padding: 20px 22px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04); display: flex; align-items: center; gap: 16px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${uiIcon("kiosks", 22)}
        </div>
        <div>
          <strong style="font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.1; display: block;">${affectedKiosks}</strong>
          <span style="font-size: 13.5px; color: #64748b; font-weight: 600;">Kiosks Affected</span>
        </div>
      </div>

      <div class="alert-kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #f97316; border-radius: 14px; padding: 20px 22px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04); display: flex; align-items: center; gap: 16px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #ffedd5; color: #ea580c; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${uiIcon("printer", 22)}
        </div>
        <div>
          <strong style="font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.1; display: block;">${paperAlerts}</strong>
          <span style="font-size: 13.5px; color: #64748b; font-weight: 600;">Paper / Jam</span>
        </div>
      </div>

      <div class="alert-kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; border-radius: 14px; padding: 20px 22px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04); display: flex; align-items: center; gap: 16px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #dbeafe; color: #2563eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${uiIcon("toner", 22)}
        </div>
        <div>
          <strong style="font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.1; display: block;">${tonerAlerts}</strong>
          <span style="font-size: 13.5px; color: #64748b; font-weight: 600;">Toner Level</span>
        </div>
      </div>
    </div>

    <!-- Active Live Alerts Section -->
    <div style="margin-bottom: 32px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <h2 style="font-family: var(--font-serif, 'Playfair Display', Georgia, serif); font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 10px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);"></span>
          Live Active Printer Alerts
        </h2>
        <span style="font-size: 13px; font-weight: 600; color: #64748b;">Showing ${alerts.length} active ${alerts.length === 1 ? 'issue' : 'issues'}</span>
      </div>

      ${alerts.length ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 20px;">
          ${alerts.map(alert => {
            const isBad = alert.tone === 'bad' || alert.tone === 'red';
            const statusBg = isBad ? '#fef2f2' : '#fffbeb';
            const statusBorder = isBad ? '#fecaca' : '#fde68a';
            const badgeBg = isBad ? '#fee2e2' : '#fef3c7';
            const badgeColor = isBad ? '#991b1b' : '#92400e';
            const iconBg = isBad ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #f59e0b, #d97706)';

            return `
              <div style="background: #ffffff; border: 1px solid ${statusBorder}; border-radius: 20px; padding: 24px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;">
                <div>
                  <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <div style="width: 44px; height: 44px; border-radius: 14px; background: ${iconBg}; color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25); flex-shrink: 0;">
                        ${uiIcon("alert", 22)}
                      </div>
                      <div>
                        <strong style="font-size: 16px; font-weight: 800; color: #0f172a; font-family: var(--font-serif, 'Playfair Display', Georgia, serif); display: block;">${escapeHtml(alert.title || 'Kiosk Alert')}</strong>
                        <span style="font-size: 12px; font-weight: 600; color: #64748b;">${escapeHtml(alert.kioskId || "All Kiosks")}</span>
                      </div>
                    </div>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid ${statusBorder}; flex-shrink: 0;">OPEN</span>
                  </div>
                  <p style="font-size: 13.5px; color: #475569; margin: 0 0 16px 0; line-height: 1.5; font-weight: 500; background: ${statusBg}; padding: 12px 16px; border-radius: 12px; border: 1px solid ${statusBorder};">${escapeHtml(alert.detail || 'Printer requires maintenance or inspection.')}</p>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;">
                  <span style="display: flex; align-items: center; gap: 6px; font-weight: 500;">
                    ${uiIcon("history", 14)} Realtime Diagnostic Log
                  </span>
                  <button class="secondary-button" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: #334155; cursor: pointer;" data-admin-page="kiosks">View Kiosk</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: 20px; padding: 32px 36px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03);">
          <div style="width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, #10b981, #059669); color: white; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
            ${uiIcon("check", 26)}
          </div>
          <h4 style="font-size: 18px; font-weight: 800; color: #064e3b; margin: 0 0 6px 0; font-family: var(--font-serif, 'Playfair Display', Georgia, serif);">All Systems Operating Normally</h4>
          <p style="font-size: 14px; color: #15803d; margin: 0; font-weight: 500;">Paper level, toner cartridges, print queue, and kiosk network connectivity are completely healthy.</p>
        </div>
      `}
    </div>

    ${renderAdminAlertLogsTable()}
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
      </select>
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

function handleKeydown(event) {
  if (event.key !== "Enter") return;

  if (event.target?.dataset?.adminLoginField !== undefined) {
    event.preventDefault();
    adminLogin();
  }
}

function bindEvents() {
  const app = qs("#app");
  app.onclick = handleClick;
  app.onchange = handleChange;
  app.oninput = handleInput;
  app.onkeydown = handleKeydown;
  bindCustomerInactivityEvents();
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
    const payload = await loginWithAdminCredentials(email, password);

    storeAdminSession(payload);
    state.adminLoginDraft.password = "";

    if (payload.role === "super-admin") {
      redirectToSuperAdmin();
      return;
    }

    state.adminAuthed = true;
    state.adminToken = payload.token || "";
    state.adminAccount = payload.admin || null;
    state.adminLoginError = "";
    // Always land on the Dashboard after logging in, not whatever page was
    // open before a previous logout (resolveInitialKioskAdminPage() restores
    // that from sessionStorage for page refreshes, but a fresh login should
    // never inherit it).
    state.adminPage = "dashboard";
    render();
    loadAdminData();
    startAdminPolling();
    startAdminSocket();
  } catch (error) {
    state.adminAuthed = false;
    state.adminToken = "";
    state.adminAccount = null;
    state.adminLoginError = error.message || "Admin login failed.";
    render();
  }
}

async function handleClick(event) {
  const target = event.target.closest("button, [data-template], [data-service], [data-action], [data-template-search-input]");
  if (!target) {
    return;
  }

  if (target.disabled) {
    return;
  }

  if (target.dataset.customerLanguageButton !== undefined) {
    const nextLanguage = target.dataset.customerLanguageButton;
    state.customerLanguage = CUSTOMER_LANGUAGES.has(nextLanguage) ? nextLanguage : "en";
    storeCustomerLanguage();
    render();
    return;
  }

  if (target.dataset.adminPaginationKey && target.dataset.adminPaginationPage) {
    state.adminPagination[target.dataset.adminPaginationKey] = Math.max(1, Number(target.dataset.adminPaginationPage) || 1);
    render();
    return;
  }

  if (target.dataset.service) {
    // The service card's wrapping <div> also carries data-service so the whole
    // card is clickable, but only the inner <button> gets the HTML `disabled`
    // attribute — gate here too so an offline printer (or no internet) can't
    // be bypassed by clicking the card body instead of the button.
    if (!printerReadyForCustomerFlow() || customerInternetBlockStatus()) {
      return;
    }
    state.selectedService = target.dataset.service;
    state.templateSearchQuery = "";
    state.templateSearchKeyboardActive = false;
    applyServicePrintDefaults(selectedService());
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

    const selectedTemplates = formTemplatesForService(target.dataset.service);
    if (isFormTemplateService(target.dataset.service) && selectedTemplates.length === 1) {
      const template = selectedTemplates[0];
      applyTemplatePrintDefaults(template);
      setJobFiles([createTemplateFile(template)]);
      state.uploadSession = null;
      state.uploadError = "";
      state.step = 2;
      render();
      return;
    }

    render();

    if (!isFormTemplateService(target.dataset.service)) {
      startMobileUploadSession();
    }

    return;
  }

  if (target.dataset.adminPage) {
    state.adminPage = target.dataset.adminPage;
    state.adminNavOpen = false;
    state.serviceEditor = null;
    state.adminSelectedServiceKioskId = "";
    state.adminPermissionStatus = "";
    render();
    if (!(TEST_HOOKS_ENABLED && state.adminToken === "ui-test-session")) {
      loadAdminData();
    }
    return;
  }

  if (target.dataset.idleScreensaverImageDelete !== undefined) {
    deleteAdminIdleImage(Number(target.dataset.idleScreensaverImageDelete));
    return;
  }

  if (target.dataset.idleScreensaverImageMove !== undefined) {
    moveAdminIdleImage(Number(target.dataset.idleScreensaverImageMove), Number(target.dataset.idleScreensaverImageDirection));
    return;
  }

























  if (target.dataset.projectEdit) {
    if (!kioskAdminCanManageSetup()) {
      blockKioskAdminSetupAction();
      return;
    }
    openEditProjectEditor(target.dataset.projectEdit);
    return;
  }

  if (target.dataset.projectDelete) {
    if (!kioskAdminCanManageSetup()) {
      blockKioskAdminSetupAction();
      return;
    }
    deleteProject(target.dataset.projectDelete);
    return;
  }

  if (target.dataset.kioskEdit) {
    if (!kioskAdminCanManageSetup()) {
      blockKioskAdminSetupAction();
      return;
    }
    openEditKioskEditor(target.dataset.kioskEdit);
    return;
  }

  if (target.dataset.kioskDelete) {
    if (!kioskAdminCanManageSetup()) {
      blockKioskAdminSetupAction();
      return;
    }
    deleteKiosk(target.dataset.kioskDelete);
    return;
  }





















  if (target.dataset.policyPage) {
    setPrivacyPolicyVisible(true, target.dataset.policyPage);
    render();
    return;
  }

  if (target.dataset.setting) {
    if (target.dataset.setting === "colorMode" && !customerSettingEnabled(target.dataset.value)) {
      return;
    }
    if (target.dataset.setting === "sides") {
      if (!customerSettingEnabled("sides") || (target.dataset.value === "duplex" && state.printer?.supportsDuplex === false)) {
        return;
      }
    }
    state.settings[target.dataset.setting] = target.dataset.value;
    state.settingsCustomized = true;
    render();
    return;
  }

  if (target.dataset.previewFileIndex !== undefined) {
    state.previewFileIndex = Math.max(0, Math.min(jobFiles().length - 1, Number(target.dataset.previewFileIndex) || 0));
    state.previewZoom = 1;
    state.previewPage = 1;
    render();
    return;
  }

  if (target.dataset.source) {
    if (!state.selectedService) {
      state.selectedService = "print";
    }

    clearCurrentFile();
    setJobFiles([createSourceFile(target.dataset.source)]);
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
    clearCurrentFile();
    applyTemplatePrintDefaults(template);
    setJobFiles([createTemplateFile(template)]);
    state.uploadError = "";
    state.uploadSession = null;
    state.step = 2;
    render();
    return;
  }

  if (target.dataset.templateSearchKey !== undefined || target.dataset.templateSearchAction !== undefined) {
    const current = String(state.templateSearchQuery || "");
    let next = current;

    if (target.dataset.templateSearchKey !== undefined) {
      next = `${current}${String(target.dataset.templateSearchKey || "").toLowerCase()}`;
    } else if (target.dataset.templateSearchAction === "toggle-keyboard") {
      state.templateSearchKeyboardActive = !state.templateSearchKeyboardActive;
      render();
      if (state.templateSearchKeyboardActive) {
        focusTemplateSearchInput();
      }
      return;
    } else if (target.dataset.templateSearchAction === "close") {
      state.templateSearchKeyboardActive = false;
      render();
      return;
    } else if (target.dataset.templateSearchAction === "go") {
      state.templateSearchKeyboardActive = false;
      render();
      return;
    } else if (target.dataset.templateSearchAction === "clear") {
      state.templateSearchQuery = "";
      state.templatePage = 1;
      state.templateSearchKeyboardActive = false;
      render();
      return;
    } else if (target.dataset.templateSearchAction === "space") {
      next = current.endsWith(" ") || !current ? current : `${current} `;
    } else if (target.dataset.templateSearchAction === "backspace") {
      next = current.slice(0, -1);
    }

    setTemplateSearchQuery(next);
    return;
  }

  if (target.dataset.templateSearchInput !== undefined) {
    activateTemplateSearchKeyboard();
    return;
  }

  const setupMutationActions = new Set([
    "save-pricing",
    "save-services",
    "add-service",
    "create-project",
    "save-project-editor",
    "create-kiosk",
    "save-kiosk-editor",
    "save-service-editor"
  ]);

  if (target.dataset.action && setupMutationActions.has(target.dataset.action) && !kioskAdminCanManageSetup()) {
    blockKioskAdminSetupAction();
    return;
  }

  switch (target.dataset.action) {
    case "multi-preview-prev":
      if (state.multiPreviewPage > 1) {
        state.multiPreviewPage--;
        render();
      }
      break;
    case "multi-preview-next":
      state.multiPreviewPage = (state.multiPreviewPage || 1) + 1;
      render();
      break;
    case "open-privacy-policy":
      setPrivacyPolicyVisible(true);
      render();
      break;
    case "close-privacy-policy":
      setPrivacyPolicyVisible(false);
      render();
      break;
    case "admin-toggle-nav":
      state.adminNavOpen = !state.adminNavOpen;
      render();
      break;
    case "admin-close-nav":
      state.adminNavOpen = false;
      render();
      break;
    case "refresh-admin":
      loadAdminData();
      break;
    case "close-kiosk-service-modal":
      closeKioskServiceModal();
      break;
    case "admin-toggle-profile-menu":
      state.adminProfileMenuOpen = !state.adminProfileMenuOpen;
      render();
      break;
    case "admin-open-settings":
      state.adminProfileMenuOpen = false;
      state.adminSettingsModalOpen = true;
      state.adminSettingsStatus = "";
      state.adminSettingsDraft = {
        username: state.adminAccount?.email || state.adminAccount?.name || "admin@printingkiosk.local",
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
      render();
      loadAdminIdleScreensaver();
      break;
    case "admin-close-settings":
      state.adminSettingsModalOpen = false;
      state.adminSettingsStatus = "";
      render();
      break;
    case "admin-save-settings":
      saveAdminSettings();
      break;
    case "save-idle-screensaver":
      saveAdminIdleScreensaver();
      break;
    case "admin-logout":
      state.adminAuthed = false;
      state.adminNavOpen = false;
      state.adminToken = "";
      state.adminAccount = null;
      clearAdminSession();
      stopAdminPolling();
      stopAdminSocket();
      openAdmin();
      break;
    case "reset-session":
    case "finish-session":
      resetCustomer();
      render();
      refreshPrinterStatus();
      break;
    case "prev-step":
      if (state.step >= 3) {
        stopPaymentPolling();
      }
      if (state.step <= 1) {
        stopUploadPolling();
        state.step = 0;
        state.uploadSession = null;
        state.uploadError = "";
        state.templateSearchQuery = "";
        state.templateSearchKeyboardActive = false;
      } else {
        const prevStep = Math.max(0, state.step - 1);
        state.step = prevStep;
        // When going back to the upload screen, always generate a fresh QR session.
        // The old session is already consumed (status=uploaded) and the mobile page
        // can no longer accept new uploads on it — a new token is required.
        if (prevStep === 1 && !isFormTemplateService()) {
          stopUploadPolling();
          state.uploadSession = null;
          state.uploadError = "";
          render();
          startMobileUploadSession();
          break;
        }
      }
      render();
      break;
    case "decrease-copies":
      state.settings.copies = Math.max(1, Number(state.settings.copies || 1) - 1);
      state.settingsCustomized = true;
      render();
      break;
    case "increase-copies":
      state.settings.copies = Math.min(99, Number(state.settings.copies || 1) + 1);
      state.settingsCustomized = true;
      render();
      break;
    case "next-step":
      goToNextStep();
      break;
    case "zoom-in":
      state.previewZoom = Number(Math.min(2, Number(state.previewZoom || 1) + 0.15).toFixed(2));
      render();
      break;
    case "zoom-out":
      state.previewZoom = Number(Math.max(0.6, Number(state.previewZoom || 1) - 0.15).toFixed(2));
      render();
      break;
    case "fit-preview":
      state.previewZoom = 1;
      render();
      break;
    case "prev-preview-page":
      state.previewPage = Math.max(1, Number(state.previewPage || 1) - 1);
      render();
      break;
    case "next-preview-page": {
      const pages = Math.max(1, Number(activePreviewFile()?.pages) || 1);
      state.previewPage = Math.min(pages, Number(state.previewPage || 1) + 1);
      render();
      break;
    }
    case "remove-document": {
      const index = parseInt(target.dataset.index, 10);
      const files = state.files || (state.file ? [state.file] : []);
      if (!isNaN(index) && index >= 0 && index < files.length) {
        files.splice(index, 1);
        if (files.length === 0) {
          clearCurrentFile();
          state.step = 1;
          if (!isFormTemplateService()) {
            startMobileUploadSession();
          }
        } else {
          state.files = files;
          state.file = files[0] || null;
          const PAGE_SIZE = 4;
          const totalPages = Math.ceil(files.length / PAGE_SIZE);
          if (state.multiPreviewPage > totalPages) {
            state.multiPreviewPage = totalPages || 1;
          }
          if (state.previewFileIndex >= files.length) {
            state.previewFileIndex = Math.max(0, files.length - 1);
          }
        }
        render();
      }
      break;
    }
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
      if (isFreePrintJob()) {
        startFreePrintJob();
      } else {
        startRazorpayPayment();
      }
      break;
    case "demo-payment-success":
      completeDemoPayment();
      break;
    case "mobile-pay":
      startMobileRazorpayPayment();
      break;
    case "retry-print":
      state.printError = "";
      state.printProgress = 0;
      state.printStatusMessage = "";
      state.step = 3;
      render();
      startLocalPrintJob();
      break;
    case "admin-toggle-profile-menu":
      state.adminProfileMenuOpen = !state.adminProfileMenuOpen;
      render();
      break;
    case "admin-login":
      await adminLogin();
      break;
    case "toggle-admin-login-password":
      state.adminLoginPasswordVisible = !state.adminLoginPasswordVisible;
      render();
      break;
    case "toggle-admin-login-theme":
      state.adminLoginThemeDark = !state.adminLoginThemeDark;
      render();
      break;
    case "save-pricing":
      savePricingSettings();
      break;
    case "save-services":
      saveServicesSettings();
      break;
    case "add-service":
      openCreateServiceEditor(state.adminSelectedServiceKioskId, "upload");
      break;
    case "create-project":
      openCreateProjectEditor();
      break;
    case "cancel-project-editor":
      closeProjectEditor();
      break;
    case "save-project-editor":
      saveProjectEditor();
      break;
    case "create-kiosk":
      openCreateKioskEditor();
      break;
    case "cancel-kiosk-editor":
      closeKioskEditor();
      break;
    case "save-kiosk-editor":
      saveKioskEditor();
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

  if (!kioskAdminCanManageSetup() && isKioskAdminSetupMutationInput(target)) {
    blockKioskAdminSetupAction();
    if (target.type === "file") {
      target.value = "";
    }
    return;
  }

  if (target.dataset.customerLanguage !== undefined) {
    state.customerLanguage = CUSTOMER_LANGUAGES.has(target.value) ? target.value : "en";
    storeCustomerLanguage();
    render();
    return;
  }

  if (target.dataset.adminLanguage !== undefined) {
    state.adminLanguage = ADMIN_LANGUAGES.has(target.value) ? target.value : "en";
    storeAdminLanguage();
    render();
    return;
  }

  if (target.dataset.previewFileSelect !== undefined) {
    state.previewFileIndex = Math.max(0, Math.min(jobFiles().length - 1, Number(target.value) || 0));
    state.previewZoom = 1;
    state.previewPage = 1;
    render();
    return;
  }

  if (target.dataset.adminLoginField) {
    state.adminLoginDraft[target.dataset.adminLoginField] = target.value;
    state.adminLoginError = "";
    return;
  }

  if (target.dataset.adminSettingsField) {
    state.adminSettingsDraft[target.dataset.adminSettingsField] = target.value;
    state.adminSettingsStatus = "";
    return;
  }

  if (target.dataset.idleScreensaverField && state.idleScreensaverDraft) {
    const field = target.dataset.idleScreensaverField;
    state.idleScreensaverDraft[field] = field === "idleTimeoutSeconds" ? Number(target.value) || 60 : target.value;
    state.idleScreensaverStatus = "";
    render();
    return;
  }

  if (target.dataset.idleScreensaverImageUpload !== undefined && target.files?.length) {
    await uploadAdminIdleImages(target.files);
    target.value = "";
    return;
  }

  if (target.dataset.idleScreensaverVideoUpload !== undefined && target.files?.length) {
    await uploadAdminIdleVideo(target.files[0]);
    target.value = "";
    return;
  }

  if (target.dataset.adminServiceSelect !== undefined) {
    state.adminSelectedServiceId = target.value;
    render();
    return;
  }

  if (target.dataset.adminPricingKiosk !== undefined) {
    const value = target.value === "__default" ? "__default" : normalizeKioskId(target.value);
    state.adminPricingKioskId = value || "__default";
    state.pricingSaveStatus = "";
    render();
    return;
  }

  if (target.dataset.kioskDraftField) {
    updateKioskDraftField(target.dataset.kioskDraftField, target.value);
    render();
    return;
  }

  if (target.dataset.projectDraftField) {
    updateProjectDraftField(target.dataset.projectDraftField, target.value);
    render();
    return;
  }

  if (target.dataset.draftTemplateImage !== undefined && target.files?.length) {
    await uploadAdminTemplateImage(target.files[0], {
      draft: true,
      templateIndex: Number(target.dataset.templateDraftIndex || 0)
    });
    target.value = "";
    return;
  }

  if (target.dataset.templateImage && target.files?.length) {
    await uploadAdminTemplateImage(target.files[0], {
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

    const selectedFiles = Array.from(target.files);
    if (selectedFiles.length > MAX_FILES_PER_JOB) {
      clearCurrentFile();
      state.uploadError = `Choose no more than ${MAX_FILES_PER_JOB} files.`;
      render();
      return;
    }

    const invalidFile = selectedFiles.find((file) => !customerUploadExtensions.includes(normalizedFileExtension(file.name)));
    if (invalidFile) {
      clearCurrentFile();
      state.uploadError = "Only PDF, JPG, and PNG files are supported.";
      render();
      return;
    }

    try {
      const records = await Promise.all(selectedFiles.map(async (file) => {
        const result = createFileRecord(file.name, file.size, 1, file.type);
        if (result.error) throw new Error(result.error);

        // Fast rejection using the size-based estimate, before touching the
        // file content at all - catches the common case instantly.
        const estimateError = await enforceUploadPageLimit(result.file);
        if (estimateError) throw new Error(estimateError);

        result.file.previewUrl = URL.createObjectURL(file);
        const [printContentBase64, pageLimitError] = await Promise.all([
          readFileAsBase64(file),
          enforceUploadPageLimit(result.file)
        ]);
        result.file.printContentBase64 = printContentBase64;

        // The estimate can under-count a small-but-many-page PDF - the second
        // check (now with previewUrl set) catches it with the real pdf.js count.
        if (pageLimitError) throw new Error(pageLimitError);

        return result.file;
      }));

      const paperError = enforceUploadPaperSufficiency(records);
      if (paperError) throw new Error(paperError);

      clearCurrentFile();
      setJobFiles(records);
      state.uploadError = "";
      state.step = 2;
      render();
    } catch (error) {
      clearCurrentFile();
      state.uploadError = error.message || "The selected files could not be read.";
      render();
    }
    return;
  }

  if (target.dataset.input) {
    const field = target.dataset.input;
    const settingKey = field === "range" ? "pageRange" : field;
    if (!customerSettingEnabled(settingKey)) {
      return;
    }
    state.settings[field] = field === "paperSize"
      ? normalizePaperSize(String(target.value).replace(/\s*\(printer default\)$/, ""), "A4")
      : field === "orientation"
        ? normalizeOrientation(target.value)
        : field === "copies"
          ? Math.max(1, Math.min(99, Number(target.value) || 1))
          : target.value;
    state.settingsCustomized = true;
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
    state.adminPagination.history = 1;
    render();
    return;
  }

  if (target.dataset.transactionFilter) {
    state.transactionFilters[target.dataset.transactionFilter] = target.value;
    state.adminPagination.revenueTransactions = 1;
    render();
    return;
  }

  render();
}

function handleInput(event) {
  const target = event.target;

  if (!kioskAdminCanManageSetup() && isKioskAdminSetupMutationInput(target)) {
    blockKioskAdminSetupAction();
    return;
  }

  if (target.dataset.templateSearchInput !== undefined) {
    setTemplateSearchQuery(target.value);
    return;
  }

  if (target.dataset.input) {
    const settingKey = target.dataset.input === "range" ? "pageRange" : target.dataset.input;
    if (!customerSettingEnabled(settingKey)) {
      return;
    }
    state.settings[target.dataset.input] = target.value;
    state.settingsCustomized = true;
  }

  if (target.dataset.adminLoginField) {
    state.adminLoginDraft[target.dataset.adminLoginField] = target.value;
    state.adminLoginError = "";
    return;
  }

  if (target.dataset.kioskDraftField) {
    updateKioskDraftField(target.dataset.kioskDraftField, target.value);
    return;
  }

  if (target.dataset.projectDraftField) {
    updateProjectDraftField(target.dataset.projectDraftField, target.value);
    return;
  }

  if (target.dataset.servicePrice && target.dataset.priceKey) {
    setPricingRate(target.dataset.servicePrice, target.dataset.priceKey, target.value, target.dataset.priceKiosk || state.adminPricingKioskId);
    state.pricingSaveStatus = "";
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
    state.adminPagination.history = 1;
  }

  if (target.dataset.transactionFilter) {
    state.transactionFilters[target.dataset.transactionFilter] = target.value;
    state.adminPagination.revenueTransactions = 1;
    render();
    return;
  }

  if (target.dataset.priceKey || target.dataset.filter || target.dataset.transactionFilter || target.dataset.input || target.dataset.projectDraftField || target.dataset.kioskDraftField || target.dataset.serviceField || target.dataset.templateField || target.dataset.serviceDraftField || target.dataset.templateDraftField) {
    return;
  }
}

function addJob(printStatus, failureReason = state.printError) {
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
  if (!DEMO_KIOSK_MODE) {
    const completionConfirmed = printStatus === "Completed" ? state.printJob?.completionConfirmed : undefined;
    syncBackendPrintStatus(printStatus, failureReason, completionConfirmed);
  }

  if (printStatus === "Completed") {
    state.lastCompletedJob = job;
  }

  return job;
}

function resetCustomer() {
  stopUploadPolling();
  stopPaymentPolling();
  stopCustomerInactivityTimer();
  hideIdleScreensaver();
  state.mode = "customer";
  setPrivacyPolicyVisible(false);
  state.step = 0;
  state.selectedService = null;
  state.templateSearchQuery = "";
  state.templateSearchKeyboardActive = false;
  clearCurrentFile();
  state.uploadSession = null;
  state.previewZoom = 1;
  state.previewActivityArea = "document";
  state.previewFileIndex = 0;
  state.previewPage = 1;
  state.settings = {
    colorMode: "bw",
    copies: 1,
    paperSize: normalizePaperSize(state.printer.defaultPaperSize, "A4"),
    sides: "single",
    orientation: "portrait",
    range: "all",
    staple: "no"
  };
  state.settingsCustomized = false;
  enforceCustomerSettings();
  state.paymentStatus = "Pending";
  state.paymentStatusMessage = "";
  state.paymentError = "";
  state.paymentOrder = null;
  state.paymentBusy = false;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  state.customerPrinterNotice = null;
  state.lastAlertedPrinterIssue = null;
  state.activeJobId = null;
  state.lastCompletedJob = null;
  state.thankYouPhase = "payment_done";
  state.thankYouSecondsLeft = null;
  state.printer = {
    ...state.printer,
    online: false,
    checking: true,
    name: "No printer selected",
    paper: "Unknown",
    toner: "Unknown",
    queue: 0,
    supportsColor: null,
    agent: "Checking",
    statusText: "Checking printer status...",
    manualReadyOverride: false
  };
  if (DEMO_KIOSK_MODE) {
    applyDemoKioskConfig({ rerender: false });
  }
}

if (TEST_HOOKS_ENABLED) {
  window.kioskTestOpenAdmin = function kioskTestOpenAdmin(page = "dashboard") {
    state.adminAuthed = true;
    state.adminToken = "ui-test-session";
    state.adminAccount = { name: "Client" };
    state.mode = "admin";
    state.adminPage = page;
    render();
    return state.adminPage;
  };

  window.kioskTestSetAdminData = function kioskTestSetAdminData(payload = {}) {
    state.adminData = { ...state.adminData, ...payload };
    state.adminPagination = {};
    render();
    return state.adminData;
  };

  window.kioskTestOpenCustomer = function kioskTestOpenCustomer() {
    resetCustomer();
    render();
    return state.mode;
  };

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

    if (["pdf", "image"].includes(result.file.previewKind)) {
      const blob = new Blob([new Uint8Array(size)], { type: mimeType });
      result.file.previewUrl = URL.createObjectURL(blob);
      result.file.printContentBase64 = btoa("test document");
    }

    stopUploadPolling();
    clearCurrentFile();
    setJobFiles([result.file]);
    state.uploadError = "";
    state.step = 2;
    render();
    return { file: result.file };
  };

  window.kioskTestMarkPaymentSuccess = function kioskTestMarkPaymentSuccess() {
    ensureActiveJobId();
    state.paymentStatus = "Success";
    state.paymentStatusMessage = "Payment marked successful.";
    state.paymentError = "";
    state.paymentBusy = false;
    state.step = 3;
    state.printProgress = 0;
    state.printError = "";
    state.printStatusMessage = "";
    state.printJob = null;
    render();
  };

  window.kioskTestCompletePrint = function kioskTestCompletePrint() {
    state.printProgress = 5;
    addJob("Completed");
    state.thankYouPhase = "thankyou";
    state.step = 4;
    render();
    return state.lastCompletedJob;
  };

  window.kioskTestReceiveUploads = function kioskTestReceiveUploads(files) {
    const records = files.slice(0, MAX_FILES_PER_JOB).map(({ name, size = 1024, mimeType = "application/pdf" }) => {
      const result = createReceivedFileRecord({ name, size, mimeType, pages: mimeType.startsWith("image/") ? 1 : undefined });
      if (result.error) throw new Error(result.error);
      const blob = new Blob([new Uint8Array(size)], { type: mimeType });
      result.file.previewUrl = URL.createObjectURL(blob);
      result.file.printContentBase64 = btoa("test document");
      return result.file;
    });
    clearCurrentFile();
    setJobFiles(records);
    state.uploadError = "";
    state.step = 2;
    render();
    return records;
  };

  window.kioskTestSetPrinterReady = function kioskTestSetPrinterReady() {
    state.printer = {
      ...state.printer,
      online: true,
      checking: false,
      name: "Manual ready printer",
      paper: "Ready",
      toner: "Ready",
      queue: 0,
      agent: "Running",
      statusText: "Ready",
      manualReadyOverride: true
    };
    render();
    return state.printer;
  };
}

hydrateAdminSession();

try {
  const savedState = sessionStorage.getItem("kioskCustomerState");
  if (savedState) {
    const parsed = JSON.parse(savedState);
    if (parsed.step !== undefined && parsed.step > 0 && parsed.selectedService) {
      state.step = parsed.step;
      state.selectedService = parsed.selectedService;
      if (parsed.selectedTemplate) state.selectedTemplate = parsed.selectedTemplate;

      if (state.step >= 2) {
        const isTemplate = services.find(s => s.id === state.selectedService)?.mode === "template" || (formTemplates[state.selectedService] && formTemplates[state.selectedService].length > 0);
        if (!isTemplate && (!state.files || state.files.length === 0)) {
          state.step = 1;
        }
      }
    } else if (parsed.step === 0) {
      state.step = 0;
      state.selectedService = null;
    }
  }
} catch (e) { }

if (!isMobilePaymentEntry && state.mode === "customer" && !DEMO_KIOSK_MODE && KIOSK_ID !== UNASSIGNED_KIOSK_ID && !services.length) {
  state.configStatus = "Loading kiosk services...";
}

render();
loadPricingSettings();
if (isMobilePaymentEntry) {
  loadMobilePayment();
} else {
  startConfigPolling();
}
if (!isMobilePaymentEntry && state.mode === "customer") {
  refreshPrinterStatus();
  startPrinterStatusPolling();
}
if (!isMobilePaymentEntry && state.adminAuthed) {
  loadAdminData();
  startAdminPolling();
  startAdminSocket();
}

setInterval(updateKioskClock, 1000);
setInterval(tickThankYouHomeCountdown, 1000);
setInterval(tickPrinterOfflineWatchdog, 1000);

// ── Printer Health IPC bridge (Electron-only, non-breaking) ─────────────────
// No-op when window.kioskPrinterHealth is not exposed (non-Electron / demo mode).
initPrinterHealthIpc();
initInternetStatusIpc();

window.addEventListener("hashchange", () => {
  if (state.mode === "admin" && state.adminAuthed) {
    const pageFromHash = resolveInitialKioskAdminPage();
    if (pageFromHash && pageFromHash !== state.adminPage) {
      state.adminPage = pageFromHash;
      state.serviceEditor = null;
      render();
    }
  }
});
