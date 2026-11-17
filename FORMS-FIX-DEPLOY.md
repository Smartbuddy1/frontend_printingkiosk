# Kiosk forms update

Kiosk-wise service Edit and Remove now target only the selected kiosk. Editors
keep the configuration version from when they opened, so stale saves are refused.
Empty service/form lists and removed-kiosk exclusions are honored in the UI.

Deploy with the matching backend forms fix. On the website checkout:

```sh
git pull --ff-only origin main
npm run build:production
```

Publish the contents of dist/ to the existing printingkiosk website directory if
it is not already served directly from dist/. Preserve the prior static build.
Hard-refresh Super Admin after publication. The build identifier is
`1.2.20-forms.1`; index.html must reference that identifier for app.js.

Do not resave forms from an old open editor. A 409/428 message means reload the
new frontend and open the editor again. Kiosk Admin service setup remains read-only.

This is a website source update, not a new Mini-PC installer. Existing release
ZIPs and installed desktop executables are unchanged.
