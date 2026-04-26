import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  clearAuthCookieHeader,
  createAuthCookieHeader,
  getAuthConfig,
  getBridgeProxyTarget,
  isAuthenticatedCookieHeader,
  passwordMatches,
  shouldProxyBridgePath,
} from "./server-lib/gateway.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

const authConfig = getAuthConfig();

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
const bridgeProxyTarget = getBridgeProxyTarget();
const terminalProxyTarget = bridgeProxyTarget.replace(/^http/i, "ws");

function isAuthenticated(request) {
  return isAuthenticatedCookieHeader(request.headers.cookie || "", authConfig);
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

function hasRequestBody(method) {
  return method !== "GET" && method !== "HEAD";
}

function writeUpgradeError(socket, statusCode, message) {
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${message}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
}

async function proxyBridgeRequest(request, response, url) {
  if (!bridgeProxyTarget) {
    sendJson(response, 502, {
      error: "Bridge 代理未配置，请设置 BRIDGE_PROXY_TARGET，或在反向代理上同源转发 /api 和 /health。",
    });
    return;
  }

  const upstreamUrl = new URL(`${url.pathname}${url.search}`, `${bridgeProxyTarget}/`);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasRequestBody(request.method || "GET") ? request : undefined,
    duplex: hasRequestBody(request.method || "GET") ? "half" : undefined,
    redirect: "manual",
  });

  response.writeHead(
    upstreamResponse.status,
    Object.fromEntries(upstreamResponse.headers.entries()),
  );

  if (!upstreamResponse.body) {
    response.end();
    return;
  }

  await new Promise((resolve, reject) => {
    const stream = Readable.fromWeb(upstreamResponse.body);
    stream.on("error", reject);
    response.on("error", reject);
    response.on("finish", resolve);
    stream.pipe(response);
  });
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
        enabled: authConfig.authEnabled,
        authenticated: isAuthenticated(request),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const password = String(body.password || "");

      if (!authConfig.authEnabled) {
        sendJson(response, 200, { enabled: false, authenticated: true });
        return;
      }

      if (!passwordMatches(password, authConfig)) {
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
        {
          "Set-Cookie": createAuthCookieHeader(
            authConfig,
            `http://${request.headers.host || `${host}:${port}`}${url.pathname}`,
            new Headers(request.headers),
          ),
        },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      sendJson(
        response,
        200,
        { enabled: authConfig.authEnabled, authenticated: false },
        {
          "Set-Cookie": clearAuthCookieHeader(
            `http://${request.headers.host || `${host}:${port}`}${url.pathname}`,
            new Headers(request.headers),
          ),
        },
      );
      return;
    }

    if (shouldProxyBridgePath(url.pathname)) {
      if (authConfig.authEnabled && !isAuthenticated(request)) {
        sendJson(response, 401, { error: "未登录" });
        return;
      }

      await proxyBridgeRequest(request, response, url);
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

const terminalProxyServer = new WebSocketServer({ noServer: true });

terminalProxyServer.on("connection", (clientSocket, request) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);

  if (!bridgeProxyTarget) {
    clientSocket.send(
      JSON.stringify({
        type: "error",
        message: "Bridge 终端代理未配置，请设置 BRIDGE_PROXY_TARGET。",
      }),
    );
    clientSocket.close(1011, "Bridge terminal proxy unavailable");
    return;
  }

  const upstreamUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    `${terminalProxyTarget}/`,
  );
  const upstreamSocket = new WebSocket(upstreamUrl);

  const relayToClient = (payload, isBinary = false) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(payload, { binary: isBinary });
    }
  };

  const relayToUpstream = (payload, isBinary = false) => {
    if (upstreamSocket.readyState === WebSocket.OPEN) {
      upstreamSocket.send(payload, { binary: isBinary });
    }
  };

  upstreamSocket.on("message", (payload, isBinary) => {
    relayToClient(payload, isBinary);
  });

  clientSocket.on("message", (payload, isBinary) => {
    relayToUpstream(payload, isBinary);
  });

  upstreamSocket.on("close", (code, reason) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close(code, reason.toString());
    }
  });

  clientSocket.on("close", (code, reason) => {
    if (upstreamSocket.readyState === WebSocket.OPEN) {
      upstreamSocket.close(code, reason);
      return;
    }

    if (upstreamSocket.readyState === WebSocket.CONNECTING) {
      upstreamSocket.terminate();
    }
  });

  upstreamSocket.on("error", (error) => {
    relayToClient(
      JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "terminal proxy error",
      }),
    );
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close(1011, "terminal proxy error");
    }
  });

  clientSocket.on("error", () => {
    if (upstreamSocket.readyState === WebSocket.OPEN) {
      upstreamSocket.close(1011, "client socket error");
      return;
    }

    if (upstreamSocket.readyState === WebSocket.CONNECTING) {
      upstreamSocket.terminate();
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  if (!request.url) {
    socket.destroy();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/terminal") {
    socket.destroy();
    return;
  }

  if (authConfig.authEnabled && !isAuthenticated(request)) {
    writeUpgradeError(socket, 401, "Unauthorized");
    return;
  }

  terminalProxyServer.handleUpgrade(request, socket, head, (clientSocket) => {
    terminalProxyServer.emit("connection", clientSocket, request);
  });
});

server.listen(port, host, () => {
  console.log(
    `C-CLIENT-M preview server listening on http://${host}:${port} (bridge proxy: ${bridgeProxyTarget || "disabled"})`,
  );
});
