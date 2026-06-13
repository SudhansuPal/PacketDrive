"""PCAP replay source — reads packets from a capture file and emits them with
optional time-scaled pacing. Shares the same ``stream()`` contract as the live
and simulated sniffers, so it plugs into the pipeline unchanged.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from ..models import PacketEvent
from .parser import parse_scapy_packet

logger = logging.getLogger("packetdrive.replay")


class PcapReplaySource:
    def __init__(self, path: str, speed: float = 1.0, loop: bool = False) -> None:
        self._path = path
        self._speed = max(0.0, speed)
        self._loop = loop

    async def stream(self) -> AsyncIterator[PacketEvent]:
        from scapy.utils import PcapReader

        while True:
            last_ts: float | None = None
            with PcapReader(self._path) as reader:
                for pkt in reader:
                    event = parse_scapy_packet(pkt)
                    if event is None:
                        continue
                    # Preserve inter-packet timing, scaled by ``speed``.
                    pkt_time = float(getattr(pkt, "time", 0.0))
                    if self._speed > 0 and last_ts is not None:
                        delay = (pkt_time - last_ts) / self._speed
                        if delay > 0:
                            await asyncio.sleep(min(delay, 1.0))
                    last_ts = pkt_time
                    yield event
            if not self._loop:
                break
            logger.info("pcap replay looping: %s", self._path)
