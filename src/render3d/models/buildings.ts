import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { PALETTE as P } from "../palette";
import { gearShapeGeometry } from "./items";
import { Paint, boxG, coneG, cylG, mesh, paintMetalMat } from "./kit";

// Statische Teile eines Gebaeudes werden zu einem Mesh mit Vertex-Farben
// verschmolzen. Animierte Teile sind eigene Objekte mit festen Namen, ueber
// die scene-view.ts sie in Klonen findet: "head", "arm", "icon", "ring",
// "glow", "beacon", "puff".

/** Pfeil am Ausgang (+x) als Teil der statischen Geometrie. */
function outputArrow(p: Paint, y: number, x = 0.45) {
  const g = coneG(0.085, 0.16, 3, 0, -0.08, 0);
  g.rotateZ(-Math.PI / 2);
  g.translate(x, y, 0);
  p.add(g, P.port);
}

/** Bodenplatte mit Warnstreifen an den Kanten. */
function basePlate(p: Paint, size: number, h: number, color: number) {
  p.add(boxG(size, h, size), color);
  const stripe = 0.035;
  for (let i = -3; i <= 3; i++) {
    const c = i % 2 === 0 ? P.extractor : P.hazard;
    const w = size / 7;
    p.add(boxG(w, 0.012, stripe, i * w, h, -size / 2 + stripe / 2), c);
    p.add(boxG(w, 0.012, stripe, i * w, h, size / 2 - stripe / 2), c);
  }
}

function bolts(p: Paint, xs: number[], zs: number[], y: number) {
  for (const x of xs) for (const z of zs) p.add(cylG(0.022, 0.022, 0.02, 6, x, y, z), P.bolt);
}

// ---------------------------------------------------------------- Bohrer

/** Hoehe, auf der scene-view den Bohrkopf platziert. */
const HEAD_Y = 0.56;

export function extractorModel(): Group {
  const root = new Group();
  const p = new Paint();
  basePlate(p, 0.9, 0.1, P.metalDark);
  bolts(p, [-0.38, 0.38], [-0.38, 0.38], 0.1);

  // Gehaeuse mit Wartungsklappe und Lueftungsschlitzen.
  p.add(boxG(0.56, 0.36, 0.56, -0.04, 0.1, 0), P.extractorBody);
  p.add(boxG(0.6, 0.04, 0.6, -0.04, 0.46, 0), P.metal);
  p.add(boxG(0.02, 0.18, 0.22, -0.33, 0.16, 0), P.metal);
  for (let i = 0; i < 3; i++) p.add(boxG(0.3, 0.025, 0.02, -0.06, 0.2 + i * 0.07, 0.285), P.hazard);
  for (let i = 0; i < 3; i++) p.add(boxG(0.3, 0.025, 0.02, -0.06, 0.2 + i * 0.07, -0.285), P.hazard);

  // Turm aus vier Pfosten mit Querstreben, darin dreht sich der Kopf.
  const posts: [number, number][] = [
    [-0.36, -0.34],
    [-0.36, 0.34],
    [0.28, -0.34],
    [0.28, 0.34],
  ];
  for (const [x, z] of posts) p.add(boxG(0.08, 0.84, 0.08, x, 0.1, z), P.extractor);
  for (const z of [-0.34, 0.34]) p.add(boxG(0.72, 0.06, 0.06, -0.04, 0.88, z), P.extractor);
  for (const x of [-0.36, 0.28]) p.add(boxG(0.06, 0.06, 0.74, x, 0.88, 0), P.extractor);
  // Diagonale Streben an den Seiten.
  for (const z of [-0.34, 0.34]) {
    const g = boxG(0.04, 0.7, 0.04, 0, -0.35, 0);
    g.rotateZ(0.72);
    g.translate(-0.04, 0.6, z);
    p.add(g, P.extractor);
  }

  // Auswurf-Rutsche zum Band.
  const chute = boxG(0.28, 0.06, 0.26, 0, 0, 0);
  chute.rotateZ(-0.35);
  chute.translate(0.34, 0.2, 0);
  p.add(chute, P.metal);
  p.add(boxG(0.28, 0.08, 0.03, 0.34, 0.22, -0.13), P.metalDark);
  p.add(boxG(0.28, 0.08, 0.03, 0.34, 0.22, 0.13), P.metalDark);
  outputArrow(p, 0.44, 0.42);
  root.add(p.mesh());

  // Bohrkopf: Zahnrad-Scheibe, drei Fluegel, Spitze nach oben, Welle ins Gehaeuse.
  const head = new Group();
  head.name = "head";
  head.position.set(-0.04, HEAD_Y, 0);
  const hp = new Paint();
  hp.add(cylG(0.04, 0.04, 0.22, 6, 0, -0.12, 0), P.metalLight);
  const gear = gearShapeGeometry(12, 0.25, 0.21, 0.07, 0.05);
  hp.add(gear, P.metal);
  hp.add(cylG(0.08, 0.1, 0.06, 8, 0, 0.05, 0), P.metalDark);
  for (let i = 0; i < 3; i++) {
    const fin = boxG(0.2, 0.05, 0.07, 0.12, 0.06, 0);
    fin.rotateY((i * Math.PI * 2) / 3);
    hp.add(fin, P.extractor);
  }
  hp.add(coneG(0.07, 0.18, 6, 0, 0.11, 0), P.extractorCap);
  head.add(hp.mesh(paintMetalMat));
  root.add(head);
  return root;
}

