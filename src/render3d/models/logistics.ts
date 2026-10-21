import { BoxGeometry, CylinderGeometry, Group, MeshStandardMaterial, TorusGeometry, type BufferGeometry } from "three";
import { PALETTE as P } from "../palette";
import { BELT_TOP } from "./belts";
import { basePlate, bolts, extractorModel, outputArrow } from "./buildings";
import { Paint, boxG, coneG, cylG, mesh } from "./kit";

// Modelle fuer die Gebaeude der Hub-Stufen. Gleicher Vertrag wie in
// buildings.ts: Group, zentriert, Boden y = 0, Ausgang nach +x.

/** Kurzes Bandstueck von der Mitte zur Kante in Richtung `yaw` (0 = +x). */
function beltStub(p: Paint, yaw: number, from = 0.12, to = 0.5, y = 0.1) {
  const len = to - from;
  const parts: [BufferGeometry, number][] = [
    [boxG(len, 0.03, 0.3, from + len / 2, y, 0), P.beltBed],
    [boxG(len, 0.07, 0.04, from + len / 2, y, -0.17), P.beltRail],
    [boxG(len, 0.07, 0.04, from + len / 2, y, 0.17), P.beltRail],
  ];
  for (const [g, c] of parts) p.add(g.rotateY(yaw), c);
  // Laufrichtungs-Streifen.
  for (const k of [0.35, 0.65]) {
    p.add(boxG(0.03, 0.006, 0.18, from + len * k, y + 0.03, 0).rotateY(yaw), 0x6c7684);
  }
}

/** Pfeil auf der Oberseite, zeigt in Richtung `yaw`. */
function arrowOn(p: Paint, yaw: number, y: number, r = 0.3) {
  const g = coneG(0.075, 0.14, 3, 0, -0.07, 0);
  g.rotateZ(-Math.PI / 2);
  g.translate(r, y, 0);
  p.add(g.rotateY(yaw), P.port);
}

// ---------------------------------------------------------------- Verteiler

/** Verteiler: ein Eingang hinten, Ausgaenge vorne, links und rechts (im Wechsel). */
export function splitterModel(): Group {
  const p = new Paint();
  basePlate(p, 0.92, 0.08, P.metalDark);
  beltStub(p, Math.PI, 0.16, 0.48, 0.08);
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
    beltStub(p, yaw, 0.16, 0.48, 0.08);
    arrowOn(p, yaw, 0.15, 0.36);
  }
  // Drehkreuz in der Mitte: Gehaeuse, Weiche, Kappe.
  p.add(cylG(0.22, 0.24, 0.16, 8, 0, 0.08, 0), P.splitter);
  p.add(cylG(0.2, 0.2, 0.03, 8, 0, 0.24, 0), P.metal);
  for (let i = 0; i < 3; i++) {
    p.add(boxG(0.36, 0.05, 0.05, 0, 0.27, 0).rotateY((i * Math.PI) / 3), P.metalLight);
  }
  p.add(cylG(0.06, 0.08, 0.08, 6, 0, 0.27, 0), P.port);
  // Signallampe.
  p.add(cylG(0.02, 0.02, 0.12, 4, -0.18, 0.24, -0.18), P.metalDark);
  p.add(cylG(0.035, 0.035, 0.05, 6, -0.18, 0.36, -0.18), P.splitter);
  const root = new Group();
  root.add(p.mesh());
  return root;
}

// ---------------------------------------------------------------- Zusammenfuehrer

