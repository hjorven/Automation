import type { ItemId } from "./items";

export type OreId = Extract<
  ItemId,
  "iron_ore" | "copper_ore" | "coal" | "stone" | "quartz" | "sulfur" | "crude_oil" | "bauxite"
>;

/**
 * Spaete Rohstoffe liegen weiter draussen (Mindestabstand vom Ursprung), damit
 * man fuer sie expandieren muss.
 */
const FAR_ORES: { ore: OreId; minDist: number }[] = [
  { ore: "stone", minDist: 20 },
  { ore: "quartz", minDist: 35 },
  { ore: "sulfur", minDist: 45 },
  { ore: "bauxite", minDist: 60 },
];
const OIL_MIN_DIST = 40;

const SEED = 1337;

/** Garantierte Start-Vorkommen nahe dem Hub, damit man sofort loslegen kann. */
const STARTER_PATCHES: { ore: OreId; x: number; y: number; r: number }[] = [
  { ore: "iron_ore", x: -6, y: -1, r: 2.3 },
  { ore: "copper_ore", x: 6, y: 2, r: 2.3 },
  // Kohle kam mit den Hub-Stufen dazu; liegt auf zuvor leeren Feldern.
  { ore: "coal", x: 1, y: 9, r: 1.8 },
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
  if (n < 0.72) {
    // Kohle nur dort, wo vorher nichts lag, damit alte Bohrer ihr Erz behalten.
    const k = valueNoise(x / 6, y / 6, SEED + 3) * 0.7 + valueNoise(x / 2.5, y / 2.5, SEED + 4) * 0.3;
    if (k > 0.76) return "coal";
    return farOreAt(x, y);
  }
  return valueNoise(x / 40, y / 40, SEED + 2) < 0.5 ? "iron_ore" : "copper_ore";
}

/** Rohstoffe der spaeten Stufen; nur auf Feldern, die sonst leer waeren. */
function farOreAt(x: number, y: number): OreId | null {
  const d = Math.hypot(x, y);
  if (d >= OIL_MIN_DIST && valueNoise(x / 3.5, y / 3.5, SEED + 8) > 0.9) return "crude_oil";
  if (d < FAR_ORES[0].minDist) return null;
  const n = valueNoise(x / 8, y / 8, SEED + 5) * 0.7 + valueNoise(x / 3, y / 3, SEED + 6) * 0.3;
  if (n < 0.7) return null;
  const allowed = FAR_ORES.filter((o) => d >= o.minDist);
  const pick = Math.floor(valueNoise(x / 25, y / 25, SEED + 7) * allowed.length * 0.999);
  return allowed[pick].ore;
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

/** Seen liegen erst ausserhalb des Startbereichs. */
const WATER_CLEAR_RADIUS = 20;

/**
 * Deterministisch: liegt auf Feld (x, y) Wasser? Wasser ist nicht bebaubar
 * (Tunnel koennen darunter durch). Erz hat immer Vorrang vor Wasser.
 */
export function waterAt(x: number, y: number): boolean {
  if (Math.hypot(x, y) < WATER_CLEAR_RADIUS) return false;
  const n = valueNoise(x / 15, y / 15, SEED + 10) * 0.75 + valueNoise(x / 5, y / 5, SEED + 11) * 0.25;
  if (n < 0.7) return false;
  return oreAt(x, y) === null;
}
