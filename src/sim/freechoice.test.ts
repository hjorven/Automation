import { describe, expect, it } from "vitest";
import type { Dir } from "./dir";
import type { Machine } from "./entities";
import type { ItemId } from "./items";
import { ORDER_SLOTS, itemTier, makeOrder, rawValue } from "./orders";
import { BUILD_COSTS, HUB_POWER, MAX_TIER, TIERS, buildingTier, hubBuildingTier, type BuildId } from "./progression";
import { ALT_RECIPES, recipeById } from "./recipes";
import { RESEARCH, researchById, researchForRecipe } from "./research";
import { deserialize, serialize } from "./save";
import { World } from "./world";

const RIGHT: Dir = 0;

function stock(w: World, items: [ItemId, number][]) {
  for (const [i, n] of items) w.storage.set(i, (w.storage.get(i) ?? 0) + n);
}

function payFor(w: World, id: string) {
  for (const c of researchById(id)!.cost) stock(w, [[c.item, c.count]]);
}

describe("Forschungsbaum", () => {
  it("Ids sind eindeutig, Voraussetzungen existieren und kommen nicht spaeter", () => {
    const ids = new Set(RESEARCH.map((n) => n.id));
    expect(ids.size).toBe(RESEARCH.length);
    for (const n of RESEARCH) {
      for (const r of n.requires) {
        expect(ids.has(r), `${n.id} braucht ${r}`).toBe(true);
        expect(researchById(r)!.tier, `${n.id} <- ${r}`).toBeLessThanOrEqual(n.tier);
      }
    }
  });

  it("Kosten und Inhalt sind auf der Stufe des Knotens herstellbar", () => {
    for (const n of RESEARCH) {
      expect(n.tier, n.id).toBeLessThanOrEqual(MAX_TIER);
      for (const c of n.cost) expect(itemTier(c.item), `${n.id}: ${c.item}`).toBeLessThanOrEqual(n.tier);
      for (const b of n.buildings) {
        for (const c of BUILD_COSTS[b] ?? []) expect(itemTier(c.item), `${n.id}: ${b} ${c.item}`).toBeLessThanOrEqual(n.tier);
        expect(hubBuildingTier(b), `${b} nicht doppelt`).toBe(Infinity);
      }
    }
  });

  it("jedes Gebaeude ist ueber Stufe oder Forschung erreichbar", () => {
    for (const id of Object.keys(BUILD_COSTS) as BuildId[]) expect(buildingTier(id), id).toBeLessThanOrEqual(MAX_TIER);
  });

  it("sperrt nach Stufe, Voraussetzung und Kosten", () => {
    const w = new World();
    w.tier = 1;
    expect(w.researchError("tunnel")).toBe("tier");
    expect(w.researchError("nope")).toBe("unknown");
    w.tier = 2;
    expect(w.researchError("sorting")).toBe("requires");
    expect(w.researchError("tunnel")).toBe("cost");
    expect(w.isUnlocked("tunnel")).toBe(false);
    payFor(w, "tunnel");
    expect(w.doResearch("tunnel")).toBe(true);
    expect(w.storage.size).toBe(0);
    expect(w.isUnlocked("tunnel")).toBe(true);
    expect(w.researchError("tunnel")).toBe("done");
    expect(w.doResearch("tunnel")).toBe(false);
  });

  it("die Reihenfolge ist frei", () => {
    const a = new World();
    const b = new World();
    a.tier = b.tier = 2;
    payFor(a, "tunnel");
    payFor(b, "drill_tuning");
    expect(a.doResearch("tunnel")).toBe(true);
    expect(b.doResearch("drill_tuning")).toBe(true);
    expect(a.isUnlocked("tunnel")).toBe(true);
    expect(b.isUnlocked("tunnel")).toBe(false);
    expect(b.extractBoost).toBeCloseTo(1.25);
  });

  it("Bohrer-Tuning macht Bohrer schneller", () => {
    const count = (tuned: boolean) => {
      const w = new World();
      if (tuned) w.grantResearch("drill_tuning");
      w.place("extractor", -6, -1, RIGHT);
      w.place("hub", -5, -1, RIGHT);
      for (let i = 0; i < 20 * 40; i++) w.step();
      return w.storage.get("iron_ore") ?? 0;
    };
    expect(count(true) / count(false)).toBeGreaterThan(1.2);
  });

  it("Hub-Generator erhoeht die Grundversorgung", () => {
    const w = new World();
    w.tier = 3;
    w.place("hub", 0, 0, RIGHT);
    w.step();
    expect(w.power.supply).toBe(HUB_POWER);
    w.grantResearch("hub_generator");
    w.step();
    expect(w.power.supply).toBe(HUB_POWER + 40);
  });
});

