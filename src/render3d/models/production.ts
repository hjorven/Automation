import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts, extractorModel, limb, outputArrow } from "./buildings";
import { Paint, boxG, coneG, cylG, mesh, paintMetalMat } from "./kit";
import { arrowOn, beltStub } from "./logistics";

// Modelle der spaeten Stufen. Gleicher Vertrag wie in buildings.ts: Group,
// zentriert, Boden y = 0, Ausgang nach +x. Animierte Teile mit festen Namen:
// "fill" (Lagerkiste), "flap" (Sortierer), "arm"/"arm2", "icon", "glow",
// "puff" (steigt ab root.userData.chimney auf), "piston", "coil", "beam",
// "crank" (Oelpumpe).

/** Liegender Zylinder entlang x (`axis` "x") oder z, mittig auf (x, y, z). */
function hcyl(r: number, len: number, seg: number, axis: "x" | "z", x = 0, y = 0, z = 0): BufferGeometry {
  const g = new CylinderGeometry(r, r, len, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** Strebe als Quader von a nach b (Querschnitt t). */
function strut(a: [number, number, number], b: [number, number, number], t: number): BufferGeometry {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new BoxGeometry(t, d.length(), t).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  return g.translate(a[0], a[1], a[2]);
}

/** Leuchtflaeche mit gemeinsamem Material; scene-view klont es je Gebaeude. */
function glow(root: Group, geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number) {
  const g = mesh(geo, m, x, y, z);
  g.name = "glow";
  g.castShadow = false;
  root.add(g);
}

function glowMat(emissive: number) {
  return new MeshStandardMaterial({ color: 0x301408, emissive, emissiveIntensity: 0, flatShading: true });
}

const puffMat = new MeshStandardMaterial({ color: 0xd8dde3, flatShading: true, transparent: true, opacity: 0.7 });
const darkPuffMat = new MeshStandardMaterial({ color: 0x5a5e66, flatShading: true, transparent: true, opacity: 0.6 });

/** Rauchwolken; scene-view laesst sie ab `chimney` (x, y, z) aufsteigen. */
function smoke(root: Group, chimney: [number, number, number], m = puffMat, size = 0.08) {
  root.userData.chimney = chimney;
  for (let i = 0; i < 3; i++) {
    const puff = new Mesh(new DodecahedronGeometry(size), m);
    puff.name = "puff";
    puff.visible = false;
    root.add(puff);
  }
}

function iconHolder(root: Group, x: number, y: number, z: number) {
  const icon = new Group();
  icon.name = "icon";
  icon.position.set(x, y, z);
  root.add(icon);
}

// ---------------------------------------------------------------- Lagerkiste

/** Fuellstand-Anzeige: Hoehe bei voller Kiste; scene-view skaliert "fill" in y. */
export const STORAGE_FILL_H = 0.36;

/** Lagerkiste: Holzkiste mit Stahlkanten, Sichtfenster mit Fuellstand ("fill"). */
export function storageModel(): Group {
  const p = new Paint();
  basePlate(p, 0.92, 0.08, P.metalDark);
  // Kiste aus Brettern, Stahlkanten.
  p.add(boxG(0.7, 0.48, 0.7, -0.02, 0.08, 0), P.storage);
  for (let i = 1; i < 4; i++) {
    const y = 0.08 + i * 0.12;
    p.add(boxG(0.712, 0.008, 0.712, -0.02, y, 0), P.storageDark);
  }
  for (const x of [-0.36, 0.32]) for (const z of [-0.34, 0.34]) p.add(boxG(0.05, 0.5, 0.05, x, 0.08, z), P.metal);
  for (const z of [-0.34, 0.34]) {
    p.add(boxG(0.74, 0.05, 0.05, -0.02, 0.08, z), P.metal);
    p.add(boxG(0.74, 0.05, 0.05, -0.02, 0.54, z), P.metal);
  }
  for (const x of [-0.36, 0.32]) {
    p.add(boxG(0.05, 0.05, 0.72, x, 0.08, 0), P.metal);
    p.add(boxG(0.05, 0.05, 0.72, x, 0.54, 0), P.metal);
  }
  // Deckel mit Griffen.
  p.add(boxG(0.74, 0.04, 0.74, -0.02, 0.58, 0), P.storageDark);
  for (const z of [-0.18, 0.18]) p.add(boxG(0.14, 0.03, 0.04, -0.02, 0.62, z), P.metalLight);
  // Sichtfenster mit Skala (+z, zur Kamera).
  p.add(boxG(0.14, 0.42, 0.02, -0.18, 0.11, 0.352), P.metalDark);
  p.add(boxG(0.1, STORAGE_FILL_H + 0.01, 0.006, -0.18, 0.135, 0.364), 0x1a2228);
  for (let i = 0; i <= 4; i++) p.add(boxG(0.03, 0.006, 0.006, -0.1, 0.14 + (i * STORAGE_FILL_H) / 4, 0.364), P.bolt);
  // Einwurf hinten, Ausgabeklappe vorne.
  p.add(boxG(0.03, 0.18, 0.34, -0.385, 0.16, 0), P.rubber);
  p.add(boxG(0.04, 0.2, 0.36, 0.33, 0.1, 0), P.metalDark);
  p.add(boxG(0.03, 0.03, 0.38, 0.36, 0.31, 0), P.port);
  outputArrow(p, 0.1, 0.45);
  const root = new Group();
  root.add(p.mesh());

  const fillMat = new MeshStandardMaterial({ color: P.storageFill, emissive: P.storageFill, emissiveIntensity: 0.35, flatShading: true });
  const fill = mesh(new BoxGeometry(0.08, STORAGE_FILL_H, 0.008).translate(0, STORAGE_FILL_H / 2, 0), fillMat, -0.18, 0.14, 0.366);
  fill.name = "fill";
  fill.castShadow = false;
  fill.scale.y = 0.5; // Vorschaubild: halb voll
  root.add(fill);
  return root;
}

// ---------------------------------------------------------------- Sortierer

/** Sortierer: Eingang hinten, Scanner-Bogen mit Laser, Weiche ("flap"), Filter-Symbol ("icon"). */
export function sorterModel(): Group {
  const p = new Paint();
  basePlate(p, 0.92, 0.08, P.metalDark);
  beltStub(p, Math.PI, 0.16, 0.48, 0.08);
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
    beltStub(p, yaw, 0.16, 0.48, 0.08);
    arrowOn(p, yaw, 0.15, 0.36);
  }
  // Vorderer Ausgang (gefiltert) farbig markiert.
  p.add(boxG(0.04, 0.03, 0.3, 0.46, 0.15, 0), P.sorter);
  // Weichengehaeuse in der Mitte.
  p.add(cylG(0.2, 0.22, 0.06, 8, 0, 0.08, 0), P.sorter);
  p.add(cylG(0.05, 0.05, 0.14, 6, 0, 0.14, 0), P.metalDark);
  // Scanner-Bogen ueber dem Eingang.
  for (const z of [-0.2, 0.2]) {
    p.add(boxG(0.08, 0.36, 0.06, -0.3, 0.08, z), P.sorter);
    p.add(boxG(0.1, 0.03, 0.08, -0.3, 0.08, z), P.metalDark);
  }
  p.add(boxG(0.12, 0.08, 0.48, -0.3, 0.44, 0), P.sorter);
  p.add(boxG(0.13, 0.02, 0.5, -0.3, 0.52, 0), P.metalLight);
  p.add(boxG(0.03, 0.05, 0.3, -0.24, 0.45, 0), P.glass);
  // Sockel des Filter-Symbols auf dem Bogen.
  p.add(cylG(0.08, 0.1, 0.04, 8, -0.3, 0.54, 0), P.metalDark);
  p.add(cylG(0.065, 0.065, 0.01, 8, -0.3, 0.58, 0), P.glass);
  const root = new Group();
  root.add(p.mesh());

  // Laser-Vorhang unter dem Bogen.
  glow(root, new BoxGeometry(0.01, 0.3, 0.34), glowMat(P.laser), -0.3, 0.27, 0);

  // Weiche: drehbare Klappe, die das Item zur Seite lenkt.
  const flap = new Group();
  flap.name = "flap";
  flap.position.set(0, 0.1, 0);
  const fp = new Paint();
  fp.add(boxG(0.3, 0.1, 0.03, 0.05, 0, 0), P.port);
  fp.add(cylG(0.035, 0.035, 0.14, 6, 0, 0, 0), P.metalLight);
  flap.add(fp.mesh(paintMetalMat));
  root.add(flap);

  iconHolder(root, -0.3, 0.74, 0);
  return root;
}

// ---------------------------------------------------------------- Kohlekraftwerk

/** Kohlekraftwerk: Feuerung mit Kessel, Schornstein, Schwungrad ("arm") und Generator. */
export function generatorCoalModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.1, P.metalDark);
  bolts(p, [-0.4, 0.4], [-0.4, 0.4], 0.1);
  // Feuerung aus Ziegeln.
  for (let i = 0; i < 3; i++) p.add(boxG(0.5, 0.1, 0.56, -0.1, 0.1 + i * 0.1, -0.08), i % 2 ? P.brickDark : P.brick);
  p.add(boxG(0.54, 0.04, 0.6, -0.1, 0.4, -0.08), P.metalDark);
  // Feuertuer vorne.
  p.add(boxG(0.03, 0.18, 0.22, 0.16, 0.14, -0.08), P.metalDark);
  // Kessel liegend darueber, mit Baendern und Manometer.
  p.add(hcyl(0.15, 0.56, 10, "x", -0.1, 0.58, -0.08), P.generator);
  for (const x of [-0.3, -0.1, 0.1]) p.add(hcyl(0.158, 0.03, 10, "x", x, 0.58, -0.08), P.metalDark);
  p.add(cylG(0.035, 0.035, 0.06, 6, 0.04, 0.72, 0.02), P.metalLight);
  p.add(cylG(0.045, 0.045, 0.015, 8, 0.04, 0.78, 0.02), P.bolt);
  // Schornstein hinten links mit Ring.
  p.add(cylG(0.08, 0.1, 0.7, 8, -0.32, 0.42, -0.28), P.brick);
  p.add(cylG(0.11, 0.11, 0.04, 8, -0.32, 0.86, -0.28), P.port);
  p.add(cylG(0.12, 0.09, 0.06, 8, -0.32, 1.06, -0.28), P.metalDark);
  // Kohlebunker hinten.
  p.add(cylG(0.16, 0.08, 0.18, 4, 0, 0, 0).rotateY(Math.PI / 4).translate(-0.34, 0.46, 0.22), P.metal);
  for (const [x, z, r] of [
    [-0.34, 0.22, 0.06],
    [-0.3, 0.27, 0.045],
    [-0.39, 0.18, 0.04],
  ] as const) {
    p.add(new DodecahedronGeometry(r).translate(x, 0.62 + r * 0.4, z), P.coal);
  }
  // Generator mit Kupferwicklung und Isolatoren vorne rechts.
  p.add(boxG(0.26, 0.2, 0.22, 0.24, 0.1, 0.24), P.generator);
  for (const x of [0.16, 0.22, 0.28, 0.34]) p.add(boxG(0.03, 0.21, 0.23, x, 0.1, 0.24), P.copper);
  for (const z of [0.18, 0.3]) {
    p.add(cylG(0.02, 0.02, 0.06, 6, 0.3, 0.3, z), P.metalDark);
    p.add(cylG(0.035, 0.035, 0.03, 6, 0.3, 0.36, z), P.glass);
  }
  // Welle zum Schwungrad.
  p.add(hcyl(0.025, 0.2, 6, "z", 0.24, 0.2, 0.06), P.metalLight);
  // Blitz-Schild.
  p.add(boxG(0.012, 0.1, 0.1, 0.372, 0.14, 0.24), P.port);
  const root = new Group();
  root.add(p.mesh());

  const g = glowMat(P.smelterGlow);
  glow(root, new BoxGeometry(0.02, 0.14, 0.18), g, 0.18, 0.21, -0.08);
  glow(root, new BoxGeometry(0.05, 0.012, 0.05), g, 0.04, 0.792, 0.02);

  // Schwungrad mit Speichen, dreht sich um z.
  const wheel = new Group();
  wheel.name = "arm";
  wheel.position.set(0.24, 0.2, -0.06);
  const wp = new Paint();
  wp.add(new TorusGeometry(0.14, 0.025, 4, 12), P.metalDark);
  for (let i = 0; i < 3; i++) wp.add(new BoxGeometry(0.26, 0.025, 0.02).rotateZ((i * Math.PI) / 3), P.port);
  wp.add(hcyl(0.035, 0.05, 8, "z"), P.metalLight);
  wheel.add(wp.mesh(paintMetalMat));
  root.add(wheel);

  smoke(root, [-0.32, 1.12, -0.28]);
  return root;
}

