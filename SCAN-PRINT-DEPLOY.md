# Scan & Print release 1.2.20-rc.3

Pull main and run npm run build:production. Publish the contents of dist/ to the existing printingkiosk web directory. Pulling source alone does not deploy a static website unless it already serves that dist directory.

This adds Scan & Print to the service type selector, four-card layout, per-kiosk assignment, scan preview/payment flow and the latest DigiLocker/customer UI fixes. Update the backend main branch too, so service mode scan is saved correctly. The local Windows rc.3 setup supplies scanner capture; EC2 deliberately refuses hardware capture. Assign the service only to a kiosk with its scanner configured and tested.

Validation: production build/syntax, offline browser checks for scan/preview/payment gate, responsive 4-card layout, cancellation/timeouts, DigiLocker routing, multi-document submission and isolated API service assignment. Real payments/scanners/printers require target acceptance.
