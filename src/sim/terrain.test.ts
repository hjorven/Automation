import { describe, expect, it } from "vitest";
import { oreAt, waterAt } from "./terrain";

describe("waterAt", () => {
  it("laesst den Startbereich trocken", () => {
    for (let y = -19; y <= 19; y++) {
      for (let x = -19; x <= 19; x++) {
        if (Math.hypot(x, y) < 20) expect(waterAt(x, y)).toBe(false);
      }
    }
  });

  it("legt nie Wasser auf Erz und erzeugt Seen weiter draussen", () => {
    let water = 0;
    for (let y = -120; y <= 120; y++) {
      for (let x = -120; x <= 120; x++) {
        if (!waterAt(x, y)) continue;
        water++;
        expect(oreAt(x, y)).toBeNull();
      }
    }
    const share = water / (241 * 241);
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.2);
  });
});

describe("Bauen auf Wasser", () => {
  it("wird abgelehnt", async () => {
    const { World } = await import("./world");
    const w = World.createDefault();
    let spot: [number, number] | null = null;
    for (let x = 20; x < 200 && !spot; x++) if (waterAt(x, 0)) spot = [x, 0];
    expect(spot).not.toBeNull();
    expect(w.buildError("belt", spot![0], spot![1])).toBe("blocked");
  });
});
