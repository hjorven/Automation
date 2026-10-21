import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Material,
} from "three";
import type { ItemId } from "../sim/items";
import { ITEM_COLORS, PALETTE } from "./palette";

// Prozedurale Low-Poly-Modelle. Konvention: eine Gitterzelle = 1 Einheit,
// Modell zentriert auf (0, 0, 0), Boden bei y = 0, Ausgang zeigt nach +x.

/** Hoehe der Bandoberflaeche; Items liegen darauf. */
export const BELT_TOP = 0.12;

const matCache = new Map<number, MeshStandardMaterial>();

/** Gemeinsames, flach schattiertes Material pro Farbe. */
export function mat(color: number, opts: { metal?: number; rough?: number } = {}): MeshStandardMaterial {
  const key = color * 100 + Math.round((opts.metal ?? 0.1) * 10) * 10 + Math.round((opts.rough ?? 0.75) * 9);
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: opts.metal ?? 0.1,
      roughness: opts.rough ?? 0.75,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box, deren Unterkante auf `y` liegt. */
function box(w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0): Mesh {
  return mesh(new BoxGeometry(w, h, d), material, x, y + h / 2, z);
}

// ---------------------------------------------------------------- Baender

/** Laufband-Textur mit Pfeilen; `offset.x` wird animiert. */
export function createBeltTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2b3038";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#353b45";
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
  g.strokeStyle = "#8a96a6";
  g.lineWidth = 6;
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(22, 14);
  g.lineTo(40, 32);
  g.lineTo(22, 50);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const BED_W = 0.76;
const RAIL_W = 0.08;
const RAIL_H = 0.16;

/** Bandflaeche eines geraden Bands (u laeuft entlang +x). */
export function straightBedGeometry(): BufferGeometry {
  const h = BED_W / 2;
  const pos = [-0.5, BELT_TOP, -h, 0.5, BELT_TOP, -h, 0.5, BELT_TOP, h, -0.5, BELT_TOP, h];
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return g;
}

export function straightFrameGeometry(): BufferGeometry {
  return mergeBoxes([
    [1, BELT_TOP - 0.02, BED_W, 0, 0, 0],
    [1, RAIL_H, RAIL_W, 0, 0, -(BED_W / 2 + RAIL_W / 2)],
    [1, RAIL_H, RAIL_W, 0, 0, BED_W / 2 + RAIL_W / 2],
  ]);
}

/**
 * Kurve von der Kante z = -0.5 (bzw. +0.5 bei `right`) zur Kante x = +0.5,
 * als Viertelkreis um die gemeinsame Ecke. u laeuft entlang der Kurve.
 */
export function curveBedGeometry(right: boolean, segments = 10): BufferGeometry {
  const s = right ? 1 : -1;
  const cx = 0.5;
  const cz = 0.5 * s;
  const rIn = 0.5 - BED_W / 2;
  const rOut = 0.5 + BED_W / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // Winkel von der Eintrittskante (Richtung -x von der Ecke) zur Austrittskante (Richtung -s*z).
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (t * Math.PI) / 2;
    const dx = -Math.cos(a);
    const dz = -Math.sin(a) * s;
    pos.push(cx + dx * rIn, BELT_TOP, cz + dz * rIn, cx + dx * rOut, BELT_TOP, cz + dz * rOut);
    // Bogenlaenge der Mittellinie (r = 0.5) ist ~0.785 statt 1: Pfeile leicht gestaucht, passt zum Tempo.
    uv.push(t * 0.785, right ? 1 : 0, t * 0.785, right ? 0 : 1);
    if (i > 0) {
      const b = (i - 1) * 2;
      if (right) idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function curveFrameGeometry(right: boolean): BufferGeometry {
  const s = right ? 1 : -1;
  const sector = (r0: number, r1: number) => {
    // Shape in (x, -z), weil die Extrusion danach um -90 Grad um x gekippt wird.
    const sh = new Shape();
    const n = 10;
    const pt = (r: number, a: number) => [0.5 - Math.cos(a) * r, (0.5 * s + -Math.sin(a) * r * s) * -1] as const;
    sh.moveTo(...pt(r0, 0));
    for (let i = 1; i <= n; i++) sh.lineTo(...pt(r0, ((i / n) * Math.PI) / 2));
    for (let i = n; i >= 0; i--) sh.lineTo(...pt(r1, ((i / n) * Math.PI) / 2));
    return sh;
  };
  const rIn = 0.5 - BED_W / 2;
  const rOut = 0.5 + BED_W / 2;
  const parts = [
    extrude(sector(rIn, rOut), BELT_TOP - 0.02),
    extrude(sector(Math.max(0.01, rIn - RAIL_W), rIn), RAIL_H),
    extrude(sector(rOut, rOut + RAIL_W), RAIL_H),
  ];
  return mergeGeometries(parts);
}

function extrude(shape: Shape, depth: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** [w, h, d, x, yBottom, z] */
function mergeBoxes(list: [number, number, number, number, number, number][]): BufferGeometry {
  return mergeGeometries(
    list.map(([w, h, d, x, y, z]) => {
      const g = new BoxGeometry(w, h, d);
      g.translate(x, y + h / 2, z);
      return g;
    }),
  );
}

/** Minimaler Ersatz fuer BufferGeometryUtils.mergeGeometries (nur position/normal). */
function mergeGeometries(list: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    g.computeVertexNormals();
    pos.push(...(g.getAttribute("position").array as Float32Array));
    nor.push(...(g.getAttribute("normal").array as Float32Array));
    src.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  return out;
}

// ---------------------------------------------------------------- Gebaeude

/** Kleiner Pfeil am Ausgang eines Gebaeudes. */
function outputMarker(y: number): Mesh {
  const g = new ConeGeometry(0.09, 0.16, 3);
  g.rotateZ(-Math.PI / 2);
  const m = mesh(g, mat(PALETTE.port, { rough: 0.5 }), 0.44, y, 0);
  m.castShadow = false;
  return m;
}

// Animierte Teile tragen Namen, damit sie in Klonen (Object3D.clone teilt
// Geometrie und Material) wiedergefunden werden.

export function extractorModel(): Group {
  const root = new Group();
  root.add(box(0.88, 0.14, 0.88, mat(PALETTE.metalDark)));
  root.add(box(0.62, 0.42, 0.62, mat(PALETTE.extractorBody), -0.04, 0.14, 0));
  // Gelbe Eckpfosten.
  for (const [x, z] of [
    [-0.36, -0.36],
    [-0.36, 0.36],
    [0.28, -0.36],
    [0.28, 0.36],
  ]) {
    root.add(box(0.1, 0.62, 0.1, mat(PALETTE.extractor), x, 0.14, z));
  }
  // Auswurf-Rutsche zum Band.
  root.add(box(0.22, 0.1, 0.3, mat(PALETTE.metal), 0.36, 0.22, 0));
  root.add(outputMarker(0.36));

  const head = new Group();
  head.name = "head";
  head.position.set(-0.04, 0.56, 0);
  head.add(mesh(new CylinderGeometry(0.2, 0.24, 0.12, 8), mat(PALETTE.metal, { metal: 0.4 }), 0, 0.06, 0));
  for (let i = 0; i < 3; i++) {
    const fin = box(0.46, 0.06, 0.08, mat(PALETTE.extractor), 0, 0.12, 0);
    fin.rotation.y = (i * Math.PI) / 3;
    head.add(fin);
  }
  head.add(mesh(new ConeGeometry(0.08, 0.2, 6), mat(PALETTE.metalLight, { metal: 0.5 }), 0, 0.26, 0));
  root.add(head);
  return root;
}

export function smelterModel(): Group {
  const root = new Group();
  root.add(box(0.9, 0.12, 0.9, mat(PALETTE.smelterStone)));
  root.add(mesh(new CylinderGeometry(0.34, 0.42, 0.5, 8), mat(PALETTE.smelter), 0, 0.37, 0));
  root.add(mesh(new CylinderGeometry(0.28, 0.34, 0.12, 8), mat(PALETTE.smelterStone), 0, 0.68, 0));

  // Glut: Material wird je Schmelze geklont, weil die Helligkeit pro Gebaeude animiert wird.
  const glow = new MeshStandardMaterial({
    color: 0x401a08,
    emissive: PALETTE.smelterGlow,
    emissiveIntensity: 0,
    flatShading: true,
  });
  const mouth = mesh(new BoxGeometry(0.06, 0.18, 0.26), glow, 0.4, 0.3, 0);
  mouth.name = "glow";
  mouth.castShadow = false;
  root.add(mouth);
  const top = mesh(new CylinderGeometry(0.2, 0.2, 0.02, 8), glow, 0, 0.75, 0);
  top.name = "glow";
  top.castShadow = false;
  root.add(top);

  // Schornstein hinten.
  root.add(box(0.16, 0.5, 0.16, mat(PALETTE.smelterStone), -0.3, 0.12, -0.28));
  root.add(box(0.2, 0.06, 0.2, mat(PALETTE.metalDark), -0.3, 0.62, -0.28));
  root.add(outputMarker(0.16));

  const puffMat = new MeshStandardMaterial({ color: 0xd8dde3, flatShading: true, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 3; i++) {
    const p = new Mesh(new DodecahedronGeometry(0.08), puffMat);
    p.name = "puff";
    p.visible = false;
    root.add(p);
  }
  return root;
}

export function assemblerModel(): Group {
  const root = new Group();
  root.add(box(0.92, 0.12, 0.92, mat(PALETTE.metalDark)));
  root.add(box(0.8, 0.36, 0.8, mat(PALETTE.assembler), 0, 0.12, 0));
  root.add(box(0.66, 0.06, 0.66, mat(PALETTE.assemblerTop), 0, 0.48, 0));
  // Eingangs-/Ausgangsklappen.
  root.add(box(0.06, 0.2, 0.36, mat(PALETTE.metal), 0.42, 0.14, 0));
  root.add(box(0.06, 0.2, 0.36, mat(PALETTE.metalDark), -0.42, 0.14, 0));
  root.add(outputMarker(0.4));

  const arm = new Group();
  arm.name = "arm";
  arm.position.set(-0.18, 0.54, -0.18);
  arm.add(mesh(new CylinderGeometry(0.07, 0.09, 0.3, 6), mat(PALETTE.metalLight, { metal: 0.4 }), 0, 0.15, 0));
  const boom = box(0.42, 0.07, 0.07, mat(PALETTE.port), 0.18, 0.26, 0);
  arm.add(boom);
  arm.add(box(0.06, 0.16, 0.06, mat(PALETTE.metalLight), 0.38, 0.14, 0));
  root.add(arm);

  const icon = new Group();
  icon.name = "icon";
  icon.position.set(0.12, 0.92, 0.12);
  root.add(icon);
  return root;
}

export function hubModel(): Group {
  const root = new Group();
  root.add(mesh(new CylinderGeometry(0.5, 0.56, 0.16, 8), mat(PALETTE.hubBase), 0, 0.08, 0));
  root.add(mesh(new CylinderGeometry(0.38, 0.46, 0.34, 8), mat(PALETTE.hub, { metal: 0.5, rough: 0.4 }), 0, 0.33, 0));
  root.add(mesh(new CylinderGeometry(0.08, 0.1, 0.7, 6), mat(PALETTE.metalLight, { metal: 0.5 }), 0, 0.85, 0));
  const beacon = new MeshStandardMaterial({ color: PALETTE.beacon, emissive: PALETTE.beacon, emissiveIntensity: 1, flatShading: true });
  const b = mesh(new SphereGeometry(0.1, 8, 6), beacon, 0, 1.25, 0);
  b.name = "beacon";
  root.add(b);
  const ring = mesh(new TorusGeometry(0.42, 0.04, 6, 16), mat(PALETTE.hub, { metal: 0.6, rough: 0.35 }), 0, 0.8, 0);
  ring.name = "ring";
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  return root;
}

// ---------------------------------------------------------------- Items

/** Geometrie je Item, Boden bei y = 0, etwa 0.22 Einheiten gross. */
export function itemGeometry(item: ItemId): BufferGeometry {
  switch (item) {
    case "iron_ore":
    case "copper_ore": {
      const g = new DodecahedronGeometry(0.11);
      g.translate(0, 0.09, 0);
      return g;
    }
    case "iron_plate":
    case "copper_plate": {
      const g = new BoxGeometry(0.24, 0.05, 0.24);
      g.translate(0, 0.025, 0);
      return g;
    }
    case "gear": {
      const sh = new Shape();
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.13 : 0.095;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) sh.moveTo(x, y);
        else sh.lineTo(x, y);
      }
      const g = new ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case "wire": {
      const g = new TorusGeometry(0.08, 0.035, 5, 10);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.035, 0);
      return g;
    }
    case "circuit": {
      const g = new BoxGeometry(0.26, 0.05, 0.2);
      g.translate(0, 0.025, 0);
      return g;
    }
  }
}

export function itemMaterial(item: ItemId): MeshStandardMaterial {
  const metal = item === "iron_plate" || item === "copper_plate" || item === "gear" || item === "wire";
  return mat(ITEM_COLORS[item], { metal: metal ? 0.45 : 0.05, rough: metal ? 0.45 : 0.8 });
}
