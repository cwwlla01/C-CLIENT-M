import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function createBridgeProxy(target: string) {
  return {
    "/health": {
      target,
      changeOrigin: true,
    },
    "/api/settings": {
      target,
      changeOrigin: true,
    },
    "/api/workspace": {
      target,
      changeOrigin: true,
    },
    "/api/runtime": {
      target,
      changeOrigin: true,
    },
    "/api/employee": {
      target,
      changeOrigin: true,
    },
    "/api/task": {
      target,
      changeOrigin: true,
    },
    "/terminal": {
      target: target.replace(/^http/i, "ws"),
      changeOrigin: true,
      ws: true,
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bridgeTarget = (env.VITE_BRIDGE_HTTP_ORIGIN || "http://127.0.0.1:4285").replace(/\/+$/, "");

  return {
    plugins: [react()],
    server: {
      proxy: createBridgeProxy(bridgeTarget),
    },
  };
});
