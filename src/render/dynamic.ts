import type { Graphics } from "pixi.js";
import { COLORS, TILE_SIZE as T } from "../config";
import { EXTRACT_TICKS } from "../sim/constants";
import { DX, DY, type Dir } from "../sim/dir";
import type { BeltItem } from "../sim/entities";
import type { World } from "../sim/world";
import { drawItem } from "./item-style";

interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Alles, was sich jeden Frame bewegt: Items auf Baendern, Fortschrittsbalken,
 * Auswahlrahmen. `alpha` (0..1) interpoliert zwischen zwei Simulations-Ticks.
 */
export function drawDynamic(g: Graphics, world: World, alpha: number, b: TileBounds, selectedId: number | null) {
  g.clear();
  const glow = 0.45 + 0.2 * Math.sin(performance.now() / 180);

  for (const e of world.entities.values()) {
    if (e.x < b.minX || e.x > b.maxX || e.y < b.minY || e.y > b.maxY) continue;
    const px = e.x * T;
    const py = e.y * T;

    switch (e.type) {
      case "belt":
        for (const it of e.items) {
          const p = beltItemPos(e.x, e.y, e.dir, it, alpha);
          drawItem(g, it.item, p.x, p.y, T * 0.15);
        }
        break;
      case "extractor":
        if (e.working) progressBar(g, px, py, e.timer / EXTRACT_TICKS);
        break;
      case "smelter":
      case "assembler":
        if (e.crafting && e.recipe) {
          if (e.type === "smelter") {
            g.roundRect(px + 18, py + 18, T - 36, T - 36, 4).fill({ color: COLORS.smelterGlow, alpha: glow });
          }
          progressBar(g, px, py, e.progress / e.recipe.ticks);
        }
        break;
      case "hub":
        break;
    }

    if (e.id === selectedId) {
      g.roundRect(px + 1, py + 1, T - 2, T - 2, 8).stroke({ width: 3, color: COLORS.selection });
    }
  }
}

/** Position eines Items: Eintrittskante -> Feldmitte -> Austrittskante. */
function beltItemPos(tx: number, ty: number, dir: Dir, it: BeltItem, alpha: number) {
  const p = it.prev + (it.progress - it.prev) * alpha;
  let ox: number;
  let oy: number;
  if (p < 0.5) {
    // Auch p < 0: Item ist gerade vom Vorgaenger gekommen, noch jenseits der Kante.
    const k = 0.5 - p;
    ox = DX[it.entry] * k;
    oy = DY[it.entry] * k;
  } else {
    const k = p - 0.5;
    ox = DX[dir] * k;
    oy = DY[dir] * k;
  }
  return { x: (tx + 0.5 + ox) * T, y: (ty + 0.5 + oy) * T };
}

function progressBar(g: Graphics, px: number, py: number, frac: number) {
  const w = T - 20;
  g.rect(px + 10, py + T - 9, w, 4).fill({ color: 0x000000, alpha: 0.4 });
  g.rect(px + 10, py + T - 9, w * Math.min(1, frac), 4).fill(COLORS.progress);
}
