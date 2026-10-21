import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "./constants";
import type { Dir } from "./dir";
import { Machine } from "./entities";
import { recipeById } from "./recipes";
import { SAVE_VERSION, decodeSave, deserialize, encodeSave, serialize } from "./save";
import { World } from "./world";

const RIGHT: Dir = 0;

function run(world: World, seconds: number) {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

/** Bohrer auf Eisen -> Schmelze -> Baender -> Hub. */
function factory(): World {
  const w = new World();
  w.place("extractor", -6, -1, RIGHT);
  w.place("smelter", -5, -1, RIGHT);
  for (let x = -4; x < 0; x++) w.place("belt", x, -1, RIGHT);
  w.place("hub", 0, -1, RIGHT);
  w.place("assembler", 3, 3, RIGHT, recipeById("gear")!);
  return w;
}

describe("save", () => {
  it("stellt Gebaeude, Rezepte und Lager wieder her", () => {
    const w = factory();
    run(w, 20);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));

    expect(copy.tick).toBe(w.tick);
    expect([...copy.delivered]).toEqual([...w.delivered]);
    expect(copy.entities.size).toBe(w.entities.size);
    const asm = copy.entityAt(3, 3) as Machine;
    expect(asm.type).toBe("assembler");
    expect(asm.recipe?.id).toBe("gear");
  });

  it("simuliert nach dem Laden genau wie das Original weiter", () => {
    const w = factory();
    run(w, 13.35);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    run(w, 30);
    run(copy, 30);
    expect(w.delivered.get("iron_plate")).toBeGreaterThan(5);
    expect([...copy.delivered]).toEqual([...w.delivered]);
    expect(serialize(copy).entities).toEqual(serialize(w).entities);
  });

  it("lehnt ungueltige und zu neue Staende ab", () => {
    expect(() => deserialize(null)).toThrow();
    expect(() => deserialize({ entities: [] })).toThrow();
    expect(() => deserialize({ version: SAVE_VERSION + 1, entities: [], delivered: [] })).toThrow(/neuer/);
  });

  it("ueberspringt kaputte Eintraege statt abzustuerzen", () => {
    const w = deserialize({
      version: 1,
      tick: 5,
      delivered: [["iron_plate", 3], ["nonsense", 9]],
      entities: [
        { type: "hub", x: 0, y: 0, dir: 0 },
        { type: "rocket", x: 1, y: 0, dir: 0 },
        { type: "extractor", x: 0, y: 5, dir: 0 }, // kein Erz
        { type: "belt", x: 2, y: 0, dir: 7 },
      ],
    });
    expect(w.entities.size).toBe(1);
    expect([...w.delivered]).toEqual([["iron_plate", 3]]);
  });

  it("kodiert als Text und zurueck", async () => {
    const w = factory();
    run(w, 10);
    const data = serialize(w);
    const code = await encodeSave(data);
    expect(code.startsWith("AUTO1:")).toBe(true);
    expect(await decodeSave(code)).toEqual(data);
    await expect(decodeSave("hallo")).rejects.toThrow();
    await expect(decodeSave("AUTO1:AAAA")).rejects.toThrow();
  });
});
