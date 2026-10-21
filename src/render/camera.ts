import { MAX_ZOOM, MIN_ZOOM, TILE_SIZE } from "../config";

/**
 * Kamera auf der Welt. `pos` ist die Weltkoordinate im Zentrum des Bildschirms,
 * `zoom` der Maßstab (Pixel pro Welt-Einheit relativ zu TILE_SIZE).
 *
 * Welt-Einheit = eine Gitterzelle. Bildschirm-Mitte zeigt auf `pos`.
 */
export class Camera {
  pos = { x: 0, y: 0 };
  zoom = 1;

  constructor(
    private screenW: number,
    private screenH: number,
  ) {}

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
  }

  /** Skalierung Welt -> Bildschirm in Pixeln pro Gitterzelle. */
  get scale(): number {
    return TILE_SIZE * this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.scale;
    return {
      x: (wx - this.pos.x) * s + this.screenW / 2,
      y: (wy - this.pos.y) * s + this.screenH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.scale;
    return {
      x: (sx - this.screenW / 2) / s + this.pos.x,
      y: (sy - this.screenH / 2) / s + this.pos.y,
    };
  }

  /** Bildschirm verschieben (z. B. beim Ziehen), Angabe in Pixeln. */
  panByPixels(dxPx: number, dyPx: number) {
    const s = this.scale;
    this.pos.x -= dxPx / s;
    this.pos.y -= dyPx / s;
  }

  /** Zoomen, dabei den Punkt unter (anchorX, anchorY) in Bildschirm-Pixeln fixieren. */
  zoomAt(factor: number, anchorX: number, anchorY: number) {
    const before = this.screenToWorld(anchorX, anchorY);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(anchorX, anchorY);
    this.pos.x += before.x - after.x;
    this.pos.y += before.y - after.y;
  }

  /** Sichtbarer Weltbereich in Gitterkoordinaten (fuer Culling). */
  visibleTileBounds() {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.screenW, this.screenH);
    return {
      minX: Math.floor(tl.x),
      minY: Math.floor(tl.y),
      maxX: Math.ceil(br.x),
      maxY: Math.ceil(br.y),
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
