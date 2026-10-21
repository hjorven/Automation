import { ExtrudeGeometry, Group, Shape, type BufferGeometry } from "three";
import { PALETTE as P } from "../palette";
import { Paint, boxG, cylG, paintMetalMat } from "./kit";

// Symbole fuer Werkzeuge ohne Gebaeude (Hand, Abriss, Drehen, Menue), nur fuer
// die Werkzeugleiste. Mehrere Stil-Varianten zur Auswahl.

export type IconTool = "hand" | "delete" | "rotate" | "menu";
/**
 * A: Plakette (Metallplatte mit Warnstreifen, gelbes Relief-Symbol, schraeg)
 * B: Signalschild (rundes Industrieschild auf Pfosten)
 * C: Kachel (wie A, aber genau von oben: flach und klar)
 * D: Werkzeug (Greifer, Dynamit, Drehteller, Terminal auf Bodenplatte)
 */
export type IconStyle = "A" | "B" | "C" | "D";
export const ICON_STYLES: readonly IconStyle[] = ["A", "B", "C", "D"];

// ---------------------------------------------------------------- Symbole (2D)
// Umrisse in der x-y-Ebene, etwa im Bereich -0.4..0.4.

function rect(x: number, y: number, w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(x, y);
  s.lineTo(x + w, y);
  s.lineTo(x + w, y + h);
  s.lineTo(x, y + h);
  s.closePath();
  return s;
}

function rotated(shape: Shape, a: number, cx: number, cy: number): Shape {
  const pts = shape.getPoints().map((p) => {
    const x = p.x - cx;
    const y = p.y - cy;
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as const;
  });
  const s = new Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function glyph(tool: IconTool): Shape[] {
  switch (tool) {
    case "hand":
      return [
        rect(-0.2, -0.38, 0.38, 0.4),
        rect(-0.2, 0.0, 0.085, 0.3),
        rect(-0.1, 0.0, 0.085, 0.38),
        rect(0.0, 0.0, 0.085, 0.36),
        rect(0.1, 0.0, 0.08, 0.28),
        rotated(rect(0.14, -0.2, 0.2, 0.09), 0.6, 0.16, -0.16),
      ];
    case "delete":
      return [rotated(rect(-0.32, 0.1, 0.5, 0.2), -0.6, 0, 0), rotated(rect(-0.05, -0.42, 0.1, 0.56), -0.6, 0, 0)];
    case "rotate": {
      const s = new Shape();
      s.moveTo(-0.38, -0.09);
      s.lineTo(0.04, -0.09);
      s.lineTo(0.04, -0.24);
      s.lineTo(0.38, 0);
      s.lineTo(0.04, 0.24);
      s.lineTo(0.04, 0.09);
      s.lineTo(-0.38, 0.09);
      s.closePath();
      return [s];
    }
    case "menu":
      return [rect(-0.3, 0.16, 0.6, 0.1), rect(-0.3, -0.05, 0.6, 0.1), rect(-0.3, -0.26, 0.6, 0.1)];
  }
}

/** Symbol als Relief, liegend (Oberseite +y), Unterkante bei y = 0. */
function glyphSolid(tool: IconTool, depth: number, dir = 0): BufferGeometry[] {
  return glyph(tool).map((s) => {
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2);
    // Gleiche Drehung wie Gebaeude: dir 0 = +x, 1 = +z (Bildschirm unten), ...
    g.rotateY((-dir * Math.PI) / 2);
    return g;
  });
}

// ---------------------------------------------------------------- Varianten

/** Gemeinsame Bodenplatte wie bei den Gebaeuden (Warnstreifen an den Kanten). */
function basePlate(p: Paint, size: number) {
  p.add(boxG(size, 0.1, size), P.metalDark);
  const w = size / 7;
  for (let i = -3; i <= 3; i++) {
    const c = i % 2 === 0 ? P.extractor : P.hazard;
    p.add(boxG(w, 0.012, 0.035, i * w, 0.1, -size / 2 + 0.0175), c);
    p.add(boxG(w, 0.012, 0.035, i * w, 0.1, size / 2 - 0.0175), c);
  }
}

const TOOL_COLOR: Record<IconTool, number> = {
  hand: P.assembler,
  delete: 0xb83a2e,
  rotate: P.extractor,
  menu: P.metal,
};

function plaque(tool: IconTool, dir: number): Group {
  const p = new Paint();
  basePlate(p, 0.92);
  p.add(boxG(0.74, 0.06, 0.74, 0, 0.1, 0), TOOL_COLOR[tool]);
  for (const g of glyphSolid(tool, 0.07, dir)) {
    g.translate(0, 0.16, 0);
    p.add(g, tool === "rotate" ? P.hazard : P.port);
  }
  const root = new Group();
  root.add(p.mesh());
  return root;
}