describe("Alternative Rezepte", () => {
  it("gehoeren zu genau einem Knoten, der Maschine und Zutaten schon hat", () => {
    for (const r of ALT_RECIPES) {
      const nodes = RESEARCH.filter((n) => n.recipes.includes(r.id));
      expect(nodes.length, r.id).toBe(1);
      const t = nodes[0].tier;
      expect(buildingTier(r.machine), r.id).toBeLessThanOrEqual(t);
      for (const i of r.inputs) expect(itemTier(i.item), `${r.id}: ${i.item}`).toBeLessThanOrEqual(t);
      expect(r.name, r.id).toBeTruthy();
    }
  });

  it("Standard-Stufen schalten keine Alternativen frei", () => {
    for (const t of TIERS) for (const id of t.recipes) expect(recipeById(id)?.alt, id).toBeFalsy();
  });

  it("sind pro Maschine waehlbar und laufen", () => {
    const w = new World();
    w.tier = 4;
    stock(w, [["iron_plate", 50], ["gear", 50], ["circuit", 50]]);
    const alt = recipeById("alt_cast_iron")!;
    const f = w.build("foundry", 3, 3, RIGHT) as Machine;
    expect(f.recipe?.id).toBe("steel");
    w.setRecipe(f, alt);
    expect(f.accept("iron_ore", 2, w)).toBe(true);
    // Gesperrt laesst sich das Rezept beim Bauen nicht waehlen.
    const g = w.build("foundry", 4, 4, RIGHT, alt) as Machine;
    expect(g.recipe?.id).toBe("steel");
    w.grantResearch("cast_iron");
    expect(w.isRecipeUnlocked(alt)).toBe(true);
    const h = w.build("foundry", 5, 5, RIGHT) as Machine;
    expect(h.recipe).toBeNull(); // zwei Rezepte: der Spieler waehlt
    f.input.set("iron_ore", 3).set("coal", 1);
    for (let i = 0; i < 41; i++) f.update(w);
    expect(f.output.get("iron_plate")).toBe(4);
  });

  it("lassen sich einzeln freischalten (Fundstuecke, Auftraege)", () => {
    const w = new World();
    expect(w.unlockRecipe("alt_steel_gear")).toBe(true);
    expect(w.unlockRecipe("alt_steel_gear")).toBe(false);
    expect(w.unlockRecipe("gibtsnicht")).toBe(false);
    expect(w.isRecipeUnlocked(recipeById("alt_steel_gear")!)).toBe(true);
    // Der Knoten bleibt offen.
    expect(w.research.has(researchForRecipe("alt_steel_gear")!.id)).toBe(false);
  });
});

