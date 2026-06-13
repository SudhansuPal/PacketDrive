"""Translate raw Scapy packets into :class:`PacketEvent` metadata.

Isolated from the sniffer so it can be unit-tested without live capture and
reused by the PCAP replay path.
"""
from __future__ import annotations

from typing import Any

from ..models import PacketEvent, Protocol

# Well-known ports used to refine protocol classification beyond L4.
_HTTPS_PORTS = {443, 8443}
_HTTP_PORTS = {80, 8080, 8000}
_DNS_PORTS = {53, 5353}


def _classify(l4: str, sport: int | None, dport: int | None) -> Protocol:
    ports = {p for p in (sport, dport) if p is not None}
    if ports & _DNS_PORTS:
        return Protocol.DNS
    if ports & _HTTPS_PORTS:
        return Protocol.HTTPS
    if ports & _HTTP_PORTS:
        return Protocol.HTTP
    try:
        return Protocol(l4)
    except ValueError:
        return Protocol.OTHER


def parse_scapy_packet(pkt: Any) -> PacketEvent | None:
    """Convert a Scapy packet into a :class:`PacketEvent`.

    Returns ``None`` for packets we cannot meaningfully place on the highway
    (e.g. malformed frames). Imports of scapy layers are local so this module
    imports cleanly even when scapy is absent.
    """
    try:
        from scapy.layers.inet import ICMP, IP, TCP, UDP
        from scapy.layers.l2 import ARP
    except Exception:  # pragma: no cover - scapy not installed
        return None

    size = len(pkt) if pkt is not None else 0

    if ARP in pkt:
        arp = pkt[ARP]
        return PacketEvent(
            protocol=Protocol.ARP,
            src_ip=arp.psrc,
            dst_ip=arp.pdst,
            size=size,
        )

    if IP not in pkt:
        return None

    ip = pkt[IP]
    src_ip, dst_ip = ip.src, ip.dst
    sport = dport = None
    flags = None
    l4 = "OTHER"

    if TCP in pkt:
        l4 = "TCP"
        tcp = pkt[TCP]
        sport, dport = int(tcp.sport), int(tcp.dport)
        flags = str(tcp.flags)
    elif UDP in pkt:
        l4 = "UDP"
        udp = pkt[UDP]
        sport, dport = int(udp.sport), int(udp.dport)
    elif ICMP in pkt:
        l4 = "ICMP"

    protocol = _classify(l4, sport, dport)

    return PacketEvent(
        protocol=protocol,
        src_ip=src_ip,
        dst_ip=dst_ip,
        src_port=sport,
        dst_port=dport,
        size=size,
        flags=flags,
    )
