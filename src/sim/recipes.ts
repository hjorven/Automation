import type { ItemId } from "./items";

export type MachineKind = "smelter" | "assembler" | "foundry";

export interface ItemStack {
  item: ItemId;
  count: number;
}

export interface Recipe {
  id: string;
  machine: MachineKind;
  inputs: ItemStack[];
  outputs: ItemStack[];
  ticks: number;
}

export const RECIPES: readonly Recipe[] = [
  {
    id: "smelt_iron",
    machine: "smelter",
    inputs: [{ item: "iron_ore", count: 1 }],
    outputs: [{ item: "iron_plate", count: 1 }],
    ticks: 32,
  },
  {
    id: "smelt_copper",
    machine: "smelter",
    inputs: [{ item: "copper_ore", count: 1 }],
    outputs: [{ item: "copper_plate", count: 1 }],
    ticks: 32,
  },
  {
    id: "gear",
    machine: "assembler",
    inputs: [{ item: "iron_plate", count: 2 }],
    outputs: [{ item: "gear", count: 1 }],
    ticks: 20,
  },
  {
    id: "wire",
    machine: "assembler",
    inputs: [{ item: "copper_plate", count: 1 }],
    outputs: [{ item: "wire", count: 2 }],
    ticks: 10,
  },
  {
    id: "circuit",
    machine: "assembler",
    inputs: [
      { item: "iron_plate", count: 1 },
      { item: "wire", count: 3 },
    ],
    outputs: [{ item: "circuit", count: 1 }],
    ticks: 20,
  },
  {
    id: "steel",
    machine: "foundry",
    inputs: [
      { item: "iron_ore", count: 1 },
      { item: "coal", count: 1 },
    ],
    outputs: [{ item: "steel", count: 1 }],
    ticks: 40,
  },
  {
    id: "motor",
    machine: "assembler",
    inputs: [
      { item: "steel", count: 1 },
      { item: "gear", count: 2 },
      { item: "wire", count: 4 },
    ],
    outputs: [{ item: "motor", count: 1 }],
    ticks: 60,
  },
  {
    id: "control_unit",
    machine: "assembler",
    inputs: [
      { item: "circuit", count: 3 },
      { item: "steel", count: 1 },
    ],
    outputs: [{ item: "control_unit", count: 1 }],
    ticks: 60,
  },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipesFor(machine: MachineKind): Recipe[] {
  return RECIPES.filter((r) => r.machine === machine);
}

/** Schmelzen waehlen ihr Rezept automatisch anhand des ersten Erzes. */
export function smeltingRecipeFor(item: ItemId): Recipe | undefined {
  return RECIPES.find((r) => r.machine === "smelter" && r.inputs.some((s) => s.item === item));
}
