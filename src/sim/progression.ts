import type { EntityType } from "./entities";
import type { ItemId } from "./items";
import type { ItemStack } from "./recipes";
import { RESEARCH } from "./research";

/**
 * Was der Spieler bauen kann: alle Gebaeude plus die schnelleren Baender, die
 * als Band (Entity-Typ "belt") mit hoeherer Stufe entstehen.
 */
export type BuildId = EntityType | "belt_mk2" | "belt_mk3";

/** Bandstufe je Bau-Id (1 = normales Band). */
export const BELT_LEVEL: Partial<Record<BuildId, 1 | 2 | 3>> = { belt: 1, belt_mk2: 2, belt_mk3: 3 };

/**
 * Hub-Stufen wie in Satisfactory: Items im Hub-Lager ausgeben, um die naechste
 * Stufe zu erreichen. Jede Stufe schaltet Gebaeude und Rezepte frei. Ausgelegt
 * auf etwa 8 Stunden bis zur letzten Stufe. Optionales (schnellere Baender
 * und Bohrer, Logistik-Extras, alternative Rezepte) kommt aus dem freien
 * Forschungsbaum in research.ts.
 */
export interface Tier {
  name: string;
  /** Kosten, um diese Stufe zu erreichen (Stufe 0 ist gratis). */
  cost: ItemStack[];
  buildings: BuildId[];
  recipes: string[];
}

const s = (item: ItemId, count: number): ItemStack => ({ item, count });

export const TIERS: readonly Tier[] = [
  {
    name: "Start",
    cost: [],
    buildings: ["belt", "extractor", "smelter", "hub"],
    recipes: ["smelt_iron", "smelt_copper"],
  },
  {
    name: "Fertigung",
    cost: [s("iron_plate", 20), s("copper_plate", 10)],
    buildings: ["assembler", "radar"],
    recipes: ["gear", "wire"],
  },
  {
    name: "Logistik",
    cost: [s("gear", 50), s("wire", 100), s("iron_plate", 50)],
    buildings: ["splitter", "merger", "turret"],
    recipes: ["circuit"],
  },
  {
    name: "Energie",
    cost: [s("circuit", 100), s("iron_plate", 200), s("copper_plate", 100)],
    buildings: ["generator_coal", "solar", "accumulator"],
    recipes: [],
  },
  {
    name: "Stahl",
    cost: [s("circuit", 200), s("gear", 300)],
    buildings: ["foundry"],
    recipes: ["steel"],
  },
  {
    name: "Bauwesen",
    cost: [s("steel", 400), s("circuit", 400)],
    buildings: [],
    recipes: ["concrete", "reinforced_plate", "rotor"],
  },
  {
    name: "Maschinenbau",
    cost: [s("concrete", 200), s("reinforced_plate", 200), s("rotor", 150)],
    buildings: ["manufacturer"],
    recipes: ["motor", "control_unit", "heavy_frame"],
  },
  {
    name: "Öl",
    cost: [s("motor", 100), s("control_unit", 100), s("heavy_frame", 50)],
    buildings: ["pump", "refinery"],
    recipes: ["plastic", "rubber", "fuel"],
  },
  {
    name: "Elektronik",
    cost: [s("plastic", 400), s("rubber", 400), s("control_unit", 300)],
    buildings: [],
    recipes: ["smelt_silicon", "computer"],
  },
  {
    name: "Chemie",
    cost: [s("computer", 100), s("heavy_frame", 150)],
    buildings: [],
    recipes: ["battery"],
  },
  {
    name: "Leichtbau",
    cost: [s("battery", 500), s("computer", 400)],
    buildings: [],
    recipes: ["aluminium", "alu_casing", "turbo_motor", "supercomputer"],
  },
  {
    name: "Raumfrachter",
    cost: [s("turbo_motor", 50), s("supercomputer", 50), s("heavy_frame", 300)],
    buildings: [],
    recipes: [],
  },
];

export const MAX_TIER = TIERS.length - 1;

/** Ab dieser Stufe zaehlt Strom (vorher laufen alle Maschinen voll). */
export const POWER_TIER = 3;
/** Grundversorgung durch den Hub in MW. */
export const HUB_POWER = 60;

/** Solarfeld bei voller Sonne in MW (nachts 0). */
export const SOLAR_POWER = 20;
/** Batteriespeicher: Kapazitaet in MJ (MW mal Sekunden) und hoechste Lade-/Entladeleistung in MW. */
export const ACCUMULATOR = { capacity: 3600, rate: 30 };
/** Nachts brauchen alle Verbraucher so viel mehr Strom (Licht und Heizung). */
export const NIGHT_DEMAND = 1.25;

