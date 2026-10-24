import type { ItemId } from "./items";

export type OreId = Extract<
  ItemId,
  "iron_ore" | "copper_ore" | "coal" | "stone" | "quartz" | "sulfur" | "crude_oil" | "bauxite"
>;

/** Landschaftstyp eines Feldes. "plains" ist die alte Welt ohne Biome. */
export type BiomeId = "meadow" | "forest" | "desert" | "mountains" | "volcano" | "plains";

/** Unbebaubares Gelaende. */
export type Obstacle = "water" | "lava" | "cliff";

/** Reinheit eines Erzvorkommens: bestimmt, wie schnell Bohrer dort foerdern. */
export type Purity = "impure" | "normal" | "pure";

export const PURITY_RATE: Record<Purity, number> = { impure: 0.5, normal: 1, pure: 2 };

export const BIOME_NAMES: Record<BiomeId, string> = {
  meadow: "Wiese",
  forest: "Wald",
  desert: "Wüste",
  mountains: "Berge",
  volcano: "Vulkan",
  plains: "Grasland",
};

export const PURITY_NAMES: Record<Purity, string> = { impure: "unrein", normal: "normal", pure: "rein" };

/**
 * Weltgenerator: alles, was an einem Feld fest ist, deterministisch aus den
 * Koordinaten. Version 1 ist die alte Welt (aeltere Spielstaende behalten
 * damit ihre Bohrer), Version 2 die Welt mit Biomen.
 */
export interface WorldGen {
  readonly version: 1 | 2;
  oreAt(x: number, y: number): OreId | null;
  obstacleAt(x: number, y: number): Obstacle | null;
  biomeAt(x: number, y: number): BiomeId;
  purityAt(x: number, y: number): Purity;
}

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
/** Seen liegen erst ausserhalb des Startbereichs. */
const WATER_CLEAR_RADIUS = 20;

function starterOre(x: number, y: number): OreId | null {
  for (const p of STARTER_PATCHES) {
    if (Math.hypot(x - p.x, y - p.y) <= p.r) return p.ore;
  }
  return null;
}

/**
 * Reinheit aus grobem Rauschen, damit ein Vorkommen meist einheitlich ist.
 * Weiter draussen sind reine Vorkommen haeufiger; die Start-Vorkommen sind normal.
 */
function purityAt(x: number, y: number): Purity {
  if (starterOre(x, y)) return "normal";
  const d = Math.hypot(x, y);
  const n = valueNoise(x / 9, y / 9, SEED + 40) * 0.8 + valueNoise(x / 3, y / 3, SEED + 41) * 0.2 + Math.min(0.08, d / 1000);
  if (n < 0.42) return "impure";
  if (n > 0.64) return "pure";
  return "normal";
}

// ------------------------------------------------------------ Version 1: alte Welt

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

function legacyOreAt(x: number, y: number): OreId | null {
  const start = starterOre(x, y);
  if (start) return start;
  if (Math.hypot(x, y) < CLEAR_RADIUS) return null;

  const n = valueNoise(x / 7, y / 7, SEED) * 0.7 + valueNoise(x / 3, y / 3, SEED + 1) * 0.3;
  if (n < 0.72) {
    // Kohle nur dort, wo vorher nichts lag, damit alte Bohrer ihr Erz behalten.
    const k = valueNoise(x / 6, y / 6, SEED + 3) * 0.7 + valueNoise(x / 2.5, y / 2.5, SEED + 4) * 0.3;
    if (k > 0.76) return "coal";
    return legacyFarOreAt(x, y);
  }
  return valueNoise(x / 40, y / 40, SEED + 2) < 0.5 ? "iron_ore" : "copper_ore";
}

/** Rohstoffe der spaeten Stufen; nur auf Feldern, die sonst leer waeren. */
function legacyFarOreAt(x: number, y: number): OreId | null {
  const d = Math.hypot(x, y);
  if (d >= OIL_MIN_DIST && valueNoise(x / 3.5, y / 3.5, SEED + 8) > 0.9) return "crude_oil";
  if (d < FAR_ORES[0].minDist) return null;
  const n = valueNoise(x / 8, y / 8, SEED + 5) * 0.7 + valueNoise(x / 3, y / 3, SEED + 6) * 0.3;
  if (n < 0.7) return null;
  const allowed = FAR_ORES.filter((o) => d >= o.minDist);
  const pick = Math.floor(valueNoise(x / 25, y / 25, SEED + 7) * allowed.length * 0.999);
  return allowed[pick].ore;
}

