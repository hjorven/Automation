// Echte Spielstaende aus frueheren Versionen muessen nach jeder Aenderung
// weiter laden und laufen. Die Fixtures nie anpassen, nur neue dazulegen.
import { describe, expect, it } from "vitest";
import { SAVE_VERSION, deserialize, serialize } from "../sim/save";
import saveV3 from "./fixtures/save-v3.json?raw";

const FIXTURES: Record<string, string> = { "save-v3.json": saveV3 };
const fixture = (name: string) => JSON.parse(FIXTURES[name]);

describe("Integration: alte Spielstaende", () => {
  it("v3 mit jedem Gebaeude auf hoechster Stufe laedt vollstaendig", () => {
    const raw = fixture("save-v3.json");
    const w = deserialize(raw);
    expect(w.entities.size).toBe(raw.entities.length);
    expect(w.tier).toBeGreaterThanOrEqual(raw.tier);
    expect(w.storage.get("iron_plate")).toBeGreaterThanOrEqual(123);
    const types = (list: { type: string }[]) => list.map((e) => e.type).sort();
    expect(types([...w.entities.values()])).toEqual(types(raw.entities));
  });

  it("v3 laeuft nach dem Laden weiter und speichert in der aktuellen Version", () => {
    const w = deserialize(fixture("save-v3.json"));
    for (let i = 0; i < 400; i++) w.step();
    const again = serialize(w);
    expect(again.version).toBe(SAVE_VERSION);
    const copy = deserialize(JSON.parse(JSON.stringify(again)));
    expect(copy.entities.size).toBe(w.entities.size);
  });
});
