import type { ItemId } from "./items";

export type MachineKind = "smelter" | "assembler" | "foundry" | "refinery" | "manufacturer";

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
  /** Alternatives Rezept: freischaltbar ueber Forschung, Auftraege oder Fundstuecke. */
  alt?: boolean;
  /** Anzeigename fuer alternative Rezepte. */
  name?: string;
}

export const BASE_RECIPES: readonly Recipe[] = [
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
  {
    id: "smelt_silicon",
    machine: "smelter",
    inputs: [
      { item: "quartz", count: 1 },
    ],
    outputs: [{ item: "silicon", count: 1 }],
    ticks: 48,
  },
  {
    id: "aluminium",
    machine: "foundry",
    inputs: [
      { item: "bauxite", count: 2 },
      { item: "coal", count: 1 },
    ],
    outputs: [{ item: "aluminium", count: 1 }],
    ticks: 60,
  },
  {
    id: "concrete",
    machine: "assembler",
    inputs: [
      { item: "stone", count: 3 },
    ],
    outputs: [{ item: "concrete", count: 1 }],
    ticks: 30,
  },
  {
    id: "reinforced_plate",
    machine: "assembler",
    inputs: [
      { item: "iron_plate", count: 4 },
      { item: "steel", count: 1 },
    ],
    outputs: [{ item: "reinforced_plate", count: 1 }],
    ticks: 60,
  },
  {
    id: "rotor",
    machine: "assembler",
    inputs: [
      { item: "gear", count: 2 },
      { item: "steel", count: 1 },
    ],
    outputs: [{ item: "rotor", count: 1 }],
    ticks: 50,
  },
  {
    id: "heavy_frame",
    machine: "manufacturer",
    inputs: [
      { item: "reinforced_plate", count: 2 },
      { item: "rotor", count: 2 },
      { item: "concrete", count: 4 },
    ],
    outputs: [{ item: "heavy_frame", count: 1 }],
    ticks: 120,
  },
  {
    id: "plastic",
    machine: "refinery",
    inputs: [
      { item: "crude_oil", count: 2 },
    ],
    outputs: [{ item: "plastic", count: 1 }],
    ticks: 40,
  },
  {
    id: "rubber",
    machine: "refinery",
    inputs: [
      { item: "crude_oil", count: 2 },
    ],
    outputs: [{ item: "rubber", count: 1 }],
    ticks: 40,
  },
  {
    id: "fuel",
    machine: "refinery",
    inputs: [
      { item: "crude_oil", count: 1 },
    ],
    outputs: [{ item: "fuel", count: 1 }],
    ticks: 30,
  },
  {
    id: "computer",
    machine: "manufacturer",
    inputs: [
      { item: "circuit", count: 3 },
      { item: "plastic", count: 2 },
      { item: "silicon", count: 2 },
    ],
    outputs: [{ item: "computer", count: 1 }],
    ticks: 120,
  },
  {
    id: "battery",
    machine: "assembler",
    inputs: [
      { item: "sulfur", count: 2 },
      { item: "copper_plate", count: 2 },
      { item: "plastic", count: 1 },
    ],
    outputs: [{ item: "battery", count: 1 }],
    ticks: 60,
  },
  {
    id: "alu_casing",
    machine: "assembler",
    inputs: [
      { item: "aluminium", count: 3 },
    ],
    outputs: [{ item: "alu_casing", count: 2 }],
    ticks: 40,
  },
  {
    id: "turbo_motor",
    machine: "manufacturer",
    inputs: [
      { item: "motor", count: 2 },
      { item: "rubber", count: 2 },
      { item: "battery", count: 1 },
      { item: "alu_casing", count: 2 },
    ],
    outputs: [{ item: "turbo_motor", count: 1 }],
    ticks: 200,
  },
  {
    id: "supercomputer",
    machine: "manufacturer",
    inputs: [
      { item: "computer", count: 2 },
      { item: "control_unit", count: 2 },
      { item: "battery", count: 2 },
      { item: "alu_casing", count: 1 },
    ],
    outputs: [{ item: "supercomputer", count: 1 }],
    ticks: 240,
  },
];

/**
 * Alternative Rezepte: andere Wege zu bekannten Produkten, damit jede Fabrik
 * anders aussehen kann. Freigeschaltet ueber Forschung (research.ts),
 * Auftraege oder Fundstuecke in der Welt (World.unlockRecipe).
 */
