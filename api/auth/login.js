import {
  createAuthCookieHeader,
  getAuthConfig,
  jsonResponse,
  passwordMatches,
  readJsonRequest,
} from "../../server-lib/gateway.mjs";
import { methodNotAllowed } from "../_lib/runtime.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const authConfig = getAuthConfig();

  if (!authConfig.authEnabled) {
    return jsonResponse(200, { enabled: false, authenticated: true });
  }

  const body = await readJsonRequest(request);
  const password = String(body.password || "");

  if (!passwordMatches(password, authConfig)) {
    return jsonResponse(401, {
      enabled: true,
      authenticated: false,
      error: "密码错误",
    });
  }

  return jsonResponse(
    200,
    { enabled: true, authenticated: true },
    {
      "Set-Cookie": createAuthCookieHeader(authConfig, request.url, request.headers),
    },
  );
}
