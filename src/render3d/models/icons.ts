import { ExtrudeGeometry, Group, Shape, type BufferGeometry } from "three";
import { PALETTE as P } from "../palette";
import { Paint, boxG, cylG } from "./kit";

// Werkzeuge ohne Gebaeude (Hand, Abriss, Drehen, Menue) als kleine Objekte auf
// der Bodenplatte der Gebaeude: Greifer, Dynamit, Drehteller, Steuerpult.
// Nur fuer die Werkzeugleiste.

export type IconTool = "hand" | "delete" | "rotate" | "menu";

/** Pfeil nach +x als Relief (Unterkante y = 0), gedreht wie die Sim-Richtung `dir`. */
function arrowSolid(depth: number, dir: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.38, -0.09);
  s.lineTo(0.04, -0.09);
  s.lineTo(0.04, -0.24);
  s.lineTo(0.38, 0);
  s.lineTo(0.04, 0.24);
  s.lineTo(0.04, 0.09);
  s.lineTo(-0.38, 0.09);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  // dir 0 = +x, 1 = +z (Bildschirm unten), ... wie bei den Gebaeuden.
  g.rotateY((-dir * Math.PI) / 2);
  return g;
}

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

/** `dir` dreht nur den Pfeil auf dem Drehteller (fuer den Drehen-Knopf). */
export function iconModel(tool: IconTool, dir = 0): Group {
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
      p.add(arrowSolid(0.06, dir).translate(0, 0.18, 0), P.port);
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