// ---------------------------------------------------------------- Treibstoffkraftwerk

/** Treibstoffkraftwerk: Tank, Motorblock mit Kolben ("piston"), Auspuff mit Glut. */
export function generatorFuelModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.1, P.metalDark);
  // Treibstofftank hinten auf Boecken.
  for (const x of [-0.24, 0.16]) p.add(boxG(0.06, 0.12, 0.3, x, 0.1, -0.22), P.metalDark);
  p.add(hcyl(0.15, 0.6, 10, "x", -0.04, 0.34, -0.22), P.fuelGen);
  for (const x of [-0.34, 0.26]) p.add(hcyl(0.16, 0.03, 10, "x", x, 0.34, -0.22), P.metalDark);
  p.add(boxG(0.22, 0.012, 0.04, -0.04, 0.485, -0.22), P.hazard);
  p.add(cylG(0.03, 0.03, 0.06, 6, 0.1, 0.47, -0.22), P.metalLight);
  // Motorblock vorne mit Kuehlergrill.
  p.add(boxG(0.56, 0.24, 0.3, 0, 0.1, 0.18), P.generator);
  p.add(boxG(0.6, 0.03, 0.34, 0, 0.34, 0.18), P.metalDark);
  p.add(boxG(0.012, 0.2, 0.28, 0.282, 0.12, 0.18), P.metalDark);
  for (let i = 0; i < 4; i++) p.add(boxG(0.014, 0.025, 0.26, 0.29, 0.15 + i * 0.045, 0.18), P.metalLight);
  // Zylinderkoepfe (vier), darin bewegen sich die Kolben.
  for (const x of [-0.18, -0.06, 0.06, 0.18]) p.add(cylG(0.045, 0.05, 0.06, 6, x, 0.37, 0.18), P.metal);
  // Leitung Tank -> Motor.
  p.add(boxG(0.04, 0.04, 0.2, -0.3, 0.2, 0.0), P.metalLight);
  // Auspuffrohre hinten links.
  for (const z of [-0.06, 0.06]) {
    p.add(cylG(0.035, 0.035, 0.5, 6, -0.36, 0.4, 0.18 + z), P.metal);
    p.add(cylG(0.045, 0.04, 0.05, 6, -0.36, 0.9, 0.18 + z), P.metalDark);
  }
  p.add(boxG(0.1, 0.08, 0.2, -0.32, 0.34, 0.18), P.metalDark);
  const root = new Group();
  root.add(p.mesh());

  const g = glowMat(P.flame);
  for (const z of [-0.06, 0.06]) glow(root, new CylinderGeometry(0.03, 0.03, 0.01, 6), g, -0.36, 0.955, 0.18 + z);
  glow(root, new BoxGeometry(0.01, 0.04, 0.08), g, 0.3, 0.29, 0.06);

  for (const x of [-0.18, -0.06, 0.06, 0.18]) {
    const piston = new Group();
    piston.name = "piston";
    piston.position.set(x, 0.43, 0.18);
    const pp = new Paint();
    pp.add(cylG(0.03, 0.03, 0.06, 6), P.metalLight);
    pp.add(cylG(0.038, 0.038, 0.015, 6, 0, 0.06, 0), P.port);
    piston.add(pp.mesh(paintMetalMat));
    root.add(piston);
  }

  smoke(root, [-0.36, 0.98, 0.18], darkPuffMat, 0.06);
  return root;
}