function legacyWaterAt(x: number, y: number): boolean {
  if (Math.hypot(x, y) < WATER_CLEAR_RADIUS) return false;
  const n = valueNoise(x / 15, y / 15, SEED + 10) * 0.75 + valueNoise(x / 5, y / 5, SEED + 11) * 0.25;
  if (n < 0.7) return false;
  return legacyOreAt(x, y) === null;
}

export const LEGACY_GEN: WorldGen = {
  version: 1,
  oreAt: legacyOreAt,
  obstacleAt: (x, y) => (legacyWaterAt(x, y) ? "water" : null),
  biomeAt: () => "plains",
  purityAt,
};

// ------------------------------------------------------------ Version 2: Biome

/** Bis hierhin ist immer Wiese; dahinter entscheiden Temperatur und Hoehe. */
const HOME_RADIUS = 26;

interface BiomeRule {
  /** Erze mit Gewicht und Mindestabstand vom Ursprung. */
  ores: { ore: OreId; weight: number; minDist: number }[];
  /** Schwelle fuer Erzflecken (kleiner = mehr Erz). */
  density: number;
  /** Schwelle fuer Hindernisse (kleiner = mehr). */
  obstacle: number;
  kind: Obstacle | null;
}

const BIOMES: Record<Exclude<BiomeId, "plains">, BiomeRule> = {
  meadow: {
    ores: [
      { ore: "iron_ore", weight: 3, minDist: 0 },
      { ore: "copper_ore", weight: 3, minDist: 0 },
      { ore: "coal", weight: 1.5, minDist: 0 },
      { ore: "stone", weight: 1, minDist: 20 },
    ],
    density: 0.73,
    obstacle: 0.72,
    kind: "water",
  },
  forest: {
    ores: [
      { ore: "coal", weight: 3, minDist: 0 },
      { ore: "copper_ore", weight: 2, minDist: 0 },
      { ore: "iron_ore", weight: 1, minDist: 0 },
    ],
    density: 0.74,
    obstacle: 0.68,
    kind: "water",
  },
  desert: {
    ores: [
      { ore: "quartz", weight: 3, minDist: 35 },
      { ore: "stone", weight: 1.5, minDist: 20 },
      { ore: "copper_ore", weight: 1, minDist: 0 },
    ],
    density: 0.74,
    obstacle: 2,
    kind: null,
  },
  mountains: {
    ores: [
      { ore: "stone", weight: 2, minDist: 20 },
      { ore: "iron_ore", weight: 2, minDist: 0 },
      { ore: "bauxite", weight: 2.5, minDist: 60 },
    ],
    density: 0.73,
    obstacle: 0.66,
    kind: "cliff",
  },
  volcano: {
    ores: [
      { ore: "sulfur", weight: 3, minDist: 45 },
      { ore: "coal", weight: 1.5, minDist: 0 },
      { ore: "iron_ore", weight: 1, minDist: 0 },
    ],
    density: 0.73,
    obstacle: 0.75,
    kind: "lava",
  },
};

/** Abstand der Biom-Zentren (Voronoi-Zellen mit zufaellig verschobenen Punkten). */
const BIOME_CELL = 52;

/** Biome mit Gewicht und Mindestabstand ihres Zentrums vom Ursprung. */
const BIOME_PICK: { biome: Exclude<BiomeId, "plains">; weight: number; minDist: number }[] = [
  { biome: "meadow", weight: 2, minDist: 0 },
  { biome: "forest", weight: 2.4, minDist: 0 },
  { biome: "desert", weight: 2, minDist: 40 },
  { biome: "mountains", weight: 2, minDist: 36 },
  { biome: "volcano", weight: 1.4, minDist: 60 },
];

function biomeOfCell(cx: number, cy: number, px: number, py: number): BiomeId {
  const d = Math.hypot(px, py);
  if (d < HOME_RADIUS) return "meadow";
  const allowed = BIOME_PICK.filter((b) => d >= b.minDist);
  const total = allowed.reduce((s, b) => s + b.weight, 0);
  let pick = hash(cx, cy, SEED + 24) * total;
  for (const b of allowed) {
    pick -= b.weight;
    if (pick < 0) return b.biome;
  }
  return allowed[allowed.length - 1].biome;
}

