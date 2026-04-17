import {
  clearAuthCookieHeader,
  getAuthConfig,
  jsonResponse,
} from "../../server-lib/gateway.mjs";
import { methodNotAllowed } from "../_lib/runtime.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const authConfig = getAuthConfig();

  return jsonResponse(
    200,
    { enabled: authConfig.authEnabled, authenticated: false },
    {
      "Set-Cookie": clearAuthCookieHeader(request.url, request.headers),
    },
  );
}