// ---------------------------------------------------------------- Bohrer Mk3

/** Bohrer Mk3: violetter Turm, Laser-Emitter an den Ecken, zwei kreisende Ringe ("coil"). */
export function extractorMk3Model(): Group {
  const root = extractorModel({ frame: P.extractorMk3, body: P.metalDark, cap: P.extractorMk3Cap });
  const p = new Paint();
  // Emitter oben an den Ecken, zeigen auf den Kopf.
  for (const [x, z] of [
    [-0.36, -0.34],
    [-0.36, 0.34],
    [0.28, -0.34],
    [0.28, 0.34],
  ] as const) {
    p.add(strut([x, 0.94, z], [x + (-0.04 - x) * 0.25, 0.86, z * 0.75], 0.05), P.metalLight);
    p.add(cylG(0.02, 0.02, 0.02, 6, x, 0.94, z), P.extractorMk3Cap);
  }
  // Drei Streifen als Stufen-Plakette vorne.
  for (let i = 0; i < 3; i++) p.add(boxG(0.02, 0.025, 0.12, 0.25, 0.18 + i * 0.045, 0.15), P.extractorMk3Cap);
  // Plasmatanks seitlich.
  for (const z of [-0.28, 0.28]) {
    p.add(cylG(0.07, 0.07, 0.2, 8, -0.38, 0.1, z), P.extractorMk3);
    p.add(cylG(0.075, 0.075, 0.025, 8, -0.38, 0.22, z), P.metalLight);
  }
  root.add(p.mesh());

  const coil = new Group();
  coil.name = "coil";
  coil.position.set(-0.04, 0.5, 0);
  const cm = new MeshStandardMaterial({ color: P.extractorMk3Cap, emissive: P.extractorMk3Cap, emissiveIntensity: 0.6, flatShading: true });
  for (const tilt of [0.5, -0.5]) {
    const ring = mesh(new TorusGeometry(0.3, 0.012, 4, 20).rotateX(Math.PI / 2 + tilt), cm);
    ring.castShadow = false;
    coil.add(ring);
  }
  root.add(coil);
  return root;
}

