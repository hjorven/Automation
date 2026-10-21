/** Richtung auf dem Gitter. Bildschirm-y zeigt nach unten. */
export type Dir = 0 | 1 | 2 | 3; // 0 = rechts, 1 = unten, 2 = links, 3 = oben

export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateCW = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const rotateCCW = (d: Dir): Dir => ((d + 3) % 4) as Dir;

export const tileKey = (x: number, y: number) => `${x},${y}`;

/** Richtung von Feld a zum direkt benachbarten Feld b, sonst null. */
export function dirBetween(ax: number, ay: number, bx: number, by: number): Dir | null {
  for (let d = 0; d < 4; d++) {
    if (ax + DX[d] === bx && ay + DY[d] === by) return d as Dir;
  }
  return null;
}