function cellPoint(cx: number, cy: number): [number, number] {
  if (cx === 0 && cy === 0) return [0, 0];
  return [(cx + 0.15 + hash(cx, cy, SEED + 25) * 0.7) * BIOME_CELL, (cy + 0.15 + hash(cx, cy, SEED + 26) * 0.7) * BIOME_CELL];
}

function biomeAt(x: number, y: number): BiomeId {
  if (Math.hypot(x, y) < HOME_RADIUS) return "meadow";
  // Leicht verzerrte Koordinaten: Biomgrenzen werden natuerlich statt gerade.
  const wx = x + (valueNoise(x / 11, y / 11, SEED + 20) - 0.5) * 18;
  const wy = y + (valueNoise(x / 11, y / 11, SEED + 21) - 0.5) * 18;
  const gx = Math.floor(wx / BIOME_CELL);
  const gy = Math.floor(wy / BIOME_CELL);
  let best = Infinity;
  let biome: BiomeId = "meadow";
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [px, py] = cellPoint(gx + dx, gy + dy);
      const dd = (px - wx) ** 2 + (py - wy) ** 2;
      if (dd < best) {
        best = dd;
        biome = biomeOfCell(gx + dx, gy + dy, px, py);
      }
    }
  }
  return biome;
}

function biomeOreAt(x: number, y: number): OreId | null {
  const start = starterOre(x, y);
  if (start) return start;
  const d = Math.hypot(x, y);
  if (d < CLEAR_RADIUS) return null;
  const biome = biomeAt(x, y);
  if (biome === "plains") return null;
  // Oel nur in der Wueste, als kleine Quellen.
  if (biome === "desert" && d >= OIL_MIN_DIST && valueNoise(x / 3.5, y / 3.5, SEED + 8) > 0.84) return "crude_oil";
  const rule = BIOMES[biome];
  const n = valueNoise(x / 7, y / 7, SEED + 30) * 0.7 + valueNoise(x / 3, y / 3, SEED + 31) * 0.3;
  if (n < rule.density) return null;
  const allowed = rule.ores.filter((o) => d >= o.minDist);
  const total = allowed.reduce((s, o) => s + o.weight, 0);
  // Ein ganzer Fleck bekommt dasselbe Erz.
  let pick = valueNoise(x / 9, y / 9, SEED + 32) * total;
  for (const o of allowed) {
    pick -= o.weight;
    if (pick < 0) return o.ore;
  }
  return allowed[allowed.length - 1].ore;
}

function biomeObstacleAt(x: number, y: number): Obstacle | null {
  if (Math.hypot(x, y) < WATER_CLEAR_RADIUS) return null;
  const biome = biomeAt(x, y);
  if (biome === "plains") return null;
  const rule = BIOMES[biome];
  if (!rule.kind) return null;
  const scale = rule.kind === "cliff" ? 6 : 12;
  const n = valueNoise(x / scale, y / scale, SEED + 10) * 0.75 + valueNoise(x / 4, y / 4, SEED + 11) * 0.25;
  if (n < rule.obstacle) return null;
  return biomeOreAt(x, y) === null ? rule.kind : null;
}

export const BIOME_GEN: WorldGen = {
  version: 2,
  oreAt: biomeOreAt,
  obstacleAt: biomeObstacleAt,
  biomeAt,
  purityAt,
};

export const DEFAULT_GEN = BIOME_GEN;

export function worldGen(version: number): WorldGen {
  return version === 1 ? LEGACY_GEN : BIOME_GEN;
}

/** Erz auf Feld (x, y) in einer neuen Welt. */
export function oreAt(x: number, y: number): OreId | null {
  return DEFAULT_GEN.oreAt(x, y);
}

/** Liegt auf Feld (x, y) in einer neuen Welt Wasser? Erz hat immer Vorrang. */
export function waterAt(x: number, y: number): boolean {
  return DEFAULT_GEN.obstacleAt(x, y) === "water";
}

// ------------------------------------------------------------ Rauschen

export function hash(x: number, y: number, seed: number): number {
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