// ---------------------------------------------------------------- Oelpumpe

/** Drehpunkt des Schwingbalkens der Oelpumpe. */
const PUMP_PIVOT: [number, number] = [0.02, 0.66];

/** Oelpumpe ("Pferdekopf"): Schwingbalken ("beam") nickt, Kurbel ("crank") dreht sich. */
export function pumpModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.08, P.metalDark);
  // Oelfleck und Bohrloch mit Ventilrad hinten.
  p.add(cylG(0.2, 0.2, 0.005, 10, -0.3, 0.08, 0), P.oil);
  p.add(cylG(0.06, 0.07, 0.14, 8, -0.36, 0.08, 0), P.metal);
  p.add(cylG(0.08, 0.08, 0.03, 8, -0.36, 0.2, 0), P.metalDark);
  p.add(new TorusGeometry(0.05, 0.012, 4, 10).rotateX(Math.PI / 2).translate(-0.36, 0.26, 0), P.extractorCap);
  // Steigleitung zur Ausgabe nach vorne.
  p.add(hcyl(0.03, 0.7, 6, "x", 0.05, 0.13, 0.3), P.metalLight);
  p.add(cylG(0.03, 0.03, 0.08, 6, -0.3, 0.08, 0.3), P.metalLight);
  p.add(cylG(0.05, 0.05, 0.16, 8, 0.36, 0.08, 0.3), P.pump);
  // A-Bock zum Drehpunkt.
  const [px, py] = PUMP_PIVOT;
  for (const z of [-0.07, 0.07]) {
    for (const dx of [-0.17, 0.17]) p.add(strut([px + dx, 0.08, z * 2.4], [px, py, z], 0.04), P.pump);
  }
  p.add(hcyl(0.04, 0.12, 8, "z", px, py, 0), P.port);
  // Getriebe und Motor vorne.
  p.add(boxG(0.22, 0.2, 0.18, 0.28, 0.08, -0.02), P.pump);
  p.add(boxG(0.16, 0.12, 0.12, 0.28, 0.08, -0.24), P.extractorCap);
  p.add(hcyl(0.03, 0.12, 6, "z", 0.28, 0.24, 0.14), P.metalLight);
  outputArrow(p, 0.1, 0.46);
  const root = new Group();
  root.add(p.mesh());

  // Schwingbalken mit Pferdekopf (hinten, ueber dem Bohrloch) und Gegengewicht vorne.
  const beam = new Group();
  beam.name = "beam";
  beam.position.set(px, py, 0);
  const bp = new Paint();
  bp.add(new BoxGeometry(0.72, 0.06, 0.07).translate(-0.06, 0.03, 0), P.port);
  bp.add(new BoxGeometry(0.1, 0.22, 0.08).translate(-0.4, -0.04, 0), P.pump);
  bp.add(new CylinderGeometry(0.11, 0.11, 0.08, 10, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2).translate(-0.4, 0.02, 0), P.pump);
  bp.add(new BoxGeometry(0.012, 0.4, 0.012).translate(-0.46, -0.32, 0), P.metalLight);
  bp.add(new BoxGeometry(0.03, 0.12, 0.08).translate(0.28, -0.08, 0), P.metal);
  bp.add(new BoxGeometry(0.03, 0.3, 0.03).translate(0.26, -0.2, 0.14), P.metalLight);
  beam.add(bp.mesh(paintMetalMat));
  root.add(beam);

  // Kurbel mit Gegengewichten an der Getriebewelle.
  const crank = new Group();
  crank.name = "crank";
  crank.position.set(0.28, 0.24, 0.12);
  const kp = new Paint();
  kp.add(new BoxGeometry(0.26, 0.05, 0.03), P.metalDark);
  kp.add(new BoxGeometry(0.08, 0.1, 0.035).translate(-0.12, 0, 0), P.extractorCap);
  kp.add(new BoxGeometry(0.08, 0.1, 0.035).translate(0.12, 0, 0), P.extractorCap);
  crank.add(kp.mesh(paintMetalMat));
  root.add(crank);
  return root;
}

