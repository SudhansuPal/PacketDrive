// Lifecycle for the bundled FastAPI backend (uvicorn), spawned as a child
// process of the Electron main process and torn down on quit.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const HOST = "127.0.0.1";
const PORT = 8000;
export const BACKEND_URL = `http://${HOST}:${PORT}`;

let proc: ChildProcess | null = null;

/** Path to the backend virtualenv's python, per platform. */
function pythonPath(backendDir: string): string {
  const win = process.platform === "win32";
  return join(backendDir, ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");
}

/**
 * Launch uvicorn from the backend venv. No-op (with a clear log) when the venv
 * is missing, so the window still opens and the UI shows a disconnected state.
 */
export function startBackend(repoRoot: string): void {
  const backendDir = join(repoRoot, "backend");
  const python = pythonPath(backendDir);

  if (!existsSync(python)) {
    console.error(`[backend] venv python not found at ${python}`);
    console.error(
      "[backend] create it first:\n" +
        "  python3.11 -m venv backend/.venv\n" +
        "  backend/.venv/bin/pip install -r backend/requirements.txt",
    );
    return;
  }

  proc = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", HOST, "--port", String(PORT)],
    {
      cwd: backendDir,
      env: { ...process.env, PD_SIMULATE: process.env.PD_SIMULATE ?? "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  proc.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`));
  proc.on("exit", (code) => {
    console.error(`[backend] process exited (code ${code})`);
    proc = null;
  });
}

export function stopBackend(): void {
  if (proc && !proc.killed) {
    proc.kill();
    proc = null;
  }
}

/** Poll /api/health until it responds 200 or the timeout elapses. */
export function waitForHealth(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const retry = () => {
      if (Date.now() > deadline) resolve(false);
      else setTimeout(probe, 400);
    };
    const probe = () => {
      const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => req.destroy());
    };
    probe();
  });
}
