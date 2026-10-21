import { Container, Graphics } from "pixi.js";
import { COLORS, TILE_SIZE } from "../config";
import { oreAt } from "../sim/terrain";
import type { Camera } from "./camera";

const CHUNK = 16; // Felder pro Chunk-Kante
const MAX_CHUNKS = 400;

/**
 * Boden (Gitter + Erzvorkommen) in Chunks. Ein Chunk wird einmal gezeichnet
 * und danach nur noch ein-/ausgeblendet, damit Verschieben nichts kostet.
 */
export class TerrainLayer {
  readonly container = new Container();
  private readonly chunks = new Map<string, Graphics>();

  update(camera: Camera) {
    const b = camera.visibleTileBounds();
    const cx0 = Math.floor(b.minX / CHUNK);
    const cy0 = Math.floor(b.minY / CHUNK);
    const cx1 = Math.floor(b.maxX / CHUNK);
    const cy1 = Math.floor(b.maxY / CHUNK);

    for (const g of this.chunks.values()) g.visible = false;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        let g = this.chunks.get(key);
        if (!g) {
          g = buildChunk(cx, cy);
          this.chunks.set(key, g);
          this.container.addChild(g);
        }
        g.visible = true;
      }
    }

    if (this.chunks.size > MAX_CHUNKS) {
      for (const [key, g] of this.chunks) {
        if (g.visible) continue;
        g.destroy();
        this.chunks.delete(key);
      }
    }
  }
}

function buildChunk(cx: number, cy: number): Graphics {
  const g = new Graphics();
  const T = TILE_SIZE;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;

  for (let y = y0; y < y0 + CHUNK; y++) {
    for (let x = x0; x < x0 + CHUNK; x++) {
      const ore = oreAt(x, y);
      if (ore) drawOreTile(g, x, y, COLORS.ore[ore]);
    }
  }

  for (let i = 0; i <= CHUNK; i++) {
    const vx = (x0 + i) * T;
    const hy = (y0 + i) * T;
    g.moveTo(vx, y0 * T).lineTo(vx, (y0 + CHUNK) * T);
    g.stroke({ width: 1, pixelLine: true, color: (x0 + i) % 8 === 0 ? COLORS.gridLineMajor : COLORS.gridLine });
    g.moveTo(x0 * T, hy).lineTo((x0 + CHUNK) * T, hy);
    g.stroke({ width: 1, pixelLine: true, color: (y0 + i) % 8 === 0 ? COLORS.gridLineMajor : COLORS.gridLine });
  }
  return g;
}

/** Dezenter Boden plus ein paar Erzbrocken, damit Erz nicht wie ein Gebaeude aussieht. */
function drawOreTile(g: Graphics, x: number, y: number, color: number) {
  const T = TILE_SIZE;
  g.rect(x * T, y * T, T, T).fill({ color, alpha: 0.16 });
  const v = (x * 7 + y * 13) & 3; // leichte Variation pro Feld
  const pebbles = [
    [0.3, 0.32, 0.11],
    [0.68, 0.42 + v * 0.04, 0.09],
    [0.42 + v * 0.05, 0.72, 0.1],
  ];
  for (const [px, py, r] of pebbles) g.circle((x + px) * T, (y + py) * T, r * T).fill({ color, alpha: 0.55 });
}