// ---------------------------------------------------------------- Raffinerie

/** Raffinerie: zwei Destillationskolonnen, Tank, Fackel mit Flamme ("glow"), Rezept ("icon"). */
export function refineryModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.1, P.metalDark);
  // Kolonnen mit Ringpodesten.
  const cols: [number, number, number, number][] = [
    [-0.2, -0.18, 0.13, 0.9],
    [0.1, -0.24, 0.1, 0.66],
  ];
  for (const [x, z, r, h] of cols) {
    p.add(cylG(r, r + 0.02, h, 10, x, 0.1, z), P.refinery);
    p.add(coneG(r, 0.08, 10, x, 0.1 + h, z), P.refineryAccent);
    for (let y = 0.3; y < h; y += 0.22) {
      p.add(cylG(r + 0.04, r + 0.04, 0.02, 10, x, y, z), P.metalDark);
      p.add(cylG(r + 0.005, r + 0.005, 0.03, 10, x, y + 0.04, z), P.refineryAccent);
    }
  }
  // Leiter an der grossen Kolonne.
  for (const dz of [-0.04, 0.04]) p.add(boxG(0.02, 0.8, 0.02, -0.06, 0.1, -0.18 + dz), P.metalLight);
  for (let i = 0; i < 6; i++) p.add(boxG(0.02, 0.015, 0.08, -0.06, 0.18 + i * 0.12, -0.18), P.metalLight);
  // Liegender Tank vorne.
  p.add(hcyl(0.12, 0.42, 10, "x", 0.08, 0.26, 0.22), P.refinery);
  for (const x of [-0.08, 0.24]) p.add(boxG(0.05, 0.08, 0.2, x, 0.1, 0.22), P.metalDark);
  p.add(hcyl(0.125, 0.03, 10, "x", 0.08, 0.26, 0.22), P.refineryAccent);
  // Rohre zwischen den Kolonnen und zum Tank.
  p.add(hcyl(0.025, 0.3, 6, "x", -0.05, 0.6, -0.2), P.metalLight);
  p.add(hcyl(0.025, 0.36, 6, "z", 0.1, 0.4, 0.0), P.metalLight);
  p.add(boxG(0.18, 0.06, 0.2, 0.36, 0.1, 0), P.metalDark);
  // Fackel hinten rechts.
  p.add(cylG(0.025, 0.035, 0.92, 6, -0.36, 0.1, 0.3), P.metal);
  for (const y of [0.4, 0.7]) p.add(cylG(0.05, 0.05, 0.015, 6, -0.36, y, 0.3), P.extractorCap);
  p.add(cylG(0.045, 0.03, 0.05, 6, -0.36, 1.0, 0.3), P.metalDark);
  // Sockel fuer das Rezept-Symbol.
  p.add(cylG(0.08, 0.1, 0.04, 8, 0.2, 0.52, 0.22), P.metalDark);
  p.add(cylG(0.065, 0.065, 0.01, 8, 0.2, 0.56, 0.22), P.glass);
  p.add(cylG(0.02, 0.02, 0.14, 4, 0.2, 0.38, 0.22), P.metalDark);
  outputArrow(p, 0.12, 0.47);
  const root = new Group();
  root.add(p.mesh());

  const flame = glowMat(P.flame);
  glow(root, new ConeGeometry(0.05, 0.16, 6).translate(0, 0.08, 0), flame, -0.36, 1.05, 0.3);
  glow(root, new BoxGeometry(0.01, 0.06, 0.12), flame, 0.465, 0.12, 0);

  iconHolder(root, 0.2, 0.76, 0.22);
  return root;
}

