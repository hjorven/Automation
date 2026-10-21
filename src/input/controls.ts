import type { Camera } from "../render/camera";

/**
 * Pointer-Steuerung fuer Pan und Zoom. Nutzt Pointer Events, damit Maus und
 * Touch denselben Pfad teilen. Pinch-to-Zoom ueber zwei gleichzeitige Pointer.
 */
export class CameraControls {
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  constructor(
    private canvas: HTMLElement,
    private camera: Camera,
  ) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.lastPinchDist = this.pinchDistance();
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    if (this.pointers.size === 1) {
      // Ein Finger / Maus gedrueckt -> verschieben
      this.camera.panByPixels(e.clientX - prev.x, e.clientY - prev.y);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (this.pointers.size === 2) {
      // Zwei Finger -> Pinch-Zoom um den Mittelpunkt
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dist = this.pinchDistance();
      if (this.lastPinchDist > 0) {
        const mid = this.pinchMidpoint();
        this.camera.zoomAt(dist / this.lastPinchDist, mid.x, mid.y);
      }
      this.lastPinchDist = dist;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.lastPinchDist = 0;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.camera.zoomAt(factor, e.clientX, e.clientY);
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
