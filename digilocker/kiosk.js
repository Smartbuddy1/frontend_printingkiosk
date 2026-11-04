(function () {
  "use strict";
  const config = window.DigiLockerConfig;
  if (!config?.enabled) return;
  let session = null, phase = "", active = false, handedOff = false, generation = 0;
  let resumePending = false, resumeTimer = null, progressStep = 0;
  let poller = null, clock = null, fetching = false, records = [], received = [], message = "";
  let abort = new AbortController();
  const owned = new WeakSet();
  const pendingCreations = new Set(), cancelledSessions = new Map(), cancellationRequests = new Map();
  const apiUrl = path => config.hosted ? new URL(path, config.apiBase || window.location.origin).href : path;
  const t = key => (config.translations[state.customerLanguage] || config.translations.en)[key] || (config.translations[state.customerLanguage] || config.translations.en).generic;
  const h = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function redraw() { render(); }
  function isLocker(service) { return service?.mode === "digilocker" || String(service?.id || "").toLowerCase() === "digilocker" || /^digi[ -]?locker$/i.test(String(service?.title || "").trim()); }
  function normalService() { const available = customerServices().filter(s => !isLocker(s) && s.mode !== "scan" && s.id !== "scan" && !isFormTemplateService(s.id)); return available.find(s => s.id === "print") || available[0]; }
  function kioskPermitted() { return config.preview === true || (Array.isArray(services) && services.some(s => isLocker(s) && serviceAvailableForKiosk(s))); }
  async function request(suffix, options = {}, current = session) {
    if (!current) throw new Error("SESSION_ENDED");
    const response = await fetch(apiUrl(`/api/digilocker/sessions/${current.sessionId}/${suffix}`), {
      ...options, signal: options.signal || abort.signal, cache: "no-store",
      headers: { "x-kiosk-secret": current.kioskSecret, ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "unavailable"); }
    return response;
  }
  async function complete(current, result) {
    if (!current) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(apiUrl(`/api/digilocker/sessions/${current.sessionId}/complete`), { method: "POST", keepalive: true,
          headers: { "x-kiosk-secret": current.kioskSecret, "Content-Type": "application/json" },
          body: JSON.stringify({ result }), signal: AbortSignal.timeout(4000) });
        if (response.ok || response.status === 410) return true;
      } catch { /* The server TTL is the fallback if this browser disappears. */ }
    }
    return false;
  }
  function retireSession(current) {
    if (!current) return Promise.resolve(true);
    cancelledSessions.set(current.sessionId, current);
    if (cancellationRequests.has(current.sessionId)) return cancellationRequests.get(current.sessionId);
    const work = complete(current, "cancelled").then(closed => {
      if (closed) cancelledSessions.delete(current.sessionId);
      return closed;
    }).finally(() => cancellationRequests.delete(current.sessionId));
    cancellationRequests.set(current.sessionId, work);
    return work;
  }
  function clearTimers() { clearTimeout(poller); clearInterval(clock); clearTimeout(resumeTimer); poller = clock = resumeTimer = null; }
  function eraseRecord(record) {
    if (record.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(record.previewUrl);
    record.previewUrl = ""; record.printContentBase64 = "";
  }
  function eraseLocal() { records.forEach(eraseRecord); records = []; received = []; }
  function cancel() {
    const old = session; session = null; generation++; abort.abort(); abort = new AbortController();
    resumePending = false; active = false; handedOff = false; fetching = false; phase = ""; progressStep = 0; message = ""; clearTimers(); eraseLocal();
    void retireSession(old);
  }
  function fail(code) {
    const old = session; session = null; abort.abort(); clearTimers(); eraseLocal();
    resumePending = false; active = true; handedOff = false; phase = "FAILED"; message = t(code); clearCurrentFile(); redraw();
    void complete(old, "failed");
  }
  async function prepare(files, epoch) {
    const prepared = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const meta = files[index];
        const response = await request(`files/${meta.fileId}`), blob = await response.blob();
        if (epoch !== generation) throw new Error("SESSION_ENDED");
        const extension = meta.mime === "application/pdf" ? "pdf" : meta.mime === "image/png" ? "png" : "jpg";
        // Provider names stay only in the transient receipt, never job history.
        const file = new File([blob], `Document-${index + 1}.${extension}`, { type: meta.mime });
        const result = createFileRecord(file.name, file.size, meta.pages, file.type);
        if (result.error) throw new Error("FILE_TYPE_INVALID");
        const record = result.file; prepared.push(record); owned.add(record);
        record.pages = meta.pages; record.previewUrl = URL.createObjectURL(file);
        const pageError = await enforceUploadPageLimit(record);
        if (pageError) throw new Error("PAGE_LIMIT");
        record.printContentBase64 = await readFileAsBase64(file);
        if (epoch !== generation) throw new Error("SESSION_ENDED");
      }
      const paperError = enforceUploadPaperSufficiency(prepared);
      if (paperError) { message = paperError; throw new Error("unavailable"); }
      return prepared;
    } catch (error) { prepared.forEach(eraseRecord); throw error; }
  }
  async function poll(epoch) {
    if (!session || epoch !== generation || fetching || handedOff) return;
    fetching = true;
    try {
      const data = await (await request("status")).json();
      if (epoch !== generation) return;
      if (data.phoneActivityAt > (session.lastPhoneActivityAt || 0)) {
        session.lastPhoneActivityAt = data.phoneActivityAt;
        noteCustomerActivity();
        if (epoch !== generation) return;
      }
      if (["DENIED","FAILED","CANCELLED","EXPIRED"].includes(data.status)) { fail(data.status === "DENIED" ? "denied" : data.error || "ended"); return; }
      if (["DOWNLOADING", "READY"].includes(data.status)) progressStep = 2;
      else if (data.status === "PHONE_CONNECTED") progressStep = 1;
      if (data.status === "READY") {
        const prepared = await prepare(data.files, epoch);
        if (epoch !== generation) { prepared.forEach(eraseRecord); return; }
        received = data.files; records = prepared;
        phase = "READY"; redraw(); return;
      }
      if (phase !== data.status) { phase = data.status; redraw(); }
    } catch (error) { if (epoch === generation && error.name !== "AbortError") fail(error.message); }
    finally {
      if (epoch === generation) fetching = false;
      if (epoch === generation && session && phase !== "READY" && !handedOff) poller = setTimeout(() => poll(epoch), 1500);
    }
  }
  function tick() {
    if (!session) return;
    if (active && checkCustomerInactivityDeadline()) return;
    // The customer timer owns the visible countdown and reset. Keep the
    // server lifetime guard for later document/print phases without another UI clock.
    if (session && Date.now() >= session.expiresAt && phase !== "PRINTING") fail("ended");
  }
  async function start(serviceId) {
    if (!kioskPermitted()) return;
    const service = serviceId ? services.find(s => s.id === serviceId && isLocker(s) && serviceAvailableForKiosk(s)) : serviceDefinition(); if (!service || !normalService() || !printerReadyForCustomerFlow()) return;
    cancel(); const epoch = generation;
    clearCurrentFile(); stopUploadPolling(); stopPaymentPolling();
    state.selectedService = service.id; applyServicePrintDefaults(service); state.step = 1; state.activeJobId = null;
    state.paymentStatus = "Pending"; state.paymentError = ""; state.printError = "";
    active = true; phase = "STARTING"; redraw();
    if (config.preview !== true && service.mode !== "digilocker") { fail("DIGILOCKER_NOT_READY"); return; }
    try {
      // Finish retiring any QR created while the customer was leaving. A new
      // session is not opened until the known previous sessions are closed.
      await Promise.allSettled([...pendingCreations]);
      if (epoch !== generation) return;
      const closed = await Promise.all([...cancelledSessions.values()].map(retireSession));
      if (epoch !== generation) return;
      if (closed.some(result => !result)) { fail("unavailable"); return; }
      let kioskKey=config.kioskKey;
      if(config.hosted){
        const bootstrap=await fetch(apiUrl("/api/digilocker/bootstrap"),{signal:abort.signal,cache:"no-store"});
        const result=await bootstrap.json();if(!bootstrap.ok)throw new Error(result.error||"unavailable");
        if(epoch!==generation)return;kioskKey=result.kioskKey;
      }
      // Keep the bounded creation response readable after Back, so a session
      // already created on the server can still be explicitly cancelled.
      const creation = (async () => {
        const response = await fetch(apiUrl("/api/digilocker/sessions"), { method: "POST", signal: AbortSignal.timeout(15000), cache: "no-store",
          headers: { "Content-Type":"application/json", "x-digilocker-kiosk-key":kioskKey }, body:JSON.stringify({language:state.customerLanguage,kioskId:KIOSK_ID}) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "unavailable");
        if (epoch !== generation) { await retireSession(data); return null; }
        return data;
      })();
      pendingCreations.add(creation);
      let data;
      try { data = await creation; } finally { pendingCreations.delete(creation); }
      if (epoch !== generation || !data) { if (data) void retireSession(data); return; }
      session = data; phase = "CREATED"; redraw(); clock = setInterval(tick,1000); tick(); poller=setTimeout(()=>poll(epoch),500);
    } catch(error) { if(epoch === generation && error.name !== "AbortError")fail(error.message); }
  }
  function confirm() {
    if (phase !== "READY" || !session || !records.length || !printerReadyForCustomerFlow()) return;
    const paperError=enforceUploadPaperSufficiency(records);if(paperError){message=paperError;redraw();return;}
    clearCurrentFile(); handedOff = true; active = false; clearTimeout(poller);
    setJobFiles(records); state.uploadError=""; state.step=2; redraw();
  }
  async function aroundPrint(original) {
    if (!session || !handedOff || !jobFiles().some(f=>owned.has(f))) return original();
    // The existing payment code alone decides when this entry point is called.
    if (state.paymentStatus !== "Success") { fail("generic"); return; }
    const current=session, epoch=generation;
    try {
      await request("printing",{method:"POST"}); phase="PRINTING"; progressStep=3;
      await original();
      if(epoch !== generation)return;
      const success=state.printProgress===5 && !state.printError;
      active=true;phase="CLEANUP";redraw();
      await complete(current,success?"done":"failed");
      if(epoch !== generation)return;
      session=null;handedOff=false;clearTimers();eraseLocal();clearCurrentFile();
      active=true;phase=success?"DONE":"FAILED";message=success?t("deleted"):t("printFailed");redraw();
    } catch(error) { if(epoch===generation)fail(error.message); }
  }
  function renderButton() {
    if (state.mode !== "customer" || !normalService() || !kioskPermitted()) return "";
    return `<button type="button" class="dl-launch" data-digilocker="start" ${printerReadyForCustomerFlow()?"":"disabled"} aria-label="Print from DigiLocker"><img src="${h(config.assetBase || "/")}assets/digilocker-official.svg" alt="DigiLocker" width="220" height="44"></button>`;
  }
  function serviceAvailable() {
    const assignedService = Array.isArray(services)
      && services.some((service) => isLocker(service) && serviceAvailableForKiosk(service));
    const hasUploadService = Array.isArray(services)
      && services.some((service) => !isLocker(service) && service.mode !== "scan" && service.id !== "scan" && serviceAvailableForKiosk(service) && !isFormTemplateService(service.id));
    return Boolean(config.enabled && state.mode === "customer" && hasUploadService && (assignedService || config.preview === true));
  }
  function serviceDefinition() {
    const assignedService = Array.isArray(services)
      ? services.find((service) => isLocker(service) && serviceAvailableForKiosk(service))
      : null;
    return assignedService || (config.preview === true ? {
      id: "digilocker",
      title: t("title"),
      description: t("launchDescription"),
      mode: "digilocker",
      enabled: true,
      projectIds: [],
      kioskIds: [],
      pricing: { bw: 0, color: 0 }
    } : null);
  }
  function renderServiceCard(service, printerReady, serviceBlockStatus) {
    if (!serviceAvailable()) return "";
    const blocked = !printerReady;
    const logo = `${h(config.assetBase || "/")}assets/digilocker-official.svg`;
    const icon = uiIcon("system", 28);
    return `<div class="premium-service-card premium-service-card-extra card-blue dl-service-card ${blocked ? "is-service-blocked" : ""}" data-digilocker="service" data-digilocker-service="${h(service.id)}" aria-disabled="${blocked ? "true" : "false"}" style="cursor:${blocked ? "not-allowed" : "pointer"}">
      <div class="premium-card-header"><div class="premium-icon-box bg-blue" aria-hidden="true">${icon}</div><div class="premium-header-text"><h2>${h(service.title || t("title"))}</h2><p>${h(service.description || t("launchDescription"))}</p></div></div>
      <div class="premium-illustration dl-service-illustration" aria-hidden="true"><img src="${logo}" alt="" /></div>
      <div class="premium-features bg-light-blue">
        <div class="premium-feature"><span class="dl-service-feature-icon">${uiIcon("pages", 20)}</span><div><strong>Documents</strong><span>Use phone QR</span></div></div>
        <div class="premium-feature border-left"><span class="dl-service-feature-icon">${uiIcon("system", 20)}</span><div><strong>Secure access</strong><span>Sign in on your phone</span></div></div>
        <div class="premium-feature border-left"><span class="dl-service-feature-icon">${uiIcon("clock", 20)}</span><div><strong>Quick Print</strong><span>Fast service</span></div></div>
      </div>
      <button class="premium-btn bg-blue" data-digilocker="service" data-digilocker-service="${h(service.id)}" ${blocked ? "disabled" : ""}>Start <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></button>
      ${blocked && serviceBlockStatus ? `<p class="premium-service-block-message">${h(serviceBlockStatus.title)}</p>` : ""}
    </div>`;
  }
  function inactivityDeadline() {
    return session && ["CREATED", "PHONE_CONNECTED"].includes(phase) ? session.pairExpiresAt : null;
  }
  function inactivityScreenKey() {
    if (["PRINTING","CLEANUP"].includes(phase)) return "";
    if (phase === "DONE") return "digilockerDone";
    if (["FAILED","DENIED","EXPIRED"].includes(phase)) return "error";
    if (phase === "READY") return "digilockerReady";
    if (["STARTING","DOWNLOADING"].includes(phase)) return "digilockerReceive";
    return "digilockerPair";
  }
  function screen() {
    const steps=["scan","login","choose","print"];
    const index=progressStep;
    const failureTitle = progressStep === 3 ? "failed" : "connectionFailed";
    let content="";
    if(phase==="STARTING")content=`<div class="dl-starting-card" role="status"><span class="dl-state-spinner" aria-hidden="true"></span><p>${h(t("starting"))}</p></div>`;
    else if(["CREATED","PHONE_CONNECTED","DOWNLOADING"].includes(phase))content=`<div class="dl-pair-layout">
      <section class="dl-qr-card" aria-label="DigiLocker QR code">
        <span class="dl-card-kicker">DigiLocker secure connection</span>
        <div class="dl-qr">${session?.qrSvg||""}</div>
        <p>${h(t("scan"))}</p>
        <div class="dl-countdown"><span>${h(t("timeLeft"))}</span><strong data-digilocker-countdown>--:--</strong></div>
      </section>
      <section class="dl-instructions-card" aria-live="polite">
        <span class="dl-state-pill"><i></i>${h(t(phase==="CREATED"?"scan":phase==="PHONE_CONNECTED"?"phoneConnected":"downloading"))}</span>
        <h2>${h(t(phase==="CREATED"?"instructions":phase==="PHONE_CONNECTED"?"phoneConnected":"downloading"))}</h2>
        <div class="dl-phone-note"><span aria-hidden="true">i</span><p>${h(t("consent"))}</p></div>
      </section>
    </div>`;
    else if(phase==="READY")content=`<div class="dl-ready-card"><div class="dl-ready-icon" aria-hidden="true">&#10003;</div><span class="dl-card-kicker">${h(t("sent"))}</span><h2>${h(t("ready"))}</h2><p class="dl-ready-intro">${h(t("continueNote"))}</p><ul class="dl-files">${received.map(f=>`<li><span class="dl-file-icon" aria-hidden="true">FILE</span><span class="dl-file-name">${h(f.name)}</span><strong>${f.pages} ${h(t("pages"))}</strong></li>`).join("")}</ul><p class="dl-privacy">${h(t("privacy"))}</p><button class="primary-button" data-digilocker="confirm">${h(t("confirm"))}</button></div>`;
    else content=`<div class="dl-result-card"><div class="dl-result">${phase==="DONE"?"✓":phase==="CLEANUP"?"…":"!"}</div><h2>${h(t(phase==="DONE"?"done":phase==="CLEANUP"?"cleanup":failureTitle))}</h2></div>`;
    const canLeave = !["PRINTING", "CLEANUP"].includes(phase);
    return `<div class="stage dl-stage ${["STARTING","CREATED","PHONE_CONNECTED","DOWNLOADING"].includes(phase)?"dl-pair-screen":""}" data-no-customer-translation>
      <header class="dl-page-head">${canLeave ? `<button type="button" class="secondary-button dl-back" data-digilocker="back" aria-label="${h(t("home"))}"><span aria-hidden="true">&larr;</span> ${h(t("back"))}</button>` : ""}<div class="dl-brand-lockup"><div><span>Secure document printing</span><h1>${h(t("heading"))}</h1></div></div><span class="dl-session-badge"><i></i>Private session</span></header>
      <ol class="dl-progress" aria-label="DigiLocker">${steps.map((s,i)=>`<li data-digilocker-step="${i}" ${i===index?'aria-current="step"':""} class="${i===index?"is-current":""} ${i<index?"is-complete":""}"><span>${i<index?"&#10003;":i+1}</span><b>${h(t(s))}</b></li>`).join("")}</ol>
      <div class="dl-content" aria-live="polite">${content}${message?`<p role="status">${h(message)}</p>`:""}</div>
      <p class="dl-footer-note"><span aria-hidden="true">i</span> ${h(t("privacy"))}</p>
    </div>`;
  }
  // Persist only the screen identity in the existing customer state. Reloads
  // create a fresh QR; credentials, QR secrets and documents are never restored.
  function restoreCustomerState(saved) {
    if (saved.documentSource !== "digilocker" || state.mode !== "customer" || isMobilePaymentEntry) return false;
    resumePending = true; active = true; phase = "STARTING"; progressStep = 0;
    return true;
  }
  function attach() {
    if (resumePending) {
      const deadline = Date.now() + 15000;
      const resume = () => {
        if (!resumePending || !active) return;
        if (normalService() && printerReadyForCustomerFlow()) { void start(); return; }
        if (Date.now() >= deadline) { fail("unavailable"); return; }
        resumeTimer = setTimeout(resume, 100);
      };
      resume();
    }
    if(config.preview){const banner=document.createElement("div");banner.className="dl-preview-banner";banner.setAttribute("role","note");banner.textContent=t("mockPrint");document.body.prepend(banner);}
    document.addEventListener("click",event=>{
      const target=event.target.closest("[data-digilocker]");if(!target)return;event.preventDefault();event.stopPropagation();
      const action=target.dataset.digilocker;
      if(action==="start"||action==="service"||action==="refresh")void start(target.dataset.digilockerService);
      if(action==="confirm")confirm();
      if((action==="back"||action==="home") && !["PRINTING","CLEANUP"].includes(phase)){resetCustomer();redraw();void refreshPrinterStatus();}
    },true);
    window.addEventListener("pagehide",cancel);
  }
  window.DigilockerUI={start,attach,cancel,restoreCustomerState,beforeClear:()=>{if(handedOff)cancel();},isActive:()=>active,inactivityScreenKey,inactivityDeadline,render:screen,renderButton,serviceAvailable,serviceDefinition,renderServiceCard,aroundPrint,
    printOptions:file=>owned.has(file)?{digilockerTransient:true}:{},
    mockPaymentMarkup:()=>`<div class="dl-mock-payment"><strong>${h(t("paymentMock"))}</strong><p>${h(t("paymentMockNote"))}</p></div>`
  };
})();