/** Zusammenfuehrer: Eingaenge hinten, links und rechts, ein Ausgang vorne. */
export function mergerModel(): Group {
  const p = new Paint();
  basePlate(p, 0.92, 0.08, P.metalDark);
  for (const yaw of [Math.PI, Math.PI / 2, -Math.PI / 2]) {
    beltStub(p, yaw, 0.2, 0.48, 0.08);
    // Gummilappen am Einlauf.
    p.add(boxG(0.03, 0.1, 0.26, 0.2, 0.12, 0).rotateY(yaw), P.rubber);
    p.add(boxG(0.05, 0.04, 0.32, 0.21, 0.22, 0).rotateY(yaw), P.merger);
  }
  beltStub(p, 0, 0.2, 0.48, 0.08);
  arrowOn(p, 0, 0.15, 0.36);
  // Sammelkasten mit Klappe zum Ausgang.
  p.add(boxG(0.36, 0.22, 0.36, -0.02, 0.08, 0), P.merger);
  p.add(boxG(0.4, 0.03, 0.4, -0.02, 0.3, 0), P.metal);
  p.add(boxG(0.03, 0.12, 0.2, 0.17, 0.1, 0), P.rubber);
  p.add(boxG(0.16, 0.05, 0.16, -0.02, 0.33, 0), P.metalLight);
  bolts(p, [-0.17, 0.13], [-0.17, 0.17], 0.33);
  const root = new Group();
  root.add(p.mesh());
  return root;
}

// ---------------------------------------------------------------- Tunnel

/**
 * Tunnel-Eingang (Band taucht nach +x unter die Erde) oder -Ausgang (Band
 * kommt bei -x aus der Erde und laeuft nach +x weiter).
 */
export function tunnelModel(exit: boolean): Group {
  const p = new Paint();
  basePlate(p, 0.92, 0.06, P.metalDark);
  // Portal-Haube aus Beton auf der Tunnelseite, Oeffnung zur Bandseite.
  const px = exit ? -0.2 : 0.2;
  const dir = exit ? -1 : 1;
  const concrete = 0x8d939b;
  p.add(boxG(0.5, 0.34, 0.12, px, 0.06, -0.37), concrete);
  p.add(boxG(0.5, 0.34, 0.12, px, 0.06, 0.37), concrete);
  p.add(boxG(0.5, 0.1, 0.86, px, 0.4, 0), concrete);
  p.add(boxG(0.38, 0.06, 0.7, px + dir * 0.04, 0.5, 0), 0x6f757d);
  p.add(boxG(0.1, 0.44, 0.86, px + dir * 0.2, 0.06, 0), 0x6f757d); // Rueckwand
  // Dunkler Schacht und Warnstreifen ueber der Oeffnung.
  p.add(boxG(0.38, 0.3, 0.62, px + dir * 0.02, 0.06, 0), 0x15181d);
  for (let i = -3; i <= 3; i++) {
    p.add(boxG(0.04, 0.1, 0.122, px - dir * 0.25, 0.4, i * 0.122), i % 2 ? P.hazard : P.tunnel);
  }
  // Band auf der offenen Seite, rampenartig zur Oeffnung.
  const ramp = boxG(0.48, 0.03, 0.6, 0, -0.015, 0);
  ramp.rotateZ(exit ? -0.12 : 0.12);
  ramp.translate(-px, BELT_TOP - 0.03, 0);
  p.add(ramp, P.beltBed);
  p.add(boxG(0.48, 0.1, 0.05, -px, 0.06, -0.33), P.beltRail);
  p.add(boxG(0.48, 0.1, 0.05, -px, 0.06, 0.33), P.beltRail);
  // Lampe und Pfeil oben.
  p.add(cylG(0.04, 0.04, 0.05, 6, px, 0.56, 0.28), P.port);
  outputArrow(p, 0.6, exit ? 0.05 : 0.3);
  const root = new Group();
  root.add(p.mesh());
  return root;
}

// ---------------------------------------------------------------- Giesserei

