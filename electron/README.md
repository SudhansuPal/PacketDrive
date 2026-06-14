# PacketDrive Desktop (Electron)

Desktop shell that runs the Python backend and serves the React frontend in a
single window.

## Architecture

```
Electron main process (src/main.ts)
 ├─ spawns  backend/.venv → uvicorn app.main:app   (127.0.0.1:8000)
 ├─ waits   GET /api/health
 └─ opens   BrowserWindow
              ├─ dev  → http://localhost:5173  (Vite dev server, HMR)
              └─ prod → frontend/dist/index.html (file://)

preload (src/preload.ts) → window.packetdrive.backendUrl = http://127.0.0.1:8000
                            so the renderer reaches the API/WS directly under file://
```

The renderer runs with `contextIsolation` on, `nodeIntegration` off, and
`sandbox` on. The only main↔renderer surface is the `window.packetdrive`
bridge defined in the preload.

## Prerequisites

The backend venv must exist (the main process spawns it):

```bash
python3.11 -m venv ../backend/.venv
../backend/.venv/bin/pip install -r ../backend/requirements.txt
```

## Develop

```bash
npm install
npm run dev      # starts Vite + compiles main + launches Electron at :5173
```

## Run the production bundle locally

```bash
npm run start    # builds the frontend + main, then loads dist over file://
```

## Not yet wired up

Packaging into a distributable (`.dmg`/`.exe`) needs the Python backend frozen
with PyInstaller (or similar) and an electron-builder config — the current
scaffold assumes a local `backend/.venv`.
