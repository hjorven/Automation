import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "./constants";
import { DAY_SECONDS, NIGHT_SECONDS, START_SECONDS, isNight, sunlight } from "./daycycle";
import type { Accumulator } from "./entities";
import { ACCUMULATOR, HUB_POWER, NIGHT_DEMAND, POWER_TIER, SOLAR_POWER } from "./progression";
import { deserialize, serialize } from "./save";
import { World } from "./world";

const RIGHT = 0;
/** Erster Tick der ersten Nacht und Mittag des ersten Tages. */
const NIGHT_TICK = (DAY_SECONDS - START_SECONDS) * TICKS_PER_SECOND;
const NOON_TICK = (DAY_SECONDS / 2 - START_SECONDS) * TICKS_PER_SECOND;

function powered(): World {
  const w = new World();
  w.tier = POWER_TIER;
  w.place("hub", 0, 0, RIGHT);
  return w;
}

describe("Tag und Nacht", () => {
  it("ein neues Spiel beginnt am Tag, die Nacht dauert 4 Minuten", () => {
    expect(isNight(0)).toBe(false);
    expect(isNight(NIGHT_TICK - 1)).toBe(false);
    expect(isNight(NIGHT_TICK)).toBe(true);
    expect(isNight(NIGHT_TICK + NIGHT_SECONDS * TICKS_PER_SECOND - 1)).toBe(true);
    expect(isNight(NIGHT_TICK + NIGHT_SECONDS * TICKS_PER_SECOND)).toBe(false);
  });

  it("die Sonne scheint mittags voll und nachts gar nicht", () => {
    expect(sunlight(NOON_TICK)).toBe(1);
    expect(sunlight(NIGHT_TICK + 100)).toBe(0);
    expect(sunlight(1)).toBeGreaterThan(0);
  });
});

describe("Strom-Puzzle", () => {
  it("Solarfelder liefern nur am Tag", () => {
    const w = powered();
    for (let i = 0; i < 3; i++) w.place("solar", i, 5, RIGHT);
    w.tick = NOON_TICK - 1;
    w.step();
    expect(w.power.supply).toBe(HUB_POWER + 3 * SOLAR_POWER);
    w.tick = NIGHT_TICK + 10;
    w.step();
    expect(w.power.supply).toBe(HUB_POWER);
  });

  it("nachts brauchen Maschinen mehr Strom", () => {
    const w = powered();
    for (let i = 0; i < 5; i++) w.place("assembler", i, 10, RIGHT); // 40 MW
    w.step();
    expect(w.power.demand).toBe(40);
    expect(w.power.night).toBe(false);
    w.tick = NIGHT_TICK + 10;
    w.step();
    expect(w.power.night).toBe(true);
    expect(w.power.demand).toBe(40 * NIGHT_DEMAND);
  });

  it("Speicher laden tagsueber und decken nachts die Luecke", () => {
    const w = powered();
    const acc = w.place("accumulator", 3, 3, RIGHT) as Accumulator;
    for (let i = 0; i < 7; i++) w.place("assembler", i, 10, RIGHT); // 56 MW, nachts 70 MW
    // Tag: 4 MW Ueberschuss laden den Speicher.
    w.step();
    expect(w.power.factor).toBe(1);
    expect(w.power.battery).toBeCloseTo(-4);
    expect(acc.stored).toBeCloseTo(4 / TICKS_PER_SECOND);

    // Nacht mit vollem Speicher: 10 MW fehlen, der Speicher springt ein.
    acc.stored = ACCUMULATOR.capacity;
    w.tick = NIGHT_TICK + 10;
    w.step();
    expect(w.power.battery).toBeCloseTo(10);
    expect(w.power.factor).toBe(1);
    expect(acc.stored).toBeCloseTo(ACCUMULATOR.capacity - 10 / TICKS_PER_SECOND);

    // Leerer Speicher: Maschinen werden langsamer.
    acc.stored = 0;
    w.step();
    expect(w.power.factor).toBeCloseTo(60 / 70);
  });

  it("die Entladeleistung ist begrenzt", () => {
    const w = new World();
    w.tier = POWER_TIER;
    const acc = w.place("accumulator", 3, 3, RIGHT) as Accumulator;
    acc.stored = ACCUMULATOR.capacity;
    for (let i = 0; i < 10; i++) w.place("assembler", i, 10, RIGHT); // 80 MW, kein Hub
    w.step();
    expect(w.power.battery).toBe(ACCUMULATOR.rate);
    expect(w.power.factor).toBeCloseTo(ACCUMULATOR.rate / 80);
  });

  it("Kraftwerke laden Speicher mit, wenn Platz ist", () => {
    const w = powered();
    const acc = w.place("accumulator", 3, 3, RIGHT) as Accumulator;
    const g = w.place("generator_coal", 5, 5, RIGHT);
    g!.accept("coal", 2, w);
    w.step();
    expect(w.power.battery).toBeCloseTo(-ACCUMULATOR.rate);
    expect(acc.stored).toBeGreaterThan(0);
  });

  it("vor der Energie-Stufe passiert nichts", () => {
    const w = new World();
    w.place("hub", 0, 0, RIGHT);
    const acc = w.place("accumulator", 3, 3, RIGHT) as Accumulator;
    w.step();
    expect(acc.stored).toBe(0);
    expect(w.power.factor).toBe(1);
  });

  it("Ladung bleibt im Spielstand erhalten", () => {
    const w = powered();
    const acc = w.place("accumulator", 3, 3, RIGHT) as Accumulator;
    w.place("solar", 4, 3, RIGHT);
    acc.stored = 1234;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    const a2 = back.entityAt(3, 3) as Accumulator;
    expect(a2.type).toBe("accumulator");
    expect(a2.stored).toBe(1234);
    expect(back.entityAt(4, 3)?.type).toBe("solar");
  });
});