describe("Auftraege", () => {
  it("jede Stufe erzeugt sinnvolle Auftraege", () => {
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      for (let seq = 0; seq < 30; seq++) {
        const o = makeOrder(seq, tier, () => false);
        expect(itemTier(o.item), `${tier}/${seq}`).toBeLessThanOrEqual(tier);
        expect(o.count).toBeGreaterThan(0);
        if (o.recipe) {
          expect(recipeById(o.recipe)?.alt).toBe(true);
        } else {
          expect(o.reward.length).toBe(1);
          const r = o.reward[0];
          expect(itemTier(r.item)).toBeLessThanOrEqual(tier + 1);
          expect(r.count * rawValue(r.item)).toBeGreaterThanOrEqual(o.count * rawValue(o.item));
        }
      }
    }
  });

  it("sind reproduzierbar", () => {
    expect(makeOrder(7, 5, () => false)).toEqual(makeOrder(7, 5, () => false));
  });

  it("neue Welt bietet Auftraege an; Liefern zahlt und belohnt", () => {
    const w = World.createDefault();
    expect(w.orders.length).toBe(ORDER_SLOTS);
    const o = w.orders.find((x) => !x.recipe)!;
    const i = w.orders.indexOf(o);
    expect(w.fulfillOrder(i)).toBe(false);
    stock(w, [[o.item, o.count]]);
    expect(w.fulfillOrder(i)).toBe(true);
    expect(w.storage.get(o.item) ?? 0).toBe(o.reward[0].item === o.item ? o.reward[0].count : 0);
    expect(w.storage.get(o.reward[0].item)).toBeGreaterThanOrEqual(o.reward[0].count);
    expect(w.ordersDone).toBe(1);
    expect(w.orders[i]).not.toBe(o);
  });

  it("jeder dritte Auftrag schaltet ein Rezept frei, sobald eines passt", () => {
    const w = World.createDefault();
    w.tier = 4;
    w.orders = [];
    w.orderSeq = 2;
    w.fillOrders();
    const o = w.orders[0];
    expect(o.recipe).toBeTruthy();
    stock(w, [[o.item, o.count]]);
    expect(w.fulfillOrder(0)).toBe(true);
    expect(w.isRecipeUnlocked(recipeById(o.recipe!)!)).toBe(true);
  });

  it("Ablehnen tauscht den Auftrag", () => {
    const w = World.createDefault();
    const seq = w.orderSeq;
    expect(w.discardOrder(1)).toBe(true);
    expect(w.orderSeq).toBe(seq + 1);
    expect(w.discardOrder(9)).toBe(false);
  });
});

describe("Spielstand v4", () => {
  it("speichert Forschung, Rezepte und Auftraege", () => {
    const w = World.createDefault();
    w.tier = 5;
    w.grantResearch("drill_tuning");
    w.unlockRecipe("alt_fine_wire");
    w.discardOrder(0);
    w.ordersDone = 4;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect([...back.research]).toEqual(["drill_tuning"]);
    expect([...back.extraRecipes]).toEqual(["alt_fine_wire"]);
    expect(back.orders).toEqual(w.orders);
    expect(back.orderSeq).toBe(w.orderSeq);
    expect(back.ordersDone).toBe(4);
    expect(back.extractBoost).toBeCloseTo(1.25);
  });

  it("v3 behaelt alles, was die Stufe frueher freigeschaltet hat", () => {
    const load = (tier: number) =>
      deserialize({ version: 3, tick: 0, tier, storage: [], entities: [{ type: "hub", x: 0, y: 0, dir: 0 }] });
    const early = load(1);
    expect(early.research.size).toBe(0);
    expect(early.orders.length).toBe(ORDER_SLOTS);
    const mid = load(3);
    expect(mid.isUnlocked("tunnel") && mid.isUnlocked("storage") && mid.isUnlocked("sorter")).toBe(true);
    expect(mid.isUnlocked("belt_mk2")).toBe(false);
    const end = load(MAX_TIER);
    for (const id of ["belt_mk2", "belt_mk3", "extractor_mk2", "extractor_mk3", "generator_fuel", "sorter"] as BuildId[]) {
      expect(end.isUnlocked(id), id).toBe(true);
    }
  });

  it("ignoriert kaputte Eintraege", () => {
    const w = deserialize({
      version: 4,
      tick: 0,
      tier: 0,
      storage: [],
      research: ["gibtsnicht", 5],
      extraRecipes: ["auch_nicht"],
      orders: [{ item: "unobtainium", count: 3, reward: [] }, null, { item: "gear", count: 10, reward: [{ item: "x", count: 1 }] }],
      entities: [],
    });
    expect(w.research.size).toBe(0);
    expect(w.extraRecipes.size).toBe(0);
    expect(w.orders.length).toBe(ORDER_SLOTS);
    expect(w.orders[0]).toEqual({ item: "gear", count: 10, reward: [] });
  });
});