// ---------------------------------------------------------------- Schmelze

export function smelterModel(): Group {
  const root = new Group();
  const p = new Paint();
  p.add(boxG(0.92, 0.1, 0.92), P.smelterStone);
  bolts(p, [-0.4, 0.4], [-0.4, 0.4], 0.1);

  // Ofen aus Ziegel-Lagen, abwechselnd dunkel, mit Metallbaendern.
  const courses = 5;
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const r0 = 0.42 - t * 0.1;
    const r1 = 0.42 - (t + 1 / courses) * 0.1;
    p.add(cylG(r1, r0, 0.1, 8, 0, 0.1 + i * 0.1, 0), i % 2 ? P.brickDark : P.brick);
  }
  p.add(cylG(0.4, 0.43, 0.035, 8, 0, 0.2, 0), P.metalDark);
  p.add(cylG(0.35, 0.37, 0.035, 8, 0, 0.45, 0), P.metalDark);
  // Rand oben um die Glut.
  p.add(cylG(0.3, 0.32, 0.08, 8, 0, 0.6, 0), P.smelterStone);

  // Ofentuer nach vorne (+x) mit Rahmen.
  p.add(boxG(0.1, 0.26, 0.34, 0.37, 0.12, 0), P.smelterStone);
  p.add(boxG(0.03, 0.04, 0.3, 0.43, 0.36, 0), P.metalDark);

  // Schornstein hinten links (scene-view laesst dort den Rauch aufsteigen).
  p.add(boxG(0.16, 0.56, 0.16, -0.3, 0.1, -0.28), P.brick);
  p.add(boxG(0.16, 0.04, 0.16, -0.3, 0.3, -0.28), P.brickDark);
  p.add(boxG(0.22, 0.06, 0.22, -0.3, 0.66, -0.28), P.metalDark);

  // Kohlehaufen hinten rechts.
  for (const [x, z, r] of [
    [-0.3, 0.3, 0.07],
    [-0.22, 0.36, 0.055],
    [-0.36, 0.22, 0.05],
  ] as const) {
    const g = new DodecahedronGeometry(r);
    g.translate(x, 0.1 + r * 0.7, z);
    p.add(g, P.coal);
  }
  outputArrow(p, 0.08, 0.47);
  root.add(p.mesh());

  // Glut: eine Materialkopie je Schmelze (scene-view regelt die Helligkeit).
  const glow = new MeshStandardMaterial({ color: 0x401a08, emissive: P.smelterGlow, emissiveIntensity: 0, flatShading: true });
  const mouth = mesh(new BoxGeometry(0.03, 0.18, 0.24), glow, 0.43, 0.22, 0);
  mouth.name = "glow";
  mouth.castShadow = false;
  root.add(mouth);
  const pool = mesh(new CylinderGeometry(0.26, 0.26, 0.02, 8), glow, 0, 0.67, 0);
  pool.name = "glow";
  pool.castShadow = false;
  root.add(pool);

  const puffMat = new MeshStandardMaterial({ color: 0xd8dde3, flatShading: true, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 3; i++) {
    const puff = new Mesh(new DodecahedronGeometry(0.08), puffMat);
    puff.name = "puff";
    puff.visible = false;
    root.add(puff);
  }
  return root;
}

