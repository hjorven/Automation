import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "./constants";
import type { Dir } from "./dir";
import { Belt, Extractor, Machine, Tunnel } from "./entities";
import type { ItemId } from "./items";
import { MAX_TIER, TIERS, buildingTier, recipeTier } from "./progression";
import { RECIPES } from "./recipes";
import { SAVE_VERSION, deserialize, serialize } from "./save";
import { oreAt } from "./terrain";
import { World } from "./world";

const RIGHT: Dir = 0;
const DOWN: Dir = 1;
const UP: Dir = 3;

function run(world: World, seconds: number) {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

function stock(w: World, items: [ItemId, number][]) {
  for (const [i, n] of items) w.storage.set(i, (w.storage.get(i) ?? 0) + n);
}

/** Welt auf Stufe `tier` mit reichlich Lager. */
function richWorld(tier = MAX_TIER): World {
  const w = new World();
  if (tier === MAX_TIER) w.unlockAll();
  else w.tier = tier;
  stock(w, [
    ["iron_plate", 500],
    ["copper_plate", 500],
    ["gear", 500],
    ["circuit", 500],
    ["steel", 500],
  ]);
  return w;
}

/** Eine Quelle, die jeden Tick ein Item auf ein Band legt, falls Platz ist. */
function feed(w: World, x: number, y: number, item: ItemId, dir: Dir = RIGHT) {
  const b = w.place("belt", x, y, dir)!;
  return () => b.accept(item, (dir + 2) % 4 as Dir, w);
}

describe("Hub-Stufen", () => {
  it("jedes Gebaeude und Rezept gehoert zu genau einer Stufe", () => {
    for (const r of RECIPES) expect(recipeTier(r.id)).toBeLessThanOrEqual(MAX_TIER);
    for (const t of ["belt", "extractor", "smelter", "assembler", "hub", "splitter", "merger", "tunnel", "foundry", "extractor_mk2"] as const) {
      expect(buildingTier(t)).toBeLessThanOrEqual(MAX_TIER);
    }
  });

  it("Upgrade zieht die Kosten ab und erhoeht die Stufe", () => {
    const w = new World();
    expect(w.upgradeHub()).toBe(false);
    stock(w, [
      ["iron_plate", 25],
      ["copper_plate", 10],
    ]);
    expect(w.upgradeHub()).toBe(true);
    expect(w.tier).toBe(1);
    expect(w.storage.get("iron_plate")).toBe(5);
    expect(w.storage.has("copper_plate")).toBe(false);
  });

  it("laesst sich bis zur letzten Stufe kaufen und nicht weiter", () => {
    const w = new World();
    for (const t of TIERS) for (const c of t.cost) stock(w, [[c.item, c.count]]);
    for (let i = 0; i < MAX_TIER; i++) expect(w.upgradeHub()).toBe(true);
    expect(w.tier).toBe(MAX_TIER);
    expect(w.upgradeHub()).toBe(false);
  });

  it("gesperrte Gebaeude lassen sich nicht bauen", () => {
    const w = new World();
    stock(w, [["iron_plate", 100], ["copper_plate", 100]]);
    expect(w.buildError("assembler", 3, 3)).toBe("locked");
    expect(w.build("assembler", 3, 3, RIGHT)).toBeNull();
    w.tier = 1;
    expect(w.build("assembler", 3, 3, RIGHT)).not.toBeNull();
  });

  it("Bauen kostet, Abreissen erstattet", () => {
    const w = new World();
    w.tier = 1;
    expect(w.buildError("assembler", 3, 3)).toBe("cost");
    stock(w, [["iron_plate", 10], ["copper_plate", 5]]);
    expect(w.build("assembler", 3, 3, RIGHT)).not.toBeNull();
    expect(w.storage.size).toBe(0);
    w.demolish(3, 3);
    expect(w.storage.get("iron_plate")).toBe(10);
    expect(w.storage.get("copper_plate")).toBe(5);
  });

  it("Baender, Bohrer und Schmelzen sind gratis", () => {
    const w = new World();
    expect(w.build("belt", 1, 1, RIGHT)).not.toBeNull();
    expect(w.build("extractor", -6, -1, RIGHT)).not.toBeNull();
    expect(w.build("smelter", -5, -1, RIGHT)).not.toBeNull();
  });

  it("gesperrte Rezepte werden beim Bauen nicht uebernommen", () => {
    const w = richWorld(1);
    const m = w.build("assembler", 3, 3, RIGHT, RECIPES.find((r) => r.id === "circuit")!) as Machine;
    expect(m.recipe).toBeNull();
  });
});

describe("Verteiler", () => {
  it("verteilt abwechselnd nach vorne, links und rechts", () => {
    const w = new World();
    const push = feed(w, 0, 0, "iron_plate");
    w.place("splitter", 1, 0, RIGHT);
    w.place("hub", 2, 0, RIGHT); // vorne
    const up = w.place("belt", 1, -1, UP) as Belt; // links (bei Blick nach rechts)
    const down = w.place("belt", 1, 1, DOWN) as Belt; // rechts
    let side = 0;
    for (let i = 0; i < 6 * TICKS_PER_SECOND; i++) {
      push();
      w.step();
      // Seitenbaender leeren, damit sie nie verstopfen.
      for (const b of [up, down]) {
        side += b.items.filter((it) => it.progress >= 0.9).length;
        b.items = b.items.filter((it) => it.progress < 0.9);
      }
    }
    side += up.items.length + down.items.length;
    const forward = w.storage.get("iron_plate") ?? 0;
    expect(forward).toBeGreaterThan(3);
    expect(Math.abs(side - 2 * forward)).toBeLessThanOrEqual(2);
    expect(w.beltInputSide(up)).toBe(DOWN);
  });
});

describe("Zusammenfuehrer", () => {
  it("nimmt abwechselnd von zwei Seiten", () => {
    const w = new World();
    const a = feed(w, 0, 0, "iron_plate");
    const b = feed(w, 1, -1, "copper_plate", DOWN);
    w.place("merger", 1, 0, RIGHT);
    w.place("hub", 2, 0, RIGHT);
    for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
      a();
      b();
      w.step();
    }
    const iron = w.storage.get("iron_plate") ?? 0;
    const copper = w.storage.get("copper_plate") ?? 0;
    expect(iron + copper).toBeGreaterThan(30);
    expect(Math.abs(iron - copper)).toBeLessThanOrEqual(2);
  });
});

