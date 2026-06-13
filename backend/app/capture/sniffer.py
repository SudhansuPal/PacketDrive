
"""Packet capture sources.

Two interchangeable async sources feed the same downstream pipeline:

* :class:`ScapySniffer` — live capture via Scapy (requires elevated privileges).
* :class:`SimulatedSniffer` — synthetic traffic so the platform is fully
  demoable without root or libpcap.

Both expose ``async def stream() -> AsyncIterator[PacketEvent]``.
"""
from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import AsyncIterator

from ..config import Settings
from ..models import PacketEvent, Protocol
from .parser import parse_scapy_packet

logger = logging.getLogger("packetdrive.sniffer")


class SimulatedSniffer:
    """Generates plausible synthetic traffic including occasional attacks."""

    _PROTO_WEIGHTS = {
        Protocol.TCP: 0.30,
        Protocol.HTTPS: 0.28,
        Protocol.DNS: 0.15,
        Protocol.UDP: 0.12,
        Protocol.HTTP: 0.08,
        Protocol.ICMP: 0.04,
        Protocol.ARP: 0.03,
    }
    _PORTS = {
        Protocol.TCP: 22,
        Protocol.HTTPS: 443,
        Protocol.DNS: 53,
        Protocol.UDP: 123,
        Protocol.HTTP: 80,
    }

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._protocols = list(self._PROTO_WEIGHTS)
        self._weights = list(self._PROTO_WEIGHTS.values())

    def _rand_ip(self, *, internal: bool = False) -> str:
        if internal:
            return f"192.168.1.{random.randint(2, 254)}"
        return ".".join(str(random.randint(1, 254)) for _ in range(4))

    def _make_packet(self) -> PacketEvent:
        proto = random.choices(self._protocols, weights=self._weights, k=1)[0]
        dport = self._PORTS.get(proto, random.randint(1, 65535))
        return PacketEvent(
            protocol=proto,
            src_ip=self._rand_ip(),
            dst_ip=self._rand_ip(internal=True),
            src_port=random.randint(1024, 65535),
            dst_port=dport,
            size=random.randint(40, 1500),
            flags="S" if proto in (Protocol.TCP, Protocol.HTTPS) else None,
        )

    async def stream(self) -> AsyncIterator[PacketEvent]:
        pps = max(1, self._settings.simulate_pps)
        interval = 1.0 / pps
        attacker = self._rand_ip()
        target = self._rand_ip(internal=True)
        tick = 0
        while True:
            tick += 1
            # Every ~12s simulate a port scan burst from a single attacker.
            if tick % (pps * 12) < 20:
                yield PacketEvent(
                    protocol=Protocol.TCP,
                    src_ip=attacker,
                    dst_ip=target,
                    src_port=random.randint(1024, 65535),
                    dst_port=random.randint(1, 1024),
                    size=60,
                    flags="S",
                    malicious=True,
                )
            else:
                yield self._make_packet()
            await asyncio.sleep(interval * random.uniform(0.5, 1.5))


class ScapySniffer:
    """Live capture using Scapy's :func:`AsyncSniffer`.

    Scapy is callback-based and runs on its own thread; we bridge those
    callbacks into an asyncio queue consumed by :meth:`stream`.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._queue: asyncio.Queue[PacketEvent] = asyncio.Queue(maxsize=settings.max_queue_size)
        self._loop = asyncio.get_event_loop()
        self._sniffer = None

    def _on_packet(self, pkt) -> None:  # runs on scapy's thread
        event = parse_scapy_packet(pkt)
        if event is None:
            return
        # Hand off to the event loop thread-safely; drop if backpressured.
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, event)
        except asyncio.QueueFull:
            logger.debug("capture queue full, dropping packet")

    async def stream(self) -> AsyncIterator[PacketEvent]:
        from scapy.all import AsyncSniffer  # local import; requires privileges

        self._sniffer = AsyncSniffer(
            iface=self._settings.interface,
            filter=self._settings.bpf_filter,
            prn=self._on_packet,
            store=False,
        )
        self._sniffer.start()
        logger.info("scapy live capture started on iface=%s", self._settings.interface)
        try:
            while True:
                yield await self._queue.get()
        finally:
            if self._sniffer is not None:
                self._sniffer.stop()


def build_sniffer(settings: Settings):
    """Pick a capture source, falling back to simulation when scapy is absent."""
    if settings.simulate:
        logger.info("using SimulatedSniffer (PD_SIMULATE=true)")
        return SimulatedSniffer(settings)
    try:
        import scapy  # noqa: F401
    except Exception:
        logger.warning("scapy unavailable; falling back to SimulatedSniffer")
        return SimulatedSniffer(settings)
    return ScapySniffer(settings)
