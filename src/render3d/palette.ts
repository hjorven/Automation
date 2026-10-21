import type { ItemId } from "../sim/items";

// Farben der 3D-Darstellung (sRGB-Hex). Low-Poly, flach schattiert.

export const ITEM_COLORS: Record<ItemId, number> = {
  iron_ore: 0x8fa3b8,
  copper_ore: 0xd9824a,
  iron_plate: 0xc8d3df,
  copper_plate: 0xf0a060,
  gear: 0xa9b6c6,
  wire: 0xe8a35c,
  circuit: 0x3fae5a,
  coal: 0x2f3036,
  steel: 0x8f9cab,
  motor: 0x4d6b8a,
  control_unit: 0x2f7f8f,
};

export const PALETTE = {
  sky: 0xa9c7d8,
  hemiGround: 0x4a5a3c,
  ground: 0x6f8a58,
  groundAlt: 0x6b8654,
  groundGap: 0x5b7546,
  oreGround: { iron_ore: 0x6f7c86, copper_ore: 0x8a6a4c, coal: 0x45464a },
  rock: { iron_ore: 0x7d93a8, copper_ore: 0xc0743f, coal: 0x2c2d31 },

  metalDark: 0x3a4250,
  metal: 0x77818f,
  metalLight: 0xb4bcc6,
  beltBed: 0x2b3038,
  beltRail: 0xd9a63a,
  port: 0xffc94a,

  extractor: 0xd9a63a,
  extractorBody: 0x4c5868,
  smelter: 0x8a6e5c,
  smelterStone: 0x6b5446,
  smelterGlow: 0xff7a2a,
  assembler: 0x3f6fa8,
  assemblerTop: 0x2c4f7a,
  hub: 0xe0c060,
  hubBase: 0x4a4f58,
  beacon: 0x7fd1ff,
  selection: 0x7fd1ff,

  // Details der Gebaeude-Modelle.
  hazard: 0x23262b,
  rubber: 0x1f2329,
  bolt: 0xd6dce4,
  glass: 0x9fd8f0,
  brick: 0x9a5a40,
  brickDark: 0x7d4630,
  coal: 0x2a2a2e,
  extractorCap: 0xc2512f,
  assemblerPanel: 0x5c8cc4,
  hubTrim: 0xf3dc8a,
  hubPad: 0x5a616c,

  // Gebaeude der Hub-Stufen (Platzhalter-Modelle in models/logistics.ts).
  splitter: 0x4f9a7a,
  merger: 0x8a6fb0,
  tunnel: 0xd9a63a,
  foundry: 0x6a6f78,
  foundryGlow: 0xffa040,
  extractorMk2: 0x3f8fc0,
} as const;

export const cssHex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
