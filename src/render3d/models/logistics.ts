import { BoxGeometry, Group, MeshStandardMaterial } from "three";
import { PALETTE as P } from "../palette";
import { extractorModel } from "./buildings";
import { Paint, boxG, coneG, cylG, mesh } from "./kit";

// Einfache Modelle fuer die Gebaeude der Hub-Stufen. Gleicher Vertrag wie in
// buildings.ts: Group, zentriert, Boden y = 0, Ausgang nach +x.

function arrow(p: Paint, x: number, z: number, yaw: number, y = 0.2) {
  const g = coneG(0.08, 0.15, 3, 0, -0.075, 0);
  g.rotateZ(-Math.PI / 2);
  g.translate(0.36, 0, 0);
  g.rotateY(yaw);
  g.translate(x, y, z);
  p.add(g, P.port);
}

function frame(p: Paint, body: number) {
  p.add(boxG(0.9, 0.08, 0.9), P.metalDark);
  p.add(boxG(0.7, 0.18, 0.7, 0, 0.08, 0), body);
  p.add(boxG(0.74, 0.03, 0.74, 0, 0.26, 0), P.metal);
}

/** Verteiler: Pfeile nach vorne, links und rechts. */
export function splitterModel(): Group {
  const root = new Group();
  const p = new Paint();
  frame(p, P.splitter);
  p.add(cylG(0.14, 0.16, 0.1, 8, 0, 0.29, 0), P.metalLight);
  arrow(p, 0, 0, 0, 0.3);
  arrow(p, 0, 0, Math.PI / 2, 0.3);
  arrow(p, 0, 0, -Math.PI / 2, 0.3);
  root.add(p.mesh());
  return root;
}

/** Zusammenfuehrer: drei Eingaenge laufen zu einem Ausgang zusammen. */
export function mergerModel(): Group {
  const root = new Group();
  const p = new Paint();
  frame(p, P.merger);
  p.add(boxG(0.3, 0.12, 0.3, 0.05, 0.29, 0), P.metalLight);
  arrow(p, 0, 0, 0, 0.3);
  // Einlauf-Schlitze an den drei Eingangsseiten.
  p.add(boxG(0.04, 0.1, 0.36, -0.37, 0.1, 0), P.rubber);
  p.add(boxG(0.36, 0.1, 0.04, 0, 0.1, -0.37), P.rubber);
  p.add(boxG(0.36, 0.1, 0.04, 0, 0.1, 0.37), P.rubber);
  root.add(p.mesh());
  return root;
}

/** Tunnel-Eingang (Rampe nach unten) oder -Ausgang (Rampe nach oben). */
export function tunnelModel(exit: boolean): Group {
  const root = new Group();
  const p = new Paint();
  p.add(boxG(0.9, 0.06, 0.9), P.metalDark);
  // Rampe: Eingang taucht nach +x ab, Ausgang kommt bei -x heraus.
  const ramp = boxG(0.9, 0.05, 0.6, 0, -0.025, 0);
  ramp.rotateZ(exit ? 0.28 : -0.28);
  ramp.translate(0, 0.16, 0);
  p.add(ramp, P.beltBed);
  // Portal mit Warnstreifen auf der Tunnelseite.
  const px = exit ? -0.32 : 0.32;
  p.add(boxG(0.16, 0.5, 0.12, px, 0.06, -0.36), P.tunnel);
  p.add(boxG(0.16, 0.5, 0.12, px, 0.06, 0.36), P.tunnel);
  p.add(boxG(0.16, 0.12, 0.84, px, 0.5, 0), P.tunnel);
  for (let i = -3; i <= 3; i++) p.add(boxG(0.17, 0.04, 0.1, px, 0.54, i * 0.11), i % 2 ? P.hazard : P.tunnel);
  arrow(p, exit ? 0.05 : -0.1, 0, 0, 0.62);
  root.add(p.mesh());
  return root;
}

/** Giesserei: Hochofen mit Glut (Name "glow" wie bei der Schmelze). */
export function foundryModel(): Group {
  const root = new Group();
  const p = new Paint();
  p.add(boxG(0.94, 0.1, 0.94), P.metalDark);
  p.add(boxG(0.7, 0.5, 0.7, -0.05, 0.1, 0), P.foundry);
  p.add(boxG(0.74, 0.05, 0.74, -0.05, 0.6, 0), P.metal);
  p.add(cylG(0.16, 0.2, 0.4, 8, -0.12, 0.65, -0.12), P.foundry);
  p.add(cylG(0.18, 0.18, 0.05, 8, -0.12, 1.02, -0.12), P.metalDark);
  // Auslauf nach vorne.
  p.add(boxG(0.22, 0.08, 0.26, 0.38, 0.18, 0), P.metal);
  arrow(p, 0.1, 0, 0, 0.12);
  root.add(p.mesh());

  const glow = new MeshStandardMaterial({ color: 0x401a08, emissive: P.foundryGlow, emissiveIntensity: 0, flatShading: true });
  const mouth = mesh(new BoxGeometry(0.03, 0.2, 0.3), glow, 0.31, 0.22, 0);
  mouth.name = "glow";
  mouth.castShadow = false;
  root.add(mouth);
  return root;
}

/** Bohrer Mk2: der normale Bohrer mit blauer Verkleidung und Turbo-Ring. */
export function extractorMk2Model(): Group {
  const root = extractorModel();
  const p = new Paint();
  p.add(boxG(0.62, 0.06, 0.62, -0.04, 0.38, 0), P.extractorMk2);
  p.add(boxG(0.78, 0.05, 0.08, -0.04, 0.93, -0.34), P.extractorMk2);
  p.add(boxG(0.78, 0.05, 0.08, -0.04, 0.93, 0.34), P.extractorMk2);
  root.add(p.mesh());
  return root;
}
