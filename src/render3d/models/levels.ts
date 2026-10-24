import { BoxGeometry, Group, type BufferGeometry } from "three";
import { PALETTE as P } from "../palette";
import { BELT_TOP } from "./belts";
import { Paint, boxG } from "./kit";

// Bruecken-Ebene: Rampen und Stuetzen der Hochbaender. Gleicher Vertrag wie
// die anderen Modelle (Group, zentriert, Boden y = 0, Ausgang nach +x).

/** Hoehe der Bruecken-Ebene; Hochbaender liegen um so viel hoeher als Bodenbaender. */
export const BRIDGE_Y = 1.1;

/**
 * Stuetze unter einem Hochband: zwei Pfeiler an den Bandkanten mit Fuss und
 * Quertraeger, damit Bodenbaender und Rohre darunter frei bleiben.
 */
export function bridgeSupportGeometry(): BufferGeometry {
  const p = new Paint();
  for (const z of [-0.44, 0.44]) {
    p.add(boxG(0.16, 0.05, 0.1, 0, 0, z), P.metalDark);
    p.add(boxG(0.07, BRIDGE_Y - 0.06, 0.07, 0, 0.05, z), P.bridgePillar);
    // Diagonale Verstrebung (als schmale Platte angedeutet).
    p.add(new BoxGeometry(0.02, 0.5, 0.02).rotateX(z > 0 ? 0.5 : -0.5).translate(0, 0.55, z * 0.85), P.metal);
  }
  p.add(boxG(0.12, 0.06, 0.96, 0, BRIDGE_Y - 0.06, 0), P.bridgeBeam);
  // Unterseite des Decks.
  p.add(boxG(1, 0.04, 0.9, 0, BRIDGE_Y - 0.02, 0), P.bridgeDeck);
  return p.build();
}

/** Rampe: geneigtes Band zwischen Boden und Bruecke. `up` = steigt nach +x an. */
export function rampModel(up: boolean): Group {
  const p = new Paint();
  const rise = BRIDGE_Y;
  const slope = Math.atan2(rise, 1);
  const len = Math.hypot(1, rise);
  const tilt = (g: BufferGeometry) => g.rotateZ(up ? slope : -slope).translate(0, rise / 2, 0);
  // Gurt (mit Querrillen) und Seitenwangen.
  p.add(tilt(new BoxGeometry(len, 0.04, 0.76).translate(0, BELT_TOP - 0.02, 0)), P.beltBed);
  for (let i = 0; i < 9; i++) {
    const x = -len / 2 + (i + 0.5) * (len / 9);
    p.add(tilt(new BoxGeometry(0.04, 0.01, 0.7).translate(x, BELT_TOP + 0.005, 0)), 0x3a414c);
  }
  for (const z of [-0.42, 0.42]) {
    p.add(tilt(new BoxGeometry(len, 0.16, 0.08).translate(0, BELT_TOP + 0.02, z)), P.rampSide);
  }
  // Tragwerk: senkrechte Stuetzen unter dem hohen Ende, Fuss am niedrigen.
  const hx = up ? 0.42 : -0.42;
  for (const z of [-0.42, 0.42]) {
    p.add(boxG(0.08, rise, 0.08, hx, 0, z), P.bridgePillar);
    p.add(boxG(0.14, 0.04, 0.12, hx, 0, z), P.metalDark);
  }
  p.add(boxG(0.1, 0.05, 0.92, hx, rise * 0.5, 0), P.bridgeBeam);
  p.add(boxG(0.3, 0.04, 0.92, up ? -0.35 : 0.35, 0, 0), P.metalDark);
  // Warnstreifen an der Auffahrt.
  for (let i = -3; i <= 3; i++) {
    p.add(boxG(0.06, 0.012, 0.1, up ? -0.47 : 0.47, 0.04, i * 0.11), i % 2 ? P.hazard : P.port);
  }
  // Pfeile auf dem Gurt in Laufrichtung.
  for (const k of [-0.25, 0.15]) {
    const a = new BoxGeometry(0.1, 0.012, 0.03);
    p.add(tilt(a.clone().rotateY(0.6).translate(k, BELT_TOP + 0.012, 0.03)), P.port);
    p.add(tilt(a.rotateY(-0.6).translate(k, BELT_TOP + 0.012, -0.03)), P.port);
  }
  const root = new Group();
  root.add(p.mesh());
  return root;
}