// ---------------------------------------------------------------- Fertigungsanlage

/** Fertigungsanlage: grosse Halle mit Sheddach, zwei Roboterarmen und Statuslichtern. */
export function manufacturerModel(): Group {
  const p = new Paint();
  basePlate(p, 0.96, 0.1, P.metalDark);
  // Halle mit Pfeilern.
  p.add(boxG(0.86, 0.38, 0.86, 0, 0.1, 0), P.manufacturer);
  for (const x of [-0.43, 0, 0.43]) for (const z of [-0.43, 0.43]) p.add(boxG(0.05, 0.4, 0.05, x, 0.1, z), P.manufacturerDark);
  for (const z of [-0.435, 0.435]) {
    for (const x of [-0.215, 0.215]) {
      p.add(boxG(0.32, 0.14, 0.01, x, 0.26, z), P.glass);
      p.add(boxG(0.32, 0.02, 0.014, x, 0.33, z), P.manufacturerDark);
    }
  }
  // Tore: Ausgabe vorne, Zufuhr an den anderen Seiten.
  p.add(boxG(0.03, 0.2, 0.34, 0.43, 0.1, 0), P.rubber);
  p.add(boxG(0.035, 0.03, 0.4, 0.44, 0.3, 0), P.port);
  p.add(boxG(0.03, 0.14, 0.24, -0.44, 0.1, 0), P.rubber);
  for (const z of [-0.44, 0.44]) p.add(boxG(0.2, 0.1, 0.03, 0.2, 0.1, z), P.rubber);
  // Dachdeck mit Gelaender.
  p.add(boxG(0.9, 0.05, 0.9, 0, 0.48, 0), P.metal);
  p.add(boxG(0.4, 0.04, 0.86, 0.2, 0.53, 0), P.manufacturerDark);
  // Sheddach hinten: drei schraege Glasreihen.
  for (let i = 0; i < 2; i++) {
    const x = -0.36 + i * 0.18;
    const g = boxG(0.2, 0.012, 0.84, 0, 0, 0);
    g.rotateZ(0.6);
    p.add(g.translate(x + 0.02, 0.53, 0), P.glass);
    p.add(boxG(0.02, 0.12, 0.84, x + 0.09, 0.53, 0), P.manufacturerDark);
  }
  // Luefter auf dem Deck.
  p.add(cylG(0.08, 0.08, 0.06, 8, 0.32, 0.57, -0.32), P.metalDark);
  p.add(cylG(0.06, 0.06, 0.01, 8, 0.32, 0.63, -0.32), P.metalLight);
  // Sockel des Rezept-Symbols.
  p.add(cylG(0.09, 0.11, 0.05, 8, 0.32, 0.57, 0.3), P.metalDark);
  p.add(cylG(0.07, 0.07, 0.012, 8, 0.32, 0.62, 0.3), P.glass);
  outputArrow(p, 0.42, 0.42);
  const root = new Group();
  root.add(p.mesh());

  // Statuslichter am Dachrand.
  const g = glowMat(P.statusLight);
  for (const z of [-0.3, -0.1, 0.1]) glow(root, new BoxGeometry(0.02, 0.025, 0.08), g, 0.455, 0.45, z);

  // Zwei Roboterarme auf dem Deck.
  for (const [name, z] of [
    ["arm", -0.12],
    ["arm2", 0.14],
  ] as const) {
    const arm = new Group();
    arm.name = name;
    arm.position.set(0.12, 0.57, z);
    const ap = new Paint();
    ap.add(cylG(0.07, 0.08, 0.05, 8), P.metalDark);
    ap.add(cylG(0.04, 0.05, 0.12, 6, 0, 0.05, 0), P.metalLight);
    limb(ap, [0, 0.16], [0.15, 0.26], 0.045, P.port);
    limb(ap, [0.15, 0.26], [0.25, 0.14], 0.038, P.port);
    ap.add(boxG(0.05, 0.025, 0.07, 0.25, 0.115, 0), P.metalDark);
    ap.add(boxG(0.02, 0.06, 0.018, 0.25, 0.06, -0.025), P.metalLight);
    ap.add(boxG(0.02, 0.06, 0.018, 0.25, 0.06, 0.025), P.metalLight);
    arm.add(ap.mesh(paintMetalMat));
    root.add(arm);
  }

  iconHolder(root, 0.32, 0.96, 0.3);
  return root;
}
