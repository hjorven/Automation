import { describe, expect, it } from "vitest";
import { Extractor } from "./entities";
import { SAVE_VERSION, deserialize, serialize } from "./save";
import { BIOME_GEN, LEGACY_GEN, type BiomeId, type OreId, type Purity } from "./terrain";
import { World } from "./world";

/** Naechster Abstand vom Ursprung, an dem `test` zutrifft (Suche bis `max`). */
function nearest(test: (x: number, y: number) => boolean, max = 160): number {
  let best = Infinity;
  for (let y = -max; y <= max; y++) {
    for (let x = -max; x <= max; x++) {
      const d = Math.hypot(x, y);
      if (d < best && test(x, y)) best = d;
    }
  }
  return best;
}

describe("Biome", () => {
  it("startet auf einer Wiese mit allen Start-Erzen", () => {
    for (let y = -24; y <= 24; y += 2) {
      for (let x = -24; x <= 24; x += 2) if (Math.hypot(x, y) < 25) expect(BIOME_GEN.biomeAt(x, y)).toBe("meadow");
    }
    expect(BIOME_GEN.oreAt(-6, -1)).toBe("iron_ore");
    expect(BIOME_GEN.oreAt(6, 2)).toBe("copper_ore");
    expect(BIOME_GEN.oreAt(1, 9)).toBe("coal");
  });

  it("hat jedes Biom in erreichbarer Naehe", () => {
    const biomes: BiomeId[] = ["forest", "desert", "mountains", "volcano"];
    for (const b of biomes) expect(nearest((x, y) => BIOME_GEN.biomeAt(x, y) === b), `${b}`).toBeLessThan(110);
  });

  it("legt jeden Rohstoff in sein Biom und nicht zu nah an den Start", () => {
    const home: Partial<Record<OreId, BiomeId[]>> = {
      crude_oil: ["desert"],
      quartz: ["desert"],
      sulfur: ["volcano"],
      bauxite: ["mountains"],
    };
    const minDist: Partial<Record<OreId, number>> = { stone: 20, quartz: 35, crude_oil: 40, sulfur: 45, bauxite: 60 };
    const seen = new Map<OreId, number>();
    for (let y = -130; y <= 130; y++) {
      for (let x = -130; x <= 130; x++) {
        const ore = BIOME_GEN.oreAt(x, y);
        if (!ore) continue;
        const d = Math.hypot(x, y);
        seen.set(ore, Math.min(seen.get(ore) ?? Infinity, d));
        expect(d).toBeGreaterThanOrEqual(minDist[ore] ?? 0);
        const allowed = home[ore];
        if (allowed) expect(allowed).toContain(BIOME_GEN.biomeAt(x, y));
        expect(BIOME_GEN.obstacleAt(x, y)).toBeNull();
      }
    }
    for (const ore of ["iron_ore", "copper_ore", "coal", "stone", "quartz", "crude_oil", "sulfur", "bauxite"] as OreId[]) {
      expect(seen.get(ore), ore).toBeLessThan(110);
    }
  });

  it("hat Lava nur im Vulkan und Fels nur in den Bergen", () => {
    for (let y = -130; y <= 130; y += 2) {
      for (let x = -130; x <= 130; x += 2) {
        const o = BIOME_GEN.obstacleAt(x, y);
        if (o === "lava") expect(BIOME_GEN.biomeAt(x, y)).toBe("volcano");
        if (o === "cliff") expect(BIOME_GEN.biomeAt(x, y)).toBe("mountains");
        if (Math.hypot(x, y) < 20) expect(o).toBeNull();
      }
    }
    expect(nearest((x, y) => BIOME_GEN.obstacleAt(x, y) === "lava")).toBeLessThan(130);
    expect(nearest((x, y) => BIOME_GEN.obstacleAt(x, y) === "cliff")).toBeLessThan(130);
  });
});

describe("Reinheit", () => {
  it("verteilt unrein, normal und rein, mit festen Start-Vorkommen", () => {
    const count: Record<Purity, number> = { impure: 0, normal: 0, pure: 0 };
    for (let y = -100; y <= 100; y++) {
      for (let x = -100; x <= 100; x++) if (BIOME_GEN.oreAt(x, y)) count[BIOME_GEN.purityAt(x, y)]++;
    }
    const total = count.impure + count.normal + count.pure;
    for (const p of ["impure", "normal", "pure"] as Purity[]) expect(count[p] / total, p).toBeGreaterThan(0.12);
    expect(BIOME_GEN.purityAt(-6, -1)).toBe("normal");
  });

  it("aendert das Tempo der Bohrer", () => {
    const w = World.createDefault();
    const find = (p: Purity) => {
      for (let r = 15; r < 100; r++) {
        for (let x = -r; x <= r; x++) {
          const ore = w.gen.oreAt(x, r);
          if (ore && ore !== "crude_oil" && w.gen.purityAt(x, r) === p && !w.entityAt(x, r)) return [x, r] as const;
        }
      }
      throw new Error(p);
    };
    const rate = (p: Purity) => {
      const [x, y] = find(p);
      return (w.place("extractor", x, y, 0) as Extractor).interval;
    };
    const normal = rate("normal");
    expect(rate("pure")).toBe(normal / 2);
    expect(rate("impure")).toBe(normal * 2);
  });
});

describe("Spielstand und Weltgenerator", () => {
  it("neue Welten nutzen Biome und speichern das", () => {
    const w = World.createDefault();
    expect(w.gen.version).toBe(2);
    const data = serialize(w);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.gen).toBe(2);
    expect(deserialize(JSON.parse(JSON.stringify(data))).gen.version).toBe(2);
  });

  it("alte Spielstaende behalten die alte Welt und ihre Bohrer", () => {
    // Ein Feld, das in der alten Welt Erz hat, in der neuen aber nicht.
    let spot: [number, number] | null = null;
    for (let x = 15; x < 200 && !spot; x++) {
      for (let y = -40; y <= 40 && !spot; y++) {
        const ore = LEGACY_GEN.oreAt(x, y);
        if (ore && ore !== "crude_oil" && BIOME_GEN.oreAt(x, y) !== ore) spot = [x, y];
      }
    }
    expect(spot).not.toBeNull();
    const w = deserialize({
      version: 3,
      tick: 0,
      tier: 0,
      storage: [],
      entities: [
        { type: "hub", x: 0, y: 0, dir: 0 },
        { type: "extractor", x: spot![0], y: spot![1], dir: 0 },
      ],
    });
    expect(w.gen.version).toBe(1);
    expect(w.entities.size).toBe(2);
    expect((w.entityAt(spot![0], spot![1]) as Extractor).ore).toBe(LEGACY_GEN.oreAt(spot![0], spot![1]));
    expect(serialize(w).gen).toBe(1);
  });

  it("meldet Lava und Fels als eigene Baufehler", () => {
    const w = World.createDefault();
    for (const kind of ["lava", "cliff"] as const) {
      let spot: [number, number] | null = null;
      for (let r = 20; r < 160 && !spot; r++) {
        for (let x = -r; x <= r && !spot; x++) if (w.gen.obstacleAt(x, r) === kind) spot = [x, r];
      }
      expect(spot, kind).not.toBeNull();
      expect(w.buildError("belt", spot![0], spot![1])).toBe("fog");
      w.reveal(spot![0], spot![1], 2);
      expect(w.buildError("belt", spot![0], spot![1])).toBe(kind);
    }
  });
});
