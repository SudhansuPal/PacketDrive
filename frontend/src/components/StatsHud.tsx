import type { Stats } from "../types/packet";
import { ORDERED_PROTOCOLS, styleFor } from "../lib/protocols";
import { humanBitrate, humanBytes, humanCount } from "../lib/format";

interface Props {
  stats: Stats | null;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function StatsHud({ stats }: Props) {
  const protocols = stats?.protocols ?? {};
  const total = ORDERED_PROTOCOLS.reduce((sum, p) => sum + (protocols[p] ?? 0), 0) || 1;

  return (
    <section className="hud">
      <div className="metrics">
        <Metric label="packets / s" value={stats ? stats.pps.toFixed(0) : "—"} />
        <Metric label="throughput" value={stats ? humanBitrate(stats.bps) : "—"} />
        <Metric
          label="total packets"
          value={stats ? humanCount(stats.total_packets) : "—"}
          sub={stats ? humanBytes(stats.total_bytes) : undefined}
        />
        <Metric label="alerts" value={stats ? `${stats.active_alerts}` : "—"} />
      </div>

      <div className="density">
        <div className="density-head">
          <span>scene density</span>
          <span>{stats ? `${Math.round(stats.density * 100)}%` : "—"}</span>
        </div>
        <div className="density-track">
          <div className="density-fill" style={{ width: `${(stats?.density ?? 0) * 100}%` }} />
        </div>
      </div>

      <div className="proto-breakdown">
        {ORDERED_PROTOCOLS.map((p) => {
          const count = protocols[p] ?? 0;
          const pct = (count / total) * 100;
          const style = styleFor(p);
          return (
            <div className="proto-row" key={p} title={`${count} packets`}>
              <span className="proto-name" style={{ color: style.color }}>
                {style.label}
              </span>
              <div className="proto-bar">
                <div
                  className="proto-bar-fill"
                  style={{ width: `${pct}%`, background: style.color }}
                />
              </div>
              <span className="proto-count">{humanCount(count)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
