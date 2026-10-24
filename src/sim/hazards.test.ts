import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "./constants";
import { DAY_SECONDS, START_SECONDS } from "./daycycle";
import type { Machine, Turret } from "./entities";
import { ATTACK_TIER, BUILDING_HP, CHUNK, NEST_HP, TURRET, WAVE_ANGER, chunkKey, nestSites } from "./hazards";
import { recipeById } from "./recipes";
import { deserialize, serialize } from "./save";
import { World } from "./world";

const RIGHT = 0;
const NIGHT_TICK = (DAY_SECONDS - START_SECONDS) * TICKS_PER_SECOND;

function run(w: World, seconds: number) {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) w.step();
}

function nearestNest() {
  return [...nestSites()].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
}

/** Welt kurz vor einer Nacht mit einem Nest, das gleich angreift, und einem Gebaeude daneben. */
function angryNest(peaceful = false) {
  const w = new World();
  w.peaceful = peaceful;
  w.tier = ATTACK_TIER;
  w.place("hub", 0, 0, RIGHT);
  const site = nearestNest();
  const nest = w.hazards.nests.get(site.id)!;
  nest.anger = WAVE_ANGER;
  const target = w.place("smelter", site.x + 4, site.y, RIGHT)!;
  w.tick = NIGHT_TICK;
  return { w, nest, target };
}

describe("Smog", () => {
  it("arbeitende Maschinen verschmutzen ihr Feld, der Smog breitet sich aus", () => {
    const w = new World();
    const m = w.place("smelter", 1, 1, RIGHT, recipeById("smelt_iron")) as Machine;
    for (let s = 0; s < 30; s++) {
      for (let i = 0; i < 2; i++) m.accept("iron_ore", 2, w);
      m.output.clear();
      run(w, 1);
    }
    expect(w.hazards.pollutionAt(1, 1)).toBeGreaterThan(5);
    expect(w.hazards.pollution.get(chunkKey(1, 0)) ?? 0).toBeGreaterThan(0);
    expect(w.hazards.pollutionAt(1, 1)).toBeGreaterThan(w.hazards.pollutionAt(CHUNK + 1, 1));
  });

  it("baut sich ohne Quelle wieder ab", () => {
    const w = new World();
    w.hazards.pollution.set(chunkKey(0, 0), 50);
    run(w, 300);
    expect(w.hazards.pollution.size).toBe(0);
  });

  it("eine kleine Startfabrik weckt keine Nester", () => {
    const w = World.createDefault();
    w.tier = ATTACK_TIER;
    for (let i = 0; i < 6; i++) {
      const m = w.place("smelter", -3 + i, 4, RIGHT, recipeById("smelt_iron")) as Machine;
      m.crafting = true;
    }
    // Feste Quelle wie ein Dutzend Bohrer und Schmelzen.
    for (let s = 0; s < 20 * 60; s++) {
      w.hazards.pollution.set(chunkKey(0, 0), (w.hazards.pollution.get(chunkKey(0, 0)) ?? 0) + 20);
      run(w, 1 / TICKS_PER_SECOND);
      w.tick += TICKS_PER_SECOND - 1;
    }
    for (const n of w.hazards.nests.values()) expect(n.anger).toBe(0);
  });
});

