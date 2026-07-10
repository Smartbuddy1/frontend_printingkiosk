const fs = require("node:fs");
const path = require("node:path");

const rootDir = __dirname;
const distDir = path.join(rootDir, "dist");
const buildVersion = process.env.FRONTEND_BUILD_VERSION || String(Date.now());
const config = {
  backendUrl: process.env.FRONTEND_BACKEND_URL || process.env.BACKEND_URL || "",
  publicFrontendUrl: process.env.FRONTEND_PUBLIC_URL || process.env.PUBLIC_FRONTEND_URL || process.env.KIOSK_URL || "",
  localAgentUrl: process.env.FRONTEND_LOCAL_AGENT_URL || "",
  kioskId: process.env.FRONTEND_KIOSK_ID || "",
  testHooks: process.env.FRONTEND_TEST_HOOKS === "true"
};

const skip = new Set([
  ".git",
  "dist",
  "node_modules",
  "package.json",
  "package-lock.json",
  "build.js"
]);

function copyFrontend() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  for (const item of fs.readdirSync(rootDir)) {
    if (skip.has(item)) continue;
    fs.cpSync(path.join(rootDir, item), path.join(distDir, item), { recursive: true });
  }
}

function writeConfig() {
  fs.writeFileSync(
    path.join(distDir, "config.js"),
    `window.PRINTING_KIOSK_CONFIG = ${JSON.stringify(config, null, 2)};\n`
  );
}

function addCacheBusters() {
  for (const filename of ["index.html", "admin.html", "super-admin.html"]) {
    const filePath = path.join(distDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const html = fs.readFileSync(filePath, "utf8")
      .replace(/\.\/styles\.css(?:\?v=[^"]*)?/g, `./styles.css?v=${buildVersion}`)
      .replace(/\.\/responsive\.css(?:\?v=[^"]*)?/g, `./responsive.css?v=${buildVersion}`)
      .replace(/\.\/config\.js(?:\?v=[^"]*)?/g, `./config.js?v=${buildVersion}`)
      .replace(/\.\/ui-icons\.js(?:\?v=[^"]*)?/g, `./ui-icons.js?v=${buildVersion}`)
      .replace(/\.\/app\.js(?:\?v=[^"]*)?/g, `./app.js?v=${buildVersion}`)
      .replace(/\.\/super-admin\.js(?:\?v=[^"]*)?/g, `./super-admin.js?v=${buildVersion}`);

    fs.writeFileSync(filePath, html);
  }
}

copyFrontend();
writeConfig();
addCacheBusters();

console.log(`Built frontend to ${distDir}`);
console.log(`Backend URL: ${config.backendUrl || "(empty; Vercel rewrites will proxy /api)"}`);
console.log(`Build version: ${buildVersion}`);
