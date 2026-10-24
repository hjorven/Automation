import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type BufferGeometry,
} from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts, outputArrow } from "./buildings";
import { Paint, boxG, cylG, mesh, paintMetalMat } from "./kit";

// Rohre, Pumpen, Tanks und das Dampfkraftwerk. Gleicher Vertrag wie die
// anderen Modelle: Group, zentriert, Boden y = 0, Ausgang nach +x.
// Rohrteile bekommen eine Bitmaske der angeschlossenen Seiten im Modellraum
// (Bit k = Richtung k, 0 = +x, 1 = +z, 2 = -x, 3 = -z).
// Benannte Teile: "glow" (Sichtfenster/Fuellstand, Farbe = Fluessigkeit),
// "head" (Laufrad/Rotor), "fill" (Tankpegel), "puff" (Dampf), "piston".

/** Hoehe der Rohrachse ueber dem Boden. */
export const PIPE_Y = 0.3;
const PIPE_R = 0.085;

function hcyl(r: number, len: number, seg: number, x = 0, y = 0, z = 0): BufferGeometry {
  return new CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);
}

/** Leuchtendes Material fuer Sichtfenster; scene-view klont es und faerbt es nach Inhalt. */
function windowMat() {
  return new MeshStandardMaterial({ color: 0x1a2a38, emissive: P.glass, emissiveIntensity: 0.2, flatShading: true });
}

function glowMesh(root: Group, geo: BufferGeometry, m: MeshStandardMaterial) {
  const g = mesh(geo, m);
  g.name = "glow";
  g.castShadow = false;
  root.add(g);
  return g;
}

/** Rohrstueck von `from` bis `to` (Abstand von der Mitte) in Richtung k, mit Flansch an der Kante. */
function arm(p: Paint, k: number, from: number, to = 0.5, r = PIPE_R) {
  const yaw = (-k * Math.PI) / 2;
  const len = to - from;
  p.add(hcyl(r, len, 10, from + len / 2, PIPE_Y, 0).rotateY(yaw), P.pipe);
  p.add(hcyl(r * 1.35, 0.04, 10, to - 0.03, PIPE_Y, 0).rotateY(yaw), P.pipeFlange);
  // Schrauben am Flansch.
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const g = new BoxGeometry(0.03, 0.02, 0.02).translate(to - 0.03, PIPE_Y + Math.sin(a) * r * 1.35, Math.cos(a) * r * 1.35);
    p.add(g.rotateY(yaw), P.bolt);
  }
}

/** Stuetze vom Boden bis unter die Rohrachse. */
function support(p: Paint, x = 0, z = 0) {
  p.add(boxG(0.22, 0.03, 0.12, x, 0, z), P.metalDark);
  p.add(boxG(0.05, PIPE_Y - PIPE_R, 0.05, x, 0.03, z), P.metal);
  p.add(boxG(0.16, 0.03, 0.06, x, PIPE_Y - PIPE_R - 0.02, z), P.metalDark);
}

/** Nur Rohre in Gegenrichtung (gerades Stueck)? */
const isStraight = (mask: number) => mask === 0b0101 || mask === 0b1010;

/** Rohr: verbindet sich mit allen Nachbarn in der Maske; ohne Nachbarn ein gerades Stueck. */
export function pipeModel(mask: number): Group {
  if (mask === 0) mask = 0b0101;
  // Einzelnes Ende: gerades Stueck mit Kappe.
  const dirs = [0, 1, 2, 3].filter((k) => mask & (1 << k));
  const p = new Paint();
  const root = new Group();
  if (isStraight(mask)) {
    const k = dirs[0];
    p.add(hcyl(PIPE_R, 1, 10, 0, PIPE_Y, 0).rotateY((-k * Math.PI) / 2), P.pipe);
    for (const d of dirs) arm(p, d, 0.46);
    support(p);
    // Sichtfenster oben auf dem Rohr.
    root.add(p.mesh(paintMetalMat));
    const win = new CylinderGeometry(PIPE_R * 1.08, PIPE_R * 1.08, 0.22, 10, 1, true, -Math.PI / 2.6, Math.PI / 1.3)
      .rotateZ(Math.PI / 2)
      .translate(0, PIPE_Y, 0)
      .rotateY((-k * Math.PI) / 2);
    glowMesh(root, win, windowMat());
    return root;
  }
  for (const d of dirs) arm(p, d, 0.08);
  if (dirs.length === 1) {
    // Offenes Ende: Blindflansch gegenueber.
    const yaw = (-((dirs[0] + 2) % 4) * Math.PI) / 2;
    p.add(hcyl(PIPE_R * 1.4, 0.05, 10, 0.1, PIPE_Y, 0).rotateY(yaw), P.pipeFlange);
  }
  // Verbindungsstueck in der Mitte mit Sichtkugel.
  p.add(new BoxGeometry(0.24, 0.24, 0.24).translate(0, PIPE_Y, 0), P.pipeJoint);
  support(p);
  root.add(p.mesh(paintMetalMat));
  glowMesh(root, new DodecahedronGeometry(0.09).translate(0, PIPE_Y + 0.12, 0), windowMat());
  return root;
}

