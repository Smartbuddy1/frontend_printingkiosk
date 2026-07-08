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
const PUBLIC_FRONTEND_URL = (
  runtimeConfig.get("publicFrontendUrl") ||
  runtimeConfig.get("frontendUrl") ||
  frontendConfig.publicFrontendUrl ||
  frontendConfig.frontendUrl ||
  ""
).replace(/\/+$/, "");
const RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const PRINTER_STATUS_TIMEOUT_MS = 15000;
const MAX_FILES_PER_JOB = 10;
const RECEIPT_REDIRECT_SECONDS = 15;
const UNASSIGNED_KIOSK_ID = "UNASSIGNED-KIOSK";
const CUSTOMER_DEMO_LOGO_SRC = "./assets/nashik-municipal-logo.jpg";
const CUSTOMER_DEMO_LOGO_ALT = "Nashik Municipal Corporation";
const ADMIN_SESSION_KEY = "printingKioskAdminSession";
const ADMIN_LANGUAGE_KEY = "printingKioskAdminLanguage";
const CUSTOMER_LANGUAGE_KEY = "printingKioskCustomerLanguage";
const ADMIN_LANGUAGES = new Set(["en", "hi", "mr"]);
const CUSTOMER_LANGUAGES = ADMIN_LANGUAGES;
const TEST_HOOKS_ENABLED = frontendConfig.testHooks === true ||
  runtimeConfig.get("testHooks") === "true";
const KIOSK_ID = readConfiguredKioskId();
const HAS_EXPLICIT_LOCAL_AGENT = Boolean(runtimeConfig.get("localAgentUrl") || frontendConfig.localAgentUrl);
const DEMO_KIOSK_MODE = runtimeConfig.get("demo") === "true" ||
  runtimeConfig.get("kioskDemo") === "true" ||
  (KIOSK_ID === "LOCAL-KIOSK" && runtimeConfig.get("demo") !== "false");
let localJobSequence = 0;

const ADMIN_TRANSLATION_ROWS = [
  ["Language", "भाषा", "भाषा"],
  ["English", "अंग्रेज़ी", "इंग्रजी"],
  ["Hindi", "हिंदी", "हिंदी"],
  ["Marathi", "मराठी", "मराठी"],
  ["Print Kiosk Admin Console", "Print Kiosk एडमिन कंसोल", "Print Kiosk प्रशासक कन्सोल"],
  ["assigned project management", "असाइन की गई परियोजना प्रबंधन", "नेमून दिलेल्या प्रकल्पांचे व्यवस्थापन"],
  ["Logout", "लॉग आउट", "लॉग आउट"],
  ["Open alerts", "अलर्ट खोलें", "सूचना उघडा"],
  ["Open navigation", "नेविगेशन खोलें", "नेव्हिगेशन उघडा"],
  ["Close navigation", "नेविगेशन बंद करें", "नेव्हिगेशन बंद करा"],
  ["Refresh admin data", "एडमिन डेटा रीफ़्रेश करें", "प्रशासक डेटा रिफ्रेश करा"],
  ["Navigation", "नेविगेशन", "नेव्हिगेशन"],
  ["Operate", "संचालन", "संचालन"],
  ["Support", "सहायता", "सहाय्य"],
  ["Dashboard", "डैशबोर्ड", "डॅशबोर्ड"],
  ["Projects", "परियोजनाएँ", "प्रकल्प"],
  ["Project", "परियोजना", "प्रकल्प"],
  ["Kiosks", "कियोस्क", "किऑस्क"],
  ["Kiosk", "कियोस्क", "किऑस्क"],
  ["Services", "सेवाएँ", "सेवा"],
  ["Service", "सेवा", "सेवा"],
  ["Pricing", "मूल्य निर्धारण", "दर व्यवस्थापन"],
  ["Revenue", "राजस्व", "महसूल"],
  ["Print History", "प्रिंट इतिहास", "मुद्रण इतिहास"],
  ["System Status", "सिस्टम स्थिति", "प्रणाली स्थिती"],
  ["Need Help?", "सहायता चाहिए?", "मदत हवी आहे?"],
  ["Check kiosk devices and connection status.", "कियोस्क डिवाइस और कनेक्शन की स्थिति जाँचें।", "किऑस्क उपकरणे आणि जोडणीची स्थिती तपासा."],
  ["Open System Status", "सिस्टम स्थिति खोलें", "प्रणाली स्थिती उघडा"],
  ["Print Kiosk Admin Login", "Print Kiosk एडमिन लॉगिन", "Print Kiosk प्रशासक लॉगिन"],
  ["Use your admin credentials. The system opens the right dashboard automatically.", "अपने एडमिन क्रेडेंशियल का उपयोग करें। सिस्टम सही डैशबोर्ड अपने आप खोलेगा।", "आपली प्रशासक लॉगिन माहिती वापरा. प्रणाली योग्य डॅशबोर्ड आपोआप उघडेल."],
  ["Email or mobile", "ईमेल या मोबाइल", "ईमेल किंवा मोबाइल"],
  ["Password", "पासवर्ड", "पासवर्ड"],
  ["Sign in", "साइन इन", "साइन इन"],
  ["Enter admin email and password.", "एडमिन ईमेल और पासवर्ड दर्ज करें।", "प्रशासक ईमेल आणि पासवर्ड प्रविष्ट करा."],
  ["Admin login failed.", "एडमिन लॉगिन विफल रहा।", "प्रशासक लॉगिन अयशस्वी झाले."],
  ["Manage your assigned projects, kiosks, services, and pricing.", "अपनी असाइन की गई परियोजनाएँ, कियोस्क, सेवाएँ और मूल्य प्रबंधित करें।", "आपले नेमून दिलेले प्रकल्प, किऑस्क, सेवा आणि दर व्यवस्थापित करा."],
  ["Live backend data.", "लाइव बैकएंड डेटा।", "थेट बॅकएंड डेटा."],
  ["Loading live backend data...", "लाइव बैकएंड डेटा लोड हो रहा है...", "थेट बॅकएंड डेटा लोड होत आहे..."],
  ["Last updated", "अंतिम अपडेट", "शेवटचे अद्यतन"],
  ["Today Revenue", "आज का राजस्व", "आजचा महसूल"],
  ["Today Jobs", "आज के कार्य", "आजची कामे"],
  ["Failed Jobs", "विफल कार्य", "अयशस्वी कामे"],
  ["Pages Printed", "प्रिंट किए गए पृष्ठ", "मुद्रित पाने"],
  ["Pending Refunds", "लंबित रिफंड", "प्रलंबित परतावे"],
  ["Queue Length", "कतार की लंबाई", "रांगेची लांबी"],
  ["Live backend total", "लाइव बैकएंड कुल", "थेट बॅकएंड एकूण"],
  ["Managed access", "प्रबंधित एक्सेस", "व्यवस्थापित प्रवेश"],
  ["Completed and queued jobs", "पूर्ण और कतारबद्ध कार्य", "पूर्ण आणि रांगेतील कामे"],
  ["Pending super admin review", "सुपर एडमिन समीक्षा लंबित", "सुपर प्रशासक पुनरावलोकन प्रलंबित"],
  ["No pending records", "कोई लंबित रिकॉर्ड नहीं", "प्रलंबित नोंदी नाहीत"],
  ["Live job records", "लाइव कार्य रिकॉर्ड", "थेट कामाच्या नोंदी"],
  ["Revenue Trend", "राजस्व रुझान", "महसूल कल"],
  ["paid job(s)", "भुगतान किए गए कार्य", "सशुल्क कामे"],
  ["daily avg", "दैनिक औसत", "दैनिक सरासरी"],
  ["peak", "सर्वाधिक", "सर्वाधिक"],
  ["Failure Safe Queue", "विफलता सुरक्षित कतार", "अपयश सुरक्षित रांग"],
  ["Payment success print failed", "भुगतान सफल, प्रिंट विफल", "पेमेंट यशस्वी, मुद्रण अयशस्वी"],
  ["Active print queue", "सक्रिय प्रिंट कतार", "सक्रिय मुद्रण रांग"],
  ["View full queue details", "पूरी कतार का विवरण देखें", "संपूर्ण रांगेचा तपशील पहा"],
  ["Latest Alerts", "नवीनतम अलर्ट", "नवीनतम सूचना"],
  ["View all alerts", "सभी अलर्ट देखें", "सर्व सूचना पहा"],
  ["No live alerts", "कोई लाइव अलर्ट नहीं", "थेट सूचना नाहीत"],
  ["Open", "खोलें", "उघडा"],
  ["Revenue graph for your assigned kiosks and projects.", "आपके असाइन किए गए कियोस्क और परियोजनाओं का राजस्व ग्राफ।", "आपल्या नेमून दिलेल्या किऑस्क आणि प्रकल्पांचा महसूल आलेख."],
  ["Period Revenue", "अवधि का राजस्व", "कालावधी महसूल"],
  ["Last 14 days", "पिछले 14 दिन", "मागील 14 दिवस"],
  ["Paid Jobs", "भुगतान किए गए कार्य", "सशुल्क कामे"],
  ["Included in graph", "ग्राफ में शामिल", "आलेखात समाविष्ट"],
  ["Daily Average", "दैनिक औसत", "दैनिक सरासरी"],
  ["Across this period", "इस अवधि में", "या कालावधीत"],
  ["Live print job history for your assigned projects and kiosks.", "आपकी असाइन की गई परियोजनाओं और कियोस्क का प्रिंट इतिहास।", "आपल्या नेमून दिलेल्या प्रकल्प आणि किऑस्कचा मुद्रण इतिहास."],
  ["Search job, kiosk, branch", "कार्य, कियोस्क या शाखा खोजें", "काम, किऑस्क किंवा शाखा शोधा"],
  ["All statuses", "सभी स्थितियाँ", "सर्व स्थिती"],
  ["Success", "सफल", "यशस्वी"],
  ["Failed", "विफल", "अयशस्वी"],
  ["Refund", "रिफंड", "परतावा"],
  ["Job ID", "कार्य आईडी", "काम आयडी"],
  ["Date", "दिनांक", "दिनांक"],
  ["Branch", "शाखा", "शाखा"],
  ["File", "फ़ाइल", "फाइल"],
  ["Pages", "पृष्ठ", "पाने"],
  ["Copies", "प्रतियाँ", "प्रती"],
  ["Amount", "राशि", "रक्कम"],
  ["Payment", "भुगतान", "पेमेंट"],
  ["Print", "प्रिंट", "मुद्रण"],
  ["View", "देखें", "पहा"],
  ["No backend print jobs yet.", "अभी कोई बैकएंड प्रिंट कार्य नहीं है।", "अद्याप बॅकएंड मुद्रण कामे नाहीत."],
  ["Live health data for kiosks in your assigned projects.", "आपकी असाइन की गई परियोजनाओं के कियोस्क का स्वास्थ्य डेटा।", "आपल्या नेमून दिलेल्या प्रकल्पांतील किऑस्कचा आरोग्य डेटा."],
  ["Status", "स्थिति", "स्थिती"],
  ["Last Online", "अंतिम ऑनलाइन", "शेवटचे ऑनलाइन"],
  ["Online", "ऑनलाइन", "ऑनलाइन"],
  ["online", "ऑनलाइन", "ऑनलाइन"],
  ["Offline", "ऑफलाइन", "ऑफलाइन"],
  ["offline", "ऑफलाइन", "ऑफलाइन"],
  ["Unknown", "अज्ञात", "अज्ञात"],
  ["Unassigned", "असाइन नहीं", "नेमलेले नाही"],
  ["No kiosk health records are assigned to this account.", "इस खाते को कोई कियोस्क स्वास्थ्य रिकॉर्ड असाइन नहीं है।", "या खात्याला किऑस्क आरोग्य नोंदी नेमलेल्या नाहीत."],
  ["Service Management", "सेवा प्रबंधन", "सेवा व्यवस्थापन"],
  ["Services are listed first. Forms appear underneath their parent service. Open a service to create or update details.", "सेवाएँ पहले सूचीबद्ध हैं। फ़ॉर्म उनकी मूल सेवा के नीचे दिखाई देते हैं। विवरण बनाने या अपडेट करने के लिए सेवा खोलें।", "सेवा प्रथम सूचीबद्ध आहेत. फॉर्म त्यांच्या मूळ सेवेखाली दिसतात. तपशील तयार किंवा अद्यतनित करण्यासाठी सेवा उघडा."],
  ["Create Service", "सेवा बनाएँ", "सेवा तयार करा"],
  ["Save Changes", "बदल सहेजें", "बदल जतन करा"],
  ["Unsaved service changes. Use Save Services to publish them to the kiosk backend.", "सेवा के बदलाव सहेजे नहीं गए हैं। उन्हें कियोस्क बैकएंड पर प्रकाशित करने के लिए सेवाएँ सहेजें।", "सेवेतील बदल जतन केलेले नाहीत. ते किऑस्क बॅकएंडवर प्रकाशित करण्यासाठी सेवा जतन करा."],
  ["Enabled", "सक्षम", "सक्षम"],
  ["Disabled", "अक्षम", "अक्षम"],
  ["Off", "बंद", "बंद"],
  ["Edit", "संपादित करें", "संपादित करा"],
  ["Delete", "हटाएँ", "हटवा"],
  ["None", "कोई नहीं", "काहीही नाही"],
  ["Forms", "फ़ॉर्म", "फॉर्म"],
  ["Forms under this service", "इस सेवा के फ़ॉर्म", "या सेवेतील फॉर्म"],
  ["No forms. Customer uses QR upload for PDF, DOC, image, and other supported documents.", "कोई फ़ॉर्म नहीं। ग्राहक PDF, DOC, इमेज और अन्य समर्थित दस्तावेज़ों के लिए QR अपलोड उपयोग करता है।", "फॉर्म नाहीत. ग्राहक PDF, DOC, प्रतिमा आणि इतर समर्थित कागदपत्रांसाठी QR अपलोड वापरतो."],
  ["No forms added yet. Edit this service to create forms.", "अभी कोई फ़ॉर्म नहीं जोड़ा गया। फ़ॉर्म बनाने के लिए इस सेवा को संपादित करें।", "अद्याप फॉर्म जोडलेले नाहीत. फॉर्म तयार करण्यासाठी ही सेवा संपादित करा."],
  ["Create a kiosk under an assigned project before creating services.", "सेवाएँ बनाने से पहले असाइन की गई परियोजना के अंतर्गत कियोस्क बनाएँ।", "सेवा तयार करण्यापूर्वी नेमून दिलेल्या प्रकल्पात किऑस्क तयार करा."],
  ["Edit Service", "सेवा संपादित करें", "सेवा संपादित करा"],
  ["Update service details on this page, then save to return to the Services list.", "इस पृष्ठ पर सेवा विवरण अपडेट करें, फिर सेवा सूची पर लौटने के लिए सहेजें।", "या पृष्ठावर सेवेचा तपशील अद्यतनित करा, नंतर सेवा यादीत परतण्यासाठी जतन करा."],
  ["Back to Services", "सेवाओं पर वापस जाएँ", "सेवांकडे परत जा"],
  ["Save Service", "सेवा सहेजें", "सेवा जतन करा"],
  ["New Service", "नई सेवा", "नवीन सेवा"],
  ["Yes", "हाँ", "होय"],
  ["No", "नहीं", "नाही"],
  ["Mode", "मोड", "प्रकार"],
  ["QR upload / image upload", "QR अपलोड / इमेज अपलोड", "QR अपलोड / प्रतिमा अपलोड"],
  ["Form templates", "फ़ॉर्म टेम्पलेट", "फॉर्म साचे"],
  ["Icon", "आइकन", "चिन्ह"],
  ["Service Name", "सेवा का नाम", "सेवेचे नाव"],
  ["Description", "विवरण", "वर्णन"],
  ["B/W Rate", "श्याम-श्वेत दर", "कृष्णधवल दर"],
  ["Color Rate", "रंगीन दर", "रंगीत दर"],
  ["Upload Service", "अपलोड सेवा", "अपलोड सेवा"],
  ["This service will show QR upload to customers. Change mode to Form templates if it should contain forms.", "यह सेवा ग्राहकों को QR अपलोड दिखाएगी। यदि इसमें फ़ॉर्म होने चाहिए तो मोड को फ़ॉर्म टेम्पलेट में बदलें।", "ही सेवा ग्राहकांना QR अपलोड दाखवेल. यात फॉर्म असावेत तर प्रकार फॉर्म साच्यांमध्ये बदला."],
  ["Cancel", "रद्द करें", "रद्द करा"],
  ["Forms under", "के अंतर्गत फ़ॉर्म", "अंतर्गत फॉर्म"],
  ["Add or update the forms that belong to this service.", "इस सेवा से संबंधित फ़ॉर्म जोड़ें या अपडेट करें।", "या सेवेशी संबंधित फॉर्म जोडा किंवा अद्यतनित करा."],
  ["Add Form", "फ़ॉर्म जोड़ें", "फॉर्म जोडा"],
  ["Remove Form", "फ़ॉर्म हटाएँ", "फॉर्म काढा"],
  ["Form Name", "फ़ॉर्म का नाम", "फॉर्मचे नाव"],
  ["Default Paper Size", "डिफ़ॉल्ट पेपर आकार", "डीफॉल्ट कागद आकार"],
  ["Printer default (recommended)", "प्रिंटर डिफ़ॉल्ट (अनुशंसित)", "प्रिंटर डीफॉल्ट (शिफारस केलेले)"],
  ["Default Orientation", "डिफ़ॉल्ट दिशा", "डीफॉल्ट दिशा"],
  ["Portrait", "पोर्ट्रेट", "उभे"],
  ["Landscape", "लैंडस्केप", "आडवे"],
  ["Fields", "फ़ील्ड", "फील्ड"],
  ["Image URL", "इमेज URL", "प्रतिमा URL"],
  ["Update Image", "इमेज अपडेट करें", "प्रतिमा अद्यतनित करा"],
  ["No forms yet. Use Add Form to create the first form for this service.", "अभी कोई फ़ॉर्म नहीं है। इस सेवा का पहला फ़ॉर्म बनाने के लिए फ़ॉर्म जोड़ें उपयोग करें।", "अद्याप फॉर्म नाहीत. या सेवेसाठी पहिला फॉर्म तयार करण्यासाठी फॉर्म जोडा वापरा."],
  ["Pricing Management", "मूल्य प्रबंधन", "दर व्यवस्थापन"],
  ["Set page-wise B/W and color rates for each customer service.", "प्रत्येक ग्राहक सेवा के लिए प्रति पृष्ठ श्याम-श्वेत और रंगीन दर निर्धारित करें।", "प्रत्येक ग्राहक सेवेसाठी पानानुसार कृष्णधवल आणि रंगीत दर ठरवा."],
  ["Save Pricing", "मूल्य सहेजें", "दर जतन करा"],
  ["B/W per page", "प्रति पृष्ठ श्याम-श्वेत", "प्रति पान कृष्णधवल"],
  ["Color per page", "प्रति पृष्ठ रंगीन", "प्रति पान रंगीत"],
  ["Assigned Projects", "असाइन की गई परियोजनाएँ", "नेमून दिलेले प्रकल्प"],
  ["Projects allocated to your client account. Create and manage kiosks from the Kiosks page.", "आपके क्लाइंट खाते को आवंटित परियोजनाएँ। कियोस्क पृष्ठ से कियोस्क बनाएँ और प्रबंधित करें।", "आपल्या क्लायंट खात्याला दिलेले प्रकल्प. किऑस्क पृष्ठावरून किऑस्क तयार आणि व्यवस्थापित करा."],
  ["Project Name", "परियोजना का नाम", "प्रकल्पाचे नाव"],
  ["No projects are assigned to this account.", "इस खाते को कोई परियोजना असाइन नहीं है।", "या खात्याला कोणतेही प्रकल्प नेमलेले नाहीत."],
  ["Assigned Kiosks", "असाइन किए गए कियोस्क", "नेमून दिलेले किऑस्क"],
  ["Create and manage kiosks inside your allocated projects.", "अपनी आवंटित परियोजनाओं के अंतर्गत कियोस्क बनाएँ और प्रबंधित करें।", "आपल्या नेमून दिलेल्या प्रकल्पांमध्ये किऑस्क तयार आणि व्यवस्थापित करा."],
  ["Create Kiosk", "कियोस्क बनाएँ", "किऑस्क तयार करा"],
  ["Kiosk ID", "कियोस्क आईडी", "किऑस्क आयडी"],
  ["Name", "नाम", "नाव"],
  ["Activation", "सक्रियण", "सक्रियकरण"],
  ["Actions", "कार्रवाई", "कृती"],
  ["Activated", "सक्रिय", "सक्रिय"],
  ["Not activated", "सक्रिय नहीं", "सक्रिय नाही"],
  ["No kiosks are assigned to this account.", "इस खाते को कोई कियोस्क असाइन नहीं है।", "या खात्याला कोणतेही किऑस्क नेमलेले नाहीत."],
  ["Edit Kiosk", "कियोस्क संपादित करें", "किऑस्क संपादित करा"],
  ["Mini PC setup uses the kiosk ID and setup code.", "Mini PC सेटअप कियोस्क आईडी और सेटअप कोड का उपयोग करता है।", "Mini PC सेटअप किऑस्क आयडी आणि सेटअप कोड वापरतो."],
  ["Close", "बंद करें", "बंद करा"],
  ["No assigned projects found. Ask the super admin to allocate a project first.", "कोई असाइन की गई परियोजना नहीं मिली। पहले सुपर एडमिन से परियोजना आवंटित करने को कहें।", "नेमून दिलेले प्रकल्प आढळले नाहीत. प्रथम सुपर प्रशासकाला प्रकल्प देण्यास सांगा."],
  ["Mini PC Setup Code", "Mini PC सेटअप कोड", "Mini PC सेटअप कोड"],
  ["Save Kiosk", "कियोस्क सहेजें", "किऑस्क जतन करा"],
  ["Notifications", "सूचनाएँ", "सूचना"],
  ["Dashboard, email, SMS, and WhatsApp alerts can be wired here.", "डैशबोर्ड, ईमेल, SMS और WhatsApp अलर्ट यहाँ जोड़े जा सकते हैं।", "डॅशबोर्ड, ईमेल, SMS आणि WhatsApp सूचना येथे जोडता येतात."],
  ["Printer offline", "प्रिंटर ऑफलाइन", "प्रिंटर ऑफलाइन"],
  ["Printer is not ready", "प्रिंटर तैयार नहीं है", "प्रिंटर तयार नाही"],
  ["Payment success but print failed", "भुगतान सफल लेकिन प्रिंट विफल", "पेमेंट यशस्वी पण मुद्रण अयशस्वी"],
  ["Refund request", "रिफंड अनुरोध", "परतावा विनंती"],
  ["Backend and assigned kiosk checks are clear.", "बैकएंड और असाइन किए गए कियोस्क की जाँच ठीक है।", "बॅकएंड आणि नेमून दिलेल्या किऑस्कची तपासणी व्यवस्थित आहे."],
  ["Previous", "पिछला", "मागील"],
  ["Next", "अगला", "पुढील"],
  ["Page", "पृष्ठ", "पान"],
  ["of", "में से", "पैकी"],
  ["records", "रिकॉर्ड", "नोंदी"],
  ["Saving pricing...", "मूल्य सहेजा जा रहा है...", "दर जतन होत आहेत..."],
  ["Pricing saved for all services.", "सभी सेवाओं का मूल्य सहेजा गया।", "सर्व सेवांचे दर जतन झाले."],
  ["Saving service...", "सेवा सहेजी जा रही है...", "सेवा जतन होत आहे..."],
  ["Saving services...", "सेवाएँ सहेजी जा रही हैं...", "सेवा जतन होत आहेत..."],
  ["Services saved for this kiosk project.", "इस कियोस्क परियोजना की सेवाएँ सहेजी गईं।", "या किऑस्क प्रकल्पासाठी सेवा जतन झाल्या."],
  ["Uploading image...", "इमेज अपलोड हो रही है...", "प्रतिमा अपलोड होत आहे..."],
  ["Service name is required.", "सेवा का नाम आवश्यक है।", "सेवेचे नाव आवश्यक आहे."],
  ["At least one service must remain.", "कम से कम एक सेवा रहनी चाहिए।", "किमान एक सेवा राहणे आवश्यक आहे."],
  ["Creating kiosk...", "कियोस्क बनाया जा रहा है...", "किऑस्क तयार होत आहे..."],
  ["Saving kiosk...", "कियोस्क सहेजा जा रहा है...", "किऑस्क जतन होत आहे..."],
  ["Deleting kiosk...", "कियोस्क हटाया जा रहा है...", "किऑस्क हटवला जात आहे..."],
  ["Enter a kiosk ID.", "कियोस्क आईडी दर्ज करें।", "किऑस्क आयडी प्रविष्ट करा."],
  ["Select a project.", "परियोजना चुनें।", "प्रकल्प निवडा."],
  ["Kiosk not found.", "कियोस्क नहीं मिला।", "किऑस्क सापडला नाही."],
  ["No", "नहीं", "नाही"]
];

