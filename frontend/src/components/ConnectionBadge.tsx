import type { ConnectionState } from "../hooks/useLiveFeed";
import type { Health } from "../types/packet";

interface Props {
  state: ConnectionState;
  health: Health | null;
}

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  closed: "Offline",
};

export function ConnectionBadge({ state, health }: Props) {
  return (
    <div className="conn-badge" data-state={state}>
      <span className="conn-dot" />
      <span className="conn-label">{LABEL[state]}</span>
      {health && (
        <span className="conn-mode" data-mode={health.mode}>
          {health.mode === "simulate" ? "SIMULATED" : "LIVE CAPTURE"}
        </span>
      )}
    </div>
  );
}