describe("Tunnel", () => {
  it("wird als Paar gebaut und foerdert unter Gebaeuden hindurch", () => {
    const w = new World();
    const push = feed(w, 0, 0, "gear");
    const entry = w.place("tunnel", 1, 0, RIGHT) as Tunnel;
    w.place("smelter", 2, 0, DOWN); // Hindernis
    w.place("smelter", 3, 0, DOWN);
    const exit = w.place("tunnel", 4, 0, RIGHT) as Tunnel;
    w.place("hub", 5, 0, RIGHT);
    expect(entry.exit).toBe(false);
    expect(exit.exit).toBe(true);
    expect(entry.partner(w)).toBe(exit);

    for (let i = 0; i < 10 * TICKS_PER_SECOND; i++) {
      push();
      w.step();
    }
    expect(w.storage.get("gear") ?? 0).toBeGreaterThan(10);
  });

  it("ohne Ausgang in Reichweite nimmt der Eingang nichts an", () => {
    const w = new World();
    const entry = w.place("tunnel", 1, 0, RIGHT) as Tunnel;
    w.place("tunnel", 7, 0, RIGHT);
    expect(entry.partner(w)).toBeNull();
    expect(entry.accept("gear", 2, w)).toBe(false);
  });

  it("uebersteht Speichern und Laden mit Items unterwegs", () => {
    const w = new World();
    const push = feed(w, 0, 0, "gear");
    w.place("tunnel", 1, 0, RIGHT);
    w.place("tunnel", 4, 0, RIGHT);
    w.place("hub", 5, 0, RIGHT);
    for (let i = 0; i < 37; i++) {
      push();
      w.step();
    }
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(serialize(copy).entities).toEqual(serialize(w).entities);
    run(w, 5);
    run(copy, 5);
    expect([...copy.storage]).toEqual([...w.storage]);
  });
});

describe("Giesserei und Bohrer Mk2", () => {
  it("Giesserei stellt sich auf Stahl ein", () => {
    const w = richWorld(4);
    const f = w.build("foundry", 3, 3, RIGHT) as Machine;
    expect(f.recipe?.id).toBe("steel");
    expect(f.accept("iron_ore", 2, w)).toBe(true);
    expect(f.accept("coal", 2, w)).toBe(true);
    for (let i = 0; i < 41; i++) f.update(w);
    // Ohne Abnehmer bleibt der Stahl im Ausgang liegen.
    expect(f.output.get("steel")).toBe(1);
  });

  it("Bohrer Mk2 foerdert doppelt so schnell und ersetzt alte Bohrer", () => {
    const w = richWorld();
    w.place("extractor", -6, -1, RIGHT);
    w.place("hub", -5, -1, RIGHT);
    w.place("extractor", -6, 0, RIGHT);
    w.place("hub", -5, 0, RIGHT);
    const old = w.entityAt(-6, 0)!;
    const up = w.upgradeExtractor(old) as Extractor;
    expect(up.type).toBe("extractor_mk2");
    expect(up.dir).toBe(RIGHT);
    expect(w.storage.get("steel")).toBe(496);
    w.storage.clear();
    run(w, 20);
    // Beide Bohrer liefern Eisenerz in getrennte Hubs: 10 + 20 Stueck.
    expect(w.storage.get("iron_ore")).toBeGreaterThanOrEqual(28);
  });

  it("es gibt Kohle in der Naehe des Hubs", () => {
    expect(oreAt(1, 9)).toBe("coal");
    expect(oreAt(-6, -1)).toBe("iron_ore");
  });
});

describe("Spielstand v1", () => {
  it("wird auf Stufen umgestellt: Abgeliefertes liegt im Lager", () => {
    const w = deserialize({
      version: 1,
      tick: 100,
      delivered: [
        ["iron_plate", 30],
        ["copper_plate", 12],
      ],
      entities: [
        { type: "hub", x: 0, y: 0, dir: 0 },
        { type: "assembler", x: 3, y: 3, dir: 0, recipe: "gear" },
      ],
    });
    expect(w.tier).toBe(0);
    expect(w.storage.get("iron_plate")).toBe(30);
    expect(w.entities.size).toBe(2);
    expect(w.upgradeHub()).toBe(true);
    const saved = serialize(w);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.tier).toBe(1);
  });
});
