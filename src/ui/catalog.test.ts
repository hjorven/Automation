import { describe, expect, it } from "vitest";
import { TIERS } from "../sim/progression";
import { RESEARCH } from "../sim/research";
import { buildTools, toolTier } from "./catalog";

describe("Werkzeugleiste", () => {
  it("enthaelt jedes Gebaeude aus Stufen und Forschung, sortiert nach Stufe", () => {
    const tools = buildTools();
    for (const b of [...TIERS.flatMap((t) => t.buildings), ...RESEARCH.flatMap((n) => n.buildings)]) {
      expect(tools, b).toContain(b);
    }
    const tiers = tools.map(toolTier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });
});
