import { describe, expect, it } from "vitest";
import { Extractor, Machine } from "./entities";
import { MAX_TIER } from "./progression";
import { recipeById } from "./recipes";
import { deserialize, serialize } from "./save";
import { oreAt } from "./terrain";
import { UPGRADES, upgradeById, upgradeCost } from "./upgrades";
import { factoryScore, itemValue, rankFor } from "./value";
import { World } from "./world";

function richWorld(): World {
  const w = World.createDefault();
  w.tier = MAX_TIER;
  for (const u of UPGRADES) for (const c of upgradeCost(u, 10)) w.storage.set(c.item, (w.storage.get(c.item) ?? 0) + c.count * 10);
  return w;
}

function ironTile(): { x: number; y: number } {
  for (let x = -10; x < 0; x++) for (let y = -4; y < 4; y++) if (oreAt(x, y) === "iron_ore") return { x, y };
  throw new Error("kein Eisen");
}

describe("Endlos-Upgrades", () => {
  it("sind erst nach der letzten Stufe kaufbar", () => {
    const w = richWorld();
    w.tier = MAX_TIER - 1;
    expect(w.buyUpgrade("mining")).toBe(false);
    w.tier = MAX_TIER;
    expect(w.buyUpgrade("mining")).toBe(true);
    expect(w.upgradeLevel("mining")).toBe(1);
  });

  it("werden mit jeder Stufe teurer", () => {
    for (const u of UPGRADES) {
      for (let l = 0; l < 20; l++) {
        const a = upgradeCost(u, l);
        const b = upgradeCost(u, l + 1);
        a.forEach((c, k) => expect(b[k].count).toBeGreaterThan(c.count));
      }
    }
  });

  it("ziehen die Kosten vom Lager ab", () => {
    const w = richWorld();
    const cost = upgradeCost(upgradeById("crafting")!, 0);
    const before = cost.map((c) => w.storage.get(c.item)!);
    w.buyUpgrade("crafting");
    cost.forEach((c, k) => expect(w.storage.get(c.item)).toBe(before[k] - c.count));
  });

  it("scheitern ohne genug im Lager", () => {
    const w = World.createDefault();
    w.tier = MAX_TIER;
    expect(w.buyUpgrade("power")).toBe(false);
    expect(w.upgradeLevel("power")).toBe(0);
  });

  it("Bohrtechnik laesst Bohrer schneller foerdern", () => {
    const count = (level: number) => {
      const w = World.createDefault();
      if (level) w.setUpgradeLevel("mining", level);
      const t = ironTile();
      const e = w.place("extractor", t.x, t.y, 0) as Extractor;
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        e.update(w);
        if (e.buffer) {
          e.buffer = null;
          n++;
        }
      }
      return n;
    };
    expect(count(5)).toBeGreaterThanOrEqual(Math.floor(count(0) * 1.5));
  });

  it("Fertigungstakt beschleunigt Maschinen", () => {
    const w = World.createDefault();
    w.setUpgradeLevel("crafting", 10);
    const m = w.place("assembler", 30, 30, 0, recipeById("gear")!) as Machine;
    m.input.set("iron_plate", 2);
    m.update(w);
    const ticks = recipeById("gear")!.ticks;
    for (let i = 1; i < ticks / 2; i++) m.update(w);
    expect(m.output.get("gear")).toBe(1);
  });

  it("Netzausbau erhoeht die Stromversorgung", () => {
    const w = World.createDefault();
    w.step();
    const base = w.power.supply;
    w.setUpgradeLevel("power", 2);
    w.step();
    expect(w.power.supply).toBeCloseTo(base * 1.3);
  });

  it("bleiben im Spielstand erhalten, alte Staende starten bei 0", () => {
    const w = richWorld();
    w.buyUpgrade("mining");
    w.buyUpgrade("mining");
    w.buyUpgrade("power");
    w.bestScore = 1234;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(back.upgradeLevel("mining")).toBe(2);
    expect(back.upgradeLevel("power")).toBe(1);
    expect(back.miningSpeed).toBeCloseTo(1.2);
    expect(back.bestScore).toBe(1234);

    const old = serialize(w) as Partial<ReturnType<typeof serialize>>;
    delete old.upgrades;
    delete old.bestScore;
    const fresh = deserialize(old);
    expect(fresh.upgradeLevel("mining")).toBe(0);
    expect(fresh.miningSpeed).toBe(1);
    expect(fresh.bestScore).toBe(0);
  });

  it("ignorieren unbekannte Upgrades im Spielstand", () => {
    const data = { ...serialize(World.createDefault()), upgrades: [["quatsch", 3], ["mining", -2]] };
    const w = deserialize(data);
    expect(w.upgrades.size).toBe(0);
  });
});

describe("Fabrikwert", () => {
  it("Rohstoffe zaehlen 1, Produkte die Rohstoffe darin", () => {
    expect(itemValue("iron_ore")).toBe(1);
    expect(itemValue("iron_plate")).toBe(1);
    expect(itemValue("gear")).toBeGreaterThanOrEqual(itemValue("iron_plate"));
    expect(itemValue("computer")).toBeGreaterThan(itemValue("circuit"));
    expect(itemValue("supercomputer")).toBeGreaterThan(itemValue("computer"));
    expect(Number.isFinite(itemValue("supercomputer"))).toBe(true);
  });

  it("gewichtet Raten mit dem Wert", () => {
    expect(factoryScore([["iron_plate", 10]])).toBe(10);
    expect(factoryScore([["gear", 10]])).toBe(10 * itemValue("gear"));
  });

  it("Raenge steigen mit dem Wert", () => {
    expect(rankFor(0).index).toBe(0);
    expect(rankFor(1e9).next).toBeUndefined();
    expect(rankFor(700).index).toBeGreaterThan(rankFor(100).index);
  });
});
