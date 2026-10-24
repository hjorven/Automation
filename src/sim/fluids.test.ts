import { describe, expect, it } from "vitest";
import type { Dir } from "./dir";
import { Generator, type Extractor, type Machine } from "./entities";
import { FluidCarrier, PIPE_REACH } from "./fluids";
import { recipeById } from "./recipes";
import { deserialize, serialize } from "./save";
import { oreAt, waterAt } from "./terrain";
import { World } from "./world";

const RIGHT: Dir = 0;

/** Wasserfeld, rechts davon `dry` trockene Felder ohne Erz (Ufer). */
function shore(dry = 1): { x: number; y: number } {
  for (let x = 20; x < 400; x++) {
    for (let y = -60; y < 60; y++) {
      if (!waterAt(x, y)) continue;
      let ok = true;
      for (let k = 1; k <= dry; k++) if (waterAt(x + k, y) || oreAt(x + k, y)) ok = false;
      if (ok) return { x, y };
    }
  }
  throw new Error("kein Ufer");
}

function pipeLine(w: World, x0: number, y: number, n: number) {
  for (let i = 0; i < n; i++) w.place("pipe", x0 + i, y, RIGHT);
}

describe("Rohre und Fluessigkeiten", () => {
  it("Wasserpumpe nur auf Wasser", () => {
    const w = new World();
    w.unlockAll();
    for (const i of ["steel", "gear", "circuit"] as const) w.storage.set(i, 100);
    const s = shore();
    expect(w.buildError("water_pump", s.x, s.y)).toBe(null);
    expect(w.buildError("water_pump", s.x + 1, s.y)).toBe("dry");
    expect(w.buildError("pipe", s.x, s.y)).toBe("water");
  });

  it("Wasser fliesst durch Rohre ins Dampfkraftwerk", () => {
    const w = new World(); // Stufe 0: Strom zaehlt noch nicht
    const s = shore(6);
    const pump = w.place("water_pump", s.x, s.y, RIGHT) as Extractor;
    expect(pump).toBeTruthy();
    pipeLine(w, s.x + 1, s.y, 5);
    const g = w.place("generator_steam", s.x + 6, s.y, RIGHT) as Generator;
    for (let i = 0; i < 400; i++) w.step();
    expect(g.water).toBe(Generator.WATER_CAPACITY);
    const net = (w.entityAt(s.x + 3, s.y) as FluidCarrier).net!;
    expect(net.fluid).toBe("water");
    expect(net.amount).toBeGreaterThan(0);
  });

  it("Dampfkraftwerk braucht Kohle und Wasser", () => {
    const w = new World();
    w.unlockAll();
    const g = w.place("generator_steam", 0, 0, RIGHT) as Generator;
    g.accept("coal", 2, w);
    expect(g.burning).toBe(false);
    for (let i = 0; i < 4; i++) g.accept("water", 2, w);
    expect(g.burning).toBe(true);
    w.place("assembler", 2, 0, RIGHT, recipeById("gear")!); // Verbraucher
    w.step();
    expect(g.water).toBe(0);
    expect(g.burnLeft).toBeGreaterThan(0);
  });

  it("Oelpumpe foerdert in ein Rohr zur Raffinerie", () => {
    const w = new World();
    let oil: { x: number; y: number } | null = null;
    for (let x = 40; x < 300 && !oil; x++) {
      for (let y = -80; y < 80 && !oil; y++) {
        if (oreAt(x, y) === "crude_oil" && !w.entityAt(x + 1, y) && !waterAt(x + 1, y)) oil = { x, y };
      }
    }
    w.place("pump", oil!.x, oil!.y, RIGHT);
    pipeLine(w, oil!.x + 1, oil!.y, 3);
    // Raffinerie unter dem letzten Rohr, Ausgang zeigt weg vom Rohr.
    const r = w.place("refinery", oil!.x + 3, oil!.y + 1, 1, recipeById("fuel")!) as Machine;
    for (let i = 0; i < 400; i++) w.step();
    expect(r.output.get("fuel") ?? 0).toBeGreaterThan(0);
  });

  it("verschiedene Fluessigkeiten mischen sich nicht", () => {
    const w = new World();
    pipeLine(w, 0, 0, 3);
    w.step();
    const a = w.entityAt(0, 0) as FluidCarrier;
    expect(a.accept("water")).toBe(true);
    w.step();
    expect(a.accept("crude_oil")).toBe(false);
    expect(a.accept("iron_plate")).toBe(false);
  });

  it("lange Leitungen brauchen Rohrpumpen", () => {
    const fill = (boost: boolean) => {
      const w = new World();
      const n = PIPE_REACH * 4;
      pipeLine(w, 0, 0, n);
      if (boost) for (const x of [24, 48, 72]) {
        w.remove(x, 0);
        w.place("pipe_pump", x, 0, RIGHT);
      }
      w.step();
      const head = w.entityAt(0, 0) as FluidCarrier;
      let got = 0;
      for (let i = 0; i < 200; i++) {
        if (head.accept("water")) got++;
        w.step();
      }
      return got;
    };
    const slow = fill(false);
    const fast = fill(true);
    expect(slow).toBeLessThan(70);
    expect(fast).toBeGreaterThan(180);
  });

  it("Inhalt bleibt beim Umbau und im Spielstand erhalten", () => {
    const w = new World();
    w.unlockAll();
    pipeLine(w, 0, 5, 4);
    w.place("fluid_tank", 4, 5, RIGHT);
    w.step();
    const head = w.entityAt(0, 5) as FluidCarrier;
    for (let i = 0; i < 60; i++) {
      head.accept("water");
      w.step();
    }
    const before = head.net!.amount;
    expect(before).toBeGreaterThan(30);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    copy.step();
    const net = (copy.entityAt(2, 5) as FluidCarrier).net!;
    expect(net.fluid).toBe("water");
    expect(net.amount).toBeCloseTo(before, 5);
    // Ein Rohr in der Mitte entfernen: beide Teile behalten ihren Anteil.
    copy.remove(2, 5);
    copy.step();
    const left = (copy.entityAt(0, 5) as FluidCarrier).net!;
    const right = (copy.entityAt(4, 5) as FluidCarrier).net!;
    expect(left).not.toBe(right);
    expect(left.amount + right.amount).toBeGreaterThan(before * 0.85);
  });
});
