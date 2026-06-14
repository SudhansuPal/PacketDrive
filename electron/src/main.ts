import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { startBackend, stopBackend, waitForHealth } from "./backend";

// electron/dist/main.js → repo root is two levels up.
const repoRoot = join(__dirname, "..", "..");
// Set by the dev script; absent in a packaged/prod run.
const devUrl = process.env.ELECTRON_RENDERER_URL;

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#070b14",
    title: "PacketDrive",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Open external links in the user's browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (devUrl) {
    await win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(repoRoot, "frontend", "dist", "index.html"));
  }
}

// Single-instance: focus the existing window instead of spawning another.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    startBackend(repoRoot);
    await waitForHealth(); // best-effort; the window opens even if it times out
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);
app.on("will-quit", stopBackend);
