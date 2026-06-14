import { useCallback, useEffect, useRef, useState } from "react";
import { Highway } from "./components/Highway";
import { StatsHud } from "./components/StatsHud";
import { AlertsFeed } from "./components/AlertsFeed";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { useLiveFeed } from "./hooks/useLiveFeed";
import { apiUrl } from "./lib/endpoints";
import type { HighwayEngine } from "./engine/highway";
import type { Alert, Health, ServerFrame, Stats } from "./types/packet";

const MAX_ALERTS = 100;

export default function App() {
  const engineRef = useRef<HighwayEngine | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  const onFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case "packets":
        engineRef.current?.spawn(frame.items);
        break;
      case "stats":
        setStats(frame);
        break;
      case "alert":
        setAlerts((prev) => [frame, ...prev].slice(0, MAX_ALERTS));
        break;
    }
  }, []);

  const connection = useLiveFeed(onFrame);

  // Poll health for capture-mode + client count.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(apiUrl("/api/health"));
        if (!res.ok) return;
        const data = (await res.json()) as Health;
        if (active) setHealth(data);
      } catch {
        /* badge falls back to connection state */
      }
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▰▰▶</span>
          <h1>PacketDrive</h1>
          <span className="brand-sub">network traffic, in motion</span>
        </div>
        <ConnectionBadge state={connection} health={health} />
      </header>

      <main className="stage">
        <div className="highway-wrap">
          <Highway engineRef={engineRef} />
        </div>
        <aside className="sidebar">
          <StatsHud stats={stats} />
          <AlertsFeed alerts={alerts} />
        </aside>
      </main>
    </div>
  );
}
