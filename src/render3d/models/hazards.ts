import { BoxGeometry, ConeGeometry, DodecahedronGeometry, Group, MeshStandardMaterial, SphereGeometry } from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts } from "./buildings";
import { Paint, boxG, coneG, cylG, mesh } from "./kit";

// Herausforderung: Abwehrturm, Nest und Kreatur. Gleicher Vertrag wie in
// buildings.ts: Group, zentriert, Boden y = 0, vorne = +x.
// Animierte Teile: "head" (Turmkopf, dreht um y), "glow" (Muendungsfeuer bzw.
// glimmende Eier), "body" (Kreatur, wippt), "leg" (Beine).

const ARMOR = 0x5d6b4f;
const ARMOR_DARK = 0x3c4634;
const CHITIN = 0x4a2f3d;
const CHITIN_LIGHT = 0x7a4a5c;
const EGG = 0xc6ff6a;
const MOUND = 0x5a4636;

/** Abwehrturm: gepanzerter Sockel, drehbarer Kopf mit Doppellauf. */
export function turretModel(): Group {
  const p = new Paint();
  basePlate(p, 0.9, 0.08, P.metalDark);
  bolts(p, [-0.36, 0.36], [-0.36, 0.36], 0.08);
  p.add(cylG(0.3, 0.36, 0.22, 8, 0, 0.08, 0), ARMOR_DARK);
  p.add(cylG(0.24, 0.26, 0.06, 8, 0, 0.3, 0), P.metal);
  const root = new Group();
  root.add(p.mesh());

  const h = new Paint();
  h.add(boxG(0.36, 0.2, 0.34, -0.02, 0, 0), ARMOR);
  h.add(boxG(0.3, 0.04, 0.28, -0.04, 0.2, 0), ARMOR_DARK);
  // Sensor oben und zwei Laeufe nach +x.
  h.add(cylG(0.035, 0.035, 0.06, 6, -0.1, 0.24, 0.08), P.metalDark);
  h.add(new SphereGeometry(0.035, 8, 6).translate(-0.1, 0.32, 0.08), P.glass);
  for (const z of [-0.07, 0.07]) {
    h.add(new BoxGeometry(0.36, 0.05, 0.05).translate(0.32, 0.1, z), P.metalDark);
    h.add(new BoxGeometry(0.05, 0.07, 0.07).translate(0.5, 0.1, z), P.metal);
  }
  const head = new Group();
  head.name = "head";
  head.position.y = 0.36;
  head.add(h.mesh());

  const flashMat = new MeshStandardMaterial({ color: 0x402010, emissive: 0xffc060, emissiveIntensity: 0, flatShading: true });
  const flash = mesh(new ConeGeometry(0.07, 0.16, 6).rotateZ(-Math.PI / 2), flashMat, 0.61, 0.1, 0);
  flash.name = "glow";
  flash.castShadow = false;
  head.add(flash);
  root.add(head);
  return root;
}

/** Nest: Erdhuegel mit Stacheln und glimmenden Eiern. */
export function nestModel(): Group {
  const p = new Paint();
  p.add(cylG(0.62, 0.8, 0.22, 9, 0, 0, 0), MOUND);
  p.add(cylG(0.32, 0.6, 0.2, 9, 0, 0.22, 0), 0x6b5440);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const r = 0.45 + (i % 2) * 0.12;
    const spike = new ConeGeometry(0.06, 0.45 + (i % 3) * 0.12, 5).translate(0, 0.22, 0);
    spike.rotateZ(Math.cos(a) * -0.5).rotateX(Math.sin(a) * 0.5);
    p.add(spike.translate(Math.cos(a) * r, 0.18, Math.sin(a) * r), i % 2 ? CHITIN : CHITIN_LIGHT);
  }
  p.add(cylG(0.18, 0.22, 0.03, 8, 0, 0.42, 0), 0x2a1e18);
  const root = new Group();
  root.add(p.mesh());

  const eggMat = new MeshStandardMaterial({ color: 0x3a5020, emissive: EGG, emissiveIntensity: 0.6, flatShading: true });
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.1, 0.07, 0.8],
    [-0.08, 0.09, 0.7],
    [0.03, -0.1, 0.75],
  ] as const) {
    const egg = mesh(new SphereGeometry(0.07 * s, 7, 5).scale(1, 1.3, 1), eggMat, x, 0.47, z);
    egg.name = "glow";
    egg.castShadow = false;
    root.add(egg);
  }
  return root;
}

/** Kreatur: kleiner Kaefer mit sechs Beinen und leuchtenden Augen, Kopf nach +x. */
export function creatureModel(): Group {
  const root = new Group();
  const b = new Paint();
  b.add(new DodecahedronGeometry(0.16).scale(1.3, 0.7, 1).translate(-0.04, 0, 0), CHITIN);
  b.add(new DodecahedronGeometry(0.1).scale(1.1, 0.8, 1).translate(0.16, 0.01, 0), CHITIN_LIGHT);
  // Panzerplatten und Kiefer.
  b.add(boxG(0.26, 0.03, 0.04, -0.06, 0.09, 0), CHITIN_LIGHT);
  for (const z of [-0.04, 0.04]) b.add(coneG(0.02, 0.1, 4).rotateZ(-Math.PI / 2).translate(0.28, -0.02, z), 0xd8c8a8);
  const body = b.mesh();
  body.name = "body";
  body.position.y = 0.16;
  root.add(body);

  const eyeMat = new MeshStandardMaterial({ color: 0x400000, emissive: 0xff4a3a, emissiveIntensity: 1.4, flatShading: true });
  for (const z of [-0.045, 0.045]) {
    const eye = mesh(new SphereGeometry(0.022, 6, 4), eyeMat, 0.22, 0.05, z);
    eye.castShadow = false;
    body.add(eye);
  }

  const legMat = new MeshStandardMaterial({ color: 0x2c1c24, flatShading: true });
  const legGeo = new BoxGeometry(0.02, 0.02, 0.2).translate(0, 0, 0.1);
  legGeo.rotateX(0.5);
  for (const side of [-1, 1]) {
    for (const x of [-0.12, 0, 0.12]) {
      const leg = mesh(legGeo, legMat, x, 0.14, side * 0.08);
      leg.scale.z = side;
      leg.name = "leg";
      root.add(leg);
    }
  }
  return root;
}
