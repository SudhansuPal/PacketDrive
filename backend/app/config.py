"""Application configuration for PacketDrive backend.

Settings are sourced from environment variables (prefixed with ``PD_``) so the
backend can be tuned without code changes. A ``.env`` file is supported.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PD_", env_file=".env", extra="ignore")

    # --- Server ---
    host: str = "127.0.0.1"
    port: int = 8000
    # Local-only desktop/dev tool: default to wildcard so both the Vite dev
    # server and the Electron file:// shell can reach the API. Override with
    # PD_CORS_ORIGINS to lock down to specific origins (re-enables credentials).
    cors_origins: list[str] = ["*"]

    # --- Capture ---
    # When True (or when scapy/root is unavailable) the backend emits synthetic
    # traffic so the platform is fully demoable without elevated privileges.
    simulate: bool = True
    interface: str | None = None  # e.g. "en0"; None = scapy default
    bpf_filter: str | None = None  # optional Berkeley Packet Filter expression
    simulate_pps: int = 40  # synthetic packets per second

    # --- Streaming ---
    # Outbound packet events are batched to keep the WebSocket efficient under
    # high traffic. Stats are emitted on a fixed cadence.
    broadcast_interval_ms: int = 50
    stats_interval_ms: int = 1000
    max_queue_size: int = 5000

    # --- Detection ---
    port_scan_window_s: float = 5.0
    port_scan_threshold: int = 15  # distinct dst ports from one src
    flood_window_s: float = 2.0
    flood_threshold: int = 200  # packets from one src in window
    alert_cooldown_s: float = 10.0  # suppress duplicate alerts per source/kind

    # --- Stats ---
    stats_window_s: float = 5.0  # rolling window for pps/bps


@lru_cache
def get_settings() -> Settings:
    return Settings()