// ---------------------------------------------------------------- Montierer

export function assemblerModel(): Group {
  const root = new Group();
  const p = new Paint();
  basePlate(p, 0.94, 0.1, P.metalDark);

  // Gehaeuse mit abgesetzten Seitenpaneelen und Fenstern.
  p.add(boxG(0.8, 0.34, 0.8, 0, 0.1, 0), P.assembler);
  for (const z of [-0.405, 0.405]) {
    p.add(boxG(0.56, 0.2, 0.01, 0, 0.17, z), P.assemblerPanel);
    p.add(boxG(0.3, 0.07, 0.012, 0, 0.24, z), P.glass);
  }
  p.add(boxG(0.84, 0.04, 0.84, 0, 0.44, 0), P.metal);
  p.add(boxG(0.66, 0.05, 0.66, 0, 0.48, 0), P.assemblerTop);
  // Eckverstaerkungen.
  for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) p.add(boxG(0.06, 0.36, 0.06, x, 0.1, z), P.metalDark);

  // Eingangstrichter hinten (-x), Ausgabeschlitz vorne (+x).
  const funnel = cylG(0.16, 0.08, 0.14, 4, 0, 0, 0);
  funnel.rotateY(Math.PI / 4);
  funnel.translate(-0.26, 0.53, 0.2);
  p.add(funnel, P.metal);
  p.add(boxG(0.04, 0.16, 0.36, 0.41, 0.14, 0), P.rubber);
  p.add(boxG(0.03, 0.03, 0.4, 0.42, 0.3, 0), P.port);
  outputArrow(p, 0.38);

  // Sockel unter dem schwebenden Rezept-Symbol.
  p.add(cylG(0.09, 0.11, 0.05, 8, 0.12, 0.53, 0.12), P.metalDark);
  p.add(cylG(0.07, 0.07, 0.012, 8, 0.12, 0.58, 0.12), P.glass);
  root.add(p.mesh());

  // Roboterarm: Drehsockel, Oberarm, Unterarm, Greifer.
  const arm = new Group();
  arm.name = "arm";
  arm.position.set(-0.18, 0.53, -0.18);
  const ap = new Paint();
  ap.add(cylG(0.08, 0.1, 0.06, 8, 0, 0, 0), P.metalDark);
  ap.add(cylG(0.05, 0.06, 0.16, 6, 0, 0.06, 0), P.metalLight);
  limb(ap, [0, 0.2], [0.18, 0.33], 0.055, P.port);
  ap.add(cylG(0.035, 0.035, 0.07, 8, 0, -0.035, 0).rotateX(Math.PI / 2).translate(0.18, 0.33, 0), P.metalDark);
  limb(ap, [0.18, 0.33], [0.32, 0.2], 0.045, P.port);
  ap.add(boxG(0.06, 0.03, 0.08, 0.32, 0.17, 0), P.metalDark);
  ap.add(boxG(0.025, 0.08, 0.02, 0.32, 0.1, -0.03), P.metalLight);
  ap.add(boxG(0.025, 0.08, 0.02, 0.32, 0.1, 0.03), P.metalLight);
  arm.add(ap.mesh(paintMetalMat));
  root.add(arm);

  const icon = new Group();
  icon.name = "icon";
  icon.position.set(0.12, 0.92, 0.12);
  root.add(icon);
  return root;
}