const ADMIN_TRANSLATIONS = {
  hi: Object.fromEntries(ADMIN_TRANSLATION_ROWS.map(([english, hindi]) => [english, hindi])),
  mr: Object.fromEntries(ADMIN_TRANSLATION_ROWS.map(([english, , marathi]) => [english, marathi]))
};

const CUSTOMER_TRANSLATION_ROWS = [
  ["Language", "भाषा", "भाषा"],
  ["English", "अंग्रेज़ी", "इंग्रजी"],
  ["Hindi", "हिंदी", "हिंदी"],
  ["Marathi", "मराठी", "मराठी"],
  ["Print Kiosk", "प्रिंट कियोस्क", "प्रिंट किऑस्क"],
  ["Government and education ready", "सरकारी और शिक्षा सेवाओं के लिए तैयार", "सरकारी आणि शैक्षणिक सेवांसाठी तयार"],
  ["Online", "ऑनलाइन", "ऑनलाइन"],
  ["Offline", "ऑफलाइन", "ऑफलाइन"],
  ["New Session", "नया सत्र", "नवे सत्र"],
  ["Customer Flow", "ग्राहक प्रक्रिया", "ग्राहक प्रक्रिया"],
  ["Services", "सेवाएँ", "सेवा"],
  ["Upload", "अपलोड", "अपलोड"],
  ["Preview", "पूर्वावलोकन", "पूर्वावलोकन"],
  ["Payment", "भुगतान", "पेमेंट"],
  ["Receipt", "रसीद", "पावती"],
  ["Kiosk setup required", "कियोस्क सेटअप आवश्यक है", "किऑस्क सेटअप आवश्यक आहे"],
  ["Ask the client for this machine's kiosk ID and setup code.", "इस मशीन की कियोस्क आईडी और सेटअप कोड के लिए क्लाइंट से पूछें।", "या मशीनचा किऑस्क आयडी आणि सेटअप कोडसाठी क्लायंटला विचारा."],
  ["Available service", "उपलब्ध सेवा", "उपलब्ध सेवा"],
  ["Choose service", "सेवा चुनें", "सेवा निवडा"],
  ["This service is available on this kiosk.", "यह सेवा इस कियोस्क पर उपलब्ध है।", "ही सेवा या किऑस्कवर उपलब्ध आहे."],
  ["Select what you need to print.", "जो प्रिंट करना है उसे चुनें।", "जे मुद्रित करायचे आहे ते निवडा."],
  ["Choose form template", "फॉर्म टेम्पलेट चुनें", "फॉर्म साचा निवडा"],
  ["Print Blank Form", "खाली फॉर्म प्रिंट करें", "रिकामा फॉर्म मुद्रित करा"],
  ["Back to Services", "सेवाओं पर वापस जाएँ", "सेवांकडे परत जा"],
  ["Upload from phone", "फोन से अपलोड करें", "फोनवरून अपलोड करा"],
  ["Scan the QR code to send your documents.", "अपने दस्तावेज़ भेजने के लिए QR कोड स्कैन करें।", "आपली कागदपत्रे पाठवण्यासाठी QR कोड स्कॅन करा."],
  ["Preparing QR code", "QR कोड तैयार हो रहा है", "QR कोड तयार होत आहे"],
  ["Starting secure mobile upload session...", "सुरक्षित मोबाइल अपलोड सत्र शुरू हो रहा है...", "सुरक्षित मोबाइल अपलोड सत्र सुरू होत आहे..."],
  ["QR service offline", "QR सेवा ऑफलाइन है", "QR सेवा ऑफलाइन आहे"],
  ["Start the backend service, then generate a new QR.", "बैकएंड सेवा शुरू करें, फिर नया QR बनाएँ।", "बॅकएंड सेवा सुरू करा, मग नवीन QR तयार करा."],
  ["Upload QR code", "अपलोड QR कोड", "अपलोड QR कोड"],
  ["Preview and confirm", "पूर्वावलोकन करें और पुष्टि करें", "पूर्वावलोकन करा आणि पुष्टी करा"],
  ["Review the document and confirm the print details.", "दस्तावेज़ देखें और प्रिंट विवरण की पुष्टि करें।", "दस्तऐवज तपासा आणि मुद्रण तपशीलांची पुष्टी करा."],
  ["Print settings", "प्रिंट सेटिंग्स", "मुद्रण सेटिंग्ज"],
  ["Document", "दस्तावेज़", "दस्तऐवज"],
  ["Page Color", "पेज रंग", "पानाचा रंग"],
  ["B/W", "श्याम-श्वेत", "कृष्णधवल"],
  ["Color", "रंगीन", "रंगीत"],
  ["Page Copies", "पेज प्रतियाँ", "पानाच्या प्रती"],
  ["Total Pages", "कुल पेज", "एकूण पाने"],
  ["Total", "कुल", "एकूण"],
  ["Continue to Payment", "भुगतान पर जाएँ", "पेमेंटकडे जा"],
  ["Replace Document", "दस्तावेज़ बदलें", "दस्तऐवज बदला"],
  ["Back", "वापस", "मागे"],
  ["No file selected", "कोई फ़ाइल नहीं चुनी गई", "कोणतीही फाइल निवडलेली नाही"],
  ["Upload a file to see the preview.", "पूर्वावलोकन देखने के लिए फ़ाइल अपलोड करें।", "पूर्वावलोकन पाहण्यासाठी फाइल अपलोड करा."],
  ["PDF preview unavailable", "PDF पूर्वावलोकन उपलब्ध नहीं है", "PDF पूर्वावलोकन उपलब्ध नाही"],
  ["The file is valid. Continue after checking file details.", "फ़ाइल मान्य है। फ़ाइल विवरण जाँचने के बाद आगे बढ़ें।", "फाइल योग्य आहे. फाइल तपशील तपासल्यानंतर पुढे जा."],
  ["Uploaded document preview", "अपलोड दस्तावेज़ पूर्वावलोकन", "अपलोड दस्तऐवज पूर्वावलोकन"],
  ["Document preview", "दस्तावेज़ पूर्वावलोकन", "दस्तऐवज पूर्वावलोकन"],
  ["Uploaded document", "अपलोड किया गया दस्तावेज़", "अपलोड केलेला दस्तऐवज"],
  ["This uploaded document is ready for printing. A full DOC/DOCX visual preview needs server-side conversion to PDF.", "यह अपलोड किया गया दस्तावेज़ प्रिंट के लिए तैयार है। पूरे DOC/DOCX दृश्य पूर्वावलोकन के लिए सर्वर पर PDF रूपांतरण चाहिए।", "हा अपलोड केलेला दस्तऐवज मुद्रणासाठी तयार आहे. संपूर्ण DOC/DOCX दृश्य पूर्वावलोकनासाठी सर्व्हरवर PDF रूपांतरण आवश्यक आहे."],
  ["Preview placeholder", "पूर्वावलोकन स्थान", "पूर्वावलोकन जागा"],
  ["A real uploaded PDF or image will render here.", "अपलोड किया गया असली PDF या चित्र यहाँ दिखेगा।", "अपलोड केलेला खरा PDF किंवा प्रतिमा येथे दिसेल."],
  ["Color Mode", "रंग मोड", "रंग मोड"],
  ["Copies", "प्रतियाँ", "प्रती"],
  ["Pay the confirmed total securely to start printing.", "प्रिंट शुरू करने के लिए पुष्टि की गई कुल राशि सुरक्षित रूप से चुकाएँ।", "मुद्रण सुरू करण्यासाठी पुष्टी केलेली एकूण रक्कम सुरक्षितपणे भरा."],
  ["Total payable", "कुल देय", "एकूण देय"],
  ["Payment received", "भुगतान प्राप्त हुआ", "पेमेंट प्राप्त झाले"],
  ["Pay with Razorpay", "Razorpay से भुगतान करें", "Razorpay ने पेमेंट करा"],
  ["Order created", "ऑर्डर बनाया गया", "ऑर्डर तयार झाला"],
  ["Checkout opened", "चेकआउट खुला", "चेकआउट उघडले"],
  ["Signature verified", "हस्ताक्षर सत्यापित", "स्वाक्षरी सत्यापित"],
  ["Printing documents", "दस्तावेज़ प्रिंट हो रहे हैं", "दस्तऐवज मुद्रित होत आहेत"],
  ["Printer is offline. Payment will be available when it is online.", "प्रिंटर ऑफलाइन है। ऑनलाइन होने पर भुगतान उपलब्ध होगा।", "प्रिंटर ऑफलाइन आहे. ऑनलाइन झाल्यावर पेमेंट उपलब्ध होईल."],
  ["Processing...", "प्रक्रिया हो रही है...", "प्रक्रिया सुरू आहे..."],
  ["Pay", "भुगतान करें", "पेमेंट करा"],
  ["Done", "पूरा", "पूर्ण"],
  ["Active", "सक्रिय", "सक्रिय"],
  ["Pending", "लंबित", "प्रलंबित"],
  ["Printing needs attention", "प्रिंटिंग पर ध्यान चाहिए", "मुद्रणाकडे लक्ष देणे आवश्यक"],
  ["The paid job is saved in admin history and can be retried without charging again.", "भुगतान किया गया कार्य एडमिन इतिहास में सहेजा गया है और दोबारा शुल्क लिए बिना फिर से कोशिश की जा सकती है।", "सशुल्क काम प्रशासक इतिहासात जतन केले आहे आणि पुन्हा शुल्क न घेता पुन्हा प्रयत्न करता येईल."],
  ["Recovery Options", "रिकवरी विकल्प", "पुनर्प्राप्ती पर्याय"],
  ["Success", "सफल", "यशस्वी"],
  ["Failed", "विफल", "अयशस्वी"],
  ["Queue", "कतार", "रांग"],
  ["Saved for retry", "फिर कोशिश के लिए सहेजा गया", "पुन्हा प्रयत्नासाठी जतन केले"],
  ["Refund", "रिफंड", "परतावा"],
  ["Available if retry fails", "फिर कोशिश विफल होने पर उपलब्ध", "पुन्हा प्रयत्न अपयशी झाल्यास उपलब्ध"],
  ["Retry Print", "प्रिंट फिर कोशिश करें", "मुद्रण पुन्हा प्रयत्न करा"],
  ["Request Refund", "रिफंड माँगें", "परतावा मागा"],
  ["Printing completed successfully.", "प्रिंटिंग सफलतापूर्वक पूरी हुई।", "मुद्रण यशस्वीरित्या पूर्ण झाले."],
  ["Payment receipt", "भुगतान रसीद", "पेमेंट पावती"],
  ["Job ID", "कार्य आईडी", "काम आयडी"],
  ["Documents", "दस्तावेज़", "दस्तऐवज"],
  ["Pages", "पेज", "पाने"],
  ["Amount", "राशि", "रक्कम"],
  ["Status", "स्थिति", "स्थिती"],
  ["Return Home", "होम पर लौटें", "मुख्य पानावर परत जा"],
  ["Service", "सेवा", "सेवा"],
  ["File", "फ़ाइल", "फाइल"],
  ["Waiting", "प्रतीक्षा", "प्रतीक्षा"],
  ["Session", "सत्र", "सत्र"],
  ["B/W rate", "श्याम-श्वेत दर", "कृष्णधवल दर"],
  ["Color rate", "रंगीन दर", "रंगीत दर"],
  ["B/W per page", "प्रति पेज श्याम-श्वेत", "प्रति पान कृष्णधवल"],
  ["Color per page", "प्रति पेज रंगीन", "प्रति पान रंगीत"],
  ["Print Document", "दस्तावेज़ प्रिंट करें", "दस्तऐवज मुद्रित करा"],
  ["Upload PDF, Word, or image files and print after preview.", "PDF, Word या चित्र फ़ाइलें अपलोड करें और पूर्वावलोकन के बाद प्रिंट करें।", "PDF, Word किंवा प्रतिमा फाइल अपलोड करा आणि पूर्वावलोकनानंतर मुद्रित करा."],
  ["Scan Document", "दस्तावेज़ स्कैन करें", "दस्तऐवज स्कॅन करा"],
  ["Scan paper documents to PDF with receipt and admin tracking.", "कागज़ी दस्तावेज़ों को रसीद और एडमिन ट्रैकिंग के साथ PDF में स्कैन करें।", "कागदी दस्तऐवज पावती आणि प्रशासक ट्रॅकिंगसह PDF मध्ये स्कॅन करा."],
  ["Copy Document", "दस्तावेज़ कॉपी करें", "दस्तऐवज कॉपी करा"],
  ["Create quick photocopies with B/W or color pricing.", "श्याम-श्वेत या रंगीन दरों के साथ तुरंत फोटोकॉपी बनाएँ।", "कृष्णधवल किंवा रंगीत दरांसह जलद फोटोकॉपी करा."],
  ["Govt Form Print", "सरकारी फॉर्म प्रिंट", "सरकारी फॉर्म मुद्रण"],
  ["Print blank government form templates without upload.", "बिना अपलोड खाली सरकारी फॉर्म टेम्पलेट प्रिंट करें।", "अपलोडशिवाय रिकामे सरकारी फॉर्म साचे मुद्रित करा."],
  ["College Form Print", "कॉलेज फॉर्म प्रिंट", "कॉलेज फॉर्म मुद्रण"],
  ["Print admission, exam, certificate, and fee forms.", "प्रवेश, परीक्षा, प्रमाणपत्र और शुल्क फॉर्म प्रिंट करें।", "प्रवेश, परीक्षा, प्रमाणपत्र आणि फी फॉर्म मुद्रित करा."],
  ["Certificate Print", "प्रमाणपत्र प्रिंट", "प्रमाणपत्र मुद्रण"],
  ["Print certificates and supporting documents safely.", "प्रमाणपत्र और सहायक दस्तावेज़ सुरक्षित रूप से प्रिंट करें।", "प्रमाणपत्रे आणि सहाय्यक दस्तऐवज सुरक्षितपणे मुद्रित करा."]
];

