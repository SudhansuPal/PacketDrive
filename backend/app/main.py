"""PacketDrive FastAPI application.

Exposes:
* ``GET  /api/health``  — liveness + capture-mode info
* ``GET  /api/config``  — protocol→vehicle mapping metadata for the frontend
* ``WS   /ws``          — real-time stream of packet / alert / stats frames
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .capture.sniffer import build_sniffer
from .config import get_settings
from .models import Protocol
from .streaming.broadcaster import Pipeline
from .streaming.manager import ConnectionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("packetdrive")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    manager = ConnectionManager()
    sniffer = build_sniffer(settings)
    pipeline = Pipeline(settings, manager, sniffer)

    app.state.settings = settings
    app.state.manager = manager
    app.state.pipeline = pipeline

    await pipeline.start()
    try:
        yield
    finally:
        await pipeline.stop()


app = FastAPI(title="PacketDrive", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    settings = app.state.settings
    return {
        "status": "ok",
        "mode": "simulate" if settings.simulate else "live",
        "clients": app.state.manager.client_count,
    }


@app.get("/api/config")
async def config() -> dict:
    """Protocol catalogue so the frontend can stay in sync with the backend."""
    return {"protocols": [p.value for p in Protocol]}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    manager: ConnectionManager = app.state.manager
    await manager.connect(ws)
    try:
        # The server is push-only; we read to detect disconnects.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws)
