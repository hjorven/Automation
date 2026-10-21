import { CylinderGeometry, Group, Shape, ExtrudeGeometry } from "three";
import { PALETTE as P } from "../palette";
import { Paint, boxG, cylG, paintMetalMat } from "./kit";

// Kleine 3D-Objekte fuer Werkzeuge ohne Gebaeude (nur fuer die Werkzeugleiste).
// Gleicher Stil wie die Maschinen: flach schattiert, Vertex-Farben.

/** Arbeitshandschuh mit Stulpe, leicht gekippt. */
export function handIconModel(): Group {
  const p = new Paint();
  const glove = P.extractor;
  const dark = 0xb8862a;
  p.add(boxG(0.36, 0.1, 0.4, 0, 0, 0), glove); // Handflaeche
  const fingers: [number, number][] = [
    [-0.135, 0.3],
    [-0.045, 0.34],
    [0.045, 0.33],
    [0.135, 0.28],
  ];
  for (const [x, len] of fingers) p.add(boxG(0.08, 0.09, len, x, 0.005, -0.2 - len / 2 + 0.02), glove);
  for (const [x, len] of fingers) p.add(boxG(0.082, 0.02, 0.03, x, 0.09, -0.2 - len + 0.06), dark);
  const thumb = boxG(0.09, 0.09, 0.22, 0, 0, -0.11);
  thumb.rotateY(-0.9);
  thumb.translate(0.17, 0.005, -0.02);
  p.add(thumb, glove);
  p.add(boxG(0.4, 0.13, 0.16, 0, -0.015, 0.26), P.metalDark); // Stulpe
  p.add(boxG(0.41, 0.03, 0.04, 0, 0.06, 0.2), P.port);
  // Aufrichten: Finger nach oben, Handflaeche zur Kamera.
  const g = new Group();
  const m = p.mesh();
  m.rotation.set(Math.PI / 2 - 0.15, 0.55, 0, "YXZ");
  m.scale.setScalar(1.35);
  m.position.y = 0.2;
  g.add(m);
  return g;
}

/** Vorschlaghammer: roter Kopf, Holzstiel. */
export function deleteIconModel(): Group {
  const p = new Paint();
  p.add(boxG(0.46, 0.2, 0.2, 0, -0.1, 0), 0xc0392b);
  p.add(boxG(0.06, 0.22, 0.22, -0.2, -0.11, 0), P.metal);
  p.add(boxG(0.06, 0.22, 0.22, 0.2, -0.11, 0), P.metal);
  p.add(cylG(0.045, 0.05, 0.9, 6, 0, -0.9, 0), 0x8a5a34);
  p.add(cylG(0.055, 0.055, 0.18, 6, 0, -0.9, 0), P.rubber);
  const m = p.mesh(paintMetalMat);
  m.rotation.z = -0.75;
  m.rotation.y = 0.5;
  m.scale.setScalar(1.3);
  const g = new Group();
  m.position.set(-0.2, 0.75, 0);
  g.add(m);
  return g;
}

/** Dicker Pfeil nach +x (Drehung uebernimmt die Werkzeugleiste). */
export function rotateIconModel(): Group {
  const sh = new Shape();
  sh.moveTo(-0.42, -0.1);
  sh.lineTo(0.06, -0.1);
  sh.lineTo(0.06, -0.26);
  sh.lineTo(0.44, 0);
  sh.lineTo(0.06, 0.26);
  sh.lineTo(0.06, 0.1);
  sh.lineTo(-0.42, 0.1);
  sh.closePath();
  const top = new ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 });
  top.rotateX(-Math.PI / 2);
  const p = new Paint();
  p.add(boxG(0.98, 0.06, 0.72, 0, 0, 0), P.metalDark);
  top.translate(0, 0.08, 0);
  p.add(top, P.port);
  const g = new Group();
  g.add(p.mesh());
  return g;
}

/** Diskette fuer Speichern/Laden. */
export function menuIconModel(): Group {
  const p = new Paint();
  p.add(boxG(0.8, 0.08, 0.8), 0x2c4f7a);
  p.add(boxG(0.44, 0.02, 0.26, 0.02, 0.08, -0.27), P.metalLight);
  p.add(boxG(0.1, 0.022, 0.18, 0.1, 0.08, -0.27), 0x2c4f7a);
  p.add(boxG(0.6, 0.02, 0.36, 0, 0.08, 0.17), 0xeef1f5);
  for (const z of [0.08, 0.16, 0.24]) p.add(boxG(0.46, 0.006, 0.025, 0, 0.1, z), 0x9aa6b6);
  const hole = new CylinderGeometry(0.035, 0.035, 0.02, 6);
  hole.translate(-0.3, 0.09, -0.32);
  p.add(hole, P.rubber);
  const g = new Group();
  const m = p.mesh();
  m.rotation.x = 0.15;
  m.scale.setScalar(1.2);
  m.position.y = 0.15;
  g.add(m);
  return g;
}
