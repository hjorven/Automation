import { BoxGeometry, CylinderGeometry, Group, MeshStandardMaterial } from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts, outputArrow } from "./buildings";
import { Paint, boxG, cylG, mesh, paintMetalMat } from "./kit";

// Drohnenhafen und Lieferdrohne. Gleicher Vertrag wie die anderen Modelle:
// Group, zentriert, Boden y = 0, Ausgang nach +x.
// Benannte Teile: "beacon" (Landelicht), "rotor" (vier Rotoren), "cargo" (Kiste).

/** Hoehe der Landeflaeche; dort steht die Drohne, wenn sie zu Hause ist. */
export const DRONE_PAD_Y = 0.42;

/** Drohnenhafen: Plattform auf Stuetzen mit Landekreuz, Trichter hinten, Rutsche vorne. */
export function dronePortModel(): Group {
  const p = new Paint();
  basePlate(p, 0.94, 0.06, P.metalDark);
  // Vier Stuetzen und Landeplattform.
  for (const x of [-0.36, 0.36]) for (const z of [-0.36, 0.36]) p.add(boxG(0.07, 0.3, 0.07, x, 0.06, z), P.metal);
  p.add(boxG(0.9, 0.06, 0.9, 0, 0.36, 0), P.dronePad);
  // Landekreuz "H" und Randmarkierung.
  p.add(boxG(0.06, 0.008, 0.4, -0.12, DRONE_PAD_Y, 0), P.port);
  p.add(boxG(0.06, 0.008, 0.4, 0.12, DRONE_PAD_Y, 0), P.port);
  p.add(boxG(0.24, 0.008, 0.06, 0, DRONE_PAD_Y, 0), P.port);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    p.add(new BoxGeometry(0.1, 0.008, 0.03).rotateY(-a).translate(Math.cos(a) * 0.36, DRONE_PAD_Y, Math.sin(a) * 0.36), P.metalLight);
  }
  // Einfuelltrichter hinten (Items von Baendern).
  p.add(new CylinderGeometry(0.16, 0.08, 0.2, 4, 1, true).rotateY(Math.PI / 4).translate(-0.4, 0.2, 0), P.drone);
  p.add(boxG(0.12, 0.1, 0.12, -0.4, 0.06, 0), P.metalDark);
  // Ausgaberutsche vorne.
  p.add(new BoxGeometry(0.22, 0.03, 0.26).rotateZ(-0.5).translate(0.38, 0.2, 0), P.metalLight);
  outputArrow(p, 0.08, 0.46);
  // Antennenmast.
  p.add(cylG(0.015, 0.015, 0.5, 4, -0.4, 0.4, -0.4), P.metalLight);
  bolts(p, [-0.36, 0.36], [-0.36, 0.36], 0.42);
  const root = new Group();
  root.add(p.mesh(paintMetalMat));

  const beaconMat = new MeshStandardMaterial({ color: 0x0a2a3a, emissive: P.beacon, emissiveIntensity: 0.6, flatShading: true });
  for (const [x, z] of [
    [-0.42, -0.42],
    [0.42, 0.42],
  ]) {
    const b = mesh(new CylinderGeometry(0.035, 0.035, 0.05, 6), beaconMat, x, DRONE_PAD_Y + 0.02, z);
    b.name = "beacon";
    root.add(b);
  }
  const tip = mesh(new CylinderGeometry(0.025, 0.025, 0.04, 6), beaconMat, -0.4, 0.92, -0.4);
  tip.name = "beacon";
  root.add(tip);
  return root;
}

/** Lieferdrohne: Rumpf, vier Ausleger mit Rotoren ("rotor"), Kiste darunter ("cargo"). */
export function droneModel(): Group {
  const p = new Paint();
  p.add(boxG(0.3, 0.1, 0.22, 0, 0.06, 0), P.drone);
  p.add(boxG(0.18, 0.05, 0.16, 0, 0.16, 0), P.droneDark);
  p.add(boxG(0.06, 0.03, 0.12, 0.17, 0.08, 0), P.glass);
  for (const [x, z] of [
    [0.22, 0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [-0.22, -0.22],
  ]) {
    const len = Math.hypot(x, z);
    p.add(new BoxGeometry(len, 0.03, 0.04).rotateY(-Math.atan2(z, x)).translate(x / 2, 0.11, z / 2), P.droneDark);
    p.add(cylG(0.035, 0.04, 0.06, 6, x, 0.1, z), P.metalDark);
  }
  // Landekufen.
  for (const z of [-0.1, 0.1]) {
    p.add(boxG(0.3, 0.02, 0.02, 0, 0, z), P.metalDark);
    for (const x of [-0.1, 0.1]) p.add(boxG(0.02, 0.06, 0.02, x, 0, z), P.metalDark);
  }
  const root = new Group();
  root.add(p.mesh(paintMetalMat));

  for (const [x, z] of [
    [0.22, 0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [-0.22, -0.22],
  ]) {
    const rp = new Paint();
    rp.add(new BoxGeometry(0.3, 0.008, 0.04), P.metalLight);
    rp.add(new BoxGeometry(0.04, 0.008, 0.3), P.metalLight);
    const rotor = rp.mesh(paintMetalMat);
    rotor.name = "rotor";
    rotor.position.set(x, 0.17, z);
    rotor.castShadow = false;
    root.add(rotor);
  }

  const cp = new Paint();
  cp.add(boxG(0.16, 0.12, 0.16, 0, -0.14, 0), P.storage);
  cp.add(boxG(0.17, 0.02, 0.17, 0, -0.08, 0), P.storageDark);
  cp.add(boxG(0.02, 0.1, 0.02, 0, -0.06, 0), P.metalDark);
  const cargo = cp.mesh();
  cargo.name = "cargo";
  root.add(cargo);
  return root;
}
