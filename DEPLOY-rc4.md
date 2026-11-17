# Printing Kiosk 1.2.20-rc.4

This release opens all selected DigiLocker documents directly in preview, updates
the QR/connection screens and printing animation, and blocks service entry until
printer/internet checks succeed. The six-second print animation delay is demo-only.
The current public mobile-payment URL fixes are retained.

From your existing frontend checkout on the website EC2 server:

```sh
git status --short
git pull --ff-only origin main
npm run build:production
```

Resolve any existing local changes before pulling. Publish the resulting `dist/`
contents to the directory already served at `/printingkiosk/`. If nginx serves
this checkout's `dist/` directly, the build updates those assets. Do not guess or
replace the nginx root, certificates, other website directories or API proxy.
`dist/build-production.cjs` must not be publicly served. Preserve the existing
`/api/` and DigiLocker proxy routes.

Verify the served `index.html` references `app.js?v=1.2.20-rc.4`, hard-refresh,
then check the customer flow. Git push/pull alone does not prove deployment.

Install the matching Full-Setup ZIP on each Mini PC to update the native internet
monitor too. A website-only update does not replace desktop files. Extract the
whole ZIP, finish active jobs, run `SETUP.bat`, and choose Install / Update.
Do not uninstall first; the setup preserves identity and printer settings.

Backend phone-flow source and separate DigiLocker-service deployment instructions
are in `Smartbuddy1/backend_printingkiosk`, `DEPLOY-rc4.md`. Credentials, provider
permissions, prices and kiosk assignments are unchanged by this release.
