"""Packet-flood / DoS detector: flags a source IP exceeding a packet-rate
threshold within a sliding window.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from ..models import Alert, PacketEvent, Severity


class FloodDetector:
    def __init__(self, window_s: float, threshold: int) -> None:
        self._window = window_s
        self._threshold = threshold
        self._seen: dict[str, deque[float]] = defaultdict(deque)

    def inspect(self, pkt: PacketEvent) -> Alert | None:
        if not pkt.src_ip:
            return None
        now = pkt.ts or time.time()
        hits = self._seen[pkt.src_ip]
        hits.append(now)

        cutoff = now - self._window
        while hits and hits[0] < cutoff:
            hits.popleft()

        if len(hits) >= self._threshold:
            count = len(hits)
            hits.clear()
            severity = Severity.CRITICAL if count >= self._threshold * 2 else Severity.HIGH
            rate = count / self._window
            return Alert(
                kind="flood",
                severity=severity,
                source=pkt.src_ip,
                target=pkt.dst_ip,
                count=count,
                message=f"Packet flood: {pkt.src_ip} sent {count} packets (~{rate:.0f}/s)",
            )
        return None
