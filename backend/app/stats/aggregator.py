"""Rolling traffic-statistics aggregator for the HUD/dashboard."""
from __future__ import annotations

import time
from collections import deque

from ..config import Settings
from ..models import PacketEvent, Stats


class StatsAggregator:
    def __init__(self, settings: Settings) -> None:
        self._window = settings.stats_window_s
        self._events: deque[tuple[float, int]] = deque()  # (ts, size)
        self._total_packets = 0
        self._total_bytes = 0
        self._protocols: dict[str, int] = {}
        self._active_alerts = 0
        # Heuristic ceiling for normalizing density to 0..1.
        self._density_ceiling = max(1.0, settings.flood_threshold / settings.flood_window_s)

    def record_packet(self, pkt: PacketEvent) -> None:
        now = pkt.ts or time.time()
        self._events.append((now, pkt.size))
        self._total_packets += 1
        self._total_bytes += pkt.size
        self._protocols[pkt.protocol.value] = self._protocols.get(pkt.protocol.value, 0) + 1

    def record_alert(self) -> None:
        self._active_alerts += 1

    def _trim(self, now: float) -> None:
        cutoff = now - self._window
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def snapshot(self) -> Stats:
        now = time.time()
        self._trim(now)
        window_packets = len(self._events)
        window_bytes = sum(size for _, size in self._events)
        pps = window_packets / self._window
        bps = window_bytes / self._window
        density = min(1.0, pps / self._density_ceiling)
        return Stats(
            total_packets=self._total_packets,
            total_bytes=self._total_bytes,
            pps=round(pps, 2),
            bps=round(bps, 2),
            protocols=dict(self._protocols),
            active_alerts=self._active_alerts,
            density=round(density, 3),
        )
