import { useEffect, useRef, useState } from "react";
import type { ServerFrame } from "../types/packet";
import { wsUrl } from "../lib/endpoints";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

/**
 * Subscribe to the backend packet/alert/stats stream.
 *
 * `onFrame` is held in a ref so the socket is opened once and survives
 * re-renders; reconnection uses capped exponential backoff.
 */
export function useLiveFeed(onFrame: (frame: ServerFrame) => void): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let reconnectTimer: number | undefined;
    let closed = false; // set on unmount so we stop retrying

    const connect = () => {
      setState(retry === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(wsUrl());

      socket.onopen = () => {
        retry = 0;
        setState("open");
      };

      socket.onmessage = (ev) => {
        try {
          onFrameRef.current(JSON.parse(ev.data) as ServerFrame);
        } catch {
          // Ignore malformed frames rather than tearing down the socket.
        }
      };

      socket.onclose = () => {
        if (closed) return;
        const delay = Math.min(1000 * 2 ** retry, 10_000);
        retry += 1;
        setState("reconnecting");
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return state;
}
