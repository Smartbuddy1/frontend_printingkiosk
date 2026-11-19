'use strict';
Object.assign(process.env, {
 FRONTEND_BACKEND_URL:'https://api.theaaryatechnologies.com',
 FRONTEND_PUBLIC_URL:'https://aaryainnovtech.com/printingkiosk/',
 FRONTEND_DIGILOCKER_ENABLED:'true', FRONTEND_TEST_HOOKS:'false',
 FRONTEND_BUILD_VERSION:'1.2.20-rc.7', FRONTEND_LOCAL_AGENT_URL:'', FRONTEND_KIOSK_ID:''
});
require('./build.js');
