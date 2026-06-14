import type { Alert } from "../types/packet";
import { SEVERITY_COLOR } from "../lib/protocols";
import { clockTime } from "../lib/format";

interface Props {
  alerts: Alert[];
}

export function AlertsFeed({ alerts }: Props) {
  return (
    <section className="alerts">
      <header className="alerts-head">
        <span>Threat feed</span>
        <span className="alerts-count">{alerts.length}</span>
      </header>
      <div className="alerts-list">
        {alerts.length === 0 && <div className="alerts-empty">No threats detected</div>}
        {alerts.map((a) => {
          const color = SEVERITY_COLOR[a.severity] ?? "#fb923c";
          return (
            <div className="alert-card" key={a.id} style={{ borderLeftColor: color }}>
              <div className="alert-top">
                <span className="alert-kind" style={{ color }}>
                  {a.kind.replace(/_/g, " ")}
                </span>
                <span className="alert-sev" style={{ background: color }}>
                  {a.severity}
                </span>
                <span className="alert-time">{clockTime(a.ts)}</span>
              </div>
              <div className="alert-msg">{a.message}</div>
              <div className="alert-meta">
                {a.source}
                {a.target ? ` → ${a.target}` : ""} · ×{a.count}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
