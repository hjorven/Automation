import type { ItemId } from "./items";
import { ALT_RECIPES, type ItemStack } from "./recipes";
import { hash, type WorldGen } from "./terrain";

// Fundstuecke: abgestuerzte Frachtkapseln, verteilt ueber die Welt. Sie tauchen
// auf, sobald sich der Nebel ueber ihnen lichtet. Bergen bringt seltene Teile
// ins Hub-Lager und manchmal ein alternatives Rezept.

/** Kantenlaenge einer Region; jede Region hat hoechstens ein Wrack. */
export const WRECK_REGION = 36;
/** Kein Wrack naeher am Start. */
const MIN_DIST = 22;
const CHANCE = 0.7;
/** Wahrscheinlichkeit, dass ein Wrack ein alternatives Rezept enthaelt. */
const RECIPE_CHANCE = 0.45;
const SEED = 4242;

/** Rezepte, die in Wracks liegen koennen. */
export const WRECK_RECIPES: readonly string[] = ALT_RECIPES.map((r) => r.id);

/** Wrack in Region (rx, ry), falls es eines gibt. */
export function wreckSite(rx: number, ry: number, gen: WorldGen): { x: number; y: number } | null {
  if (hash(rx, ry, SEED) > CHANCE) return null;
  const x = rx * WRECK_REGION + 4 + Math.floor(hash(rx, ry, SEED + 1) * (WRECK_REGION - 8));
  const y = ry * WRECK_REGION + 4 + Math.floor(hash(rx, ry, SEED + 2) * (WRECK_REGION - 8));
  if (Math.hypot(x, y) < MIN_DIST) return null;
  if (gen.obstacleAt(x, y) || gen.oreAt(x, y)) return null;
  return { x, y };
}

/** Beute je Entfernung: weiter draussen liegen wertvollere Teile. */
const LOOT_BANDS: { maxDist: number; items: [ItemId, number, number][] }[] = [
  {
    maxDist: 50,
    items: [
      ["iron_plate", 30, 60],
      ["copper_plate", 20, 40],
      ["gear", 10, 25],
      ["wire", 20, 50],
      ["circuit", 5, 15],
    ],
  },
  {
    maxDist: 85,
    items: [
      ["circuit", 20, 40],
      ["steel", 20, 40],
      ["concrete", 15, 30],
      ["rotor", 5, 15],
      ["motor", 2, 6],
    ],
  },
  {
    maxDist: 125,
    items: [
      ["motor", 8, 16],
      ["control_unit", 5, 12],
      ["heavy_frame", 3, 8],
      ["plastic", 20, 40],
      ["rubber", 20, 40],
    ],
  },
  {
    maxDist: Infinity,
    items: [
      ["computer", 5, 12],
      ["battery", 10, 20],
      ["heavy_frame", 6, 14],
      ["aluminium", 20, 40],
      ["turbo_motor", 1, 3],
    ],
  },
];

export interface WreckLoot {
  items: ItemStack[];
  /** Alternatives Rezept, falls eines noch fehlt. */
  recipe: string | null;
}

/**
 * Inhalt des Wracks auf Feld (x, y). Deterministisch; `hasRecipe` sagt, welche
 * Rezepte der Spieler schon kennt (dann gibt es ein anderes oder keines).
 */
export function wreckLoot(x: number, y: number, hasRecipe: (id: string) => boolean): WreckLoot {
  const d = Math.hypot(x, y);
  const band = LOOT_BANDS.find((b) => d < b.maxDist)!;
  const pool = [...band.items];
  const n = 2 + Math.floor(hash(x, y, SEED + 3) * 2);
  const items: ItemStack[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [item, lo, hi] = pool.splice(Math.floor(hash(x, y, SEED + 10 + i) * pool.length), 1)[0];
    items.push({ item, count: lo + Math.floor(hash(x, y, SEED + 20 + i) * (hi - lo + 1)) });
  }
  let recipe: string | null = null;
  const open = WRECK_RECIPES.filter((id) => !hasRecipe(id));
  if (open.length && hash(x, y, SEED + 4) < RECIPE_CHANCE) recipe = open[Math.floor(hash(x, y, SEED + 5) * open.length)];
  return { items, recipe };
}