/** Armglied als Balken von a nach b in der x-y-Ebene. */
function limb(p: Paint, a: [number, number], b: [number, number], t: number, color: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const g = boxG(Math.hypot(dx, dy), t, t, 0, -t / 2, 0);
  g.translate(Math.hypot(dx, dy) / 2, 0, 0);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate(a[0], a[1], 0);
  p.add(g, color);
}

// ---------------------------------------------------------------- Hub

/** Hoehe des Landedecks; dort parkt der Flieger (scene-view.ts startet ihn von hier). */
export const HUB_PAD_Y = 0.66;

export function hubModel(): Group {
  const root = new Group();
  const p = new Paint();
  // Achteckige Plattform mit Einfuelloeffnungen zu allen vier Seiten.
  p.add(cylG(0.5, 0.54, 0.1, 8, 0, 0, 0).rotateY(Math.PI / 8), P.hubBase);
  p.add(cylG(0.46, 0.5, 0.03, 8, 0, 0.1, 0).rotateY(Math.PI / 8), P.hubPad);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    p.add(boxG(0.16, 0.1, 0.28, 0.36, 0.1, 0).rotateY(a), P.hubTrim);
    p.add(boxG(0.17, 0.02, 0.2, 0.36, 0.2, 0).rotateY(a), P.rubber);
  }
  // Lager-Turm, der das Landedeck traegt.
  p.add(cylG(0.28, 0.36, 0.3, 8, 0, 0.13, 0), P.hub);
  p.add(cylG(0.3, 0.3, 0.04, 8, 0, 0.29, 0), P.hubTrim);
  p.add(cylG(0.2, 0.26, 0.2, 8, 0, 0.33, 0), P.hub);
  for (const [x, z] of [
    [-0.24, -0.2],
    [-0.24, 0.2],
    [0.24, -0.2],
    [0.24, 0.2],
  ] as const) {
    p.add(boxG(0.04, HUB_PAD_Y - 0.13, 0.04, x, 0.13, z), P.metalLight);
  }

  // Landedeck mit Rand, Mittellinie und Landekreuz.
  p.add(boxG(0.66, 0.05, 0.5, 0, HUB_PAD_Y - 0.05, 0), P.metalDark);
  p.add(boxG(0.7, 0.02, 0.04, 0, HUB_PAD_Y - 0.02, -0.25), P.hubTrim);
  p.add(boxG(0.7, 0.02, 0.04, 0, HUB_PAD_Y - 0.02, 0.25), P.hubTrim);
  for (let i = -2; i <= 2; i++) p.add(boxG(0.06, 0.004, 0.015, i * 0.12, HUB_PAD_Y, 0), P.hubTrim);
  p.add(boxG(0.1, 0.004, 0.02, -0.22, HUB_PAD_Y, 0), P.planeAccent);
  p.add(boxG(0.02, 0.004, 0.1, -0.22, HUB_PAD_Y, 0), P.planeAccent);

  // Kleine Kisten auf der Plattform.
  p.add(boxG(0.12, 0.1, 0.12, 0.31, 0.13, 0.31), P.extractor);
  p.add(boxG(0.1, 0.08, 0.1, -0.31, 0.13, -0.31), P.assembler);
  // Mast fuer das Leuchtfeuer an der Ecke.
  p.add(cylG(0.02, 0.03, 0.62, 6, -0.31, 0.13, 0.31), P.metalLight);
  root.add(p.mesh());

  const beacon = new MeshStandardMaterial({ color: P.beacon, emissive: P.beacon, emissiveIntensity: 1, flatShading: true });
  const b = mesh(new SphereGeometry(0.06, 8, 6), beacon, -0.31, 0.79, 0.31);
  b.name = "beacon";
  b.castShadow = false;
  root.add(b);

  // Drehender Ring mit Positionslichtern um den Turm.
  const ring = new Group();
  ring.name = "ring";
  ring.position.set(0, 0.42, 0);
  ring.rotation.x = Math.PI / 2;
  const rp = new Paint();
  rp.add(new TorusGeometry(0.3, 0.02, 6, 24), P.hub);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const g = new BoxGeometry(0.05, 0.05, 0.05);
    g.translate(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    rp.add(g, i % 2 ? P.beacon : P.hubTrim);
  }
  ring.add(rp.mesh(paintMetalMat));
  root.add(ring);

  const plane = planeModel();
  plane.position.set(0, HUB_PAD_Y, 0);
  plane.scale.setScalar(1.25);
  root.add(plane);
  return root;
}

