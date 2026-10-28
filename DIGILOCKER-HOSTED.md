# Build the hosted DigiLocker frontend

Pull the frontend repository's main branch with `git pull --ff-only`. Preserve any
existing local changes; do not use reset --hard. Back up the currently served dist
directory before rebuilding. Use the existing deployment's backend URL, public
frontend URL, local-agent URL and kiosk ID; do not replace a real kiosk ID with a
demo identity. No DigiLocker client secret belongs in frontend configuration.

Enable the hosted UI when building:

```sh
FRONTEND_DIGILOCKER_ENABLED=true \
FRONTEND_BACKEND_URL=https://api.example.com \
FRONTEND_PUBLIC_URL=https://www.example.com/printingkiosk/ \
npm run build
```

Set FRONTEND_LOCAL_AGENT_URL and FRONTEND_KIOSK_ID as in the existing deployment
when applicable. Nginx must serve this build's dist directory. A Git pull alone
does not rebuild the static website. Static assets use relative paths, including
the DigiLocker logo and scripts, for deployment under /printingkiosk/.

The existing pricing, payment and demo-mode decisions are preserved. A real
backend that is awaiting credentials returns DIGILOCKER_NOT_READY, displayed as
an unavailable message; no mock documents or fake OAuth success are generated.

The frontend contains no shared server secret. Keep the companion backend service
disabled until the provider credentials and scope configuration have been approved
and the real flow and printer-agent integration have been validated.
