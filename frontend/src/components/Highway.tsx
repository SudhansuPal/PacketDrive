import { useEffect, useRef } from "react";
import { HighwayEngine } from "../engine/highway";

interface Props {
  /** Populated with the live engine instance so the parent can push packets. */
  engineRef: React.MutableRefObject<HighwayEngine | null>;
}

export function Highway({ engineRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new HighwayEngine(canvasRef.current);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [engineRef]);

  return <canvas ref={canvasRef} className="highway-canvas" />;
}
