import type { ItemId } from "./items";

export type OreId = Extract<ItemId, "iron_ore" | "copper_ore">;

const SEED = 1337;

/** Garantierte Start-Vorkommen nahe dem Hub, damit man sofort loslegen kann. */
const STARTER_PATCHES: { ore: OreId; x: number; y: number; r: number }[] = [
  { ore: "iron_ore", x: -6, y: -1, r: 2.3 },
  { ore: "copper_ore", x: 6, y: 2, r: 2.3 },
];

/** Freie Zone um den Ursprung (ausser den Start-Vorkommen). */
const CLEAR_RADIUS = 14;

/**
 * Deterministisch: welches Erz liegt auf Feld (x, y)? Unendliche Welt,
 * Vorkommen sind (vorerst) unerschoepflich.
 */
export function oreAt(x: number, y: number): OreId | null {
  for (const p of STARTER_PATCHES) {
    if (Math.hypot(x - p.x, y - p.y) <= p.r) return p.ore;
  }
  if (Math.hypot(x, y) < CLEAR_RADIUS) return null;

  const n = valueNoise(x / 7, y / 7, SEED) * 0.7 + valueNoise(x / 3, y / 3, SEED + 1) * 0.3;
  if (n < 0.72) return null;
  return valueNoise(x / 40, y / 40, SEED + 2) < 0.5 ? "iron_ore" : "copper_ore";
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
