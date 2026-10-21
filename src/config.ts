// Zentrale Render-Konstanten. Simulations-Konstanten liegen in sim/constants.ts.

export const TILE_SIZE = 64; // Pixel pro Gitter-Zelle bei Zoom 1
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export const COLORS = {
  background: 0x0e1116,
  gridLine: 0x1c2733,
  gridLineMajor: 0x2a3a4d,
  ore: { iron_ore: 0x5f7790, copper_ore: 0x9a5a34 },

  belt: 0x232c37,
  beltTrack: 0x3a4757,
  beltArrow: 0x6b7c90,
  extractor: 0x3d4f63,
  smelter: 0x6b3f2a,
  smelterCore: 0x2a1a12,
  smelterGlow: 0xff8a3d,
  assembler: 0x2f4a6b,
  assemblerCore: 0x1b2b3f,
  hub: 0x6e5d22,
  hubRing: 0xe0c060,
  marker: 0xcfd8e3,

  progress: 0x7fd1ff,
  selection: 0x7fd1ff,
} as const;
