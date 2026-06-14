// Resolves where the backend lives across the app's three runtime contexts:
//
//   1. browser dev    — served by Vite; base is "" so /api and /ws use the
//                        same origin and Vite's dev proxy forwards them to :8000
//   2. electron dev    — preload injects window.packetdrive.backendUrl
//   3. electron prod    — UI loads over file://; same injected absolute URL
//
// A build-time VITE_BACKEND_URL is also honoured as an escape hatch.

declare global {
  interface Window {
    packetdrive?: {
      backendUrl?: string;
      versions?: Record<string, string>;
    };
  }
}

const BACKEND_BASE: string =
  window.packetdrive?.backendUrl ??
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  ""; // empty string === same-origin

export const backendBase = BACKEND_BASE;

/** Absolute (or same-origin) URL for a REST path like "/api/health". */
export function apiUrl(path: string): string {
  return `${BACKEND_BASE}${path}`;
}

/** ws:// URL for the live feed, derived from the backend base. */
export function wsUrl(): string {
  if (BACKEND_BASE) {
    return `${BACKEND_BASE.replace(/^http/, "ws")}/ws`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}
