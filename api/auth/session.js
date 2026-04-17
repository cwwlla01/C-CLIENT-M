import {
  getAuthConfig,
  isAuthenticatedCookieHeader,
  jsonResponse,
} from "../../server-lib/gateway.mjs";
import { methodNotAllowed } from "../_lib/runtime.js";

export default async function handler(request) {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const authConfig = getAuthConfig();

  return jsonResponse(200, {
    enabled: authConfig.authEnabled,
    authenticated: isAuthenticatedCookieHeader(request.headers.get("cookie") || "", authConfig),
  });
}
