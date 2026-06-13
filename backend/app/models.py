"""Pydantic schemas for the structured JSON events streamed to the frontend.

Every message sent over the WebSocket is a discriminated union on the ``type``
field: ``packet`` | ``alert`` | ``stats``. The frontend mirrors these shapes in
``frontend/src/types/packet.ts`` — keep the two in sync.
"""
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


def _new_id() -> str:
    return uuid.uuid4().hex


def _now() -> float:
    return time.time()


class Protocol(str, Enum):
    TCP = "TCP"
    UDP = "UDP"
    DNS = "DNS"
    HTTP = "HTTP"
    HTTPS = "HTTPS"
    ICMP = "ICMP"
    ARP = "ARP"
    OTHER = "OTHER"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class PacketEvent(BaseModel):
    """A single parsed packet, mapped to a vehicle on the frontend highway."""

    type: Literal["packet"] = "packet"
    id: str = Field(default_factory=_new_id)
    ts: float = Field(default_factory=_now)
    protocol: Protocol = Protocol.OTHER
    src_ip: str = ""
    dst_ip: str = ""
    src_port: int | None = None
    dst_port: int | None = None
    size: int = 0
    flags: str | None = None
    malicious: bool = False


class Alert(BaseModel):
    """A suspicious-pattern detection result."""

    type: Literal["alert"] = "alert"
    id: str = Field(default_factory=_new_id)
    ts: float = Field(default_factory=_now)
    kind: str = "anomaly"  # e.g. "port_scan", "flood"
    severity: Severity = Severity.MEDIUM
    source: str = ""  # offending src ip
    target: str | None = None
    message: str = ""
    count: int = 0


class Stats(BaseModel):
    """Rolling traffic statistics for the HUD/dashboard."""

    type: Literal["stats"] = "stats"
    ts: float = Field(default_factory=_now)
    total_packets: int = 0
    total_bytes: int = 0
    pps: float = 0.0  # packets per second (rolling)
    bps: float = 0.0  # bytes per second (rolling)
    protocols: dict[str, int] = Field(default_factory=dict)
    active_alerts: int = 0
    density: float = 0.0  # 0..1 normalized traffic load for the scene