function sign(tool: IconTool, dir: number): Group {
  const p = new Paint();
  p.add(boxG(0.4, 0.06, 0.4), P.metalDark);
  p.add(cylG(0.035, 0.035, 0.5, 6, 0, 0.06, 0), P.metalLight);
  const disc = new Paint();
  disc.add(cylG(0.4, 0.4, 0.06, 20, 0, -0.03, 0), P.hubTrim);
  disc.add(cylG(0.35, 0.35, 0.07, 20, 0, -0.035, 0), TOOL_COLOR[tool]);
  for (const g of glyphSolid(tool, 0.04, dir)) {
    g.scale(0.85, 1, 0.85);
    g.translate(0, 0.035, 0);
    disc.add(g, 0xf4f6f8);
  }
  // Scheibe aufrichten, Vorderseite zur Kamera der Werkzeugleiste.
  const d = disc.mesh(paintMetalMat);
  d.rotation.set(Math.PI / 2, 0, 0);
  const holder = new Group();
  holder.position.set(0, 0.95, 0);
  holder.rotation.y = 0.6;
  holder.add(d);
  const root = new Group();
  root.add(p.mesh(), holder);
  return root;
}

function tool3d(tool: IconTool, dir: number): Group {
  const p = new Paint();
  basePlate(p, 0.92);
  switch (tool) {
    case "hand": {
      // Greifer am Galgen.
      p.add(boxG(0.08, 0.8, 0.08, -0.3, 0.1, 0), P.extractor);
      p.add(boxG(0.5, 0.07, 0.08, -0.06, 0.86, 0), P.extractor);
      p.add(cylG(0.015, 0.015, 0.18, 6, 0.12, 0.68, 0), P.metalLight);
      p.add(boxG(0.18, 0.06, 0.12, 0.12, 0.62, 0), P.metalDark);
      for (const s of [-1, 1]) {
        const claw = boxG(0.04, 0.24, 0.06, 0, -0.24, 0);
        claw.rotateZ(s * 0.35);
        claw.translate(0.12 + s * 0.06, 0.62, 0);
        p.add(claw, P.port);
      }
      p.add(boxG(0.16, 0.12, 0.16, 0.12, 0.1, 0), P.assembler);
      break;
    }
    case "delete": {
      // Dynamitbuendel mit Zuendschnur.
      for (const [x, z] of [
        [-0.09, -0.05],
        [0.09, -0.05],
        [0, 0.1],
      ]) {
        p.add(cylG(0.09, 0.09, 0.5, 8, x, 0.1, z), 0xc0392b);
        p.add(cylG(0.03, 0.03, 0.06, 6, x, 0.6, z), P.hazard);
      }
      p.add(cylG(0.17, 0.17, 0.06, 10, 0, 0.3, 0.02), P.hazard);
      const fuse = cylG(0.012, 0.012, 0.22, 4, 0, 0, 0);
      fuse.rotateZ(-0.6);
      fuse.translate(0.02, 0.64, 0.1);
      p.add(fuse, 0xd8c8a0);
      p.add(cylG(0.03, 0.03, 0.03, 6, 0.1, 0.8, 0.1), 0xffd24a);
      break;
    }
    case "rotate": {
      // Drehteller mit Pfeil.
      p.add(cylG(0.36, 0.38, 0.08, 16, 0, 0.1, 0), P.metal);
      for (const g of glyphSolid("rotate", 0.06, dir)) {
        g.translate(0, 0.18, 0);
        p.add(g, P.port);
      }
      break;
    }
    case "menu": {
      // Steuerpult mit Bildschirm.
      p.add(boxG(0.6, 0.3, 0.5, 0, 0.1, 0), P.assembler);
      const screen = boxG(0.56, 0.36, 0.06, 0, 0, 0);
      screen.rotateX(-0.35);
      screen.translate(0, 0.42, -0.12);
      p.add(screen, P.metalDark);
      const glass = boxG(0.46, 0.27, 0.01, 0, 0.04, 0.03);
      glass.rotateX(-0.35);
      glass.translate(0, 0.42, -0.12);
      p.add(glass, P.glass);
      for (const x of [-0.16, 0, 0.16]) p.add(boxG(0.1, 0.03, 0.08, x, 0.4, 0.14), x ? P.port : 0x3fae5a);
      break;
    }
  }
  const root = new Group();
  root.add(p.mesh());
  return root;
}

/** `dir` dreht nur das Symbol (fuer den Drehen-Knopf, wie die Sim-Richtung). */
export function iconModel(tool: IconTool, style: IconStyle, dir = 0): Group {
  switch (style) {
    case "A":
    case "C":
      return plaque(tool, dir);
    case "B":
      return sign(tool, dir);
    case "D":
      return tool3d(tool, dir);
  }
}
