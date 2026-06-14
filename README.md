# PacketDrive

**See your network traffic as a highway.** PacketDrive captures (or simulates)
live network packets, runs them through a threat-detection engine, and renders
each packet as a vehicle driving down a lane on an animated highway — one lane
per protocol, malicious packets glowing red. A live dashboard shows throughput,
per-protocol breakdown, and a feed of detected threats.

> ⚠️ **Educational project.** PacketDrive is built to *teach* how network
> traffic, packet capture, and intrusion detection work — by making them
> visible and tangible. It is not a production security product. See
> [Responsible use](#responsible-use).

---

## Why this project exists

Network traffic is invisible. Concepts like "a port scan," "a SYN flood," or
"DNS vs HTTPS volume" are abstract until you can *watch* them happen.
PacketDrive turns the firehose of packets into a scene you can read at a glance,
so the learning is intuitive rather than theoretical.

Building it also walks through a realistic, layered system end to end:

| Concept | Where you see it in the code |
|---|---|
| Packet capture (live vs. synthetic) | `backend/app/capture/` |
| Parsing raw packets into structured events | `backend/app/capture/parser.py` |
| Intrusion detection (port scan, flood) | `backend/app/detection/` |
| Rolling traffic statistics | `backend/app/stats/aggregator.py` |
| Real-time streaming over WebSockets | `backend/app/streaming/` |
| Back-pressure & batching under load | `backend/app/streaming/broadcaster.py` |
| Canvas animation & state in a UI | `frontend/src/engine/highway.ts` |
| Wrapping a web app as a desktop app | `electron/` |

If you want to learn how the pieces fit together — async Python, FastAPI,
WebSockets, React + TypeScript, canvas rendering, and Electron — this is a
small but complete example of each.

---

## How it works

```
            ┌─────────────────────────── backend (FastAPI, async) ───────────────────────────┐
            │                                                                                 │
  packets   │  capture/         detection/        stats/            streaming/                │
  ───────▶  │  Sniffer  ──────▶ DetectionEngine ─▶ StatsAggregator ─▶ Pipeline ──▶ WebSocket  │ ──┐
 (live or   │  (live or          port scan +        rolling pps/bps    batches packets,       │   │
 simulated) │   simulated)       flood detectors    + protocol mix     immediate alerts,      │   │
            │                                                          periodic stats         │   │
            └─────────────────────────────────────────────────────────────────────────────────┘   │
                                                                                                    │ /ws
            ┌─────────────────────────── frontend (React + Vite) ────────────────────────────┐      │
            │                                                                                 │ ◀────┘
            │  useLiveFeed  ──▶  Highway canvas   (packets → vehicles, 1 lane per protocol)   │
            │  (WebSocket)  ──▶  Stats HUD        (pps, throughput, density, protocol bars)   │
            │               ──▶  Threat feed      (alerts, coloured by severity)              │
            └─────────────────────────────────────────────────────────────────────────────────┘

            ┌─────────────────────────── electron (desktop shell) ───────────────────────────┐
            │  Spawns the backend, waits for health, then opens the frontend in a window.     │
            └─────────────────────────────────────────────────────────────────────────────────┘
```

### The capture layer — live or simulated

Two interchangeable sources feed the exact same pipeline:

- **`SimulatedSniffer`** (default) generates plausible synthetic traffic —
  including a periodic port-scan burst — so you can run the whole app with **no
  root, no libpcap, no setup**.
- **`ScapySniffer`** does real live capture via [Scapy](https://scapy.net/).
  If Scapy (or the privileges it needs) isn't available, the backend
  automatically falls back to simulation.

### The detection layer

Each packet is inspected by detectors behind a `DetectionEngine`:

- **Port scan** — one source probing many distinct destination ports in a short
  window (default: 15 ports in 5 s).
- **Flood** — one source sending a high volume of packets in a short window
  (default: 200 packets in 2 s).

When a detector fires, the offending packet is tagged `malicious` (it turns into
a glowing red vehicle) and an **Alert** is pushed to the threat feed. A
per-source cooldown prevents alert spam.

### The streaming layer

The backend sends three kinds of frames over a single WebSocket (`/ws`):

| Frame | Cadence | Purpose |
|---|---|---|
| `packets` | ~every 50 ms | A **batch** of packets → vehicles. Batching keeps the socket efficient under hundreds of packets/sec. |
| `alert` | immediately | Latency-sensitive threats, sent out-of-band. |
| `stats` | ~every 1 s | Rolling pps/bps, protocol histogram, scene density. |

### The visualization

Each packet becomes a vehicle. The **protocol** decides the lane and the vehicle
shape/colour; the **packet size** scales the vehicle; **malicious** packets glow
red. Heavier traffic = a busier highway. The `density` value (0–1) reflects how
loaded the network is.

| Protocol | Lane | Vehicle |
|---|---|---|
| HTTPS / HTTP | top | SUV / hatchback |
| TCP / UDP | middle | sedan / pickup |
| DNS | — | van |
| ICMP / ARP / OTHER | bottom | bike / scooter / generic |

---

## Getting started (user instructions)

### Prerequisites

- **Python 3.11** (the backend is pinned to 3.11 — newer versions may lack
  prebuilt wheels for some deps)
- **Node.js 18+** and npm
- macOS, Linux, or Windows

### 1. Set up the backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Pick how you want to run it

PacketDrive can run three ways. **All three default to simulated traffic**, so
you can start learning immediately with zero risk.

<details open>
<summary><b>Option A — Desktop app (easiest, recommended)</b></summary>

The Electron shell starts the backend for you and opens everything in one window.

```bash
cd electron
npm install
npm run dev        # development, with hot-reload
# or
npm run start      # production-style build in a window
```
</details>

<details>
<summary><b>Option B — In your browser (good for frontend work)</b></summary>

Run the backend and the Vite dev server in two terminals:

```bash
# terminal 1 — backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload

# terminal 2 — frontend
cd frontend && npm install && npm run dev
```

Then open **http://localhost:5173**. Vite proxies `/api` and `/ws` to the
backend on port 8000.
</details>

<details>
<summary><b>Option C — Backend only (for API / data exploration)</b></summary>

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload
```

- Health:  http://127.0.0.1:8000/api/health
- Config:  http://127.0.0.1:8000/api/config
- Stream:  `ws://127.0.0.1:8000/ws`  (connect with any WebSocket client)
</details>

### 3. (Optional) Try live capture

By default PacketDrive simulates traffic. To capture **real** packets:

```bash
pip install scapy
sudo PD_SIMULATE=false PD_INTERFACE=en0 uvicorn app.main:app
```

Live capture needs elevated privileges and a network interface name
(`en0`, `eth0`, …). **Only do this on a network you own or are authorised to
monitor** — see [Responsible use](#responsible-use).

---

## Configuration

The backend reads `PD_`-prefixed environment variables (or a `backend/.env`
file). Common ones:

| Variable | Default | Meaning |
|---|---|---|
| `PD_SIMULATE` | `true` | Use synthetic traffic instead of live capture |
| `PD_SIMULATE_PPS` | `40` | Synthetic packets per second |
| `PD_INTERFACE` | _(auto)_ | Network interface for live capture, e.g. `en0` |
| `PD_BPF_FILTER` | _(none)_ | Berkeley Packet Filter expression for live capture |
| `PD_PORT` | `8000` | Backend port |
| `PD_BROADCAST_INTERVAL_MS` | `50` | How often batched packets are flushed |
| `PD_STATS_INTERVAL_MS` | `1000` | How often stats are emitted |
| `PD_PORT_SCAN_THRESHOLD` | `15` | Distinct ports from one source to flag a scan |
| `PD_FLOOD_THRESHOLD` | `200` | Packets from one source to flag a flood |
| `PD_CORS_ORIGINS` | `["*"]` | Allowed origins (wildcard lets the desktop shell connect) |

The frontend can override the backend location with `VITE_BACKEND_URL`; in the
desktop app this is injected automatically.

---

## Project structure

```
PacketDrive/
├── backend/          FastAPI app — capture, detection, stats, streaming
│   ├── app/
│   │   ├── capture/      live (scapy) + simulated sniffers, parser, replay
│   │   ├── detection/    port-scan & flood detectors + engine
│   │   ├── stats/        rolling traffic aggregator
│   │   ├── streaming/    WebSocket connection manager + batching pipeline
│   │   ├── models.py     shared event schemas (mirrored in the frontend)
│   │   ├── config.py     PD_* settings
│   │   └── main.py       FastAPI app + routes + /ws
│   └── requirements.txt
├── frontend/         React + TypeScript + Vite UI
│   └── src/
│       ├── engine/highway.ts    canvas render loop (the "highway")
│       ├── components/           Highway, StatsHud, AlertsFeed, ConnectionBadge
│       ├── hooks/useLiveFeed.ts  WebSocket client with auto-reconnect
│       ├── lib/                  protocol→vehicle map, endpoints, formatting
│       └── types/packet.ts       mirror of the backend event schemas
└── electron/         Desktop shell (see electron/README.md)
```

---

## Responsible use

PacketDrive can capture real network traffic, which may include other people's
data. Use it responsibly:

- **Only capture traffic on networks and devices you own or are explicitly
  authorised to monitor.** Intercepting others' traffic without permission is
  illegal in many jurisdictions.
- The **simulated mode is the default** and is completely safe — it touches no
  real network traffic. Use it for learning, demos, and development.
- This is a teaching tool, not an audited security product. Don't rely on it to
  protect a real network.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, and share,
with no warranty.
