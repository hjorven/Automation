import type { Graphics } from "pixi.js";
import type { ItemId } from "../sim/items";

type Shape = "circle" | "square" | "gear" | "wire" | "chip";

export const ITEM_STYLE: Record<ItemId, { color: number; shape: Shape }> = {
  iron_ore: { color: 0x8fa3b8, shape: "circle" },
  copper_ore: { color: 0xd9824a, shape: "circle" },
  iron_plate: { color: 0xc8d3df, shape: "square" },
  copper_plate: { color: 0xf0a060, shape: "square" },
  gear: { color: 0xa9b6c6, shape: "gear" },
  wire: { color: 0xe8a35c, shape: "wire" },
  circuit: { color: 0x3fae5a, shape: "chip" },
};

/** Zeichnet ein Item zentriert auf (cx, cy) mit Radius r (Weltpixel). */
export function drawItem(g: Graphics, item: ItemId, cx: number, cy: number, r: number) {
  const { color, shape } = ITEM_STYLE[item];
  switch (shape) {
    case "circle":
      g.circle(cx, cy, r).fill(color);
      break;
    case "square":
      g.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.25).fill(color);
      break;
    case "gear": {
      const pts: number[] = [];
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.72;
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.poly(pts).fill(color);
      g.circle(cx, cy, r * 0.3).fill(0x1b222b);
      break;
    }
    case "wire":
      g.roundRect(cx - r, cy - r * 0.3, r * 2, r * 0.6, r * 0.3).fill(color);
      break;
    case "chip":
      g.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.2).fill(color);
      g.rect(cx - r * 0.4, cy - r * 0.4, r * 0.8, r * 0.8).fill(0xd8f0a0);
      break;
  }
}