describe("Kreaturen", () => {
  it("ein wuetendes Nest greift nachts an und beschaedigt Gebaeude", () => {
    const { w, target } = angryNest();
    run(w, 1);
    expect(w.hazards.waves).toBe(1);
    expect(w.hazards.creatures.length).toBeGreaterThan(0);
    run(w, 4);
    expect(w.hazards.damage.get(target.id) ?? 0).toBeGreaterThan(0);
    run(w, 30);
    expect(w.entities.has(target.id)).toBe(false);
    expect(w.hazards.destroyed).toBe(1);
  });

  it("tagsueber greifen Nester nicht an", () => {
    const { w } = angryNest();
    w.tick = 0;
    run(w, 2);
    expect(w.hazards.waves).toBe(0);
  });

  it("im friedlichen Modus gibt es keine Angriffe", () => {
    const { w, target } = angryNest(true);
    run(w, 30);
    expect(w.hazards.creatures.length).toBe(0);
    expect(w.entities.has(target.id)).toBe(true);
  });

  it("umschalten auf friedlich vertreibt laufende Kreaturen", () => {
    const { w } = angryNest();
    run(w, 1);
    expect(w.hazards.creatures.length).toBeGreaterThan(0);
    w.peaceful = true;
    w.step();
    expect(w.hazards.creatures.length).toBe(0);
  });

  it("der Hub wird nie angegriffen", () => {
    const { w, target } = angryNest();
    w.remove(target.x, target.y);
    run(w, 60);
    expect(w.entityAt(0, 0)?.type).toBe("hub");
  });

  it("bei Sonnenaufgang ziehen sie sich zurueck", () => {
    const { w } = angryNest();
    run(w, 1);
    expect(w.hazards.creatures.length).toBeGreaterThan(0);
    w.tick = 10 * TICKS_PER_SECOND; // Tag
    run(w, 10);
    expect(w.hazards.creatures.length).toBe(0);
  });

  it("Abwehrtuerme schiessen Kreaturen ab", () => {
    const { w, target } = angryNest();
    const t = w.place("turret", target.x + 1, target.y, RIGHT) as Turret;
    run(w, 30);
    expect(w.hazards.creatures.length).toBe(0);
    expect(w.entities.has(target.id)).toBe(true);
    expect(t.lastShot).toBeGreaterThan(NIGHT_TICK);
  });

  it("Tuerme in Reichweite zerstoeren Nester", () => {
    const w = new World();
    w.tier = ATTACK_TIER;
    const site = nearestNest();
    w.place("turret", site.x + 3, site.y, RIGHT);
    const shots = Math.ceil(NEST_HP / TURRET.damage);
    for (let i = 0; i < shots * TURRET.reload + 5; i++) w.step();
    expect(w.hazards.nests.has(site.id)).toBe(false);
    expect(w.hazards.nestsCleared).toBe(1);
  });

  it("auf einem Nest kann man nicht bauen", () => {
    const w = new World();
    const site = nearestNest();
    expect(w.buildError("belt", site.x, site.y)).toBe("blocked");
  });
});

describe("Spielstand", () => {
  it("speichert Modus, Smog, Nester, Kreaturen und Schaden", () => {
    const { w, nest, target } = angryNest();
    run(w, 3);
    w.hazards.damage.set(target.id, 30);
    nest.hp = 123;
    const cleared = [...nestSites()][5].id;
    w.hazards.nests.delete(cleared);
    w.hazards.pollution.set(chunkKey(3, 3), 42);

    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(back.peaceful).toBe(false);
    expect(back.hazards.pollution.get(chunkKey(3, 3))).toBe(42);
    expect(back.hazards.nests.get(nest.id)?.hp).toBe(123);
    expect(back.hazards.nests.has(cleared)).toBe(false);
    expect(back.hazards.creatures.length).toBe(w.hazards.creatures.length);
    const t2 = back.entityAt(target.x, target.y)!;
    expect(back.hazards.damage.get(t2.id)).toBeGreaterThan(0);
    expect(back.hazards.damage.get(t2.id)).toBeLessThan(BUILDING_HP);
  });

  it("alte Spielstaende ohne Angaben laden friedlich", () => {
    const data = serialize(World.createDefault()) as unknown as Record<string, unknown>;
    delete data.peaceful;
    delete data.hazards;
    const back = deserialize(data);
    expect(back.peaceful).toBe(true);
    expect(back.hazards.nests.size).toBe(nestSites().length);
  });

  it("alte Gebaeude auf einem Nestfeld bleiben, das Nest entfaellt", () => {
    const site = nearestNest();
    const w = World.createDefault();
    w.place("belt", site.x, site.y, RIGHT);
    const data = serialize(w) as unknown as Record<string, unknown>;
    delete data.hazards;
    const back = deserialize(data);
    expect(back.entityAt(site.x, site.y)?.type).toBe("belt");
    expect(back.hazards.nests.has(site.id)).toBe(false);
  });

  it("neue Spiele starten mit Kreaturen", () => {
    expect(World.createDefault().peaceful).toBe(false);
  });
});