/**
 * Kleiner Fracht-Flieger, Nase nach +x, Raeder bei y = 0. Name "plane",
 * Propeller "prop" (dreht um die x-Achse).
 */
function planeModel(): Group {
  const plane = new Group();
  plane.name = "plane";
  const p = new Paint();
  // Rumpf: liegender Zylinder, hinten schlanker.
  const body = cylG(0.035, 0.055, 0.4, 8, 0, -0.2, 0);
  body.rotateZ(-Math.PI / 2);
  body.translate(0, 0.09, 0);
  p.add(body, P.plane);
  const nose = coneG(0.055, 0.07, 8, 0, -0.035, 0);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(0.235, 0.09, 0);
  p.add(nose, P.planeAccent);
  // Streifen und Cockpit.
  const stripe = cylG(0.057, 0.057, 0.04, 8, 0, -0.02, 0);
  stripe.rotateZ(-Math.PI / 2);
  stripe.translate(-0.06, 0.09, 0);
  p.add(stripe, P.planeAccent);
  p.add(boxG(0.09, 0.04, 0.07, 0.11, 0.115, 0), P.glass);
  // Tragflaechen (Hochdecker) mit orangen Spitzen.
  p.add(boxG(0.13, 0.016, 0.56, 0.04, 0.145, 0), P.plane);
  p.add(boxG(0.13, 0.017, 0.06, 0.04, 0.145, -0.25), P.planeAccent);
  p.add(boxG(0.13, 0.017, 0.06, 0.04, 0.145, 0.25), P.planeAccent);
  for (const z of [-0.14, 0.14]) {
    const strut = boxG(0.015, 0.09, 0.015, 0, -0.045, 0);
    strut.rotateX(z > 0 ? -0.6 : 0.6);
    strut.translate(0.04, 0.11, z * 0.6);
    p.add(strut, P.metalLight);
  }
  // Leitwerk.
  p.add(boxG(0.08, 0.012, 0.2, -0.17, 0.1, 0), P.plane);
  p.add(boxG(0.08, 0.1, 0.012, -0.17, 0.1, 0), P.planeAccent);
  // Fahrwerk.
  for (const z of [-0.06, 0.06]) {
    p.add(boxG(0.012, 0.05, 0.012, 0.08, 0.02, z), P.metalDark);
    const wheel = cylG(0.022, 0.022, 0.015, 8, 0, -0.0075, 0);
    wheel.rotateX(Math.PI / 2);
    wheel.translate(0.08, 0.022, z);
    p.add(wheel, P.rubber);
  }
  p.add(boxG(0.012, 0.04, 0.012, -0.18, 0.02, 0), P.metalDark);
  plane.add(p.mesh());

  const prop = new Group();
  prop.name = "prop";
  prop.position.set(0.275, 0.09, 0);
  const pp = new Paint();
  pp.add(boxG(0.01, 0.2, 0.025, 0, -0.1, 0), P.metalDark);
  pp.add(boxG(0.01, 0.025, 0.2, 0, -0.0125, 0), P.metalDark);
  prop.add(pp.mesh());
  plane.add(prop);
  return plane;
}
