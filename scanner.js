/* Scan pages stay in memory only; cancel/reset invalidates every pending capture. */
let scanGeneration = 0;
let scanController = null;
function isScanService() {
  return services.some(service => service.id === state.selectedService && (service.mode === 'scan' || service.id === 'scan'));
}
function resetScanner() {
  scanGeneration++;
  scanController?.abort();
  scanController = null;
  state.scanBusy = false;
  state.scanError = '';
  state.scanPaymentDeadline = 0;
}
function scannerIllustration() {
  return `<svg class="scanner-art" viewBox="0 0 560 340" role="img" aria-label="Lift the lid, place the document face down against the marked corner, and close the lid">
    <ellipse cx="280" cy="300" rx="210" ry="22" fill="#dce9ef"/>
    <path d="M84 187h392v83q0 22-22 22H106q-22 0-22-22Z" fill="#263d59"/>
    <rect x="84" y="169" width="392" height="75" rx="18" fill="#e2eaf1" stroke="#a3b5c9" stroke-width="3"/>
    <rect x="110" y="181" width="340" height="47" rx="8" fill="#b4e4e0"/>
    <path d="M118 204v-15h20" fill="none" stroke="#0d9488" stroke-width="5"/>
    <g class="scanner-paper"><rect x="151" y="127" width="258" height="73" rx="5" fill="white" stroke="#94a3b8" stroke-width="2"/><path d="M178 148h115m-115 14h190m-190 14h160" stroke="#bbc9d8" stroke-width="5"/><path d="m382 153 0 24m-9-9 9 9 9-9" fill="none" stroke="#0d9488" stroke-width="4"/></g>
    <g class="scanner-lid"><path d="M84 170 118 43q3-12 18-12h288q15 0 18 12l34 127Z" fill="#f8fafc" stroke="#a3b5c9" stroke-width="4"/><path d="m111 151 29-98h280l29 98Z" fill="#e4ebf2"/></g>
    <rect class="scanner-beam" x="117" y="188" width="326" height="5" rx="2" fill="#14b8a6"/>
    <circle cx="438" cy="262" r="6" fill="#5eead4"/><path d="M114 262h85" stroke="#7b90aa" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}
function renderScanStep() {
  const files = jobFiles();
  return `<div class="stage scan-stage">
    <header class="scan-heading"><div><span class="scan-eyebrow">PAPER TO PRINT</span><h1>Scan &amp; Print</h1><p>Place your original. Check the scan. Pay to print.</p></div><button class="ghost-button" data-action="reset-session">Cancel session</button></header>
    <div class="scan-layout">
      <section class="scan-guide ${state.scanBusy ? 'is-scanning' : ''}">${scannerIllustration()}<strong>${state.scanBusy ? 'Scanning — keep the lid closed' : 'Place the printed side face down'}</strong><span>Align the page with the marked corner of the glass.</span></section>
      <section class="scan-instructions"><ol><li><b>Lift the scanner lid</b><span>Remove staples and keep the glass clear.</span></li><li><b>Place one page face down</b><span>Align it with the corner mark, then close the lid gently.</span></li><li><b>Tap Scan page</b><span>Add more pages or continue to preview and payment.</span></li></ol>
        <p class="scan-mode-note">${DEMO_KIOSK_MODE ? 'Preview mode · scanning, payment and printing are simulated.' : 'Keep your original on the glass until scanning finishes.'}</p>
        ${state.scanError ? `<p class="scan-error" role="alert">${escapeHtml(state.scanError)}</p>` : ''}
        <div class="scan-actions"><button class="primary-button" data-action="scan-capture" ${state.scanBusy || files.length >= MAX_FILES_PER_JOB ? 'disabled' : ''}>${state.scanBusy ? 'Scanning…' : files.length ? 'Scan next page' : 'Scan page'}</button><button class="secondary-button" data-action="scan-review" ${!files.length || state.scanBusy ? 'disabled' : ''}>Preview ${files.length || ''} ${files.length === 1 ? 'page' : 'pages'} →</button></div>
        <p class="scan-privacy">Up to ${MAX_FILES_PER_JOB} pages. Unpaid payment sessions close after 3 minutes. Remember to collect your original.</p>
      </section>
    </div>
    ${files.length ? `<section class="scan-pages" aria-label="Scanned pages">${files.map((file, index) => `<article><img src="${escapeHtml(file.previewUrl)}" alt="Scanned page ${index + 1}"/><span>Page ${index + 1}</span><button class="ghost-button" data-action="scan-remove" data-index="${index}" ${state.scanBusy ? 'disabled' : ''} aria-label="Remove scanned page ${index + 1}">Remove</button></article>`).join('')}</section>` : ''}
  </div>`;
}
async function sampleScan(signal) {
  await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Scan cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1800);
    signal.addEventListener('abort', abort, { once: true });
  });
  const canvas = document.createElement('canvas');
  canvas.width = 794; canvas.height = 1123;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 794, 1123);
  ctx.fillStyle = '#0d9488'; ctx.fillRect(65, 70, 65, 7);
  ctx.fillStyle = '#18334e'; ctx.font = 'bold 36px sans-serif'; ctx.fillText('Sample scanned document', 65, 140);
  ctx.font = '22px sans-serif'; ctx.fillText(`Page ${jobFiles().length + 1} · Printing Kiosk preview`, 65, 190);
  ctx.fillStyle = '#64748b'; ctx.fillText('This is a simulated scan, not your original.', 65, 260);
  for (let y = 330; y < 850; y += 46) { ctx.fillStyle = '#dce4eb'; ctx.fillRect(65, y, y % 3 ? 660 : 440, 9); }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
async function captureScanPage() {
  if (!isScanService() || state.step !== 1 || state.scanBusy || jobFiles().length >= MAX_FILES_PER_JOB) return;
  const generation = scanGeneration;
  const controller = new AbortController();
  scanController = controller;
  state.scanBusy = true; state.scanError = ''; render();
  const timeout = setTimeout(() => controller.abort(), 115000);
  let previewUrl;
  try {
    let blob;
    if (DEMO_KIOSK_MODE) blob = await sampleScan(controller.signal);
    else {
      const response = await fetch(`${BACKEND_URL}/api/scanner/capture`, { method: 'POST', headers: { 'X-Kiosk-Scanner': 'capture' }, signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error || 'Scanner unavailable.');
      blob = await response.blob();
    }
    if (generation !== scanGeneration || controller.signal.aborted) return;
    if (!blob || blob.type !== 'image/png' || blob.size > 20 * 1024 * 1024) throw new Error('Scanner returned an unsupported page. Please try again.');
    const printContentBase64 = await readFileAsBase64(blob);
    if (generation !== scanGeneration || controller.signal.aborted) return;
    previewUrl = URL.createObjectURL(blob);
    const file = { name: `scan-${Date.now()}.png`, type: 'PNG', pages: 1, previewKind: 'image', previewUrl, printContentBase64, source: 'Scanned document' };
    const error = enforceUploadPaperSufficiency([...jobFiles(), file]);
    if (error) throw new Error(error);
    setJobFiles([...jobFiles(), file]); previewUrl = null;
  } catch (error) {
    if (generation === scanGeneration) state.scanError = controller.signal.aborted ? 'Scanning took too long. Check the scanner and try again.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (generation === scanGeneration) { state.scanBusy = false; scanController = null; render(); }
  }
}
function handleScannerAction(target) {
  if (!isScanService()) return false;
  if (target.dataset.action === 'scan-capture') { captureScanPage(); return true; }
  if (target.dataset.action === 'scan-review' && !state.scanBusy && jobFiles().length) { state.step = 2; render(); return true; }
  if (target.dataset.action === 'scan-add' && state.step === 2) { state.step = 1; render(); return true; }
  if (target.dataset.action === 'scan-remove' && !state.scanBusy) {
    const index = Number(target.dataset.index), files = [...jobFiles()];
    if (Number.isInteger(index) && index >= 0 && index < files.length) { revokePreviewUrl(files[index]); files.splice(index, 1); setJobFiles(files); render(); }
    return true;
  }
  return false;
}
