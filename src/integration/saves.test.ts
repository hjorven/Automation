// Echte Spielstaende aus frueheren Versionen muessen nach jeder Aenderung
// weiter laden und laufen. Die Fixtures nie anpassen, nur neue dazulegen
// (jede Datei ist ein Stand mit allen Gebaeuden, alles freigeschaltet).
import { describe, expect, it } from "vitest";
import { SAVE_VERSION, deserialize, serialize } from "../sim/save";
import { buildIdOf } from "../sim/world";

const FIXTURES = import.meta.glob<string>("./fixtures/save-v*.json", { query: "?raw", import: "default", eager: true });

describe("Integration: alte Spielstaende", () => {
  it("es gibt eine Fixture fuer jede Version ab v3", () => {
    const versions = Object.keys(FIXTURES).map((p) => Number(p.match(/save-v(\d+)[^/]*\.json$/)![1]));
    for (let v = 3; v <= SAVE_VERSION; v++) expect(versions, `fixtures/save-v${v}.json fehlt`).toContain(v);
  });

  for (const [path, text] of Object.entries(FIXTURES)) {
    const name = path.replace("./fixtures/", "");

    it(`${name} laedt vollstaendig`, () => {
      const raw = JSON.parse(text);
      const w = deserialize(raw);
      expect(w.entities.size).toBe(raw.entities.length);
      expect(w.tier).toBeGreaterThanOrEqual(raw.tier);
      expect(w.storage.get("iron_plate")).toBeGreaterThanOrEqual(123);
      const types = (list: { type: string }[]) => list.map((e) => e.type).sort();
      expect(types([...w.entities.values()])).toEqual(types(raw.entities));
    });

    it(`${name}: alles Gebaute bleibt nach der Migration baubar`, () => {
      const w = deserialize(JSON.parse(text));
      // Hub und Wracks gehoeren zur Welt und sind nicht baubar.
      const world = new Set<string>(["hub", "wreck"]);
      const locked = [...w.entities.values()].map(buildIdOf).filter((id) => !world.has(id) && !w.isUnlocked(id));
      expect(locked).toEqual([]);
    });

    it(`${name} laeuft weiter und speichert in der aktuellen Version`, () => {
      const w = deserialize(JSON.parse(text));
      for (let i = 0; i < 400; i++) w.step();
      const again = serialize(w);
      expect(again.version).toBe(SAVE_VERSION);
      const copy = deserialize(JSON.parse(JSON.stringify(again)));
      expect(copy.entities.size).toBe(w.entities.size);
    });
  }
});
