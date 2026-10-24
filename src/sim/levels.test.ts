import { describe, expect, it } from "vitest";
import type { Dir } from "./dir";
import { Belt, Ramp } from "./entities";
import { deserialize, serialize } from "./save";
import { waterAt } from "./terrain";
import { World } from "./world";

const RIGHT: Dir = 0;
const DOWN: Dir = 1;

/** Boden: Erz-Band nach rechts ueber eine Bruecke, quer darunter ein zweites Band. */
function crossing() {
  const w = new World();
  w.place("belt", 0, 0, RIGHT);
  const up = w.place("ramp", 1, 0, RIGHT) as Ramp;
  for (let x = 2; x <= 4; x++) w.place("belt", x, 0, RIGHT, null, 1);
  const down = w.place("ramp", 5, 0, RIGHT) as Ramp;
  w.place("belt", 6, 0, RIGHT);
  w.place("storage", 7, 0, RIGHT);
  // Querband unter der Bruecke.
  for (let y = -2; y <= 2; y++) w.place("belt", 3, y, DOWN);
  return { w, up, down };
}

describe("Bruecken und Rampen", () => {
  it("Hochband und Boden teilen sich ein Feld", () => {
    const { w } = crossing();
    expect(w.entityAt(3, 0)?.type).toBe("belt");
    expect(w.entityAt(3, 0, 1)?.type).toBe("belt");
    expect(w.entityAt(3, 0)).not.toBe(w.entityAt(3, 0, 1));
    expect(w.topAt(3, 0)?.layer).toBe(1);
  });

  it("Rampe hinunter erkennt ankommendes Hochband", () => {
    const { up, down } = crossing();
    expect(up.up).toBe(true);
    expect(down.up).toBe(false);
  });

  it("Items fahren ueber die Bruecke, ohne das Querband zu beruehren", () => {
    const { w } = crossing();
    const start = w.entityAt(0, 0) as Belt;
    const cross = w.entityAt(3, -2) as Belt;
    for (let i = 0; i < 300; i++) {
      if (i % 10 === 0) start.accept("iron_ore", 2, w);
      if (i % 10 === 5) cross.accept("copper_ore", 3, w);
      w.step();
    }
    const box = w.entityAt(7, 0) as { queue: string[] };
    expect(box.queue.length).toBeGreaterThan(15);
    expect(box.queue.every((i) => i === "iron_ore")).toBe(true);
    // Das Querband hat nur Kupfer gesehen.
    const below = w.entityAt(3, 2) as Belt;
    expect(below.items.every((i) => i.item === "copper_ore")).toBe(true);
  });

  it("Hochband darf ueber Wasser, Boden nicht", () => {
    const w = new World();
    w.unlockAll();
    w.storage.set("steel", 10);
    w.storage.set("iron_plate", 10);
    let spot: [number, number] | null = null;
    for (let x = 20; x < 300 && !spot; x++) if (waterAt(x, 0)) spot = [x, 0];
    expect(w.buildError("belt", spot![0], 0)).toBe("water");
    expect(w.buildError("bridge", spot![0], 0)).toBeNull();
    const b = w.build("bridge", spot![0], 0, RIGHT) as Belt;
    expect(b.layer).toBe(1);
    expect(b.level).toBe(3); // schnellste freigeschaltete Stufe
  });

  it("Abreissen erstattet die Bruecke und raeumt beide Ebenen der Rampe", () => {
    const w = new World();
    w.unlockAll();
    w.storage.set("steel", 3);
    w.storage.set("iron_plate", 2);
    w.storage.set("gear", 2);
    w.build("ramp", 0, 0, RIGHT);
    expect(w.buildError("bridge", 0, 0)).toBe("blocked");
    w.build("bridge", 1, 0, RIGHT);
    expect(w.storage.size).toBe(0);
    w.demolish(1, 0, 1);
    w.demolish(0, 0);
    expect(w.entityAt(0, 0, 1)).toBeUndefined();
    expect(w.storage.get("steel")).toBe(3);
  });

  it("uebersteht Speichern und Laden", () => {
    const { w } = crossing();
    const start = w.entityAt(0, 0) as Belt;
    for (let i = 0; i < 40; i++) {
      if (i % 10 === 0) start.accept("iron_ore", 2, w);
      w.step();
    }
    const data = serialize(w);
    const copy = deserialize(JSON.parse(JSON.stringify(data)));
    expect(serialize(copy).entities).toEqual(data.entities);
    expect((copy.entityAt(5, 0) as Ramp).up).toBe(false);
    expect(copy.entityAt(3, 0, 1)?.layer).toBe(1);
  });
});

describe("Bruecken in Blaupausen", () => {
  it("werden mitkopiert und wieder auf der Bruecke eingefuegt", async () => {
    const { capture, pasteBlueprint, demolishRect } = await import("./blueprint");
    const { w } = crossing();
    w.unlockAll();
    for (const i of ["steel", "iron_plate", "gear"] as const) w.storage.set(i, 500);
    const bp = capture(w, { x0: 0, y0: -2, x1: 7, y1: 2 })!;
    expect(bp.entries.filter((e) => e.id === "bridge").length).toBe(3);
    const r = pasteBlueprint(w, bp, 0, 4);
    expect(r.skipped).toBe(0);
    expect(w.entityAt(3, 6, 1)?.type).toBe("belt");
    expect(w.entityAt(3, 6)?.type).toBe("belt");
    demolishRect(w, { x0: 0, y0: 4, x1: 7, y1: 8 });
    expect(w.entityAt(3, 6, 1)).toBeUndefined();
  });
});
