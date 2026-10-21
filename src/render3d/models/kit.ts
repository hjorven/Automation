import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from "three";

// Baukasten fuer prozedurale Low-Poly-Modelle. Konvention: eine Gitterzelle =
// 1 Einheit, Modell zentriert auf (0, 0, 0), Boden bei y = 0, Ausgang nach +x.

const matCache = new Map<string, MeshStandardMaterial>();

/** Gemeinsames, flach schattiertes Material pro Farbe. */
export function mat(color: number, opts: { metal?: number; rough?: number } = {}): MeshStandardMaterial {
  const metal = opts.metal ?? 0.1;
  const rough = opts.rough ?? 0.75;
  const key = `${color}:${metal}:${rough}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, flatShading: true, metalness: metal, roughness: rough });
    matCache.set(key, m);
  }
  return m;
}

/** Material fuer eingefaerbte Geometrie (Farbe steckt in den Vertices). */
export const paintMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.15, roughness: 0.7 });
export const paintMetalMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.45, roughness: 0.45 });

export function mesh(geo: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- Geometrie-Bausteine
// Alle Bausteine liegen mit der Unterkante auf `y`.

export function boxG(w: number, h: number, d: number, x = 0, y = 0, z = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

export function cylG(rTop: number, rBottom: number, h: number, seg: number, x = 0, y = 0, z = 0): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBottom, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

export function coneG(r: number, h: number, seg: number, x = 0, y = 0, z = 0): BufferGeometry {
  const g = new ConeGeometry(r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * Sammelt eingefaerbte Teile und verschmilzt sie zu einer Geometrie mit
 * Vertex-Farben: ein Draw-Call statt einem pro Teil (wichtig auf dem iPad).
 */
export class Paint {
  private readonly parts: BufferGeometry[] = [];
  private readonly c = new Color();

  add(geo: BufferGeometry, color: number): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    this.c.setHex(color);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([this.c.r, this.c.g, this.c.b], i * 3);
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  build(): BufferGeometry {
    return mergeGeometries(this.parts);
  }

  mesh(material: Material = paintMat): Mesh {
    return mesh(this.build(), material);
  }
}

/** Verschmilzt Geometrien (position, normal und, falls ueberall vorhanden, color). */
export function mergeGeometries(list: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const withColor = list.every((g) => g.getAttribute("color"));
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    g.computeVertexNormals();
    pos.push(...(g.getAttribute("position").array as Float32Array));
    nor.push(...(g.getAttribute("normal").array as Float32Array));
    if (withColor) col.push(...(g.getAttribute("color").array as Float32Array));
    if (g !== src) g.dispose();
    src.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  if (withColor) out.setAttribute("color", new Float32BufferAttribute(col, 3));
  return out;
}
