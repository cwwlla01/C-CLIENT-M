import { createHash, timingSafeEqual } from "node:crypto";

const AUTH_COOKIE_NAME = "c_client_m_auth";

export function getAuthConfig(env = process.env) {
  const authPassword = String(env.APP_LOGIN_PASSWORD || "").trim();
  const authEnabled = authPassword.length > 0;
  const authToken = authEnabled ? createHash("sha256").update(authPassword).digest("hex") : "";

  return {
    authEnabled,
    authPassword,
    authToken,
  };
}

export function getBridgeProxyTarget(env = process.env) {
  return String(env.BRIDGE_PROXY_TARGET || env.VITE_BRIDGE_HTTP_ORIGIN || "")
    .trim()
    .replace(/\/+$/, "");
}

export function shouldProxyBridgePath(pathname) {
  return pathname === "/health" || (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/"));
}

export function parseCookieHeader(rawCookieHeader = "") {
  return Object.fromEntries(
    rawCookieHeader
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

export function isAuthenticatedCookieHeader(rawCookieHeader = "", authConfig = getAuthConfig()) {
  if (!authConfig.authEnabled) {
    return true;
  }

  const cookies = parseCookieHeader(rawCookieHeader);
  const value = cookies[AUTH_COOKIE_NAME];
  if (!value) {
    return false;
  }

  const left = Buffer.from(value);
  const right = Buffer.from(authConfig.authToken);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function passwordMatches(password, authConfig = getAuthConfig()) {
  const left = Buffer.from(String(password || ""));
  const right = Buffer.from(authConfig.authPassword);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSecureRequest(requestUrl = "", requestHeaders = new Headers()) {
  const protoHeader =
    requestHeaders.get?.("x-forwarded-proto") ||
    requestHeaders.get?.("X-Forwarded-Proto") ||
    "";

  if (protoHeader.toLowerCase().split(",").map((item) => item.trim()).includes("https")) {
    return true;
  }

  if (!requestUrl) {
    return false;
  }

  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function createAuthCookieHeader(
  authConfig = getAuthConfig(),
  requestUrl = "",
  requestHeaders = new Headers(),
) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(authConfig.authToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];

  if (isSecureRequest(requestUrl, requestHeaders)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearAuthCookieHeader(requestUrl = "", requestHeaders = new Headers()) {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isSecureRequest(requestUrl, requestHeaders)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function jsonResponse(status, payload, headers = {}) {
  return new Response(`${JSON.stringify(payload)}\n`, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export async function readJsonRequest(request) {
  const text = await request.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function hasRequestBody(method = "GET") {
  return method !== "GET" && method !== "HEAD";
}

export async function proxyBridgeRequest(request, env = process.env, overridePathname = null) {
  const target = getBridgeProxyTarget(env);
  if (!target) {
    return jsonResponse(502, {
      error:
        "Bridge 代理未配置，请设置 BRIDGE_PROXY_TARGET，或在入口网关上同源转发 /api 和 /health。",
    });
  }

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(
    overridePathname ?? `${sourceUrl.pathname}${sourceUrl.search}`,
    `${target}/`,
  );
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");

  return fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasRequestBody(request.method) ? request.body : undefined,
    duplex: hasRequestBody(request.method) ? "half" : undefined,
    redirect: "manual",
    signal: request.signal,
  });
}
