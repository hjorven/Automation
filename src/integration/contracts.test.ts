// Integrations-Vertraege zwischen Simulation, UI, Modellen und Landschaft.
// Viele Stellen fallen bewusst still auf Platzhalter zurueck (Name = id,
// placeholderModel, graue Kiste, graues Erz). Diese Tests machen solche
// Luecken sichtbar, sobald ein neues Gebaeude, Item oder Erz dazukommt.
//
// Kommt ein Modell erst in einem spaeteren PR, die id in PENDING eintragen.
import { describe, expect, it } from "vitest";
import { ITEM_NAMES, ITEM_ORDER } from "../sim/items";
import { BUILD_COSTS, TIERS, type BuildId } from "../sim/progression";
import { RECIPES, recipeById } from "../sim/recipes";
import { entityTypeOf } from "../sim/world";
import { TOOL_NAMES, buildTools } from "../ui/catalog";
import itemModelsSrc from "../render3d/models/items.ts?raw";
import sceneSrc from "../render3d/scene-view.ts?raw";
import terrainViewSrc from "../render3d/terrain.ts?raw";
import simTerrainSrc from "../sim/terrain.ts?raw";

/** Bewusst offene Luecken (id -> Grund). Leer halten, wenn moeglich. */
const PENDING = {
  models: {} as Record<string, string>,
  items: {} as Record<string, string>,
  ores: {} as Record<string, string>,
};

const cases = (code: string) => new Set([...code.matchAll(/case "([a-z0-9_]+)"/g)].map((m) => m[1]));

/** Freischaltquellen neben den Stufen (z. B. Forschungsbaum), falls vorhanden. */
interface Unlock {
  buildings: readonly string[];
  recipes: readonly string[];
}
const EXTRA_UNLOCKS: Unlock[] = Object.values(
  import.meta.glob<{ RESEARCH?: readonly Unlock[] }>("../sim/research.ts", { eager: true }),
).flatMap((m) => m.RESEARCH ?? []);
const UNLOCKS: Unlock[] = [...TIERS, ...EXTRA_UNLOCKS];

const BUILD_IDS = [...new Set(UNLOCKS.flatMap((u) => u.buildings))] as BuildId[];
const ENTITY_TYPES = [...new Set(BUILD_IDS.map(entityTypeOf))];
const ORES = (simTerrainSrc.match(/OreId = Extract<\s*ItemId,([^>]+)>/)?.[1] ?? "")
  .match(/"([a-z0-9_]+)"/g)!
  .map((s: string) => s.slice(1, -1));

const missing = (ids: Iterable<string>, has: (id: string) => boolean, pending: Record<string, string>) =>
  [...ids].filter((id) => !has(id) && !(id in pending));

describe("Integration: Gebaeude", () => {
  it("jedes baubare Gebaeude hat einen Namen in der UI", () => {
    expect(missing(BUILD_IDS, (id) => !!TOOL_NAMES[id], {})).toEqual([]);
  });

  it("jedes freischaltbare Gebaeude erscheint in der Werkzeugleiste", () => {
    const tools = new Set<string>(buildTools());
    expect(missing(BUILD_IDS, (id) => tools.has(id), {})).toEqual([]);
  });

  it("jedes Gebaeude ausser den Startgebaeuden hat Baukosten", () => {
    const free = new Set<string>(TIERS[0].buildings);
    const costs: Partial<Record<string, unknown>> = BUILD_COSTS;
    expect(missing(BUILD_IDS, (id) => free.has(id) || !!costs[id], {})).toEqual([]);
  });

  it("jedes Gebaeude hat ein eigenes 3D-Modell (kein Platzhalter)", () => {
    const modelled = cases(sceneSrc);
    // Baender zeichnet die Szene gesondert.
    const has = (t: string) => t === "belt" || modelled.has(t);
    expect(missing(ENTITY_TYPES, has, PENDING.models)).toEqual([]);
  });

  it("PENDING nennt nur echte Luecken", () => {
    const modelled = cases(sceneSrc);
    expect(Object.keys(PENDING.models).filter((t) => modelled.has(t))).toEqual([]);
  });
});

describe("Integration: Items und Rezepte", () => {
  it("jedes Item hat einen Namen und ein eigenes Modell", () => {
    expect(ITEM_ORDER.filter((i) => !ITEM_NAMES[i])).toEqual([]);
    const shaped = cases(itemModelsSrc);
    expect(missing(ITEM_ORDER, (i) => shaped.has(i), PENDING.items)).toEqual([]);
  });

  it("Rezepte nutzen nur bekannte Items und baubare Maschinen", () => {
    const items = new Set<string>(ITEM_ORDER);
    const machines = new Set<string>(ENTITY_TYPES);
    for (const r of RECIPES) {
      for (const s of [...r.inputs, ...r.outputs]) expect(items, `${r.id}: ${s.item}`).toContain(s.item);
      expect(machines, `${r.id}: ${r.machine}`).toContain(r.machine);
    }
  });

  it("Stufen und Forschung schalten nur existierende Rezepte frei", () => {
    const unknown = UNLOCKS.flatMap((u) => u.recipes).filter((id) => !recipeById(id));
    expect(unknown).toEqual([]);
  });
});

describe("Integration: Landschaft", () => {
  it("jedes Erz hat einen eigenen Look in der Landschaft", () => {
    expect(ORES.length).toBeGreaterThan(0);
    const styles = terrainViewSrc.match(/ORE_STYLES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    const styled = new Set([...styles.matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1]));
    expect(missing(ORES, (o) => styled.has(o), PENDING.ores)).toEqual([]);
  });
});
