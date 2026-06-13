"""The capture → detect → aggregate → stream pipeline.

A single long-lived task drives the whole pipeline:

    sniffer.stream() -> DetectionEngine -> StatsAggregator -> outbound queue

Packet events are batched and flushed on a timer to keep the WebSocket
efficient under hundreds of packets per second; stats are emitted on their own
slower cadence. The batched ``packets`` frame lets the frontend spawn many
vehicles per render tick.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from ..config import Settings
from ..detection.engine import DetectionEngine
from ..stats.aggregator import StatsAggregator
from .manager import ConnectionManager

logger = logging.getLogger("packetdrive.pipeline")


class Pipeline:
    def __init__(self, settings: Settings, manager: ConnectionManager, sniffer) -> None:
        self._settings = settings
        self._manager = manager
        self._sniffer = sniffer
        self._engine = DetectionEngine(settings)
        self._stats = StatsAggregator(settings)
        self._batch: list[dict] = []
        self._tasks: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._tasks = [
            asyncio.create_task(self._capture_loop(), name="pd-capture"),
            asyncio.create_task(self._flush_loop(), name="pd-flush"),
            asyncio.create_task(self._stats_loop(), name="pd-stats"),
        ]
        logger.info("pipeline started")

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks.clear()
        logger.info("pipeline stopped")

    async def _capture_loop(self) -> None:
        async for pkt in self._sniffer.stream():
            self._stats.record_packet(pkt)
            for alert in self._engine.process(pkt):
                self._stats.record_alert()
                # Alerts are latency-sensitive — send immediately.
                await self._manager.broadcast(alert.model_dump(mode="json"))
            self._batch.append(pkt.model_dump(mode="json"))
            # Guard against unbounded growth if flushing falls behind.
            if len(self._batch) > self._settings.max_queue_size:
                self._batch = self._batch[-self._settings.max_queue_size :]

    async def _flush_loop(self) -> None:
        interval = self._settings.broadcast_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            if not self._batch:
                continue
            frame = {"type": "packets", "ts": time.time(), "items": self._batch}
            self._batch = []
            await self._manager.broadcast(frame)

    async def _stats_loop(self) -> None:
        interval = self._settings.stats_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            snapshot = self._stats.snapshot()
            await self._manager.broadcast(snapshot.model_dump(mode="json"))