const CUSTOMER_TRANSLATIONS = {
  hi: Object.fromEntries(CUSTOMER_TRANSLATION_ROWS.map(([english, hindi]) => [english, hindi])),
  mr: Object.fromEntries(CUSTOMER_TRANSLATION_ROWS.map(([english, , marathi]) => [english, marathi]))
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
    title: "Documents",
    titleHi: "दस्तावेज़",
    titleMr: "दस्तऐवज",
    description: "Upload PDF or image documents.",
    descriptionHi: "PDF या चित्र दस्तावेज़ अपलोड करें।",
    descriptionMr: "PDF किंवा प्रतिमा दस्तऐवज अपलोड करा.",
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
    title: "Existing Documents",
    titleHi: "मौजूदा दस्तावेज़",
    titleMr: "विद्यमान दस्तऐवज",
    description: "Print ready-made forms and documents.",
    descriptionHi: "तैयार फ़ॉर्म और दस्तावेज़ प्रिंट करें।",
    descriptionMr: "तयार फॉर्म आणि दस्तऐवज प्रिंट करा.",
    defaultPages: 1,
    mode: "template",
    enabled: true,
    projectIds: [],
    kioskIds: [],
    pricing: { bw: 3, color: 12 },
    templates: [
      {
        id: "demo-application-form",
        title: "Application Form",
        titleHi: "आवेदन पत्र",
        titleMr: "अर्ज फॉर्म",
        description: "One-page application form.",
        descriptionHi: "एक पृष्ठ का आवेदन पत्र।",
        descriptionMr: "एक पानाचा अर्ज फॉर्म.",
        pages: 1,
        paperSize: "A4",
        orientation: "portrait",
        fields: ["Applicant Name", "Mobile Number", "Address", "Purpose"],
        fieldsHi: ["आवेदक का नाम", "मोबाइल नंबर", "पता", "उद्देश्य"],
        fieldsMr: ["अर्जदाराचे नाव", "मोबाइल नंबर", "पत्ता", "उद्देश"],
        imageUrl: "",
        documentType: "html"
      },
      {
        id: "demo-id-proof-form",
        title: "ID Proof Form",
        titleHi: "पहचान प्रमाण फॉर्म",
        titleMr: "ओळख पुरावा फॉर्म",
        description: "Verification form.",
        descriptionHi: "सत्यापन फॉर्म।",
        descriptionMr: "पडताळणी फॉर्म.",
        pages: 2,
        paperSize: "A4",
        orientation: "portrait",
        fields: ["Full Name", "ID Number", "Date", "Signature"],
        fieldsHi: ["पूरा नाम", "पहचान संख्या", "दिनांक", "हस्ताक्षर"],
        fieldsMr: ["पूर्ण नाव", "ओळख क्रमांक", "दिनांक", "स्वाक्षरी"],
        imageUrl: "",
        documentType: "html"
      }
    ]
  }
];

const customerSteps = [
  "Services",
  "Upload",
  "Preview",
  "Payment",
  "Receipt"
];

const allowedUploadExtensions = ["PDF", "DOC", "DOCX", "JPG", "JPEG", "PNG"];
const customerUploadExtensions = ["PDF", "JPG", "JPEG", "PNG"];
const PRINT_PAPER_SIZES = ["A4", "A3", "Letter", "Legal"];
const DEFAULT_KIOSK_CUSTOMER_SETTINGS = Object.freeze({
  bw: true,
  color: true,
  copies: true,
  paperSize: true,
  sides: true,
  orientation: true,
  pageRange: true
});
const CUSTOMER_VISIBLE_SETTING_KEYS = new Set(["bw", "color", "copies", "paperSize", "sides", "orientation", "pageRange"]);
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