export const ALT_RECIPES: readonly Recipe[] = [
  {
    id: "alt_fine_wire",
    name: "Feiner Draht",
    alt: true,
    machine: "assembler",
    inputs: [{ item: "copper_plate", count: 2 }],
    outputs: [{ item: "wire", count: 5 }],
    ticks: 30,
  },
  {
    id: "alt_cast_iron",
    name: "Gusseisen",
    alt: true,
    machine: "foundry",
    inputs: [
      { item: "iron_ore", count: 3 },
      { item: "coal", count: 1 },
    ],
    outputs: [{ item: "iron_plate", count: 4 }],
    ticks: 40,
  },
  {
    id: "alt_steel_gear",
    name: "Stahlzahnrad",
    alt: true,
    machine: "assembler",
    inputs: [{ item: "steel", count: 1 }],
    outputs: [{ item: "gear", count: 2 }],
    ticks: 20,
  },
  {
    id: "alt_bolted_plate",
    name: "Verschraubte Platte",
    alt: true,
    machine: "assembler",
    inputs: [
      { item: "iron_plate", count: 6 },
      { item: "gear", count: 2 },
    ],
    outputs: [{ item: "reinforced_plate", count: 1 }],
    ticks: 50,
  },
  {
    id: "alt_steel_rotor",
    name: "Stahlrotor",
    alt: true,
    machine: "assembler",
    inputs: [{ item: "steel", count: 3 }],
    outputs: [{ item: "rotor", count: 1 }],
    ticks: 40,
  },
  {
    id: "alt_quick_concrete",
    name: "Schnellbeton",
    alt: true,
    machine: "foundry",
    inputs: [
      { item: "stone", count: 2 },
      { item: "coal", count: 1 },
    ],
    outputs: [{ item: "concrete", count: 1 }],
    ticks: 20,
  },
  {
    id: "alt_rotor_motor",
    name: "Rotormotor",
    alt: true,
    machine: "assembler",
    inputs: [
      { item: "rotor", count: 1 },
      { item: "wire", count: 6 },
    ],
    outputs: [{ item: "motor", count: 1 }],
    ticks: 50,
  },
  {
    id: "alt_coal_fuel",
    name: "Kohleverflüssigung",
    alt: true,
    machine: "refinery",
    inputs: [{ item: "coal", count: 2 }],
    outputs: [{ item: "fuel", count: 1 }],
    ticks: 40,
  },
  {
    id: "alt_plastic_circuit",
    name: "Kunststoff-Schaltkreis",
    alt: true,
    machine: "assembler",
    inputs: [
      { item: "plastic", count: 1 },
      { item: "wire", count: 3 },
    ],
    outputs: [{ item: "circuit", count: 1 }],
    ticks: 20,
  },
  {
    id: "alt_silicon_circuit",
    name: "Silizium-Schaltkreis",
    alt: true,
    machine: "assembler",
    inputs: [
      { item: "silicon", count: 1 },
      { item: "wire", count: 2 },
    ],
    outputs: [{ item: "circuit", count: 2 }],
    ticks: 30,
  },
  {
    id: "alt_quartz_melt",
    name: "Quarzschmelze",
    alt: true,
    machine: "foundry",
    inputs: [
      { item: "quartz", count: 2 },
      { item: "coal", count: 1 },
    ],
    outputs: [{ item: "silicon", count: 3 }],
    ticks: 60,
  },
  {
    id: "alt_pure_alu",
    name: "Reines Aluminium",
    alt: true,
    machine: "refinery",
    inputs: [
      { item: "bauxite", count: 2 },
      { item: "fuel", count: 1 },
    ],
    outputs: [{ item: "aluminium", count: 2 }],
    ticks: 60,
  },
];

/** Alle Rezepte: Standard zuerst, dann die alternativen. */
export const RECIPES: readonly Recipe[] = [...BASE_RECIPES, ...ALT_RECIPES];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipesFor(machine: MachineKind): Recipe[] {
  return RECIPES.filter((r) => r.machine === machine);
}

/** Schmelzen waehlen ihr Rezept automatisch anhand des ersten Erzes. */
export function smeltingRecipeFor(item: ItemId): Recipe | undefined {
  return BASE_RECIPES.find((r) => r.machine === "smelter" && r.inputs.some((s) => s.item === item));
}
