import { BufferGeometry, Color, ConeGeometry, DodecahedronGeometry, ExtrudeGeometry, IcosahedronGeometry, Path, Shape, TorusGeometry } from "three";
import type { ItemId } from "../../sim/items";
import { ITEM_COLORS } from "../palette";
import { Paint, boxG, coneG, cylG, paintMat, paintMetalMat } from "./kit";

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
    case "stone":
    case "bauxite": {
      // Brocken; Bauxit mit hellen Einschluessen.
      const big = new DodecahedronGeometry(0.1);
      big.rotateY(0.8);
      big.translate(0.01, 0.08, 0);
      p.add(big, c);
      const small = new DodecahedronGeometry(0.065);
      small.rotateX(0.5);
      small.translate(-0.08, 0.05, 0.06);
      p.add(small, shade(c, -0.07));
      if (item === "bauxite") {
        p.add(new IcosahedronGeometry(0.035).translate(0.07, 0.05, -0.07), 0xe0b090);
        p.add(new IcosahedronGeometry(0.025).translate(-0.04, 0.15, -0.02), 0xe0b090);
      }
      return p.build();
    }
    case "quartz": {
      // Kristallgruppe: sechseckige Saeulen mit Spitzen.
      const crystals: [number, number, number, number, number][] = [
        [0, 0, 0.05, 0.16, 0],
        [0.07, 0.04, 0.035, 0.1, -0.45],
        [-0.06, -0.04, 0.04, 0.12, 0.4],
        [-0.02, 0.07, 0.03, 0.08, 0.6],
      ];
      for (const [x, z, r, h, tilt] of crystals) {
        const g = cylG(r, r, h, 6);
        const tip = new ConeGeometry(r, r * 1.6, 6).translate(0, h + r * 0.8, 0);
        for (const [geo, col] of [
          [g, c],
          [tip, shade(c, 0.05)],
        ] as const) {
          geo.rotateZ(tilt);
          geo.rotateY(x * 20);
          geo.translate(x, 0.02, z);
          p.add(geo, col);
        }
      }
      p.add(cylG(0.09, 0.1, 0.03, 7), 0x8c877e);
      return p.build();
    }
    case "sulfur": {
      // Gelbe Klumpen.
      for (const [x, z, r] of [
        [0, 0, 0.08],
        [0.08, 0.05, 0.06],
        [-0.07, 0.06, 0.055],
        [0.02, -0.08, 0.05],
      ] as const) {
        p.add(new IcosahedronGeometry(r).translate(x, r * 0.85, z), x === 0 ? c : shade(c, -0.06));
      }
      return p.build();
    }
    case "crude_oil":
    case "fuel": {
      // Fass mit Reifen; Treibstoff orange, Rohoel schwarz mit gelbem Band.
      const band = item === "fuel" ? 0x3a4250 : 0xe2c23a;
      p.add(cylG(0.09, 0.09, 0.22, 10), item === "fuel" ? c : 0x2a2830);
      for (const y of [0.04, 0.16]) p.add(cylG(0.095, 0.095, 0.02, 10, 0, y, 0), band);
      p.add(cylG(0.08, 0.08, 0.005, 10, 0, 0.22, 0), shade(item === "fuel" ? c : 0x2a2830, 0.1));
      p.add(cylG(0.018, 0.018, 0.02, 6, 0.04, 0.22, 0.02), 0xb4bcc6);
      return p.build();
    }
    case "water": {
      // Kanister mit Tropfen-Symbol (Wasser fliesst sonst nur in Rohren).
      p.add(cylG(0.08, 0.08, 0.2, 10), c);
      p.add(cylG(0.085, 0.085, 0.02, 10, 0, 0.06, 0), shade(c, -0.2));
      p.add(cylG(0.03, 0.03, 0.04, 8, 0, 0.2, 0), 0xdfe4ea);
      p.add(coneG(0.04, 0.07, 8, 0, 0.1, 0.075), 0xdff2ff);
      return p.build();
    }
    case "concrete": {
      // Betonblock mit Fase und Abdruck.
      p.add(boxG(0.24, 0.12, 0.16), c);
      p.add(boxG(0.2, 0.02, 0.12, 0, 0.12, 0), shade(c, 0.06));
      p.add(boxG(0.06, 0.004, 0.06, -0.05, 0.14, 0), shade(c, -0.12));
      p.add(boxG(0.06, 0.004, 0.06, 0.05, 0.14, 0), shade(c, -0.12));
      return p.build();
    }
    case "reinforced_plate": {
      // Platte mit gekreuzten Streben und Nieten.
      p.add(boxG(0.26, 0.04, 0.22), shade(c, -0.08));
      const a = boxG(0.3, 0.025, 0.04, 0, 0.04, 0);
      a.rotateY(0.65);
      p.add(a, c);
      const b = boxG(0.3, 0.025, 0.04, 0, 0.04, 0);
      b.rotateY(-0.65);
      p.add(b, c);
      for (const x of [-0.11, 0.11]) for (const z of [-0.09, 0.09]) p.add(cylG(0.015, 0.015, 0.015, 6, x, 0.04, z), 0xd6dce4);
      return p.build();
    }
    case "rotor": {
      // Welle mit Blechpaket und Kupferwicklungen.
      const shaft = cylG(0.02, 0.02, 0.3, 6);
      shaft.translate(0, -0.15, 0).rotateZ(Math.PI / 2).translate(0, 0.08, 0);
      p.add(shaft, 0xb4bcc6);
      const core = cylG(0.07, 0.07, 0.16, 8);
      core.translate(0, -0.08, 0).rotateZ(Math.PI / 2).translate(0, 0.08, 0);
      p.add(core, c);
      for (const x of [-0.05, 0, 0.05]) {
        const w = cylG(0.075, 0.075, 0.025, 8);
        w.translate(0, -0.0125, 0).rotateZ(Math.PI / 2).translate(x, 0.08, 0);
        p.add(w, 0xd9824a);
      }
      return p.build();
    }
    case "silicon": {
      // Wafer mit Chip-Raster.
      p.add(cylG(0.13, 0.13, 0.02, 14), c);
      for (let i = -2; i <= 2; i++) {
        p.add(boxG(0.2, 0.003, 0.006, 0, 0.02, i * 0.035), shade(c, 0.15));
        p.add(boxG(0.006, 0.003, 0.2, i * 0.035, 0.02, 0), shade(c, 0.15));
      }
      return p.build();
    }
    case "plastic": {
      // Gestapelte Platten.
      for (let i = 0; i < 3; i++) p.add(boxG(0.22 - i * 0.01, 0.03, 0.18, i * 0.01, i * 0.032, -i * 0.006), shade(c, i * 0.06 - 0.06));
      return p.build();
    }
    case "rubber": {
      // Reifen mit Profil und Felge.
      const tire = new TorusGeometry(0.075, 0.04, 6, 12);
      tire.rotateX(Math.PI / 2);
      tire.translate(0, 0.04, 0);
      p.add(tire, c);
      p.add(cylG(0.05, 0.05, 0.05, 8, 0, 0.015, 0), 0xb4bcc6);
      return p.build();
    }
    case "aluminium": {
      // Barren, trapezfoermig.
      const bar = cylG(0.09, 0.12, 0.07, 4);
      bar.rotateY(Math.PI / 4);
      bar.scale(1.2, 1, 0.7);
      p.add(bar, c);
      p.add(boxG(0.1, 0.004, 0.03, 0, 0.07, 0), shade(c, -0.12));
      return p.build();
    }
    case "alu_casing": {
      // Hohlprofil: Rohr mit dunkler Oeffnung.
      const tube = cylG(0.08, 0.08, 0.22, 4);
      tube.rotateY(Math.PI / 4);
      tube.translate(0, -0.11, 0).rotateZ(Math.PI / 2).translate(0, 0.08, 0);
      p.add(tube, c);
      const hole = boxG(0.005, 0.09, 0.09, 0.111, 0.035, 0);
      p.add(hole, 0x2a2f36);
      return p.build();
    }
    case "heavy_frame": {
      // Gitterrahmen aus Traegern.
      const s = 0.2;
      const t = 0.03;
      for (const x of [-1, 1]) for (const z of [-1, 1]) p.add(boxG(t, s, t, (x * s) / 2, 0, (z * s) / 2), c);
      for (const y of [0, s - t]) {
        for (const z of [-1, 1]) p.add(boxG(s + t, t, t, 0, y, (z * s) / 2), shade(c, 0.08));
        for (const x of [-1, 1]) p.add(boxG(t, t, s + t, (x * s) / 2, y, 0), shade(c, 0.08));
      }
      return p.build();
    }
    case "computer": {
      // Gehaeuse mit Bildschirm und Lueftungsschlitzen.
      p.add(boxG(0.22, 0.16, 0.14), c);
      p.add(boxG(0.005, 0.1, 0.1, 0.112, 0.04, 0), 0x9fd8f0);
      for (const y of [0.03, 0.06, 0.09, 0.12]) p.add(boxG(0.1, 0.008, 0.005, -0.03, y, 0.071), shade(c, -0.15));
      p.add(cylG(0.012, 0.012, 0.01, 6, 0.08, 0.16, 0.04), 0x5fe38a);
      return p.build();
    }
    case "battery": {
      // Zelle mit Polkappe und Band.
      p.add(cylG(0.07, 0.07, 0.18, 10), c);
      p.add(cylG(0.072, 0.072, 0.05, 10, 0, 0.13, 0), 0x2a2f36);
      p.add(cylG(0.025, 0.025, 0.025, 8, 0, 0.18, 0), 0xb4bcc6);
      p.add(boxG(0.005, 0.04, 0.012, 0.07, 0.06, 0), 0x2a2f36);
      p.add(boxG(0.005, 0.012, 0.04, 0.07, 0.074, 0), 0x2a2f36);
      return p.build();
    }
    case "turbo_motor": {
      // Motor mit Turbine vorne und goldenem Gehaeuse.
      const body = cylG(0.085, 0.085, 0.18, 10);
      body.translate(0, -0.09, 0).rotateZ(Math.PI / 2).translate(-0.02, 0.09, 0);
      p.add(body, c);
      for (const x of [-0.07, 0.03]) {
        const fin = cylG(0.095, 0.095, 0.015, 10);
        fin.translate(0, -0.0075, 0).rotateZ(Math.PI / 2).translate(x, 0.09, 0);
        p.add(fin, shade(c, -0.12));
      }
      for (let i = 0; i < 5; i++) {
        const blade = boxG(0.012, 0.075, 0.03, 0, 0, 0);
        blade.rotateY(0.4).rotateX((i * Math.PI * 2) / 5);
        blade.translate(0.085, 0.09, 0);
        p.add(blade, 0xb4bcc6);
      }
      p.add(boxG(0.16, 0.02, 0.12, -0.02, 0, 0), 0x3a4250);
      return p.build();
    }
    case "supercomputer": {
      // Serverschrank mit Leuchtstreifen.
      p.add(boxG(0.16, 0.24, 0.16), shade(c, -0.15));
      p.add(boxG(0.17, 0.02, 0.17, 0, 0.24, 0), c);
      for (let i = 0; i < 4; i++) {
        p.add(boxG(0.005, 0.035, 0.12, 0.081, 0.03 + i * 0.05, 0), 0x1a1d22);
        p.add(boxG(0.006, 0.008, 0.08, 0.082, 0.045 + i * 0.05, -0.01), i % 2 ? 0x5fe3ff : c);
      }
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
    item === "iron_plate" ||
    item === "copper_plate" ||
    item === "gear" ||
    item === "wire" ||
    item === "steel" ||
    item === "reinforced_plate" ||
    item === "rotor" ||
    item === "aluminium" ||
    item === "alu_casing" ||
    item === "heavy_frame";
  return metal ? paintMetalMat : paintMat;
}