const state = {
  mode: isAdminEntry ? "admin" : "customer",
  adminAuthed: false,
  adminToken: "",
  adminAccount: null,
  adminLanguage: readStoredAdminLanguage(),
  customerLanguage: readStoredCustomerLanguage(),
  adminPage: runtimeConfig.get("adminPage") || "dashboard",
  adminNavOpen: false,
  adminLoginError: "",
  adminLoginDraft: {
    email: "",
    password: ""
  },
  step: 0,
  selectedService: null,
  file: null,
  files: [],
  uploadError: "",
  uploadSession: null,
  uploadPoller: null,
  previewZoom: 1,
  previewFileIndex: 0,
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
  paymentStatus: "Pending",
  paymentStatusMessage: "",
  paymentError: "",
  paymentOrder: null,
  paymentBusy: false,
  paymentPoller: null,
  customerClockTimer: null,
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
  activeJobId: null,
  lastCompletedJob: null,
  receiptRedirectTimer: null,
  receiptSecondsLeft: RECEIPT_REDIRECT_SECONDS,
  jobs: [...initialJobs],
  adminData: {
    dashboard: null,
    jobs: [],
    transactions: [],
    projects: [],
    kiosks: [],
    refunds: [],
    reports: [],
    backendOnline: false,
    lastUpdated: "",
    error: ""
  },
  adminPoller: null,
  adminPagination: {},
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
  kioskCustomerSettings: { ...DEFAULT_KIOSK_CUSTOMER_SETTINGS },
  pricing: readStoredPricing(),
  pricingSaveStatus: "",
  servicesDirty: false,
  serviceEditor: null,
  adminSelectedServiceId: "",
  imageUploadBusy: false,
  configVersion: 0,
  configUpdatedAt: "",
  configPoller: null,
  configStatus: "",
  alerts: [],
  filters: {
    table: "",
    status: "all"
  },
  transactionFilters: {
    search: "",
    status: "all",
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

function customerClockParts(now = new Date()) {
  return {
    time: now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).toUpperCase(),
    date: now.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  };
}

function renderCustomerClockTile() {
  const clock = customerClockParts();

  return `
    <div class="customer-clock-tile" data-customer-clock data-no-customer-translation aria-label="${escapeHtml(`${clock.time}, ${clock.date}`)}">
      ${uiIcon("clock", 18)}
      <strong data-customer-clock-time>${escapeHtml(clock.time)}</strong>
      <span data-customer-clock-date>${escapeHtml(clock.date)}</span>
    </div>
  `;
}

function updateCustomerClockTile() {
  const tile = document.querySelector("[data-customer-clock]");
  if (!tile) return false;

  const clock = customerClockParts();
  const time = tile.querySelector("[data-customer-clock-time]");
  const date = tile.querySelector("[data-customer-clock-date]");

  if (time) time.textContent = clock.time;
  if (date) date.textContent = clock.date;
  tile.setAttribute("aria-label", `${clock.time}, ${clock.date}`);
  return true;
}

function syncCustomerClockTimer() {
  const hasClock = updateCustomerClockTile();

  if (!hasClock && state.customerClockTimer) {
    clearInterval(state.customerClockTimer);
    state.customerClockTimer = null;
    return;
  }

  if (hasClock && !state.customerClockTimer) {
    state.customerClockTimer = setInterval(updateCustomerClockTile, 1000);
  }
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
  const language = state.customerLanguage;
  if (!text || language === "en") return text;

  const translations = CUSTOMER_TRANSLATIONS[language] || {};
  if (translations[text]) return translations[text];

  const translated = (english) => translations[english] || english;
  const patterns = [
    [/^(.+) \| Government and education ready$/, (match) => `${match[1]} | ${translated("Government and education ready")}`],
    [/^Printer (Online|Offline)$/, (match) => `${language === "hi" ? "प्रिंटर" : "प्रिंटर"} ${translated(match[1])}`],
    [/^(.+) selected\. Pick a form template to preview and print\.$/, (match) => language === "hi"
      ? `${match[1]} चुना गया। पूर्वावलोकन और प्रिंट के लिए फॉर्म टेम्पलेट चुनें।`
      : `${match[1]} निवडले. पूर्वावलोकन आणि मुद्रणासाठी फॉर्म साचा निवडा.`],
    [/^(\d+) pages?$/, (match) => `${match[1]} ${translated("Pages")}`],
    [/^(\d+) page(s?)$/, (match) => `${match[1]} ${language === "hi" ? "पेज" : "पाने"}`],
    [/^(\d+) cop(?:y|ies)$/, (match) => `${match[1]} ${translated("Copies")}`],
    [/^(\d+) pages? .+ (\d+) cop(?:y|ies)$/, (match) => `${match[1]} ${translated("Pages")} · ${match[2]} ${translated("Copies")}`],
    [/^Document (\d+) .+ (.+)$/, (match) => `${translated("Document")} ${match[1]} · ${match[2]}`],
    [/^Page (\d+) of (\d+)$/, (match) => `${translated("Pages")} ${match[1]} / ${match[2]}`],
    [/^Page (\d+)$/, (match) => `${translated("Pages")} ${match[1]}`],
    [/^Scan the code, select up to (\d+) files, and send them to this kiosk\.$/, (match) => language === "hi"
      ? `कोड स्कैन करें, अधिकतम ${match[1]} फ़ाइलें चुनें और उन्हें इस कियोस्क पर भेजें।`
      : `कोड स्कॅन करा, जास्तीत जास्त ${match[1]} फाइल निवडा आणि त्या या किऑस्कवर पाठवा.`],
    [/^No services are enabled for (.+)\. Open Admin Services to enable or assign services\.$/, (match) => language === "hi"
      ? `${match[1]} के लिए कोई सेवा सक्षम नहीं है। सेवाएँ सक्षम या असाइन करने के लिए एडमिन सर्विसेज खोलें।`
      : `${match[1]} साठी कोणतीही सेवा सक्षम नाही. सेवा सक्षम किंवा नेमण्यासाठी प्रशासक सेवा उघडा.`],
    [/^Printing completed successfully\. Returning to the home page in (\d+) seconds\.$/, (match) => language === "hi"
      ? `प्रिंटिंग सफलतापूर्वक पूरी हुई। ${match[1]} सेकंड में होम पेज पर लौट रहे हैं।`
      : `मुद्रण यशस्वीरित्या पूर्ण झाले. ${match[1]} सेकंदात मुख्य पानावर परत जात आहे.`],
    [/^(.+) The paid job is saved in admin history and can be retried without charging again\.$/, (match) => `${match[1]} ${translated("The paid job is saved in admin history and can be retried without charging again.")}`],
    [/^Pay (Rs\. .+)$/, (match) => `${translated("Pay")} ${match[1]}`],
    [/^(Rs\. .+) \/ page$/, (match) => language === "hi" ? `${match[1]} / पेज` : `${match[1]} / पान`],
    [/^(Rs\. .+) B\/W per page$/, (match) => `${match[1]} ${translated("B/W per page")}`],
    [/^(Rs\. .+) Color per page$/, (match) => `${match[1]} ${translated("Color per page")}`]
  ];

  patterns.push(
    [/^New Service(?:\s+(\d+))?$/i, (match) => language === "hi"
      ? `नई सेवा${match[1] ? ` ${match[1]}` : ""}`
      : `नवीन सेवा${match[1] ? ` ${match[1]}` : ""}`],
    [/^Existing document$/i, () => language === "hi" ? "मौजूदा दस्तावेज़" : "विद्यमान दस्तऐवज"],
    [/^Customer service\.$/i, () => language === "hi" ? "ग्राहक सेवा।" : "ग्राहक सेवा."]
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

  return String(service?.[`${field}${suffix}`] || "").trim() || customerTranslateText(english);
}

function localizedTemplateText(template, field) {
  const suffix = state.customerLanguage === "hi" ? "Hi" : state.customerLanguage === "mr" ? "Mr" : "";
  const english = String(template?.[field] || "").trim();
  if (!suffix) return english;

  return String(template?.[`${field}${suffix}`] || "").trim() || customerTranslateText(english);
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
    [/^(\d+) kiosk record\(s\)$/, (match) => `${match[1]} ${language === "hi" ? "कियोस्क रिकॉर्ड" : "किऑस्क नोंदी"}`],
    [/^(\d+) job\(s\)$/, (match) => `${match[1]} ${language === "hi" ? "कार्य" : "कामे"}`],
    [/^(\d+) paid job\(s\)$/, (match) => `${match[1]} ${translated("paid job(s)")}`],
    [/^(\d+) services?$/, (match) => `${match[1]} ${translated("Services")}`],
    [/^(\d+) forms?$/, (match) => `${match[1]} ${translated("Forms")}`],
    [/^(\d+) pages?$/, (match) => `${match[1]} ${translated("Pages")}`],
    [/^Forms under (.+)$/, (match) => language === "hi" ? `${match[1]} के अंतर्गत फ़ॉर्म` : `${match[1]} अंतर्गत फॉर्म`],
    [/^Form (\d+): (.+)$/, (match) => `${language === "hi" ? "फ़ॉर्म" : "फॉर्म"} ${match[1]}: ${match[2]}`],
    [/^Delete kiosk (.+)\?$/, (match) => language === "hi" ? `कियोस्क ${match[1]} हटाएँ?` : `किऑस्क ${match[1]} हटवायचा?`],
    [/^Saved (.+)\.$/, (match) => language === "hi" ? `${match[1]} सहेजा गया।` : `${match[1]} जतन झाले.`],
    [/^Deleted (.+)\.$/, (match) => language === "hi" ? `${match[1]} हटाया गया।` : `${match[1]} हटवला.`],
    [/^Created (.+)\. Setup code: (.+)$/, (match) => language === "hi" ? `${match[1]} बनाया गया। सेटअप कोड: ${match[2]}` : `${match[1]} तयार झाला. सेटअप कोड: ${match[2]}`]
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

function readConfiguredKioskId() {
  return normalizeKioskId(runtimeConfig.get("kioskId")) ||
    normalizeKioskId(frontendConfig.kioskId) ||
    (isWebsiteRootEntry ? "LOCAL-KIOSK" : UNASSIGNED_KIOSK_ID);
}

function readRuntimeScopeValue(...keys) {
  for (const key of keys) {
    const value = runtimeConfig.get(key) || frontendConfig[key] || "";
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }

  return "";
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
  state.adminAuthed = false;
  state.adminNavOpen = false;
  state.adminToken = "";
  state.adminAccount = null;
  state.adminLoginError = message;
  clearAdminSession();
  stopAdminPolling();
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

function customerSettingEnabled(key) {
  return CUSTOMER_VISIBLE_SETTING_KEYS.has(key)
    && state.kioskCustomerSettings?.[key] !== false;
}

function enforceCustomerSettings(service = selectedService()) {
  state.kioskCustomerSettings = normalizeKioskCustomerSettings(state.kioskCustomerSettings);

  if (!customerSettingEnabled("color", service) && state.settings.colorMode === "color") {
    state.settings.colorMode = "bw";
  }
  if (!customerSettingEnabled("bw", service) && state.settings.colorMode === "bw") {
    state.settings.colorMode = "color";
  }
  if (!customerSettingEnabled("copies", service)) {
    state.settings.copies = 1;
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
    return {
      id: slug(template?.id || title, `template-${index + 1}`),
      title,
      titleHi: String(template?.titleHi || "").trim(),
      titleMr: String(template?.titleMr || "").trim(),
      description: String(template?.description || "Blank printable template.").trim(),
      descriptionHi: String(template?.descriptionHi || "").trim(),
      descriptionMr: String(template?.descriptionMr || "").trim(),
      pages: Math.max(1, Math.min(20, Number(template?.pages || 1))),
      paperSize: normalizePaperSize(template?.paperSize, "Auto", true),
      orientation: normalizeOrientation(template?.orientation),
      fields: normalizeTemplateFields(template?.fields),
      fieldsHi: normalizeTemplateFields(template?.fieldsHi),
      fieldsMr: normalizeTemplateFields(template?.fieldsMr),
      imageUrl: String(template?.imageUrl || "").trim(),
      documentType: templateDocumentKind(template?.documentType || template?.imageUrl || "")
    };
  }).filter((template) => template.title);
}

function mergeDefaultTemplateData(templates, defaults = []) {
  return templates.map((template) => {
    const fallback = defaults.find((item) => item.id === template.id || item.title === template.title) || {};

    return {
      ...template,
      imageUrl: template.imageUrl || fallback.imageUrl || "",
      titleHi: template.titleHi || fallback.titleHi || "",
      titleMr: template.titleMr || fallback.titleMr || "",
      descriptionHi: template.descriptionHi || fallback.descriptionHi || "",
      descriptionMr: template.descriptionMr || fallback.descriptionMr || "",
      fields: template.fields?.length ? template.fields : (fallback.fields || []),
      fieldsHi: template.fieldsHi?.length ? template.fieldsHi : (fallback.fieldsHi || []),
      fieldsMr: template.fieldsMr?.length ? template.fieldsMr : (fallback.fieldsMr || [])
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
  const projectIds = Array.isArray(service.projectIds) ? service.projectIds : [];
  if (projectIds.length) {
    return service.enabled !== false && Boolean(state.kiosk.projectId && projectIds.includes(state.kiosk.projectId));
  }
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

function customerRateRows(rates, rowClass = "info-row", service = selectedService()) {
  return [
    customerSettingEnabled("bw", service) ? `<div class="${rowClass}"><span>B/W rate</span><strong>${money(rates.bw)} / page</strong></div>` : "",
    customerSettingEnabled("color", service) ? `<div class="${rowClass}"><span>Color rate</span><strong>${money(rates.color)} / page</strong></div>` : ""
  ].filter(Boolean);
}

function customerServiceRateLabels(rates, service) {
  return [
    customerSettingEnabled("bw", service) ? `<span><strong>${money(rates.bw)}</strong> B/W per page</span>` : "",
    customerSettingEnabled("color", service) ? `<span><strong>${money(rates.color)}</strong> Color per page</span>` : ""
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

function setJobFiles(files) {
  const nextFiles = files.slice(0, MAX_FILES_PER_JOB);
  state.files = nextFiles;
  state.file = nextFiles[0] || null;
  state.previewFileIndex = 0;
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

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function demoTemplateUploadsFromPayload(payload = {}) {
  const rawServices = Array.isArray(payload.services) ? payload.services : [];
  if (!rawServices.length) return [];

  const liveServices = normalizeServicesConfig(rawServices);
  return liveServices
    .filter((service) => service.mode === "template")
    .flatMap((service) => (service.templates || [])
      .filter((template) => template.imageUrl)
      .map((template, index) => ({
        ...template,
        id: slug(`${service.id}-${template.id || template.title || index + 1}`, `template-${index + 1}`),
        title: template.title || `${service.title} ${index + 1}`,
        description: template.description || `Uploaded from ${service.title}.`
      })));
}

function demoTemplateServiceFromPayload(payload = {}) {
  const rawServices = Array.isArray(payload.services) ? payload.services : [];
  if (!rawServices.length) return null;

  const liveServices = normalizeServicesConfig(rawServices);
  return liveServices.find((service) => service.mode === "template" && (service.templates || []).some((template) => template.imageUrl)) || null;
}

function demoServicesFromPayload(payload = {}) {
  const nextServices = cloneConfig(demoKioskServices);
  const uploadedTemplates = demoTemplateUploadsFromPayload(payload);

  if (!uploadedTemplates.length) {
    return nextServices;
  }

  const templateService = demoTemplateServiceFromPayload(payload);
  return nextServices.map((service) => {
    if (service.id !== "demo-existing-documents") {
      return service;
    }

    return {
      ...service,
      description: "Print ready-made forms uploaded from admin.",
      descriptionHi: "",
      descriptionMr: "",
      pricing: templateService?.pricing || service.pricing,
      templates: uploadedTemplates
    };
  });
}

async function fetchPublicServicesConfig() {
  const url = new URL(`${BACKEND_URL}/api/public/services`);
  const projectId = readRuntimeScopeValue("projectId", "project");
  const adminId = readRuntimeScopeValue("adminId", "clientId", "ownerId");
  const adminEmail = readRuntimeScopeValue("adminEmail", "email");

  if (KIOSK_ID && KIOSK_ID !== UNASSIGNED_KIOSK_ID) {
    url.searchParams.set("kioskId", KIOSK_ID);
  }

  if (projectId) {
    url.searchParams.set("projectId", projectId);
  }

  if (adminId) {
    url.searchParams.set("adminId", adminId);
  }

  if (adminEmail) {
    url.searchParams.set("adminEmail", adminEmail);
  }

  if (DEMO_KIOSK_MODE) {
    url.searchParams.set("demo", "true");
  }

  return fetchJson(url.toString());
}

function applyDemoKioskConfig({ rerender = false, livePayload = null } = {}) {
  const demoServices = livePayload ? demoServicesFromPayload(livePayload) : cloneConfig(demoKioskServices);
  services = normalizeServicesConfig(demoServices);
  state.pricing = normalizePricing(Object.fromEntries(
    demoServices.map((service) => [service.id, service.pricing])
  ));
  state.kiosk = {
    kioskId: KIOSK_ID,
    name: "Kiosk",
    branch: "Local Branch",
    projectId: "",
    status: "active"
  };
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
  state.step = 3;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();
  startLocalPrintJob();
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
  const pages = Math.max(1, effectivePageCount());
  const copies = Math.max(1, Number(state.settings.copies) || 1);
  const rates = serviceRates();
  const rate = state.settings.colorMode === "color" ? rates.color : rates.bw;
  const total = pages * copies * rate;

  return { pages, copies, rate, rates, total };
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

function paymentReady() {
  return state.printer.online && colorSelectionSupported();
}

function printerReadyForCustomerFlow() {
  return state.printer.online && !state.printer.checking;
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
    const documentType = templateDocumentKind(template.documentType || template.imageUrl);
    return {
      name: `${template.id}.${documentType === "pdf" ? "pdf" : "png"}`,
      type: documentType === "pdf" ? "PDF" : "PNG",
      pages: Math.max(1, Number(template.pages) || 1),
      previewKind: documentType === "pdf" ? "pdf" : "image",
      previewUrl: template.imageUrl,
      source: localizedTitle,
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
      qrSvg: "",
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

      if (invalidFile) {
        state.uploadError = invalidFile.error;
        render();
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
  if (DEMO_KIOSK_MODE && state.mode === "customer") {
    setDemoPrinterReady({ rerender });
    return;
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
    return;
  }

  if (state.printer.manualReadyOverride) {
    state.printer.checking = false;
    if (rerender) render();
    return;
  }

  state.printer = {
    ...state.printer,
    checking: true,
    agent: "Checking",
    statusText: "Checking printer status..."
  };
  if (rerender) render();

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
      titleHi: service.titleHi,
      titleMr: service.titleMr,
      description: service.description,
      descriptionHi: service.descriptionHi,
      descriptionMr: service.descriptionMr,
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
      projectId: String(payload.kiosk.projectId || "").trim(),
      status: String(payload.kiosk.status || "").trim()
    };
    state.kioskCustomerSettings = normalizeKioskCustomerSettings(payload.kiosk.customerSettings);
    enforceCustomerSettings();
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
  if (DEMO_KIOSK_MODE && state.mode === "customer") {
    try {
      const payload = await fetchPublicServicesConfig();
      applyDemoKioskConfig({ rerender, livePayload: payload });
      return true;
    } catch (error) {
      applyDemoKioskConfig({ rerender });
      return false;
    }
  }

  if (DEMO_KIOSK_MODE) {
    applyDemoKioskConfig({ rerender });
    return true;
  }

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
      history,
      transactions,
      kiosks,
      projects,
      system,
      refunds,
      serviceConfig,
      reports
    ] = await Promise.all([
      fetchAdminJson("/api/admin/dashboard"),
      fetchAdminJson("/api/admin/print-history"),
      fetchAdminJson("/api/admin/transactions"),
      fetchAdminJson("/api/admin/kiosks"),
      fetchAdminJson("/api/admin/projects"),
      fetchAdminJson("/api/admin/system-status"),
      fetchAdminJson("/api/admin/refunds"),
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
      refunds: Array.isArray(refunds.refunds) ? refunds.refunds : [],
      reports: Array.isArray(reports.reports) ? reports.reports : [],
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
  const files = jobFiles();

  return {
    jobId: ensureActiveJobId(),
    kioskId: KIOSK_ID,
    service: service?.id || "print",
    fileName: files.length === 1 ? files[0].name : `${files.length} documents`,
    fileType: files.length === 1 ? files[0].type : "MULTIPLE",
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
    state.step = 3;
    state.printProgress = 0;
    state.printError = "";
    state.printStatusMessage = "";
    state.printJob = null;
    render();
    startLocalPrintJob();
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
  }, 3000);
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
  state.step = 3;
  state.printProgress = 0;
  state.printError = "";
  state.printStatusMessage = "";
  state.printJob = null;
  render();
  startLocalPrintJob();
  return payload;
}

async function startRazorpayPayment() {
  if (DEMO_KIOSK_MODE) {
    startDemoPayment();
    return;
  }

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
    state.paymentStatusMessage = "Creating Razorpay order...";
    render();

    const payload = await createRazorpayOrder();
    const checkout = payload.checkout;
    const paymentUrl = buildMobilePaymentUrl(checkout?.paymentUrl || "", payload.payment?.paymentId || "");

    if (!payload.payment?.paymentId || !checkout?.key || !checkout?.orderId) {
      throw new Error("Razorpay order response is missing checkout details.");
    }

    if (state.step !== 3) {
      state.paymentBusy = false;
      return;
    }

    const qrSvg = await fetchPaymentQr(paymentUrl);

    if (state.step !== 3) {
      state.paymentBusy = false;
      return;
    }

    state.paymentOrder = {
      paymentId: payload.payment.paymentId,
      orderId: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
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

async function startLocalPrintJob() {
  const files = jobFiles();

  if (DEMO_KIOSK_MODE) {
    const documentCount = files.length || 1;
    state.printJob = { status: "completed" };
    state.printProgress = 5;
    state.printError = "";
    state.printStatusMessage = `Printed ${documentCount} document${documentCount === 1 ? "" : "s"}.`;
    addJob("Completed");
    state.step = 4;
    render();
    startReceiptRedirect();
    return;
  }

  if (!files.length || files.some((file) => !localAgentCanReadFile(file))) {
    state.printStatusMessage =
      "One or more documents could not be prepared for printing. Please retry the upload.";
    state.printJob = null;
    state.printError = state.printStatusMessage;
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
    state.printStatusMessage = `Printing ${files.length} document${files.length === 1 ? "" : "s"}...`;
    syncBackendPrintStatus("Printing");
    render();

    let lastPrinterName = state.printer.name;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      state.printStatusMessage = `Printing document ${index + 1} of ${files.length}...`;
      render();

      const printBody = {
        jobId: files.length === 1 ? currentJobId() : `${currentJobId()}-${index + 1}`,
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
        templateFields: Array.isArray(file.templateFields) ? file.templateFields : []
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
        throw new Error(payload.error || payload.job?.errorMessage || "Local print agent could not print the document.");
      }

      lastPrinterName = payload.printer?.name || lastPrinterName;
    }

    state.printProgress = 5;
    state.printStatusMessage = `Sent to ${lastPrinterName || "printer"}.`;
    addJob("Completed");
    state.step = 4;
    render();
    startReceiptRedirect();
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

  if (state.step === 2) {
    ensureActiveJobId();
  }

  const previousStep = state.step;
  state.step = Math.min(customerSteps.length - 1, state.step + 1);

  if (state.step === 3 && previousStep !== 3 && !state.printer.manualReadyOverride) {
    state.printer = {
      ...state.printer,
      checking: true,
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

  if (state.step === 3 && previousStep !== 3) {
    stopPaymentPolling();
    state.paymentStatus = "Pending";
    state.paymentStatusMessage = "";
    state.paymentError = "";
    state.paymentOrder = null;
    state.paymentBusy = false;
    refreshPrinterStatus();
    setTimeout(() => {
      if (state.step === 3 && !state.paymentBusy && !state.paymentOrder?.qrSvg) {
        startRazorpayPayment();
      }
    }, 0);
  }
}

function openAdmin(page = "dashboard") {
  stopReceiptRedirect();
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
    refreshKioskConfig({ rerender: DEMO_KIOSK_MODE, force: true });
    render();
    return;
  }

  state.mode = "customer";
  refreshKioskConfig({ rerender: DEMO_KIOSK_MODE, force: true });
  render();
}

function render() {
  if (isMobilePaymentEntry) {
    const app = qs("#app");
    if (app) {
      app.innerHTML = renderMobilePaymentShell();
      bindEvents();
    }
    return;
  }

  if (state.mode === "admin" && !state.adminAuthed) {
    syncAdminLoginDraftFromDom();
  }

  const app = qs("#app");
  app.innerHTML = state.mode === "customer" ? renderCustomerShell() : renderAdminShell();
  applyCustomerTranslations(app);
  applyAdminTranslations(app);
  bindEvents();
}

function renderMobilePaymentShell() {
  const payment = state.mobilePayment;
  const amountValue = payment.checkout?.amount ? Number(payment.checkout.amount) / 100 : Number(payment.payment?.amount || 0);
  const amountText = amountValue > 0 ? money(amountValue) : "";

  return `
    <main class="mobile-payment-page">
      <section class="mobile-payment-card">
        <img src="${CUSTOMER_DEMO_LOGO_SRC}" alt="${CUSTOMER_DEMO_LOGO_ALT}" draggable="false" data-no-visual-search />
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
  const kioskLabel = [state.kiosk.kioskId || KIOSK_ID, state.kiosk.name, state.kiosk.branch]
    .filter(Boolean)
    .join(" | ");

  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><img src="${CUSTOMER_DEMO_LOGO_SRC}" alt="${CUSTOMER_DEMO_LOGO_ALT}" draggable="false" data-no-visual-search /></div>
        <div>
          <div class="brand-title">Print Kiosk</div>
          <div class="brand-subtitle">${escapeHtml(kioskLabel || KIOSK_ID)} | Government and education ready</div>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="customer-language-control">
          ${uiIcon("language", 19)}
          <span>Language</span>
          <select data-customer-language aria-label="Language">
            <option value="en" ${state.customerLanguage === "en" ? "selected" : ""}>English</option>
            <option value="hi" ${state.customerLanguage === "hi" ? "selected" : ""}>Hindi</option>
            <option value="mr" ${state.customerLanguage === "mr" ? "selected" : ""}>Marathi</option>
          </select>
        </label>
        <button class="ghost-button" data-action="reset-session">New Session</button>
        ${renderCustomerClockTile()}
      </div>
    </header>
  `;
}

function renderAdminTopbar() {
  const adminLabel = state.adminAccount?.name || state.adminAccount?.email || "Client";
  const alertCount = liveJobs().filter((job) => /failed/i.test(job.printStatus || job.print || "")).length
    + state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || "")).length
    + (state.printer.online ? 0 : 1);

  return `
    <header class="topbar admin-topbar">
      <div class="brand">
        <div class="brand-mark"><img src="./assets/printhub-mark.png" alt="Print Kiosk" draggable="false" data-no-visual-search /></div>
        <div>
          <div class="brand-title">Print Kiosk Admin Console</div>
          <div class="brand-subtitle">${escapeHtml(adminLabel)} | assigned project management</div>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="admin-language-control">
          ${uiIcon("language", 19)}
          <span>Language</span>
          <select data-admin-language aria-label="Language">
            <option value="en" ${state.adminLanguage === "en" ? "selected" : ""}>English</option>
            <option value="hi" ${state.adminLanguage === "hi" ? "selected" : ""}>Hindi</option>
            <option value="mr" ${state.adminLanguage === "mr" ? "selected" : ""}>Marathi</option>
          </select>
        </label>
        ${state.adminAuthed ? `
          <button class="notification-button" data-admin-page="alerts" aria-label="Open alerts">
            ${uiIcon("bell", 22)}
            ${alertCount ? `<span>${Math.min(alertCount, 99)}</span>` : ""}
          </button>
          <button class="mobile-nav-toggle" data-action="admin-toggle-nav" aria-controls="kiosk-admin-navigation" aria-expanded="${state.adminNavOpen}" aria-label="${state.adminNavOpen ? "Close navigation" : "Open navigation"}">
            ${uiIcon(state.adminNavOpen ? "close" : "menu", 22)}
          </button>
          <button class="topbar-logout" data-action="admin-logout" aria-label="Logout">${uiIcon("logout", 19)}<span>Logout</span></button>
        ` : ""}
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
  if (state.step === 3) return state.printError ? renderPrintFailureStep() : renderPaymentStep();
  return renderThankYouStep();
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

  const availableServices = customerServices();
  const hasSingleService = availableServices.length === 1;
  const printerReady = printerReadyForCustomerFlow();
  const printerChecking = state.printer.checking;
  let serviceCountClass = "is-catalog";

  if (availableServices.length === 0) serviceCountClass = "is-empty";
  if (availableServices.length === 1) serviceCountClass = "is-single";
  if (availableServices.length === 2) serviceCountClass = "is-pair";

  return `
    <div class="stage service-stage ${serviceCountClass}">
      <div class="stage-header">
        <h1>${hasSingleService ? "Services" : "Choose service"}</h1>
        <p class="stage-intro">${hasSingleService ? "This service is available on this kiosk." : "Select what you need to print."}</p>
      </div>
      ${state.configStatus ? `<div class="save-note">${escapeHtml(state.configStatus)}</div>` : ""}
      <div class="service-grid">
        ${availableServices.length ? availableServices.map((service) => {
          const rates = serviceRates(service.id);

          return `
            <button class="service-card ${state.selectedService === service.id ? "selected" : ""}" data-service="${service.id}" ${printerReady ? "" : "disabled"}>
              ${serviceMediaMarkup(service)}
              <div>
                <h2>${escapeHtml(localizedServiceText(service, "title"))}</h2>
                <p>${escapeHtml(localizedServiceText(service, "description"))}</p>
              </div>
              <div class="service-rates">
                ${customerServiceRateLabels(rates, service)}
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
    <div class="stage template-selection-stage">
      <div class="stage-header">
        <h1>Choose form template</h1>
        <p class="stage-intro">${escapeHtml(localizedServiceText(service, "title"))} selected. Pick a form template to preview and print.</p>
      </div>
      <div class="template-grid">
        ${templates.map((template) => {
          const templateTitle = localizedTemplateText(template, "title");
          const templateDescription = localizedTemplateText(template, "description");

          return `
            <button class="template-card" data-template="${escapeHtml(template.id)}">
              ${template.imageUrl && templateDocumentKind(template.documentType || template.imageUrl) !== "pdf"
                ? `<span class="template-badge template-image"><img alt="" src="${escapeHtml(template.imageUrl)}" draggable="false" data-no-visual-search /></span>`
                : `<span class="template-badge">${escapeHtml(templateDocumentKind(template.documentType || template.imageUrl) === "pdf" ? "PDF" : service.icon)}</span>`}
              <div>
                <h2>${escapeHtml(templateTitle)}</h2>
                <p>${escapeHtml(templateDescription)}</p>
              </div>
              <div class="template-meta">
                <span>${template.pages} page${template.pages === 1 ? "" : "s"} · ${escapeHtml(normalizePaperSize(template.paperSize, "Auto", true))} · ${escapeHtml(normalizeOrientation(template.orientation))}</span>
                <strong>Print Template</strong>
              </div>
            </button>
          `;
        }).join("")}
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back to Services</button>
      </div>
    </div>
  `;
}

function renderUploadStep() {
  const session = state.uploadSession;
  return `
    <div class="stage upload-stage qr-only-upload-stage">
      <div class="stage-header">
        <h1>Upload from phone</h1>
        <p class="stage-intro">Scan the QR code to send your documents.</p>
      </div>
      <div class="qr-only-upload-panel">
        <div class="qr-upload-card qr-only-upload-card">
          ${renderQrUploadBox(session)}
          ${state.uploadError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.uploadError)}</div>` : ""}
          ${session?.error ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(session.error)}</div>` : ""}
        </div>
      </div>
      <div class="flow-actions">
        <button class="ghost-button" data-action="prev-step">Back to Services</button>
      </div>
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
      ${session.qrSvg || `<img alt="Upload QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=${encodeURIComponent(session.uploadUrl)}" draggable="false" data-no-visual-search />`}
    </div>
    <p class="helper-text">Scan the code, select up to ${MAX_FILES_PER_JOB} files, and send them to this kiosk.</p>
  `;
}

function renderPreviewStep() {
  const files = jobFiles();
  const file = activePreviewFile();
  const details = priceDetails();
  const previewClass = file?.previewUrl && ["pdf", "image"].includes(file.previewKind)
    ? "preview-live"
    : "preview-document-mode";
  const paperClass = `paper-${normalizePaperSize(state.settings.paperSize, "A4").toLowerCase()} orientation-${normalizeOrientation(state.settings.orientation)} color-${state.settings.colorMode === "color" ? "color" : "bw"}`;
  return `
    <div class="stage preview-stage">
      <div class="stage-header">
        <h1>Preview and confirm</h1>
        <p class="stage-intro">Review the document and confirm the print details.</p>
      </div>
      <div class="preview-grid">
        <div class="preview-workspace">
          <div class="document-preview ${previewClass} ${paperClass}" style="--preview-zoom: ${state.previewZoom};">
            <div class="preview-zoom-layer">${renderPreviewContent()}</div>
          </div>
        </div>
        ${renderPreviewControlPanel(details, files)}
      </div>
    </div>
  `;
}

function renderPreviewControlPanel(details, files) {
  const colorChoices = [
    customerSettingEnabled("bw") ? { value: "bw", label: "B/W" } : null,
    customerSettingEnabled("color") ? { value: "color", label: "Color" } : null
  ].filter(Boolean);

  return `
    <aside class="module-card preview-control-panel">
      <h2>Print settings</h2>
      <div class="preview-essential-settings">
        ${files.length > 1 ? `
          <label class="preview-essential-setting preview-document-select">
            <span>Document</span>
            <select data-preview-file-select>
              ${files.map((item, index) => `<option value="${index}" ${index === state.previewFileIndex ? "selected" : ""}>Document ${index + 1} · ${escapeHtml(item.type)}</option>`).join("")}
            </select>
          </label>
        ` : ""}
        ${colorChoices.length ? `
          <div class="preview-essential-setting">
            <span>Page Color</span>
            <div class="segmented preview-color-control">
              ${colorChoices.map((choice) => `
                <button class="${state.settings.colorMode === choice.value ? "active" : ""}" data-setting="colorMode" data-value="${choice.value}">${choice.label}</button>
              `).join("")}
            </div>
          </div>
        ` : ""}
        ${customerSettingEnabled("copies") ? `
          <div class="preview-essential-setting">
            <span>Page Copies</span>
            <div class="copies-stepper" role="group" aria-label="Page copies">
              <button data-action="decrease-copies" aria-label="Decrease copies" ${state.settings.copies <= 1 ? "disabled" : ""}>&minus;</button>
              <output aria-live="polite">${details.copies}</output>
              <button data-action="increase-copies" aria-label="Increase copies" ${state.settings.copies >= 99 ? "disabled" : ""}>+</button>
            </div>
          </div>
        ` : ""}
        ${customerSettingEnabled("pageRange") ? `
          <label class="preview-essential-setting">
            <span>Page Range</span>
            <input value="${escapeHtml(state.settings.range)}" data-input="range" placeholder="all or 1-3,5" />
          </label>
        ` : ""}
      </div>
      <div class="preview-order-summary">
        <div><span>Total Pages</span><strong>${details.pages * details.copies}</strong></div>
        <div><span>Total</span><strong>${money(details.total)}</strong></div>
      </div>
      <div class="preview-control-actions">
        <button class="primary-button" data-action="next-step">Continue to Payment</button>
        <button class="secondary-button" data-action="delete-file">Replace Document</button>
        <button class="ghost-button" data-action="prev-step">Back</button>
      </div>
    </aside>
  `;
}

function renderPreviewContent() {
  const file = activePreviewFile();
  const pages = Math.max(1, Number(file?.pages) || 1);

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
    return `<div class="uploaded-image-paper"><img class="preview-media" src="${escapeHtml(file.previewUrl)}" alt="Uploaded document preview" draggable="false" data-no-visual-search /></div>`;
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
      file.source ? `${escapeHtml(file.source)} upload` : "Preview placeholder",
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
  const pages = Math.max(Number(file.pages) || 1, 1);
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
  const pages = Math.max(Number(file.pages) || 1, 1);
  return `
    <div class="form-preview-pages">
      ${Array.from({ length: Math.min(pages, 6) }, (_, index) => `
        <article class="form-preview-page">
          <div class="form-preview-page-header">
            <strong>Document preview</strong>
            <span>Page ${index + 1} of ${pages}</span>
          </div>
          <div class="document-preview-lines">
            <h3>Uploaded document</h3>
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
  const file = activePreviewFile();
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

function renderPaymentStep() {
  const details = priceDetails();
  ensureActiveJobId();
  const paymentComplete = state.paymentStatus === "Success";
  const qrReady = Boolean(state.paymentOrder?.qrSvg);
  const isPrinting = paymentComplete && state.step === 3 && (state.printProgress > 0 || Boolean(state.printStatusMessage));
  const printComplete = state.step === 4 || state.lastCompletedJob?.print === "Completed";
  const trackingMessage = state.printError
    || state.printStatusMessage
    || state.paymentStatusMessage
    || (qrReady ? "Waiting for payment from the customer phone." : "Preparing the secure payment QR.");
  const paymentHeading = DEMO_KIOSK_MODE
    ? (paymentComplete ? "Tracking" : "Scan to pay")
    : (paymentComplete ? "Tracking" : "Scan to pay");
  const paymentIntro = DEMO_KIOSK_MODE
    ? "Scan the QR code with any UPI app. Confirm when payment is done."
    : "The kiosk shows only the QR. Complete payment on the phone; live tracking stays on this screen.";
  const paymentQrHelp = DEMO_KIOSK_MODE
    ? "Scan with the phone camera or any UPI app."
    : "Scan with the phone camera or any UPI app to open Razorpay.";
  const paidLabel = DEMO_KIOSK_MODE ? "Payment received" : "Paid on phone";
  const paidHelp = DEMO_KIOSK_MODE
    ? "Payment is verified. Watch print tracking on the kiosk."
    : "Payment is verified. Watch print tracking on the kiosk.";
  const waitingPaymentLabel = DEMO_KIOSK_MODE ? "Waiting for payment" : "Waiting for phone payment";
  const paymentDetailParts = [
    `${details.pages} page${details.pages === 1 ? "" : "s"}`,
    customerSettingEnabled("copies") ? `${details.copies} cop${details.copies === 1 ? "y" : "ies"}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <div class="stage payment-stage">
      <div class="stage-header">
        <h1>${paymentHeading}</h1>
        <p class="stage-intro">${paymentIntro}</p>
      </div>
      <div class="payment-kiosk-panel">
        <div class="payment-qr-card module-card">
        <div class="payment-summary">
          <span>Total payable</span>
          <strong>${money(details.total)}</strong>
          <small class="payment-total-detail">${escapeHtml(paymentDetailParts)}</small>
          <small>${details.pages} page${details.pages === 1 ? "" : "s"} · ${details.copies} cop${details.copies === 1 ? "y" : "ies"}</small>
        </div>
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
            <p class="helper-text">${escapeHtml(state.paymentStatusMessage || "Creating payment QR...")}</p>
          </div>
        `}
        ${state.paymentError ? `<div class="empty-note" style="margin-top: 14px;">${escapeHtml(state.paymentError)}</div>` : ""}
        </div>
        <div class="payment-tracking-card module-card" aria-live="polite">
          <h2>Live tracking</h2>
          <div class="timeline">
            ${renderTimelineRow(1, qrReady || paymentComplete ? "QR ready on kiosk" : "Creating payment QR", qrReady || paymentComplete, !qrReady && !paymentComplete)}
            ${renderTimelineRow(2, paymentComplete ? "Payment received" : waitingPaymentLabel, paymentComplete, qrReady && !paymentComplete)}
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
  return `
    <div class="stage print-failure-stage">
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
    <div class="stage receipt-stage">
      <div class="stage-header">
        <h1>Receipt</h1>
        <p class="stage-intro">Printing completed successfully. Returning to the home page in ${state.receiptSecondsLeft} seconds.</p>
      </div>
      <div class="receipt-card">
        <h2>Payment receipt</h2>
        <div class="receipt-row"><span>Job ID</span><strong>${escapeHtml(receiptJob.id)}</strong></div>
        <div class="receipt-row"><span>Documents</span><strong>${jobFiles().length}</strong></div>
        <div class="receipt-row"><span>Pages</span><strong>${receiptJob.pages}</strong></div>
        ${customerSettingEnabled("copies") ? `<div class="receipt-row"><span>Copies</span><strong>${receiptJob.copies}</strong></div>` : ""}
        <div class="receipt-row"><span>Amount</span><strong>${money(receiptJob.amount)}</strong></div>
        <div class="receipt-row"><span>Status</span><strong>${escapeHtml(receiptJob.print)}</strong></div>
        <div class="flow-actions">
          <button class="primary-button" data-action="finish-session">Return Home</button>
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
          <strong>Navigation</strong>
          <button data-action="admin-close-nav" aria-label="Close navigation">${uiIcon("close", 22)}</button>
        </div>
        ${adminNavGroups().map((group) => `
          <div class="admin-nav-group">
            <div class="admin-nav-label">${group.label}</div>
            ${group.pages.map((page) => `
              <button class="${state.adminPage === page.id || (state.adminPage === "service-editor" && page.id === "services") ? "active" : ""}" data-admin-page="${page.id}">
                <span class="admin-nav-icon">${uiIcon(page.icon, 20)}</span>
                <span>${page.label}</span>
              </button>
            `).join("")}
          </div>
        `).join("")}
        <div class="admin-nav-help">
          <span class="admin-nav-help-icon">${uiIcon("support", 22)}</span>
          <div><strong>Need Help?</strong><p>Check kiosk devices and connection status.</p></div>
          <button data-admin-page="system">Open System Status</button>
        </div>
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
        <h1>Print Kiosk Admin Login</h1>
        <p class="helper-text">Use your admin credentials. The system opens the right dashboard automatically.</p>
        ${state.adminLoginError ? `<div class="empty-note">${escapeHtml(state.adminLoginError)}</div>` : ""}
        <label>Email or mobile
          <input name="username" value="${escapeHtml(state.adminLoginDraft.email)}" autocomplete="username" data-admin-login-field="email" />
        </label>
        <label>Password
          <input type="password" name="password" value="${escapeHtml(state.adminLoginDraft.password)}" autocomplete="current-password" data-admin-login-field="password" />
        </label>
        <button class="primary-button" data-action="admin-login">Sign in</button>
      </div>
    </div>
  `;
}

function adminNavGroups() {
  return [
    {
      label: "Operate",
      pages: [
        { id: "dashboard", label: "Dashboard", icon: "dashboard" },
        { id: "projects", label: "Projects", icon: "hierarchy" },
        { id: "kiosks", label: "Kiosks", icon: "kiosks" },
        { id: "services", label: "Services", icon: "services" },
        { id: "pricing", label: "Pricing", icon: "pricing" },
        { id: "revenue", label: "Revenue", icon: "payments" }
      ]
    },
    {
      label: "Support",
      pages: [
        { id: "system", label: "System Status", icon: "system" }
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
  if (page === "history") return renderHistory();
  if (page === "system") return renderSystemStatus();
  if (page === "projects") return renderProjects();
  if (page === "reports") return renderReports();
  if (page === "services") return renderServicesAdmin();
  if (page === "service-editor") return renderServiceEditorPage();
  if (page === "pricing") return renderPricing();
  if (page === "revenue") return renderRevenue();
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

function adminNotice() {
  if (state.adminData.error) {
    return `<div class="empty-note" style="margin-bottom: 16px;">${escapeHtml(state.adminData.error)} Showing only local session data until backend reconnects.</div>`;
  }

  if (state.adminData.lastUpdated) {
    return `
      <div class="admin-live-status">
        <span class="live-indicator"></span>
        <strong>Live backend data.</strong>
        <span>Last updated: ${escapeHtml(formatDateTime(state.adminData.lastUpdated))}</span>
        <button data-action="refresh-admin" aria-label="Refresh admin data">${uiIcon("refresh", 18)}</button>
      </div>
    `;
  }

  return `<div class="admin-live-status loading"><span class="live-indicator"></span><strong>Loading live backend data...</strong></div>`;
}

function liveJobs() {
  return state.adminData.jobs.length ? state.adminData.jobs : [];
}

function jobRow(job) {
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
    print: job.printStatus || job.print || "Draft"
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

function renderRevenueLineChart(series) {
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
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const fillPath = `${path} L ${points.at(-1)?.x.toFixed(1) || padding.left} ${padding.top + chartHeight} L ${points[0]?.x.toFixed(1) || padding.left} ${padding.top + chartHeight} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + chartHeight - (ratio * chartHeight);
    return `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const axisLine = `<line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>`;

  return `
    <div class="revenue-chart-wrap">
      <svg class="revenue-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue line graph">
        <defs>
          <linearGradient id="revenueAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#176ee8" stop-opacity="0.22"></stop>
            <stop offset="100%" stop-color="#176ee8" stop-opacity="0"></stop>
          </linearGradient>
          <filter id="revenueLineShadow" x="-10%" y="-20%" width="120%" height="150%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#176ee8" flood-opacity="0.18"></feDropShadow>
          </filter>
        </defs>
        <g class="revenue-grid">${gridLines}${axisLine}</g>
        <path class="revenue-area" d="${fillPath}"></path>
        <path class="revenue-line" d="${path}"></path>
        ${points.map((point) => `
          <g class="revenue-point">
            <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"></circle>
            <circle class="revenue-point-inner" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2"></circle>
            <title>${escapeHtml(point.label)}: ${escapeHtml(money(point.amount))}</title>
          </g>
        `).join("")}
        ${points.map((point, index) => `
          <text class="revenue-x-label" x="${point.x.toFixed(1)}" y="${height - 17}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(point.label)}</text>
        `).join("")}
        <text class="revenue-y-label" x="${padding.left}" y="16">${escapeHtml(money(maxAmount))}</text>
        <text class="revenue-y-label" x="${padding.left}" y="${height - padding.bottom + 16}">Rs. 0</text>
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
      <div class="revenue-summary">
        <span><strong>${escapeHtml(String(jobs))}</strong> paid job(s)</span>
        <span><strong>${escapeHtml(money(average))}</strong> daily avg</span>
        <span><strong>${escapeHtml(bestDay.label)}</strong> peak</span>
      </div>
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
      paymentId: payment.paymentId || payment.razorpayPaymentId || "",
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

function filteredAdminTransactions() {
  const filters = state.transactionFilters;
  const search = filters.search.trim().toLowerCase();

  return adminTransactionRecords()
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
        <option value="refund" ${filters.status === "refund" ? "selected" : ""}>Refund</option>
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
    record.paymentId || "-",
    record.jobId || "-",
    record.kiosk,
    record.service,
    money(record.amount),
    record.method,
    record.status,
    record.print || "-"
  ]);

  return `
    <div class="module-card transaction-log-card">
      <div class="module-card-title">
        <span>${uiIcon("payments", 20)}</span>
        <h2>Transaction Logs</h2>
        <strong>${escapeHtml(String(records.length))} record${records.length === 1 ? "" : "s"}</strong>
      </div>
      ${renderTransactionFilters()}
      ${renderPaginatedTable("revenueTransactions", ["Date", "Payment ID", "Job ID", "Kiosk", "Service", "Amount", "Method", "Status", "Print"], rows, "No matching transaction records.")}
    </div>
  `;
}

function dashboardMetrics() {
  const dashboard = state.adminData.dashboard || {};
  const revenue = state.adminData.revenue || {};
  const jobs = liveJobs().map(jobRow);
  const failed = dashboard.failedJobs ?? jobs.filter((job) => job.print.includes("Failed")).length;
  const pages = jobs.reduce((sum, job) => sum + (job.pages * job.copies), 0);
  const pendingRefunds = state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || "")).length;
  const queueLength = jobs.filter((job) => /queue|printing|pending/i.test(job.print)).length;

  return [
    ["Today Revenue", money(revenue.gross ?? dashboard.revenueToday ?? 0), "Live backend total", "pricing", "green"],
    ["Today Jobs", String(dashboard.jobsToday ?? jobs.length), `${state.adminData.kiosks.length || 1} kiosk record(s)`, "services", "blue"],
    ["Failed Jobs", String(failed), "Managed access", "alert", failed ? "red" : "green"],
    ["Pages Printed", String(pages), "Completed and queued jobs", "printer", "cyan"],
    ["Pending Refunds", String(pendingRefunds), pendingRefunds ? "Pending super admin review" : "No pending records", "refunds", pendingRefunds ? "red" : "green"],
    ["Queue Length", String(queueLength), "Live job records", "history", queueLength ? "amber" : "blue"]
  ];
}

function renderDashboard() {
  const failedJobs = liveJobs().map(jobRow).filter((job) => job.print.includes("Failed"));
  const queuedJobs = liveJobs().map(jobRow).filter((job) => /queue|printing|pending/i.test(job.print));
  const alerts = [
    ...failedJobs.map((job) => `${job.id} needs print recovery`),
    ...state.adminData.refunds.filter((refund) => /pending/i.test(refund.status || "")).map((refund) => `${refund.refundId} refund pending`)
  ];

  return `
    ${renderAdminHeader("Dashboard", "Manage your assigned projects, kiosks, services, and pricing.")}
    ${adminNotice()}
    <div class="metrics-grid dashboard-metrics">
      ${dashboardMetrics().map(([label, value, detail, icon, tone]) => `
        <div class="metric-card has-icon tone-${tone}">
          <span class="metric-icon">${uiIcon(icon, 25)}</span>
          <div class="metric-copy">
            <span>${label}</span>
            <strong>${value}</strong>
            <small>${detail}</small>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="module-grid dashboard-modules">
      ${renderRevenuePanel(true)}
      <div class="module-card dashboard-panel">
        <div class="module-card-title"><span>${uiIcon("system", 20)}</span><h2>Failure Safe Queue</h2></div>
        <div class="health-list">
          ${renderHealthRow("Payment success print failed", `${failedJobs.length} job(s)`, failedJobs.length ? "warn" : "good")}
          ${renderHealthRow("Active print queue", `${queuedJobs.length} job(s)`, queuedJobs.length ? "warn" : "good")}
        </div>
        <button class="panel-link" data-admin-page="history">View full queue details ${uiIcon("history", 17)}</button>
      </div>
      <div class="module-card dashboard-panel">
        <div class="module-card-title"><span>${uiIcon("bell", 20)}</span><h2>Latest Alerts</h2><button data-admin-page="alerts">View all alerts</button></div>
        <div class="info-list dashboard-alert-list">
          ${(alerts.length ? alerts : ["No live alerts"]).map((alert, index) => `<div class="info-row ${alerts.length ? "is-alert" : "is-clear"}"><span class="alert-row-icon">${uiIcon(alerts.length ? (index ? "activity" : "alert") : "system", 19)}</span><span>${escapeHtml(alert)}</span><strong>${alerts.length ? "Open" : "OK"}</strong></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderRevenue() {
  const series = revenueSeries(14);
  const total = series.reduce((sum, item) => sum + item.amount, 0);
  const jobs = series.reduce((sum, item) => sum + item.jobs, 0);
  const average = series.length ? Math.round(total / series.length) : 0;

  return `
    ${renderAdminHeader("Revenue", "Revenue graph for your assigned kiosks and projects.")}
    ${adminNotice()}
    <div class="metrics-grid dashboard-metrics revenue-metrics">
      <div class="metric-card has-icon tone-green">
        <span class="metric-icon">${uiIcon("pricing", 25)}</span>
        <div class="metric-copy"><span>Period Revenue</span><strong>${escapeHtml(money(total))}</strong><small>Last 14 days</small></div>
      </div>
      <div class="metric-card has-icon tone-blue">
        <span class="metric-icon">${uiIcon("history", 25)}</span>
        <div class="metric-copy"><span>Paid Jobs</span><strong>${escapeHtml(String(jobs))}</strong><small>Included in graph</small></div>
      </div>
      <div class="metric-card has-icon tone-cyan">
        <span class="metric-icon">${uiIcon("activity", 25)}</span>
        <div class="metric-copy"><span>Daily Average</span><strong>${escapeHtml(money(average))}</strong><small>Across this period</small></div>
      </div>
    </div>
    <div class="revenue-page-grid">
      ${renderRevenuePanel(false)}
    </div>
    ${renderTransactionLog()}
  `;
}

function renderHistory() {
  const search = state.filters.table.trim().toLowerCase();
  const status = state.filters.status;
  const rows = liveJobs().map(jobRow)
    .filter((job) => !search || JSON.stringify(job).toLowerCase().includes(search))
    .filter((job) => status === "all" || (status === "success" && /success|completed/i.test(`${job.payment} ${job.print}`)) || (status === "failed" && /failed/i.test(job.print)) || (status === "refund" && /refund/i.test(`${job.payment} ${job.print}`)))
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
    <div class="module-grid">
      ${page.items.length ? page.items.map((kiosk) => `
        <div class="module-card">
          <h2>${escapeHtml(kiosk.kioskId || "Kiosk")}</h2>
          <div class="health-list">
            ${renderHealthRow("Project", kiosk.projectId || "Unassigned", kiosk.projectId ? "good" : "warn")}
            ${renderHealthRow("Status", kiosk.status || "Unknown", kiosk.status === "online" ? "good" : "warn")}
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

  return `
    <div class="template-editor-section">
      <div class="template-editor-header">
        <div>
          <h3>Template documents under ${escapeHtml(service.title)}</h3>
          <p class="helper-text">Upload an image or PDF. The kiosk will show it directly to the customer.</p>
        </div>
        <button class="secondary-button" data-template-add="${escapeHtml(service.id)}">Add Document</button>
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
              <button class="danger-button" data-template-delete="${escapeHtml(service.id)}" data-template-index="${index}" ${templates.length <= 1 ? "disabled" : ""}>Remove Document</button>
            </div>
            <label class="template-upload-row">
              <span>Upload image or PDF</span>
              <input type="file" accept="image/*,application/pdf,.pdf" data-template-image="${escapeHtml(service.id)}" data-template-index="${index}" />
            </label>
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

function renderServicesAdmin() {
  const sortedServices = [...services].sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id)));
  const selectedServiceId = sortedServices.some((service) => service.id === state.adminSelectedServiceId)
    ? state.adminSelectedServiceId
    : sortedServices[0]?.id || "";
  const service = sortedServices.find((item) => item.id === selectedServiceId);
  if (service && state.adminSelectedServiceId !== service.id) {
    state.adminSelectedServiceId = service.id;
  }
  const rates = service ? serviceRates(service.id) : { bw: 0, color: 0 };

  return `
    ${renderAdminHeader("Service Management", "Select one service to view its forms. Create services and add forms from the service editor.", `<button class="primary-button" data-action="add-service">Create Service</button><button class="secondary-button" data-action="save-services">Save Changes</button>`)}
    ${state.servicesDirty ? `<div class="save-note">Unsaved service changes. Use Save Services to publish them to the kiosk backend.</div>` : ""}
    ${state.pricingSaveStatus ? `<div class="save-note">${escapeHtml(state.pricingSaveStatus)}</div>` : ""}
    ${adminNotice()}
    <div class="service-focus-layout">
      <aside class="module-card service-focus-picker">
        <label>Service
          <select data-admin-service-select>
            ${sortedServices.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedServiceId ? "selected" : ""}>${escapeHtml(item.title || item.id)}</option>`).join("")}
          </select>
        </label>
        <div class="service-focus-list">
          ${sortedServices.map((item) => `
            <button class="${item.id === selectedServiceId ? "active" : ""}" data-admin-service-select="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.title || item.id)}</strong>
              <span>${escapeHtml(serviceModeLabel(item))} | ${(item.templates || []).length} form${(item.templates || []).length === 1 ? "" : "s"}</span>
            </button>
          `).join("") || `<div class="empty-note">No services yet. Create your first service.</div>`}
        </div>
      </aside>
      ${service ? `
        <section class="module-card simple-service-card service-focus-detail">
          <div class="simple-service-head">
            <div class="simple-service-title">
              ${serviceMediaMarkup(service, "simple-service-icon")}
              <div>
                <h2>${escapeHtml(service.title)}</h2>
                <p class="helper-text">${escapeHtml(service.description || serviceModeLabel(service))}</p>
              </div>
            </div>
            <div class="simple-service-actions">
              <span class="badge ${service.enabled ? "good" : "bad"}">${service.enabled ? "Enabled" : "Off"}</span>
              <button class="secondary-button" data-service-edit="${escapeHtml(service.id)}">Edit Service / Forms</button>
              <button class="danger-button" data-service-delete="${escapeHtml(service.id)}">Delete</button>
            </div>
          </div>
          <div class="simple-service-meta">
            <span>B/W <strong>${money(rates.bw)}</strong></span>
            <span>Color <strong>${money(rates.color)}</strong></span>
            <span>Projects <strong>${service.projectIds?.length ? escapeHtml(service.projectIds.map(adminProjectName).join(", ")) : "None"}</strong></span>
            <span>Forms <strong>${(service.templates || []).length}</strong></span>
          </div>
          ${renderSimpleServiceForms(service)}
        </section>
      ` : `<div class="empty-note">No service selected.</div>`}
    </div>
  `;
}

function renderServiceDraftTemplateEditor(service) {
  const templates = service.templates || [];

  return `
    <div class="template-editor-section compact-template-section">
      <div class="template-editor-header">
        <div>
          <h3>Forms under ${escapeHtml(service.title || "this service")}</h3>
          <p class="helper-text">Each form can be an image or PDF shown directly on the kiosk.</p>
        </div>
        <button class="secondary-button" data-draft-template-add>Add Document</button>
      </div>
      <div class="template-editor-list compact-template-list">
        ${templates.length ? templates.map((template, index) => `
          <div class="template-editor-card compact-template-card">
            <div class="template-editor-top compact-template-top">
              <span class="template-row-index">${index + 1}</span>
              ${renderTemplateImagePreview(template, service)}
              <div class="template-row-copy">
                <h4>${escapeHtml(template.title || `Template ${index + 1}`)}</h4>
                <p class="helper-text">${escapeHtml(templateDocumentKind(template.documentType || template.imageUrl).toUpperCase())} | ${Number(template.pages || 1)} page${Number(template.pages || 1) === 1 ? "" : "s"} | ${escapeHtml(template.imageUrl ? "Ready for kiosk" : "Upload needed")}</p>
              </div>
              <button class="danger-button small-button" data-draft-template-delete="${index}">Remove</button>
            </div>
            <div class="settings-grid compact-template-fields">
              <label class="setting-field">Form Name
                <input value="${escapeHtml(template.title || "")}" data-template-draft-field="title" data-template-draft-index="${index}" />
              </label>
              <label class="setting-field">Description
                <input value="${escapeHtml(template.description || "")}" data-template-draft-field="description" data-template-draft-index="${index}" />
              </label>
              <label class="setting-field">Pages
                <input type="number" min="1" max="20" value="${Number(template.pages || 1)}" data-template-draft-field="pages" data-template-draft-index="${index}" />
              </label>
            </div>
            <label class="template-upload-row compact-template-upload">
              <span>Replace file</span>
              <input type="file" accept="image/*,application/pdf,.pdf" data-draft-template-image data-template-draft-index="${index}" />
            </label>
          </div>
        `).join("") : `<div class="empty-note">No template documents yet. Use Add Document, then upload an image or PDF.</div>`}
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
  const assignableProjects = adminServiceAssignableProjects();

  return `
    ${renderAdminHeader(title, "Keep service setup simple. Add forms below when this is a form service.", `<button class="ghost-button" data-action="cancel-service-editor">Back to Services</button><button class="primary-button" data-action="save-service-editor">Save Service</button>`)}
    ${state.pricingSaveStatus ? `<div class="save-note">${escapeHtml(state.pricingSaveStatus)}</div>` : ""}
    <div class="module-card service-editor-page">
      <div class="service-editor-simple-head">
        <h2>${escapeHtml(service.title || "New Service")}</h2>
        <span class="badge ${service.enabled === false ? "bad" : "good"}">${service.enabled === false ? "Disabled" : "Enabled"}</span>
      </div>
      <div class="settings-grid service-editor-grid compact-service-editor-grid">
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
        <label class="setting-field">Service Name
          <input value="${escapeHtml(service.title || "")}" data-service-draft-field="title" />
        </label>
        <label class="setting-field">Description
          <input value="${escapeHtml(service.description || "")}" data-service-draft-field="description" />
        </label>
        ${assignableProjects.length ? `<label class="setting-field">Project
          <select data-service-draft-field="projectIds">
            ${assignableProjects.map((project) => `<option value="${escapeHtml(project.projectId)}" ${(service.projectIds || []).includes(project.projectId) ? "selected" : ""}>${escapeHtml(project.name || project.projectId)}</option>`).join("")}
          </select>
        </label>` : `<div class="empty-note">Ask the super admin to allocate a project before assigning services.</div>`}
        <label class="setting-field">B/W Rate
          <input type="number" min="0" value="${rates.bw || 0}" data-service-draft-field="bw" />
        </label>
        <label class="setting-field">Color Rate
          <input type="number" min="0" value="${rates.color || 0}" data-service-draft-field="color" />
        </label>
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
  if (DEMO_KIOSK_MODE && state.mode === "customer") {
    applyDemoKioskConfig({ rerender: true });
    return;
  }

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

function defaultServiceDraft() {
  const id = `custom-service-${Date.now().toString().slice(-5)}`;

  return {
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
  if (!firstAdminServiceProjectId()) {
    state.pricingSaveStatus = "Ask the super admin to allocate a project before creating services.";
    render();
    return;
  }

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

function addDraftTemplate() {
  const editor = state.serviceEditor;
  if (!editor) return;

  const templates = editor.draft.templates || [];
  const title = `Template ${templates.length + 1}`;
  templates.push({
    id: slug(title, `template-${templates.length + 1}`),
    title,
    description: "Uploaded template document.",
    pages: 1,
    paperSize: "Auto",
    orientation: "portrait",
    fields: [],
    imageUrl: "",
    documentType: "image"
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
  const assignableProjectIds = new Set(adminServiceAssignableProjects().map((project) => project.projectId));
  normalized.projectIds = (normalized.projectIds || []).filter((projectId) => assignableProjectIds.has(projectId));
  normalized.kioskIds = [];

  if (!normalized.title) {
    state.pricingSaveStatus = "Service name is required.";
    render();
    return;
  }

  if (!normalized.projectIds.length) {
    const fallbackProjectId = firstAdminServiceProjectId();
    if (fallbackProjectId) {
      normalized.projectIds = [fallbackProjectId];
    } else {
      state.pricingSaveStatus = "No project is assigned to this account. Ask the super admin to allocate a project first.";
      render();
      return;
    }
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
  state.adminSelectedServiceId = normalized.id;
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
      description: "Uploaded template document.",
      pages: 1,
      paperSize: "Auto",
      orientation: "portrait",
      fields: [],
      imageUrl: "",
      documentType: "image"
    };
    const next = { ...existing };

    if (field === "title") {
      next.title = String(value || "").trimStart();
      next.id = next.id || slug(next.title, `template-${templateIndex + 1}`);
    } else if (field === "pages") {
      next.pages = Math.max(1, Math.min(20, Number(value) || 1));
    } else if (field === "paperSize") {
      next.paperSize = normalizePaperSize(value, "Auto", true);
    } else if (field === "orientation") {
      next.orientation = normalizeOrientation(value);
    } else if (field === "description") {
      next.description = String(value || "").trimStart();
    } else if (field === "fields") {
      next.fields = normalizeTemplateFields(value);
    } else if (field === "imageUrl") {
      next.imageUrl = String(value || "").trim();
      next.documentType = templateDocumentKind(value);
    } else if (field === "documentType") {
      next.documentType = templateDocumentKind(value);
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
      paperSize: "Auto",
      orientation: "portrait",
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

async function uploadAdminTemplateImage(file, { serviceId, templateIndex = 0, draft = false } = {}) {
  const validationError = validateAdminTemplateDocumentFile(file);

  if (validationError) {
    state.pricingSaveStatus = validationError;
    render();
    return;
  }

  state.imageUploadBusy = true;
  state.pricingSaveStatus = "Uploading template document...";
  render();

  let imageUrl = "";
  let usedLocalFallback = false;
  const documentType = templateDocumentKind(file.type === "application/pdf" || /\.pdf$/i.test(file.name || "") ? "file.pdf" : file.name);
  const pages = await detectTemplatePageCount(file);
  const title = uploadedTemplateTitle(file, `Template ${templateIndex + 1}`);

  try {
    const formData = new FormData();
    formData.append("templateImage", file, file.name);

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
      state.pricingSaveStatus = error.message || "Could not upload or read the selected template document.";
      render();
      return;
    }
  }

  if (draft) {
    updateServiceDraftTemplateField(templateIndex, "imageUrl", imageUrl);
    updateServiceDraftTemplateField(templateIndex, "documentType", documentType);
    updateServiceDraftTemplateField(templateIndex, "pages", pages);
    updateServiceDraftTemplateField(templateIndex, "title", title);
    updateServiceDraftTemplateField(templateIndex, "description", `${documentType.toUpperCase()} template document.`);
  } else {
    updateServiceTemplateField(serviceId, templateIndex, "imageUrl", imageUrl);
    updateServiceTemplateField(serviceId, templateIndex, "documentType", documentType);
    updateServiceTemplateField(serviceId, templateIndex, "pages", pages);
    updateServiceTemplateField(serviceId, templateIndex, "title", title);
    updateServiceTemplateField(serviceId, templateIndex, "description", `${documentType.toUpperCase()} template document.`);
  }

  state.imageUploadBusy = false;
  if (draft) {
    state.pricingSaveStatus = usedLocalFallback
      ? "Template document embedded locally because backend upload is unavailable."
      : "Template document uploaded. Save this service to publish the change.";
  } else {
    markServicesDirty(usedLocalFallback
      ? "Template document embedded locally because backend upload is unavailable. Save services when backend is online."
      : "Template document uploaded. Save services to publish this change.");
  }
  render();
}

function addService() {
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

function removeService(serviceId) {
  if (services.length <= 1) {
    state.pricingSaveStatus = "At least one service must remain.";
    render();
    return;
  }

  services = services.filter((service) => service.id !== serviceId);
  if (state.adminSelectedServiceId === serviceId) {
    state.adminSelectedServiceId = services[0]?.id || "";
  }
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
  // Ensure every service has a projectId before sending to backend
  const fallbackProjectId = firstAdminServiceProjectId();
  if (fallbackProjectId) {
    services = services.map((service) =>
      (service.projectIds && service.projectIds.length)
        ? service
        : { ...service, projectIds: [fallbackProjectId], kioskIds: [] }
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
  return `
    ${renderAdminHeader("Project Management", "Create and manage projects for this kiosk admin account.", `<button class="primary-button" data-action="create-project">Create Project</button>`)}
    ${adminNotice()}
    ${state.projectCreateStatus ? `<div class="save-note">${escapeHtml(state.projectCreateStatus)}</div>` : ""}
    ${renderProjectEditorPanel()}
    ${renderProjectManagementTable()}
  `;
}

function renderProjectEditorPanel() {
  if (!state.projectEditorOpen) return "";

  const draft = state.projectDraft;
  const editing = Boolean(state.projectEditId);

  return `
    <div class="module-card kiosk-editor-panel">
      <div class="editor-head">
        <div>
          <h2>${editing ? "Edit Project" : "Create Project"}</h2>
          <p class="helper-text">Projects group kiosks, services, pricing, and revenue.</p>
        </div>
        <button class="ghost-button" data-action="cancel-project-editor">Close</button>
      </div>
      <div class="settings-grid compact-service-editor-grid">
        <label class="setting-field">Project ID
          <input value="${escapeHtml(draft.projectId || "")}" data-project-draft-field="projectId" ${editing ? "disabled" : ""} />
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
        <button class="primary-button" data-action="save-project-editor">${editing ? "Save Project" : "Create Project"}</button>
        <button class="ghost-button" data-action="cancel-project-editor">Cancel</button>
      </div>
    </div>
  `;
}

function renderProjectManagementTable() {
  const page = adminPaginated(state.adminData.projects, "projects");

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project Name</th>
            <th>Project ID</th>
            <th>Status</th>
            <th>Kiosks</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${page.items.length ? page.items.map((project) => `
            <tr>
              <td>${escapeHtml(project.name || "")}</td>
              <td>${escapeHtml(project.projectId || "")}</td>
              <td>${escapeHtml(project.status || "")}</td>
              <td>${escapeHtml(String(state.adminData.kiosks.filter((kiosk) => kiosk.projectId === project.projectId).length))}</td>
              <td>${escapeHtml(project.description || "")}</td>
              <td>
                <div class="table-actions">
                  <button class="secondary-button small-button" data-project-edit="${escapeHtml(project.projectId || "")}">Edit</button>
                  <button class="danger-button small-button" data-project-delete="${escapeHtml(project.projectId || "")}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("") : `
            <tr><td colspan="6">No projects are assigned to this account.</td></tr>
          `}
        </tbody>
      </table>
    </div>
    ${renderAdminPagination("projects", page)}
  `;
}

function openCreateProjectEditor() {
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
  if (!projectId) return;
  if (!window.confirm(`Delete project ${projectId}? Kiosks under this project will also be removed.`)) return;

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
  return `
    ${renderAdminHeader("Kiosk Management", "Create and manage kiosks inside your allocated projects.", `<button class="primary-button" data-action="create-kiosk">Create Kiosk</button>`)}
    ${adminNotice()}
    ${state.kioskCreateStatus ? `<div class="save-note">${escapeHtml(state.kioskCreateStatus)}</div>` : ""}
    ${renderKioskEditorPanel()}
    ${renderKioskManagementTable()}
  `;
}

function renderKioskEditorPanel() {
  if (!state.kioskEditorOpen) return "";

  const draft = state.kioskCreate;
  const editing = Boolean(state.kioskEditId);
  const projects = state.adminData.projects || [];

  return `
    <div class="module-card kiosk-editor-panel">
      <div class="editor-head">
        <div>
          <h2>${editing ? "Edit Kiosk" : "Create Kiosk"}</h2>
          <p class="helper-text">Mini PC setup uses the kiosk ID and setup code.</p>
        </div>
        <button class="ghost-button" data-action="cancel-kiosk-editor">Close</button>
      </div>
      <div class="settings-grid compact-service-editor-grid">
        <label class="setting-field">Kiosk ID
          <input value="${escapeHtml(draft.kioskId || "")}" data-kiosk-draft-field="kioskId" ${editing ? "disabled" : ""} />
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
        <button class="primary-button" data-action="save-kiosk-editor">${editing ? "Save Kiosk" : "Create Kiosk"}</button>
        <button class="ghost-button" data-action="cancel-kiosk-editor">Cancel</button>
      </div>
    </div>
  `;
}

function renderKioskManagementTable() {
  const page = adminPaginated(state.adminData.kiosks, "kiosks");
  const kiosks = page.items;

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
            <th>Activation</th>
            <th>Setup Code</th>
            <th>Last Online</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${kiosks.length ? kiosks.map((kiosk) => `
            <tr>
              <td>${escapeHtml(kiosk.kioskId || "")}</td>
              <td>${escapeHtml(kiosk.name || "")}</td>
              <td>${escapeHtml(kiosk.projectId || "")}</td>
              <td>${escapeHtml(kiosk.branch || "")}</td>
              <td>${escapeHtml(kiosk.status || "Unknown")}</td>
              <td>${escapeHtml(kiosk.activatedAt ? "Activated" : "Not activated")}</td>
              <td>${escapeHtml(kiosk.setupCode || "")}</td>
              <td>${escapeHtml(kiosk.lastOnline ? formatDateTime(kiosk.lastOnline) : "")}</td>
              <td>
                <div class="table-actions">
                  <button class="secondary-button small-button" data-kiosk-edit="${escapeHtml(kiosk.kioskId || "")}">Edit</button>
                  <button class="danger-button small-button" data-kiosk-delete="${escapeHtml(kiosk.kioskId || "")}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("") : `
            <tr><td colspan="9">No kiosks are assigned to this account.</td></tr>
          `}
        </tbody>
      </table>
    </div>
    ${renderAdminPagination("kiosks", page)}
  `;
}

function randomKioskSetupCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function openCreateKioskEditor() {
  const project = state.adminData.projects[0];
  if (!project) {
    state.kioskCreateStatus = "No assigned projects found. Ask the super admin to allocate a project first.";
    render();
    return;
  }

  const nextNumber = state.adminData.kiosks.length + 1;
  state.kioskCreate = {
    kioskId: `KIOSK-${String(nextNumber).padStart(2, "0")}`,
    name: `Kiosk ${nextNumber}`,
    projectId: project.projectId,
    branch: "",
    setupCode: randomKioskSetupCode()
  };
  state.kioskEditId = "";
  state.kioskEditorOpen = true;
  state.kioskCreateStatus = "";
  render();
}

function openEditKioskEditor(kioskId) {
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
    setupCode: kiosk.setupCode || randomKioskSetupCode()
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
    state.kioskCreate.kioskId = String(value || "").trim().toUpperCase();
  } else if (field === "setupCode") {
    state.kioskCreate.setupCode = String(value || "").trim().toUpperCase();
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
  syncKioskDraftFromDom();
  const draft = { ...state.kioskCreate };

  if (!draft.kioskId) {
    state.kioskCreateStatus = "Enter a kiosk ID.";
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
    const editing = Boolean(state.kioskEditId);
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
  if (!kioskId) return;
  if (!window.confirm(`Delete kiosk ${kioskId}?`)) return;

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

function renderRefunds() {
  const rows = state.adminData.refunds.map((refund) => [
    refund.refundId || "",
    refund.jobId || "",
    refund.paymentId || "",
    money(refund.amount || 0),
    refund.reason || "",
    refund.status || ""
  ]);

  return `
    ${renderAdminHeader("Refunds", "Refund records for your assigned projects and kiosks.")}
    ${adminNotice()}
    ${renderPaginatedTable("refunds", ["Refund ID", "Job ID", "Payment ID", "Amount", "Reason", "Status"], rows, "No refund records found.")}
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
  const page = adminPaginated(alerts, "alerts");

  return `
    ${renderAdminHeader("Notifications", "Dashboard, email, SMS, and WhatsApp alerts can be wired here.")}
    ${adminNotice()}
    <div class="module-grid">
      ${(page.items.length ? page.items : [{ title: "No live alerts", detail: "Backend and assigned kiosk checks are clear.", tone: "good" }]).map((alert) => `
        <div class="module-card">
          <h2>${escapeHtml(alert.title)}</h2>
          <p class="helper-text">${escapeHtml(alert.detail)}</p>
          <span class="badge ${alert.tone}">${alert.tone === "good" ? "OK" : "Open"}</span>
        </div>
      `).join("")}
    </div>
    ${renderAdminPagination("alerts", page)}
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
  syncCustomerClockTimer();
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

  if (target.dataset.adminPaginationKey && target.dataset.adminPaginationPage) {
    state.adminPagination[target.dataset.adminPaginationKey] = Math.max(1, Number(target.dataset.adminPaginationPage) || 1);
    render();
    return;
  }

  if (target.dataset.service) {
    if (!printerReadyForCustomerFlow()) {
      render();
      return;
    }

    state.selectedService = target.dataset.service;
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
    render();
    if (!(TEST_HOOKS_ENABLED && state.adminToken === "ui-test-session")) {
      loadAdminData();
    }
    return;
  }

  if (target.dataset.serviceEdit) {
    openServiceEditor(target.dataset.serviceEdit);
    return;
  }

  if (target.dataset.adminServiceSelect) {
    state.adminSelectedServiceId = target.dataset.adminServiceSelect;
    render();
    return;
  }

  if (target.dataset.serviceDelete) {
    removeService(target.dataset.serviceDelete);
    return;
  }

  if (target.dataset.projectEdit) {
    openEditProjectEditor(target.dataset.projectEdit);
    return;
  }

  if (target.dataset.projectDelete) {
    deleteProject(target.dataset.projectDelete);
    return;
  }

  if (target.dataset.kioskEdit) {
    openEditKioskEditor(target.dataset.kioskEdit);
    return;
  }

  if (target.dataset.kioskDelete) {
    deleteKiosk(target.dataset.kioskDelete);
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
    if (target.dataset.setting === "colorMode" && !customerSettingEnabled(target.dataset.value)) {
      return;
    }
    state.settings[target.dataset.setting] = target.dataset.value;
    state.settingsCustomized = true;
    render();
    return;
  }

  if (target.dataset.previewFileIndex !== undefined) {
    state.previewFileIndex = Math.max(0, Math.min(jobFiles().length - 1, Number(target.dataset.previewFileIndex) || 0));
    state.previewZoom = 1;
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

  switch (target.dataset.action) {
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
    case "admin-logout":
      state.adminAuthed = false;
      state.adminNavOpen = false;
      state.adminToken = "";
      state.adminAccount = null;
      clearAdminSession();
      stopAdminPolling();
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
      } else {
        state.step = Math.max(0, state.step - 1);
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
    render();
    return;
  }

  if (target.dataset.adminLoginField) {
    state.adminLoginDraft[target.dataset.adminLoginField] = target.value;
    state.adminLoginError = "";
    return;
  }

  if (target.dataset.adminServiceSelect !== undefined) {
    state.adminSelectedServiceId = target.value;
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
        result.file.previewUrl = URL.createObjectURL(file);
        result.file.printContentBase64 = await readFileAsBase64(file);
        return result.file;
      }));

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

function stopReceiptRedirect() {
  if (state.receiptRedirectTimer) {
    clearInterval(state.receiptRedirectTimer);
    state.receiptRedirectTimer = null;
  }
}

function startReceiptRedirect() {
  if (state.receiptRedirectTimer) return;

  state.receiptSecondsLeft = RECEIPT_REDIRECT_SECONDS;
  state.receiptRedirectTimer = setInterval(() => {
    state.receiptSecondsLeft -= 1;

    if (state.receiptSecondsLeft <= 0) {
      stopReceiptRedirect();
      resetCustomer();
      render();
      refreshPrinterStatus();
      return;
    }

    if (state.mode === "customer" && state.step === 4) {
      render();
    }
  }, 1000);
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
  if (!DEMO_KIOSK_MODE) {
    syncBackendPrintStatus(printStatus, state.printError);
  }

  if (printStatus === "Completed") {
    state.lastCompletedJob = job;
  }

  return job;
}

function resetCustomer() {
  stopUploadPolling();
  stopPaymentPolling();
  stopReceiptRedirect();
  state.mode = "customer";
  state.step = 0;
  state.selectedService = null;
  clearCurrentFile();
  state.uploadSession = null;
  state.previewZoom = 1;
  state.previewFileIndex = 0;
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
  state.activeJobId = null;
  state.lastCompletedJob = null;
  state.receiptSecondsLeft = RECEIPT_REDIRECT_SECONDS;
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
    stopReceiptRedirect();
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
    state.step = 4;
    render();
    startReceiptRedirect();
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
render();
loadPricingSettings();
if (isMobilePaymentEntry) {
  loadMobilePayment();
} else {
  startConfigPolling();
}
if (!isMobilePaymentEntry && state.mode === "customer") {
  if (DEMO_KIOSK_MODE) {
    refreshKioskConfig({ rerender: true, force: true });
  }
  refreshPrinterStatus();
}
if (!isMobilePaymentEntry && state.adminAuthed) {
  loadAdminData();
  startAdminPolling();
}
