import { contextBridge } from "electron";

// Hardcoded (not imported from backend.ts) so this stays sandbox-safe — the
// preload must not pull in Node-only modules like child_process.
const BACKEND_URL = "http://127.0.0.1:8000";

// Exposed to the renderer as window.packetdrive. The frontend's endpoint
// resolver reads backendUrl to talk to the API/WS directly under file://.
contextBridge.exposeInMainWorld("packetdrive", {
  backendUrl: BACKEND_URL,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
