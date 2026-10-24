import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "./save";
import { World } from "./world";

/** Neue Welt mit vollem Lager und allem freigeschaltet. */
function rich(): World {
  const w = World.createDefault();
  w.unlockAll();
  for (const item of ["iron_plate", "copper_plate", "gear"] as const) w.storage.set(item, 10_000);
  return w;
}

describe("Nebel des Krieges", () => {
  it("startet mit erkundetem Gebiet um den Hub", () => {
    const w = World.createDefault();
    expect(w.isExplored(0, 0)).toBe(true);
    expect(w.isExplored(15, -10)).toBe(true);
    expect(w.isExplored(60, 0)).toBe(false);
    expect(w.buildError("belt", 60, 0)).toBe("fog");
  });

  it("eine nackte Welt (Tests, Werkzeuge) hat keinen Nebel", () => {
    expect(new World().isExplored(500, 500)).toBe(true);
  });

  it("jedes Gebaeude lichtet seine Umgebung, ein Band nach dem anderen", () => {
    const w = rich();
    // Eine Reihe ohne Hindernisse suchen.
    let y = 0;
    while (Array.from({ length: 70 }, (_, x) => w.gen.obstacleAt(x, y)).some(Boolean)) y++;
    let edge = 0;
    while (w.isExplored(edge + 1, y)) edge++;
    expect(edge).toBeLessThan(40);
    // Am Rand weiterbauen: jedes Band macht das naechste Feld erreichbar.
    for (let tx = edge; tx < edge + 25; tx++) {
      expect(w.buildError("belt", tx, y), `${tx}`).toBeNull();
      w.build("belt", tx, y, 0);
    }
    expect(w.isExplored(edge + 28, y)).toBe(true);
  });

  it("der Radarturm lichtet einen weiten Umkreis", () => {
    const w = rich();
    expect(w.isExplored(10, 50)).toBe(false);
    expect(w.build("radar", 10, 10, 0)).not.toBeNull();
    expect(w.isExplored(10, 50)).toBe(true);
    expect(w.isExplored(10, 70)).toBe(false);
  });

  it("bleibt nach Abriss und Speichern gelichtet", () => {
    const w = rich();
    w.build("radar", 10, 10, 0);
    w.demolish(10, 10);
    expect(w.isExplored(10, 50)).toBe(true);
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(w))));
    expect(copy.isExplored(10, 50)).toBe(true);
    expect(copy.isExplored(10, 70)).toBe(false);
  });

  it("alte Spielstaende lichten den Nebel um ihre Gebaeude", () => {
    const w = deserialize({
      version: 3,
      tick: 0,
      tier: 0,
      storage: [],
      entities: [
        { type: "hub", x: 0, y: 0, dir: 0 },
        { type: "belt", x: 80, y: 0, dir: 0 },
      ],
    });
    expect(w.isExplored(80, 0)).toBe(true);
    expect(w.isExplored(83, 3)).toBe(true);
    expect(w.isExplored(50, 0)).toBe(false);
  });
});
