import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend runs on :8000. In dev we proxy both the REST API and the
// WebSocket so the app can use same-origin relative URLs ("/api", "/ws")
// and we sidestep CORS entirely. Override the target with VITE_BACKEND.
const backend = process.env.VITE_BACKEND ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/ws": { target: backend, ws: true, changeOrigin: true },
    },
  },
});
