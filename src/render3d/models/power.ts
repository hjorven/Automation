import { BoxGeometry, Group, MeshStandardMaterial } from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts } from "./buildings";
import { Paint, boxG, cylG, mesh } from "./kit";

// Strom-Puzzle: Solarfeld und Batteriespeicher. Gleicher Vertrag wie in
// buildings.ts: Group, zentriert, Boden y = 0, Ausgang nach +x.
// Animierte Teile: "panel" (Solarflaeche, kippt mit der Sonne),
// "fill" (Ladebalken, skaliert in y), "glow" (Ladeanzeige leuchtet).

const CELL = 0x1f3a66;
const CELL_LINE = 0x8fb3e0;
const BATTERY = 0x2f6f55;

/** Solarfeld: Mast mit kippbarer Paneelflaeche. */
export function solarModel(): Group {
  const p = new Paint();
  basePlate(p, 0.9, 0.06, P.metalDark);
  bolts(p, [-0.36, 0.36], [-0.36, 0.36], 0.06);
  p.add(cylG(0.05, 0.07, 0.34, 8, 0, 0.06, 0), P.metal);
  p.add(boxG(0.16, 0.06, 0.12, 0, 0.38, 0), P.metalDark);
  const root = new Group();
  root.add(p.mesh());

  // Paneel liegt um die z-Achse drehbar auf dem Mast (Sonne zieht von +x nach -x).
  const panel = new Paint();
  panel.add(boxG(0.86, 0.03, 0.8, 0, -0.015, 0), P.metalLight);
  panel.add(boxG(0.8, 0.012, 0.74, 0, 0.015, 0), CELL);
  for (let i = -2; i <= 2; i++) panel.add(boxG(0.006, 0.004, 0.74, i * 0.16, 0.027, 0), CELL_LINE);
  for (let j = -1; j <= 1; j++) panel.add(boxG(0.8, 0.004, 0.006, 0, 0.027, j * 0.24), CELL_LINE);
  const pm = panel.mesh();
  pm.name = "panel";
  pm.position.set(0, 0.46, 0);
  root.add(pm);
  return root;
}

/** Batteriespeicher: drei Zellen mit Ladebalken und Anzeige. */
export function accumulatorModel(): Group {
  const p = new Paint();
  basePlate(p, 0.9, 0.08, P.metalDark);
  for (const z of [-0.24, 0, 0.24]) {
    p.add(boxG(0.52, 0.5, 0.2, -0.06, 0.08, z), BATTERY);
    p.add(boxG(0.54, 0.04, 0.22, -0.06, 0.58, z), P.metalLight);
    p.add(cylG(0.03, 0.03, 0.05, 6, -0.22, 0.62, z), P.port);
    p.add(cylG(0.03, 0.03, 0.05, 6, 0.1, 0.62, z), P.metal);
  }
  // Sammelschiene und Anschlusskasten vorne.
  p.add(boxG(0.04, 0.03, 0.56, -0.22, 0.66, 0), P.copper);
  p.add(boxG(0.14, 0.3, 0.5, 0.3, 0.08, 0), P.generator);
  // Rahmen der Ladeanzeige.
  p.add(boxG(0.012, 0.24, 0.12, 0.375, 0.12, 0), P.metalDark);
  const root = new Group();
  root.add(p.mesh());

  const fillMat = new MeshStandardMaterial({ color: 0x1c3f2e, emissive: 0x6dffa8, emissiveIntensity: 0.9, flatShading: true });
  const fill = mesh(new BoxGeometry(0.01, 0.2, 0.08).translate(0, 0.1, 0), fillMat, 0.384, 0.14, 0);
  fill.name = "fill";
  fill.castShadow = false;
  root.add(fill);

  const glowMat = new MeshStandardMaterial({ color: 0x102018, emissive: 0x6dffa8, emissiveIntensity: 0.4, flatShading: true });
  const lamp = mesh(new BoxGeometry(0.05, 0.02, 0.05), glowMat, 0.3, 0.39, 0.16);
  lamp.name = "glow";
  lamp.castShadow = false;
  root.add(lamp);
  return root;
}
