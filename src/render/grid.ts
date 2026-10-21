import { Graphics } from "pixi.js";
import { COLORS } from "../config";
import type { Camera } from "./camera";

/**
 * Zeichnet das Gitter. Nur der sichtbare Bereich wird gezeichnet (Culling),
 * damit auch ein unendliches Gitter performant bleibt.
 */
export class GridRenderer {
  readonly gfx = new Graphics();

  draw(camera: Camera) {
    const g = this.gfx;
    g.clear();

    const s = camera.scale;
    const b = camera.visibleTileBounds();

    const lineWidth = 1;
    const topLeft = camera.worldToScreen(b.minX, b.minY);
    const bottomRight = camera.worldToScreen(b.maxX, b.maxY);

    // Vertikale Linien
    for (let x = b.minX; x <= b.maxX; x++) {
      const px = topLeft.x + (x - b.minX) * s;
      const major = x % 8 === 0;
      g.moveTo(px, topLeft.y).lineTo(px, bottomRight.y);
      g.stroke({
        width: lineWidth,
        color: major ? COLORS.gridLineMajor : COLORS.gridLine,
      });
    }

    // Horizontale Linien
    for (let y = b.minY; y <= b.maxY; y++) {
      const py = topLeft.y + (y - b.minY) * s;
      const major = y % 8 === 0;
      g.moveTo(topLeft.x, py).lineTo(bottomRight.x, py);
      g.stroke({
        width: lineWidth,
        color: major ? COLORS.gridLineMajor : COLORS.gridLine,
      });
    }

    // Ursprungs-Zelle (0,0) markieren, damit man die Orientierung behaelt.
    if (b.minX <= 0 && b.maxX >= 0 && b.minY <= 0 && b.maxY >= 0) {
      const o = camera.worldToScreen(0, 0);
      g.rect(o.x, o.y, s, s).fill({ color: COLORS.origin, alpha: 0.35 });
    }
  }
}
