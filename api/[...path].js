import { proxyBridgeHandler } from "./_lib/runtime.js";

export default async function handler(request) {
  return proxyBridgeHandler(request);
}
