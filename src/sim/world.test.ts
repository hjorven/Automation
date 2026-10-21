import { describe, expect, it } from "vitest";
import { ITEM_SPACING, TICKS_PER_SECOND } from "./constants";
import type { Dir } from "./dir";
import { Belt, Machine } from "./entities";
import { recipeById } from "./recipes";
import { oreAt } from "./terrain";
import { World } from "./world";

const RIGHT: Dir = 0;
const DOWN: Dir = 1;

function run(world: World, seconds: number) {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

/** Belt-Strecke von (x0, y) bis (x1 - 1, y) nach rechts. */
function beltRow(world: World, x0: number, x1: number, y: number) {
  for (let x = x0; x < x1; x++) world.place("belt", x, y, RIGHT);
}

describe("terrain", () => {
  it("hat Start-Vorkommen fuer Eisen und Kupfer", () => {
    expect(oreAt(-6, -1)).toBe("iron_ore");
    expect(oreAt(6, 2)).toBe("copper_ore");
    expect(oreAt(0, 0)).toBeNull();
  });
});

describe("World", () => {
  it("laesst Bohrer nur auf Erz zu", () => {
    const w = new World();
    expect(w.place("extractor", 0, 5, RIGHT)).toBeNull();
    expect(w.place("extractor", -6, -1, RIGHT)).not.toBeNull();
  });

  it("verhindert doppelte Belegung", () => {
    const w = new World();
    expect(w.place("belt", 1, 1, RIGHT)).not.toBeNull();
    expect(w.place("belt", 1, 1, DOWN)).toBeNull();
  });

  it("transportiert Erz vom Bohrer ueber Baender zum Hub", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    beltRow(w, -5, 0, -1);
    w.place("hub", 0, -1, RIGHT);
    run(w, 20);
    // 0,5 Erz/s, abzueglich Anlaufzeit ueber 5 Baender.
    expect(w.delivered.get("iron_ore")).toBeGreaterThanOrEqual(8);
  });

  it("schmilzt Erz zu Platten", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    w.place("belt", -5, -1, RIGHT);
    w.place("smelter", -4, -1, RIGHT);
    beltRow(w, -3, 0, -1);
    w.place("hub", 0, -1, RIGHT);
    run(w, 30);
    expect(w.delivered.get("iron_plate")).toBeGreaterThan(5);
    expect(w.delivered.has("iron_ore")).toBe(false);
  });

  it("baut Zahnraeder im Montierer", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    w.place("smelter", -5, -1, RIGHT);
    w.place("assembler", -4, -1, RIGHT, recipeById("gear")!);
    beltRow(w, -3, 0, -1);
    w.place("hub", 0, -1, RIGHT);
    run(w, 30);
    expect(w.delivered.get("gear")).toBeGreaterThan(3);
  });

  it("nimmt bei falschem Rezept nichts an und staut das Band", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    w.place("belt", -5, -1, RIGHT);
    const m = w.place("assembler", -4, -1, RIGHT, recipeById("wire")!) as Machine;
    run(w, 10);
    expect(m.input.size).toBe(0);
    expect((w.entityAt(-5, -1) as Belt).items.length).toBeGreaterThan(0);
  });

  it("haelt den Mindestabstand auf gestauten Baendern ein", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    beltRow(w, -5, -2, -1); // endet im Nichts -> Stau
    run(w, 60);
    for (const e of w.entities.values()) {
      if (!(e instanceof Belt)) continue;
      for (let i = 1; i < e.items.length; i++) {
        expect(e.items[i - 1].progress - e.items[i].progress).toBeGreaterThanOrEqual(ITEM_SPACING - 1e-9);
      }
    }
  });

  it("fuehrt Baender um die Kurve", () => {
    const w = new World();
    w.place("extractor", -6, -1, RIGHT);
    w.place("belt", -5, -1, DOWN); // Eingang von links, Ausgang nach unten
    w.place("belt", -5, 0, DOWN);
    w.place("hub", -5, 1, RIGHT);
    run(w, 10);
    expect(w.beltInputSide(w.entityAt(-5, -1) as Belt)).toBe(2);
    expect(w.delivered.get("iron_ore")).toBeGreaterThan(2);
  });
});
