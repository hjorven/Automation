// Zentrale Konstanten. Hier wird spaeter auch die Tick-Rate der Simulation landen.

export const TILE_SIZE = 64; // Pixel pro Gitter-Zelle bei Zoom 1
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export const COLORS = {
  background: 0x0e1116,
  gridLine: 0x1c2733,
  gridLineMajor: 0x2a3a4d,
  origin: 0x3a506b,
} as const;
