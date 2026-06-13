"""Port-scan detector: flags a source IP that contacts many distinct
destination ports within a sliding time window.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from ..models import Alert, PacketEvent, Severity


class PortScanDetector:
    def __init__(self, window_s: float, threshold: int) -> None:
        self._window = window_s
        self._threshold = threshold
        # src_ip -> deque[(ts, dst_port)]
        self._seen: dict[str, deque[tuple[float, int]]] = defaultdict(deque)

    def inspect(self, pkt: PacketEvent) -> Alert | None:
        if pkt.dst_port is None or not pkt.src_ip:
            return None
        now = pkt.ts or time.time()
        hits = self._seen[pkt.src_ip]
        hits.append((now, pkt.dst_port))

        cutoff = now - self._window
        while hits and hits[0][0] < cutoff:
            hits.popleft()

        distinct_ports = {port for _, port in hits}
        if len(distinct_ports) >= self._threshold:
            count = len(distinct_ports)
            hits.clear()  # reset so we don't re-fire every packet
            severity = Severity.CRITICAL if count >= self._threshold * 2 else Severity.HIGH
            return Alert(
                kind="port_scan",
                severity=severity,
                source=pkt.src_ip,
                target=pkt.dst_ip,
                count=count,
                message=f"Port scan: {pkt.src_ip} probed {count} ports on {pkt.dst_ip}",
            )
        return None
