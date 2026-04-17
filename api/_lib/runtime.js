import {
  getAuthConfig,
  isAuthenticatedCookieHeader,
  jsonResponse,
  proxyBridgeRequest,
} from "../../server-lib/gateway.mjs";

export function methodNotAllowed(allowedMethods) {
  return jsonResponse(
    405,
    { error: "Method not allowed" },
    { Allow: allowedMethods.join(", ") },
  );
}

export function requireAuth(request) {
  const authConfig = getAuthConfig();

  if (
    authConfig.authEnabled &&
    !isAuthenticatedCookieHeader(request.headers.get("cookie") || "", authConfig)
  ) {
    return {
      authConfig,
      response: jsonResponse(401, { error: "未登录" }),
    };
  }

  return {
    authConfig,
    response: null,
  };
}

export async function proxyBridgeHandler(request, overridePathname = null) {
  const auth = requireAuth(request);
  if (auth.response) {
    return auth.response;
  }

  return proxyBridgeRequest(request, process.env, overridePathname);
}