/** Rohrpumpe: gerades Rohr mit Motor und Laufrad ("head"), verlaengert die Reichweite. */
export function pipePumpModel(mask: number): Group {
  const p = new Paint();
  const dirs = [0, 1, 2, 3].filter((k) => mask & (1 << k));
  basePlate(p, 0.8, 0.06, P.metalDark);
  for (const d of dirs.length ? dirs : [0, 2]) arm(p, d, 0.22);
  // Pumpengehaeuse (Spirale) und Motor.
  p.add(cylG(0.24, 0.24, 0.12, 12, 0, 0.18, 0).rotateX(Math.PI / 2).translate(0, PIPE_Y + 0.12, -0.06), P.pipePump);
  p.add(cylG(0.2, 0.22, 0.2, 12, 0, 0.06, 0), P.pipePump);
  p.add(cylG(0.12, 0.12, 0.26, 10, 0, 0.26, 0), P.metalDark);
  p.add(cylG(0.14, 0.14, 0.04, 10, 0, 0.52, 0), P.metal);
  bolts(p, [-0.17, 0.17], [-0.17, 0.17], 0.06);
  // Warnstreifen und Status-Lampe.
  p.add(boxG(0.3, 0.02, 0.02, 0, 0.42, 0.13), P.port);
  p.add(cylG(0.025, 0.025, 0.05, 6, 0.16, 0.26, 0.16), P.statusLight);
  const root = new Group();
  root.add(p.mesh(paintMetalMat));

  // Luefterrad oben auf dem Motor dreht mit dem Durchfluss.
  const head = new Group();
  head.name = "head";
  head.position.set(0, 0.56, 0);
  const hp = new Paint();
  hp.add(cylG(0.03, 0.03, 0.03, 6), P.metalLight);
  for (let i = 0; i < 5; i++) hp.add(new BoxGeometry(0.2, 0.012, 0.05).translate(0.1, 0.015, 0).rotateY((i * 2 * Math.PI) / 5), P.pipePumpBlade);
  head.add(hp.mesh(paintMetalMat));
  root.add(head);
  glowMesh(root, new BoxGeometry(0.06, 0.06, 0.02).translate(0, 0.34, 0.125), windowMat());
  return root;
}

/** Tank: stehender Zylinder mit Pegelanzeige ("fill" in "glow"-Farbe) und Anschluessen. */
export function fluidTankModel(mask: number): Group {
  const p = new Paint();
  const dirs = [0, 1, 2, 3].filter((k) => mask & (1 << k));
  p.add(cylG(0.46, 0.48, 0.08, 12, 0, 0, 0), P.metalDark);
  for (const d of dirs) arm(p, d, 0.36);
  p.add(cylG(0.4, 0.4, 0.9, 14, 0, 0.08, 0), P.tank);
  p.add(cylG(0.42, 0.42, 0.04, 14, 0, 0.32, 0), P.metal);
  p.add(cylG(0.42, 0.42, 0.04, 14, 0, 0.7, 0), P.metal);
  p.add(cylG(0.32, 0.4, 0.1, 14, 0, 0.98, 0), P.tank);
  p.add(cylG(0.08, 0.08, 0.06, 8, 0, 1.08, 0), P.metalDark);
  // Leiter.
  for (const z of [-0.06, 0.06]) p.add(boxG(0.02, 0.98, 0.02, -0.42, 0.08, z), P.metalLight);
  for (let i = 0; i < 7; i++) p.add(boxG(0.02, 0.015, 0.14, -0.42, 0.18 + i * 0.13, 0), P.metalLight);
  // Rahmen der Pegelanzeige vorne.
  p.add(boxG(0.03, 0.78, 0.14, 0.4, 0.14, 0), P.metalDark);
  const root = new Group();
  root.add(p.mesh(paintMetalMat));
  const fill = new Group();
  fill.name = "fill";
  fill.position.set(0.415, 0.16, 0);
  glowMesh(fill, new BoxGeometry(0.02, 0.74, 0.08).translate(0, 0.37, 0), windowMat());
  root.add(fill);
  return root;
}

