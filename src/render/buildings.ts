import type { Graphics } from "pixi.js";
import { COLORS, TILE_SIZE as T } from "../config";
import { DX, DY, type Dir } from "../sim/dir";
import type { Belt, Entity } from "../sim/entities";
import type { World } from "../sim/world";
import { ITEM_STYLE, drawItem } from "./item-style";

/** Punkt auf der Kante eines Feldes in Richtung d (Weltpixel). */
export function edgePoint(tx: number, ty: number, d: Dir) {
  return { x: (tx + 0.5 + DX[d] * 0.5) * T, y: (ty + 0.5 + DY[d] * 0.5) * T };
}

/** Statische Gebaeude. Wird nur neu gezeichnet, wenn sich die Welt aendert. */
export function drawBuildings(g: Graphics, world: World) {
  g.clear();
  for (const e of world.entities.values()) drawEntity(g, world, e);
}

function drawEntity(g: Graphics, world: World, e: Entity) {
  const px = e.x * T;
  const py = e.y * T;
  const cx = px + T / 2;
  const cy = py + T / 2;

  switch (e.type) {
    case "belt":
      drawBelt(g, world, e);
      break;
    case "extractor":
      g.roundRect(px + 6, py + 6, T - 12, T - 12, 10).fill(COLORS.extractor);
      g.circle(cx, cy, T * 0.2).fill(ITEM_STYLE[e.ore].color);
      frontMarker(g, cx, cy, e.dir);
      break;
    case "smelter":
      g.roundRect(px + 4, py + 4, T - 8, T - 8, 10).fill(COLORS.smelter);
      g.roundRect(px + 18, py + 18, T - 36, T - 36, 4).fill(COLORS.smelterCore);
      frontMarker(g, cx, cy, e.dir);
      break;
    case "assembler":
      g.roundRect(px + 4, py + 4, T - 8, T - 8, 10).fill(COLORS.assembler);
      g.roundRect(px + 14, py + 14, T - 28, T - 28, 6).fill(COLORS.assemblerCore);
      if (e.recipe) drawItem(g, e.recipe.outputs[0].item, cx, cy, T * 0.15);
      else g.circle(cx, cy, T * 0.12).stroke({ width: 3, color: COLORS.marker, alpha: 0.5 });
      frontMarker(g, cx, cy, e.dir);
      break;
    case "hub":
      g.roundRect(px + 3, py + 3, T - 6, T - 6, 12).fill(COLORS.hub);
      g.circle(cx, cy, T * 0.24).stroke({ width: 4, color: COLORS.hubRing });
      break;
  }
}

function drawBelt(g: Graphics, world: World, b: Belt) {
  const entry = world.beltInputSide(b);
  const a = edgePoint(b.x, b.y, entry);
  const z = edgePoint(b.x, b.y, b.dir);
  const cx = (b.x + 0.5) * T;
  const cy = (b.y + 0.5) * T;

  g.rect(b.x * T + 1, b.y * T + 1, T - 2, T - 2).fill(COLORS.belt);
  g.moveTo(a.x, a.y).lineTo(cx, cy).lineTo(z.x, z.y);
  g.stroke({ width: T * 0.5, color: COLORS.beltTrack, join: "round" });

  // Pfeil in Laufrichtung
  const fx = DX[b.dir];
  const fy = DY[b.dir];
  const s = T * 0.14;
  g.poly([cx + fx * s, cy + fy * s, cx - fx * s - fy * s, cy - fy * s + fx * s, cx - fx * s + fy * s, cy - fy * s - fx * s]);
  g.fill({ color: COLORS.beltArrow });
}

/** Kleines Dreieck an der Ausgangsseite eines Gebaeudes. */
function frontMarker(g: Graphics, cx: number, cy: number, dir: Dir) {
  const fx = DX[dir];
  const fy = DY[dir];
  const tip = T * 0.5 - 2;
  const base = T * 0.5 - 12;
  const half = 7;
  g.poly([
    cx + fx * tip,
    cy + fy * tip,
    cx + fx * base - fy * half,
    cy + fy * base + fx * half,
    cx + fx * base + fy * half,
    cy + fy * base - fx * half,
  ]);
  g.fill({ color: COLORS.marker, alpha: 0.85 });
}
