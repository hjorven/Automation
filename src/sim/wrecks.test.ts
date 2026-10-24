import { describe, expect, it } from "vitest";
import { ALT_RECIPES } from "./recipes";
import { deserialize, serialize } from "./save";
import { BIOME_GEN } from "./terrain";
import { World } from "./world";
import { WRECK_REGION, wreckLoot, wreckSite } from "./wrecks";

/** Alle Wrack-Plaetze im Umkreis `r` um den Ursprung. */
function sites(r: number) {
  const out: { x: number; y: number }[] = [];
  const n = Math.ceil(r / WRECK_REGION);
  for (let ry = -n; ry <= n; ry++) {
    for (let rx = -n; rx <= n; rx++) {
      const s = wreckSite(rx, ry, BIOME_GEN);
      if (s && Math.hypot(s.x, s.y) <= r) out.push(s);
    }
  }
  return out;
}

describe("Wracks", () => {
  it("liegen verteilt, nicht am Start und nie auf Erz oder Hindernissen", () => {
    const list = sites(150);
    expect(list.length).toBeGreaterThan(20);
    for (const s of list) {
      expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(22);
      expect(BIOME_GEN.oreAt(s.x, s.y)).toBeNull();
      expect(BIOME_GEN.obstacleAt(s.x, s.y)).toBeNull();
    }
  });

  it("tauchen erst auf, wenn sich der Nebel lichtet", () => {
    const w = World.createDefault();
    const far = sites(150).find((s) => !w.isExplored(s.x, s.y))!;
    expect(w.entityAt(far.x, far.y)).toBeUndefined();
    w.reveal(far.x, far.y, 3);
    expect(w.entityAt(far.x, far.y)?.type).toBe("wreck");
  });

  it("weiter draussen liegt wertvollere Beute", () => {
    const near = wreckLoot(25, 5, () => false);
    const far = wreckLoot(140, 30, () => false);
    expect(near.items.length).toBeGreaterThanOrEqual(2);
    expect(near.items.every((s) => ["iron_plate", "copper_plate", "gear", "wire", "circuit"].includes(s.item))).toBe(true);
    expect(far.items.some((s) => ["iron_plate", "copper_plate"].includes(s.item))).toBe(false);
  });

  it("Bergen fuellt das Lager, schaltet Rezepte frei und entfernt das Wrack", () => {
    const w = World.createDefault();
    // Ein Wrack mit Rezept suchen.
    const s = sites(200).find((p) => wreckLoot(p.x, p.y, () => false).recipe)!;
    expect(s).toBeDefined();
    w.reveal(s.x, s.y, 2);
    const e = w.entityAt(s.x, s.y)!;
    const loot = w.wreckLoot(e)!;
    const loot2 = w.salvage(e)!;
    expect(loot2).toEqual(loot);
    for (const it of loot.items) expect(w.storage.get(it.item)).toBeGreaterThanOrEqual(it.count);
    expect(w.extraRecipes.has(loot.recipe!)).toBe(true);
    expect(w.entityAt(s.x, s.y)).toBeUndefined();
    expect(w.salvaged).toBe(1);
    // Kommt nach dem Laden nicht wieder.
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(copy.entityAt(s.x, s.y)).toBeUndefined();
    expect(copy.salvaged).toBe(1);
  });

  it("bietet nur Rezepte an, die noch fehlen", () => {
    const all = ALT_RECIPES.map((r) => r.id);
    for (const s of sites(120)) expect(wreckLoot(s.x, s.y, (id) => all.includes(id)).recipe).toBeNull();
  });

  it("Abreissen birgt das Wrack statt es zu erstatten", () => {
    const w = World.createDefault();
    const s = sites(150).find((p) => !w.isExplored(p.x, p.y))!;
    w.reveal(s.x, s.y, 2);
    const before = w.salvaged;
    w.demolish(s.x, s.y);
    expect(w.salvaged).toBe(before + 1);
  });

  it("alte Spielstaende verlieren kein Gebaeude an ein Wrack", () => {
    const s = sites(150)[0];
    const w = deserialize({
      version: 3,
      tick: 0,
      tier: 0,
      storage: [],
      entities: [
        { type: "hub", x: 0, y: 0, dir: 0 },
        { type: "belt", x: s.x - 1, y: s.y, dir: 0 },
        { type: "belt", x: s.x, y: s.y, dir: 0 },
      ],
    });
    expect(w.entityAt(s.x, s.y)?.type).toBe("belt");
    expect(w.entities.size).toBe(3);
  });
});