/** Giesserei: Hochofen aus Stahl mit Nietbaendern, Schlot und Glut ("glow"). */
export function foundryModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.1, P.metalDark);
  // Ofenkoerper in Stufen.
  p.add(cylG(0.36, 0.4, 0.22, 8, -0.04, 0.1, 0), P.foundry);
  p.add(cylG(0.4, 0.4, 0.04, 8, -0.04, 0.32, 0), P.metalDark);
  p.add(cylG(0.28, 0.36, 0.28, 8, -0.04, 0.36, 0), P.foundry);
  p.add(cylG(0.3, 0.3, 0.04, 8, -0.04, 0.64, 0), P.metalDark);
  // Nieten auf den Baendern.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.add(cylG(0.018, 0.018, 0.02, 4, -0.04 + Math.cos(a) * 0.405, 0.33, Math.sin(a) * 0.405), P.bolt);
  }
  // Schlot mit Ring und Kappe.
  p.add(cylG(0.11, 0.14, 0.5, 8, -0.1, 0.68, -0.08), P.foundry);
  p.add(cylG(0.13, 0.13, 0.04, 8, -0.1, 0.92, -0.08), P.port);
  p.add(cylG(0.16, 0.12, 0.05, 8, -0.1, 1.18, -0.08), P.metalDark);
  // Rohr von der Seite zum Schlot.
  const pipe = cylG(0.04, 0.04, 0.42, 6, 0, -0.21, 0);
  pipe.rotateX(Math.PI / 2);
  pipe.translate(0.12, 0.55, 0.12);
  p.add(pipe, P.metalLight);
  p.add(cylG(0.05, 0.05, 0.3, 6, 0.12, 0.3, 0.33), P.metalLight);
  // Giessrinne nach vorne (+x).
  p.add(boxG(0.24, 0.06, 0.22, 0.36, 0.2, 0), P.metalDark);
  p.add(boxG(0.24, 0.03, 0.12, 0.36, 0.26, 0), 0x3a2a20);
  // Leiter hinten.
  for (const z of [-0.12, 0.12]) p.add(boxG(0.03, 0.6, 0.03, -0.44, 0.1, z), P.metalLight);
  for (let i = 0; i < 4; i++) p.add(boxG(0.03, 0.02, 0.24, -0.44, 0.2 + i * 0.13, 0), P.metalLight);
  outputArrow(p, 0.1, 0.47);
  const root = new Group();
  root.add(p.mesh());

  // Glut: eine Materialkopie je Giesserei (scene-view regelt die Helligkeit).
  const glow = new MeshStandardMaterial({ color: 0x401a08, emissive: P.foundryGlow, emissiveIntensity: 0, flatShading: true });
  const window = mesh(new BoxGeometry(0.03, 0.14, 0.26), glow, 0.33, 0.14, 0);
  window.name = "glow";
  window.castShadow = false;
  root.add(window);
  const melt = mesh(new BoxGeometry(0.22, 0.01, 0.1), glow, 0.36, 0.29, 0);
  melt.name = "glow";
  melt.castShadow = false;
  root.add(melt);
  const top = mesh(new CylinderGeometry(0.22, 0.22, 0.02, 8), glow, -0.04, 0.65, 0);
  top.name = "glow";
  top.castShadow = false;
  root.add(top);
  return root;
}

// ---------------------------------------------------------------- Bohrer Mk2

/** Bohrer Mk2: blauer Turm, Kuehltanks und Turbo-Spule um den Bohrkopf. */
export function extractorMk2Model(): Group {
  const root = extractorModel({ frame: P.extractorMk2, body: P.metalDark, cap: P.beacon });
  const p = new Paint();
  // Kuehltanks an der Rueckseite.
  for (const z of [-0.16, 0.16]) {
    p.add(cylG(0.08, 0.08, 0.34, 8, -0.42, 0.1, z), P.metalLight);
    p.add(cylG(0.085, 0.085, 0.03, 8, -0.42, 0.3, z), P.extractorMk2);
  }
  // Turbo-Spule (feststehend) unter dem Kopf.
  const coil = new TorusGeometry(0.3, 0.025, 6, 16);
  coil.rotateX(Math.PI / 2);
  coil.translate(-0.04, 0.5, 0);
  p.add(coil, P.beacon);
  // Mk2-Plakette vorne.
  p.add(boxG(0.02, 0.1, 0.16, 0.25, 0.22, 0.15), P.extractorMk2);
  root.add(p.mesh());
  return root;
}