/** Wasserpumpe: Plattform auf Stelzen im See, Ansaugrohr nach unten, Rotor ("head"), Abgang nach +x. */
export function waterPumpModel(): Group {
  const p = new Paint();
  // Stelzen bis unter die Wasserlinie.
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) p.add(cylG(0.035, 0.035, 0.32, 6, x, -0.2, z), P.metalDark);
  p.add(boxG(0.84, 0.06, 0.84, 0, 0.1, 0), P.waterPumpDeck);
  for (let i = -3; i <= 3; i++) p.add(boxG(0.02, 0.008, 0.84, i * 0.12, 0.16, 0), P.metalDark);
  // Gelaender.
  for (const z of [-0.4, 0.4]) {
    p.add(boxG(0.8, 0.02, 0.02, 0, 0.36, z), P.port);
    for (const x of [-0.38, 0, 0.38]) p.add(boxG(0.02, 0.2, 0.02, x, 0.16, z), P.port);
  }
  // Ansaugrohr ins Wasser und Pumpenkoerper.
  p.add(cylG(0.08, 0.08, 0.4, 10, -0.18, -0.24, 0), P.pipe);
  p.add(cylG(0.16, 0.18, 0.26, 12, -0.18, 0.16, 0), P.waterPump);
  p.add(cylG(0.17, 0.17, 0.03, 12, -0.18, 0.42, 0), P.metal);
  // Abgang zum Rohr nach vorne.
  p.add(hcyl(PIPE_R, 0.5, 10, 0.2, PIPE_Y, 0), P.pipe);
  p.add(hcyl(PIPE_R * 1.35, 0.04, 10, 0.47, PIPE_Y, 0), P.pipeFlange);
  p.add(new TorusGeometry(0.06, 0.014, 4, 10).rotateY(Math.PI / 2).translate(0.12, PIPE_Y + 0.13, 0), P.extractorCap);
  p.add(boxG(0.02, 0.1, 0.02, 0.12, PIPE_Y, 0), P.metalLight);
  outputArrow(p, 0.17, 0.4);
  const root = new Group();
  root.add(p.mesh(paintMetalMat));

  const head = new Group();
  head.name = "head";
  head.position.set(-0.18, 0.45, 0);
  const hp = new Paint();
  hp.add(cylG(0.05, 0.06, 0.08, 8), P.metalDark);
  for (let i = 0; i < 3; i++) hp.add(new BoxGeometry(0.28, 0.02, 0.06).translate(0, 0.07, 0).rotateY((i * Math.PI) / 3), P.waterPumpBlade);
  head.add(hp.mesh(paintMetalMat));
  root.add(head);
  return root;
}

const pistonMat = new MeshStandardMaterial({ color: P.metalLight, metalness: 0.5, roughness: 0.4, flatShading: true });
const steamMat = new MeshStandardMaterial({ color: 0xf2f5f8, flatShading: true, transparent: true, opacity: 0.75 });

/** Dampfkraftwerk: Kessel mit Feuerung ("glow"), Turbine, Kolben ("piston"), Dampf ("puff"). */
export function generatorSteamModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.08, P.metalDark);
  // Liegender Kessel hinten.
  p.add(hcyl(0.2, 0.62, 12, -0.04, 0.32, -0.18), P.boiler);
  for (const x of [-0.3, -0.04, 0.22]) p.add(hcyl(0.215, 0.03, 12, x, 0.32, -0.18), P.copper);
  p.add(boxG(0.5, 0.12, 0.08, -0.04, 0.08, -0.18), P.metalDark);
  // Feuerkasten links mit Kohlerutsche.
  p.add(boxG(0.26, 0.34, 0.34, -0.3, 0.08, 0.18), P.smelterStone);
  p.add(boxG(0.18, 0.04, 0.28, -0.3, 0.42, 0.18), P.metalDark);
  // Turbine und Generator rechts.
  p.add(hcyl(0.13, 0.26, 10, 0.2, 0.24, 0.18), P.metal);
  p.add(hcyl(0.15, 0.06, 10, 0.06, 0.24, 0.18), P.metalDark);
  p.add(boxG(0.16, 0.2, 0.22, 0.38, 0.08, 0.18), P.generator);
  p.add(cylG(0.03, 0.03, 0.08, 6, 0.38, 0.28, 0.24), P.copper);
  p.add(cylG(0.03, 0.03, 0.08, 6, 0.38, 0.28, 0.12), P.copper);
  // Dampfdom und Schornstein.
  p.add(cylG(0.07, 0.08, 0.1, 8, 0.12, 0.5, -0.18), P.boiler);
  p.add(cylG(0.06, 0.07, 0.42, 8, -0.3, 0.46, -0.18), P.metalDark);
  p.add(cylG(0.075, 0.075, 0.04, 8, -0.3, 0.86, -0.18), P.metal);
  // Wasseranschluss hinten (Rohrseite egal: Rohre docken an jeder Seite an).
  p.add(hcyl(PIPE_R, 0.12, 10, -0.43, PIPE_Y, 0.18), P.pipe);
  outputArrow(p, 0.1, 0.46);
  const root = new Group();
  root.add(p.mesh(paintMetalMat));

  const glowM = new MeshStandardMaterial({ color: 0x301408, emissive: P.smelterGlow, emissiveIntensity: 0, flatShading: true });
  glowMesh(root, new BoxGeometry(0.02, 0.12, 0.2).translate(-0.165, 0.14, 0.18), glowM);

  for (const z of [0.1, 0.26]) {
    const piston = mesh(new BoxGeometry(0.06, 0.12, 0.06), pistonMat, -0.06, 0.43, z);
    piston.name = "piston";
    root.add(piston);
  }
  root.userData.chimney = [-0.3, 0.9, -0.18];
  for (let i = 0; i < 3; i++) {
    const puff = new Mesh(new DodecahedronGeometry(0.08), steamMat);
    puff.name = "puff";
    puff.visible = false;
    root.add(puff);
  }
  return root;
}
