import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import { boxG, mergeGeometries } from "./kit";

/** Hoehe der Bandoberflaeche; Items liegen darauf. */
export const BELT_TOP = 0.12;

const BED_W = 0.76;
const RAIL_W = 0.08;
const RAIL_H = 0.16;
/** Ueberstand der Schienen-Oberkante nach innen (Lippe ueber dem Band). */
const LIP = 0.025;

/** Laufband-Textur mit Gummi-Rillen und Pfeil; `offset.x` wird animiert. */
export function createBeltTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#262b33";
  g.fillRect(0, 0, 128, 128);
  // Querrillen des Gurts.
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = "#30363f";
    g.fillRect(x, 0, 7, 128);
    g.fillStyle = "#1d2128";
    g.fillRect(x + 7, 0, 2, 128);
  }
  // Abgenutzte Randstreifen.
  g.fillStyle = "#1b1f25";
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 118, 128, 10);
  // Pfeil.
  g.strokeStyle = "#9aa6b6";
  g.lineWidth = 11;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(46, 30);
  g.lineTo(80, 64);
  g.lineTo(46, 98);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

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

/** Rahmen: Bett, zwei Schienen mit Lippe, Stuetzen aussen. */
export function straightFrameGeometry(): BufferGeometry {
  const zr = BED_W / 2 + RAIL_W / 2;
  const parts = [
    boxG(1, BELT_TOP - 0.02, BED_W),
    boxG(1, RAIL_H, RAIL_W, 0, 0, -zr),
    boxG(1, RAIL_H, RAIL_W, 0, 0, zr),
    boxG(1, 0.03, RAIL_W + LIP, 0, RAIL_H, -zr + LIP / 2),
    boxG(1, 0.03, RAIL_W + LIP, 0, RAIL_H, zr - LIP / 2),
  ];
  for (const z of [-1, 1]) {
    parts.push(boxG(0.08, RAIL_H - 0.02, 0.05, 0, 0, z * (BED_W / 2 + RAIL_W + 0.02)));
  }
  return mergeGeometries(parts);
}

/** Punkt auf der Kurve: Radius `r` um die Ecke, Winkel `a` von Eintritt (0) bis Austritt (pi/2). */
function curvePoint(right: boolean, r: number, a: number): [number, number] {
  const s = right ? 1 : -1;
  return [0.5 - Math.cos(a) * r, 0.5 * s - Math.sin(a) * r * s];
}

/**
 * Kurve von der Kante z = -0.5 (bzw. +0.5 bei `right`) zur Kante x = +0.5,
 * als Viertelkreis um die gemeinsame Ecke. u laeuft entlang der Kurve.
 */
export function curveBedGeometry(right: boolean, segments = 12): BufferGeometry {
  const rIn = 0.5 - BED_W / 2;
  const rOut = 0.5 + BED_W / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (t * Math.PI) / 2;
    const [xi, zi] = curvePoint(right, rIn, a);
    const [xo, zo] = curvePoint(right, rOut, a);
    pos.push(xi, BELT_TOP, zi, xo, BELT_TOP, zo);
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
  const rIn = 0.5 - BED_W / 2;
  const rOut = 0.5 + BED_W / 2;
  return mergeGeometries([
    arcSolid(right, rIn, rOut, 0, BELT_TOP - 0.02),
    arcSolid(right, Math.max(0.01, rIn - RAIL_W), rIn, 0, RAIL_H),
    arcSolid(right, rOut, rOut + RAIL_W, 0, RAIL_H),
    arcSolid(right, Math.max(0.01, rIn - RAIL_W), rIn + LIP, RAIL_H, RAIL_H + 0.03),
    arcSolid(right, rOut - LIP, rOut + RAIL_W, RAIL_H, RAIL_H + 0.03),
  ]);
}

/**
 * Ringsektor als geschlossener Koerper (Ober-/Unterseite, Innen-/Aussenwand,
 * Stirnflaechen). Die Dreiecke werden anhand der erwarteten Normalen
 * ausgerichtet, damit nichts von hinten unsichtbar bleibt.
 */
function arcSolid(right: boolean, r0: number, r1: number, y0: number, y1: number, n = 12): BufferGeometry {
  const pos: number[] = [];
  const s = right ? 1 : -1;
  const center = new Vector3(0.5, 0, 0.5 * s);
  const v = (r: number, a: number, y: number) => {
    const [x, z] = curvePoint(right, r, a);
    return new Vector3(x, y, z);
  };
  const e1 = new Vector3();
  const e2 = new Vector3();
  const tri = (a: Vector3, b: Vector3, c: Vector3, want: Vector3) => {
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    const flip = e1.cross(e2).dot(want) < 0;
    for (const p of flip ? [a, c, b] : [a, b, c]) pos.push(p.x, p.y, p.z);
  };
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, want: Vector3) => {
    tri(a, b, c, want);
    tri(a, c, d, want);
  };
  const up = new Vector3(0, 1, 0);
  const down = new Vector3(0, -1, 0);

  for (let i = 0; i < n; i++) {
    const a0 = ((i / n) * Math.PI) / 2;
    const a1 = (((i + 1) / n) * Math.PI) / 2;
    const am = (a0 + a1) / 2;
    const outward = v(1, am, 0).sub(center).setY(0).normalize();
    const inward = outward.clone().negate();
    quad(v(r0, a0, y1), v(r1, a0, y1), v(r1, a1, y1), v(r0, a1, y1), up);
    quad(v(r0, a0, y0), v(r1, a0, y0), v(r1, a1, y0), v(r0, a1, y0), down);
    quad(v(r1, a0, y0), v(r1, a1, y0), v(r1, a1, y1), v(r1, a0, y1), outward);
    quad(v(r0, a0, y0), v(r0, a1, y0), v(r0, a1, y1), v(r0, a0, y1), inward);
  }
  // Stirnflaechen: Eintritt zeigt entgegen der Laufrichtung, Austritt in sie hinein.
  const capIn = v(0.5, 0, 0).sub(v(0.5, 0.01, 0)).setY(0).normalize();
  const capOut = v(0.5, Math.PI / 2, 0).sub(v(0.5, Math.PI / 2 - 0.01, 0)).setY(0).normalize();
  quad(v(r0, 0, y0), v(r1, 0, y0), v(r1, 0, y1), v(r0, 0, y1), capIn);
  const e = Math.PI / 2;
  quad(v(r0, e, y0), v(r1, e, y0), v(r1, e, y1), v(r0, e, y1), capOut);

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
