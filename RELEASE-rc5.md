# Printing Kiosk 1.2.20-rc.5

PDF previews now render the original PDF instead of a first-page thumbnail when
the PDF is available. Text is supersampled at a minimum of 2x for ordinary kiosk
screens, with a bounded 12-megapixel canvas. Resizing the preview refreshes its
bitmap; switching between single and multiple documents uses separate cache keys.
Existing low-resolution source scans cannot gain detail absent from the source.

Desktop preview pages use the screen width, a narrower settings panel and reduced
spacing around the document. Paper proportions, print margins and orientation are
preserved. No pricing, payment or print-output settings change.

Extract the entire Full-Setup ZIP on the Mini PC, finish customer jobs, run
SETUP.bat as the kiosk Windows user and choose Install / Update. Do not uninstall
first. Updates from rc.4 preserve identity, printer configuration and enrollment;
the old application is retained for recovery. This is an unsigned setup package.

For the website frontend checkout: git pull --ff-only origin main, then
npm run build:production. Publish dist/ to the existing /printingkiosk/ website
directory. Confirm index.html references app.js?v=1.2.20-rc.5 and hard-refresh.
This preview-only release needs no backend service update. Installation and EC2
publication are manual, as requested; package tests do not establish hardware
printing, live payment or installation acceptance on a target Mini PC.
