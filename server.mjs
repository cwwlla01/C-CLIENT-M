import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

const cookieName = "c_client_m_auth";
const authPassword = String(process.env.APP_LOGIN_PASSWORD || "").trim();
const authEnabled = authPassword.length > 0;
const authToken = authEnabled ? createHash("sha256").update(authPassword).digest("hex") : "";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

function parseArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const host = parseArg("--host", process.env.HOST || "127.0.0.1");
const port = Number(parseArg("--port", process.env.PORT || "80"));

function parseCookies(request) {
  const raw = request.headers.cookie || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        const key = index >= 0 ? pair.slice(0, index) : pair;
        const value = index >= 0 ? pair.slice(index + 1) : "";
        return [key, decodeURIComponent(value)];
      }),
  );
}

function isAuthenticated(request) {
  if (!authEnabled) {
    return true;
  }

  const cookies = parseCookies(request);
  const value = cookies[cookieName];
  if (!value) {
    return false;
  }

  const left = Buffer.from(value);
  const right = Buffer.from(authToken);

  return left.length === right.length && timingSafeEqual(left, right);
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createAuthCookie() {
  return `${cookieName}=${encodeURIComponent(authToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

function clearAuthCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function serveStaticFile(filePath, response) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const fileStat = await stat(filePath);

  response.writeHead(200, {
    "Content-Length": fileStat.size,
    "Content-Type": contentType,
  });

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing url" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      sendJson(response, 200, {
        enabled: authEnabled,
        authenticated: isAuthenticated(request),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const password = String(body.password || "");

      if (!authEnabled) {
        sendJson(response, 200, { enabled: false, authenticated: true });
        return;
      }

      const left = Buffer.from(password);
      const right = Buffer.from(authPassword);
      const matched =
        left.length === right.length && timingSafeEqual(left, right);

      if (!matched) {
        sendJson(response, 401, {
          enabled: true,
          authenticated: false,
          error: "密码错误",
        });
        return;
      }

      sendJson(
        response,
        200,
        { enabled: true, authenticated: true },
        { "Set-Cookie": createAuthCookie() },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      sendJson(
        response,
        200,
        { enabled: authEnabled, authenticated: false },
        { "Set-Cookie": clearAuthCookie() },
      );
      return;
    }

    let filePath = path.join(distDir, url.pathname);
    if (url.pathname === "/" || !existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }

    await serveStaticFile(filePath, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`C-CLIENT-M preview server listening on http://${host}:${port}`);
});
