import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "./constants";
import type { Dir } from "./dir";
import { Belt, Generator, Machine, Sorter, Storage } from "./entities";
import { ITEM_ORDER, type ItemId } from "./items";
import { BUILD_COSTS, HUB_POWER, MAX_TIER, POWER_TIER, TIERS, buildingTier, recipeTier, type BuildId } from "./progression";
import { RECIPES, recipeById } from "./recipes";
import { deserialize, serialize } from "./save";
import { oreAt, type OreId } from "./terrain";
import { World } from "./world";

const RIGHT: Dir = 0;
const DOWN: Dir = 1;
const UP: Dir = 3;
const ORES: readonly OreId[] = ["iron_ore", "copper_ore", "coal", "stone", "quartz", "sulfur", "crude_oil", "bauxite"];

function run(world: World, seconds: number) {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

function findOre(ore: OreId): { x: number; y: number } {
  for (let r = 0; r < 200; r++) {
    for (let x = -r; x <= r; x++) {
      for (const y of [-r, r]) if (oreAt(x, y) === ore) return { x, y };
      for (const yx of [-r, r]) if (oreAt(yx, x) === ore) return { x: yx, y: x };
    }
  }
  throw new Error(`kein ${ore}`);
}

/** Stufe, ab der ein Item herstellbar (oder abbaubar) ist. */
function itemTier(item: ItemId): number {
  if ((ORES as readonly string[]).includes(item)) return item === "crude_oil" ? buildingTier("pump") : 0;
  const tiers = RECIPES.filter((r) => r.outputs.some((o) => o.item === item)).map((r) =>
    Math.max(recipeTier(r.id), ...r.inputs.map((i) => itemTier(i.item))),
  );
  return tiers.length ? Math.min(...tiers) : Infinity;
}

const MACHINE_FOR: Record<string, BuildId> = {
  smelter: "smelter",
  assembler: "assembler",
  foundry: "foundry",
  refinery: "refinery",
  manufacturer: "manufacturer",
};

describe("Progression ist durchspielbar", () => {
  it("jedes Item ist herstellbar", () => {
    for (const i of ITEM_ORDER) expect(itemTier(i), i).toBeLessThanOrEqual(MAX_TIER);
  });

  it("Stufenkosten sind mit den vorigen Stufen herstellbar", () => {
    TIERS.forEach((t, k) => {
      for (const c of t.cost) expect(itemTier(c.item), `${t.name}: ${c.item}`).toBeLessThan(k);
    });
  });

  it("Rezepte brauchen nur Maschinen, die spaetestens mit ihnen kommen", () => {
    for (const r of RECIPES) {
      expect(buildingTier(MACHINE_FOR[r.machine]), r.id).toBeLessThanOrEqual(recipeTier(r.id));
    }
  });

  it("Baukosten sind beim Freischalten bezahlbar", () => {
    for (const [id, cost] of Object.entries(BUILD_COSTS)) {
      for (const c of cost) expect(itemTier(c.item), `${id}: ${c.item}`).toBeLessThanOrEqual(buildingTier(id as BuildId));
    }
  });

  it("Stufen werden immer teurer (gemessen in Rohstoffen)", () => {
    const memo = new Map<ItemId, number>();
    const raw = (i: ItemId): number => {
      if (memo.has(i)) return memo.get(i)!;
      const rs = RECIPES.filter((r) => r.outputs.some((o) => o.item === i));
      const v = rs.length
        ? Math.min(...rs.map((r) => r.inputs.reduce((n, c) => n + raw(c.item) * c.count, 0) / r.outputs[0].count))
        : 1;
      memo.set(i, v);
      return v;
    };
    const total = TIERS.map((t) => t.cost.reduce((n, c) => n + raw(c.item) * c.count, 0));
    for (let k = 1; k < total.length; k++) expect(total[k], TIERS[k].name).toBeGreaterThan(total[k - 1]);
  });
});

describe("Rohstoffe", () => {
  it("spaete Rohstoffe liegen weiter draussen", () => {
    const d = (o: OreId) => {
      const p = findOre(o);
      return Math.hypot(p.x, p.y);
    };
    expect(d("stone")).toBeGreaterThanOrEqual(20);
    expect(d("quartz")).toBeGreaterThanOrEqual(35);
    expect(d("crude_oil")).toBeGreaterThanOrEqual(40);
    expect(d("bauxite")).toBeGreaterThanOrEqual(60);
  });

  it("Oel nur mit der Pumpe, Erz nur mit Bohrern", () => {
    const w = new World();
    const oil = findOre("crude_oil");
    const stone = findOre("stone");
    expect(w.canPlace("extractor", oil.x, oil.y)).toBe(false);
    expect(w.canPlace("pump", oil.x, oil.y)).toBe(true);
    expect(w.canPlace("pump", stone.x, stone.y)).toBe(false);
    expect(w.canPlace("extractor", stone.x, stone.y)).toBe(true);
  });
});

describe("Strom", () => {
  it("zaehlt erst ab der Energie-Stufe", () => {
    const w = new World();
    for (let i = 0; i < 30; i++) w.place("assembler", i, 10, RIGHT);
    w.step();
    expect(w.power.factor).toBe(1);
    w.tier = POWER_TIER;
    w.step();
    expect(w.power.demand).toBe(240);
    expect(w.power.supply).toBe(0); // kein Hub
    expect(w.power.factor).toBe(0);
  });

  it("Hub und Kraftwerke versorgen, Mangel bremst Maschinen", () => {
    const w = new World();
    w.tier = POWER_TIER;
    w.place("hub", 0, 0, RIGHT);
    for (let i = 0; i < 15; i++) w.place("assembler", i, 10, RIGHT); // 120 MW
    w.step();
    expect(w.power.supply).toBe(HUB_POWER);
    expect(w.power.factor).toBeCloseTo(0.5);

    const g = w.place("generator_coal", 5, 5, RIGHT) as Generator;
    expect(g.accept("coal")).toBe(true);
    expect(g.accept("iron_ore")).toBe(false);
    w.step();
    expect(w.power.supply).toBe(HUB_POWER + 75);
    w.step();
    expect(w.power.factor).toBe(1);
    expect(g.fuel).toBe(0);
    // Volllast wuerde 80 Ticks brennen; bei 120/135 MW reicht die Kohle laenger.
    run(w, 80 / TICKS_PER_SECOND);
    expect(g.burning).toBe(true);
    run(w, 1);
    expect(g.burning).toBe(false);
  });

  it("Maschinen laufen bei halbem Strom halb so schnell", () => {
    const make = (assemblers: number) => {
      const w = new World();
      w.unlockAll();
      w.place("hub", 0, 0, RIGHT);
      for (let i = 0; i < assemblers; i++) w.place("assembler", i, 10, RIGHT);
      const m = w.place("smelter", 3, 3, RIGHT) as Machine;
      m.setRecipe(recipeById("smelt_iron")!);
      for (let i = 0; i < 2; i++) m.accept("iron_ore", 2, w);
      return { w, m };
    };
    const full = make(0);
    const half = make(14); // 112 + 4 = 116 MW bei 60 MW -> ~52 %
    // Eisenplatte braucht 32 Ticks bei vollem Strom.
    run(full.w, 2);
    run(half.w, 2);
    expect(full.m.output.get("iron_plate")).toBe(1);
    expect(half.m.output.get("iron_plate") ?? 0).toBe(0);
    run(half.w, 2);
    expect(half.m.output.get("iron_plate")).toBe(1);
  });
});

describe("Baender Mk2 und Mk3", () => {
  function travel(level: 1 | 2 | 3): number {
    const w = new World();
    for (let x = 0; x < 10; x++) (w.place("belt", x, 0, RIGHT) as Belt).level = level;
    w.place("hub", 10, 0, RIGHT);
    (w.entityAt(0, 0) as Belt).accept("gear", 2, w);
    let t = 0;
    while (!w.storage.has("gear") && t < 1000) {
      w.step();
      t++;
    }
    return t;
  }

  it("laufen doppelt und viermal so schnell", () => {
    expect(travel(1)).toBe(100); // 10 Felder mit 2 Feldern/s
    expect(travel(2)).toBe(50);
    expect(travel(3)).toBe(25);
  });

  it("transportieren deutlich mehr", () => {
    const throughput = (level: 1 | 2 | 3) => {
      const w = new World();
      const first = w.place("belt", 0, 0, RIGHT) as Belt;
      for (let x = 0; x < 10; x++) ((w.entityAt(x, 0) ?? w.place("belt", x, 0, RIGHT)) as Belt).level = level;
      w.place("hub", 10, 0, RIGHT);
      for (let i = 0; i < 30 * TICKS_PER_SECOND; i++) {
        first.accept("gear", 2, w);
        w.step();
      }
      return w.storage.get("gear")! / 30;
    };
    const t1 = throughput(1);
    // Uebergaben zwischen Feldern kosten etwas, daher nicht ganz 2x bzw. 4x.
    expect(t1).toBeGreaterThan(4);
    expect(throughput(2) / t1).toBeGreaterThan(1.6);
    expect(throughput(3) / t1).toBeGreaterThan(2.5);
  });

  it("Aufruesten kostet die neue Stufe und erstattet die alte", () => {
    const w = new World();
    w.unlockAll();
    w.storage.set("steel", 5);
    w.storage.set("rubber", 5);
    const b = w.build("belt", 0, 0, RIGHT) as Belt;
    expect(w.upgradeBelt(b, "belt_mk2")).toBe(true);
    expect(b.level).toBe(2);
    expect(w.storage.get("steel")).toBe(4);
    expect(w.upgradeBelt(b, "belt_mk3")).toBe(true);
    expect(w.storage.get("steel")).toBe(4); // Mk2 zurueck, Mk3 bezahlt
    expect(w.storage.get("rubber")).toBe(4);
    expect(w.upgradeBelt(b, "belt_mk2")).toBe(false);
    w.demolish(0, 0);
    expect(w.storage.get("steel")).toBe(5);
  });

  it("neue Mk2-Baender entstehen direkt schnell", () => {
    const w = new World();
    w.unlockAll();
    w.storage.set("steel", 1);
    const b = w.build("belt_mk2", 0, 0, RIGHT) as Belt;
    expect(b.type).toBe("belt");
    expect(b.level).toBe(2);
  });
});

describe("Lagerkiste und Sortierer", () => {
  it("Lagerkiste puffert und gibt der Reihe nach aus", () => {
    const w = new World();
    const s = w.place("storage", 0, 0, RIGHT) as Storage;
    for (let i = 0; i < Storage.CAPACITY; i++) expect(s.accept(i % 2 ? "gear" : "wire", 2)).toBe(true);
    expect(s.accept("gear", 2)).toBe(false);
    expect(s.accept("gear", RIGHT)).toBe(false); // nicht von vorne
    w.place("hub", 1, 0, RIGHT);
    run(w, 1);
    expect(w.storage.get("wire")).toBe(10);
    expect(w.storage.get("gear")).toBe(10);
  });

  it("Sortierer schickt das Filter-Item nach vorne, den Rest zur Seite", () => {
    const w = new World();
    const s = w.place("sorter", 1, 0, RIGHT) as Sorter;
    s.filter = "gear";
    w.place("hub", 2, 0, RIGHT);
    const side = w.place("belt", 1, -1, UP) as Belt;
    expect(s.accept("wire", 2)).toBe(true);
    w.step();
    expect(side.items.map((i) => i.item)).toEqual(["wire"]);
    expect(s.accept("gear", 2)).toBe(true);
    w.step();
    expect(w.storage.get("gear")).toBe(1);
    expect(w.storage.has("wire")).toBe(false);
  });
});

describe("Spaete Maschinen", () => {
  it("Fertigungsanlage verarbeitet vier Zutaten", () => {
    const w = new World();
    w.unlockAll();
    const m = w.place("manufacturer", 0, 0, RIGHT, recipeById("turbo_motor")!) as Machine;
    const feed: [ItemId, number][] = [
      ["motor", 2],
      ["rubber", 2],
      ["battery", 1],
      ["alu_casing", 2],
    ];
    for (const [i, n] of feed) for (let k = 0; k < n; k++) expect(m.accept(i, 2, w)).toBe(true);
    for (let i = 0; i < 201; i++) m.update(w);
    expect(m.output.get("turbo_motor")).toBe(1);
  });

  it("Schmelze nimmt Quarz erst ab der Elektronik-Stufe", () => {
    const w = new World();
    const m = w.place("smelter", 0, 0, RIGHT) as Machine;
    expect(m.accept("quartz", 2, w)).toBe(false);
    w.tier = recipeTier("smelt_silicon");
    expect(m.accept("quartz", 2, w)).toBe(true);
    expect(m.recipe?.id).toBe("smelt_silicon");
  });

  it("Bohrer Mk3 ersetzt Mk1 und Mk2", () => {
    const w = new World();
    w.unlockAll();
    for (const [i, n] of [["heavy_frame", 10], ["computer", 10], ["motor", 10], ["steel", 10], ["gear", 10], ["circuit", 10]] as [ItemId, number][]) {
      w.storage.set(i, n);
    }
    const e = w.place("extractor", -6, -1, DOWN)!;
    const mk2 = w.upgradeExtractor(e, "extractor_mk2")!;
    const mk3 = w.upgradeExtractor(mk2, "extractor_mk3")!;
    expect(mk3.type).toBe("extractor_mk3");
    expect(mk3.dir).toBe(DOWN);
    expect(w.upgradeExtractor(mk3, "extractor_mk2")).toBeNull();
  });
});

describe("Spielstand v3", () => {
  it("speichert neue Gebaeude samt Zustand", () => {
    const w = new World();
    w.unlockAll();
    (w.place("belt", 0, 0, RIGHT) as Belt).level = 3;
    const st = w.place("storage", 1, 0, RIGHT) as Storage;
    st.queue.push("gear", "wire");
    const so = w.place("sorter", 2, 0, RIGHT) as Sorter;
    so.filter = "rotor";
    const g = w.place("generator_fuel", 3, 0, RIGHT) as Generator;
    g.fuel = 4;
    g.burnLeft = 33;
    w.place("refinery", 4, 0, RIGHT, recipeById("rubber")!);
    w.deliver("gear");
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(serialize(copy).entities).toEqual(serialize(w).entities);
    expect((copy.entityAt(0, 0) as Belt).level).toBe(3);
    expect([...copy.delivered]).toEqual([["gear", 1]]);
  });

  it("v2-Stufen werden auf die neuen abgebildet", () => {
    const load = (tier: number) =>
      deserialize({ version: 2, tick: 0, tier, storage: [["steel", 5]], entities: [{ type: "hub", x: 0, y: 0, dir: 0 }] });
    expect(load(2).tier).toBe(2);
    expect(load(3).tier).toBe(4); // Stahl
    expect(load(4).tier).toBe(5); // Bohrer Mk2
    expect(load(5).tier).toBe(6);
    const w = load(3);
    expect(w.isUnlocked("foundry")).toBe(true);
    expect([...w.delivered]).toEqual([["steel", 5]]);
  });
});

describe("Baufehler", () => {
  it("meldet fehlendes Erz getrennt von belegten Feldern", () => {
    const w = new World();
    w.place("belt", 3, 3, RIGHT);
    expect(w.buildError("extractor", 3, 3)).toBe("blocked");
    expect(w.buildError("extractor", 0, 5)).toBe("ore");
    expect(w.buildError("extractor", -6, -1)).toBeNull();
  });
});
