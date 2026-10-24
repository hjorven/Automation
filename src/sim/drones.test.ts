import { describe, expect, it } from "vitest";
import type { Dir } from "./dir";
import { DRONE_CARGO, DronePort } from "./drones";
import type { Belt, Storage } from "./entities";
import { deserialize, serialize } from "./save";
import { World } from "./world";

const RIGHT: Dir = 0;

function outpost(w: World, x: number, y: number) {
  const p = w.place("drone_port", x, y, RIGHT) as DronePort;
  return p;
}

describe("Drohnenhaefen", () => {
  it("verbinden sich beim Bauen mit dem offenen Hafen", () => {
    const w = new World();
    const a = outpost(w, 0, 0);
    const b = outpost(w, 50, 0);
    expect(a.target).toEqual({ x: 50, y: 0 });
    expect(b.target).toBeNull();
    const c = outpost(w, 0, 50);
    expect(b.target).toEqual({ x: 0, y: 50 });
    expect(c.target).toBeNull();
  });

  it("fliegen Ladungen zum Ziel, das sie vorne ausgibt", () => {
    const w = new World();
    const a = outpost(w, 0, 0);
    const b = outpost(w, 80, 0);
    const box = w.place("storage", 81, 0, RIGHT) as Storage;
    for (let i = 0; i < DRONE_CARGO; i++) expect(a.accept("iron_plate", 2)).toBe(true);
    expect(a.accept("iron_plate", RIGHT)).toBe(false); // nicht von vorne
    w.step();
    expect(a.state).toBe("out");
    const ticks = DronePort.travelTicks(a, b);
    expect(ticks).toBe(200);
    for (let i = 0; i < ticks + 40; i++) w.step();
    expect(a.state).toBe("back");
    expect(box.queue.length).toBe(DRONE_CARGO);
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.state).toBe("idle");
  });

  it("starten halb voll nach einer Wartezeit", () => {
    const w = new World();
    const a = outpost(w, 0, 0);
    outpost(w, 10, 0);
    a.accept("gear", 2);
    w.step();
    expect(a.state).toBe("idle");
    for (let i = 0; i < 250; i++) w.step();
    expect(a.state).not.toBe("idle");
  });

  it("bringt die Ladung zurueck, wenn das Ziel fehlt", () => {
    const w = new World();
    const a = outpost(w, 0, 0);
    outpost(w, 20, 0);
    for (let i = 0; i < DRONE_CARGO; i++) a.accept("wire", 2);
    w.step();
    w.remove(20, 0);
    for (let i = 0; i < 400; i++) w.step();
    expect(a.state).toBe("idle");
    expect(a.outbox.length).toBe(DRONE_CARGO);
    expect(a.target).not.toBeNull();
  });

  it("Band liefert in den Hafen, Spielstand behaelt Flug und Ladung", () => {
    const w = new World();
    const belt = w.place("belt", -1, 0, RIGHT) as Belt;
    const a = outpost(w, 0, 0);
    outpost(w, 30, 30);
    for (let i = 0; i < 40; i++) {
      belt.accept("coal", 2, w);
      w.step();
    }
    expect(a.outbox.length + a.cargo.length).toBeGreaterThan(0);
    for (let i = 0; i < DRONE_CARGO; i++) a.accept("coal", 2);
    for (let i = 0; i < 5; i++) w.step();
    const data = serialize(w);
    const copy = deserialize(JSON.parse(JSON.stringify(data)));
    expect(serialize(copy).entities).toEqual(data.entities);
    const ca = copy.entityAt(0, 0) as DronePort;
    expect(ca.state).toBe("out");
    expect(ca.cargo.length).toBe(DRONE_CARGO);
  });
});
