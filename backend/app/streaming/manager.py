"""WebSocket connection manager and event broadcaster.

The capture pipeline pushes events into an asyncio queue; a single broadcaster
task batches packet events and fans them out to every connected client. This
decouples capture speed from client count and keeps per-client work minimal.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("packetdrive.streaming")


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        logger.info("client connected (%d total)", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        logger.info("client disconnected (%d total)", len(self._clients))

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a JSON message to all clients, pruning any that fail."""
        if not self._clients:
            return
        dead: list[WebSocket] = []
        # Snapshot to avoid mutation during iteration.
        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)
            logger.info("pruned %d dead client(s)", len(dead))
