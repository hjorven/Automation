import { BufferGeometry, Color, DodecahedronGeometry, ExtrudeGeometry, IcosahedronGeometry, Path, Shape } from "three";
import type { ItemId } from "../../sim/items";
import { ITEM_COLORS } from "../palette";
import { Paint, boxG, cylG, paintMat, paintMetalMat } from "./kit";

/** Zahnrad, flach auf dem Boden (Unterkante y = 0), optional mit Loch. */
export function gearShapeGeometry(teeth: number, rOuter: number, rInner: number, rHole: number, depth: number): BufferGeometry {
  const sh = new Shape();
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    // Trapez-Zaehne: zwei Punkte aussen, zwei innen.
    const a = (i / steps) * Math.PI * 2;
    const r = i % 4 < 2 ? rOuter : rInner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  if (rHole > 0) {
    const hole = new Path();
    hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
    sh.holes.push(hole);
  }
  const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return g;
}

const shade = (hex: number, l: number) => new Color(hex).offsetHSL(0, 0, l).getHex();

/** Geometrie je Item mit Vertex-Farben, Boden bei y = 0, etwa 0.22 Einheiten gross. */
export function itemGeometry(item: ItemId): BufferGeometry {
  const c = ITEM_COLORS[item];
  const p = new Paint();
  switch (item) {
    case "coal": {
      const big = new DodecahedronGeometry(0.1);
      big.rotateY(1.1);
      big.translate(0, 0.08, 0);
      p.add(big, c);
      const small = new DodecahedronGeometry(0.065);
      small.translate(-0.08, 0.05, 0.05);
      p.add(small, shade(c, 0.06));
      return p.build();
    }
    case "iron_ore":
    case "copper_ore": {
      // Brocken aus drei Steinen; Kupfererz mit gruenlichen Adern.
      const fleck = item === "copper_ore" ? 0x4f9a7a : 0x5d6a78;
      const big = new DodecahedronGeometry(0.1);
      big.rotateY(0.4);
      big.translate(0, 0.08, 0);
      p.add(big, c);
      const small = new DodecahedronGeometry(0.06);
      small.translate(0.08, 0.05, 0.05);
      p.add(small, shade(c, -0.08));
      const tiny = new IcosahedronGeometry(0.04);
      tiny.translate(-0.07, 0.04, -0.06);
      p.add(tiny, fleck);
      return p.build();
    }
    case "iron_plate":
    case "copper_plate": {
      // Zwei gestapelte Platten, die obere etwas heller.
      p.add(boxG(0.24, 0.035, 0.24), shade(c, -0.1));
      p.add(boxG(0.22, 0.035, 0.22, 0.01, 0.035, -0.01), c);
      p.add(boxG(0.16, 0.004, 0.02, 0.01, 0.07, -0.06), shade(c, 0.08));
      return p.build();
    }
    case "gear": {
      p.add(gearShapeGeometry(8, 0.13, 0.1, 0.035, 0.05), c);
      p.add(cylG(0.05, 0.05, 0.065, 8, 0, 0, 0), shade(c, -0.15));
      return p.build();
    }
    case "wire": {
      // Kabelrolle: dunkle Flansche, Kupferwicklung.
      p.add(cylG(0.11, 0.11, 0.025, 10), 0x3a4250);
      p.add(cylG(0.085, 0.085, 0.09, 10, 0, 0.025, 0), c);
      p.add(cylG(0.087, 0.087, 0.012, 10, 0, 0.06, 0), shade(c, 0.1));
      p.add(cylG(0.11, 0.11, 0.025, 10, 0, 0.115, 0), 0x3a4250);
      p.add(cylG(0.03, 0.03, 0.15, 6, 0, 0, 0), 0xb4bcc6);
      return p.build();
    }
    case "circuit": {
      // Platine mit Chip, Bauteilen und Leiterbahnen.
      p.add(boxG(0.26, 0.03, 0.2), c);
      p.add(boxG(0.09, 0.025, 0.09, -0.03, 0.03, 0), 0x22252b);
      for (const z of [-0.06, -0.03, 0, 0.03, 0.06]) p.add(boxG(0.012, 0.004, 0.012, 0.03, 0.03, z), 0xe8c060);
      p.add(cylG(0.02, 0.02, 0.04, 6, 0.08, 0.03, -0.06), 0x3f6fa8);
      p.add(boxG(0.03, 0.02, 0.02, 0.08, 0.03, 0.06), 0xc2512f);
      p.add(boxG(0.22, 0.003, 0.012, 0, 0.03, -0.085), 0xe8c060);
      p.add(boxG(0.22, 0.003, 0.012, 0, 0.03, 0.085), 0xe8c060);
      return p.build();
    }
    case "steel": {
      // Stahltraeger (I-Profil).
      p.add(boxG(0.28, 0.025, 0.12), shade(c, -0.08));
      p.add(boxG(0.28, 0.08, 0.03, 0, 0.025, 0), c);
      p.add(boxG(0.28, 0.025, 0.12, 0, 0.105, 0), shade(c, 0.06));
      return p.build();
    }
    case "motor": {
      // Gehaeuse liegend mit Kuehlrippen und Welle.
      const body = cylG(0.085, 0.085, 0.2, 10);
      body.rotateZ(Math.PI / 2);
      body.translate(0, 0.09, 0);
      p.add(body, c);
      for (const x of [-0.06, 0, 0.06]) {
        const fin = cylG(0.095, 0.095, 0.015, 10);
        fin.rotateZ(Math.PI / 2);
        fin.translate(x, 0.09, 0);
        p.add(fin, shade(c, 0.1));
      }
      const shaft = cylG(0.02, 0.02, 0.08, 6);
      shaft.rotateZ(Math.PI / 2);
      shaft.translate(0.14, 0.09, 0);
      p.add(shaft, 0xb4bcc6);
      p.add(boxG(0.16, 0.02, 0.12), 0x3a4250);
      return p.build();
    }
    case "control_unit": {
      // Gehaeuse mit Display und Knoepfen.
      p.add(boxG(0.22, 0.12, 0.18), c);
      p.add(boxG(0.14, 0.004, 0.08, -0.02, 0.12, 0), 0x9fd8f0);
      p.add(cylG(0.015, 0.015, 0.02, 6, 0.08, 0.12, -0.05), 0xc2512f);
      p.add(cylG(0.015, 0.015, 0.02, 6, 0.08, 0.12, 0.05), 0x3fae5a);
      return p.build();
    }
    default: {
      // Vorlaeufig fuer Items ohne eigenes Modell: Kiste in Itemfarbe.
      p.add(boxG(0.2, 0.14, 0.2), c);
      p.add(boxG(0.22, 0.02, 0.22, 0, 0.14, 0), shade(c, 0.1));
      return p.build();
    }
  }
}

export function itemMaterial(item: ItemId) {
  const metal =
    item === "iron_plate" || item === "copper_plate" || item === "gear" || item === "wire" || item === "steel";
  return metal ? paintMetalMat : paintMat;
}