/** Baukosten aus dem Hub-Lager; beim Abreissen gibt es sie zurueck. */
export const BUILD_COSTS: Partial<Record<BuildId, ItemStack[]>> = {
  hub: [s("iron_plate", 20), s("copper_plate", 10)],
  assembler: [s("iron_plate", 10), s("copper_plate", 5)],
  radar: [s("iron_plate", 30), s("copper_plate", 20), s("gear", 10)],
  splitter: [s("iron_plate", 2), s("gear", 2)],
  merger: [s("iron_plate", 2), s("gear", 2)],
  tunnel: [s("iron_plate", 4), s("gear", 2)],
  storage: [s("iron_plate", 20), s("gear", 5)],
  turret: [s("iron_plate", 20), s("gear", 10), s("circuit", 4)],
  sorter: [s("gear", 4), s("circuit", 2)],
  generator_coal: [s("iron_plate", 20), s("gear", 10), s("circuit", 5)],
  solar: [s("iron_plate", 10), s("wire", 20), s("circuit", 6)],
  accumulator: [s("iron_plate", 15), s("copper_plate", 20), s("circuit", 8)],
  foundry: [s("iron_plate", 10), s("gear", 6), s("circuit", 4)],
  belt_mk2: [s("steel", 1)],
  extractor_mk2: [s("steel", 4), s("gear", 4), s("circuit", 2)],
  manufacturer: [s("reinforced_plate", 10), s("rotor", 6), s("concrete", 10)],
  pump: [s("steel", 10), s("motor", 2), s("concrete", 10)],
  refinery: [s("steel", 15), s("motor", 3), s("control_unit", 2)],
  generator_fuel: [s("heavy_frame", 2), s("motor", 4), s("control_unit", 4)],
  belt_mk3: [s("steel", 1), s("rubber", 1)],
  extractor_mk3: [s("heavy_frame", 2), s("computer", 2), s("motor", 2)],
};

/** Stromverbrauch in MW (ab POWER_TIER); fehlt ein Eintrag, braucht es keinen Strom. */
export const POWER_USE: Partial<Record<EntityType, number>> = {
  extractor: 4,
  extractor_mk2: 10,
  extractor_mk3: 25,
  pump: 20,
  smelter: 4,
  assembler: 8,
  foundry: 16,
  refinery: 30,
  manufacturer: 45,
  turret: 6,
};

/** Kraftwerke: Brennstoff, Leistung in MW und Brenndauer einer Einheit bei Volllast. */
export const GENERATORS: Partial<Record<EntityType, { fuel: ItemId; power: number; burnTicks: number }>> = {
  generator_coal: { fuel: "coal", power: 75, burnTicks: 80 },
  generator_fuel: { fuel: "fuel", power: 150, burnTicks: 160 },
};

export function buildCost(id: BuildId): ItemStack[] {
  return BUILD_COSTS[id] ?? [];
}

export function powerUse(type: EntityType): number {
  return POWER_USE[type] ?? 0;
}

/** Stufe, die ein Gebaeude direkt freischaltet (ohne Forschung). */
export function hubBuildingTier(id: BuildId): number {
  const i = TIERS.findIndex((t) => t.buildings.includes(id));
  return i === -1 ? Infinity : i;
}

/** Fruehste Stufe, ab der ein Gebaeude gebaut werden kann (per Stufe oder Forschung). */
export function buildingTier(id: BuildId): number {
  const n = RESEARCH.find((r) => r.buildings.includes(id));
  return Math.min(hubBuildingTier(id), n ? n.tier : Infinity);
}

/** Stufe, die ein Rezept direkt freischaltet (ohne Forschung). */
export function hubRecipeTier(id: string): number {
  const i = TIERS.findIndex((t) => t.recipes.includes(id));
  return i === -1 ? Infinity : i;
}

/** Fruehste Stufe, ab der ein Rezept nutzbar sein kann (per Stufe oder Forschung). */
export function recipeTier(id: string): number {
  const n = RESEARCH.find((r) => r.recipes.includes(id));
  return Math.min(hubRecipeTier(id), n ? n.tier : Infinity);
}

export function canAfford(storage: ReadonlyMap<ItemId, number>, cost: readonly ItemStack[]): boolean {
  return cost.every((c) => (storage.get(c.item) ?? 0) >= c.count);
}
