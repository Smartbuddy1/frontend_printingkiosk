const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT_DIR = __dirname;
const HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT || 5173);
const BACKEND_URL = (
  process.env.FRONTEND_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5080"
).replace(/\/+$/, "");

const CLEAN_ROUTES = new Map([
  ["/admin", "/admin.html"],
  ["/admin/super-admin", "/super-admin.html"],
  ["/super-admin", "/super-admin.html"]
]);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".pdf", "application/pdf"]
]);

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function isProxyPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/mobile-upload" ||
    pathname.startsWith("/mobile-upload/") ||
    pathname === "/uploads" ||
    pathname.startsWith("/uploads/")
  );
}

function resolveInsideRoot(requestPathname) {
  let pathname = CLEAN_ROUTES.get(requestPathname) || requestPathname;

  if (pathname === "/") {
    pathname = "/index.html";
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decoded.replace(/^[/\\]+/, "");
  const absolutePath = path.resolve(ROOT_DIR, relativePath);

  if (absolutePath !== ROOT_DIR && !absolutePath.startsWith(ROOT_DIR + path.sep)) {
    return null;
  }

  return absolutePath;
}

async function findStaticFile(pathname) {
  const requestedFile = resolveInsideRoot(pathname);
  if (!requestedFile) {
    return null;
  }

  const candidates = [requestedFile];
  if (!path.extname(requestedFile)) {
    candidates.push(`${requestedFile}.html`);
    candidates.push(path.join(requestedFile, "index.html"));
  }

  for (const candidate of candidates) {
    try {
      const stats = await fsp.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function proxyRequest(req, res, parsedUrl) {
  const target = new URL(`${BACKEND_URL}${parsedUrl.pathname}${parsedUrl.search}`);
  const transport = target.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: target.host };

  delete headers.connection;
  delete headers["proxy-connection"];

  const proxy = transport.request(
    target,
    {
      method: req.method,
      headers
    },
    (backendRes) => {
      const responseHeaders = {
        ...backendRes.headers,
        "cache-control": backendRes.headers["cache-control"] || "no-store"
      };

      res.writeHead(backendRes.statusCode || 502, responseHeaders);
      backendRes.pipe(res);
    }
  );

  proxy.on("error", (error) => {
    sendJson(res, 502, {
      error: "Backend proxy failed",
      backendUrl: BACKEND_URL,
      message: error.message
    });
  });

  req.pipe(proxy);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  const filePath = await findStaticFile(pathname);
  if (!filePath) {
    sendText(res, 404, "Not found");
    return;
  }

  const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath)
    .on("error", (error) => {
      if (!res.headersSent) {
        sendText(res, 500, error.message);
      } else {
        res.destroy(error);
      }
    })
    .pipe(res);
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${HOST}`);

  if (isProxyPath(parsedUrl.pathname)) {
    proxyRequest(req, res, parsedUrl);
    return;
  }

  serveStatic(req, res, parsedUrl.pathname).catch((error) => {
    sendText(res, 500, error.message);
  });
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && port < DEFAULT_PORT + 20) {
      listen(port + 1);
      return;
    }

    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    const origin = `http://localhost:${port}`;
    console.log("Smart Printing Kiosk frontend dev server");
    console.log(`Local:     ${origin}`);
    console.log(`Admin:     ${origin}/admin.html`);
    console.log(`Super:     ${origin}/super-admin.html`);
    console.log(`Kiosk:     ${origin}/index.html?device=mini-pc&kioskId=LOCAL-KIOSK&localAgentUrl=http://localhost:5077`);
    console.log(`Backend:   ${BACKEND_URL}`);
  });
}

listen(DEFAULT_PORT);
