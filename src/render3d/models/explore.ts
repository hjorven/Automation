import { BoxGeometry, Group, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from "three";
import { PALETTE as P } from "../palette";
import { basePlate, bolts } from "./buildings";
import { Paint, boxG, coneG, cylG, mesh, paintMetalMat } from "./kit";

// Modelle zum Erkunden. Gleicher Vertrag wie in buildings.ts: Group,
// zentriert, Boden y = 0, vorne = +x. Animiert: "dish" (dreht sich), "beacon" (blinkt).

/** Strebe als Quader von a nach b (Querschnitt t). */
function strut(a: [number, number, number], b: [number, number, number], t: number): BufferGeometry {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new BoxGeometry(t, d.length(), t).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  return g.translate(a[0], a[1], a[2]);
}

const RADAR_TOP = 0.92;

/** Radarturm: Gittermast mit drehender Schuessel und Warnlicht. */
export function radarModel(): Group {
  const p = new Paint();
  basePlate(p, 0.9, 0.08, P.metalDark);
  bolts(p, [-0.36, 0.36], [-0.36, 0.36], 0.08);
  // Gittermast: vier schraege Beine, Querstreben.
  const foot = 0.3;
  const head = 0.1;
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of legs) {
    p.add(strut([sx * foot, 0.08, sz * foot], [sx * head, RADAR_TOP - 0.06, sz * head], 0.045), P.metal);
    p.add(boxG(0.1, 0.04, 0.1, sx * foot, 0.08, sz * foot), P.metalDark);
  }
  for (let i = 0; i < 3; i++) {
    const y0 = 0.08 + i * 0.27;
    const y1 = y0 + 0.27;
    const w0 = foot + (head - foot) * ((y0 - 0.08) / (RADAR_TOP - 0.14));
    const w1 = foot + (head - foot) * ((y1 - 0.08) / (RADAR_TOP - 0.14));
    for (let k = 0; k < 4; k++) {
      const [ax, az] = legs[k];
      const [bx, bz] = legs[(k + 1) % 4];
      p.add(strut([ax * w0, y0, az * w0], [bx * w1, y1, bz * w1], 0.02), P.metalLight);
    }
  }
  // Technikkasten am Fuss und Plattform oben.
  p.add(boxG(0.22, 0.2, 0.16, 0.22, 0.08, 0.26), P.storage);
  p.add(boxG(0.16, 0.08, 0.01, 0.22, 0.16, 0.345), 0x1a2228);
  p.add(cylG(0.17, 0.17, 0.05, 8, 0, RADAR_TOP - 0.06, 0), P.metalDark);
  p.add(cylG(0.05, 0.06, 0.08, 8, 0, RADAR_TOP - 0.01, 0), P.metal);
  const root = new Group();
  root.add(p.mesh());

  // Schuessel: gewoelbte Halbkugel mit Empfaenger, kippt leicht nach oben.
  const dish = new Group();
  dish.name = "dish";
  dish.position.set(0, RADAR_TOP + 0.07, 0);
  const d = new Paint();
  const bowl = new SphereGeometry(0.26, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.6);
  bowl.scale(1, 0.45, 1).rotateZ(Math.PI / 2 + 0.35).translate(-0.04, 0.12, 0);
  d.add(bowl, P.metalLight);
  d.add(strut([0, 0.02, 0], [0.16, 0.2, 0], 0.025), P.metal);
  d.add(coneG(0.035, 0.07, 6, 0.16, 0.19, 0), P.bolt);
  d.add(boxG(0.12, 0.06, 0.1, -0.02, -0.02, 0), P.metalDark);
  const dm = d.mesh(paintMetalMat);
  dish.add(dm);
  root.add(dish);

  const beaconMat = new MeshStandardMaterial({ color: 0x401010, emissive: 0xff3b2f, emissiveIntensity: 1, flatShading: true });
  const beacon = mesh(new SphereGeometry(0.035, 6, 4), beaconMat, 0, RADAR_TOP + 0.36, 0);
  beacon.name = "beacon";
  beacon.castShadow = false;
  root.add(beacon);
  return root;
}

/** Wrack: abgestuerzte Frachtkapsel, halb im Boden, mit Truemmern und Notsignal. */
export function wreckModel(): Group {
  const p = new Paint();
  // Aufschlagkrater: dunkler, flacher Ring.
  p.add(cylG(0.46, 0.5, 0.02, 9, 0, 0, 0), 0x4a4038);
  p.add(cylG(0.36, 0.4, 0.025, 9, 0.05, 0, 0.02), 0x2f2a26);
  const hull = new Group();
  // Rumpf: liegender Zylinder mit Spitze, schraeg im Boden.
  const h = new Paint();
  h.add(cylG(0.17, 0.2, 0.52, 8, 0, -0.26, 0).rotateZ(Math.PI / 2), 0xc8ccd2);
  h.add(coneG(0.17, 0.2, 8, 0, 0.26, 0).rotateZ(-Math.PI / 2), 0xe0e4e8);
  h.add(cylG(0.205, 0.205, 0.05, 8, 0, -0.1, 0).rotateZ(Math.PI / 2), 0xd9822b);
  h.add(cylG(0.205, 0.205, 0.05, 8, 0, 0.12, 0).rotateZ(Math.PI / 2), 0xd9822b);
  // Aufgerissene Luke und Finne.
  h.add(boxG(0.16, 0.02, 0.14, -0.05, 0.19, 0.02), 0x2a2e34);
  h.add(boxG(0.04, 0.18, 0.12, -0.24, 0.12, 0), 0x8a9098);
  const hm = h.mesh(paintMetalMat);
  hull.add(hm);
  hull.rotation.set(0.25, 0.4, -0.35);
  hull.position.set(0, 0.12, 0);
  // Truemmer und eine aufgeplatzte Kiste.
  p.add(boxG(0.16, 0.12, 0.16, 0.28, 0.0, 0.22), P.storage);
  p.add(boxG(0.17, 0.02, 0.17, 0.28, 0.12, 0.22).rotateZ(0.5), P.storageDark);
  p.add(boxG(0.1, 0.02, 0.06, -0.3, 0.02, 0.25).rotateY(0.7), 0x8a9098);
  p.add(boxG(0.08, 0.02, 0.12, -0.22, 0.02, -0.3).rotateY(-0.4), 0x8a9098);
  p.add(boxG(0.05, 0.03, 0.05, 0.34, 0.0, -0.2), 0xd9822b);
  const root = new Group();
  root.add(p.mesh(), hull);

  const beaconMat = new MeshStandardMaterial({ color: 0x103040, emissive: 0x4fe0ff, emissiveIntensity: 1, flatShading: true });
  const pole = new Paint();
  pole.add(cylG(0.012, 0.012, 0.32, 4, -0.18, 0.0, -0.14), 0x8a9098);
  root.add(pole.mesh());
  const beacon = mesh(new SphereGeometry(0.035, 6, 4), beaconMat, -0.18, 0.35, -0.14);
  beacon.name = "beacon";
  beacon.castShadow = false;
  root.add(beacon);
  return root;
}
