import { describe, expect, it } from "vitest";
import {
  blueprintCost,
  capture,
  demolishRect,
  parseBlueprint,
  pasteBlueprint,
  planPaste,
  rotateBlueprint,
  type Blueprint,
} from "./blueprint";
import { Belt, Machine, Sorter, Tunnel } from "./entities";
import { recipeById } from "./recipes";
import { World } from "./world";

/** Welt mit allem freigeschaltet und vollem Lager. */
function rich(): World {
  const w = World.createDefault();
  w.unlockAll();
  w.fog = false;
  for (const i of ["iron_plate", "copper_plate", "gear", "circuit", "steel", "rubber"] as const) w.storage.set(i, 100000);
  return w;
}

/** Kleiner Fabrikteil fern von Erz: Band -> Montierer -> Sortierer, plus Tunnelpaar. */
function sample(w: World, ox = 40, oy = 40) {
  w.build("belt", ox, oy, 0);
  w.build("belt_mk2", ox + 1, oy, 0);
  w.build("assembler", ox + 2, oy, 0, recipeById("gear")!);
  const s = w.build("sorter", ox + 3, oy, 0) as Sorter;
  s.filter = "gear";
  w.build("tunnel", ox, oy + 2, 0);
  w.build("tunnel", ox + 3, oy + 2, 0);
}

describe("Blaupausen", () => {
  it("kopieren Gebaeude mit Richtung, Rezept, Filter, Bandstufe und Tunnelrolle", () => {
    const w = rich();
    sample(w);
    const bp = capture(w, { x0: 45, y0: 45, x1: 38, y1: 38 })!;
    expect(bp.w).toBe(4);
    expect(bp.h).toBe(3);
    expect(bp.entries).toHaveLength(6);
    expect(bp.entries.find((e) => e.id === "belt_mk2")).toMatchObject({ dx: 1, dy: 0 });
    expect(bp.entries.find((e) => e.id === "assembler")?.recipe).toBe("gear");
    expect(bp.entries.find((e) => e.id === "sorter")?.filter).toBe("gear");
    expect(bp.entries.filter((e) => e.id === "tunnel").map((e) => e.exit)).toEqual([false, true]);
  });

  it("lassen den Hub aus, leere Bereiche ergeben nichts", () => {
    const w = rich();
    expect(capture(w, { x0: -2, y0: -2, x1: 2, y1: 2 })).toBeNull();
  });

  it("fuegen eine identische Kopie ein und bezahlen sie", () => {
    const w = rich();
    sample(w);
    const bp = capture(w, { x0: 40, y0: 40, x1: 43, y1: 42 })!;
    const before = w.storage.get("gear")!;
    const r = pasteBlueprint(w, bp, 60, 40);
    expect(r).toEqual({ built: 6, skipped: 0 });
    const gearCost = blueprintCost(bp).find((c) => c.item === "gear")!.count;
    expect(w.storage.get("gear")).toBe(before - gearCost);
    expect((w.entityAt(61, 40) as Belt).level).toBe(2);
    expect((w.entityAt(62, 40) as Machine).recipe?.id).toBe("gear");
    expect((w.entityAt(63, 40) as Sorter).filter).toBe("gear");
    expect((w.entityAt(60, 42) as Tunnel).exit).toBe(false);
    expect((w.entityAt(63, 42) as Tunnel).exit).toBe(true);
  });

  it("drehen Positionen und Richtungen im Uhrzeigersinn", () => {
    const bp: Blueprint = { name: "t", w: 3, h: 1, entries: [{ id: "belt", dx: 0, dy: 0, dir: 0 }, { id: "belt", dx: 2, dy: 0, dir: 0 }] };
    const r = rotateBlueprint(bp);
    expect(r.w).toBe(1);
    expect(r.h).toBe(3);
    expect(r.entries).toEqual([
      { id: "belt", dx: 0, dy: 0, dir: 1 },
      { id: "belt", dx: 0, dy: 2, dir: 1 },
    ]);
    const full = rotateBlueprint(rotateBlueprint(rotateBlueprint(r)));
    expect(full.entries).toEqual(bp.entries);
  });

  it("melden belegte Felder und fehlendes Material je Gebaeude", () => {
    const w = rich();
    sample(w);
    const bp = capture(w, { x0: 40, y0: 40, x1: 43, y1: 42 })!;
    // Auf dem Original: alles steht schon so da.
    expect(planPaste(w, bp, 40, 40).every((s) => s === "same")).toBe(true);
    // Eins daneben: teils belegt.
    expect(planPaste(w, bp, 41, 40)).toContain("blocked");
    // Leeres Lager: kostet zu viel.
    w.storage.clear();
    const plan = planPaste(w, bp, 80, 40);
    expect(plan.filter((s) => s === "cost").length).toBeGreaterThan(0);
    // Erste Baender sind gratis, die gehen trotzdem.
    expect(plan[0]).toBe("ok");
  });

  it("bauen bei knappem Lager, so viel geht, und lassen den Rest aus", () => {
    const w = rich();
    sample(w);
    const bp = capture(w, { x0: 40, y0: 40, x1: 43, y1: 42 })!;
    w.storage.clear();
    const r = pasteBlueprint(w, bp, 80, 40);
    expect(r.built).toBeGreaterThan(0);
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.built + r.skipped).toBe(bp.entries.length);
  });

  it("reissen einen Bereich ab und erstatten die Kosten", () => {
    const w = rich();
    const gears = w.storage.get("gear")!;
    sample(w);
    expect(demolishRect(w, { x0: 39, y0: 39, x1: 44, y1: 43 })).toBe(6);
    expect(w.storage.get("gear")).toBe(gears);
    expect(w.entityAt(0, 0)?.type).toBe("hub");
  });

  it("pruefen Daten aus Speicher oder Code", () => {
    const w = rich();
    sample(w);
    const bp = capture(w, { x0: 40, y0: 40, x1: 43, y1: 42 }, "Zahnrad")!;
    const back = parseBlueprint(JSON.parse(JSON.stringify(bp)));
    expect(back).toEqual(bp);
    expect(() => parseBlueprint(null)).toThrow();
    expect(() => parseBlueprint({ w: 1, h: 1, entries: [{ id: "quatsch", dx: 0, dy: 0, dir: 0 }] })).toThrow();
    const odd = parseBlueprint({ w: 2, h: 1, entries: [{ id: "belt", dx: 0, dy: 0, dir: 0 }, { id: "belt", dx: 5, dy: 0, dir: 0 }] });
    expect(odd.entries).toHaveLength(1);
    expect(odd.name).toBe("Blaupause");
  });
});
