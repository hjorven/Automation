import type { EntityType } from "./entities";
import type { ItemId } from "./items";
import type { ItemStack } from "./recipes";

/**
 * Hub-Stufen wie in Satisfactory: Items im Hub-Lager ausgeben, um die naechste
 * Stufe zu erreichen. Jede Stufe schaltet Gebaeude und Rezepte frei.
 */
export interface Tier {
  name: string;
  /** Kosten, um diese Stufe zu erreichen (Stufe 0 ist gratis). */
  cost: ItemStack[];
  buildings: EntityType[];
  recipes: string[];
}

export const TIERS: readonly Tier[] = [
  {
    name: "Start",
    cost: [],
    buildings: ["belt", "extractor", "smelter", "hub"],
    recipes: ["smelt_iron", "smelt_copper"],
  },
  {
    name: "Fertigung",
    cost: [
      { item: "iron_plate", count: 20 },
      { item: "copper_plate", count: 10 },
    ],
    buildings: ["assembler"],
    recipes: ["gear", "wire"],
  },
  {
    name: "Logistik",
    cost: [
      { item: "gear", count: 25 },
      { item: "wire", count: 40 },
    ],
    buildings: ["splitter", "merger", "tunnel"],
    recipes: ["circuit"],
  },
  {
    name: "Stahl",
    cost: [
      { item: "circuit", count: 30 },
      { item: "gear", count: 30 },
    ],
    buildings: ["foundry"],
    recipes: ["steel"],
  },
  {
    name: "Maschinenbau",
    cost: [
      { item: "steel", count: 40 },
      { item: "circuit", count: 40 },
    ],
    buildings: ["extractor_mk2"],
    recipes: ["motor", "control_unit"],
  },
  {
    name: "Abschluss",
    cost: [
      { item: "motor", count: 20 },
      { item: "control_unit", count: 20 },
    ],
    buildings: [],
    recipes: [],
  },
];

export const MAX_TIER = TIERS.length - 1;

/** Baukosten aus dem Hub-Lager; beim Abreissen gibt es sie zurueck. */
export const BUILD_COSTS: Partial<Record<EntityType, ItemStack[]>> = {
  hub: [
    { item: "iron_plate", count: 20 },
    { item: "copper_plate", count: 10 },
  ],
  assembler: [
    { item: "iron_plate", count: 10 },
    { item: "copper_plate", count: 5 },
  ],
  splitter: [
    { item: "iron_plate", count: 2 },
    { item: "gear", count: 2 },
  ],
  merger: [
    { item: "iron_plate", count: 2 },
    { item: "gear", count: 2 },
  ],
  tunnel: [
    { item: "iron_plate", count: 4 },
    { item: "gear", count: 2 },
  ],
  foundry: [
    { item: "iron_plate", count: 10 },
    { item: "gear", count: 6 },
    { item: "circuit", count: 4 },
  ],
  extractor_mk2: [
    { item: "steel", count: 4 },
    { item: "gear", count: 4 },
    { item: "circuit", count: 2 },
  ],
};

export function buildCost(type: EntityType): ItemStack[] {
  return BUILD_COSTS[type] ?? [];
}

/** Stufe, ab der ein Gebaeude gebaut werden darf. */
export function buildingTier(type: EntityType): number {
  const i = TIERS.findIndex((t) => t.buildings.includes(type));
  return i === -1 ? Infinity : i;
}

export function recipeTier(id: string): number {
  const i = TIERS.findIndex((t) => t.recipes.includes(id));
  return i === -1 ? Infinity : i;
}

export function canAfford(storage: ReadonlyMap<ItemId, number>, cost: readonly ItemStack[]): boolean {
  return cost.every((s) => (storage.get(s.item) ?? 0) >= s.count);
}
