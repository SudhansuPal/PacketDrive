// Mirror of backend/app/models.py — keep the two in sync.
// Every WebSocket message is a discriminated union on `type`.

export type Protocol =
  | "TCP"
  | "UDP"
  | "DNS"
  | "HTTP"
  | "HTTPS"
  | "ICMP"
  | "ARP"
  | "OTHER";

export type Severity = "low" | "medium" | "high" | "critical";

export interface PacketEvent {
  type: "packet";
  id: string;
  ts: number;
  protocol: Protocol;
  src_ip: string;
  dst_ip: string;
  src_port: number | null;
  dst_port: number | null;
  size: number;
  flags: string | null;
  malicious: boolean;
}

export interface Alert {
  type: "alert";
  id: string;
  ts: number;
  kind: string; // "port_scan" | "flood" | ...
  severity: Severity;
  source: string;
  target: string | null;
  message: string;
  count: number;
}

export interface Stats {
  type: "stats";
  ts: number;
  total_packets: number;
  total_bytes: number;
  pps: number;
  bps: number;
  protocols: Partial<Record<Protocol, number>>;
  active_alerts: number;
  density: number; // 0..1
}

// The pipeline batches packets into a single frame for efficiency.
export interface PacketsFrame {
  type: "packets";
  ts: number;
  items: PacketEvent[];
}

// Any frame that can arrive over /ws.
export type ServerFrame = PacketsFrame | Alert | Stats;

// GET /api/health
export interface Health {
  status: string;
  mode: "simulate" | "live";
  clients: number;
}

// GET /api/config
export interface Config {
  protocols: Protocol[];
}
