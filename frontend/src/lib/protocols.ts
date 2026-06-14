import type { Protocol } from "../types/packet";

export type VehicleKind =
  | "sedan"
  | "suv"
  | "van"
  | "pickup"
  | "hatchback"
  | "bike"
  | "scooter"
  | "generic";

export interface ProtocolStyle {
  protocol: Protocol;
  label: string;
  /** Base body color for the vehicle. */
  color: string;
  /** Vehicle silhouette drawn on the highway. */
  vehicle: VehicleKind;
  /** Fixed lane index (top → bottom), one lane per protocol. */
  lane: number;
}

// One lane per protocol keeps the scene legible; ordering roughly groups
// connection-oriented traffic up top and link-layer/diagnostic traffic below.
export const PROTOCOL_STYLES: Record<Protocol, ProtocolStyle> = {
  HTTPS: { protocol: "HTTPS", label: "HTTPS", color: "#34d399", vehicle: "suv", lane: 0 },
  HTTP: { protocol: "HTTP", label: "HTTP", color: "#fbbf24", vehicle: "hatchback", lane: 1 },
  TCP: { protocol: "TCP", label: "TCP", color: "#60a5fa", vehicle: "sedan", lane: 2 },
  UDP: { protocol: "UDP", label: "UDP", color: "#22d3ee", vehicle: "pickup", lane: 3 },
  DNS: { protocol: "DNS", label: "DNS", color: "#c084fc", vehicle: "van", lane: 4 },
  ICMP: { protocol: "ICMP", label: "ICMP", color: "#f472b6", vehicle: "bike", lane: 5 },
  ARP: { protocol: "ARP", label: "ARP", color: "#94a3b8", vehicle: "scooter", lane: 6 },
  OTHER: { protocol: "OTHER", label: "OTHER", color: "#cbd5e1", vehicle: "generic", lane: 7 },
};

export const LANE_COUNT = 8;

export const ORDERED_PROTOCOLS: Protocol[] = Object.values(PROTOCOL_STYLES)
  .sort((a, b) => a.lane - b.lane)
  .map((s) => s.protocol);

export function styleFor(protocol: Protocol): ProtocolStyle {
  return PROTOCOL_STYLES[protocol] ?? PROTOCOL_STYLES.OTHER;
}

export const MALICIOUS_COLOR = "#ef4444";

export const SEVERITY_COLOR: Record<string, string> = {
  low: "#fbbf24",
  medium: "#fb923c",
  high: "#ef4444",
  critical: "#dc2626",
};
