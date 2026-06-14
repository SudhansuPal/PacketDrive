import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

// The backend runs on :8000. In dev we proxy both the REST API and the
// WebSocket so the app can use same-origin relative URLs ("/api", "/ws")
// and we sidestep CORS entirely. Override the target with VITE_BACKEND.
const backend = process.env.VITE_BACKEND ?? "http://127.0.0.1:8000";

// The client side of a proxied request — either an HTTP response or a raw
// socket (for WebSocket upgrades). We only touch the bits common to both.
type ClientSide = {
  writeHead?: (status: number, headers?: Record<string, string>) => void;
  headersSent?: boolean;
  end?: (chunk?: string) => void;
  destroy?: () => void;
};

// Replace Vite's noisy ECONNREFUSED stack trace with a one-line hint when the
// backend isn't running. Shared by the /api and /ws proxies and throttled, so
// the app's health-poll + socket-retry loop doesn't spam the console.
let lastWarn = 0;
const handleProxyError = (err: Error, _req: unknown, resOrSocket: unknown) => {
  if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
    const now = Date.now();
    if (now - lastWarn > 10_000) {
      lastWarn = now;
      console.warn(
        `\n⚠  PacketDrive backend is not running on ${backend}.\n` +
          `   Start it:  cd backend && .venv/bin/uvicorn app.main:app --reload\n` +
          `   Or the desktop app (starts both):  cd electron && npm run dev\n`,
      );
    }
  } else {
    console.warn(`[proxy] ${err.message}`);
  }
  // Close the client side so fetch()/WebSocket reject promptly instead of
  // hanging until timeout.
  const client = resOrSocket as ClientSide;
  if (typeof client.writeHead === "function") {
    if (!client.headersSent) {
      client.writeHead(502, { "Content-Type": "text/plain" });
    }
    client.end?.("PacketDrive backend unavailable");
  } else {
    client.destroy?.();
  }
};

const friendlyProxy: ProxyOptions["configure"] = (proxy) => {
  // Vite attaches its own stack-trace logger AFTER calling configure, so we
  // add ours now (immediate coverage) and on the next tick strip everything
  // and re-add only ours — leaving Vite's logger gone.
  proxy.on("error", handleProxyError);
  setImmediate(() => {
    proxy.removeAllListeners("error");
    proxy.on("error", handleProxyError);
  });
};

export default defineConfig({
  // Relative asset URLs so the production build loads over file:// in the
  // Electron shell (absolute "/assets/..." would resolve to the FS root there).
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true, configure: friendlyProxy },
      "/ws": { target: backend, ws: true, changeOrigin: true, configure: friendlyProxy },
    },
  },
});
