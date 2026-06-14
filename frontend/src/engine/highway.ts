import type { PacketEvent } from "../types/packet";
import {
  LANE_COUNT,
  MALICIOUS_COLOR,
  ORDERED_PROTOCOLS,
  styleFor,
  type VehicleKind,
} from "../lib/protocols";

interface Vehicle {
  x: number;
  lane: number;
  speed: number; // px/sec
  length: number;
  height: number;
  color: string;
  kind: VehicleKind;
  malicious: boolean;
  born: number;
}

const GUTTER = 70; // left label column (px, CSS pixels)
const MAX_VEHICLES = 600; // hard cap so bursts can't melt the GPU
const MAX_QUEUE = 1500; // pending spawns; oldest dropped beyond this
const SPAWNS_PER_FRAME = 6; // spread batch bursts smoothly over frames

const KIND_SIZE: Record<VehicleKind, { len: number; ht: number }> = {
  bike: { len: 0.7, ht: 0.34 },
  scooter: { len: 0.6, ht: 0.32 },
  hatchback: { len: 1.0, ht: 0.5 },
  sedan: { len: 1.15, ht: 0.5 },
  suv: { len: 1.25, ht: 0.58 },
  pickup: { len: 1.3, ht: 0.55 },
  van: { len: 1.45, ht: 0.62 },
  generic: { len: 1.1, ht: 0.5 },
};

export class HighwayEngine {
  private ctx: CanvasRenderingContext2D;
  private vehicles: Vehicle[] = [];
  private queue: PacketEvent[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private ro?: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Queue a batch of packets; each becomes a vehicle as capacity allows. */
  spawn(packets: PacketEvent[]) {
    for (const p of packets) this.queue.push(p);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
    }
  }

  start() {
    this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.05); // clamp tab-switch jumps
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }

  private laneHeight() {
    return this.h / LANE_COUNT;
  }

  private makeVehicle(p: PacketEvent): Vehicle {
    const style = styleFor(p.protocol);
    const lh = this.laneHeight();
    const size = KIND_SIZE[style.vehicle];
    // Bigger packets ride a touch longer & slower, like loaded trucks.
    const sizeFactor = Math.min(1, p.size / 1500);
    const height = lh * size.ht;
    const length = height * (1.6 + size.len) * (1 + sizeFactor * 0.4);
    const speed = (this.w * 0.45) * (1.1 - sizeFactor * 0.35) * (0.85 + Math.random() * 0.3);
    return {
      x: -length,
      lane: style.lane,
      speed,
      length,
      height,
      color: p.malicious ? MALICIOUS_COLOR : style.color,
      kind: style.vehicle,
      malicious: p.malicious,
      born: performance.now(),
    };
  }

  private update(dt: number) {
    // Promote a few queued packets into vehicles each frame.
    let budget = SPAWNS_PER_FRAME;
    while (budget-- > 0 && this.queue.length && this.vehicles.length < MAX_VEHICLES) {
      const p = this.queue.shift()!;
      this.vehicles.push(this.makeVehicle(p));
    }
    // Advance and cull off-screen vehicles.
    const right = this.w + 40;
    let w = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      v.x += v.speed * dt;
      if (v.x <= right) this.vehicles[w++] = v;
    }
    this.vehicles.length = w;
  }

  private draw() {
    const { ctx, w, h } = this;
    const lh = this.laneHeight();

    // Road backdrop.
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, w, h);

    // Lanes + labels.
    ctx.textBaseline = "middle";
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (let i = 0; i < LANE_COUNT; i++) {
      const top = i * lh;
      ctx.fillStyle = i % 2 === 0 ? "#0e1626" : "#0b1120";
      ctx.fillRect(GUTTER, top, w - GUTTER, lh);

      // Dashed lane divider.
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.lineWidth = 1;
      ctx.setLineDash([14, 16]);
      ctx.beginPath();
      ctx.moveTo(GUTTER, top + lh);
      ctx.lineTo(w, top + lh);
      ctx.stroke();
      ctx.setLineDash([]);

      // Lane label in the gutter.
      const proto = ORDERED_PROTOCOLS[i];
      const style = styleFor(proto);
      ctx.fillStyle = style.color;
      ctx.fillText(style.label, 10, top + lh / 2);
    }

    // Gutter divider.
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.beginPath();
    ctx.moveTo(GUTTER, 0);
    ctx.lineTo(GUTTER, h);
    ctx.stroke();

    // Vehicles.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    for (const v of this.vehicles) {
      const cy = v.lane * lh + lh / 2;
      this.drawVehicle(v, cy, pulse);
    }
  }

  private drawVehicle(v: Vehicle, cy: number, pulse: number) {
    const { ctx } = this;
    const x = v.x;
    const y = cy - v.height / 2;
    const r = Math.min(6, v.height / 2);

    ctx.save();
    if (v.malicious) {
      ctx.shadowColor = MALICIOUS_COLOR;
      ctx.shadowBlur = 12 + pulse * 14;
    }
    ctx.fillStyle = v.color;
    roundRect(ctx, x, y, v.length, v.height, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cabin / windshield highlight.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    const cabW = v.length * 0.34;
    const cabX = x + v.length * 0.5;
    roundRect(ctx, cabX, y + v.height * 0.18, cabW, v.height * 0.4, r * 0.6);
    ctx.fill();

    // Wheels.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const wr = Math.max(1.5, v.height * 0.14);
    ctx.beginPath();
    circle(ctx, x + v.length * 0.24, y + v.height, wr);
    circle(ctx, x + v.length * 0.76, y + v.height, wr);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
