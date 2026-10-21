import type { Editor } from "../game/editor";

/** Was die Gesten von einer Kamera brauchen. */
export interface ViewCamera {
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  panByPixels(dx: number, dy: number): void;
  zoomAt(factor: number, sx: number, sy: number): void;
  rotateAt(angle: number, sx: number, sy: number): void;
}

/** Bewegung unter dieser Schwelle (Pixel) gilt noch als Antippen. */
const TAP_SLOP = 8;

type Gesture =
  | { kind: "idle" }
  // Bau-Werkzeug aktiv, Finger liegt, aber es ist noch offen, ob Tipp, Zug oder Pinch folgt.
  | { kind: "pending"; tileX: number; tileY: number }
  | { kind: "stroke" }
  | { kind: "pan"; startX: number; startY: number; t0: number; moved: boolean; tapSelects: boolean }
  | { kind: "pinch"; dist: number; angle: number; midX: number; midY: number }
  // Nach einem Pinch: warten, bis alle Finger weg sind, damit nichts versehentlich gebaut wird.
  | { kind: "done" };

/**
 * Pointer-Gesten fuer Touch und Maus:
 * - Hand-Werkzeug: ein Finger verschiebt, Antippen waehlt aus.
 * - Bau-Werkzeug: ein Finger baut (Ziehen = mehrere Felder / Baender malen).
 * - Zwei Finger: immer verschieben, zoomen und durch Verdrehen die Kamera drehen.
 * - Maus: Rad zoomt, rechte/mittlere Taste verschiebt, Q/E drehen.
 */
export class Controls {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private g: Gesture = { kind: "idle" };

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: ViewCamera,
    private readonly editor: Editor,
  ) {
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private tileAt(sx: number, sy: number) {
    const w = this.camera.screenToWorld(sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1) {
      const panOnly = e.pointerType === "mouse" && e.button !== 0;
      if (panOnly || this.editor.tool === "hand") {
        this.g = { kind: "pan", startX: e.clientX, startY: e.clientY, t0: performance.now(), moved: false, tapSelects: !panOnly };
      } else {
        const t = this.tileAt(e.clientX, e.clientY);
        this.g = { kind: "pending", tileX: t.x, tileY: t.y };
      }
    } else if (this.pointers.size === 2) {
      if (this.g.kind === "stroke") this.editor.strokeEnd();
      const m = this.midpoint();
      this.g = { kind: "pinch", dist: this.distance(), angle: this.angle(), midX: m.x, midY: m.y };
    }
  };

  private commitPending(tap: boolean) {
    if (this.g.kind !== "pending") return;
    this.editor.strokeBegin(this.g.tileX, this.g.tileY, tap);
    this.g = { kind: "stroke" };
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return; // Maus ohne gedrueckte Taste
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.g;

    switch (g.kind) {
      case "pending": {
        const t = this.tileAt(e.clientX, e.clientY);
        if (t.x === g.tileX && t.y === g.tileY) return;
        this.commitPending(false);
        this.editor.strokeMove(t.x, t.y);
        break;
      }
      case "stroke": {
        const t = this.tileAt(e.clientX, e.clientY);
        this.editor.strokeMove(t.x, t.y);
        break;
      }
      case "pan":
        this.camera.panByPixels(e.clientX - prev.x, e.clientY - prev.y);
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > TAP_SLOP) g.moved = true;
        break;
      case "pinch": {
        if (this.pointers.size < 2) return;
        const dist = this.distance();
        const m = this.midpoint();
        this.camera.panByPixels(m.x - g.midX, m.y - g.midY);
        if (g.dist > 0) this.camera.zoomAt(dist / g.dist, m.x, m.y);
        const angle = this.angle();
        // Ueber die +-pi-Grenze hinweg den kurzen Weg nehmen.
        const turn = Math.atan2(Math.sin(angle - g.angle), Math.cos(angle - g.angle));
        this.camera.rotateAt(turn, m.x, m.y);
        g.dist = dist;
        g.angle = angle;
        g.midX = m.x;
        g.midY = m.y;
        break;
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    const g = this.g;

    if (g.kind === "pending") {
      this.commitPending(true);
      this.editor.strokeEnd();
    } else if (g.kind === "stroke") {
      this.editor.strokeEnd();
    } else if (g.kind === "pan" && g.tapSelects && !g.moved && performance.now() - g.t0 < 500) {
      const t = this.tileAt(e.clientX, e.clientY);
      this.editor.select(t.x, t.y);
    }

    this.g = this.pointers.size === 0 ? { kind: "idle" } : { kind: "done" };
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camera.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  };

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private angle(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private midpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
