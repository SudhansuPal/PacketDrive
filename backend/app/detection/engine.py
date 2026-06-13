"""Detection orchestrator.

Runs each packet through the registered detectors, applies per-source/kind
cooldown to suppress alert spam, and tags the originating packet as malicious
when an alert fires. Designed to be extended with future detectors (e.g. an AI
anomaly model) by appending to ``self._detectors``.
"""
from __future__ import annotations

from collections.abc import Iterable

from ..config import Settings
from ..models import Alert, PacketEvent
from .flood import FloodDetector
from .port_scan import PortScanDetector


class DetectionEngine:
    def __init__(self, settings: Settings) -> None:
        self._cooldown = settings.alert_cooldown_s
        self._last_alert: dict[tuple[str, str], float] = {}
        self._detectors = [
            PortScanDetector(settings.port_scan_window_s, settings.port_scan_threshold),
            FloodDetector(settings.flood_window_s, settings.flood_threshold),
        ]

    def process(self, pkt: PacketEvent) -> Iterable[Alert]:
        """Inspect a packet; yield any (cooldown-filtered) alerts.

        Mutates ``pkt.malicious`` in place when an alert is raised so the
        offending packet is rendered as a glowing red vehicle.
        """
        alerts: list[Alert] = []
        for detector in self._detectors:
            alert = detector.inspect(pkt)
            if alert is None:
                continue
            key = (alert.source, alert.kind)
            if alert.ts - self._last_alert.get(key, 0.0) < self._cooldown:
                continue
            self._last_alert[key] = alert.ts
            pkt.malicious = True
            alerts.append(alert)
        return alerts
