import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
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

/** Hoehe der Startplattform; dort steht die Drohne (scene-view.ts startet sie von hier). */
export const HUB_PAD_Y = 0.6;

/** Ecken der vier Raketen-Triebwerke der Drohne (x, z). */
const THRUSTERS: [number, number][] = [
  [0.19, 0.19],
  [0.19, -0.19],
  [-0.19, 0.19],
  [-0.19, -0.19],
];

export function hubModel(): Group {
  const root = new Group();
  const p = new Paint();
  // Achteckiger Sockel mit Einfuelloeffnungen zu allen vier Seiten.
  p.add(cylG(0.5, 0.54, 0.1, 8, 0, 0, 0).rotateY(Math.PI / 8), P.hubDark);
  p.add(cylG(0.46, 0.5, 0.03, 8, 0, 0.1, 0).rotateY(Math.PI / 8), P.hubBase);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    p.add(boxG(0.16, 0.1, 0.28, 0.36, 0.1, 0).rotateY(a), P.hubShell);
    p.add(boxG(0.17, 0.02, 0.2, 0.36, 0.2, 0).rotateY(a), P.rubber);
  }
  // Schlanker Turm aus Segmenten, nach oben breiter (traegt die Plattform).
  p.add(cylG(0.24, 0.32, 0.16, 8, 0, 0.13, 0), P.hubShell);
  p.add(cylG(0.2, 0.24, 0.16, 8, 0, 0.29, 0), P.hubDark);
  p.add(cylG(0.3, 0.2, 0.1, 8, 0, 0.45, 0), P.hubShell);
  // Vier schraege Stuetzen zur Plattform.
  for (let i = 0; i < 4; i++) {
    const g = boxG(0.035, 0.36, 0.035, 0, -0.18, 0);
    g.rotateZ(-0.5);
    g.translate(0.27, 0.36, 0);
    g.rotateY(Math.PI / 4 + (i * Math.PI) / 2);
    p.add(g, P.metalLight);
  }
  // Runde Startplattform mit Rand.
  p.add(cylG(0.4, 0.34, 0.06, 16, 0, HUB_PAD_Y - 0.06, 0), P.hubDark);
  p.add(cylG(0.41, 0.41, 0.015, 16, 0, HUB_PAD_Y - 0.03, 0), P.hubShell);
  root.add(p.mesh(paintMetalMat));

  // Leuchtende Teile teilen sich eine Materialkopie je Hub (Name "beacon").
  const neon = new MeshStandardMaterial({ color: P.hubNeon, emissive: P.hubNeon, emissiveIntensity: 1, flatShading: true });
  const padRing = new RingGeometry(0.26, 0.31, 24);
  padRing.rotateX(-Math.PI / 2);
  const pr = mesh(padRing, neon, 0, HUB_PAD_Y + 0.002, 0);
  pr.name = "beacon";
  pr.castShadow = false;
  root.add(pr);
  for (const y of [0.27, 0.43]) {
    const band = mesh(new CylinderGeometry(0.245, 0.245, 0.02, 8), neon, 0, y, 0);
    band.name = "beacon";
    band.castShadow = false;
    root.add(band);
  }

  // Holografischer Ring, der sich um den Turm dreht.
  const ring = new Group();
  ring.name = "ring";
  ring.position.set(0, 0.36, 0);
  ring.rotation.x = Math.PI / 2;
  const rp = new Paint();
  rp.add(new TorusGeometry(0.34, 0.012, 4, 32), P.hubNeon);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const g = new BoxGeometry(0.06, 0.03, 0.03);
    g.translate(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0);
    rp.add(g, P.hubShell);
  }
  ring.add(rp.mesh(paintMetalMat));
  root.add(ring);

  // Druckwelle beim Start: flacher Ring, eigene Materialkopie je Hub ("shock").
  const shockMat = new MeshBasicMaterial({ color: P.hubNeon, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const shockGeo = new RingGeometry(0.3, 0.42, 32);
  shockGeo.rotateX(-Math.PI / 2);
  const shock = new Mesh(shockGeo, shockMat);
  shock.name = "shock";
  shock.position.y = HUB_PAD_Y + 0.01;
  shock.visible = false;
  root.add(shock);

  const drone = droneModel();
  drone.position.set(0, HUB_PAD_Y, 0);
  drone.scale.setScalar(1.25);
  root.add(drone);
  return root;
}

/**
 * Liefer-Drohne mit vier Raketen-Triebwerken. Name "drone"; die Flammen unter
 * den Duesen heissen "flame" (Spitze nach unten, scene-view skaliert sie).
 */
function droneModel(): Group {
  const drone = new Group();
  drone.name = "drone";
  const p = new Paint();
  // Landebeine.
  for (const [x, z] of THRUSTERS) {
    const leg = boxG(0.018, 0.08, 0.018, 0, 0, 0);
    leg.translate(x * 0.75, 0, z * 0.75);
    p.add(leg, P.metalDark);
    p.add(boxG(0.05, 0.012, 0.05, x * 0.75, 0, z * 0.75), P.metalDark);
  }
  // Rumpf: flaches Achteck mit Kante, oben eine Glaskuppel.
  p.add(cylG(0.17, 0.14, 0.05, 8, 0, 0.07, 0).rotateY(Math.PI / 8), P.hubDark);
  p.add(cylG(0.16, 0.17, 0.05, 8, 0, 0.12, 0).rotateY(Math.PI / 8), P.hubShell);
  p.add(cylG(0.12, 0.16, 0.03, 8, 0, 0.17, 0).rotateY(Math.PI / 8), P.hubShell);
  const dome = new SphereGeometry(0.08, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, 0.2, 0);
  p.add(dome, P.glass);
  // Frachtkapsel unten.
  p.add(boxG(0.12, 0.04, 0.12, 0, 0.035, 0), P.hubDark);
  // Ausleger und Triebwerke mit Duesen.
  for (const [x, z] of THRUSTERS) {
    const arm = boxG(0.2, 0.025, 0.04, 0.1, 0, 0);
    arm.rotateY(-Math.atan2(z, x));
    arm.translate(0, 0.12, 0);
    p.add(arm, P.hubDark);
    p.add(cylG(0.045, 0.04, 0.1, 8, x, 0.09, z), P.hubShell);
    p.add(cylG(0.047, 0.047, 0.015, 8, x, 0.17, z), P.planeAccent);
    p.add(cylG(0.03, 0.04, 0.04, 8, x, 0.05, z), P.metalDark);
  }
  drone.add(p.mesh(paintMetalMat));

  // Flammen: helle Plasma-Kegel, Spitze nach unten, Ursprung an der Duese.
  const flameMat = new MeshBasicMaterial({ color: P.thrusterFlame, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending });
  const coreMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
  const flameGeo = new ConeGeometry(0.035, 0.2, 8);
  flameGeo.rotateX(Math.PI);
  flameGeo.translate(0, -0.1, 0);
  const coreGeo = new ConeGeometry(0.018, 0.12, 6);
  coreGeo.rotateX(Math.PI);
  coreGeo.translate(0, -0.06, 0);
  for (const [x, z] of THRUSTERS) {
    const flame = new Group();
    flame.name = "flame";
    flame.position.set(x, 0.05, z);
    flame.add(new Mesh(flameGeo, flameMat), new Mesh(coreGeo, coreMat));
    flame.scale.setScalar(0.001);
    drone.add(flame);
  }
  return drone;
}
